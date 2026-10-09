"""Diabetes ML prediction — run (doctor), report, review, interpretation, PDF.

POST /predict                          run the model, save a 'pending' record
GET  /predictions/{id}                 full report data (doctor; patient once confirmed)
POST /predictions/{id}/interpretation  Gemini's clinical interpretation (doctor)
POST /predictions/{id}/review          confirm / reject, with a note (doctor)
GET  /predictions/{id}/report.pdf      PDF report, ?lang=en|fr&tz=Europe/Paris
"""

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from app.auth import AuthUser, get_current_user, require_doctor
from app.schemas import (
    DiabetesPredictRequest,
    InterpretationRequest,
    PredictionResult,
    ReviewRequest,
)
from app.services import diabetes_service, interpretation_service, report_service
from app.services.gemini_service import GeminiNotConfigured
from app.services.notification_service import notify
from app.services.audit_service import audit_by
from app.services.panel import ensure_panel_link, has_panel_link
from app.services.supabase_client import get_service_client, signed_url

router = APIRouter()

BUCKET = "scans"
SELECT = (
    "*, doctor:profiles!predictions_doctor_id_fkey(full_name), "
    "reviewer:profiles!predictions_reviewed_by_fkey(full_name), "
    "patient:profiles!predictions_patient_id_fkey(id, full_name, email, sex, dob)"
)


@router.post("/predict", response_model=PredictionResult)
def predict_diabetes(
    req: DiabetesPredictRequest, user: AuthUser = Depends(require_doctor)
) -> PredictionResult:
    ensure_panel_link(user.id, str(req.patient_id))

    try:
        result = diabetes_service.predict(req.model_dump())
    except diabetes_service.DiabetesModelNotInstalled as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    record_id = uuid4()

    try:
        svc = get_service_client()
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
                    # all 8 factors, strongest first (the UI shows the top ones)
                    "top_factors": result["factors"],
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

    audit_by(user, "prediction.create", "profile", str(req.patient_id), {"prediction_id": str(record_id)})
    return PredictionResult(
        record_id=record_id,
        probability=result["probability"],
        probability_pct=diabetes_service.format_pct(result["probability"]),
        prediction=result["prediction"],
        result_label=result["result_label"],
        risk_tier=result["risk_tier"],
        top_factors=result["top_factors"],
        factors=result["factors"],
        threshold=result["threshold"],
        created_at=created_at,
    )


# ── one prediction: access, report, review ───────────────────────────────────
def _missing_migration(exc: Exception) -> bool:
    text = str(exc).lower()
    return "reviewed_by" in text or ("column" in text and "does not exist" in text)


def _load(prediction_id: UUID, user: AuthUser, *, doctor_only: bool = False) -> dict:
    """The prediction row (with doctor / reviewer / patient), or 404 / 403.
    Doctors: their own records and those of panel patients. Admins: all.
    Patients: their own, once a doctor confirmed it (read only)."""
    try:
        rows = (
            get_service_client()
            .table("predictions")
            .select(SELECT)
            .eq("id", str(prediction_id))
            .limit(1)
            .execute()
            .data
        )
    except Exception as exc:
        if _missing_migration(exc):
            raise HTTPException(
                status_code=503,
                detail="Prediction review isn't set up — apply "
                "backend/supabase/migrations/0007_prediction_review.sql.",
            ) from exc
        raise
    if not rows:
        raise HTTPException(status_code=404, detail="Prediction not found")
    row = rows[0]

    if user.role == "admin":
        return row
    if user.role == "doctor":
        if row["doctor_id"] == user.id or has_panel_link(user.id, row["patient_id"]):
            return row
        raise HTTPException(status_code=403, detail="This patient is not in your panel.")
    if not doctor_only and row["patient_id"] == user.id and row.get("status") == "confirmed":
        return row
    raise HTTPException(status_code=404, detail="Prediction not found")


def _report(row: dict, user: AuthUser) -> dict:
    factors = row.get("top_factors") or []
    inp = row.get("input") or {}
    try:
        threshold: Optional[float] = diabetes_service.decision_threshold()
    except diabetes_service.DiabetesModelNotInstalled:
        threshold = None
    prediction = {
        k: row.get(k)
        for k in (
            "id", "patient_id", "doctor_id", "input", "probability", "prediction",
            "risk_tier", "status", "review_note", "reviewed_at", "interpretation",
            "interpretation_lang", "created_at",
        )
    }
    prob = float(row.get("probability") or 0)
    prediction.update(
        probability_pct=diabetes_service.format_pct(prob),
        result_label="🔴 Diabetic" if row.get("prediction") == 1 else "🟢 Non-Diabetic",
        factors=factors,
        top_factors=factors[:3],
        threshold=threshold,
        values=diabetes_service.clinical_values(inp) if inp else [],
        doctor_name=(row.get("doctor") or {}).get("full_name"),
        reviewer_name=(row.get("reviewer") or {}).get("full_name"),
    )
    return {
        "prediction": prediction,
        "patient": row.get("patient") or {"id": row.get("patient_id")},
        "can_review": user.role in ("doctor", "admin"),
    }


@router.get("/predictions/{prediction_id}")
def get_prediction(
    prediction_id: UUID, user: AuthUser = Depends(get_current_user)
) -> dict:
    return _report(_load(prediction_id, user), user)


@router.post("/predictions/{prediction_id}/review")
def review_prediction(
    prediction_id: UUID, req: ReviewRequest, user: AuthUser = Depends(require_doctor)
) -> dict:
    """Confirm (shared with the patient) or reject (kept out of the patient's
    history). Can be changed later; the latest decision wins."""
    before = _load(prediction_id, user, doctor_only=True)
    get_service_client().table("predictions").update(
        {
            "status": req.decision,
            "review_note": (req.note or "").strip() or None,
            "reviewed_by": user.id,
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", str(prediction_id)).execute()
    if req.decision == "confirmed" and before.get("status") != "confirmed":
        # the patient only sees a prediction once it is confirmed
        notify(
            before["patient_id"],
            "prediction_recorded",
            {"doctor": user.full_name or "Your doctor"},
            link=f"/predictions/{prediction_id}",
            actor_id=user.id,
        )
    audit_by(user, "prediction.review", "profile", before["patient_id"],
             {"prediction_id": str(prediction_id), "decision": req.decision})
    return _report(_load(prediction_id, user), user)


@router.post("/predictions/{prediction_id}/interpretation")
def interpret_prediction(
    prediction_id: UUID,
    req: InterpretationRequest,
    user: AuthUser = Depends(require_doctor),
) -> dict:
    """Gemini's clinical interpretation, generated once per language and
    stored with the record (force=true regenerates it)."""
    row = _load(prediction_id, user, doctor_only=True)
    if row.get("interpretation") and row.get("interpretation_lang") == req.lang and not req.force:
        return {"interpretation": row["interpretation"], "lang": req.lang}
    try:
        text = interpretation_service.interpret(
            row, diabetes_service.decision_threshold(), req.lang, user_id=user.id
        )
    except GeminiNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except diabetes_service.DiabetesModelNotInstalled as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Interpretation failed: {exc}"
        ) from exc
    get_service_client().table("predictions").update(
        {"interpretation": text, "interpretation_lang": req.lang}
    ).eq("id", str(prediction_id)).execute()
    return {"interpretation": text, "lang": req.lang}


@router.get("/predictions/{prediction_id}/report.pdf")
def prediction_pdf(
    prediction_id: UUID,
    lang: str = Query(default="en", pattern="^(en|fr)$"),
    tz: Optional[str] = Query(default=None, max_length=64),
    user: AuthUser = Depends(get_current_user),
) -> Response:
    row = _load(prediction_id, user)
    data = _report(row, user)["prediction"]

    waterfall = None
    if row.get("waterfall_path"):
        try:
            waterfall = get_service_client().storage.from_(BUCKET).download(row["waterfall_path"])
        except Exception:
            waterfall = None  # the report is still useful without the chart

    pdf = report_service.build_pdf(
        {**row, "top_factors": data["factors"]},
        patient=row.get("patient") or {},
        doctor_name=data["doctor_name"],
        reviewer_name=data["reviewer_name"],
        values=data["values"],
        threshold=data["threshold"] or 0.0,
        waterfall_png=waterfall,
        lang=lang,
        tz=tz,
    )
    name = f"diabai-report-{str(prediction_id)[:8]}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )
