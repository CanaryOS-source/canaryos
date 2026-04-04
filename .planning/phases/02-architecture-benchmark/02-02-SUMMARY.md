---
phase: 02-architecture-benchmark
plan: 02
subsystem: ml-research
tags: [tflite, onnx, litert, mobilebert, tinybert, electra, benchmark, architecture-selection]

requires:
  - phase: 02-architecture-benchmark/01
    provides: Trained model checkpoints for all 3 architectures (MobileBERT, TinyBERT-4, ELECTRA-small)
provides:
  - benchmark_results.json with winner, baseline F1, TFLite metrics for all candidates
  - TFLite conversion pipeline (TF SavedModel path) for BERT-family models
  - Binary baseline F1 = 0.7719 as floor for Phase 4 distillation
affects: [phase-03-teacher-finetuning, phase-04-distillation, phase-06-qat-deployment]

tech-stack:
  added: [ai-edge-litert, TFAutoModelForSequenceClassification, TFLiteConverter]
  patterns: [TF-SavedModel-TFLite-conversion, flex-ops-flatbuffer-scan, LiteRT-validation]

key-files:
  created:
    - research/models/benchmark_results.json
    - research/scripts/benchmark_tflite_convert.py
    - research/scripts/benchmark_aggregate.py
  modified:
    - research/notebooks/architecture_benchmark.ipynb
    - .gitignore

key-decisions:
  - "MobileBERT selected as winner: highest holdout F1 (0.7719) among 3 candidates"
  - "TF SavedModel path used for TFLite conversion instead of ONNX->onnx2tf (onnx2tf Slice bug)"
  - "All 3 architectures pass TFLite validation: standard ops only, no Flex/SELECT_TF_OPS"
  - "Binary baseline F1 = 0.7719 recorded as Phase 4 distillation floor"

patterns-established:
  - "TFLite conversion via TF direct path: PyTorch checkpoint -> TFAutoModel.from_pretrained(from_pt=True) -> tf.function with static shapes -> TFLiteConverter"
  - "Two-layer TFLite validation: (1) Programmatic Flex ops scan of flatbuffer binary, (2) LiteRT Interpreter load without flex delegate"
  - "Latency measurement: 10 warmup + 100 runs with realistic inputs (tokenized text, not random IDs)"

requirements-completed: [TEXT-02]

duration: 24min
completed: 2026-04-04
---

# Phase 2 Plan 2: TFLite Conversion and Architecture Selection Summary

**MobileBERT wins architecture benchmark with F1=0.7719; all 3 models converted to TFLite (standard ops only, no Flex/SELECT_TF_OPS) via TF SavedModel path**

## Performance

- **Duration:** 24 min
- **Started:** 2026-04-04T17:19:42Z
- **Completed:** 2026-04-04T17:44:14Z
- **Tasks:** 3 (Task 3 human-verify checkpoint approved)
- **Files modified:** 5

## Accomplishments

- Converted all 3 trained architectures (MobileBERT, TinyBERT-4, ELECTRA-small) to TFLite via TF SavedModel path
- Validated each TFLite model with LiteRT (no SELECT_TF_OPS dependency) + programmatic Flex ops flatbuffer scan
- Measured desktop inference latency: MobileBERT 65ms, TinyBERT-4 16ms, ELECTRA-small 33ms (p50)
- Selected MobileBERT as winner (holdout F1=0.7719, primary metric per D-07)
- Produced `benchmark_results.json` with all 3 candidates, DistilBERT excluded, winner rationale, and binary baseline F1

## Key Results

| Architecture | Holdout F1 | Precision | Recall | TFLite FP32 Size | Latency p50 | Flex Ops |
|-------------|-----------|----------|--------|-------------------|-------------|----------|
| MobileBERT (WINNER) | 0.7719 | 0.7333 | 0.8148 | 93.5 MB | 65.0 ms | None |
| ELECTRA-small | 0.7289 | 0.7009 | 0.7593 | 51.7 MB | 32.6 ms | None |
| TinyBERT-4 | 0.7059 | 0.7500 | 0.6667 | 54.3 MB | 15.8 ms | None |
| DistilBERT (EXCLUDED) | -- | -- | -- | -- | -- | -- |

**Binary baseline F1 = 0.7719** (Phase 4 distillation must beat this by >= 3 F1 points)

**Note:** TFLite sizes are FP32 from default conversion. INT8 sizes after QAT (Phase 6) expected ~4x smaller (MobileBERT ~23MB, TinyBERT ~14MB, ELECTRA ~13MB).

## Task Commits

Each task was committed atomically:

1. **Task 1: TFLite conversion, validation, and latency** - `7cf0832` (feat)
2. **Task 2: Results aggregation and architecture selection** - `9e7ba2b` (feat)
3. **Task 3: Verify architecture selection rationale** - approved (checkpoint:human-verify — user approved MobileBERT, prioritizing capability over size concerns)

## Files Created/Modified

- `research/models/benchmark_results.json` - Structured benchmark output consumed by Phase 3/4 planning
- `research/scripts/benchmark_tflite_convert.py` - TFLite conversion pipeline (TF SavedModel path + ONNX sanity check)
- `research/scripts/benchmark_aggregate.py` - Results aggregation from training metrics + conversion results
- `research/notebooks/architecture_benchmark.ipynb` - Updated with TFLite conversion cells (12-18)
- `.gitignore` - Added holdout_confusion_matrices.png to gitignore

## Decisions Made

1. **MobileBERT as winner** -- Highest holdout F1 (0.7719) by significant margin over ELECTRA-small (0.7289, +4.3 pts) and TinyBERT-4 (0.7059, +6.6 pts). Despite being larger (93.5MB FP32 vs ~52MB), the INT8 estimate (~23MB) is well within the 50MB budget.

2. **TF SavedModel path for TFLite conversion** -- onnx2tf 2.3.9 fails with an int64/int32 type mismatch bug on the Slice op used in all BERT-family position embeddings. The TF direct path (PyTorch checkpoint -> TFAutoModel.from_pretrained(from_pt=True) -> tf.function with static shapes -> TFLiteConverter) produces equivalent results with standard TFLite ops.

3. **Binary baseline F1 = 0.7719** -- This becomes the hard gate floor for Phase 4 distillation. The student model after distillation must exceed this by at least 3 F1 points.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] onnx2tf conversion fails for all BERT-family models**
- **Found during:** Task 1
- **Issue:** onnx2tf 2.3.9 throws `TypeError: Input 'y' of 'Sub' Op has type int64 that does not match type int32 of argument 'x'` for all 3 models. The Slice op in BERT position embeddings creates int64 tensors that onnx2tf cannot handle. Attempted fixes: (a) int64->int32 conversion of ONNX inputs/initializers/constants, (b) onnx-simplifier preprocessing, (c) static shape overwrite. All failed.
- **Fix:** Switched to TF SavedModel path: `TFAutoModelForSequenceClassification.from_pretrained(checkpoint, from_pt=True)` -> `tf.function` with static [1, 128] input signatures -> `TFLiteConverter.from_saved_model()`. Produces equivalent TFLite models with standard ops only.
- **Files modified:** `research/scripts/benchmark_tflite_convert.py`, `research/notebooks/architecture_benchmark.ipynb`
- **Verification:** All 3 TFLite models load in LiteRT, pass inference, have correct [1, 128] input shapes and [1, 2] output shapes
- **Committed in:** 7cf0832

**2. [Rule 1 - Bug] TFLite latency measurement crashes with random token IDs**
- **Found during:** Task 1
- **Issue:** `measure_latency()` used `np.random.randint(0, 1000)` for ALL input tensors including `input_ids`. Token IDs > vocab size caused GATHER op (embedding lookup) to throw "gather index out of bounds" during the latency warmup/measurement runs.
- **Fix:** Updated input data generation to use realistic values: valid token IDs (100-10000 range) for `input_ids`, ones for `attention_mask`, zeros for `token_type_ids`.
- **Files modified:** `research/scripts/benchmark_tflite_convert.py`
- **Verification:** All 3 models complete 10 warmup + 100 measurement runs without errors
- **Committed in:** 7cf0832

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for task completion. The TF SavedModel path is functionally equivalent to ONNX->onnx2tf. No scope creep.

## Issues Encountered

- **D-02 compound deviation:** Plan D-02 specifies `optimum==1.27.0` for TFLite export. However, optimum 2.1.0 (installed) removed TFLite export, and downgrading requires `transformers<4.50`. The ONNX->onnx2tf alternative path also failed (see deviation 1 above). The TF SavedModel path is the third alternative and works correctly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Architecture selected: MobileBERT (`google/mobilebert-uncased`, 24.6M params)
- Binary baseline F1 = 0.7719 recorded as Phase 4 distillation floor
- All 3 TFLite models produced and validated (gitignored, in `research/models/benchmark_tmp/`)
- `benchmark_results.json` committed and available for Phase 3/4 planning
- Task 3 (human-verify checkpoint) APPROVED — user chose MobileBERT, prioritizing capability (F1) over size. Size concerns to be addressed in Phase 6 QAT (INT8 ~23MB vs 20MB hard reject — user accepts this trade-off)

## Known Stubs

None -- all data is real from training results and TFLite conversion.

## Self-Check: PASSED

- [x] research/models/benchmark_results.json exists
- [x] research/scripts/benchmark_tflite_convert.py exists
- [x] research/scripts/benchmark_aggregate.py exists
- [x] research/notebooks/architecture_benchmark.ipynb exists (18 code cells)
- [x] Commit 7cf0832 exists (Task 1)
- [x] Commit 9e7ba2b exists (Task 2)
- [x] benchmark_results.json has 3 candidates, DistilBERT excluded, winner = MobileBERT
- [x] All candidates have tflite_size_mb > 0, tflite_latency_p50_ms > 0, flex_ops_found field
- [x] tflite_size_note present explaining FP32 vs INT8

---
*Phase: 02-architecture-benchmark*
*Completed: 2026-04-04*
