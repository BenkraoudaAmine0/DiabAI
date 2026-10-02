Add `model.onnx` / `model.h5` / `model.keras` / `model.pt` / `model.pth` here
(+ optional `labels.json`) — see ../README.md.

Current model: `Resnet50_bestqwk.h5` (APTOS ResNet50).
Preprocessing (applied automatically, matches training):
  BGR (as cv2.imread) · 300×300 · /255 · 5 softmax outputs ·
  "uncertain" below 0.50 · referable DR = sum(Moderate..Proliferative) ≥ 0.50.
Classes: ["No DR", "Mild", "Moderate", "Severe", "Proliferative DR"].
