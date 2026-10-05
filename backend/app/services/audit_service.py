"""Audit trail + error log (migration 0013) — best-effort writes that never
break the request that triggered them.

audit_log is append-only and hash-chained in the database (each row stores
the hash of the previous one), so the trail can be verified for tampering."""

from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any, Optional

from app.services.supabase_client import get_service_client

if TYPE_CHECKING:
    from app.auth import AuthUser

LEVELS = ("low", "medium", "high", "critical")
_LEGACY_LEVEL = {"warning": "medium", "error": "high"}

# action prefix → activity category on the audit page
CATEGORIES = {
    "record.view": "views",
    "prediction.": "clinical",
    "scan.": "clinical",
    "patient.": "clinical",
    "vitals.": "clinical",
    "note.": "clinical",
    "user.": "admin",
    "doctor.": "admin",
    "kb.": "admin",
    "model.": "admin",
    "alert.": "admin",
    "deletion.": "admin",
    "security.": "security",
    "account.": "security",
    "profile.": "security",
}


def category(action: str) -> str:
    for prefix, cat in CATEGORIES.items():
        if action.startswith(prefix):
            return cat
    return "admin"


def audit(
    actor_id: Optional[str],
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    detail: Optional[dict[str, Any]] = None,
    actor_role: Optional[str] = None,
    ip: Optional[str] = None,
    actor_name: Optional[str] = None,
) -> None:
    try:
        get_service_client().table("audit_log").insert(
            {
                "actor_id": actor_id,
                "actor_name": actor_name,
                "actor_role": actor_role,
                "action": action,
                "target_type": target_type,
                "target_id": str(target_id) if target_id else None,
                "detail": detail or {},
                "ip": ip,
            }
        ).execute()
    except Exception:
        pass  # auditing is advisory until migration 0013 is applied


def audit_by(
    user: "AuthUser",
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    detail: Optional[dict[str, Any]] = None,
) -> None:
    """audit() for the signed-in user (name and role snapshot included)."""
    audit(
        user.id,
        action,
        target_type,
        target_id,
        detail,
        actor_role=user.role,
        actor_name=user.full_name or user.email,
    )


def log_error(
    source: str,
    message: str,
    level: str = "high",
    detail: Optional[dict[str, Any]] = None,
    user_id: Optional[str] = None,
) -> None:
    """Opens an error alert — or, when the same error is already open from
    the last 24 h, counts one more occurrence on it (no alert flood)."""
    level = _LEGACY_LEVEL.get(level, level)
    source, message = source[:200], message[:2000]
    try:
        svc = get_service_client()
        since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        same = (
            svc.table("app_errors")
            .select("id, detail")
            .eq("source", source)
            .eq("message", message)
            .neq("status", "resolved")
            .gte("created_at", since)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
        )
        if same:
            info = dict(same[0].get("detail") or {})
            info["count"] = int(info.get("count") or 1) + 1
            info["last_seen"] = datetime.now(timezone.utc).isoformat()
            svc.table("app_errors").update({"detail": info}).eq("id", same[0]["id"]).execute()
            return
        svc.table("app_errors").insert(
            {
                "source": source,
                "message": message,
                "level": level if level in LEVELS else "high",
                "detail": {"count": 1, **(detail or {})},
                "user_id": user_id,
            }
        ).execute()
    except Exception:
        pass
