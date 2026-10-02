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
  - SHAP: explainer.shap_values(scaled)[0], all 8 factors sorted by |value|
    (top 3 shown first), waterfall PNG labelled with the entered values
"""

import io
import threading
from functools import lru_cache
from pathlib import Path
from typing import Optional

import joblib
import matplotlib
import numpy as np
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

FEATURE_LABELS = {
    "gender": "Gender",
    "age": "Age",
    "hypertension": "Hypertension",
    "heart_disease": "Heart disease",
    "smoking_history": "Smoking",
    "bmi": "BMI",
    "HbA1c_level": "HbA1c",
    "blood_glucose_level": "Blood glucose",
}

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


def decision_threshold() -> float:
    """Decision threshold of the installed model (xgb_threshold.pkl)."""
    return _load()[2]


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


def format_pct(prob: float) -> str:
    """12.3% — never a bare "0.0%" / "100.0%" for a non-zero / non-one score."""
    if 0 < prob < 0.001:
        return "<0.1%"
    if 0.999 < prob < 1:
        return ">99.9%"
    return f"{prob * 100:.1f}%"


def _display_values(raw: dict) -> list[str]:
    """What the clinician entered, in FEATURES order — shown on the SHAP
    waterfall instead of the scaler's z-scores (which mean nothing to a
    reader). The SHAP values themselves are unchanged."""
    yes_no = lambda v: "yes" if v else "no"  # noqa: E731
    return [
        str(raw["gender"]).lower(),
        f"{float(raw['age']):g} y",
        yes_no(raw.get("hypertension")),
        yes_no(raw.get("heart_disease")),
        str(raw.get("smoking_history", "never")),
        f"{float(raw['bmi']):g}",
        f"{float(raw['HbA1c_level']):g} %",
        f"{float(raw['blood_glucose_level']):g} mg/dL",
    ]


# pyplot keeps global state and FastAPI runs sync endpoints on a thread
# pool: two predictions drawing at once would mix their figures.
_PLOT_LOCK = threading.Lock()


def _waterfall_png(shap_vals, explainer, display: list[str], title: str) -> bytes:
    """SHAP waterfall like the notebook plots (results/shap_patient_*.png),
    labelled with the entered values and readable feature names."""
    with _PLOT_LOCK:
        plt.figure(figsize=(10, 5))
        shap.waterfall_plot(
            shap.Explanation(
                values=shap_vals,
                base_values=explainer.expected_value,
                data=np.array(display, dtype=object),
                feature_names=[FEATURE_LABELS[f] for f in FEATURES],
            ),
            show=False,
        )
        plt.title(title, fontsize=11, fontweight="bold", pad=20)
        plt.tight_layout()
        buf = io.BytesIO()
        plt.savefig(buf, format="png", dpi=150, bbox_inches="tight")
        plt.close("all")
    return buf.getvalue()


def clinical_values(raw: dict) -> list[dict]:
    """Entered values with a status for the report: "normal", "elevated"
    (borderline / risk factor present) or "high" (diabetes range).
    Ranges: ADA Standards of Care — HbA1c 5.7-6.4 % prediabetes, ≥ 6.5 %
    diabetes; glucose 100-125 mg/dL prediabetes (fasting), ≥ 126 diabetes;
    BMI 25-29.9 overweight, ≥ 30 obesity."""
    hba1c = float(raw["HbA1c_level"])
    glucose = float(raw["blood_glucose_level"])
    bmi = float(raw["bmi"])
    smoking = str(raw.get("smoking_history", "never"))

    def band(value: float, elevated: float, high: float) -> str:
        return "high" if value >= high else "elevated" if value >= elevated else "normal"

    return [
        {"key": "age", "value": float(raw["age"]), "unit": "years", "status": "normal"},
        {"key": "gender", "value": str(raw["gender"]).lower(), "unit": None, "status": "normal"},
        {"key": "HbA1c_level", "value": hba1c, "unit": "%", "status": band(hba1c, 5.7, 6.5)},
        {"key": "blood_glucose_level", "value": glucose, "unit": "mg/dL",
         "status": band(glucose, 100, 126)},
        {"key": "bmi", "value": bmi, "unit": "kg/m²",
         "status": "elevated" if bmi < 18.5 else band(bmi, 25, 30)},
        {"key": "hypertension", "value": bool(raw.get("hypertension")), "unit": None,
         "status": "elevated" if raw.get("hypertension") else "normal"},
        {"key": "heart_disease", "value": bool(raw.get("heart_disease")), "unit": None,
         "status": "elevated" if raw.get("heart_disease") else "normal"},
        {"key": "smoking_history", "value": smoking, "unit": None,
         "status": "elevated" if smoking.lower() == "current" else "normal"},
    ]


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
    factors = [
        {
            "feature": f,
            "value": round(float(v), 4),
            "direction": "↑ risk" if float(v) > 0 else "↓ risk",
        }
        for f, v in sorted(feature_impact.items(), key=lambda x: abs(x[1]), reverse=True)
    ]

    result_label = "🔴 Diabetic" if prediction == 1 else "🟢 Non-Diabetic"
    # matplotlib's font has no emoji glyphs (they rendered as boxes)
    title = (
        f"{'Diabetic' if prediction == 1 else 'Non-Diabetic'} | "
        f"Score: {format_pct(prob)} | Tier: {tier.replace('⚠️', '').strip()}"
    )
    png = _waterfall_png(shap_vals, explainer, _display_values(data), title)

    return {
        "probability": prob,
        "prediction": prediction,
        "result_label": result_label,
        "risk_tier": tier,
        "threshold": threshold,
        "top_factors": factors[:3],
        "factors": factors,  # all 8, by impact — stored in predictions.top_factors
        "waterfall_png": png,
    }
