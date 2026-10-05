"""Small clinical helpers shared by the dashboard, the patient list and the
search: age, the patient's clinical status from their latest prediction, and
which results count as urgent."""

from datetime import date, datetime, timezone
from typing import Any, Optional

# Thresholds for "urgent" alerts on the dashboard (to review quickly):
URGENT_GLUCOSE = 300  # mg/dL — marked hyperglycaemia
URGENT_HBA1C = 10.0  # % — very poorly controlled


def parse_ts(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        ts = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)


def age_from(dob: Any, fallback: Any = None) -> Optional[int]:
    """Age in years from a birth date, else the age entered in a prediction."""
    if dob:
        try:
            born = date.fromisoformat(str(dob)[:10])
            today = date.today()
            return today.year - born.year - ((today.month, today.day) < (born.month, born.day))
        except ValueError:
            pass
    try:
        return int(float(fallback)) if fallback is not None else None
    except (TypeError, ValueError):
        return None


def clinical_status(pred: Optional[dict]) -> str:
    """Patient status from a prediction: diabetic | prediabetic | moderate |
    normal | none. The model is binary (diabetic or not) plus risk tiers — it
    does not tell diabetes types apart."""
    if not pred:
        return "none"
    if pred.get("prediction") == 1:
        return "diabetic"
    tier = str(pred.get("risk_tier") or "").lower()
    if tier.startswith("prediabetic"):
        return "prediabetic"
    if tier in ("moderate", "high", "critical"):
        return "moderate"
    return "normal"


def urgent_reason(record: dict, kind: str) -> Optional[dict]:
    """Why a prediction / scan needs attention now, or None.
    → {"reason": "glucose" | "hba1c" | "referable_dr", "value": …}
    Based on measured values, not the model's tier: almost every diabetic
    prediction is "Critical" (~100 %), which would flood the alerts."""
    if kind == "prediction":
        inp = record.get("input") or {}
        try:
            glucose = float(inp.get("blood_glucose_level") or 0)
            hba1c = float(inp.get("HbA1c_level") or 0)
        except (TypeError, ValueError):
            glucose = hba1c = 0.0
        if glucose >= URGENT_GLUCOSE:
            return {"reason": "glucose", "value": glucose}
        if hba1c >= URGENT_HBA1C:
            return {"reason": "hba1c", "value": hba1c}
        return None
    result = record.get("result") or {}
    if record.get("scan_type") == "eye" and result.get("referable_dr"):
        return {"reason": "referable_dr", "value": result.get("referable_dr_probability")}
    return None
