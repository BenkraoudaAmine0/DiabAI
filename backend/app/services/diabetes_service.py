"""Diabetes prediction service.

Replicates models/test_model.ipynb EXACTLY:
  - features & order = scaler.feature_names_in_
  - encodings verified from the training pipeline (model.ipynb LabelEncoder):
      gender:        Female -> 0, Male -> 1
      smoking_history (after recategorization): current -> 0, non-smoker -> 1,
      past_smoker -> 2  (raw: never|No Info -> non-smoker; ever|former|not
      current -> past_smoker)
    NOTE: the comments inside test_model.ipynb claim different mappings — they
    are wrong; these are the ones the LabelEncoder actually learned.
  - prob = model.predict_proba(scaled)[0][1]; prediction = int(prob >= 0.395)
  - get_risk_tier: Prediabetic override FIRST, then probability tiers
  - SHAP: explainer.shap_values(scaled)[0], top-3 by |value|, waterfall PNG
"""

import io
from functools import lru_cache
from pathlib import Path
from typing import Optional

import joblib
import matplotlib
import pandas as pd

matplotlib.use("Agg")  # headless
import matplotlib.pyplot as plt  # noqa: E402
import shap  # noqa: E402

MODELS_DIR = Path(__file__).resolve().parents[2] / "models_app"
DIABETES_DIR = MODELS_DIR / "diabetes"

FEATURES = [
    "gender",
    "age",
    "hypertension",
    "heart_disease",
    "smoking_history",
    "bmi",
    "HbA1c_level",
    "blood_glucose_level",
]

GENDER_MAP = {"female": 0, "male": 1}

# raw form value -> encoded int (see module docstring)
SMOKING_MAP = {
    "never": 1,        # non-smoker
    "no info": 1,      # non-smoker
    "current": 0,      # current
    "ever": 2,         # past_smoker
    "former": 2,       # past_smoker
    "not current": 2,  # past_smoker
}

REQUIRED_FILES = [
    "xgb_diabetes.pkl",
    "scaler.pkl",
    "xgb_threshold.pkl",
    "shap_explainer.pkl",
]


class DiabetesModelNotInstalled(RuntimeError):
    def __init__(self):
        super().__init__(
            "Diabetes model artifacts are missing. Expected "
            + ", ".join(REQUIRED_FILES)
            + f" inside {DIABETES_DIR}"
        )


@lru_cache
def _load():
    missing = [f for f in REQUIRED_FILES if not (DIABETES_DIR / f).exists()]
    if missing:
        raise DiabetesModelNotInstalled()
    model = joblib.load(DIABETES_DIR / "xgb_diabetes.pkl")
    scaler = joblib.load(DIABETES_DIR / "scaler.pkl")
    threshold = joblib.load(DIABETES_DIR / "xgb_threshold.pkl")
    explainer = joblib.load(DIABETES_DIR / "shap_explainer.pkl")
    return model, scaler, float(threshold), explainer


def get_risk_tier(
    prob: float, hba1c: Optional[float] = None, glucose: Optional[float] = None
) -> str:
    """Verbatim from test_model.ipynb — the Prediabetic override runs FIRST
    because the model only outputs 2 classes (positive / negative)."""
    if hba1c is not None and glucose is not None:
        if 5.7 <= hba1c < 6.5 and 100 <= glucose < 126:
            return "Prediabetic ⚠️"
    if prob < 0.3:
        return "Low"
    elif prob < 0.5:
        return "Moderate"
    elif prob < 0.75:
        return "High"
    return "Critical"


def _waterfall_png(
    shap_vals, scaled, explainer, title: str, out: Path = None
) -> bytes:
    """SHAP waterfall identical to the notebook plots (results/shap_patient_*.png)."""
    plt.figure(figsize=(10, 5))
    shap.waterfall_plot(
        shap.Explanation(
            values=shap_vals,
            base_values=explainer.expected_value,
            data=scaled[0],
            feature_names=FEATURES,
        ),
        show=False,
    )
    plt.title(title, fontsize=11, fontweight="bold", pad=20)
    plt.tight_layout()
    buf = io.BytesIO()
    plt.savefig(buf, format="png", dpi=150, bbox_inches="tight")
    plt.close()
    png = buf.getvalue()
    if out is not None:
        out.write_bytes(png)
    return png


def predict(data: dict) -> dict:
    """data: raw request dict (gender 'male'/'female', smoking raw string...)."""
    model, scaler, threshold, explainer = _load()

    row = {
        "gender": GENDER_MAP[data["gender"].strip().lower()],
        "age": float(data["age"]),
        "hypertension": int(bool(data.get("hypertension"))),
        "heart_disease": int(bool(data.get("heart_disease"))),
        "smoking_history": SMOKING_MAP[
            str(data.get("smoking_history", "never")).strip().lower()
        ],
        "bmi": float(data["bmi"]),
        "HbA1c_level": float(data["HbA1c_level"]),
        "blood_glucose_level": float(data["blood_glucose_level"]),
    }

    df = pd.DataFrame([row])[FEATURES]
    scaled = scaler.transform(df)

    prob = float(model.predict_proba(scaled)[0][1])
    prediction = int(prob >= threshold)

    tier = get_risk_tier(
        prob,
        hba1c=row["HbA1c_level"],
        glucose=row["blood_glucose_level"],
    )

    shap_vals = explainer.shap_values(scaled)[0]
    feature_impact = dict(zip(FEATURES, shap_vals))
    top_factors = sorted(
        feature_impact.items(), key=lambda x: abs(x[1]), reverse=True
    )[:3]

    result_label = "🔴 Diabetic" if prediction == 1 else "🟢 Non-Diabetic"
    title = f"{result_label} | Score: {prob * 100:.1f}% | Tier: {tier}"
    png = _waterfall_png(shap_vals, scaled, explainer, title)

    return {
        "probability": prob,
        "prediction": prediction,
        "result_label": result_label,
        "risk_tier": tier,
        "top_factors": [
            {
                "feature": f,
                "value": round(float(v), 4),
                "direction": "↑ risk" if float(v) > 0 else "↓ risk",
            }
            for f, v in top_factors
        ],
        "waterfall_png": png,
    }
