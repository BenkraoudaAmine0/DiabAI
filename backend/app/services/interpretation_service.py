"""Clinical interpretation of a diabetes prediction, written by Gemini.

One LCEL chain (prompt | GEMINI_MODEL | StrOutputParser) turns the entered
values, the model output and the SHAP factors into the short paragraph shown
as "Clinical interpretation" on the report and in the PDF. Reference ranges
are given in the prompt, so the model compares numbers instead of recalling
them. The text is decision support for the physician, never a diagnosis —
the doctor still confirms or rejects the prediction.
"""

from functools import lru_cache
from typing import Optional

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

from app.services.diabetes_service import FEATURE_LABELS, format_pct
from app.services.gemini_service import chat_model
from app.services.usage_service import GeminiUsageCallback

LANGUAGES = {"en": "English", "fr": "French"}

SYSTEM_PROMPT = (
    "You write the 'clinical interpretation' section of a diabetes risk "
    "report for the treating physician. The risk score comes from an XGBoost "
    "model trained on 8 variables; SHAP values show how much each variable "
    "pushed the score toward diabetes (positive) or away from it (negative).\n"
    "Rules:\n"
    "1. One paragraph of 4 to 6 sentences, plain text: no Markdown, no lists, "
    "no title, no greeting.\n"
    "2. Use only the data given. Compare the measurements with the reference "
    "ranges below and name the abnormal ones with their values.\n"
    "3. Say which factors drove the model's score, in clinical terms.\n"
    "4. Never state a definitive diagnosis: the result is indicative and must "
    "be validated by the physician. Suggest the appropriate confirmation or "
    "follow-up (e.g. repeat HbA1c, fasting plasma glucose, oral glucose "
    "tolerance test) and, when relevant, lifestyle measures.\n"
    "5. The glucose value is a single blood glucose measurement: do not "
    "assume it was taken fasting.\n"
    "6. If the risk tier and the probability seem to disagree (e.g. a "
    "'Prediabetic' tier with a low probability), explain why: the tier "
    "applies a prediabetes rule on HbA1c and glucose before the probability.\n"
    "7. Write in {language}.\n\n"
    "Reference ranges (ADA Standards of Care): HbA1c < 5.7 % normal, "
    "5.7-6.4 % prediabetes, >= 6.5 % diabetes range. Fasting plasma glucose "
    "< 100 mg/dL normal, 100-125 prediabetes, >= 126 diabetes range; a random "
    "glucose >= 200 mg/dL with symptoms suggests diabetes. BMI 18.5-24.9 "
    "normal, 25-29.9 overweight, >= 30 obesity. Hypertension, heart disease, "
    "current smoking and age >= 45 are risk factors."
)

HUMAN_PROMPT = (
    "Patient: {sex}, {age} years.\n"
    "Measurements: HbA1c {hba1c} %, blood glucose {glucose} mg/dL, "
    "BMI {bmi} kg/m².\n"
    "History: hypertension {hypertension}, heart disease {heart_disease}, "
    "smoking {smoking}.\n"
    "Model output: probability of diabetes {probability} (decision threshold "
    "{threshold}) → {label}; risk tier: {tier}.\n"
    "SHAP factors, strongest first: {factors}.\n\n"
    "Clinical interpretation:"
)


@lru_cache
def _chain():
    prompt = ChatPromptTemplate.from_messages(
        [("system", SYSTEM_PROMPT), ("human", HUMAN_PROMPT)]
    )
    return prompt | chat_model(0.2, 2048) | StrOutputParser()


def interpret(
    record: dict,
    threshold: float,
    lang: str = "en",
    user_id: Optional[str] = None,
) -> str:
    """record: a predictions row (input, probability, prediction, risk_tier,
    top_factors). Returns the paragraph; raises on an empty answer."""
    inp = record.get("input") or {}
    yes_no = lambda v: "yes" if v else "no"  # noqa: E731
    factors = ", ".join(
        f"{FEATURE_LABELS.get(f['feature'], f['feature'])} {float(f['value']):+.2f}"
        for f in (record.get("top_factors") or [])
    )
    handler = GeminiUsageCallback(
        user_id=user_id, detail={"purpose": "interpretation", "prediction_id": record.get("id")}
    )
    text = _chain().invoke(
        {
            "language": LANGUAGES.get(lang, "English"),
            "sex": inp.get("gender", "unknown"),
            "age": f"{float(inp.get('age', 0)):g}",
            "hba1c": f"{float(inp.get('HbA1c_level', 0)):g}",
            "glucose": f"{float(inp.get('blood_glucose_level', 0)):g}",
            "bmi": f"{float(inp.get('bmi', 0)):g}",
            "hypertension": yes_no(inp.get("hypertension")),
            "heart_disease": yes_no(inp.get("heart_disease")),
            "smoking": inp.get("smoking_history", "never"),
            "probability": format_pct(float(record.get("probability") or 0)),
            "threshold": format_pct(threshold),
            "label": "diabetic" if record.get("prediction") == 1 else "non-diabetic",
            "tier": str(record.get("risk_tier", "")).replace("⚠️", "").strip(),
            "factors": factors or "not available",
        },
        config={"callbacks": [handler]},
    ).strip()
    if not text:
        raise RuntimeError("Gemini returned an empty interpretation")
    return text
