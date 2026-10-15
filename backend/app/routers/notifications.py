"""Notification list + read-state endpoints (any signed-in role)."""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import AuthUser, get_current_user
from app.services.supabase_client import execute, get_service_client

router = APIRouter()


class MarkReadRequest(BaseModel):
    ids: Optional[list[UUID]] = None  # None (or omitted) = mark ALL as read


@router.get("")
def list_notifications(user: AuthUser = Depends(get_current_user)) -> dict:
    svc = get_service_client()
    rows = (
        execute(
            lambda: svc.table("notifications")
            .select("id, kind, data, link, read, created_at, actor_id")
            .eq("user_id", user.id)
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        ).data
        or []
    )
    unread = sum(1 for r in rows if not r["read"])
    return {"notifications": rows, "unread": unread}


@router.post("/read")
def mark_read(
    req: MarkReadRequest, user: AuthUser = Depends(get_current_user)
) -> dict:
    svc = get_service_client()
    query = svc.table("notifications").update({"read": True}).eq("user_id", user.id)
    if req.ids:
        query = query.in_("id", [str(i) for i in req.ids])
    query.execute()
    return {"ok": True}
