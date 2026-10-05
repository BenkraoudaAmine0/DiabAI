"""RAG chatbot — doctors and patients, with cited sources."""

from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException

from app.auth import AuthUser, get_current_user
from app.schemas import ChatRequest, ChatResponse, ChatSource
from app.services import gemini_service, rag_service
from app.services.clinical import age_from, clinical_status
from app.services.panel import get_profile, has_panel_link, predictions_of
from app.services.supabase_client import get_service_client

router = APIRouter()


def _own_session(svc, user_id: str, session_id: str) -> None:
    res = (
        svc.table("chat_sessions")
        .select("id")
        .eq("id", session_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Chat session not found")


def _history(svc, user_id: str, session_id: str) -> list[dict]:
    """Latest turns of the conversation, oldest first."""
    res = (
        svc.table("chat_messages")
        .select("role, content")
        .eq("session_id", session_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(rag_service.HISTORY_MESSAGES)
        .execute()
    )
    return list(reversed(res.data or []))


def _yes(value) -> bool:
    return value in (1, "1", True, "yes", "Yes")


def _patient_brief(svc, user: AuthUser, patient_id: str) -> str:
    """De-identified summary of a panel patient for the prompt: no name and
    no identifiers — only age, sex and the latest measured values."""
    if user.role not in ("doctor", "admin") or not has_panel_link(user.id, patient_id):
        raise HTTPException(status_code=403, detail="This patient is not in your panel.")
    profile = get_profile(patient_id)
    preds = predictions_of(svc, [patient_id])
    latest = preds[0] if preds else None
    inp = (latest or {}).get("input") or {}

    parts: list[str] = []
    age = age_from(profile.get("dob"), inp.get("age"))
    if age is not None:
        parts.append(f"age {age}")
    sex = profile.get("sex") or inp.get("gender")
    if sex:
        parts.append(f"sex {str(sex).lower()}")
    if latest:
        parts.append(
            f"latest DiabAI risk assessment: {clinical_status(latest)}"
            f" (model probability {float(latest.get('probability') or 0):.0%})"
        )
        for key, label in (
            ("HbA1c_level", "HbA1c (%)"),
            ("blood_glucose_level", "blood glucose (mg/dL)"),
            ("bmi", "BMI (kg/m²)"),
            ("smoking_history", "smoking"),
        ):
            if inp.get(key) not in (None, ""):
                parts.append(f"{label} {inp[key]}")
        if _yes(inp.get("hypertension")):
            parts.append("hypertension")
        if _yes(inp.get("heart_disease")):
            parts.append("heart disease")
    try:  # latest vitals (migration 0012)
        rows = (
            svc.table("patient_vitals")
            .select("systolic, diastolic, fasting_glucose, hba1c, egfr, acr, measured_at")
            .eq("patient_id", patient_id)
            .order("measured_at", desc=True)
            .limit(1)
            .execute()
            .data
        )
    except Exception:
        rows = []
    if rows:
        v = rows[0]
        if v.get("systolic") and v.get("diastolic"):
            parts.append(f"blood pressure {v['systolic']}/{v['diastolic']} mmHg")
        for key, label in (
            ("fasting_glucose", "fasting glucose (mg/dL)"),
            ("hba1c", "latest lab HbA1c (%)"),
            ("egfr", "eGFR (mL/min/1.73m²)"),
            ("acr", "urine ACR (mg/g)"),
        ):
            if v.get(key) is not None:
                parts.append(f"{label} {v[key]}")
    return "; ".join(parts) or "no recorded data yet"


@router.post("", response_model=ChatResponse)
def chat(
    req: ChatRequest, user: AuthUser = Depends(get_current_user)
) -> ChatResponse:
    svc = get_service_client()
    session_id = str(req.session_id) if req.session_id else None
    history: list[dict] = []
    if session_id:
        _own_session(svc, user.id, session_id)
        history = _history(svc, user.id, session_id)
    patient_context = (
        _patient_brief(svc, user, str(req.patient_id)) if req.patient_id else None
    )

    try:
        answer, sources = rag_service.answer(
            req.message,
            user_id=user.id,
            history=history,
            lang=req.lang,
            friendly=bool(req.friendly),
            patient_context=patient_context,
        )
    except gemini_service.GeminiNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Chat failed: {exc}"
        ) from exc

    if not session_id:
        session_id = str(uuid4())
        svc.table("chat_sessions").insert(
            {
                "id": session_id,
                "user_id": user.id,
                "title": req.message[:60],
            }
        ).execute()

    # explicit timestamps: one INSERT gives both rows the same now(), and the
    # history is read back ordered by created_at
    asked_at = datetime.now(timezone.utc)
    svc.table("chat_messages").insert(
        [
            {
                "session_id": session_id,
                "user_id": user.id,
                "role": "user",
                "content": req.message,
                "created_at": asked_at.isoformat(),
            },
            {
                "session_id": session_id,
                "user_id": user.id,
                "role": "assistant",
                "content": answer,
                "sources": sources,
                "created_at": (asked_at + timedelta(milliseconds=1)).isoformat(),
            },
        ]
    ).execute()

    return ChatResponse(
        session_id=UUID(session_id),
        answer=answer,
        sources=[ChatSource(**s) for s in sources],
    )


@router.get("/sessions")
def list_sessions(user: AuthUser = Depends(get_current_user)) -> dict:
    res = (
        get_service_client()
        .table("chat_sessions")
        .select("id, title, created_at")
        .eq("user_id", user.id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    return {"sessions": res.data or []}


@router.get("/sessions/{session_id}/messages")
def session_messages(
    session_id: UUID, user: AuthUser = Depends(get_current_user)
) -> dict:
    svc = get_service_client()
    _own_session(svc, user.id, str(session_id))
    res = (
        svc.table("chat_messages")
        .select("role, content, sources, created_at")
        .eq("session_id", str(session_id))
        .eq("user_id", user.id)
        .order("created_at", desc=False)
        .execute()
    )
    return {"messages": res.data or []}
