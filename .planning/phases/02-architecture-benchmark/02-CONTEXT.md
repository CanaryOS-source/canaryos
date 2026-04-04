# Phase 2: Architecture Benchmark - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Benchmark three student architectures (MobileBERT, TinyBERT-4, ELECTRA-small) on the Phase 1 synthetic dataset using identical training conditions. Select the winner based on F1, INT8 model size, and desktop TFLite latency. Record binary baseline F1 on the real-world holdout as the floor that Phase 4 distillation must beat.

</domain>

<decisions>
## Implementation Decisions

### Training Framework
- **D-01:** PyTorch + MPS (Apple Silicon GPU acceleration) is the primary training framework for this phase and all downstream phases (3, 4, 5)
- **D-02:** TFLite export via `optimum==1.27.0` (HuggingFace Optimum) — not the manual ONNX→onnx2tf path. Dtype and tensor verification enforced at every export step.
- **D-03:** TF escape hatch — if PyTorch causes significant blocking issues at ANY point in the pipeline, pivot to TensorFlow training on Google Colab (external GPU). Keep notebook structure TF-compatible enough that a restart on TF is feasible without rewriting from scratch. User has access to external compute (Colab) for TF if needed.

### Benchmark Protocol
- **D-04:** Focused validation — 3-5 epochs per model, fixed learning rate (2e-5), same batch size across all candidates. No hyperparameter sweep at this stage.
- **D-05:** Hyperparameter tuning deferred to the winning architecture in Phase 4 (distillation). The benchmark exists to rank candidates and establish a baseline, not to maximize each one's potential.
- **D-06:** All three models trained on identical data splits from Phase 1 (`research/data/synthetic_scam_v1.jsonl` train/val split)
- **D-07:** Evaluation on real-world holdout (`research/data/holdout_realworld.jsonl`) — this is the primary metric for architecture selection, not synthetic test set performance

### Latency Measurement
- **D-08:** Desktop TFLite interpreter only — run `tflite_runtime` on Mac to measure relative inference speed between candidates. Sufficient for architecture ranking.
- **D-09:** On-device (canaryapp) latency measurement deferred to Phase 6 deployment validation. No need to build and deploy 3 models to the app for a benchmark phase.

### Architecture Candidates
- **D-10:** Three candidates benchmarked: MobileBERT (25.3M), TinyBERT-4 (14.5M), ELECTRA-small (14M)
- **D-11:** DistilBERT (66M) explicitly excluded — over 50MB INT8 budget
- **D-12:** ELECTRA-small retained as third candidate — different pretraining paradigm (replaced token detection vs masked LM) provides genuine alternative signal despite TinyBERT-4 being the frontrunner

### Claude's Discretion
- Exact epoch count within the 3-5 range (based on convergence behavior)
- Batch size selection (researcher picks based on MPS memory constraints)
- Whether to use mixed precision (fp16) during training for speed — depends on MPS support
- Notebook cell structure and visualization choices

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & Pipeline
- `.planning/research/ARCHITECTURE.md` — Full pipeline stages, input format per architecture, token_type_ids variance, TFLite export step-by-step, ONNX vs native TF path analysis
- `.planning/research/STACK.md` — Benchmark table, optimum 1.27.0 pinning, TFLite conversion path, PyTorch/TF framework notes

### Pitfalls (Phase 2 specific)
- `.planning/research/PITFALLS.md` — Pitfall 2.4: tokenizer mismatch between architectures; Pitfall 3.4: SELECT_TF_OPS disqualification; Pitfall 4.4: vocab mismatch between teacher and student

### Requirements
- `.planning/REQUIREMENTS.md` §TEXT-02 — Full acceptance criteria for architecture benchmark (metrics, TFLite compatibility, WordPiece vocab constraint, results table format)

### Phase 1 Outputs (inputs to this phase)
- `.planning/phases/01-data-foundation/01-CONTEXT.md` — Data generation decisions, dataset structure, holdout composition
- `research/data/synthetic_scam_v1.jsonl` — Training dataset (train+val split, 22,942 samples)
- `research/data/holdout_realworld.jsonl` — Real-world evaluation oracle (202 samples)
- `research/data/test_split.jsonl` — Synthetic test split

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `research/notebooks/improved_scam_classifier.ipynb` — Existing notebook with data loading and preprocessing cells; check for reusable training loop patterns
- `research/scripts/test_tflite.py` — Existing TFLite verification script; reuse `verify_tflite()` pattern for post-export dtype/shape checks
- `research/scripts/convert_onnx_to_tflite.py` — Existing ONNX→TFLite path; reference but prefer Optimum export path per D-02
- `research/scripts/validate_split.py` — Validates dataset splits; can verify data loading is correct before training

### Established Patterns
- Research environment: Python + `.venv` at repo root; Jupyter notebooks in `research/notebooks/`
- All ML research MUST be `.ipynb` notebooks — no `.py` files for training/benchmarking/evaluation
- Data in `research/data/` (gitignored), model outputs in `research/models/` (gitignored)
- Results table: `research/models/benchmark_results.json` (specified in ROADMAP.md success criteria)

### Integration Points
- Output: `research/models/benchmark_results.json` — consumed by Phase 3/4 planning to confirm architecture selection
- Output: Binary baseline F1 on holdout — hard gate for Phase 3 (confirms task is learnable before teacher investment)
- Each candidate's TFLite file needed temporarily for latency/size measurement, then can be discarded (only the winner matters for downstream phases)

</code_context>

<specifics>
## Specific Ideas

- TF escape hatch is a hard requirement — user has Colab access and wants the option to pivot to TF training if PyTorch causes blocking issues. Notebook structure should make this pivot feasible (e.g., abstract data loading, keep model-specific code isolated)
- The benchmark is a ranking exercise, not an optimization exercise — don't over-invest in any single candidate
- MPS (Metal Performance Shaders) is the expected GPU backend on the user's Mac; verify `torch.backends.mps.is_available()` early in the notebook

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-architecture-benchmark*
*Context gathered: 2026-04-04*
