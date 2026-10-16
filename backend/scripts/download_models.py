"""Download models from private Hugging Face repository if missing."""

import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
MODELS_APP = BACKEND_DIR / "models_app"

DEFAULT_REPO_ID = "BenkraoudaAmine/diabai-models"

# Remote path inside HuggingFace repo -> Local target path
# Vision models are now hosted on Hugging Face Space (BenkraoudaAmine/diabai-vision)
MODEL_FILES = {
    "diabetes/xgb_diabetes.pkl": MODELS_APP / "diabetes" / "xgb_diabetes.pkl",
    "diabetes/scaler.pkl": MODELS_APP / "diabetes" / "scaler.pkl",
    "diabetes/xgb_threshold.pkl": MODELS_APP / "diabetes" / "xgb_threshold.pkl",
    "diabetes/shap_explainer.pkl": MODELS_APP / "diabetes" / "shap_explainer.pkl",
}


def ensure_models(token: str | None = None, repo_id: str | None = None) -> bool:
    """Download any missing models from Hugging Face Hub.
    Returns True if all models are present or downloaded, False otherwise.
    """
    token = token or os.getenv("HF_TOKEN")
    repo_id = repo_id or os.getenv("HF_MODEL_REPO_ID", DEFAULT_REPO_ID)

    # Remove legacy heavy .h5 files that cause OOM on 512MB RAM servers
    for legacy in [MODELS_APP / "foot" / "Diabetic_Foot_UIcer1.h5", MODELS_APP / "eye" / "Resnet50_bestqwk.h5"]:
        if legacy.exists():
            try:
                legacy.unlink()
                print(f"[models] Removed legacy {legacy.name} to avoid memory crash.")
            except Exception:
                pass

    missing = [
        (repo_path, local_path)
        for repo_path, local_path in MODEL_FILES.items()
        if not local_path.exists() or local_path.stat().st_size == 0
    ]

    if not missing:
        print("[models] All required models are present locally.")
        return True

    print(f"[models] {len(missing)} model file(s) missing. Fetching from {repo_id}...")

    try:
        from huggingface_hub import hf_hub_download
    except ImportError:
        print("[models] ERROR: huggingface_hub not installed. Cannot download models.")
        return False

    all_success = True
    for repo_path, local_path in missing:
        local_path.parent.mkdir(parents=True, exist_ok=True)
        print(f"[models] Downloading {repo_path} -> {local_path.name}...")
        try:
            downloaded = hf_hub_download(
                repo_id=repo_id,
                filename=repo_path,
                token=token,
                local_dir=str(MODELS_APP),
            )
            print(f"[models] Successfully downloaded {repo_path}")
        except Exception as exc:
            print(f"[models] FAILED to download {repo_path}: {exc}")
            all_success = False

    return all_success


if __name__ == "__main__":
    success = ensure_models()
    sys.exit(0 if success else 1)
