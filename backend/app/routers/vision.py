"""Vision scans: foot / neck (doctor + patient), eye (doctor only)."""

from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.auth import AuthUser, get_current_user
from app.schemas import ScanResult
from app.services import vision_service
from app.services.panel import ensure_panel_link
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
    if user.role == "doctor" and patient_id is not None:
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

    return ScanResult(
        scan_id=scan_id,
        scan_type=scan_type,
        label=result["label"],
        confidence=result["confidence"],
        probabilities=result["probabilities"],
        image_url=signed_url(BUCKET, storage_path),
        created_at=created_at,
    )
