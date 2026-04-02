# Architecture: Text Classification Research Pipeline Integration

**Domain:** On-device ML research pipeline → mobile app deployment
**Researched:** 2026-04-01
**Overall confidence:** HIGH (based on direct codebase analysis + verified external sources)

---

## Overview

This document answers four integration questions:

1. Where do new notebooks and scripts go in `research/`?
2. What does the model export → app deployment flow look like step-by-step?
3. If we switch from MobileBERT to a different architecture, what changes in `canaryapp/services/ondevice/`?
4. What is the model input format for each candidate architecture, and does it affect `TextPreprocessingService`?

---

## Pipeline Stages and Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  STAGE 1: DATA GENERATION                                                   │
│  research/scripts/generate_dataset.py                                       │
│  ├── LLM API calls (Google Gemini via google-genai SDK)                     │
│  ├── Prompt templates per scam vector                                        │
│  └── Output: research/data/synthetic_scam_v1.jsonl  (gitignored)           │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STAGE 2: ARCHITECTURE BENCHMARK                                            │
│  research/notebooks/architecture_benchmark.ipynb                            │
│  ├── Loads synthetic dataset                                                │
│  ├── Fine-tunes MobileBERT / DistilBERT / TinyBERT-4 on same split         │
│  ├── Records: accuracy, F1, inference ms, model size MB                     │
│  └── Output: research/models/benchmark_results.json  (gitignored)          │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STAGE 3: KNOWLEDGE DISTILLATION TRAINING                                   │
│  research/notebooks/distillation_training.ipynb                             │
│  ├── Teacher: RoBERTa-base or DeBERTa-v3-base (fine-tuned on full dataset) │
│  ├── Student: winning architecture from Stage 2 benchmark                  │
│  ├── Distillation loss: KL divergence on soft labels + CE on hard labels    │
│  └── Output: research/models/student_finetuned/  (gitignored)              │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STAGE 4: QAT + EXPORT                                                      │
│  research/notebooks/qat_export.ipynb                                        │
│  ├── Applies TF Model Optimization Toolkit QAT to student model            │
│  ├── Exports to SavedModel → TFLiteConverter with INT8 target               │
│  ├── Verifies: tensor names, shapes, dtypes, dummy inference                │
│  └── Output: research/models/canary_text_v2_int8.tflite  (gitignored)     │
│                                                                             │
│  research/scripts/export_tflite.py  (refactored from convert_onnx_to_tflite.py)│
│  └── CLI wrapper for conversion; runs verify_tflite() automatically        │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STAGE 5: EVALUATION                                                        │
│  research/scripts/evaluate_model.py  (extended from test_tflite.py)        │
│  ├── Loads .tflite, runs test split                                         │
│  ├── Reports: accuracy, precision, recall, F1, latency p50/p95             │
│  └── Gate: must hit >92% F1 on held-out scam vectors before deploy         │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STAGE 6: APP DEPLOYMENT                                                    │
│  Manual copy (no automated sync):                                           │
│  cp research/models/canary_text_v2_int8.tflite \                           │
│     canaryapp/assets/models/mobilebert_scam_intent.tflite                  │
│  (vocab.txt copied only if tokenizer changes — see below)                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Research Directory Layout

### Where New Files Go

```
research/
├── notebooks/
│   ├── mobilebert_scam_intent.ipynb          # EXISTING — baseline (broken, keep for reference)
│   ├── improved_scam_classifier.ipynb        # EXISTING — partially improved
│   ├── architecture_benchmark.ipynb          # NEW — Stage 2: side-by-side comparison
│   ├── distillation_training.ipynb           # NEW — Stage 3: teacher→student distillation
│   └── qat_export.ipynb                      # NEW — Stage 4: QAT + TFLite export
│
├── scripts/
│   ├── convert_onnx_to_tflite.py             # EXISTING — keep, still useful for ONNX path
│   ├── test_tflite.py                        # EXISTING — extend, don't replace
│   ├── generate_dataset.py                   # NEW — Stage 1: LLM synthetic data generation
│   ├── export_tflite.py                      # NEW — Stage 4 CLI: TF SavedModel → TFLite
│   └── evaluate_model.py                     # NEW — Stage 5: full evaluation harness
│
├── data/                                      # gitignored
│   ├── README.md                             # EXISTING
│   ├── synthetic_scam_v1.jsonl               # NEW — generated dataset
│   └── test_split.jsonl                      # NEW — held-out evaluation set
│
├── models/                                    # gitignored
│   ├── canary_v3_int8.onnx                   # EXISTING
│   ├── teacher_finetuned/                    # NEW — RoBERTa/DeBERTa teacher weights
│   ├── student_finetuned/                    # NEW — distilled student weights
│   └── canary_text_v2_int8.tflite           # NEW — final production-ready model
│
└── docs/
    ├── ONNX_TO_TFLITE_CONVERSION.md          # EXISTING
    ├── VISUAL_CLASSIFIER_INTEGRATION.md      # EXISTING
    └── TEXT_PIPELINE_GUIDE.md               # NEW — documents the full 6-stage pipeline
```

**Rationale for split between notebooks and scripts:**
- Notebooks: exploratory work with charts, intermediate inspection, training loops with progress bars
- Scripts: non-interactive steps that run headless (data generation, export, evaluation) — these will eventually become part of a repeatable pipeline

---

## 2. Model Export → App Deployment: Step-by-Step

### Step 1: Train and save student model (research/notebooks/qat_export.ipynb)

The notebook fine-tunes a QAT-enabled model using TensorFlow Model Optimization Toolkit and calls `model.save()` to produce a TF SavedModel in `research/models/student_finetuned/`.

### Step 2: Convert to TFLite (research/scripts/export_tflite.py)

```
python research/scripts/export_tflite.py \
  --input  research/models/student_finetuned/ \
  --output research/models/canary_text_v2_int8.tflite \
  --quantize int8
```

The script must call the existing `verify_tflite()` pattern from `test_tflite.py` to confirm:
- Input count (1 or 2 tensors — see architecture table below)
- Input shapes match expected sequence length (128)
- Input dtype is int32 (required by `TextClassifierService.ts`)
- Output shape is `[1, 2]` with float32 dtype (required by softmax path in `classifyWithModel`)

**Critical check:** The verify step must print input/output details in the same format as the existing `test_tflite.py` output. If shape or dtype differs from what `TextClassifierService.ts` expects, the app integration must be updated before copying.

### Step 3: Manual deployment to app

```bash
# Remove old model (project convention: no stale models in assets/models/)
rm canaryapp/assets/models/mobilebert_scam_intent.tflite

# Copy new model — keep the same filename so no app code changes are needed
cp research/models/canary_text_v2_int8.tflite \
   canaryapp/assets/models/mobilebert_scam_intent.tflite
```

**If vocab.txt changes** (e.g., switching to a different tokenizer base):
```bash
cp research/data/new_vocab.txt canaryapp/assets/models/vocab.txt
```

The `vocab.txt` bundled in `canaryapp/assets/models/` is the standard BERT 30,522-token vocabulary. All three candidate architectures (MobileBERT, DistilBERT, TinyBERT) use this same vocabulary. **Do not replace vocab.txt unless switching to a non-BERT-family tokenizer.**

### Step 4: Verify in app

After copying:
1. Run `cd canaryapp && npx expo start`
2. The app will log `[ModelLoader] Text model loaded in Xms` and `[TextClassifier] Model inputs: [...]`
3. Verify logged input shape matches `[1, 128]` and dtype shows `int32`
4. Run a test scan — check `[TextClassifier] TFLite probs:` log line shows plausible output

---

## 3. Architecture Switch Impact on canaryapp/services/ondevice/

### Candidate Architectures: Input Format Comparison

| Architecture | HF Model ID | Params | TFLite Size (Int8) | Inputs Required | Input Names | Vocab Compatible |
|---|---|---|---|---|---|---|
| MobileBERT (current) | `google/mobilebert-uncased` | 25M | ~25MB | 2: input_ids + attention_mask | varies by export | Yes (30522) |
| DistilBERT | `distilbert-base-uncased` | 66M | ~65MB | 2: input_ids + attention_mask | `input_ids`, `attention_mask` | Yes (30522) |
| TinyBERT-4 | `huawei-noah/TinyBERT_General_4L_312D` | 14.5M | ~14MB | 3: input_ids + attention_mask + token_type_ids | varies | Yes (30522) |
| TinyBERT-6 | `huawei-noah/TinyBERT_General_6L_768D` | 67M | ~65MB | 3: same | varies | Yes (30522) |

**Recommendation: TinyBERT-4 as the target student architecture.** At 14.5M parameters and ~14MB Int8, it fits the 50MB budget with headroom for the visual model. It is 3.1x faster than DistilBERT on inference benchmarks and matches DistilBERT GLUE scores. DistilBERT at ~65MB is too close to the budget ceiling.

### Token Type IDs: The Key Difference

MobileBERT and DistilBERT exported to TFLite via the standard HuggingFace → ONNX → onnx2tf path typically produce **2-input models** (input_ids + attention_mask). `token_type_ids` is zeroed out by default in single-sequence classification and is often omitted during export.

TinyBERT-4 exports may produce **3-input models** depending on the export path. This is the only structural change that requires a code update.

### Files That Change

#### Always required when replacing the .tflite file

**`canaryapp/services/ondevice/types.ts`** — MODIFY

Update `DEFAULT_MODEL_CONFIG.textModel`:
```typescript
// Change name and version to match new model
textModel: {
  name: 'canary_text_v2_int8',  // was: 'canary_v3_int8'
  version: '2.0.0',              // was: '3.0.0'
  inputShape: [1, 128],
  outputShape: [1, 2],
},
```

**`canaryapp/services/ondevice/ModelLoaderService.ts`** — MODIFY (filename only if renamed)

Currently hardcodes:
```typescript
const asset = Asset.fromModule(require('../../assets/models/mobilebert_scam_intent.tflite'));
```

If the new `.tflite` file keeps the name `mobilebert_scam_intent.tflite`, this file needs **no changes**. This is the recommended approach — keep the filename stable and only swap the file content.

#### Required only if switching to 3-input architecture (TinyBERT-4 with token_type_ids)

**`canaryapp/services/ondevice/TextClassifierService.ts`** — MODIFY

The `classifyWithModel` function currently handles 1 or 2 inputs:
```typescript
const inputArrays: Int32Array[] = [inputIdsTyped];
if (model.inputs.length >= 2) {
  const attentionMaskTyped = new Int32Array(attentionMask);
  inputArrays.push(attentionMaskTyped);
}
```

To support 3 inputs (token_type_ids — all zeros for single-sentence classification):
```typescript
if (model.inputs.length >= 3) {
  const tokenTypeIds = new Int32Array(DEFAULT_MODEL_CONFIG.maxSequenceLength).fill(0);
  inputArrays.push(tokenTypeIds);
}
```

This is a 3-line addition, not a rewrite. The existing `model.inputs.length` guard already anticipates variable input counts.

**`canaryapp/services/ondevice/TextTokenizer.ts`** — NO CHANGES

The tokenizer produces `inputIds` and `attentionMask`. The `encodeForModel` function output is sufficient for all BERT-family models. `token_type_ids` is all-zeros for single-sequence tasks and can be generated inline in `TextClassifierService` without touching the tokenizer.

#### Required only if changing sequence length (not recommended)

**`canaryapp/services/ondevice/types.ts`** — MODIFY `maxSequenceLength`

All three candidate architectures support 512 max sequence length but are most efficient at 128. Keep `maxSequenceLength: 128` unless evaluation shows the truncation is causing significant accuracy loss on long scam texts.

### Files That Do NOT Change

| File | Reason |
|---|---|
| `canaryapp/services/ondevice/TextTokenizer.ts` | All candidates use BERT WordPiece tokenization with the same 30,522 vocab |
| `canaryapp/services/ondevice/FusionEngine.ts` | Consumes `TextAnalysisResult.riskScore` — architecture-agnostic |
| `canaryapp/services/ondevice/OCRService.ts` | Upstream of text classification — not affected |
| `canaryapp/services/ondevice/OnDeviceScamAnalyzer.ts` | Delegates to TextClassifierService; text-only mode logic unchanged |
| `canaryapp/services/ondevice/index.ts` | Public API surface unchanged |
| `canaryapp/hooks/useScanner.ts` | State machine unchanged |
| `canaryapp/app/(tabs)/index.tsx` | Unchanged |

---

## 4. Input Format Analysis Per Architecture

### Shared foundation: all three use BERT WordPiece tokenization

MobileBERT, DistilBERT, and TinyBERT all use `bert-base-uncased` vocabulary (30,522 tokens). The existing `TextTokenizer.ts` implementation — WordPiece tokenization, `[CLS]`/`[SEP]` insertion, padding to 128, `Int32Array` output — is compatible with all three without modification.

### Input tensor specification per architecture (TFLite export, sequence length 128)

| Tensor | Shape | DType | MobileBERT | DistilBERT | TinyBERT-4 |
|---|---|---|---|---|---|
| `input_ids` | `[1, 128]` | `int32` | Required | Required | Required |
| `attention_mask` | `[1, 128]` | `int32` | Required | Required | Required |
| `token_type_ids` | `[1, 128]` | `int32` | Omitted on export | Omitted on export | Present on some exports |

**Note on token_type_ids:** When exporting via HuggingFace Optimum → ONNX → onnx2tf, `token_type_ids` is frequently omitted for classification tasks because it is all-zeros. Verify the actual exported model's input count with `verify_tflite()` before writing app code — do not assume from architecture alone.

### Output tensor specification (same for all candidates)

| Tensor | Shape | DType | Semantics |
|---|---|---|---|
| `logits` | `[1, 2]` | `float32` | `[safe_logit, scam_logit]` — apply softmax, index 1 = scam probability |

The existing `classifyWithModel` softmax path in `TextClassifierService.ts` handles this correctly and does not change.

### Impact on TextPreprocessingService (TextTokenizer.ts)

**No changes required** regardless of which architecture wins the benchmark.

The critical invariant is the vocabulary file (`vocab.txt`, 30,522 tokens). All candidates share it. The `encodeForModel` function already produces `inputIds` (Int32Array) and `attentionMask` (Int32Array), both length 128. These are exactly the tensors all three architectures expect.

---

## Component Boundary Table

| Component | Location | Status | Change Trigger |
|---|---|---|---|
| Dataset generator | `research/scripts/generate_dataset.py` | NEW | — |
| Benchmark notebook | `research/notebooks/architecture_benchmark.ipynb` | NEW | — |
| Distillation notebook | `research/notebooks/distillation_training.ipynb` | NEW | — |
| QAT export notebook | `research/notebooks/qat_export.ipynb` | NEW | — |
| TFLite export script | `research/scripts/export_tflite.py` | NEW | Replaces ONNX-only `convert_onnx_to_tflite.py` path |
| Evaluation script | `research/scripts/evaluate_model.py` | NEW | Extends `test_tflite.py` |
| `.tflite` model file | `canaryapp/assets/models/mobilebert_scam_intent.tflite` | REPLACE | After Stage 5 gate passes |
| `vocab.txt` | `canaryapp/assets/models/vocab.txt` | NO CHANGE | Only if switching to non-BERT tokenizer |
| `types.ts` | `canaryapp/services/ondevice/types.ts` | MODIFY | Update `textModel.name` + `version` |
| `ModelLoaderService.ts` | `canaryapp/services/ondevice/ModelLoaderService.ts` | NO CHANGE | Assuming filename stays the same |
| `TextClassifierService.ts` | `canaryapp/services/ondevice/TextClassifierService.ts` | CONDITIONAL | Only if new model has 3 inputs |
| `TextTokenizer.ts` | `canaryapp/services/ondevice/TextTokenizer.ts` | NO CHANGE | Vocab-compatible across all candidates |
| `FusionEngine.ts` | `canaryapp/services/ondevice/FusionEngine.ts` | NO CHANGE | — |
| `OnDeviceScamAnalyzer.ts` | `canaryapp/services/ondevice/OnDeviceScamAnalyzer.ts` | NO CHANGE | — |

---

## Build Order (Dependency Graph)

```
TEXT-01: generate_dataset.py
   └── TEXT-02: architecture_benchmark.ipynb
         └── TEXT-03: distillation_training.ipynb (uses benchmark winner as student)
               ├── TEXT-04: distillation_training.ipynb (distillation phase)
               └── TEXT-05: qat_export.ipynb (QAT applied to distilled student)
                     └── export_tflite.py + evaluate_model.py
                           └── TEXT-06: cp to canaryapp/assets/models/ + app code update
```

TEXT-02 and TEXT-03 are intentionally merged in the milestone requirements: the benchmark picks the architecture, then distillation training happens on that architecture. They are separate notebooks but sequential in execution.

TEXT-04 (distillation) and TEXT-05 (QAT) feed into the same export step. QAT is applied to the already-distilled student, not to the teacher.

---

## Critical Pitfall: ONNX vs. Native TF Training Path

The existing pipeline trains in PyTorch (HuggingFace Transformers) and converts ONNX → TFLite. This path works but adds a conversion step that can introduce tensor name mismatches and dtype issues (confirmed by existing `research/models/canary_v3_int8.onnx` + related conversion bugs in commit history).

**Recommended alternative path for new pipeline:** Train natively in TensorFlow/Keras using `TFDistilBertForSequenceClassification` or `TFMobileBertForSequenceClassification`. This enables:
- Direct `model.save()` → `TFLiteConverter.from_saved_model()` without ONNX intermediary
- QAT via TF Model Optimization Toolkit (requires TF training — incompatible with PyTorch weights)
- Guaranteed int32 input types (no float32 dtype conversion issues seen in onnx2tf)

If the team prefers to keep the PyTorch training workflow, use Optimum's `optimum-cli export tflite` command instead of the manual onnx2tf path — it handles BERT family input signatures more reliably than the current `convert_onnx_to_tflite.py` manual conversion.

---

## Sources

- react-native-fast-tflite: [https://github.com/mrousavy/react-native-fast-tflite](https://github.com/mrousavy/react-native-fast-tflite)
- TinyBERT benchmark (3.1x faster than DistilBERT): [TinyBERT ACL Findings 2020](https://aclanthology.org/2020.findings-emnlp.372.pdf)
- Comparative analysis TinyBERT / MobileBERT energy consumption: [Nature Scientific Reports 2025](https://www.nature.com/articles/s41598-025-07821-w)
- Hugging Face Optimum TFLite export: [https://huggingface.co/docs/optimum/exporters/tflite/usage_guides/export_a_model](https://huggingface.co/docs/optimum/exporters/tflite/usage_guides/export_a_model)
- QAT for BERT (QDQBERT): [https://huggingface.co/docs/transformers/en/model_doc/qdqbert](https://huggingface.co/docs/transformers/en/model_doc/qdqbert)
- TF QAT guide: [https://www.tensorflow.org/model_optimization/guide/quantization/training](https://www.tensorflow.org/model_optimization/guide/quantization/training)
- Synthetic data for scam detection (IEEE 2025): [https://ieeexplore.ieee.org/iel8/10973324/10973328/10973460.pdf](https://ieeexplore.ieee.org/iel8/10973324/10973328/10973460.pdf)
- LiteRT INT8 quantization spec: [https://ai.google.dev/edge/litert/conversion/tensorflow/quantization/quantization_spec](https://ai.google.dev/edge/litert/conversion/tensorflow/quantization/quantization_spec)
- onnx2tf INT8 limitations with NLP models: [https://github.com/PINTO0309/onnx2tf/issues/248](https://github.com/PINTO0309/onnx2tf/issues/248)
