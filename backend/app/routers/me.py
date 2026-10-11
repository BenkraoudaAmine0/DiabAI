"""The signed-in user's own account: professional profile, data export
(right of access) and account deletion requests."""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.auth import AuthUser, get_current_user
from app.services.audit_service import audit_by
from app.services.panel import get_profile
from app.services.supabase_client import get_service_client

router = APIRouter()


class ProfessionalRequest(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=120)
    specialty: Optional[str] = Field(default=None, max_length=120)
    license_number: Optional[str] = Field(default=None, max_length=64)
    facility: Optional[str] = Field(default=None, max_length=120)


class DeletionRequest(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=2000)


@router.get("")
def me(user: AuthUser = Depends(get_current_user)) -> dict:
    profile = get_profile(user.id)
    pending = None
    try:
        rows = (
            get_service_client().table("deletion_requests").select("id, status, created_at")
            .eq("user_id", user.id).order("created_at", desc=True).limit(1).execute().data
        )
        pending = rows[0] if rows else None
    except Exception:
        pass  # before migration 0013
    return {
        "profile": {
            k: profile.get(k)
            for k in (
                "id", "email", "role", "full_name", "phone", "dob", "sex",
                "specialty", "license_number", "facility",
                "blood_group", "cnas_number", "chifa_number", "created_at",
            )
        },
        "deletion_request": pending,
    }


@router.put("/professional")
def update_professional(req: ProfessionalRequest, user: AuthUser = Depends(get_current_user)) -> dict:
    if user.role not in ("doctor", "admin"):
        raise HTTPException(status_code=403, detail="Doctor access only")
    values = {
        k: (v.strip() or None) if isinstance(v, str) else v
        for k, v in req.model_dump().items()
        if v is not None
    }
    if not values:
        return {}
    try:
        get_service_client().table("profiles").update(values).eq("id", user.id).execute()
    except Exception as exc:
        if "specialty" in str(exc) or "license_number" in str(exc):
            raise HTTPException(
                status_code=400,
                detail="Apply backend/supabase/migrations/0012_patient_record.sql first.",
            ) from exc
        if "facility" in str(exc):
            raise HTTPException(
                status_code=400,
                detail="Apply backend/supabase/migrations/0013_admin_security.sql first.",
            ) from exc
        raise
    audit_by(user, "profile.update", "profile", user.id, {"fields": sorted(values)})
    return values


@router.get("/export")
def export_my_data(user: AuthUser = Depends(get_current_user)) -> JSONResponse:
    """Everything DiabAI stores about the user, as a JSON download."""
    svc = get_service_client()
    data: dict = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "profile": get_profile(user.id),
    }
    if user.role == "patient":
        data["predictions"] = (
            svc.table("predictions")
            .select("id, created_at, input, probability, prediction, risk_tier, status")
            .eq("patient_id", user.id).execute().data or []
        )
        data["scans"] = (
            svc.table("scans").select("id, created_at, scan_type, result")
            .eq("patient_id", user.id).execute().data or []
        )
        data["notifications"] = (
            svc.table("notifications").select("kind, data, created_at, read")
            .eq("user_id", user.id).execute().data or []
        )
        try:  # measurements recorded by the care team (migration 0012)
            data["vitals"] = (
                svc.table("patient_vitals")
                .select("measured_at, systolic, diastolic, weight_kg, height_cm, fasting_glucose, hba1c, egfr, acr")
                .eq("patient_id", user.id).order("measured_at", desc=True).execute().data or []
            )
        except Exception:
            pass
    else:
        data["panel"] = (
            svc.table("doctor_patients").select("patient_id, created_at")
            .eq("doctor_id", user.id).execute().data or []
        )
        data["predictions_authored"] = (
            svc.table("predictions").select("id, patient_id, created_at, risk_tier, status")
            .eq("doctor_id", user.id).execute().data or []
        )
    data["chat_sessions"] = (
        svc.table("chat_sessions").select("id, title, created_at")
        .eq("user_id", user.id).execute().data or []
    )
    audit_by(user, "account.export", "profile", user.id)
    return JSONResponse(
        data,
        headers={"Content-Disposition": f'attachment; filename="diabai-export-{user.id[:8]}.json"'},
    )


@router.post("/deletion-request", status_code=201)
def request_deletion(req: DeletionRequest, user: AuthUser = Depends(get_current_user)) -> dict:
    svc = get_service_client()
    try:
        existing = (
            svc.table("deletion_requests").select("id, status, created_at")
            .eq("user_id", user.id).eq("status", "pending").limit(1).execute().data
        )
        if existing:
            return existing[0]
        row = (
            svc.table("deletion_requests")
            .insert({"user_id": user.id, "reason": (req.reason or "").strip() or None})
            .execute().data
        )
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="Apply backend/supabase/migrations/0013_admin_security.sql first.",
        ) from exc
    audit_by(user, "account.deletion_request", "profile", user.id)
    return (row or [{}])[0]
