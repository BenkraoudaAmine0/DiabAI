"""Diabetes ML prediction — doctor only."""

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from app.auth import AuthUser, require_doctor
from app.schemas import DiabetesPredictRequest, PredictionResult
from app.services import diabetes_service
from app.services.notification_service import notify
from app.services.panel import ensure_panel_link
from app.services.supabase_client import get_service_client, signed_url

router = APIRouter()

BUCKET = "scans"


@router.post("/predict", response_model=PredictionResult)
def predict_diabetes(
    req: DiabetesPredictRequest, user: AuthUser = Depends(require_doctor)
) -> PredictionResult:
    ensure_panel_link(user.id, str(req.patient_id))

    try:
        result = diabetes_service.predict(req.model_dump())
    except diabetes_service.DiabetesModelNotInstalled as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    png: bytes = result["waterfall_png"]
    record_id = uuid4()
    waterfall_path = f"{user.id}/explanations/{record_id}.png"

    try:
        svc = get_service_client()
        svc.storage.from_(BUCKET).upload(
            waterfall_path,
            png,
            {"content-type": "image/png", "upsert": "true"},
        )
        row = (
            svc.table("predictions")
            .insert(
                {
                    "id": str(record_id),
                    "patient_id": str(req.patient_id),
                    "doctor_id": user.id,
                    "input": req.model_dump(mode="json"),
                    "probability": result["probability"],
                    "prediction": result["prediction"],
                    "risk_tier": result["risk_tier"],
                    "top_factors": result["top_factors"],
                    "waterfall_path": waterfall_path,
                }
            )
            .execute()
        )
        created_at = (row.data or [{}])[0].get("created_at")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Failed to save the prediction: {exc}"
        ) from exc

    notify(
        str(req.patient_id),
        "prediction_recorded",
        {"doctor": user.full_name or "Your doctor"},
        link="/patient/history",
        actor_id=user.id,
    )

    return PredictionResult(
        record_id=record_id,
        probability=result["probability"],
        probability_pct=f"{result['probability'] * 100:.1f}%",
        prediction=result["prediction"],
        result_label=result["result_label"],
        risk_tier=result["risk_tier"],
        top_factors=result["top_factors"],
        waterfall_url=signed_url(BUCKET, waterfall_path),
        created_at=created_at,
    )
