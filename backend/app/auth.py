"""JWT authentication + role guards.

The frontend sends `Authorization: Bearer <supabase access token>`.
We verify the token with the anon client, then load the profile for the role.
"""

import base64
import json
import time
from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, Header, HTTPException, Request

from app.services.supabase_client import get_anon_client, get_service_client


@dataclass
class AuthUser:
    id: str
    email: str
    role: str  # "doctor" | "patient" | "admin" | "doctor_pending"
    full_name: Optional[str] = None
    has_2fa: bool = False


def _aal(token: str) -> Optional[str]:
    """Authenticator assurance level claim of a token Supabase already
    validated (get_user) — read without re-verifying the signature."""
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload)).get("aal")
    except Exception:
        return None


PRIVILEGED_ROLES = ("admin", "doctor")
# A doctor who signed up is a guest until an admin approves the account
# (profiles.verified_at): their effective role is this one, so every
# doctor-or-admin check refuses them by default.
PENDING_DOCTOR = "doctor_pending"
# frontend/src/lib/api.ts APPROVAL_PENDING matches this text exactly
PENDING_DOCTOR_DETAIL = "Your doctor account is waiting for an administrator's approval."
# reachable without 2FA even when the policy requires it, so the user can
# open their settings and turn it on (enrolment itself talks to Supabase Auth)
MFA_SETUP_PATHS = ("/api/me", "/api/notifications")
MFA_SETUP_REQUIRED = "mfa_setup_required"
_policy = {"checked_at": 0.0, "require": False}


def mfa_required_for_privileged() -> bool:
    """Admin setting (app_settings.require_mfa_privileged), cached 60 s."""
    if time.time() - _policy["checked_at"] > 60:
        try:
            rows = (
                get_service_client()
                .table("app_settings")
                .select("value")
                .eq("key", "require_mfa_privileged")
                .limit(1)
                .execute()
                .data
            )
            _policy["require"] = bool(rows) and rows[0].get("value") is True
        except Exception:  # before migration 0013
            _policy["require"] = False
        _policy["checked_at"] = time.time()
    return _policy["require"]


def forget_mfa_policy() -> None:
    _policy["checked_at"] = 0.0


def _profile(user_id: str) -> dict:
    """role, full_name and verified_at of the signed-in user."""
    svc = get_service_client()
    try:
        return (
            svc.table("profiles").select("role, full_name, verified_at")
            .eq("id", user_id).single().execute().data
        )
    except Exception as exc:
        if "verified_at" not in str(exc):
            raise
        # before migration 0013 there is no approval step
        data = (
            svc.table("profiles").select("role, full_name")
            .eq("id", user_id).single().execute().data
        )
        return {**data, "verified_at": "before-0013"}


def get_current_user(
    request: Request,
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

    # two-factor: once a TOTP factor is verified, the token must be aal2
    factors = getattr(user, "factors", None) or []
    has_2fa = any(getattr(f, "status", None) == "verified" for f in factors)
    if has_2fa and _aal(token) != "aal2":
        raise HTTPException(status_code=401, detail="Two-factor verification required")

    role = "patient"
    full_name = None
    verified = False
    try:
        prof = _profile(user.id)
        role = prof.get("role", "patient")
        full_name = prof.get("full_name")
        verified = bool(prof.get("verified_at"))
    except Exception:
        # Profile row missing: never take the role from the sign-up metadata
        # (the user writes it) — act as a patient.
        meta = getattr(user, "user_metadata", None) or {}
        full_name = meta.get("full_name")

    if (
        role in PRIVILEGED_ROLES
        and not has_2fa
        and not request.url.path.startswith(MFA_SETUP_PATHS)
        and mfa_required_for_privileged()
    ):
        raise HTTPException(status_code=403, detail=MFA_SETUP_REQUIRED)

    if role == "doctor" and not verified:
        role = PENDING_DOCTOR

    return AuthUser(
        id=str(user.id),
        email=user.email or "",
        role=role,
        full_name=full_name,
        has_2fa=has_2fa,
    )


def require_doctor(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    if user.role == PENDING_DOCTOR:
        raise HTTPException(status_code=403, detail=PENDING_DOCTOR_DETAIL)
    if user.role not in ("doctor", "admin"):
        raise HTTPException(status_code=403, detail="Doctor access only")
    return user


def require_admin(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access only")
    return user
