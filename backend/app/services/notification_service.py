"""In-app notification service — best-effort inserts, never breaks the
main operation. Rows are consumed by the frontend bell via Supabase
Realtime; titles are rendered client-side from `kind` + `data` so they
respect the user's language."""

from typing import Any, Optional

from app.services.supabase_client import get_service_client

KINDS = ("prediction_recorded", "scan_recorded", "panel_added", "visit_reminder")


def notify(
    user_id: str,
    kind: str,
    data: Optional[dict] = None,
    link: Optional[str] = None,
    actor_id: Optional[str] = None,
) -> None:
    if kind not in KINDS or not user_id:
        return
    try:
        get_service_client().table("notifications").insert(
            {
                "user_id": str(user_id),
                "actor_id": str(actor_id) if actor_id else None,
                "kind": kind,
                "data": data or {},
                "link": link,
            }
        ).execute()
    except Exception:
        pass  # notifications must never fail the request that caused them
