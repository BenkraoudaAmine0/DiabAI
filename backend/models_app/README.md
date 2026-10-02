# models_app — drop your trained models here

This folder holds the trained models DiabAI serves. Add files manually —
they are git-ignored (see the root `.gitignore`).

```
models_app/
├── diabetes/   ← already populated (copied from ../../models)
│   ├── xgb_diabetes.pkl      trained XGBClassifier
│   ├── scaler.pkl            fitted StandardScaler
│   ├── xgb_threshold.pkl     optimal threshold (0.395)
│   └── shap_explainer.pkl    SHAP TreeExplainer
├── foot/       ← you add: model.<ext>  (+ optional labels.json)
├── neck/       ← you add: model.<ext>  (+ optional labels.json)
└── eye/        ← you add: model.<ext>  (+ optional labels.json)
```

## Vision models (foot / neck / eye)

Put **one** file per folder — named `model.<ext>` **or** with its original
filename (e.g. `Resnet50_bestqwk.h5`):

| File                | Framework                    | Dependency to install        |
|---------------------|------------------------------|------------------------------|
| `model.onnx`        | ONNX (any framework export)  | *(already installed)*        |
| `model.h5`          | TensorFlow / Keras           | `pip install tensorflow-cpu` |
| `model.keras`       | TensorFlow / Keras           | `pip install tensorflow-cpu` |
| `model.pt`          | PyTorch **TorchScript**      | `pip install torch`          |
| `model.pth`         | PyTorch **TorchScript**      | `pip install torch`          |

A raw PyTorch **state_dict** (a dict of weights) cannot be loaded — export
TorchScript (`torch.jit.trace(model, example).save("model.pt")`) or ONNX.

### Per-scan preprocessing (applied automatically)

Each scan type has a config mirroring its **training pipeline**:

| Scan | Preprocessing | Output | Extras |
|---|---|---|---|
| `foot` | RGB · 224×224 · **raw 0–255** (no rescale) | 2× sigmoid, normalized by sum | uncertain < 0.80 |
| `neck` | RGB · 224×224 · /255 | softmax | — |
| `eye`  | **BGR** (as cv2.imread) · 300×300 · /255 | softmax (5 grades) | uncertain < 0.50, referable DR = Σ probs[2:] ≥ 0.50 |

Legacy `.h5` files that fail to load in modern Keras (e.g. APTOS
`Resnet50_bestqwk.h5` saved with the custom `AdamAccumulate` optimizer) are
handled automatically: the training architecture is rebuilt and the weights
are loaded into it.

### labels.json (optional overrides)

Any config key can be overridden with a `labels.json` next to the model:

```json
{"labels": ["Abnormal(Ulcer)", "Normal(Healthy skin)"], "size": 224,
 "color": "rgb", "scale": "raw", "output": "sigmoid2", "uncertain": 0.8}
```

Keys: `labels` (output-index order), `size`, `color` (`rgb`/`bgr`),
`scale` (`0-1`/`raw`), `output` (`softmax`/`sigmoid2`), `uncertain`
(threshold below which the result is reported as `"uncertain"`),
`referable_from_index` + `referable_threshold` (eye: probability sum from
this grade = referable DR). Defaults without a `labels.json` are the
training-verified values in the table above.

Until a model file exists, its endpoint returns HTTP 503 with instructions —
the rest of the app keeps working.
