"""Vision models (foot / neck / eye) — drop-in multi-format loader.

Drop a model file into models_app/<scan_type>/ named exactly `model.<ext>`:
    model.onnx  (onnxruntime — installed by default)
    model.h5 / model.keras  (TensorFlow/Keras — pip install tensorflow-cpu)
    model.pt / model.pth    (PyTorch — export as TorchScript; pip install torch)

Optional labels.json next to the model:
    {"labels": ["no_ulcer", "ulcer"], "image_size": 224}
Class order must match the model's output index order.
"""

import io
import json
from functools import lru_cache
from pathlib import Path
from typing import Callable

import numpy as np
from PIL import Image

MODELS_DIR = Path(__file__).resolve().parents[2] / "models_app"
SCAN_TYPES = ("foot", "neck", "eye")

SUPPORTED_EXTS = [".onnx", ".h5", ".keras", ".pt", ".pth"]

DEFAULT_LABELS = {
    "foot": ["no_ulcer", "ulcer"],
    "neck": ["normal", "acanthosis_nigricans"],
    "eye": ["No DR", "Mild", "Moderate", "Severe", "Proliferative DR"],
}
DEFAULT_IMAGE_SIZE = 224


class VisionModelNotInstalled(RuntimeError):
    def __init__(self, scan_type: str):
        folder = MODELS_DIR / scan_type
        super().__init__(
            f"The '{scan_type}' model is not installed yet. Add a file named "
            f"model.onnx / model.h5 / model.keras / model.pt / model.pth inside "
            f"{folder} (see {MODELS_DIR / 'README.md'})."
        )


def _find_model_file(scan_type: str) -> Path | None:
    folder = MODELS_DIR / scan_type
    if not folder.exists():
        return None
    for ext in SUPPORTED_EXTS:
        candidate = folder / f"model{ext}"
        if candidate.exists():
            return candidate
    return None


def _softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - np.max(x))
    return e / e.sum()


@lru_cache
def _load(scan_type: str) -> tuple[Callable[[np.ndarray], np.ndarray], list[str], int]:
    """Returns (predict_fn, labels, image_size). predict_fn receives a
    float32 HWC array in [0,1] and returns a 1-D probability vector."""
    model_file = _find_model_file(scan_type)
    if model_file is None:
        raise VisionModelNotInstalled(scan_type)

    labels = list(DEFAULT_LABELS[scan_type])
    image_size = DEFAULT_IMAGE_SIZE
    labels_file = model_file.parent / "labels.json"
    if labels_file.exists():
        cfg = json.loads(labels_file.read_text(encoding="utf-8"))
        if isinstance(cfg.get("labels"), list) and cfg["labels"]:
            labels = [str(x) for x in cfg["labels"]]
        if isinstance(cfg.get("image_size"), int):
            image_size = cfg["image_size"]

    ext = model_file.suffix.lower()
    if ext == ".onnx":
        return _load_onnx(model_file), labels, image_size
    if ext in (".h5", ".keras"):
        return _load_keras(model_file), labels, image_size
    if ext in (".pt", ".pth"):
        return _load_torch(model_file), labels, image_size
    raise RuntimeError(f"Unsupported model format: {model_file.name}")


def _load_onnx(path: Path) -> Callable[[np.ndarray], np.ndarray]:
    import onnxruntime as ort

    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    input_meta = session.get_inputs()[0]
    input_name = input_meta.name
    # NCHW when shape[1] == 3 (e.g. [None, 3, 224, 224])
    nchw = len(input_meta.shape) == 4 and input_meta.shape[1] == 3

    def predict_fn(arr: np.ndarray) -> np.ndarray:
        x = arr.transpose(2, 0, 1) if nchw else arr
        out = session.run(None, {input_name: x[None].astype(np.float32)})[0]
        return _softmax(np.asarray(out).ravel())

    return predict_fn


def _load_keras(path: Path) -> Callable[[np.ndarray], np.ndarray]:
    try:
        from tensorflow import keras
    except ImportError as exc:
        raise RuntimeError(
            "This model is a Keras file but TensorFlow is not installed. "
            "Run: pip install tensorflow-cpu"
        ) from exc

    model = keras.models.load_model(path)

    def predict_fn(arr: np.ndarray) -> np.ndarray:
        out = model.predict(arr[None], verbose=0)
        return _softmax(np.asarray(out).ravel())

    return predict_fn


def _load_torch(path: Path) -> Callable[[np.ndarray], np.ndarray]:
    try:
        import torch
    except ImportError as exc:
        raise RuntimeError(
            "This model is a PyTorch file but torch is not installed. "
            "Run: pip install torch"
        ) from exc

    loaded = torch.load(str(path), map_location="cpu", weights_only=False)
    if isinstance(loaded, dict):
        raise RuntimeError(
            f"{path.name} is a state_dict (weights only), not a full model. "
            "Re-export it with torch.jit.trace(model, example).save(...) "
            "or convert it to ONNX."
        )
    model = loaded.eval()

    def predict_fn(arr: np.ndarray) -> np.ndarray:
        tensor = torch.from_numpy(arr.transpose(2, 0, 1)[None].astype(np.float32))
        with torch.no_grad():
            out = model(tensor)
        out = np.asarray(out).ravel()
        return out / out.sum() if out.min() >= 0 else _softmax(out)

    return predict_fn


def _preprocess(img: Image.Image, size: int) -> np.ndarray:
    img = img.convert("RGB").resize((size, size), Image.BILINEAR)
    return np.asarray(img, dtype=np.float32) / 255.0


def predict(scan_type: str, image_bytes: bytes) -> dict:
    if scan_type not in SCAN_TYPES:
        raise ValueError(f"Unknown scan type: {scan_type}")
    predict_fn, labels, size = _load(scan_type)  # may raise NotInstalled

    img = Image.open(io.BytesIO(image_bytes))
    probs = predict_fn(_preprocess(img, size))

    n = min(len(labels), len(probs))
    probs = probs[:n]
    idx = int(np.argmax(probs))
    return {
        "label": labels[idx] if idx < n else str(idx),
        "confidence": round(float(probs[idx]), 4),
        "probabilities": {labels[i]: round(float(probs[i]), 4) for i in range(n)},
    }


def availability() -> dict[str, bool]:
    return {st: _find_model_file(st) is not None for st in SCAN_TYPES}
