---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-04-03T02:22:26.434Z"
last_activity: 2026-04-03
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 3
  completed_plans: 1
---

# Project State

## Current Position

Phase: 01 (data-foundation) — EXECUTING
Plan: 2 of 3
Status: Executing — generation script running (128 samples written, ~26,872 remaining)
Last activity: 2026-04-03

## Milestone

v1.0: Text Classification Research
Goal: Replace broken MobileBERT model with a research-backed, synthetically-trained scam classifier deployed as a working TFLite model in canaryapp.

## Phase Progress

| Phase | Status |
|-------|--------|
| 1. Data Foundation | In progress (Plan 1/3 complete) |
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

### Plan 01-01 Decisions

- Used `ucirvine/sms_spam` instead of `ealvaradob/phishing-dataset` and `redasers/difraud` — both use legacy HuggingFace loading scripts that are no longer supported by the datasets library
- 93 curated manual samples (FTC/r-scams patterns) cover all 8 scam vectors and satisfy D-01 community source family requirement
- Holdout collected: 202 samples (108 scam, 94 safe), AUTOMATED + COMMUNITY source families

### Plan 01-02 Decisions

- Used `llama3.1:8b` as Ollama model per D-06 (Claude's discretion — better documented for structured generation than Mistral 7B)
- romance_grooming and government_impersonation routed 50% to Ollama per Pitfall 1.4 (safety filter bypass for sensitive vectors)
- Hard negative safe class is 25% of safe target with 6 domain categories per D-09/D-11 (added legitimate_tech and legitimate_government categories beyond original 4)
- Script is resumable: loads existing synthetic_raw.jsonl and fills remaining per-vector gaps
- **Replaced static template cycling with parametric prompt builder** — root cause of observed structural repetition in first 128 samples was cycling 5-8 fixed templates hundreds of times. `build_scam_prompt()` and `build_safe_prompt()` each sample from 7 independent parameter spaces (sub-variant × register × length × emotional angle × sender persona × cultural context × channel), producing millions of unique combinations per vector. Scam: 12 sub-variants × 12 registers × 5 emotional angles × 8 personas × 16 contexts. Safe: 35 transactional variants + 6 hard-neg categories × 8 variants each. Existing 128 samples preserved (valid data; dedup filter in Phase 3 handles any exact duplicates).

### Active Blockers

None — GEMINI_API_KEY confirmed set, llama3.1:8b pulled and verified available.

### Execution Log

- 2026-04-03: Plan 01-01 completed — Wave 0 validation scripts and real-world holdout (commits db7c9f3, cb054f7)
- 2026-04-03: Plan 01-02 Task 1 completed — generate_dataset.py script (commit 6155546)
- 2026-04-03: Plan 01-02 Task 2 in progress — 128 samples written (all crypto_investment), generation paused
- 2026-04-03: generate_dataset.py refactored — static SCAM_PROMPTS/SAFE_HARD_NEGATIVE_PROMPTS/SAFE_NORMAL_PROMPTS replaced with parametric build_scam_prompt() and build_safe_prompt() to eliminate structural repetition
- Last session: 2026-04-03 — Stopped at: 01-02 Task 2 generation in progress
