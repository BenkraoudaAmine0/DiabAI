"""Upload DiabAI models to private Hugging Face model repository."""

import os
from pathlib import Path
from huggingface_hub import HfApi
from dotenv import load_dotenv

load_dotenv()

REPO_ID = os.getenv("HF_MODEL_REPO_ID")
UPLOAD_TOKEN = os.getenv("HF_TOKEN")

BACKEND_DIR = Path(__file__).resolve().parents[1]
MODELS_APP = BACKEND_DIR / "models_app"

FILES_TO_UPLOAD = [
    ("foot/Diabetic_Foot_UIcer1.h5", MODELS_APP / "foot" / "Diabetic_Foot_UIcer1.h5"),
    ("eye/Resnet50_bestqwk.h5", MODELS_APP / "eye" / "Resnet50_bestqwk.h5"),
    ("diabetes/xgb_diabetes.pkl", MODELS_APP / "diabetes" / "xgb_diabetes.pkl"),
    ("diabetes/scaler.pkl", MODELS_APP / "diabetes" / "scaler.pkl"),
    ("diabetes/xgb_threshold.pkl", MODELS_APP / "diabetes" / "xgb_threshold.pkl"),
    ("diabetes/shap_explainer.pkl", MODELS_APP / "diabetes" / "shap_explainer.pkl"),
]


def main():
    api = HfApi(token=UPLOAD_TOKEN)
    print(f"Creating / ensuring private model repo: {REPO_ID} ...")
    api.create_repo(
        repo_id=REPO_ID,
        repo_type="model",
        private=True,
        exist_ok=True,
    )
    print("Repo ready.")

    for path_in_repo, local_path in FILES_TO_UPLOAD:
        if not local_path.exists():
            print(f"[SKIP] {local_path} not found on disk.")
            continue
        size_mb = local_path.stat().st_size / (1024 * 1024)
        print(f"Uploading {local_path.name} ({size_mb:.1f} MB) -> {path_in_repo} ...")
        api.upload_file(
            path_or_fileobj=str(local_path),
            path_in_repo=path_in_repo,
            repo_id=REPO_ID,
            repo_type="model",
        )
        print(f"Uploaded {path_in_repo} successfully.")

    print("\nAll model files uploaded to Hugging Face successfully!")


if __name__ == "__main__":
    main()
