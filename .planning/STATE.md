---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: verifying
last_updated: "2026-04-04T18:03:31.331Z"
last_activity: 2026-04-04
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 5
  completed_plans: 5
---

# Project State

## Current Position

Phase: 3
Plan: Not started
Status: Phase complete — ready for verification
Last activity: 2026-04-04

## Milestone

v1.0: Text Classification Research
Goal: Replace broken MobileBERT model with a research-backed, synthetically-trained scam classifier deployed as a working TFLite model in canaryapp.

## Phase Progress

| Phase | Status |
|-------|--------|
| 1. Data Foundation | In progress (Plan 3/3 at checkpoint) |
| 2. Architecture Benchmark | Plan 02-02 checkpoint pending |
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

- Student model: MobileBERT (`google/mobilebert-uncased`) -- 24.6M params, ~23MB INT8 est., 65ms desktop TFLite. UPDATED from TinyBERT-4 per Phase 2 benchmark results (MobileBERT F1=0.7719 vs TinyBERT F1=0.7059)
- Teacher model: microsoft/deberta-v3-large (435M params) — better GLUE than RoBERTa, disentangled attention helps short texts
- Tokenizer: BERT WordPiece, 30,522 vocab — same as existing `vocab.txt`; no change to `TextTokenizer.ts`
- Distillation: Intermediate layer transfer (attention matrix + hidden states) + soft labels — NOT soft-labels-only
- Quantization: QAT via TFMOT (TF 2.15/2.16) — PTQ explicitly prohibited for BERT family
- Export: TF SavedModel path for TFLite (PyTorch->TFAutoModel(from_pt=True)->TFLiteConverter). UPDATED: optimum 1.27.0 approach abandoned (onnx2tf Slice bug; optimum 2.1.0 has no TFLite export)
- numpy: 2.4.3 works with TF 2.21 and onnxruntime 1.24 (old <2.0 constraint no longer applies)

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
- **All ML research (training, benchmarking, evaluation, distillation, analysis) MUST be Jupyter notebooks (`.ipynb`) in `research/notebooks/`** — do NOT use `.py` files for research tasks
- Utility/pipeline scripts only (data download, format conversion, CI validation) go in `research/scripts/`
- Data and model outputs gitignored in `research/data/` and `research/models/`

### Plan 01-01 Decisions

- Used `ucirvine/sms_spam` instead of `ealvaradob/phishing-dataset` and `redasers/difraud` — both use legacy HuggingFace loading scripts that are no longer supported by the datasets library
- 93 curated manual samples (FTC/r-scams patterns) cover all 8 scam vectors and satisfy D-01 community source family requirement
- Holdout collected: 202 samples (108 scam, 94 safe), AUTOMATED + COMMUNITY source families

### Plan 01-02 Decisions

- Used `llama3.1:8b` as Ollama model per D-06 (Claude's discretion — better documented for structured generation than Mistral 7B)
- romance_grooming and government_impersonation routed to 25% Ollama (2.5× base share) per Pitfall 1.4 — reduced from 50% to match new 10% overall Ollama target while still providing safety-bypass coverage
- Hard negative safe class is 25% of safe target with 6 domain categories per D-09/D-11 (added legitimate_tech and legitimate_government categories beyond original 4)
- Script is resumable: loads existing synthetic_raw.jsonl and fills remaining per-vector gaps
- **Replaced static template cycling with parametric prompt builder** — `build_scam_prompt()` and `build_safe_prompt()` each sample from 7 independent parameter spaces (sub-variant × register × length × emotional angle × sender persona × cultural context × channel), producing millions of unique combinations per vector.
- **Added Gemini 3.1 Flash Lite** (`gemini-3.1-flash-lite-preview`, 150K RPD) as third model: takes 60% of Gemini budget, Flash 2.5 takes 40%. Combined Gemini = 75% (D-05 satisfied). Flash Lite's 15× higher daily cap prevents mid-run RPD exhaustion.
- **Parallelised Gemini calls** via `ThreadPoolExecutor(max_workers=10)` — ~10× throughput vs sequential. Estimated full run: ~1-2 hours (Gemini portion) + ~3 hours (Ollama sequential).
- **Ollama reduced to 10%** (from 25%) to cap sequential bottleneck at ~3 hours total for ~2,700 samples.
- **Fixed 503/UNAVAILABLE retry** — previously only caught 429/RESOURCE_EXHAUSTED; 503 fell through to `return None` (silent sample loss). Now both trigger exponential backoff (max 32s, 5 retries).

### Plan 01-03 Decisions

- BART-large-MNLI baseline failed (53% accuracy on holdout for scam/safe zero-shot) -- NLI zero-shot fundamentally cannot distinguish scam from safe in this domain
- Fell back to keyword-based vector consistency check: scam samples require >= 2 domain keywords matching their vector; safe samples pass unconditionally
- romance_grooming had highest discard rate (57.5%); 1,276 samples retained is sufficient
- Fixed validate_split.py to check 90/10 file split (train+val combined)
- TF Metal plugin crash workaround: renamed libmetal_plugin.dylib to .bak

### Active Blockers

None — all Phase 1 plans complete, human review approved.

### Execution Log

- 2026-04-03: Plan 01-01 completed -- Wave 0 validation scripts and real-world holdout
- 2026-04-03: Plan 01-02 completed -- 27K synthetic samples generated
- 2026-04-04: Plan 01-03 Task 1 completed -- filter_and_split.py pipeline, 22,942 post-filter samples (commit ef206b5)
- 2026-04-04: Plan 01-03 Task 2 -- 100-sample human review APPROVED (no mode collapse, 0% mislabeling, all criteria passed)
- Last session: 2026-04-04 -- Phase 1 complete, proceeding to verification
- 2026-04-04: Plan 02-01 -- Benchmark notebook created (11 code cells), committed. User runs training manually in Jupyter.
- Decision: Long-running ML training handled via user handoff, not Claude looping.
- 2026-04-04: Plan 02-02 Tasks 1-2 -- TFLite conversion + architecture selection (commits 7cf0832, 9e7ba2b)
- Decision: TF direct path for TFLite (not ONNX->onnx2tf) -- onnx2tf int64/int32 type mismatch on all BERT models
- Decision: MobileBERT selected as winner (Holdout F1=0.7719); binary baseline F1=0.7719 is Phase 4 floor
- Decision: All 3 models pass standard LiteRT without SELECT_TF_OPS -- no disqualifications
- 2026-04-04: Task 3 checkpoint APPROVED -- user chose MobileBERT, prioritizing model capability (F1=0.7719) over size concerns (~23MB INT8 est. vs 20MB hard reject). Size to be addressed in Phase 6 QAT.
- Decision: MobileBERT INT8 size concern acknowledged but deprioritized by user in favor of classification capability
