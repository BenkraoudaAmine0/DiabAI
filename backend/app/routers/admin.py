"""Admin endpoints — people (Figma 05 Admin Screens): overview, users with
their Supabase Auth status, invitations, roles, suspension, doctor
verification and a privacy-minimised patient directory; plus storage and
Gemini usage."""

from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field

from app.auth import AuthUser, require_admin
from app.config import get_settings
from app.services.audit_service import audit_by
from app.services.clinical import clinical_status, parse_ts, urgent_reason
from app.services.panel import predictions_of, scans_of
from app.services.supabase_client import execute, get_service_client

router = APIRouter()

Role = Literal["patient", "doctor", "admin"]
FOREVER = "876000h"  # Supabase Auth ban length for a suspension (~100 years)


def _count(svc, role: str) -> int:
    res = execute(
        lambda: svc.table("profiles")
        .select("id", count="exact")
        .eq("role", role)
        .limit(1)
        .execute()
    )
    return res.count or 0


def _bucket_usage(svc, bucket: str) -> dict:
    """Recursive size/count of a private bucket via the Storage list API."""
    objects = 0
    total_bytes = 0

    def walk(path: str) -> None:
        nonlocal objects, total_bytes
        try:
            items = svc.storage.from_(bucket).list(path) or []
        except Exception:
            return
        for item in items:
            name = item.get("name", "")
            if not name:
                continue
            meta = item.get("metadata")
            if meta is None:  # folder
                walk(f"{path}/{name}".strip("/"))
            else:
                objects += 1
                total_bytes += int(meta.get("size") or 0)

    walk("")
    return {"objects": objects, "bytes": total_bytes}


def _usage_summary(rows: list[dict]) -> dict:
    return {
        "calls": len(rows),
        "input_tokens": sum(int(r.get("input_tokens") or 0) for r in rows),
        "output_tokens": sum(int(r.get("output_tokens") or 0) for r in rows),
        "estimated_cost_usd": round(
            sum(float(r.get("estimated_cost_usd") or 0) for r in rows), 4
        ),
    }


@router.get("/stats")
def admin_stats(user: AuthUser = Depends(require_admin)) -> dict:
    svc = get_service_client()

    counts = {
        "doctors": _count(svc, "doctor"),
        "patients": _count(svc, "patient"),
        "admins": _count(svc, "admin"),
    }

    storage = {
        "scans": _bucket_usage(svc, "scans"),
        "kb-docs": _bucket_usage(svc, "kb-docs"),
    }

    usage_rows = (
        execute(
            lambda: svc.table("gemini_usage")
            .select(
                "kind, model, input_tokens, output_tokens, estimated_cost_usd, created_at"
            )
            .order("created_at", desc=True)
            .limit(20000)
            .execute()
        ).data
        or []
    )
    generate_rows = [r for r in usage_rows if r.get("kind") == "generate"]
    embedding_rows = [r for r in usage_rows if r.get("kind") == "embedding"]

    return {
        "counts": counts,
        "storage": storage,
        "gemini": {
            "totals": _usage_summary(usage_rows),
            "generate": _usage_summary(generate_rows),
            "embedding": _usage_summary(embedding_rows),
            "last_call": usage_rows[0].get("created_at") if usage_rows else None,
        },
    }


# ── accounts (Supabase Auth + profiles) ──────────────────────────────────────

def auth_users() -> dict[str, dict]:
    """Supabase Auth accounts by id: sign-in, invitation, ban and 2FA state."""
    svc = get_service_client()
    out: dict[str, dict] = {}
    page = 1
    while True:
        batch = svc.auth.admin.list_users(page=page, per_page=1000) or []
        for u in batch:
            factors = getattr(u, "factors", None) or []
            out[str(u.id)] = {
                "last_sign_in_at": u.last_sign_in_at,
                "invited_at": u.invited_at,
                "email_confirmed_at": u.email_confirmed_at,
                "banned_until": getattr(u, "banned_until", None),
                "has_2fa": any(getattr(f, "status", None) == "verified" for f in factors),
            }
        if len(batch) < 1000:
            return out
        page += 1


def account_status(info: Optional[dict]) -> str:
    """active | invited | pending (never signed in) | suspended."""
    if not info:
        return "pending"
    banned = parse_ts(info.get("banned_until"))
    if banned and banned > datetime.now(timezone.utc):
        return "suspended"
    if not info.get("last_sign_in_at"):
        return "invited" if info.get("invited_at") else "pending"
    return "active"


def _iso(value) -> Optional[str]:
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _profiles(svc, role: Optional[str] = None, columns: str = "id, email, full_name, role, created_at") -> list[dict]:
    query = svc.table("profiles").select(columns).order("created_at", desc=True).limit(5000)
    if role:
        query = query.eq("role", role)
    return execute(lambda: query.execute()).data or []


@router.get("/users")
def admin_users(
    role: Optional[str] = Query(default=None),
    user: AuthUser = Depends(require_admin),
) -> dict:
    svc = get_service_client()
    profiles = _profiles(svc, role if role in ("doctor", "patient", "admin") else None)
    try:
        accounts = auth_users()
    except Exception:
        accounts = {}

    # per-user record counts (the admin dashboard's user table shows them)
    counts: dict[str, dict] = {
        p["id"]: {"predictions_made": 0, "predictions_received": 0, "scans_performed": 0, "scans_received": 0}
        for p in profiles
    }
    for r in execute(lambda: svc.table("predictions").select("doctor_id, patient_id").limit(100000).execute()).data or []:
        if r.get("doctor_id") in counts:
            counts[r["doctor_id"]]["predictions_made"] += 1
        if r.get("patient_id") in counts:
            counts[r["patient_id"]]["predictions_received"] += 1
    for r in execute(lambda: svc.table("scans").select("user_id, patient_id").limit(100000).execute()).data or []:
        if r.get("user_id") in counts:
            counts[r["user_id"]]["scans_performed"] += 1
        if r.get("patient_id") in counts:
            counts[r["patient_id"]]["scans_received"] += 1

    rows = []
    for p in profiles:
        info = accounts.get(p["id"])
        rows.append(
            dict(
                p,
                counts=counts[p["id"]],
                status=account_status(info) if accounts else None,
                last_sign_in_at=_iso((info or {}).get("last_sign_in_at")),
                has_2fa=bool((info or {}).get("has_2fa")),
            )
        )
    statuses = Counter(r["status"] for r in rows)
    return {
        "users": rows,
        "summary": {
            "total": len(rows),
            "active": statuses.get("active", 0),
            "pending": statuses.get("pending", 0) + statuses.get("invited", 0),
            "suspended": statuses.get("suspended", 0),
        },
        "auth_available": bool(accounts),
    }


class InviteRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=120)
    role: Role


@router.post("/users/invite", status_code=201)
def invite_user(req: InviteRequest, user: AuthUser = Depends(require_admin)) -> dict:
    """Email a set-password invitation, then give the account its role."""
    svc = get_service_client()
    redirect_to = f"{get_settings().frontend_url}/auth/callback?next=/set-password"
    try:
        res = svc.auth.admin.invite_user_by_email(
            req.email,
            options={"redirect_to": redirect_to, "data": {"full_name": req.full_name}},
        )
    except Exception as exc:
        text = str(exc).lower()
        if "already" in text or "registered" in text or "exists" in text:
            raise HTTPException(status_code=409, detail="An account already exists for this email.") from exc
        raise HTTPException(status_code=502, detail=f"Supabase invite failed: {exc}") from exc
    uid = str(res.user.id)
    row = {"id": uid, "email": req.email, "full_name": req.full_name, "role": req.role, "created_by": user.id}
    # a doctor the admin invites is approved by that invitation
    _upsert_profile(svc, {**row, **_approval(user)} if req.role == "doctor" else row, fallback=row)
    audit_by(user, "user.invite", "profile", uid, {"email": req.email, "role": req.role})
    return {"id": uid, "email": req.email, "role": req.role, "status": "invited"}


def _approval(admin: AuthUser) -> dict:
    return {"verified_at": datetime.now(timezone.utc).isoformat(), "verified_by": admin.id}


def _upsert_profile(svc, row: dict, fallback: dict) -> None:
    try:
        svc.table("profiles").upsert(row, on_conflict="id").execute()
    except Exception:  # before migration 0013 (no verified_* columns)
        svc.table("profiles").upsert(fallback, on_conflict="id").execute()


class RoleRequest(BaseModel):
    role: Role


@router.put("/users/{user_id}/role")
def change_role(user_id: UUID, req: RoleRequest, user: AuthUser = Depends(require_admin)) -> dict:
    uid = str(user_id)
    if uid == user.id:
        raise HTTPException(status_code=400, detail="You cannot change your own role.")
    svc = get_service_client()
    rows = execute(lambda: svc.table("profiles").select("role, email").eq("id", uid).limit(1).execute()).data
    if not rows:
        raise HTTPException(status_code=404, detail="User not found")
    before = rows[0]["role"]
    if before != req.role:
        change = {"role": req.role}
        try:  # making someone a doctor is the admin vouching for them
            svc.table("profiles").update({**change, **_approval(user)} if req.role == "doctor" else change).eq("id", uid).execute()
        except Exception:  # before migration 0013
            svc.table("profiles").update(change).eq("id", uid).execute()
        audit_by(user, "user.role", "profile", uid, {"email": rows[0].get("email"), "from": before, "to": req.role})
    return {"id": uid, "role": req.role}


class StatusRequest(BaseModel):
    active: bool


@router.put("/users/{user_id}/status")
def change_status(user_id: UUID, req: StatusRequest, user: AuthUser = Depends(require_admin)) -> dict:
    """Suspend (Supabase Auth ban: sign-in and token refresh refused) or
    reactivate an account."""
    uid = str(user_id)
    if uid == user.id:
        raise HTTPException(status_code=400, detail="You cannot suspend your own account.")
    try:
        get_service_client().auth.admin.update_user_by_id(
            uid, {"ban_duration": "none" if req.active else FOREVER}
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not update the account: {exc}") from exc
    audit_by(user, "user.reactivate" if req.active else "user.suspend", "profile", uid)
    return {"id": uid, "status": "active" if req.active else "suspended"}


# ── doctors ──────────────────────────────────────────────────────────────────

def _panel_sizes(svc) -> Counter:
    links = execute(lambda: svc.table("doctor_patients").select("doctor_id").limit(100000).execute()).data or []
    return Counter(link["doctor_id"] for link in links)


@router.get("/doctors")
def admin_doctors(user: AuthUser = Depends(require_admin)) -> dict:
    svc = get_service_client()
    try:
        doctors = _profiles(
            svc, "doctor",
            "id, email, full_name, created_at, specialty, license_number, facility, verified_at",
        )
        verification = True
    except Exception:  # before migrations 0012/0013
        doctors = _profiles(svc, "doctor")
        verification = False
    sizes = _panel_sizes(svc)
    rows = [
        dict(d, patients=sizes.get(d["id"], 0), verified=bool(d.get("verified_at")))
        for d in doctors
    ]
    verified = sum(1 for r in rows if r["verified"])
    links = sum(r["patients"] for r in rows)
    return {
        "doctors": rows,
        "summary": {
            "total": len(rows),
            "verified": verified,
            "pending": len(rows) - verified,
            "facilities": len({(r.get("facility") or "").strip().lower() for r in rows} - {""}),
            "links": links,
            "avg_patients": round(links / len(rows), 1) if rows else 0,
        },
        "verification_available": verification,
    }


@router.get("/doctors/pending")
def pending_doctors(user: AuthUser = Depends(require_admin)) -> dict:
    """Doctors who signed up and wait for approval — the admin's bell and the
    Doctors badge. Newest first."""
    try:
        rows = (
            get_service_client().table("profiles")
            .select("id, email, full_name, license_number, facility, specialty, created_at")
            .eq("role", "doctor").is_("verified_at", "null")
            .order("created_at", desc=True).limit(200).execute().data or []
        )
    except Exception:  # before migration 0013 there is no approval step
        rows = []
    return {"count": len(rows), "doctors": rows}


class VerifyRequest(BaseModel):
    verified: bool


@router.put("/doctors/{doctor_id}/verify")
def verify_doctor(doctor_id: UUID, req: VerifyRequest, user: AuthUser = Depends(require_admin)) -> dict:
    """Mark a practitioner as checked (e.g. against the national medical
    council register) — a manual admin decision, recorded in the audit log."""
    did = str(doctor_id)
    svc = get_service_client()
    rows = execute(lambda: svc.table("profiles").select("role").eq("id", did).limit(1).execute()).data
    if not rows or rows[0]["role"] != "doctor":
        raise HTTPException(status_code=404, detail="Doctor not found")
    now = datetime.now(timezone.utc).isoformat()
    try:
        svc.table("profiles").update(
            {"verified_at": now if req.verified else None, "verified_by": user.id if req.verified else None}
        ).eq("id", did).execute()
    except Exception as exc:
        raise HTTPException(status_code=409, detail="Apply backend/supabase/migrations/0013_admin_security.sql first.") from exc
    audit_by(user, "doctor.verify" if req.verified else "doctor.unverify", "profile", did)
    return {"id": did, "verified": req.verified}


# ── patients (directory, minimised) ──────────────────────────────────────────

def _short_name(full_name: Optional[str]) -> str:
    """"Meriem Amrani" → "Meriem A." — the directory needs no more."""
    parts = (full_name or "").split()
    if not parts:
        return "—"
    return parts[0] if len(parts) == 1 else f"{parts[0]} {parts[-1][0]}."


def _doctor_label(full_name: Optional[str]) -> str:
    parts = (full_name or "").replace("Dr.", "").replace("Dr ", "").split()
    if not parts:
        return "—"
    return f"Dr. {parts[0][0]}. {parts[-1]}" if len(parts) > 1 else f"Dr. {parts[0]}"


def patient_directory(svc) -> list[dict]:
    patients = _profiles(svc, "patient")
    ids = [p["id"] for p in patients]
    links = execute(lambda: svc.table("doctor_patients").select("doctor_id, patient_id").limit(100000).execute()).data or []
    doctors = {d["id"]: d for d in _profiles(svc, "doctor", "id, full_name")}
    team: dict[str, list[str]] = {}
    for link in links:
        team.setdefault(link["patient_id"], []).append(link["doctor_id"])
    latest_pred: dict[str, dict] = {}
    for row in predictions_of(svc, ids):
        latest_pred.setdefault(row["patient_id"], row)
    urgent_scan: set[str] = set()
    for row in scans_of(svc, ids):
        if urgent_reason(row, "scan"):
            urgent_scan.add(row["patient_id"])

    out = []
    for p in patients:
        pred = latest_pred.get(p["id"])
        if (pred and urgent_reason(pred, "prediction")) or p["id"] in urgent_scan:
            status = "high_risk"
        elif not pred:
            status = "new"
        elif pred.get("status") == "pending":
            status = "needs_review"
        else:
            status = "stable"
        care = [doctors[d]["full_name"] for d in team.get(p["id"], []) if d in doctors]
        out.append(
            {
                "id": p["id"],
                "name": _short_name(p.get("full_name")),
                "condition": clinical_status(pred),
                "care_team": _doctor_label(care[0]) if care else None,
                "care_team_size": len(care),
                "status": status,
                "created_at": p.get("created_at"),
            }
        )
    return out


@router.get("/patients")
def admin_patients(user: AuthUser = Depends(require_admin)) -> dict:
    rows = patient_directory(get_service_client())
    counts = Counter(r["status"] for r in rows)
    return {
        "patients": rows,
        "summary": {
            "total": len(rows),
            "stable": counts.get("stable", 0),
            "needs_review": counts.get("needs_review", 0),
            "high_risk": counts.get("high_risk", 0),
            "new": counts.get("new", 0),
        },
    }


# ── overview ─────────────────────────────────────────────────────────────────

@router.get("/overview")
def admin_overview(user: AuthUser = Depends(require_admin)) -> dict:
    from app.routers.admin_security import open_alerts, recent_audit
    from app.routers.admin_system import health_checks, registry_summary

    svc = get_service_client()
    profiles = _profiles(svc)
    try:
        accounts = auth_users()
    except Exception:
        accounts = {}
    now = datetime.now(timezone.utc)
    week_ago, month_ago = now - timedelta(days=7), now - timedelta(days=30)

    def created_since(p: dict, since: datetime) -> bool:
        ts = parse_ts(p.get("created_at"))
        return bool(ts and ts >= since)

    doctors = [p for p in profiles if p["role"] == "doctor"]
    patients = [p for p in profiles if p["role"] == "patient"]
    try:
        verified = (
            execute(
                lambda: svc.table("profiles").select("id", count="exact").eq("role", "doctor")
                .not_.is_("verified_at", "null").limit(1).execute()
            ).count or 0
        )
    except Exception:
        verified = None
    active_patients = sum(
        1 for p in patients
        if (ts := parse_ts(_iso((accounts.get(p["id"]) or {}).get("last_sign_in_at")))) and ts >= month_ago
    )
    alerts = open_alerts(svc)
    return {
        "kpis": {
            "users": len(profiles),
            "users_new_week": sum(1 for p in profiles if created_since(p, week_ago)),
            "doctors": len(doctors),
            "doctors_verified": verified,
            "doctors_new_week": sum(1 for p in doctors if created_since(p, week_ago)),
            "patients": len(patients),
            "patients_active_30d": active_patients if accounts else None,
            "alerts_open": alerts["open"],
            "alerts_critical": alerts["critical"],
        },
        "audit": recent_audit(svc, 4),
        "models": registry_summary(svc),
        "health": health_checks(svc, quick=True),
        "alerts": alerts["latest"],
    }
