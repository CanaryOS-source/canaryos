# Technology Stack — Text Classification Research Milestone

**Project:** CanaryOS v1.0 Text Classification Research
**Researched:** 2026-04-01
**Scope:** Stack additions only — existing React Native / Firebase / TFLite / base HuggingFace stack is already validated.

---

## 1. Synthetic Dataset Generation

### Recommended API

**Google Gemini** via the `google-genai` Python SDK (the current unified Google Gen AI SDK — not the deprecated `google-generativeai` package).

| Library | Version | Purpose |
|---------|---------|---------|
| `google-genai` | `>=1.0.0` | Structured synthetic data generation via Gemini API |

**Rationale:** Gemini 2.5 Flash supports native JSON Schema structured outputs enforced server-side via `response_mime_type='application/json'` + `response_json_schema`. The user has an existing Gemini API key. For generating 16K–24K labeled scam/safe examples across 8 scam vectors, Gemini 2.5 Flash provides strong generation quality at low cost.

**Why NOT use local Mistral-7B:** Requires a GPU environment not currently in the research stack. The hosted API is cheaper and faster for this dataset size.

**Generation pattern:**

```python
from google import genai
from google.genai import types
from pydantic import BaseModel

client = genai.Client(api_key=GEMINI_API_KEY)

class ScamSample(BaseModel):
    text: str
    label: str          # "scam" or "safe"
    vector: str         # e.g., "crypto", "romance", "tech_support"
    channel: str        # "sms", "email", "app_notification"

response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=GENERATION_PROMPT,
    config=types.GenerateContentConfig(
        response_mime_type="application/json",
        response_json_schema=ScamSample.model_json_schema(),
    ),
)
import json
sample = ScamSample(**json.loads(response.text))
```

**Scam vectors to cover (informed by PROJECT.md):** crypto/investment, romance, tech support, government impersonation, lottery/reward, urgency-payment, phishing, remote access. Safe-class examples must match channel and register (SMS, email header, app notification) to prevent distribution shift.

**Quality control:** Two-pass filter — (1) LLM self-evaluation prompt per generated sample, (2) rule-based post-filter removing duplicates and samples under 15 tokens. Target 80/10/10 train/val/test split stratified by scam vector.

**Confidence:** MEDIUM — Gemini structured outputs via `response_json_schema` are well-documented in the current SDK. Dataset quality depends on prompt engineering, which requires experimentation.

---

## 2. Model Architecture Recommendations

### Benchmark Set

Based on verified benchmarks (Zenodo comparative study 2025, arxiv 2601.03290):

| Model | Params | GLUE Score | Inference (Pixel 4) | TFLite Export | Verdict |
|-------|--------|------------|---------------------|---------------|---------|
| MobileBERT | 25.3M | 77.7 | 62ms | Yes (optimum ≤1.x) | Baseline |
| TinyBERT-4 | 14.5M | 77.0 | 62ms | Yes (optimum ≤1.x) | Primary candidate |
| DistilBERT | 66M | 77.0 | ~120ms | Yes (optimum ≤1.x) | Too large |
| ALBERT-base | 12M | 79.1 | ~80ms | Yes (optimum ≤1.x) | Worth evaluating |
| ELECTRA-small | 14M | 79.2 | ~55ms | Yes (optimum ≤1.x) | Strong candidate |

**Recommended evaluation order:**
1. **TinyBERT-4** (`huawei-noah/TinyBERT_General_4L_312D`) — 14.5M params, 62ms inference, 7.5x smaller than BERT-base. Best size/accuracy tradeoff. Distillation-pretrained, task-specific fine-tune on top.
2. **ELECTRA-small** (`google/electra-small-discriminator`) — 14M params, superior GLUE per parameter than MobileBERT. Replace generative pretraining loss with discriminative task — better sample efficiency for limited scam datasets.
3. **MobileBERT** (`google/mobilebert-uncased`) — existing baseline, keep for continuity comparison.
4. **ALBERT-base-v2** — 12M params but slower inference due to cross-layer parameter sharing; evaluate only if TinyBERT/ELECTRA underperform.

**What NOT to evaluate:** DistilBERT (66M, too large for 50MB budget once quantized), ModernBERT (no TFLite export path, no TF implementation), EfficientFormer (vision-only).

**Confidence:** HIGH — benchmark numbers are from peer-reviewed sources and HuggingFace official model cards.

---

## 3. Knowledge Distillation Pipeline

### Teacher Model

**`cross-encoder/roberta-large-MS-MARCO-MNLIv2`** or **`roberta-large`** fine-tuned in-notebook.

| Library | Version | Purpose |
|---------|---------|---------|
| `transformers` | `>=4.48.0` | Teacher + student model loading, Trainer API |
| `datasets` | `>=3.0.0` | Dataset management, stratified splits |
| `evaluate` | `>=0.4.0` | Metrics (F1, precision, recall, AUC) |

**Distillation approach — task-specific (not general):**

Fine-tune RoBERTa-large on the synthetic scam dataset first (teacher). Then distill into TinyBERT-4 or ELECTRA-small student using the Trainer API with a custom distillation loss:

```python
# Loss = alpha * CE(student_logits, labels) + (1-alpha) * KL(student_soft, teacher_soft / T)
# Recommended: alpha=0.5, T=4 (temperature)
```

**Why RoBERTa-large as teacher (not DeBERTa-v3-large):** RoBERTa-large has a TF implementation in `transformers`, making it compatible with the TF-based QAT pipeline below. DeBERTa-v3 is PyTorch-only in HuggingFace, which would require a dual-framework pipeline. RoBERTa-large achieves 90+ F1 on most classification benchmarks.

**Alternative teacher:** `facebook/roberta-large-mnli` (pre-trained on NLI, zero-shot transfers well to intent classification). Use if compute budget is tight — avoids teacher fine-tuning step.

**Confidence:** MEDIUM — distillation from RoBERTa to TinyBERT is well-documented in HuggingFace examples. Temperature and alpha values require tuning.

---

## 4. Quantization-Aware Training

### Library

| Library | Version | Purpose |
|---------|---------|---------|
| `tensorflow` | `2.15.x` or `2.16.x` | Model training, SavedModel export |
| `tensorflow-model-optimization` (TFMOT) | `>=0.8.0` | QAT wrapper, Int8 quantization |

**Why TF 2.15/2.16 specifically:** TF 2.17+ changes the Keras API substantially (Keras 3.x). TFMOT QAT is tested against Keras 2.x. Staying on TF 2.15 or 2.16 avoids breakage between `tf.keras` and standalone `keras`. Check current `.venv` version before upgrading.

**QAT workflow:**

```python
import tensorflow_model_optimization as tfmot

# After converting HuggingFace student model to TF SavedModel:
quantize_model = tfmot.quantization.keras.quantize_model
q_aware_model = quantize_model(student_tf_model)
q_aware_model.compile(optimizer='adam', loss='sparse_categorical_crossentropy', metrics=['accuracy'])
q_aware_model.fit(train_data, epochs=3)  # Short QAT fine-tune

# Convert to TFLite Int8
converter = tf.lite.TFLiteConverter.from_keras_model(q_aware_model)
converter.optimizations = [tf.lite.Optimize.DEFAULT]
converter.representative_dataset = representative_dataset_gen
converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
converter.inference_input_type = tf.int8
converter.inference_output_type = tf.int8
tflite_model = converter.convert()
```

**Known issue — static shapes:** TFLite requires static input shapes. Set `sequence_length=128` (or lower, evaluate at 64 for latency) at conversion time. The existing broken MobileBERT model had input shape fixed at 1x5 — this was a conversion bug, not a fundamental limitation. Fix: pass explicit `--sequence_length` during export.

**Confidence:** HIGH — TFMOT QAT documentation updated January 2026, TF 2.15 LTS support confirmed.

---

## 5. HuggingFace → TFLite Conversion Pipeline

### Critical Finding: Optimum TFLite is Deprecated

`huggingface/optimum` v2.0.0 (released October 2025) **officially deprecated and removed TFLite export**. Current latest is v2.1.0. The `optimum-cli export tflite` command no longer works on pip-installed optimum.

**Do NOT add `optimum>=2.0` to the research environment for TFLite export.**

### Recommended Conversion Path

Use `optimum==1.27.0` (last version with TFLite support) OR the manual TF SavedModel path:

**Option A — Pin optimum 1.x (simpler, supports MobileBERT/TinyBERT/ELECTRA directly):**

```bash
pip install "optimum==1.27.0" "transformers>=4.48.0"
```

```bash
optimum-cli export tflite \
  --model ./student_finetuned \
  --task sequence-classification \
  --sequence_length 128 \
  --batch_size 1 \
  ./output_tflite/
```

Supported architectures in optimum 1.27: BERT, MobileBERT, DistilBERT, ELECTRA, ALBERT, RoBERTa, XLM-RoBERTa — all candidates are covered.

**Option B — Manual pipeline (more control, no version pinning):**

```
PyTorch model (HuggingFace) → TF SavedModel → TFLite (via tf.lite.TFLiteConverter)
```

1. `model.save_pretrained()` in PyTorch format
2. Load with `TFAutoModelForSequenceClassification.from_pretrained(pt_model_path, from_pt=True)`
3. Export: `tf.saved_model.save(tf_model, "./saved_model")`
4. Convert: `TFLiteConverter.from_saved_model("./saved_model")`

This path is more brittle for newer architectures but ELECTRA and MobileBERT have TF implementations in `transformers`.

**Option C — ONNX intermediate (most robust for PyTorch-trained models):**

```
PyTorch model → ONNX (via optimum-onnx or torch.onnx.export) → TFLite (via onnx2tf)
```

| Library | Version | Purpose |
|---------|---------|---------|
| `onnx` | `>=1.16.0` | ONNX format handling |
| `onnxruntime` | `>=1.18.0` | ONNX validation and inference check |
| `onnx2tf` | `>=1.26.0` | ONNX → TFLite conversion (actively maintained 2025) |

`onnx2tf` by PINTO0309 is actively maintained through 2025 with recent updates for quantized ONNX graph support and dynamic tensor conversion. It handles BERT-family transpose issues that broke `onnx-tensorflow`.

**Recommended default: Option A (optimum 1.27.0 pinned).** Only fall back to Option C if dynamic shape or quantized ONNX is needed.

**Confidence:** HIGH for the deprecation finding (confirmed from official optimum release notes). MEDIUM for Option C onnx2tf path with BERT-family (transformer ops coverage varies, test needed).

---

## 6. Supporting Research Libraries

These are already in the research environment per STACK.md but versions should be pinned:

| Library | Pin Version | Notes |
|---------|-------------|-------|
| `scikit-learn` | `>=1.4.0` | Train/test split, classification_report, confusion_matrix |
| `numpy` | `>=1.26.0, <2.0` | numpy 2.0 breaks several TF/ONNX libraries — stay on 1.x |
| `pandas` | `>=2.1.0` | Dataset management |
| `matplotlib` | `>=3.8.0` | Confusion matrix visualization, training curves |
| `seaborn` | `>=0.13.0` | Heatmaps for benchmark comparison |

**numpy <2.0 is critical.** numpy 2.0 removed deprecated APIs that `onnxruntime` and `tensorflow` 2.15 depend on. This is a known breakage.

---

## 7. What NOT to Add

| Package | Why Not |
|---------|---------|
| `optimum>=2.0` | TFLite removed, ONNX moved to separate package |
| `torch` (PyTorch) | Not in existing stack; adds 2GB to research env; use TF path throughout |
| `sentence-transformers` | Overkill for binary/multi-class scam classification; SBERT embeddings not needed |
| `accelerate` (HuggingFace) | GPU training optimization; research env is CPU/colab; adds complexity without benefit |
| `langchain` | No agentic workflows needed; direct OpenAI SDK sufficient for data gen |
| `jax` / `flax` | Third framework adds confusion; TF and TFMOT are sufficient |
| `DeBERTa-v3` | PyTorch-only in HF, no TF implementation — requires dual framework pipeline |

---

## 8. Integration Points with Existing Stack

**Research → App flow (unchanged):**

```
research/notebooks/ → trained + quantized .tflite
  → copy to canaryapp/assets/models/mobilebert_scam_intent.tflite
  → existing ModelLoaderService.ts picks it up (no changes required)
  → existing vocab.txt stays IF using MobileBERT tokenizer
  ⚠ If switching to TinyBERT or ELECTRA: vocab.txt must be replaced; tokenizer differs
```

**Tokenizer change implication:** TinyBERT-4 uses the same WordPiece vocabulary as BERT-base (`bert-base-uncased`), not MobileBERT's vocabulary. If the winner is TinyBERT or ELECTRA, `vocab.txt` in `canaryapp/assets/models/` must be updated to the new model's vocabulary. The existing `TokenizerService` in `canaryapp/services/ondevice/` will need to reference the new file.

**Input format constraint:** The existing on-device pipeline passes tokenized `input_ids` and `attention_mask` as flat Int32 arrays to TFLite. This format is consistent across MobileBERT, TinyBERT, ELECTRA, and ALBERT — no change to `ModelLoaderService.ts` or the fusion engine required for any of the benchmark candidates.

**Model size check:** At Int8 quantization, expected sizes:
- TinyBERT-4: ~15–18MB
- ELECTRA-small: ~14–17MB
- MobileBERT: ~25–28MB

All are well within the 50MB budget. No pruning needed unless size unexpectedly balloons.

---

## 9. Installation Pinning

```bash
# Core research additions (add to research requirements or notebook setup cell)
pip install \
  "google-genai>=1.0.0" \
  "transformers>=4.48.0,<5.0" \
  "datasets>=3.0.0" \
  "evaluate>=0.4.0" \
  "optimum==1.27.0" \
  "tensorflow>=2.15.0,<2.17.0" \
  "tensorflow-model-optimization>=0.8.0" \
  "onnx>=1.16.0" \
  "onnxruntime>=1.18.0" \
  "onnx2tf>=1.26.0" \
  "numpy>=1.26.0,<2.0" \
  "scikit-learn>=1.4.0" \
  "pandas>=2.1.0" \
  "matplotlib>=3.8.0" \
  "seaborn>=0.13.0"
```

---

## Sources

- Optimum release notes (v1.27.0 deprecation warning, v2.0 removal confirmed): https://github.com/huggingface/optimum/releases
- Optimum TFLite export documentation (last stable): https://huggingface.co/docs/optimum/exporters/tflite/overview
- Optimum supported TFLite architectures: https://huggingface.co/docs/optimum/en/exporters/tflite/usage_guides/export_a_model
- MobileBERT HuggingFace model card: https://huggingface.co/docs/transformers/en/model_doc/mobilebert
- Comparative study: DistilBERT/TinyBERT/MobileBERT (Zenodo 2025): https://zenodo.org/records/15907007
- Lightweight transformer architectures survey (arxiv 2025): https://arxiv.org/abs/2601.03290
- TFMOT QAT documentation (updated January 2026): https://www.tensorflow.org/model_optimization/guide/quantization/training
- TFLite post-training quantization: https://ai.google.dev/edge/litert/conversion/tensorflow/quantization/post_training_quantization
- onnx2tf actively maintained converter: https://github.com/PINTO0309/onnx2tf
- Synthetic data for scam detection (IEEE 2025): https://ieeexplore.ieee.org/iel8/10973324/10973328/10973460.pdf
- Google Gen AI Python SDK (google-genai): https://github.com/googleapis/python-genai
- Gemini structured output with JSON schema: https://ai.google.dev/gemini-api/docs/structured-output
- HuggingFace transformers TFLite known issues: https://github.com/huggingface/transformers/issues/19231
- Knowledge distillation BERT (Phil Schmid): https://www.philschmid.de/knowledge-distillation-bert-transformers
