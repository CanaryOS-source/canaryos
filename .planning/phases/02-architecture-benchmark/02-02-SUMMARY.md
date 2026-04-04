---
phase: 02-architecture-benchmark
plan: 02
subsystem: ml-research
tags: [tflite, tflite-conversion, litert, benchmark, mobilebert, tinybert, electra, architecture-selection]

requires:
  - phase: 02-architecture-benchmark/plan-01
    provides: "Trained model checkpoints for MobileBERT, TinyBERT-4, ELECTRA-small in research/models/benchmark_tmp/"
provides:
  - "benchmark_results.json with all 3 candidates, winner, and binary baseline F1"
  - "TFLite conversion cells in architecture_benchmark.ipynb"
  - "Binary baseline F1=0.7719 (Phase 4 distillation floor)"
affects: [phase-03-teacher-finetuning, phase-04-knowledge-distillation, phase-06-qat-tflite]

tech-stack:
  added: [TFAutoModelForSequenceClassification, tf.lite.TFLiteConverter, ai-edge-litert]
  patterns: [tf-direct-tflite-conversion, flex-ops-flatbuffer-scan, litert-latency-benchmark]

key-files:
  created:
    - research/models/benchmark_results.json
  modified:
    - research/notebooks/architecture_benchmark.ipynb
    - .gitignore

key-decisions:
  - "TF direct path for TFLite conversion (PyTorch->TFAutoModel(from_pt=True)->TFLiteConverter) instead of ONNX->onnx2tf -- onnx2tf fails with int64/int32 type mismatch on all BERT-family models"
  - "MobileBERT selected as winner by holdout F1 (0.7719 vs ELECTRA 0.7289 vs TinyBERT 0.7059)"
  - "All 3 models pass standard LiteRT without SELECT_TF_OPS -- no disqualifications"

patterns-established:
  - "TF direct TFLite conversion: load PyTorch checkpoint via from_pt=True, wrap in tf.function with static shapes, convert with TFLiteConverter"
  - "Flex ops binary scan: read TFLite flatbuffer bytes, scan for 'Flex' prefixed strings to detect SELECT_TF_OPS dependency"

requirements-completed: [TEXT-02]

duration: 13min
completed: 2026-04-04
---

# Phase 2 Plan 02: TFLite Conversion and Architecture Selection Summary

**MobileBERT wins architecture benchmark (F1=0.7719) -- all 3 models convert to standard TFLite without SELECT_TF_OPS, latency measured via LiteRT**

## Performance

- **Duration:** 13 min
- **Started:** 2026-04-04T17:22:39Z
- **Completed:** 2026-04-04T17:35:35Z
- **Tasks:** 2 of 3 (Task 3 is checkpoint:human-verify, pending)
- **Files modified:** 3

## Accomplishments

- Converted all 3 trained architectures (MobileBERT, TinyBERT-4, ELECTRA-small) to TFLite via TF direct path
- Validated each model with LiteRT interpreter (no Flex/SELECT_TF_OPS ops)
- Measured desktop inference latency: MobileBERT 65.2ms, ELECTRA-small 32.6ms, TinyBERT-4 15.8ms
- Produced `benchmark_results.json` with complete metrics, winner rationale, and binary baseline F1
- Added 7 standalone notebook cells (12-18) for TFLite conversion, validation, latency, and selection

## Key Results

| Architecture | Holdout F1 | TFLite FP32 Size | Desktop p50 | Status |
|-------------|-----------|-----------------|-------------|--------|
| MobileBERT | 0.7719 | 93.5 MB | 65.2ms | WINNER |
| ELECTRA-small | 0.7289 | 51.7 MB | 32.6ms | Eligible |
| TinyBERT-4 | 0.7059 | 54.3 MB | 15.8ms | Eligible |
| DistilBERT | -- | -- | -- | Excluded (D-11) |

**Binary baseline F1 = 0.7719** (Phase 4 distillation must beat this by >= 3 F1 points)

Note: TFLite sizes are FP32 pre-QAT. INT8 sizes after Phase 6 QAT expected ~4x smaller.

## Task Commits

1. **Task 1: TFLite conversion, latency measurement, and SELECT_TF_OPS check** - `33ef437` (feat)
2. **Task 2: Results aggregation and architecture selection** - `31b7bbe` (feat)
3. **Task 3: Verify architecture selection rationale** - pending (checkpoint:human-verify)

## Files Created/Modified

- `research/models/benchmark_results.json` - Structured benchmark output consumed by Phase 3/4/6
- `research/notebooks/architecture_benchmark.ipynb` - Added cells 12-18 for TFLite pipeline
- `.gitignore` - Added benchmark_tmp/, onnx2tf artifacts, conversion logs

## Decisions Made

1. **TF direct path instead of ONNX->onnx2tf (D-02 deviation):** onnx2tf fails with `TypeError: Input 'y' of 'Sub' Op has type int64 that does not match type int32` on all 3 BERT-family models. Multiple workarounds attempted (int64->int32 ONNX preprocessing, onnx-simplifier, flatbuffer_direct backend, static shapes) -- none resolved the core issue. The TF direct path (PyTorch checkpoint -> `TFAutoModelForSequenceClassification.from_pretrained(from_pt=True)` -> `tf.lite.TFLiteConverter`) works cleanly for all 3 models.

2. **MobileBERT as winner:** Highest holdout F1 (0.7719) by a significant margin over ELECTRA-small (0.7289). Despite being larger (93.5MB FP32 vs 51.7MB), expected INT8 size is ~23MB, within the 50MB budget.

3. **All models use 3 inputs (input_ids, attention_mask, token_type_ids):** Consistent with existing TextTokenizer.ts vocab. No tokenizer changes needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] onnx2tf int64/int32 type mismatch on all BERT-family models**
- **Found during:** Task 1 (TFLite conversion)
- **Issue:** onnx2tf (both tf_converter and flatbuffer_direct backends) fails with dtype mismatch errors when converting BERT-family ONNX models. The attention mask expansion path uses `Slice` and `Mul` ops that mix int64 constants with int32 inputs.
- **Fix:** Switched to TF direct path: `TFAutoModelForSequenceClassification.from_pretrained(checkpoint, from_pt=True)` -> `tf.function` with static shapes -> `tf.lite.TFLiteConverter.from_concrete_functions()`. This bypasses ONNX entirely.
- **Files modified:** research/notebooks/architecture_benchmark.ipynb (cells 12-18 use TF direct path)
- **Verification:** All 3 models convert successfully, validate with LiteRT, produce correct [1,2] output shapes
- **Committed in:** 33ef437 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking)
**Impact on plan:** TFLite conversion path changed from ONNX->onnx2tf to TF direct path. Functionally equivalent output (same .tflite files). No impact on downstream phases.

## Issues Encountered

- Previous conversion attempt (via `research/scripts/benchmark_tflite_convert.py`) also failed with same onnx2tf error, producing empty tflite directories and a tflite_results.json with all failures. These artifacts are gitignored.
- The `flatbuffer_direct` backend in onnx2tf produced a model with `ONNX_GEMM` custom op that causes XNNPACK delegate failure at runtime. Not viable.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Pending:** Task 3 checkpoint -- user review of architecture selection rationale
- After approval, Phase 2 (TEXT-02) is complete
- Phase 3 (teacher fine-tuning with DeBERTa-v3-large) can begin
- Binary baseline F1=0.7719 is the hard gate for Phase 4 distillation
- Winner model ID: `google/mobilebert-uncased`, checkpoint at `research/models/benchmark_tmp/mobilebert/checkpoint-3444`

## Known Stubs

None -- all data is real from training results and TFLite conversion.

## Self-Check: PENDING

Will be completed after Task 3 checkpoint approval.

---
*Phase: 02-architecture-benchmark*
*Plan: 02*
*Status: Awaiting checkpoint approval (Task 3)*
