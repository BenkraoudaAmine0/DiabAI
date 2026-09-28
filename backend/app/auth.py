"""JWT authentication + role guards.

The frontend sends `Authorization: Bearer <supabase access token>`.
We verify the token with the anon client, then load the profile for the role.
"""

from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, Header, HTTPException

from app.services.supabase_client import get_anon_client, get_service_client


@dataclass
class AuthUser:
    id: str
    email: str
    role: str  # "doctor" | "patient"
    full_name: Optional[str] = None


def get_current_user(
    authorization: Optional[str] = Header(default=None),
) -> AuthUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = authorization.split(" ", 1)[1].strip()

    try:
        res = get_anon_client().auth.get_user(token)
    except Exception as exc:  # invalid/expired token
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc

    user = res.user
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    role = "patient"
    full_name = None
    try:
        prof = (
            get_service_client()
            .table("profiles")
            .select("role, full_name")
            .eq("id", user.id)
            .single()
            .execute()
        )
        role = prof.data.get("role", "patient")
        full_name = prof.data.get("full_name")
    except Exception:
        # Profile row missing (migration not applied?) — fall back to metadata.
        meta = getattr(user, "user_metadata", None) or {}
        role = meta.get("role", "patient")
        full_name = meta.get("full_name")

    return AuthUser(
        id=str(user.id),
        email=user.email or "",
        role=role,
        full_name=full_name,
    )


def require_doctor(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    if user.role not in ("doctor", "admin"):
        raise HTTPException(status_code=403, detail="Doctor access only")
    return user


def require_admin(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access only")
    return user
