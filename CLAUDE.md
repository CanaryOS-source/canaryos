# CanaryOS

On-device, real-time scam detection for mobile. React Native (Expo) app with on-device ML inference via TFLite models, Firebase backend for auth/family features, and a dedicated research directory for model development.

## Repo Structure

```
canaryos/
├── canaryapp/          # React Native/Expo mobile app
│   ├── app/            # Expo Router screens (file-based routing)
│   ├── assets/models/  # Production TFLite models + vocab
│   ├── components/     # Reusable React components
│   ├── config/         # Firebase initialization
│   ├── constants/      # Theme, colors
│   ├── contexts/       # AuthContext, FamilyContext
│   ├── hooks/          # Custom hooks (useScanner, useColorScheme)
│   ├── services/       # Platform-agnostic service layer
│   │   └── ondevice/   # On-device ML pipeline (TFLite, OCR, fusion)
│   └── plugins/        # Expo plugins
├── research/           # ML research & model development
│   ├── notebooks/      # Jupyter notebooks for training
│   ├── scripts/        # Model conversion & evaluation scripts
│   ├── models/         # Model outputs (gitignored, large files)
│   ├── data/           # Datasets (gitignored)
│   └── docs/           # ML-specific documentation
└── docs/               # Project documentation
```

## Key Conventions

### Platform-Agnostic Service Pattern
Services use a 3-file wrapper pattern:
- `service.ts` — wrapper that selects platform implementation
- `serviceNative.ts` — React Native Firebase SDK
- `serviceWeb.ts` — Firebase JS SDK

### Theme
```
Primary: #FFD300 (Canary Yellow)
Secondary: #1C1C1C (Charcoal Black)
Alert: #E63946 (Alert Red)
Trust: #0077B6 (Trust Blue)
```
Import from `@/constants/theme`.

### UI Principles
- No clutter, no gradients, minimal icons
- Core features are one-click accessible
- No emojis in UI or code

## Running the App

```bash
cd canaryapp
npm install
npx expo start
```

## ML Research

```bash
cd research
# Activate Python environment
source ../.venv/bin/activate
jupyter notebook
```

## ML Research Convention

All ML research work (model training, benchmarking, evaluation, distillation, analysis) MUST be implemented as Jupyter notebooks (`.ipynb`) in `research/notebooks/`. Do NOT use plain `.py` files for research tasks. The only exception is small utility/pipeline scripts (data download, format conversion, CI validation) which belong in `research/scripts/`.

**Decision rule:** If the task involves iterating on model behavior, visualizing results, or exploring data — it's a notebook in `research/notebooks/`. If it's a one-shot automation script with no interactive exploration — it's a script in `research/scripts/`.

## What NOT to Do

- Do not use cloud API (scamAnalyzer.ts / Gemini) as the default analysis path — it exists only as a demo fallback
- Do not add files to `canaryapp/assets/models/` without removing old versions
- Do not check large model files (.tflite, .onnx) into git outside of `canaryapp/assets/models/`
- Do not create new native modules without discussion — the overlay module was removed intentionally
- Do not create `.py` files for ML research tasks (training, benchmarking, evaluation, distillation) — use `.ipynb` notebooks in `research/notebooks/`
