"""Vision models (foot / neck / eye) — drop-in loader with per-scan configs.

Preprocessing and output handling mirror each model's TRAINING pipeline
(verified against the training notebooks):

  foot  DFU ResNet50 .h5   RGB (cv2 BGR->RGB), 224x224 bilinear, RAW 0-255
                           (no rescale — image_dataset_from_directory yields
                           unscaled float32), 2x sigmoid outputs normalized
                           by sum, "uncertain" when confidence < 0.80
  eye   APTOS ResNet50 .h5 BGR exactly as cv2.imread produced it (training
                           never converted), 300x300 bilinear, /255,
                           5x softmax, "uncertain" < 0.50, referable DR =
                           sum(probs[Moderate..]) >= 0.50
  neck  (no model yet)     generic default: RGB, 224x224, /255, softmax

Drop a model file into models_app/<scan_type>/ — named `model.<ext>` OR with
its original filename (e.g. Resnet50_bestqwk.h5):
    model.onnx  (onnxruntime — installed by default)
    model.h5 / model.keras  (TensorFlow/Keras — pip install tensorflow-cpu)
    model.pt / model.pth    (PyTorch TorchScript — pip install torch)

Optional labels.json next to the model overrides any config key:
    {"labels": [...], "size": 300, "color": "bgr|rgb", "scale": "0-1|raw",
     "output": "softmax|sigmoid2", "uncertain": 0.5,
     "referable_from_index": 2, "referable_threshold": 0.5}
"""

import io
import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable

import cv2
import numpy as np

MODELS_DIR = Path(__file__).resolve().parents[2] / "models_app"
SCAN_TYPES = ("foot", "neck", "eye")

SUPPORTED_EXTS = [".onnx", ".h5", ".keras", ".pt", ".pth"]

DISCLAIMER = (
    "Screening support only, not a medical diagnosis. "
    "A clinician must confirm any result."
)

# training-verified defaults per scan type (labels.json can override)
SCAN_CONFIGS: dict[str, dict[str, Any]] = {
    "foot": {
        "size": 224,
        "color": "rgb",
        "scale": "raw",
        "output": "sigmoid2",
        "uncertain": 0.80,
        "labels": ["Abnormal(Ulcer)", "Normal(Healthy skin)"],
    },
    "neck": {
        "size": 224,
        "color": "rgb",
        "scale": "0-1",
        "output": "softmax",
        "uncertain": None,
        "labels": ["normal", "acanthosis_nigricans"],
    },
    "eye": {
        "size": 300,
        "color": "bgr",
        "scale": "0-1",
        "output": "softmax",
        "uncertain": 0.50,
        "referable_from_index": 2,
        "referable_threshold": 0.50,
        "labels": ["No DR", "Mild", "Moderate", "Severe", "Proliferative DR"],
    },
}


class VisionModelNotInstalled(RuntimeError):
    def __init__(self, scan_type: str):
        folder = MODELS_DIR / scan_type
        super().__init__(
            f"The '{scan_type}' model is not installed yet. Add a model file "
            f"(model.onnx / model.h5 / model.keras / model.pt / model.pth) "
            f"inside {folder} (see {MODELS_DIR / 'README.md'})."
        )


# ── model file discovery ─────────────────────────────────────────────────────

def _find_model_file(scan_type: str) -> Path | None:
    folder = MODELS_DIR / scan_type
    if not folder.exists():
        return None
    # 1. Exact model.onnx first
    onnx_file = folder / "model.onnx"
    if onnx_file.exists():
        return onnx_file
    # 2. Any other .onnx in the folder
    for f in sorted(folder.iterdir()):
        if f.is_file() and f.suffix.lower() == ".onnx":
            return f
    # 3. Fallback to other extensions only if no ONNX is found
    for ext in SUPPORTED_EXTS:
        candidate = folder / f"model{ext}"
        if candidate.exists():
            return candidate
    for f in sorted(folder.iterdir()):
        if f.is_file() and f.suffix.lower() in SUPPORTED_EXTS:
            return f
    return None


def availability() -> dict[str, bool]:
    return {st: _find_model_file(st) is not None for st in SCAN_TYPES}


# ── config ───────────────────────────────────────────────────────────────────

def _load_config(scan_type: str, model_file: Path) -> dict[str, Any]:
    cfg = dict(SCAN_CONFIGS[scan_type])
    labels_file = model_file.parent / "labels.json"
    if labels_file.exists():
        overrides = json.loads(labels_file.read_text(encoding="utf-8"))
        for key in cfg:
            if key in overrides:
                cfg[key] = overrides[key]
        if isinstance(overrides.get("image_size"), int):  # legacy key
            cfg["size"] = overrides["image_size"]
    if "referable_from_index" in cfg and "referable_threshold" not in cfg:
        cfg["referable_threshold"] = 0.50
    return cfg


# ── preprocessing (cv2, faithful to the training pipelines) ─────────────────

def _preprocess(raw_bytes: bytes, cfg: dict[str, Any]) -> np.ndarray:
    img = cv2.imdecode(np.frombuffer(raw_bytes, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Invalid or corrupted image file.")
    if cfg["color"] == "rgb":
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = cv2.resize(img, (cfg["size"], cfg["size"]), interpolation=cv2.INTER_LINEAR)
    arr = img.astype("float32")
    if cfg["scale"] == "0-1":
        arr /= 255.0
    return arr  # HWC float32


# ── output post-processing ───────────────────────────────────────────────────

def _postprocess(raw: np.ndarray, cfg: dict[str, Any]) -> np.ndarray:
    v = np.asarray(raw, dtype=np.float64).ravel()
    if cfg["output"] == "sigmoid2":
        # 2 independent sigmoid units (foot model) — normalize to sum to 1
        return v / max(float(v.sum()), 1e-8)
    # softmax expected; normalize only if the model emitted something else
    if v.min() < 0 or not np.isclose(v.sum(), 1.0, atol=1e-3):
        e = np.exp(v - v.max())
        return e / e.sum()
    return v


# ── loaders ──────────────────────────────────────────────────────────────────

def _build_aptos_resnet50() -> Any:
    """Exact APTOS architecture (weights=None) for legacy .h5 load fallback."""
    from tensorflow.keras import Model
    from tensorflow.keras import layers as L
    from tensorflow.keras.applications import ResNet50

    size = SCAN_CONFIGS["eye"]["size"]
    inp = L.Input(shape=(size, size, 3))
    base = ResNet50(include_top=False, weights=None, input_tensor=inp)
    x = L.GlobalAveragePooling2D()(base.output)
    x = L.Dropout(0.5)(x)
    x = L.Dense(1024, activation="relu")(x)
    x = L.Dropout(0.5)(x)
    out = L.Dense(5, activation="softmax", name="final_output")(x)
    return Model(inp, out)


def _build_dfu_resnet50() -> Any:
    """Exact DFU architecture (weights=None) for legacy .h5 load fallback."""
    from tensorflow.keras import Model, Sequential
    from tensorflow.keras import layers as L
    from tensorflow.keras.applications import ResNet50

    size = SCAN_CONFIGS["foot"]["size"]
    inp = L.Input(shape=(size, size, 3))
    aug = Sequential(
        [
            L.RandomRotation(factor=0.15),
            L.RandomTranslation(height_factor=0.1, width_factor=0.1),
            L.RandomFlip(),
            L.GaussianNoise(stddev=0.09),
            L.RandomContrast(factor=0.1),
        ],
        name="img_augmentation",
    )
    x = aug(inp)
    base = ResNet50(include_top=False, weights=None, input_tensor=x)
    x = L.GlobalAveragePooling2D(name="avg_pool")(base.output)
    x = L.BatchNormalization()(x)
    x = L.Dropout(0.4, name="top_dropout")(x)
    out = L.Dense(2, activation="sigmoid", name="pred")(x)
    return Model(inp, out)


_FALLBACK_BUILDERS = {"eye": _build_aptos_resnet50, "foot": _build_dfu_resnet50}


def _load_keras(path: Path, scan_type: str) -> Callable[[np.ndarray], np.ndarray]:
    try:
        from tensorflow import keras
    except ImportError as exc:
        raise RuntimeError(
            "This model is a Keras file but TensorFlow is not installed. "
            "Run: pip install tensorflow-cpu"
        ) from exc

    try:
        model = keras.models.load_model(path, compile=False)
    except Exception as exc:
        # old Keras-2 .h5 files (e.g. APTOS Resnet50_bestqwk.h5 saved with the
        # custom AdamAccumulate optimizer) can fail in modern Keras — rebuild
        # the training architecture and load the weights into it
        builder = _FALLBACK_BUILDERS.get(scan_type)
        if builder is None:
            raise RuntimeError(f"Failed to load {path.name}: {exc}") from exc
        model = builder()
        model.load_weights(path)

    def predict_fn(arr: np.ndarray) -> np.ndarray:
        return np.asarray(model(arr[None], training=False)).ravel()

    return predict_fn


def _load_onnx(path: Path) -> Callable[[np.ndarray], np.ndarray]:
    import onnxruntime as ort

    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    meta = session.get_inputs()[0]
    input_name = meta.name
    nchw = len(meta.shape) == 4 and meta.shape[1] == 3  # [None, 3, H, W]

    def predict_fn(arr: np.ndarray) -> np.ndarray:
        x = arr.transpose(2, 0, 1) if nchw else arr
        out = session.run(None, {input_name: x[None].astype(np.float32)})[0]
        return np.asarray(out).ravel()

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
        return np.asarray(out).ravel()

    return predict_fn


@lru_cache
def _load(scan_type: str) -> tuple[Callable[[np.ndarray], np.ndarray], dict[str, Any]]:
    """Returns (predict_fn(HWC float32 array) -> raw outputs, config)."""
    model_file = _find_model_file(scan_type)
    if model_file is None:
        raise VisionModelNotInstalled(scan_type)

    cfg = _load_config(scan_type, model_file)
    ext = model_file.suffix.lower()

    if ext == ".onnx":
        return _load_onnx(model_file), cfg
    if ext in (".h5", ".keras"):
        return _load_keras(model_file, scan_type), cfg
    if ext in (".pt", ".pth"):
        return _load_torch(model_file), cfg
    raise RuntimeError(f"Unsupported model format: {model_file.name}")


# ── public API ───────────────────────────────────────────────────────────────

def predict(scan_type: str, image_bytes: bytes) -> dict:
    if scan_type not in SCAN_TYPES:
        raise ValueError(f"Unknown scan type: {scan_type}")
    predict_fn, cfg = _load(scan_type)  # may raise NotInstalled

    try:
        raw = predict_fn(_preprocess(image_bytes, cfg))
    except ValueError:
        raise
    except RuntimeError as exc:  # loader issue (missing TF/torch, bad export…)
        raise RuntimeError(str(exc)) from exc
    except Exception as exc:
        raise RuntimeError(f"Inference failed: {exc}") from exc

    probs = _postprocess(raw, cfg)
    labels = [str(x) for x in cfg["labels"]]
    n = min(len(labels), len(probs))
    idx = int(np.argmax(probs[:n]))

    conf = float(probs[idx])
    uncertain = cfg["uncertain"] is not None and conf < float(cfg["uncertain"])
    top_class = labels[idx] if idx < n else str(idx)

    result: dict[str, Any] = {
        "label": "uncertain" if uncertain else top_class,
        "top_class": top_class,
        "uncertain": bool(uncertain),
        "confidence": round(conf, 4),
        "probabilities": {
            labels[i]: round(float(probs[i]), 4) for i in range(n)
        },
        "disclaimer": DISCLAIMER,
    }

    if "referable_from_index" in cfg:  # eye: Moderate DR or worse is referable
        start = int(cfg["referable_from_index"])
        referable_p = float(np.sum(probs[start:n]))
        result["referable_dr_probability"] = round(referable_p, 4)
        result["referable_dr"] = bool(
            referable_p >= float(cfg["referable_threshold"])
        )

    return result
