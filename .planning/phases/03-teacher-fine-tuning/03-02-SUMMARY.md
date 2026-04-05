---
phase: 03-teacher-fine-tuning
plan: 02
subsystem: ml-research
tags: [gate-check, human-verification, teacher-training, colab]

requires:
  - phase: 03-teacher-fine-tuning
    plan: 01
    provides: teacher_finetuning.ipynb notebook

provides:
  - "Teacher holdout F1=0.8052 (gate >0.80 PASSED)"
  - "Teacher synthetic F1=0.9990 (gate >0.95 PASSED)"
  - "4 soft label files at T={2,3,4,5} ready for Phase 4 distillation"
  - "ECE calibration: 0.0014 before, 0.0005 after (T=0.5)"
  - "Teacher checkpoint saved to Google Drive (1663.67 MB)"

affects: [04-knowledge-distillation]

key-decisions:
  - "T4_CONFIG (3 epochs, 8e-6 LR) reached holdout F1=0.7926 -- below 0.80 gate"
  - "RETRY_1 (2 more epochs, 3e-6 LR) continued from trained model -- holdout F1=0.8052, gate passed"
  - "Weakest vectors: safe (F1=0.68), phishing (F1=0.71) -- acceptable given small holdout (202 samples)"
  - "ECE already excellent at 0.0014 -- model well-calibrated without intervention"

requirements-completed: [TEXT-04]

completed: 2026-04-04
---

# Phase 3 Plan 02: Teacher Training Verification Summary

**Teacher DeBERTa-v3-large passes both gates after RETRY_1 continuation -- holdout F1=0.8052, synthetic F1=0.9990, soft labels at 4 temperatures saved**

## Gate Results

| Gate | Threshold | Result | Status |
|------|-----------|--------|--------|
| Synthetic F1 | > 0.95 | 0.9990 | PASSED |
| Holdout F1 | > 0.80 | 0.8052 | PASSED |

## Training History

1. **T4_CONFIG** (3 epochs, lr=8e-6): Holdout F1=0.7926 -- 0.0074 below gate
2. **RETRY_1** (2 more epochs, lr=3e-6): Holdout F1=0.8052 -- gate passed

Total training time: ~122 min on Colab T4 (66 min + 56 min)

## Calibration

- ECE before: 0.0014
- ECE after (T=0.5): 0.0005
- Model is well-calibrated; bimodal prediction distribution is expected for fine-tuned large model

## Soft Labels

| File | Size | Binary Shape | Intent Shape |
|------|------|-------------|--------------|
| teacher_soft_labels_T2.pt | 0.70 MB | [18353, 2] | [18353, 8] |
| teacher_soft_labels_T3.pt | 0.70 MB | [18353, 2] | [18353, 8] |
| teacher_soft_labels_T4.pt | 0.70 MB | [18353, 2] | [18353, 8] |
| teacher_soft_labels_T5.pt | 0.70 MB | [18353, 2] | [18353, 8] |

Location: Google Drive `/content/drive/MyDrive/canaryos_teacher/data/`

## Per-Vector Holdout Breakdown

| Vector | N | F1 |
|--------|---|-----|
| safe | 94 | 0.681 |
| phishing | 38 | 0.711 |
| government_impersonation | 10 | 0.800 |
| urgency_payment | 10 | 0.900 |
| lottery_reward | 23 | 0.957 |
| crypto_investment | 7 | 1.000 |
| romance_grooming | 10 | 1.000 |
| remote_access | 5 | 1.000 |
| tech_support | 5 | 1.000 |

## Runtime Issues Fixed During Execution

6 notebook bugs fixed during Colab execution (see STATE.md for details):
- PyTorch API rename, transformers MoE Jupyter bug, eval_strategy rename, fp16 grad clipping, DeBERTa LayerNorm key mismatch, Colab filesystem paths

## Next Phase Readiness

- Phase 4 loads soft label `.pt` files directly -- teacher model NOT needed at inference time
- Soft labels on Google Drive at `/content/drive/MyDrive/canaryos_teacher/data/`
- Phase 4 sweeps T={2,3,4,5} by loading different `.pt` files
- Phase 2 binary baseline F1=0.7719 is the floor that distillation must beat

---
*Phase: 03-teacher-fine-tuning*
*Completed: 2026-04-04*
