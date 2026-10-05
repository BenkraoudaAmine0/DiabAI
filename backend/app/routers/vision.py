"""Vision scans: foot / neck (doctor + patient), eye (doctor only)."""

from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.auth import AuthUser, get_current_user
from app.schemas import ScanResult, ScanReviewRequest
from app.services import vision_service
from app.services.notification_service import notify
from app.services.audit_service import audit_by
from app.services.panel import ensure_panel_link, has_panel_link
from app.services.supabase_client import get_service_client, signed_url

router = APIRouter()

BUCKET = "scans"
MAX_UPLOAD = 10 * 1024 * 1024  # 10 MB


@router.post("/scan/{scan_type}", response_model=ScanResult)
async def scan(
    scan_type: str,
    file: UploadFile = File(...),
    patient_id: UUID | None = Form(default=None),
    user: AuthUser = Depends(get_current_user),
) -> ScanResult:
    if scan_type not in vision_service.SCAN_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown scan type '{scan_type}'. "
            f"Expected one of {list(vision_service.SCAN_TYPES)}.",
        )
    if scan_type == "eye" and user.role not in ("doctor", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Retinopathy screening requires clinical fundus "
            "photography — doctor access only.",
        )

    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image file")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(image_bytes) > MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="Image larger than 10 MB")

    try:
        result = vision_service.predict(scan_type, image_bytes)
    except vision_service.VisionModelNotInstalled as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except RuntimeError as exc:  # loader issue (missing TF/torch, bad export…)
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Scan failed: {exc}"
        ) from exc

    # Subject of the scan: patients scan themselves; doctors pick a patient.
    subject_id = user.id if user.role == "patient" else None
    if user.role in ("doctor", "admin") and patient_id is not None:
        ensure_panel_link(user.id, str(patient_id))
        subject_id = str(patient_id)

    scan_id = uuid4()
    ext = Path(file.filename or "photo.jpg").suffix.lower() or ".jpg"
    storage_path = f"{user.id}/scans/{scan_id}{ext}"

    try:
        svc = get_service_client()
        svc.storage.from_(BUCKET).upload(
            storage_path,
            image_bytes,
            {"content-type": file.content_type or "image/jpeg", "upsert": "true"},
        )
        row = (
            svc.table("scans")
            .insert(
                {
                    "id": str(scan_id),
                    "user_id": user.id,
                    "patient_id": subject_id,
                    "scan_type": scan_type,
                    "storage_path": storage_path,
                    "result": result,
                }
            )
            .execute()
        )
        created_at = (row.data or [{}])[0].get("created_at")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Failed to save the scan: {exc}"
        ) from exc

    if user.role in ("doctor", "admin") and subject_id:  # scanned for a patient
        notify(
            subject_id,
            "scan_recorded",
            {"doctor": user.full_name or "Your doctor", "scan": scan_type},
            link="/patient/history",
            actor_id=user.id,
        )

    audit_by(user, "scan.create", "profile", subject_id, {"scan_id": str(scan_id), "scan_type": scan_type})
    return ScanResult(
        scan_id=scan_id,
        scan_type=scan_type,
        label=result["label"],
        top_class=result.get("top_class"),
        uncertain=result.get("uncertain", False),
        confidence=result["confidence"],
        probabilities=result["probabilities"],
        referable_dr_probability=result.get("referable_dr_probability"),
        referable_dr=result.get("referable_dr"),
        disclaimer=result.get("disclaimer"),
        image_url=signed_url(BUCKET, storage_path),
        created_at=created_at,
    )


@router.post("/scan/{scan_id}/review")
def review_scan(
    scan_id: UUID, req: ScanReviewRequest, user: AuthUser = Depends(get_current_user)
) -> dict:
    """Clinician decision on a scan: confirm or modify the model's grade, and
    optionally refer the patient to a specialist (needs migration 0012)."""
    if user.role not in ("doctor", "admin"):
        raise HTTPException(status_code=403, detail="Doctor access only")
    svc = get_service_client()
    rows = svc.table("scans").select("id, patient_id, user_id, result").eq("id", str(scan_id)).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Scan not found")
    scan_row = rows[0]
    if scan_row.get("patient_id"):
        if not has_panel_link(user.id, scan_row["patient_id"]):
            raise HTTPException(status_code=403, detail="This patient is not in your panel.")
    elif scan_row.get("user_id") != user.id:
        raise HTTPException(status_code=403, detail="Not your scan")
    label = req.label or (scan_row.get("result") or {}).get("label")
    update = {
        "review_status": req.decision,
        "reviewed_label": label,
        "referred": req.referred,
        "reviewed_by": user.id,
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        svc.table("scans").update(update).eq("id", str(scan_id)).execute()
    except Exception as exc:
        if "review_status" in str(exc) or "reviewed_" in str(exc) or "referred" in str(exc):
            raise HTTPException(
                status_code=400,
                detail="Apply backend/supabase/migrations/0012_patient_record.sql first.",
            ) from exc
        raise
    audit_by(user, "scan.review", "profile", rows[0].get("patient_id"),
             {"scan_id": str(scan_id), "decision": req.decision, "referred": req.referred})
    return {"id": str(scan_id), **update}
