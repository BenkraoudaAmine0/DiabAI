"""Doctor dashboard — KPIs, recent activity and urgent alerts over the
doctor's panel (Figma: Screen-4-Dashboard), and the full activity list behind
"Voir tout" / the History page."""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.auth import AuthUser, require_doctor
from app.services.clinical import age_from, clinical_status, parse_ts, urgent_reason
from app.services.panel import panel, predictions_of, scans_of
from app.services.supabase_client import get_service_client

router = APIRouter()


def _age_hints(patients: dict, preds: list[dict]) -> None:
    """Patients without a birth date: remember the age entered in their
    latest prediction, so their scans show an age too."""
    for p in preds:  # newest first
        pat = patients.get(p.get("patient_id"))
        if pat is not None and "age_hint" not in pat:
            pat["age_hint"] = (p.get("input") or {}).get("age")


def _who(patients: dict, row: dict) -> dict:
    pat = patients.get(row.get("patient_id"), {})
    entered = (row.get("input") or {}).get("age") or pat.get("age_hint")
    return {
        "patient_id": row.get("patient_id"),
        "patient_name": pat.get("full_name") or pat.get("email") or "—",
        "age": age_from(pat.get("dob"), entered),
    }


def _scan_link(scan: dict) -> str:
    """Foot / neck photos open the review page; retina scans the record."""
    pid = scan.get("patient_id")
    if scan.get("scan_type") in ("foot", "neck"):
        return f"/doctor/scans?patient={pid}&type={scan['scan_type']}"
    return f"/doctor/patients/{pid}"


def activity(preds: list[dict], scans: list[dict], patients: dict) -> list[dict]:
    """Predictions and scans merged, newest first."""
    items = []
    for p in preds:
        items.append({
            "kind": "prediction",
            "id": p["id"],
            **_who(patients, p),
            "created_at": p.get("created_at"),
            "status": clinical_status(p),
            "review": p.get("status"),  # pending | confirmed | rejected | None
            "probability": p.get("probability"),
            "link": f"/predictions/{p['id']}",
        })
    for s in scans:
        result = s.get("result") or {}
        items.append({
            "kind": "scan",
            "scan_type": s.get("scan_type"),
            "id": s["id"],
            **_who(patients, s),
            "created_at": s.get("created_at"),
            "label": result.get("label"),
            "referable": result.get("referable_dr"),
            "confidence": result.get("confidence"),
            "link": _scan_link(s),
        })
    return sorted(items, key=lambda i: i.get("created_at") or "", reverse=True)


def _count_between(rows: list[dict], start: datetime, end: Optional[datetime] = None) -> int:
    n = 0
    for r in rows:
        ts = parse_ts(r.get("created_at"))
        if ts and ts >= start and (end is None or ts < end):
            n += 1
    return n


@router.get("/doctor")
def doctor_dashboard(user: AuthUser = Depends(require_doctor)) -> dict:
    svc = get_service_client()
    links, patients = panel(svc, user.id)
    ids = list(patients)
    preds = predictions_of(svc, ids) if ids else []
    scans = scans_of(svc, ids) if ids else []
    _age_hints(patients, preds)

    now = datetime.now(timezone.utc)
    week, two_weeks, month = (now - timedelta(days=d) for d in (7, 14, 30))
    evaluations = preds + scans
    eye = [s for s in scans if s.get("scan_type") == "eye"]
    pending = [p for p in preds if p.get("status") == "pending"]

    alerts = []
    for kind, rows in (("prediction", preds), ("scan", scans)):
        for r in rows:
            ts = parse_ts(r.get("created_at"))
            if not ts or ts < month or r.get("status") == "rejected":
                continue
            reason = urgent_reason(r, kind)
            if reason:
                alerts.append({
                    **reason,
                    "kind": kind,
                    "id": r["id"],
                    **_who(patients, r),
                    "created_at": r.get("created_at"),
                    "link": f"/predictions/{r['id']}" if kind == "prediction" else _scan_link(r),
                })
    alerts.sort(key=lambda a: a.get("created_at") or "", reverse=True)

    return {
        "kpis": {
            "patients": {
                "total": len(ids),
                "new_this_week": _count_between(
                    [{"created_at": link["created_at"]} for link in links], week
                ),
            },
            "evaluations": {
                "this_week": _count_between(evaluations, week),
                "last_week": _count_between(evaluations, two_weeks, week),
            },
            "retinal": {
                "total": len(eye),
                # referable diabetic retinopathy flagged by the model, last 30 days
                "positive_to_review": sum(
                    1 for s in eye
                    if (s.get("result") or {}).get("referable_dr")
                    and (parse_ts(s.get("created_at")) or now) >= month
                ),
            },
            "reviews": {
                "pending": len(pending),
                "urgent": sum(1 for p in pending if urgent_reason(p, "prediction")),
            },
        },
        "recent": activity(preds[:10], scans[:10], patients)[:6],
        "alerts": alerts[:5],
    }


@router.get("/activity")
def activity_list(
    limit: int = Query(default=200, ge=1, le=1000),
    user: AuthUser = Depends(require_doctor),
) -> dict:
    """Every prediction and scan of the doctor's panel, newest first."""
    svc = get_service_client()
    _links, patients = panel(svc, user.id)
    ids = list(patients)
    if not ids:
        return {"items": []}
    preds = predictions_of(svc, ids)
    _age_hints(patients, preds)
    return {"items": activity(preds, scans_of(svc, ids), patients)[:limit]}
