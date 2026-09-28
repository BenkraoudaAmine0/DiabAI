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

Put **one** file per folder, named exactly:

| File                | Framework                    | Dependency to install        |
|---------------------|------------------------------|------------------------------|
| `model.onnx`        | ONNX (any framework export)  | *(already installed)*        |
| `model.h5`          | TensorFlow / Keras           | `pip install tensorflow-cpu` |
| `model.keras`       | TensorFlow / Keras           | `pip install tensorflow-cpu` |
| `model.pt`          | PyTorch **TorchScript**      | `pip install torch`          |
| `model.pth`         | PyTorch **TorchScript**      | `pip install torch`          |

Notes:

- **ONNX is the safest choice** — export any Keras/PyTorch model with
  `tf.keras.models.load_model(...).export("model.onnx")` or
  `torch.onnx.export(model, dummy, "model.onnx")`.
- A raw PyTorch **state_dict** (a dict of weights) cannot be loaded — export
  TorchScript (`torch.jit.trace(model, example).save("model.pt")`) or ONNX.
- Images are preprocessed to RGB, resized to `image_size`² (default 224),
  and scaled to [0, 1] (divide by 255). Train/export accordingly, or retrain
  with the same preprocessing.

### labels.json (optional but recommended)

Default class names are assumed in **output-index order**. If your training
labels differ, put a `labels.json` next to the model:

```json
{"labels": ["no_ulcer", "ulcer"], "image_size": 224}
```

Defaults if you don't provide one:

- `foot`: `["no_ulcer", "ulcer"]`
- `neck`: `["normal", "acanthosis_nigricans"]`
- `eye`:  `["No DR", "Mild", "Moderate", "Severe", "Proliferative DR"]`

**Check your training code** (`class_indices` for Keras,
`classes_`/`LabelEncoder.classes_` for sklearn pipelines) to confirm the index
order before relying on the defaults.

Until a model file exists, its endpoint returns HTTP 503 with instructions —
the rest of the app keeps working.
