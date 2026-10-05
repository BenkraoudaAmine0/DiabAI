"""Own history — what the signed-in user is allowed to see."""

from fastapi import APIRouter, Depends, HTTPException

from app.auth import AuthUser, get_current_user
from app.services.supabase_client import get_service_client, signed_url

router = APIRouter()

BUCKET = "scans"


def _latest(rows: list[dict]) -> str | None:
    dates = [r["created_at"] for r in rows if r.get("created_at")]
    return max(dates) if dates else None


@router.get("/me/summary")
def my_summary(user: AuthUser = Depends(get_current_user)) -> dict:
    """Patient home ("My health" card): last check, next visit, care team."""
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Patient access only")
    svc = get_service_client()
    try:
        preds = (
            svc.table("predictions").select("created_at")
            .eq("patient_id", user.id).eq("status", "confirmed")
            .order("created_at", desc=True).limit(1).execute().data or []
        )
    except Exception:  # before migration 0007 there is no review status
        preds = (
            svc.table("predictions").select("created_at")
            .eq("patient_id", user.id)
            .order("created_at", desc=True).limit(1).execute().data or []
        )
    scans = (
        svc.table("scans").select("created_at")
        .or_(f"patient_id.eq.{user.id},user_id.eq.{user.id}")
        .order("created_at", desc=True).limit(1).execute().data or []
    )
    profile = (
        svc.table("profiles").select("*").eq("id", user.id).limit(1).execute().data
        or [{}]
    )[0]
    links = (
        svc.table("doctor_patients")
        .select("profiles!doctor_patients_doctor_id_fkey(id, full_name, email, phone)")
        .eq("patient_id", user.id)
        .execute()
        .data
        or []
    )
    doctors = [
        link["profiles"] for link in links if isinstance(link.get("profiles"), dict)
    ]
    return {
        "last_check_at": _latest(preds + scans),
        "next_visit_at": profile.get("next_visit_at"),  # absent before 0010
        "doctors": doctors,
    }


@router.get("/me")
def my_records(user: AuthUser = Depends(get_current_user)) -> dict:
    svc = get_service_client()

    if user.role == "patient":
        # only predictions a doctor confirmed (migration 0007); before that
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
