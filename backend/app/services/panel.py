"""Doctor ↔ patient panel helpers shared across routers."""

from fastapi import HTTPException

from app.services.supabase_client import get_service_client


def get_profile(user_id: str) -> dict:
    try:
        res = (
            get_service_client()
            .table("profiles")
            .select("*")
            .eq("id", user_id)
            .single()
            .execute()
        )
        return res.data
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Profile not found") from exc


def ensure_panel_link(doctor_id: str, patient_id: str) -> None:
    """Validates the subject is a patient and (re)creates the panel link."""
    profile = get_profile(patient_id)
    if profile.get("role") != "patient":
        raise HTTPException(
            status_code=400, detail="Selected user is not a patient"
        )
    get_service_client().table("doctor_patients").upsert(
        {"doctor_id": doctor_id, "patient_id": patient_id},
        on_conflict="doctor_id,patient_id",
    ).execute()


def has_panel_link(doctor_id: str, patient_id: str) -> bool:
    res = (
        get_service_client()
        .table("doctor_patients")
        .select("doctor_id")
        .eq("doctor_id", doctor_id)
        .eq("patient_id", patient_id)
        .limit(1)
        .execute()
    )
    return bool(res.data)
