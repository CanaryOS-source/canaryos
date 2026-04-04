---
phase: 03-teacher-fine-tuning
plan: 01
subsystem: ml-research
tags: [deberta-v3-large, pytorch, huggingface-trainer, knowledge-distillation, temperature-scaling, ece-calibration, colab]

# Dependency graph
requires:
  - phase: 01-data-foundation
    provides: synthetic_scam_v1.jsonl (22,942 samples), holdout_realworld.jsonl (202 samples), test_split.jsonl
  - phase: 02-architecture-benchmark
    provides: MobileBERT selected as student architecture (F1=0.7719), training framework patterns
provides:
  - "Complete teacher fine-tuning Jupyter notebook (research/notebooks/teacher_finetuning.ipynb)"
  - "DualHeadDeBERTaTeacher model class with binary + 8 intent heads on shared DeBERTa encoder"
  - "Soft label pre-computation at T={2,3,4,5} producing teacher_soft_labels_T{N}.pt files for Phase 4"
  - "ECE calibration measurement with temperature scaling optimization"
  - "T4-to-A100 migration guide for Colab environment switching"
  - "Retry configs (RETRY_1, RETRY_2) and D-13 escalation path for holdout gate failures"
affects: [04-knowledge-distillation, 05-multi-label-intent-head]

# Tech tracking
tech-stack:
  added: [transformers>=4.48.0, accelerate>=0.25.0, evaluate>=0.4.0, torchmetrics>=1.2.0, sentencepiece]
  patterns: [dual-head-model-class, custom-trainer-compute-loss, google-drive-checkpoint-resume, soft-label-pre-computation, ece-temperature-search]

key-files:
  created:
    - research/notebooks/teacher_finetuning.ipynb
  modified: []

key-decisions:
  - "DualHeadDeBERTaTeacher wraps DebertaV2Model (not ForSequenceClassification) to support binary + multi-label heads"
  - "Loss weighting 0.7 binary + 0.3 intent per RESEARCH.md recommendation"
  - "20% of val split used as calibration set for ECE (not holdout)"
  - "Soft labels pre-computed via single forward pass then T-scaling applied offline"
  - "DualHeadTrainer overrides both compute_loss and prediction_step to handle intent_labels"

patterns-established:
  - "DualHeadDeBERTaTeacher: custom PreTrainedModel subclass with binary_head and intent_head on shared encoder"
  - "DualHeadTrainer: Trainer subclass with compute_loss override for multi-task loss and prediction_step for binary metric extraction"
  - "Checkpoint resume from Google Drive: save_checkpoint/load_latest_checkpoint pair with training_state.json metadata"
  - "Soft label pre-computation: collect raw logits once, apply temperature scaling offline at multiple T values"
  - "Config-driven training: T4_CONFIG/A100_CONFIG/RETRY_1/RETRY_2 dict pattern with ACTIVE_CONFIG selector"

requirements-completed: [TEXT-04]

# Metrics
duration: 11min
completed: 2026-04-04
---

# Phase 3 Plan 01: Teacher Fine-Tuning Notebook Summary

**DeBERTa-v3-large dual-head teacher notebook with T4/A100 configs, checkpoint resume, ECE calibration, and soft label pre-computation at T={2,3,4,5} for Phase 4 distillation**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-04T21:15:21Z
- **Completed:** 2026-04-04T21:26:50Z
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments

- Created complete 15-cell Colab notebook for DeBERTa-v3-large teacher fine-tuning with 1334 source lines
- DualHeadDeBERTaTeacher model class with binary (2-class softmax) and intent (8-class sigmoid) heads sharing one DeBERTa encoder
- Full training pipeline: T4/A100 config toggle, RETRY_1/RETRY_2 failover configs, Google Drive checkpoint resume, synthetic test gate (F1>0.95), holdout gate (F1>0.80) with per-vector error breakdown
- ECE calibration measurement with temperature search (0.5-5.0), reliability diagrams before/after
- Soft label pre-computation at T={2,3,4,5} saving both binary and intent logits to .pt files for Phase 4 offline distillation
- T4-to-A100 migration guide with step-by-step environment switching instructions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create teacher notebook -- training pipeline (Cells 1-9)** - `aeb751b` (feat)
2. **Task 2: Complete notebook -- calibration, soft labels, migration guide (Cells 10-15)** - `1ae4f52` (feat)

## Files Created/Modified

- `research/notebooks/teacher_finetuning.ipynb` - Complete teacher fine-tuning notebook (15 code cells + 2 markdown cells, 1334 source lines)

## Decisions Made

- **DualHeadDeBERTaTeacher wraps DebertaV2Model:** Used raw encoder (not ForSequenceClassification) because dual-head architecture requires two separate classification heads on the shared [CLS] output. ForSequenceClassification only supports a single head.
- **Loss weighting 0.7/0.3:** Binary head weighted at 0.7 since it is the hard gate; intent head at 0.3 since it is informational only and intent labels are approximate.
- **Calibration set from val split (20%):** Used first 20% of val_dataset (~459 samples) as calibration set. Holdout is NOT used for calibration to preserve its integrity as the F1 gate.
- **Single forward pass for soft labels:** Pre-compute raw logits once on full training set, then apply temperature scaling offline at T={2,3,4,5}. This minimizes GPU time (~20-30 min) vs running 4 separate forward passes.
- **DualHeadTrainer overrides prediction_step:** Necessary to return binary_logits (not the full model output dict) for compute_metrics to work with the Trainer evaluation pipeline.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**The notebook is designed for Google Colab execution.** Before running:
1. Upload `research/data/synthetic_scam_v1.jsonl`, `test_split.jsonl`, and `holdout_realworld.jsonl` to Colab working directory
2. Mount Google Drive (Cell 1 runs `drive.mount()` -- user approves access popup)
3. Select GPU runtime: Runtime > Change runtime type > GPU (T4 recommended)

## Known Stubs

None - the notebook is a complete, self-contained training pipeline. All data loading paths reference real files from Phase 1 outputs. No placeholder data or mock implementations.

## Next Phase Readiness

- Notebook is ready for user to upload to Colab and execute training
- After training completes and both gates pass (synthetic F1>0.95, holdout F1>0.80):
  - Soft label files (`teacher_soft_labels_T{2,3,4,5}.pt`) will be generated in `research/data/`
  - Phase 4 (Knowledge Distillation) consumes these soft label files directly -- does NOT need the teacher model loaded
- If holdout gate fails: RETRY_1 and RETRY_2 configs are pre-defined; D-13 escalation path documented in summary cell
- Compute requirement: T4 GPU (16GB VRAM) minimum; A100 migration guide included for faster training

---
*Phase: 03-teacher-fine-tuning*
*Completed: 2026-04-04*
