Add `model.onnx` / `model.h5` / `model.keras` / `model.pt` / `model.pth` here
(+ optional `labels.json`) — see ../README.md.

Current model: `Diabetic_Foot_UIcer1.h5` (DFU ResNet50).
Preprocessing (applied automatically, matches training):
  RGB · 224×224 · raw 0–255 (no rescale) · 2 sigmoid outputs normalized
  by sum · "uncertain" below 0.80 confidence.
Classes: ["Abnormal(Ulcer)", "Normal(Healthy skin)"].
