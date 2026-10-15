"""Admin endpoints — security & traceability (Figma 05 Admin Screens):
audit log (hash-chained, append-only), error alerts, access & security
(2FA policy, findings, recent sign-ins) and account deletion requests."""

import csv
import io
import json
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.auth import AuthUser, forget_mfa_policy, require_admin
from app.services.audit_service import audit_by, category
from app.services.clinical import parse_ts
from app.services.supabase_client import execute, get_service_client

router = APIRouter()

MIGRATION_0013 = "Apply backend/supabase/migrations/0013_admin_security.sql first."
AUDIT_COLUMNS = "id, chain_seq, actor_id, actor_name, actor_role, action, target_type, target_id, detail, created_at, hash"
PERIODS = {"today": None, "7d": 7, "30d": 30, "all": None}


def _since(period: str) -> Optional[str]:
    now = datetime.now(timezone.utc)
    if period == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    days = PERIODS.get(period)
    return (now - timedelta(days=days)).isoformat() if days else None


def _missing_0013(exc: Exception) -> bool:
    text = str(exc)
    return any(k in text for k in ("audit_log", "app_errors", "deletion_requests", "app_settings", "audit_verify_chain", "PGRST"))


# ── audit log ────────────────────────────────────────────────────────────────

def _people(svc, ids: set[str]) -> dict[str, dict]:
    """{id: {label, role}} — patients as their PT- code (no name), staff by
    name, so the admin can open the right list."""
    out: dict[str, dict] = {}
    if ids:
        try:
            people = execute(lambda: svc.table("profiles").select("id, role, full_name").in_("id", list(ids)).execute()).data or []
        except Exception:
            people = []
        for p in people:
            out[p["id"]] = {
                "label": f"PT-{p['id'][:8].upper()}" if p.get("role") == "patient" else (p.get("full_name") or p["id"][:8]),
                "role": p.get("role"),
            }
    return out


def _target_labels(svc, rows: list[dict]) -> dict[str, dict]:
    """Readable targets: patients as their PT- code (no name), staff by name."""
    return _people(svc, {r["target_id"] for r in rows if r.get("target_type") == "profile" and r.get("target_id")})


def _shape(rows: list[dict], labels: dict[str, dict]) -> list[dict]:
    out = []
    for r in rows:
        target = r.get("target_id")
        ttype = r.get("target_type")
        role = None
        if ttype == "profile" and target:
            person = labels.get(target) or {}
            label = person.get("label") or f"U-{target[:8].upper()}"
            role = person.get("role")
        elif target:
            label = f"{(ttype or 'item').replace('_', ' ')} {target[:8]}"
        else:
            label = None
        out.append(
            {
                "id": r["id"],
                "actor_id": r.get("actor_id"),
                "actor_name": r.get("actor_name") or ("System" if not r.get("actor_id") else "—"),
                "actor_role": r.get("actor_role"),
                "action": r["action"],
                "category": category(r["action"]),
                "target_type": ttype,
                "target_id": target,
                "target_role": role,  # patient / doctor / admin for a profile
                "target_label": label,
                "detail": r.get("detail") or {},
                "created_at": r["created_at"],
            }
        )
    return out


def recent_audit(svc, limit: int = 4) -> list[dict]:
    try:
        rows = execute(lambda: svc.table("audit_log").select(AUDIT_COLUMNS).order("chain_seq", desc=True).limit(limit).execute()).data or []
    except Exception:
        return []
    return _shape(rows, _target_labels(svc, rows))


def _audit_rows(svc, period: str, actor: Optional[str], limit: int) -> list[dict]:
    query = svc.table("audit_log").select(AUDIT_COLUMNS).order("chain_seq", desc=True).limit(limit)
    since = _since(period)
    if since:
        query = query.gte("created_at", since)
    if actor:
        query = query.eq("actor_id", actor)
    return execute(lambda: query.execute()).data or []


def _matches(row: dict, cat: Optional[str], q: str) -> bool:
    if cat and category(row["action"]) != cat:
        return False
    if q:
        hay = " ".join(
            str(row.get(k) or "") for k in ("action", "actor_name", "target_id", "target_type")
        ).lower() + " " + json.dumps(row.get("detail") or {}).lower()
        return q in hay
    return True


@router.get("/audit")
def audit_log(
    period: Literal["today", "7d", "30d", "all"] = "7d",
    category_: Optional[Literal["views", "clinical", "admin", "security"]] = Query(default=None, alias="category"),
    actor: Optional[UUID] = None,
    q: str = Query(default="", max_length=100),
    user: AuthUser = Depends(require_admin),
) -> dict:
    svc = get_service_client()
    try:
        rows = _audit_rows(svc, period, str(actor) if actor else None, 2000)
        today = (
            execute(
                lambda: svc.table("audit_log").select("action").gte("created_at", _since("today"))
                .limit(20000).execute()
            ).data or []
        )
    except Exception as exc:
        if _missing_0013(exc):
            raise HTTPException(status_code=409, detail=MIGRATION_0013) from exc
        raise
    picked = [r for r in rows if _matches(r, category_, q.strip().lower())][:300]
    actors = {r["actor_id"]: r.get("actor_name") for r in rows if r.get("actor_id")}
    return {
        "events": _shape(picked, _target_labels(svc, picked)),
        "total": len(picked),
        "actors": [{"id": k, "name": v or k[:8]} for k, v in sorted(actors.items(), key=lambda kv: kv[1] or "")],
        "today": dict(Counter(category(r["action"]) for r in today)),
    }


@router.get("/audit/export")
def audit_export(
    period: Literal["today", "7d", "30d", "all"] = "30d",
    category_: Optional[Literal["views", "clinical", "admin", "security"]] = Query(default=None, alias="category"),
    actor: Optional[UUID] = None,
    q: str = Query(default="", max_length=100),
    user: AuthUser = Depends(require_admin),
) -> Response:
    svc = get_service_client()
    try:
        rows = _audit_rows(svc, period, str(actor) if actor else None, 10000)
    except Exception as exc:
        if _missing_0013(exc):
            raise HTTPException(status_code=409, detail=MIGRATION_0013) from exc
        raise
    rows = [r for r in rows if _matches(r, category_, q.strip().lower())]
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "created_at_utc", "actor_id", "actor_name", "actor_role", "action", "target_type", "target_id", "detail", "hash"])
    for r in reversed(rows):
        writer.writerow([
            r["id"], r["created_at"], r.get("actor_id") or "", r.get("actor_name") or "", r.get("actor_role") or "",
            r["action"], r.get("target_type") or "", r.get("target_id") or "",
            json.dumps(r.get("detail") or {}, ensure_ascii=False), r.get("hash") or "",
        ])
    audit_by(user, "security.audit_export", None, None, {"period": period, "rows": len(rows)})
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    return Response(
        content="﻿" + buf.getvalue(),  # BOM: Excel opens UTF-8 correctly
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="diabai-audit-{stamp}.csv"'},
    )


@router.get("/audit/integrity")
def audit_integrity(user: AuthUser = Depends(require_admin)) -> dict:
    """Recomputes the whole hash chain in the database."""
    try:
        res = get_service_client().rpc("audit_verify_chain", {}).execute().data
    except Exception as exc:
        if _missing_0013(exc):
            raise HTTPException(status_code=409, detail=MIGRATION_0013) from exc
        raise
    row = (res or [{}])[0] if isinstance(res, list) else (res or {})
    return {
        "total": int(row.get("total") or 0),
        "broken": int(row.get("broken") or 0),
        "first_broken": row.get("first_broken"),
        "last_hash": row.get("last_hash"),
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


# ── error alerts ─────────────────────────────────────────────────────────────

ALERT_COLUMNS = "id, level, status, source, message, detail, user_id, created_at, resolved_at"


def open_alerts(svc) -> dict:
    try:
        rows = (
            execute(
                lambda: svc.table("app_errors").select(ALERT_COLUMNS).neq("status", "resolved")
                .order("created_at", desc=True).limit(500).execute()
            ).data or []
        )
    except Exception:
        return {"open": 0, "critical": 0, "latest": []}
    return {
        "open": len(rows),
        "critical": sum(1 for r in rows if r["level"] == "critical"),
        "latest": rows[:3],
    }


@router.get("/alerts")
def alerts(
    status: Literal["unresolved", "open", "investigating", "resolved", "all"] = "unresolved",
    level: Optional[Literal["low", "medium", "high", "critical"]] = None,
    period: Literal["today", "7d", "30d", "all"] = "7d",
    q: str = Query(default="", max_length=100),
    user: AuthUser = Depends(require_admin),
) -> dict:
    svc = get_service_client()
    try:
        query = svc.table("app_errors").select(ALERT_COLUMNS).order("created_at", desc=True).limit(500)
        since = _since(period)
        if since:
            query = query.gte("created_at", since)
        if status == "unresolved":
            query = query.neq("status", "resolved")
        elif status != "all":
            query = query.eq("status", status)
        if level:
            query = query.eq("level", level)
        rows = execute(lambda: query.execute()).data or []
        month = (
            execute(
                lambda: svc.table("app_errors").select("level, status, created_at, resolved_at")
                .gte("created_at", _since("30d")).limit(1000).execute()
            ).data or []
        )
        unresolved = (
            execute(
                lambda: svc.table("app_errors").select("level, status").neq("status", "resolved")
                .limit(1000).execute()
            ).data or []
        )
    except Exception as exc:
        if _missing_0013(exc):
            raise HTTPException(status_code=409, detail=MIGRATION_0013) from exc
        raise
    needle = q.strip().lower()
    if needle:
        rows = [r for r in rows if needle in f"{r['source']} {r['message']}".lower()]
    # who hit the error: patients as their PT- code, staff by name
    people = _people(svc, {r["user_id"] for r in rows if r.get("user_id")})
    for r in rows:
        person = people.get(r.get("user_id") or "") or {}
        r["user_label"] = person.get("label")
        r["user_role"] = person.get("role")
    waits = [
        (parse_ts(r["resolved_at"]) - parse_ts(r["created_at"])).total_seconds() / 60
        for r in month
        if r["status"] == "resolved" and r.get("resolved_at") and parse_ts(r["created_at"])
    ]
    return {
        "alerts": rows,
        "summary": {
            "unresolved": len(unresolved),
            "critical": sum(1 for r in unresolved if r["level"] == "critical"),
            "investigating": sum(1 for r in unresolved if r["status"] == "investigating"),
            "mean_response_min": round(sum(waits) / len(waits)) if waits else None,
        },
    }


class AlertStatus(BaseModel):
    status: Literal["open", "investigating", "resolved"]


def _set_alert_status(svc, ids: list[int], status: str, user: AuthUser) -> None:
    resolved = status == "resolved"
    svc.table("app_errors").update(
        {
            "status": status,
            "resolved_by": user.id if resolved else None,
            "resolved_at": datetime.now(timezone.utc).isoformat() if resolved else None,
        }
    ).in_("id", ids).execute()


@router.put("/alerts/{alert_id}")
def update_alert(alert_id: int, req: AlertStatus, user: AuthUser = Depends(require_admin)) -> dict:
    svc = get_service_client()
    rows = svc.table("app_errors").select("id, status").eq("id", alert_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Alert not found")
    _set_alert_status(svc, [alert_id], req.status, user)
    audit_by(user, "alert.status", "app_error", str(alert_id), {"from": rows[0]["status"], "to": req.status})
    return {"id": alert_id, "status": req.status}


class AlertIds(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=500)


@router.post("/alerts/review")
def review_alerts(req: AlertIds, user: AuthUser = Depends(require_admin)) -> dict:
    """"Mark reviewed": resolves the listed unresolved alerts."""
    svc = get_service_client()
    open_ids = [
        r["id"] for r in svc.table("app_errors").select("id").in_("id", req.ids)
        .neq("status", "resolved").execute().data or []
    ]
    if open_ids:
        _set_alert_status(svc, open_ids, "resolved", user)
        audit_by(user, "alert.bulk_resolve", "app_error", None, {"count": len(open_ids)})
    return {"resolved": len(open_ids)}


# ── access & security ────────────────────────────────────────────────────────

def _setting(svc, key: str, default=None):
    try:
        rows = execute(lambda: svc.table("app_settings").select("value").eq("key", key).limit(1).execute()).data
    except Exception:
        return default
    return rows[0]["value"] if rows else default


@router.get("/security")
def security(user: AuthUser = Depends(require_admin)) -> dict:
    from app.routers.admin import _iso, _profiles, account_status, auth_users

    svc = get_service_client()
    profiles = _profiles(svc, None, "id, email, full_name, role, created_at")
    try:
        accounts = auth_users()
    except Exception:
        accounts = {}
    try:
        unverified = (
            execute(
                lambda: svc.table("profiles").select("id", count="exact").eq("role", "doctor")
                .is_("verified_at", "null").limit(1).execute()
            ).count or 0
        )
    except Exception:
        unverified = None
    try:
        pending_deletions = (
            execute(
                lambda: svc.table("deletion_requests").select("id", count="exact").eq("status", "pending")
                .limit(1).execute()
            ).count or 0
        )
    except Exception:
        pending_deletions = None

    now = datetime.now(timezone.utc)
    roles = {}
    for role in ("admin", "doctor", "patient"):
        members = [p for p in profiles if p["role"] == role]
        roles[role] = {
            "members": len(members),
            "with_2fa": sum(1 for p in members if (accounts.get(p["id"]) or {}).get("has_2fa")),
        }
    privileged = roles["admin"]["members"] + roles["doctor"]["members"]
    privileged_2fa = roles["admin"]["with_2fa"] + roles["doctor"]["with_2fa"]

    stale_invites = 0
    signins = []
    for p in profiles:
        info = accounts.get(p["id"])
        if not info:
            continue
        last = parse_ts(_iso(info.get("last_sign_in_at")))
        if last:
            signins.append({"id": p["id"], "name": p.get("full_name") or p.get("email"), "role": p["role"], "at": last.isoformat()})
        invited = parse_ts(_iso(info.get("invited_at")))
        if account_status(info) == "invited" and invited and invited < now - timedelta(days=7):
            stale_invites += 1
    signins.sort(key=lambda s: s["at"], reverse=True)

    findings = [
        {"code": "admins_without_2fa", "count": roles["admin"]["members"] - roles["admin"]["with_2fa"], "level": "high"},
        {"code": "doctors_without_2fa", "count": roles["doctor"]["members"] - roles["doctor"]["with_2fa"], "level": "medium"},
        {"code": "unverified_doctors", "count": unverified, "level": "medium"},
        {"code": "pending_deletions", "count": pending_deletions, "level": "medium"},
        {"code": "stale_invites", "count": stale_invites, "level": "low"},
    ]
    if not accounts:
        findings = [f for f in findings if f["code"] not in ("admins_without_2fa", "doctors_without_2fa", "stale_invites")]
    return {
        "kpis": {
            "privileged": privileged,
            "privileged_2fa": privileged_2fa,
            "adoption_pct": round(100 * privileged_2fa / privileged) if privileged and accounts else None,
            "signed_in_24h": sum(1 for s in signins if parse_ts(s["at"]) >= now - timedelta(hours=24)),
            "findings": sum(1 for f in findings if f["count"]),
        },
        "roles": roles,
        "findings": findings,
        "signins": signins[:6],
        "settings": {"require_mfa_privileged": _setting(svc, "require_mfa_privileged", False) is True},
        "auth_available": bool(accounts),
        "me_has_2fa": user.has_2fa,
    }


class SecuritySettings(BaseModel):
    require_mfa_privileged: bool


@router.put("/security/settings")
def update_security(req: SecuritySettings, user: AuthUser = Depends(require_admin)) -> dict:
    if req.require_mfa_privileged and not user.has_2fa:
        raise HTTPException(
            status_code=400,
            detail="Turn on two-factor authentication on your own account first (Settings → Security).",
        )
    try:
        get_service_client().table("app_settings").upsert(
            {
                "key": "require_mfa_privileged",
                "value": req.require_mfa_privileged,
                "updated_by": user.id,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="key",
        ).execute()
    except Exception as exc:
        raise HTTPException(status_code=409, detail=MIGRATION_0013) from exc
    forget_mfa_policy()
    audit_by(user, "security.policy", "setting", "require_mfa_privileged", {"value": req.require_mfa_privileged})
    return req.model_dump()


# ── account deletion requests ────────────────────────────────────────────────

@router.get("/deletion-requests")
def deletion_requests(user: AuthUser = Depends(require_admin)) -> dict:
    svc = get_service_client()
    try:
        rows = (
            execute(
                lambda: svc.table("deletion_requests").select("id, user_id, reason, status, created_at, handled_at")
                .order("created_at", desc=True).limit(200).execute()
            ).data or []
        )
    except Exception as exc:
        if _missing_0013(exc):
            raise HTTPException(status_code=409, detail=MIGRATION_0013) from exc
        raise
    ids = list({r["user_id"] for r in rows})
    people = {}
    if ids:
        people = {
            p["id"]: p for p in execute(
                lambda: svc.table("profiles").select("id, email, full_name, role")
                .in_("id", ids).execute()
            ).data or []
        }
    return {"requests": [dict(r, user=people.get(r["user_id"])) for r in rows]}


class DeletionDecision(BaseModel):
    decision: Literal["approve", "reject"]


@router.post("/deletion-requests/{request_id}")
def decide_deletion(request_id: UUID, req: DeletionDecision, user: AuthUser = Depends(require_admin)) -> dict:
    """approve = delete the account for good: the Supabase Auth user, its
    profile and every record linked to it (database cascade) and its scan
    images. The audit log keeps who was deleted, by whom and when."""
    svc = get_service_client()
    rows = svc.table("deletion_requests").select("id, user_id, status").eq("id", str(request_id)).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Request not found")
    request = rows[0]
    if request["status"] != "pending":
        raise HTTPException(status_code=409, detail="This request was already handled.")
    uid = request["user_id"]

    if req.decision == "reject":
        svc.table("deletion_requests").update(
            {"status": "rejected", "handled_by": user.id, "handled_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", str(request_id)).execute()
        audit_by(user, "deletion.reject", "profile", uid)
        return {"id": str(request_id), "status": "rejected"}

    if uid == user.id:
        raise HTTPException(status_code=400, detail="Another administrator must approve deleting your own account.")
    profile = (svc.table("profiles").select("email, role").eq("id", uid).limit(1).execute().data or [{}])[0]
    paths = [
        r["storage_path"] for r in svc.table("scans").select("storage_path").eq("patient_id", uid)
        .limit(10000).execute().data or [] if r.get("storage_path")
    ]
    audit_by(user, "deletion.approve", "profile", uid, {"email": profile.get("email"), "role": profile.get("role"), "scan_files": len(paths)})
    for start in range(0, len(paths), 100):
        try:
            svc.storage.from_("scans").remove(paths[start : start + 100])
        except Exception:
            pass  # the account deletion below still goes ahead
    try:
        svc.auth.admin.delete_user(uid)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not delete the account: {exc}") from exc
    return {"id": str(request_id), "status": "approved"}
