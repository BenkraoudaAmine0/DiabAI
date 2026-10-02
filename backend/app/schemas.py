"""Request / response models."""

from datetime import date
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

Gender = Literal["male", "female"]
# Raw categories accepted from the form, mapped to the model's encoding:
#   never | No Info -> non-smoker ; current -> current ; ever|former|not current -> past_smoker
Smoking = Literal[
    "never", "No Info", "current", "former", "ever", "not current"
]


# ── diabetes prediction ──────────────────────────────────────────────────────
class DiabetesPredictRequest(BaseModel):
    patient_id: UUID
    gender: Gender
    age: float = Field(ge=0, le=120)
    hypertension: bool = False
    heart_disease: bool = False
    smoking_history: Smoking = "never"
    bmi: float = Field(ge=8, le=80)
    HbA1c_level: float = Field(ge=3, le=20)
    blood_glucose_level: float = Field(ge=40, le=500)


class TopFactor(BaseModel):
    feature: str
    value: float
    direction: str  # "↑ risk" | "↓ risk"


class PredictionResult(BaseModel):
    record_id: UUID
    probability: float
    probability_pct: str  # "12.3%"
    prediction: int  # 0 | 1
    result_label: str  # "🔴 Diabetic" | "🟢 Non-Diabetic"
    risk_tier: str  # Low | Moderate | High | Critical | Prediabetic ⚠️
    top_factors: list[TopFactor]
    waterfall_url: Optional[str] = None
    created_at: Optional[str] = None


# ── vision scans ─────────────────────────────────────────────────────────────
class ScanResult(BaseModel):
    scan_id: UUID
    scan_type: str
    label: str  # class name or "uncertain"
    top_class: Optional[str] = None
    uncertain: bool = False
    confidence: float
    probabilities: dict[str, float] = {}
    referable_dr_probability: Optional[float] = None  # eye only
    referable_dr: Optional[bool] = None  # eye only
    disclaimer: Optional[str] = None
    image_url: Optional[str] = None
    created_at: Optional[str] = None


# ── patient management ───────────────────────────────────────────────────────
class CreatePatientRequest(BaseModel):
    method: Literal["invite", "temp_password"]
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=120)
    dob: Optional[date] = None
    sex: Optional[Gender] = None
    phone: Optional[str] = Field(default=None, max_length=30)


class CreatePatientResponse(BaseModel):
    patient_id: UUID
    method: str
    email: str
    temp_password: Optional[str] = None  # shown ONCE when method=temp_password
    message: str


class LinkPatientRequest(BaseModel):
    email: EmailStr


class PatientCredentialsRequest(BaseModel):
    method: Literal["login_link", "temp_password"]


# ── chat ─────────────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    session_id: Optional[UUID] = None


class ChatSource(BaseModel):
    index: int
    title: str
    excerpt: str
    similarity: float


class ChatResponse(BaseModel):
    session_id: UUID
    answer: str
    sources: list[ChatSource] = []
