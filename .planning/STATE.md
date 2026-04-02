# Project State

## Current Position

Phase: Phase 1 — Data Foundation (not yet started)
Plan: —
Status: Roadmap created; ready to plan Phase 1
Last activity: 2026-04-01 — Milestone v1.0 roadmap and requirements written

## Milestone

v1.0: Text Classification Research
Goal: Replace broken MobileBERT model with a research-backed, synthetically-trained scam classifier deployed as a working TFLite model in canaryapp.

## Phase Progress

| Phase | Status |
|-------|--------|
| 1. Data Foundation | Not started |
| 2. Architecture Benchmark | Not started |
| 3. Teacher Fine-Tuning | Not started |
| 4. Knowledge Distillation | Not started |
| 5. Multi-Label Intent Head | Not started |
| 6. QAT + TFLite Deployment | Not started |

## Accumulated Context

### Codebase State
- Text model (`mobilebert_scam_intent.tflite`, 26.7MB) is broken — input format issues and poor generalization to modern scam patterns
- Current training data limited to SMS spam corpus (UCI, ~5K samples); fails on crypto/romance/tech support/gov impersonation vectors
- On-device pipeline scaffolding is in place (OCR → text model → fusion) but text classifier does not produce reliable output
- Visual classifier service scaffolded (`VisualClassifierService.ts`) but uses dummy 0.5 tensor input and no trained model exists yet
- Fusion engine uses max-score heuristic — adequate until both signals are reliable
- 207 console.log statements throughout on-device pipeline — noise in production, useful during integration testing
- Debug panel in `app/(tabs)/index.tsx` visible to users — must be gated behind `__DEV__` before TEXT-06 deployment
- `app/auth/` directory contains legacy dead code duplicating `app/(auth)/` screens — safe to ignore
- `services/ScanService.ts` is dead code (not imported anywhere)

### Key Architectural Decisions (Locked)
- Student model: TinyBERT-4 (`huawei-noah/TinyBERT_General_4L_312D`) — 14.5M params, ~14MB INT8, 62ms Pixel 4 inference
- Teacher model: microsoft/deberta-v3-large (435M params) — better GLUE than RoBERTa, disentangled attention helps short texts
- Tokenizer: BERT WordPiece, 30,522 vocab — same as existing `vocab.txt`; no change to `TextTokenizer.ts`
- Distillation: Intermediate layer transfer (attention matrix + hidden states) + soft labels — NOT soft-labels-only
- Quantization: QAT via TFMOT (TF 2.15/2.16) — PTQ explicitly prohibited for BERT family
- Export: optimum==1.27.0 for TFLite export (optimum >= 2.0 removed TFLite support)
- numpy: must stay < 2.0 (2.0 breaks TF 2.15 and onnxruntime)

### Hard Gates (Do Not Skip)
- Real-world holdout must be built BEFORE any synthetic generation
- Teacher F1 > 0.80 on real-world holdout before distillation begins
- Binary classifier F1 > 0.85 on real-world holdout before intent head added
- Architecture fixed before QAT begins
- Post-QAT: `input_details[0]['dtype'] == numpy.int32` assertion must pass before deployment

### Compute Note
- Phase 3 (teacher fine-tuning) requires >16GB GPU VRAM — confirm Colab A100 or Lambda Labs availability before starting Phase 3

### Research Environment
- Python + TF + HuggingFace in `.venv` at repo root
- Notebooks in `research/notebooks/`
- Scripts in `research/scripts/`
- Data and model outputs gitignored in `research/data/` and `research/models/`
