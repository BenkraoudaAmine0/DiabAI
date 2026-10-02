"""Own history — what the signed-in user is allowed to see."""

from fastapi import APIRouter, Depends

from app.auth import AuthUser, get_current_user
from app.services.supabase_client import get_service_client, signed_url

router = APIRouter()

BUCKET = "scans"


@router.get("/me")
def my_records(user: AuthUser = Depends(get_current_user)) -> dict:
    svc = get_service_client()

    if user.role == "patient":
        # only predictions a doctor confirmed (migration 0006); before that
        # migration there is no review step and every record is shown
        query = (
            svc.table("predictions")
            .select("*, doctor:profiles!predictions_doctor_id_fkey(full_name)")
            .eq("patient_id", user.id)
            .order("created_at", desc=True)
        )
        try:
            preds = query.eq("status", "confirmed").execute()
        except Exception:
            preds = (
                svc.table("predictions")
                .select("*, doctor:profiles!predictions_doctor_id_fkey(full_name)")
                .eq("patient_id", user.id)
                .order("created_at", desc=True)
                .execute()
            )
        scans = (
            svc.table("scans")
            .select("id, storage_path, scan_type, result, created_at")
            .or_(f"patient_id.eq.{user.id},user_id.eq.{user.id}")
            .order("created_at", desc=True)
            .execute()
        )
    else:  # doctor: records they created themselves
        preds = (
            svc.table("predictions")
            .select("*, patient:profiles!predictions_patient_id_fkey(full_name)")
            .eq("doctor_id", user.id)
            .order("created_at", desc=True)
            .execute()
        )
        scans = (
            svc.table("scans")
            .select("*, subject:profiles!scans_patient_id_fkey(full_name)")
            .eq("user_id", user.id)
            .order("created_at", desc=True)
            .execute()
        )

    predictions = []
    for p in preds.data or []:
        p = dict(p)
        if p.get("waterfall_path"):
            p["waterfall_url"] = signed_url(BUCKET, p["waterfall_path"])
        predictions.append(p)

    scan_items = []
    for s in scans.data or []:
        s = dict(s)
        if s.get("storage_path"):
            s["image_url"] = signed_url(BUCKET, s["storage_path"])
        scan_items.append(s)

    return {"predictions": predictions, "scans": scan_items}
