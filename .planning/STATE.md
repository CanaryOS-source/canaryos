# Project State

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-01 — Milestone v1.0 started

## Accumulated Context

- Text model (mobilebert_scam_intent.tflite) is broken — input format issues and poor generalization
- Current training data limited to SMS spam corpus; fails on modern scam vectors
- On-device pipeline scaffolding is in place (OCR → model → fusion) but end-to-end quality is poor
- Visual classifier service scaffolded (VisualClassifierService.ts) but no trained model yet
- Fusion engine uses max-score heuristic (works, but depends on both signals being reliable)
- Codebase was cleaned and restructured in the most recent commit
- Research environment: Python + TF + HuggingFace in `.venv` at repo root, notebooks in `research/`
- There are duplicate auth screens at `app/auth/` (legacy dead code, safe to ignore)
