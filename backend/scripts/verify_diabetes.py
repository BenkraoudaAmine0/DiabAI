"""Verify diabetes_service against the 8 scenarios in models/test_model.ipynb.

Expected outputs (from the notebook's stored cell output):
  P1 Healthy          0.0%   Low          🟢 Non-Diabetic
  P2 Healthy          ~0-1%  Low          🟢 Non-Diabetic
  P3 Diabetic         high   Critical/High 🔴 Diabetic
  P4 Diabetic         high   Critical/High 🔴 Diabetic
  P5 Prediabetic      ~0.1%  Prediabetic ⚠️ 🟢 Non-Diabetic
  P6 Prediabetic      low    Prediabetic ⚠️ 🟢 Non-Diabetic
  P7 Moderate tier    mid    Moderate      🔴/🟢
  P8 High tier        mid+   High          🔴
Run from backend/:  python scripts/verify_diabetes.py
"""

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.services import diabetes_service as ds  # noqa: E402

# raw form values — the service applies the REAL training encodings
# (gender: Female->0/Male->1 ; smoking: current->0, never|No Info->1, ever|former|not current->2)
scenarios = [
    dict(name="P1 Healthy",          gender="male",   age=25, hypertension=False, heart_disease=False, smoking_history="never",  bmi=22.0, HbA1c_level=4.8, blood_glucose_level=90),
    dict(name="P2 Healthy",          gender="female", age=30, hypertension=False, heart_disease=False, smoking_history="No Info", bmi=23.5, HbA1c_level=5.0, blood_glucose_level=95),
    dict(name="P3 Diabetic",         gender="female", age=52, hypertension=True,  heart_disease=False, smoking_history="current", bmi=31.5, HbA1c_level=8.2, blood_glucose_level=186),
    dict(name="P4 Diabetic",         gender="male",   age=58, hypertension=True,  heart_disease=True,  smoking_history="former",  bmi=33.0, HbA1c_level=9.1, blood_glucose_level=220),
    dict(name="P5 Prediabetic",      gender="male",   age=45, hypertension=False, heart_disease=False, smoking_history="current", bmi=28.0, HbA1c_level=6.0, blood_glucose_level=112),
    dict(name="P6 Prediabetic",      gender="female", age=49, hypertension=False, heart_disease=False, smoking_history="never",   bmi=27.0, HbA1c_level=5.8, blood_glucose_level=108),
    dict(name="P7 Moderate tier",    gender="female", age=44, hypertension=False, heart_disease=False, smoking_history="former",  bmi=27.8, HbA1c_level=6.8, blood_glucose_level=145),
    dict(name="P8 High tier",        gender="male",   age=50, hypertension=True,  heart_disease=False, smoking_history="former",  bmi=30.2, HbA1c_level=6.9, blood_glucose_level=150),
]

print("=" * 78)
print(f"{'Scenario':<22} {'Score':>8}  {'Tier':<16} {'Result'}")
print("=" * 78)
for s in scenarios:
    name = s.pop("name")
    r = ds.predict(s)
    print(f"{name:<22} {r['probability']*100:>7.1f}%  {r['risk_tier']:<16} {r['result_label']}")
    top = ", ".join(f"{t['feature']} {t['value']:+.3f} {t['direction']}" for t in r["top_factors"])
    print(f"{'':<22} top: {top}")
    print(f"{'':<22} waterfall PNG: {len(r['waterfall_png'])} bytes")
    s["name"] = name
print("=" * 78)

# unit-check the tier function verbatim from the notebook
assert ds.get_risk_tier(0.10, 6.0, 112) == "Prediabetic ⚠️"
assert ds.get_risk_tier(0.10, 5.8, 108) == "Prediabetic ⚠️"
assert ds.get_risk_tier(0.10) == "Low"
assert ds.get_risk_tier(0.40) == "Moderate"
assert ds.get_risk_tier(0.60) == "High"
assert ds.get_risk_tier(0.90) == "Critical"
assert ds.get_risk_tier(0.10, 8.0, 112) == "Low"          # hba1c out of range
assert ds.get_risk_tier(0.10, 6.0, 130) == "Low"          # glucose out of range
print("get_risk_tier assertions: OK")
