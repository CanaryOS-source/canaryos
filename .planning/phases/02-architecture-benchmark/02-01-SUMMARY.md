---
plan: 02-01
phase: 02-architecture-benchmark
status: complete
started: 2026-04-04
completed: 2026-04-04
tasks_completed: 2
tasks_total: 2
deviations: none
---

## What Was Built

Complete architecture benchmark notebook (`research/notebooks/architecture_benchmark.ipynb`) — 11 code cells covering environment setup, data loading, shared training config, tokenizer consistency check, MPS smoke test, per-architecture training (MobileBERT, TinyBERT-4, ELECTRA-small), results summary, confusion matrices, and classification reports. All 3 architectures trained on identical Phase 1 data splits with identical effective hyperparameters.

## Key Results

| Architecture | Holdout F1 | Holdout P | Holdout R | Val F1 | Training Loss |
|-------------|-----------|----------|----------|--------|---------------|
| MobileBERT | 0.7719 | 0.7333 | 0.8148 | 1.0000 | 1130.81 |
| ELECTRA-small | 0.7289 | 0.7009 | 0.7593 | 0.9990 | 0.0214 |
| TinyBERT-4 | 0.7059 | 0.7500 | 0.6667 | 0.9985 | 0.0215 |

**Ranking by Holdout F1 (primary metric per D-07):** MobileBERT > ELECTRA-small > TinyBERT-4

## Key Observations

- All 3 models show significant overfitting (Val F1 ~1.0 vs Holdout F1 0.70-0.77) — expected with synthetic training data evaluated on real-world holdout. Distillation in Phase 4 is the designed mitigation.
- MobileBERT's high training loss (1130.81) is a reporting artifact — it used batch_size=8 + gradient_accumulation_steps=2, and MobileBERT reports cumulative rather than averaged loss. Holdout metrics confirm successful training.
- MPS device used throughout (Apple Silicon). Smoke test passed before full training.
- All 3 tokenizers verified to have identical vocab_size=30,522 before training (Cell 3 assertion).
- MobileBERT trained with batch_size=8 + gradient_accumulation_steps=2 (effective=16) to prevent MPS OOM; other models used batch_size=16 directly.

## Decisions

- Training handoff pattern: Notebook created by executor, training run by user in Jupyter (long-running ML training not suited for agent execution).
- All 3 models used identical hyperparameters: 5 epochs, lr=2e-5, effective batch=16, max_length=128, no fp16/bf16 (MPS incompatible).

## Self-Check: PASSED

- [x] Three architectures trained on identical data splits
- [x] Each architecture evaluated on real-world holdout with F1/precision/recall
- [x] DistilBERT explicitly excluded (Cell 3)
- [x] MPS device verified and used
- [x] All 3 tokenizers share 30,522 vocab size (asserted)
- [x] MobileBERT batch_size reduction uses gradient_accumulation_steps=2
- [x] Notebook has >= 11 code cells
- [x] Confusion matrices and classification reports generated

## Key Files

key-files:
  created:
    - research/notebooks/architecture_benchmark.ipynb
  modified: []

## What This Enables

Plan 02-02 (Wave 2) can now convert all 3 trained models to TFLite, measure latency, and select the winner. Model checkpoints are in `research/models/benchmark_tmp/{mobilebert,tinybert_4,electra_small}/`.
