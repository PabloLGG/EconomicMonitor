# Recession ML pipeline

Offline training for the generative hazard model used in charts 1, 2, and 4.

## Setup

```bash
cd ml
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Train

Requires `public/data/economic-data.json` (from `npm run fetch-data` at repo root):

```bash
python -m data.prepare_panel   # build labeled feature panel
python -m train.train_all      # train VAE+hazard, calibrate, export ONNX
```

Artifacts:

- `public/models/recession_v1.onnx` — browser inference
- `public/models/recession_v1_meta.json` — normalization + isotonic calibration

## Architecture

1. **Temporal encoder** (Conv1D + BiGRU) on 60-month multivariate windows
2. **Hazard head** — 24 monthly discrete hazards → P(recession within 12mo)
3. **Future decoder** — 36-month forecast of 3 correlation channels
4. **Isotonic calibration** on full-sample holdout probabilities

Evaluation harness: `python -m eval.loro_cv` (leave-one-recession-out).
