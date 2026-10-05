"""Request / response models."""

from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

Gender = Literal["male", "female"]
Lang = Literal["en", "fr"]
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
    factors: list[TopFactor] = []  # all 8, strongest first
    threshold: Optional[float] = None
    status: str = "pending"  # until the doctor confirms / rejects it
    waterfall_url: Optional[str] = None
    created_at: Optional[str] = None


class ReviewRequest(BaseModel):
    decision: Literal["confirmed", "rejected"]
    note: Optional[str] = Field(default=None, max_length=2000)


class InterpretationRequest(BaseModel):
    lang: Lang = "en"
    force: bool = False  # regenerate even if one exists in this language


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


class NextVisitRequest(BaseModel):
    next_visit_at: Optional[datetime] = None  # None clears the visit


BloodGroup = Literal["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"]


class IdentifiersRequest(BaseModel):
    cnas_number: Optional[str] = Field(default=None, max_length=32)
    chifa_number: Optional[str] = Field(default=None, max_length=32)
    blood_group: Optional[BloodGroup] = None


class VitalsRequest(BaseModel):
    measured_at: Optional[datetime] = None
    systolic: Optional[int] = Field(default=None, ge=50, le=300)
    diastolic: Optional[int] = Field(default=None, ge=30, le=200)
    weight_kg: Optional[float] = Field(default=None, ge=1, le=500)
    height_cm: Optional[float] = Field(default=None, ge=30, le=260)
    fasting_glucose: Optional[float] = Field(default=None, ge=20, le=1000)
    hba1c: Optional[float] = Field(default=None, ge=2, le=25)
    egfr: Optional[float] = Field(default=None, ge=1, le=200)
    acr: Optional[float] = Field(default=None, ge=0, le=10000)


class NoteRequest(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


# ── chat ─────────────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    session_id: Optional[UUID] = None
    lang: Optional[Lang] = None  # UI language, for fixed replies
    friendly: Optional[bool] = None  # patient "Friendly explanations" setting
    patient_id: Optional[UUID] = None  # clinician chat "tuned to a record"


class ChatSource(BaseModel):
    index: int
    title: str
    excerpt: str
    similarity: float
    page: Optional[str] = None  # printed page label or PDF page number
    chapter: Optional[str] = None
    content_type: Optional[str] = None  # "table" | "figure" | None (text)


class ChatResponse(BaseModel):
    session_id: UUID
    answer: str
    sources: list[ChatSource] = []


class ScanReviewRequest(BaseModel):
    decision: Literal["confirmed", "modified"]
    label: Optional[str] = Field(default=None, max_length=64)  # the grade kept
    referred: bool = False
