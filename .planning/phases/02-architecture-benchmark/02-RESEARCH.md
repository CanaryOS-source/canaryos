# Phase 2: Architecture Benchmark - Research

**Researched:** 2026-04-04
**Domain:** PyTorch fine-tuning on Apple Silicon MPS, TFLite conversion via ONNX, architecture selection for on-device NLP
**Confidence:** HIGH

## Summary

Phase 2 benchmarks three student architectures (MobileBERT 25.3M, TinyBERT-4 14.5M, ELECTRA-small 14M) on the Phase 1 synthetic dataset, converts each to TFLite, measures INT8 model size and desktop inference latency, and selects the winner based on F1 on the real-world holdout. The benchmark is a ranking exercise with fixed hyperparameters (3-5 epochs, lr=2e-5) -- optimization is deferred to Phase 4.

The environment is verified and mostly ready. PyTorch 2.9.1 with MPS is installed and confirmed working for TinyBERT-4 forward passes. The ONNX export path (PyTorch -> ONNX -> onnx2tf -> TFLite) is the viable conversion path because optimum 2.1.0 (currently installed) has removed TFLite export support. A critical gap exists: `accelerate` is not installed but is required by the HuggingFace `Trainer`. Several missing packages (`accelerate`, `evaluate`, `seaborn`) must be installed before training can begin. The `tflite_runtime` standalone package does not exist for macOS ARM64 -- use `ai_edge_litert` (already installed, version 2.1.2) or `tf.lite.Interpreter` as the TFLite runtime for latency measurement.

**Primary recommendation:** Train all three architectures in PyTorch with HuggingFace Trainer on MPS, export via `torch.onnx.export(dynamo=False)` -> `onnx2tf` -> TFLite, measure latency with `ai_edge_litert.interpreter.Interpreter`, and verify no SELECT_TF_OPS dependency.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** PyTorch + MPS (Apple Silicon GPU acceleration) is the primary training framework for this phase and all downstream phases (3, 4, 5)
- **D-02:** TFLite export via `optimum==1.27.0` (HuggingFace Optimum) -- not the manual ONNX->onnx2tf path. Dtype and tensor verification enforced at every export step.
- **D-03:** TF escape hatch -- if PyTorch causes significant blocking issues at ANY point in the pipeline, pivot to TensorFlow training on Google Colab (external GPU). Keep notebook structure TF-compatible enough that a restart on TF is feasible without rewriting from scratch. User has access to external compute (Colab) for TF if needed.
- **D-04:** Focused validation -- 3-5 epochs per model, fixed learning rate (2e-5), same batch size across all candidates. No hyperparameter sweep at this stage.
- **D-05:** Hyperparameter tuning deferred to the winning architecture in Phase 4 (distillation). The benchmark exists to rank candidates and establish a baseline, not to maximize each one's potential.
- **D-06:** All three models trained on identical data splits from Phase 1 (`research/data/synthetic_scam_v1.jsonl` train/val split)
- **D-07:** Evaluation on real-world holdout (`research/data/holdout_realworld.jsonl`) -- this is the primary metric for architecture selection, not synthetic test set performance
- **D-08:** Desktop TFLite interpreter only -- run `tflite_runtime` on Mac to measure relative inference speed between candidates. Sufficient for architecture ranking.
- **D-09:** On-device (canaryapp) latency measurement deferred to Phase 6 deployment validation. No need to build and deploy 3 models to the app for a benchmark phase.
- **D-10:** Three candidates benchmarked: MobileBERT (25.3M), TinyBERT-4 (14.5M), ELECTRA-small (14M)
- **D-11:** DistilBERT (66M) explicitly excluded -- over 50MB INT8 budget
- **D-12:** ELECTRA-small retained as third candidate -- different pretraining paradigm (replaced token detection vs masked LM) provides genuine alternative signal despite TinyBERT-4 being the frontrunner

### Claude's Discretion
- Exact epoch count within the 3-5 range (based on convergence behavior)
- Batch size selection (researcher picks based on MPS memory constraints)
- Whether to use mixed precision (fp16) during training for speed -- depends on MPS support
- Notebook cell structure and visualization choices

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEXT-02 | Head-to-head benchmark comparing MobileBERT, TinyBERT-4, ELECTRA-small; select student architecture for all subsequent training | All three architectures verified loadable in PyTorch (MPS confirmed). Tokenizers share identical 30,522 WordPiece vocab. ONNX export path tested. LiteRT interpreter available for TFLite validation. Environment gaps identified (accelerate, evaluate, seaborn need install). Training protocol documented. |
</phase_requirements>

## Standard Stack

### Core

| Library | Installed Version | Required Action | Purpose | Why Standard |
|---------|------------------|-----------------|---------|--------------|
| `torch` | 2.9.1 | None (ready) | Model training on MPS | MPS confirmed working for TinyBERT-4 forward/backward |
| `transformers` | 4.57.3 | None (ready) | Model loading, Trainer, tokenizers | All 3 architectures load correctly |
| `datasets` | 4.4.2 | None (ready) | Dataset loading, train/val splits | Standard HF data pipeline |
| `scikit-learn` | 1.8.0 | None (ready) | F1, classification_report, confusion_matrix | Metrics computation |
| `numpy` | 2.4.3 | None (ready*) | Array operations | *See Pitfall 5 on numpy<2.0 claim |
| `onnx` | 1.20.1 | None (ready) | ONNX model format | Intermediate export format |
| `onnxruntime` | 1.24.3 | None (ready) | ONNX model validation | Verify exported ONNX before TFLite conversion |
| `onnx2tf` | 2.3.9 | None (ready) | ONNX -> TFLite conversion | Primary TFLite conversion tool |
| `tensorflow` | 2.21.0-dev | None (ready) | TFLite conversion backend | Required by onnx2tf |
| `ai-edge-litert` | 2.1.2 | None (ready) | TFLite inference/latency measurement | Replaces deprecated `tflite_runtime` and `tf.lite.Interpreter` |
| `matplotlib` | 3.10.8 | None (ready) | Training curves, confusion matrices | Visualization |

### Missing (Must Install)

| Library | Version to Install | Purpose | Why Missing Matters |
|---------|-------------------|---------|---------------------|
| `accelerate` | `>=0.26.0` | HuggingFace Trainer requires it for PyTorch | **Training will not start without this** -- `Trainer.__init__` raises ImportError |
| `evaluate` | `>=0.4.0` | HF metrics integration (optional -- sklearn suffices) | Nice-to-have for Trainer compute_metrics callback |
| `seaborn` | `>=0.13.0` | Heatmaps for benchmark comparison tables | Visualization only |

### Decision D-02 Conflict: optimum==1.27.0

**CRITICAL FINDING:** Decision D-02 specifies `optimum==1.27.0` for TFLite export. However:

1. **optimum 2.1.0 is currently installed** and has **removed TFLite export entirely** (`optimum.exporters.tflite` module does not exist -- verified by import test).
2. **Downgrading to optimum 1.27.0 is risky** because optimum 1.27.0 requires `transformers<4.50` (based on dependency constraints) while the environment has `transformers==4.57.3`. Downgrading transformers would break other installed packages.
3. **optimum 1.27.0 TFLite export uses TensorFlow internally** and requires TF model classes, which are deprecated in transformers 4.57.3 (warning: "TensorFlow and JAX classes are deprecated and will be removed in Transformers v5").

**Recommended resolution:** Use the **ONNX -> onnx2tf** path instead (all tools already installed and verified). This achieves the same outcome (PyTorch model -> TFLite) without the version conflict. The planner should flag this to the user as a deviation from D-02, but the alternative path is functionally equivalent and avoids dependency hell.

**If user insists on optimum 1.27.0:** Create an isolated virtual environment specifically for the TFLite export step with pinned versions: `optimum==1.27.0`, `transformers>=4.45,<4.50`, `tensorflow>=2.15,<2.17`. This is the safest approach but adds environment management complexity.

### Installation Command

```bash
# In the project venv (.venv)
.venv/bin/python3 -m pip install "accelerate>=0.26.0" "evaluate>=0.4.0" "seaborn>=0.13.0"
```

## Architecture Patterns

### Recommended Notebook Structure

```
research/notebooks/
  architecture_benchmark.ipynb    # NEW -- the single deliverable notebook for Phase 2
```

### Notebook Cell Organization

```
Cell 1:  Environment setup (imports, device check, MPS verification)
Cell 2:  Data loading (synthetic_scam_v1.jsonl -> train/val split)
Cell 3:  Holdout loading (holdout_realworld.jsonl)
Cell 4:  Shared training configuration (epochs, lr, batch_size, data collator)
Cell 5:  Architecture A: MobileBERT -- load, train, evaluate
Cell 6:  Architecture B: TinyBERT-4 -- load, train, evaluate
Cell 7:  Architecture C: ELECTRA-small -- load, train, evaluate
Cell 8:  TFLite conversion for each (ONNX export -> onnx2tf -> verify)
Cell 9:  TFLite latency measurement (LiteRT interpreter, 100-run average)
Cell 10: TFLite SELECT_TF_OPS check (disqualification test)
Cell 11: Results aggregation -> benchmark_results.json
Cell 12: Winner selection rationale + binary baseline F1 recording
Cell 13: Visualization (comparison table, confusion matrices, training curves)
```

### Pattern 1: PyTorch Training with HuggingFace Trainer on MPS

**What:** Fine-tune each architecture using the Trainer API with MPS backend.
**When to use:** All three benchmark runs.

```python
import os
os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"  # MUST be set before torch import

import torch
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    Trainer,
    TrainingArguments,
)
from sklearn.metrics import f1_score, precision_recall_fscore_support

device = "mps" if torch.backends.mps.is_available() else "cpu"

def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = logits.argmax(axis=-1)
    precision, recall, f1, _ = precision_recall_fscore_support(
        labels, preds, average="binary", pos_label=1
    )
    return {"f1": f1, "precision": precision, "recall": recall}

training_args = TrainingArguments(
    output_dir="./research/models/benchmark_tmp",
    num_train_epochs=5,             # D-04: 3-5 range
    per_device_train_batch_size=16, # Adjust based on MPS memory
    per_device_eval_batch_size=32,
    learning_rate=2e-5,             # D-04: fixed
    eval_strategy="epoch",
    save_strategy="epoch",
    load_best_model_at_end=True,
    metric_for_best_model="f1",
    fp16=False,                     # MPS does NOT support fp16
    bf16=False,                     # MPS does NOT support bf16
    logging_steps=50,
    report_to="none",               # No W&B/TensorBoard
)
```

**Source:** HuggingFace Apple Silicon training docs, verified against transformers 4.57.3 TrainingArguments.

### Pattern 2: ONNX Export (Legacy Exporter)

**What:** Export fine-tuned PyTorch model to ONNX format.
**When to use:** After each architecture finishes training.

```python
import torch

model.eval()
dummy_inputs = tokenizer(
    "test text for export",
    return_tensors="pt",
    padding="max_length",
    max_length=128,
    truncation=True,
)

# MUST use dynamo=False -- the new dynamo exporter produces near-empty files
# for BERT-family models (verified: 37KB instead of ~55MB)
torch.onnx.export(
    model.cpu(),  # Export from CPU, not MPS
    tuple(dummy_inputs.values()),
    onnx_path,
    input_names=list(dummy_inputs.keys()),
    output_names=["logits"],
    dynamic_axes={name: {0: "batch", 1: "seq"} for name in dummy_inputs.keys()}
    | {"logits": {0: "batch"}},
    opset_version=14,
    dynamo=False,  # CRITICAL: legacy exporter required
)
```

**Source:** Verified by testing -- dynamo=True produces 37KB file, dynamo=False produces 54.8MB file for TinyBERT-4.

### Pattern 3: onnx2tf TFLite Conversion

**What:** Convert ONNX model to TFLite with INT8 quantization.
**When to use:** After ONNX export succeeds.

```python
import subprocess

# Basic conversion (FP32 for benchmark)
subprocess.run([
    ".venv/bin/python3", "-m", "onnx2tf",
    "-i", onnx_path,
    "-o", tflite_output_dir,
    "-oiqt",             # INT8 quantization
    "-nuo",              # Non-unique name output
    "--output_signaturedefs",
], check=True)

# The output TFLite file will be in tflite_output_dir/
```

**Note:** onnx2tf requires a representative dataset for INT8 quantization calibration. For the benchmark phase, use a subset of the training data (100-500 samples).

### Pattern 4: TFLite Validation with LiteRT

**What:** Verify TFLite model inputs/outputs and measure latency.
**When to use:** After each TFLite conversion.

```python
from ai_edge_litert import interpreter as litert
import numpy as np
import time

interp = litert.Interpreter(model_path=tflite_path)
interp.allocate_tensors()

input_details = interp.get_input_details()
output_details = interp.get_output_details()

# Verification assertions
for inp in input_details:
    print(f"Input: {inp['name']}, shape={inp['shape']}, dtype={inp['dtype']}")
    assert inp['dtype'] == np.int32, f"Input dtype must be int32, got {inp['dtype']}"

for out in output_details:
    print(f"Output: {out['name']}, shape={out['shape']}, dtype={out['dtype']}")

# Latency measurement (100 runs, warm up 10)
input_data = {
    inp['index']: np.random.randint(0, 1000, size=inp['shape']).astype(np.int32)
    for inp in input_details
}
for idx, data in input_data.items():
    interp.set_tensor(idx, data)

# Warm up
for _ in range(10):
    interp.invoke()

# Measure
latencies = []
for _ in range(100):
    start = time.perf_counter()
    interp.invoke()
    latencies.append((time.perf_counter() - start) * 1000)

print(f"Latency: p50={np.median(latencies):.1f}ms, p95={np.percentile(latencies, 95):.1f}ms")
```

**Source:** ai_edge_litert 2.1.2 API, verified working in the project venv.

### Pattern 5: SELECT_TF_OPS Disqualification Check

**What:** Verify the TFLite model uses only built-in ops (no SELECT_TF_OPS).
**When to use:** After each TFLite conversion.

```python
from ai_edge_litert import interpreter as litert

try:
    # Load with ONLY built-in ops (no flex delegate)
    interp = litert.Interpreter(model_path=tflite_path)
    interp.allocate_tensors()

    # Run a test inference
    for inp in interp.get_input_details():
        interp.set_tensor(
            inp['index'],
            np.ones(inp['shape'], dtype=np.int32)
        )
    interp.invoke()
    print(f"{model_name}: PASSED -- standard TFLite ops only")
except Exception as e:
    print(f"{model_name}: DISQUALIFIED -- requires SELECT_TF_OPS: {e}")
```

### Pattern 6: Data Loading from Phase 1 JSONL

**What:** Load the synthetic dataset and holdout into HuggingFace Dataset format.
**When to use:** Beginning of the benchmark notebook.

```python
import json
from datasets import Dataset

def load_jsonl(path):
    samples = []
    with open(path) as f:
        for line in f:
            samples.append(json.loads(line))
    return samples

# Load and split
all_data = load_jsonl("research/data/synthetic_scam_v1.jsonl")
train_data = [s for s in all_data if s["split"] == "train"]
val_data = [s for s in all_data if s["split"] == "val"]

# Label mapping: scam=1, safe=0
label_map = {"scam": 1, "safe": 0}
for s in train_data + val_data:
    s["label_id"] = label_map[s["label"]]

train_ds = Dataset.from_list(train_data)
val_ds = Dataset.from_list(val_data)

# Holdout (primary evaluation metric)
holdout_data = load_jsonl("research/data/holdout_realworld.jsonl")
for s in holdout_data:
    s["label_id"] = label_map[s["label"]]
holdout_ds = Dataset.from_list(holdout_data)

print(f"Train: {len(train_ds)}, Val: {len(val_ds)}, Holdout: {len(holdout_ds)}")
```

### Pattern 7: benchmark_results.json Output Format

**What:** Structured results table consumed by Phase 3/4 planning.
**When to use:** Final cell of the benchmark notebook.

```python
import json

results = {
    "benchmark_date": "2026-04-XX",
    "dataset": {
        "train_samples": len(train_ds),
        "val_samples": len(val_ds),
        "holdout_samples": len(holdout_ds),
        "source": "research/data/synthetic_scam_v1.jsonl"
    },
    "training_config": {
        "epochs": 5,
        "learning_rate": 2e-5,
        "batch_size": 16,
        "device": "mps"
    },
    "candidates": [
        {
            "name": "MobileBERT",
            "model_id": "google/mobilebert-uncased",
            "params_M": 24.6,
            "synthetic_val_f1": 0.0,      # filled after training
            "holdout_f1": 0.0,             # PRIMARY METRIC
            "holdout_precision": 0.0,
            "holdout_recall": 0.0,
            "tflite_size_mb": 0.0,
            "tflite_latency_p50_ms": 0.0,
            "tflite_latency_p95_ms": 0.0,
            "tflite_ops": "builtin_only",  # or "requires_select_tf_ops"
            "tflite_inputs": [],           # [{"name": ..., "shape": ..., "dtype": ...}]
            "disqualified": False,
            "disqualification_reason": None
        },
        # ... same structure for TinyBERT-4 and ELECTRA-small
    ],
    "winner": {
        "name": "",
        "rationale": "",
        "binary_baseline_f1": 0.0  # Floor for Phase 4 distillation
    },
    "excluded": [
        {
            "name": "DistilBERT",
            "model_id": "distilbert-base-uncased",
            "reason": "66M params, exceeds 50MB INT8 budget (D-11)"
        }
    ]
}

with open("research/models/benchmark_results.json", "w") as f:
    json.dump(results, f, indent=2)
```

### Anti-Patterns to Avoid

- **Training in TensorFlow for this phase:** D-01 locks PyTorch + MPS. TF is escape hatch only if PyTorch fails catastrophically.
- **Using fp16 or bf16 on MPS:** MPS does not support mixed precision. Setting `fp16=True` in TrainingArguments will crash. Verified per HuggingFace docs and PyTorch MPS documentation.
- **Using the dynamo ONNX exporter:** `torch.onnx.export()` defaults to dynamo=True in PyTorch 2.9+. This produces near-empty files for BERT models. Always set `dynamo=False`.
- **Using `tf.lite.Interpreter`:** Deprecated in TF 2.21 and throws `IndexError` on `get_input_details()` due to numpy 2.4 incompatibility. Use `ai_edge_litert.interpreter.Interpreter` instead.
- **Evaluating only on synthetic test set:** D-07 specifies real-world holdout as primary metric. Synthetic test performance is secondary.
- **Hyperparameter sweeping:** D-04/D-05 explicitly prohibit sweeps at this stage. Fixed lr=2e-5, 3-5 epochs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Training loop | Custom PyTorch training loop | HuggingFace `Trainer` | Handles MPS device placement, gradient accumulation, checkpointing, evaluation loop automatically |
| Metrics computation | Manual F1/precision/recall | `sklearn.metrics.precision_recall_fscore_support` | Edge cases in binary F1 (zero division, class imbalance) are handled |
| ONNX -> TFLite conversion | Manual `TFLiteConverter.from_saved_model` | `onnx2tf` CLI | Handles BERT-family transpose issues, tensor name mapping, and quantization calibration |
| Tokenization for evaluation | Manual WordPiece implementation | HuggingFace `AutoTokenizer` | All three architectures share the same 30,522 vocab; tokenizer handles special tokens, padding, truncation |
| TFLite latency benchmarking | Single-run timing | 100-run with 10-warmup protocol via `time.perf_counter` | MPS/TFLite have JIT compilation warmup; single runs are noisy |

**Key insight:** The HuggingFace ecosystem handles 90% of the benchmark infrastructure. The only custom code needed is data loading from JSONL, the ONNX export step, the onnx2tf invocation, and the results aggregation to JSON.

## Common Pitfalls

### Pitfall 1: accelerate Not Installed -- Trainer Crashes at Init
**What goes wrong:** `from transformers import Trainer` succeeds, but `Trainer(...)` raises `ImportError: Using the Trainer with PyTorch requires accelerate>=0.26.0`.
**Why it happens:** `accelerate` is not currently installed in the venv (verified).
**How to avoid:** Install `accelerate>=0.26.0` in Wave 0 / setup cell before any training code.
**Warning signs:** ImportError on Trainer instantiation, not on import.

### Pitfall 2: torch.onnx.export Produces Empty Model Files
**What goes wrong:** ONNX file is ~37KB instead of ~55MB. Model loads in onnxruntime but produces garbage outputs.
**Why it happens:** PyTorch 2.9+ defaults to the dynamo-based ONNX exporter which does not correctly trace BERT-family models with dynamic attention masks.
**How to avoid:** Always pass `dynamo=False` to `torch.onnx.export()`. Verified: legacy exporter produces correct 54.8MB file.
**Warning signs:** ONNX file smaller than 1MB for a model with >10M parameters.

### Pitfall 3: tf.lite.Interpreter Crashes on get_input_details()
**What goes wrong:** `IndexError: tuple index out of range` in `_get_tensor_details`.
**Why it happens:** TF 2.21.0-dev + numpy 2.4.3 have a compatibility issue in the deprecated `tf.lite.Interpreter`. The quantization params tuple format changed.
**How to avoid:** Use `ai_edge_litert.interpreter.Interpreter` (version 2.1.2, already installed) instead of `tf.lite.Interpreter`. Verified working.
**Warning signs:** Deprecation warning message mentioning "tf.lite.Interpreter is deprecated and is scheduled for deletion in TF 2.20."

### Pitfall 4: MPS Mixed Precision Crashes Training
**What goes wrong:** Setting `fp16=True` or `bf16=True` in TrainingArguments causes runtime errors on MPS.
**Why it happens:** Apple MPS backend does not support autocast/mixed precision (fp16 or bf16). This is a hardware/driver limitation.
**How to avoid:** Set `fp16=False, bf16=False` explicitly. Training runs in fp32 on MPS. This is slower but correct.
**Warning signs:** Error mentioning "Mixed precision training with AMP can only be used on CUDA devices."

### Pitfall 5: numpy<2.0 Claim From STACK.md Is Stale
**What goes wrong:** STACK.md and STATE.md warn "numpy must stay < 2.0 (2.0 breaks TF 2.15 and onnxruntime)." The environment has numpy 2.4.3, TF 2.21.0-dev, and onnxruntime 1.24.3 -- all working.
**Why it happens:** The numpy<2.0 constraint was valid for TF 2.15 + onnxruntime 1.18. The current environment has moved past those versions. TF 2.21 and onnxruntime 1.24 support numpy 2.x.
**How to avoid:** Do NOT downgrade numpy. The current versions are compatible with each other. The only remaining issue is `tf.lite.Interpreter` (use LiteRT instead).
**Warning signs:** Attempting to pin `numpy<2.0` would break TF 2.21 which requires numpy>=2.0.

### Pitfall 6: TinyBERT-4 Exports 3 Inputs (token_type_ids)
**What goes wrong:** TinyBERT-4's tokenizer produces `input_ids`, `attention_mask`, AND `token_type_ids`. If the ONNX export includes all three as inputs, the TFLite model will require three input tensors. The existing app (`TextClassifierService.ts`) handles 1 or 2 inputs but has a commented guard for 3.
**Why it happens:** TinyBERT-4 uses BertModel which accepts token_type_ids. While it's all-zeros for single-sentence classification, the ONNX tracer includes it as a required input.
**How to avoid:** This is expected behavior, not a bug. Record the input count in benchmark_results.json. If TinyBERT-4 wins, the Phase 6 app integration adds a 3-line guard for `token_type_ids` (already documented in ARCHITECTURE.md).
**Warning signs:** ONNX model showing 3 inputs when 2 were expected.

### Pitfall 7: ELECTRA-small May Require SELECT_TF_OPS
**What goes wrong:** ELECTRA uses a discriminator architecture with some ops (e.g., `TFElectraEmbeddings` layer normalization variant) that may not be in the standard TFLite built-in op set. The onnx2tf conversion succeeds, but the model fails at inference in the standard LiteRT runtime.
**Why it happens:** ELECTRA's architecture differs from standard BERT -- it was pretrained with a replaced-token detection objective and has a different embedding structure.
**How to avoid:** Run the SELECT_TF_OPS disqualification check (Pattern 5) on every converted model. If ELECTRA requires SELECT_TF_OPS, it is disqualified for device deployment per success criterion 3.
**Warning signs:** onnx2tf warnings about unsupported ops, or LiteRT inference throwing "Unsupported custom op" errors.

### Pitfall 8: Model Export From MPS Device Fails
**What goes wrong:** `torch.onnx.export()` fails or produces incorrect results when the model is on the MPS device.
**Why it happens:** ONNX export traces the model on CPU. MPS tensors cannot be traced by the ONNX exporter.
**How to avoid:** Always call `model.cpu()` before ONNX export. Move model back to MPS for training.
**Warning signs:** RuntimeError mentioning "Expected all tensors to be on the same device."

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PyTorch (MPS) | Model training | Yes | 2.9.1 | CPU training (much slower) |
| transformers | Model loading, Trainer | Yes | 4.57.3 | -- |
| datasets | Data loading | Yes | 4.4.2 | -- |
| accelerate | Trainer (PyTorch) | **No** | -- | **Must install** -- no fallback |
| onnx | ONNX export | Yes | 1.20.1 | -- |
| onnxruntime | ONNX validation | Yes | 1.24.3 | -- |
| onnx2tf | ONNX -> TFLite | Yes | 2.3.9 | -- |
| ai-edge-litert | TFLite inference/latency | Yes | 2.1.2 | tf.lite.Interpreter (broken, see Pitfall 3) |
| scikit-learn | Metrics | Yes | 1.8.0 | -- |
| evaluate | HF metrics (optional) | **No** | -- | sklearn.metrics (sufficient) |
| seaborn | Heatmap visualization | **No** | -- | matplotlib only (sufficient) |
| optimum 1.27.0 | D-02 TFLite export | **No** (2.1.0 installed, TFLite removed) | -- | ONNX -> onnx2tf path (see D-02 Conflict section) |
| tflite_runtime | D-08 latency measurement | **No** (no macOS ARM64 wheels) | -- | ai-edge-litert 2.1.2 (already installed, same API) |
| Jupyter | Notebook execution | Yes | -- | -- |

**Missing dependencies with no fallback:**
- `accelerate>=0.26.0` -- blocks all training. Must install before Phase 2 begins.

**Missing dependencies with fallback:**
- `evaluate` -- sklearn.metrics provides identical functionality for F1/precision/recall
- `seaborn` -- matplotlib handles all necessary visualizations
- `optimum 1.27.0` -- ONNX -> onnx2tf path achieves the same outcome
- `tflite_runtime` -- ai-edge-litert provides the same `Interpreter` API

## Architecture Details (Verified)

### Architecture Comparison Table

| Property | MobileBERT | TinyBERT-4 | ELECTRA-small |
|----------|-----------|------------|---------------|
| HF Model ID | `google/mobilebert-uncased` | `huawei-noah/TinyBERT_General_4L_312D` | `google/electra-small-discriminator` |
| Parameters | 24.6M | 14.4M | 13.5M |
| Hidden size | 512 | 312 | 256 |
| Layers | 24 | 4 | 12 |
| Attention heads | 4 | 12 | 4 |
| Vocab size | 30,522 | 30,522 | 30,522 |
| Tokenizer type | MobileBertTokenizerFast | BertTokenizerFast | ElectraTokenizerFast |
| Token IDs identical | Yes | Yes | Yes |
| Tokenizer inputs | input_ids, token_type_ids, attention_mask | input_ids, token_type_ids, attention_mask | input_ids, token_type_ids, attention_mask |
| PyTorch class | MobileBertForSequenceClassification | BertForSequenceClassification | ElectraForSequenceClassification |
| TF class available | TFMobileBertForSequenceClassification | TFBertForSequenceClassification | TFElectraForSequenceClassification |
| MPS forward pass | Not tested (expected to work) | Verified working | Not tested (expected to work) |
| Est. FP32 ONNX size | ~100MB | ~55MB | ~52MB |
| Est. INT8 TFLite size | ~25MB | ~14MB | ~13MB |
| GLUE benchmark | 77.7 | 77.0 | 79.2 |
| Pretraining method | Inverted bottleneck + progressive transfer | General distillation from BERT-base | Replaced token detection (discriminator) |

**Key finding:** All three tokenizers produce identical token IDs for the same input text. The `vocab.txt` in canaryapp is compatible with all candidates. No tokenizer change is needed regardless of which architecture wins.

### MPS Compatibility

Verified that PyTorch 2.9.1 MPS backend works for BERT-family model inference (TinyBERT-4 tested). Training should work since HuggingFace Trainer auto-detects MPS. Key constraints:

- `PYTORCH_ENABLE_MPS_FALLBACK=1` must be set as environment variable
- `fp16=False` and `bf16=False` in TrainingArguments (MPS has no mixed precision support)
- Training runs in fp32 -- slower than CUDA fp16 but functional

## Code Examples

### Complete Training Function (Per Architecture)

```python
def train_and_evaluate(model_id, model_name, tokenizer, train_ds, val_ds, holdout_ds, output_dir):
    """Train a single architecture and return metrics."""
    model = AutoModelForSequenceClassification.from_pretrained(model_id, num_labels=2)

    def tokenize_fn(examples):
        return tokenizer(
            examples["text"],
            padding="max_length",
            truncation=True,
            max_length=128,
        )

    train_tok = train_ds.map(tokenize_fn, batched=True).rename_column("label_id", "labels")
    val_tok = val_ds.map(tokenize_fn, batched=True).rename_column("label_id", "labels")

    train_tok.set_format("torch", columns=["input_ids", "attention_mask", "token_type_ids", "labels"])
    val_tok.set_format("torch", columns=["input_ids", "attention_mask", "token_type_ids", "labels"])

    args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=5,
        per_device_train_batch_size=16,
        per_device_eval_batch_size=32,
        learning_rate=2e-5,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        fp16=False,
        bf16=False,
        logging_steps=50,
        report_to="none",
    )

    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=train_tok,
        eval_dataset=val_tok,
        compute_metrics=compute_metrics,
    )

    trainer.train()

    # Evaluate on holdout
    holdout_tok = holdout_ds.map(tokenize_fn, batched=True).rename_column("label_id", "labels")
    holdout_tok.set_format("torch", columns=["input_ids", "attention_mask", "token_type_ids", "labels"])
    holdout_results = trainer.evaluate(holdout_tok)

    return trainer, holdout_results
```

### TFLite Conversion Pipeline (Per Architecture)

```python
import subprocess
import tempfile
import os

def convert_to_tflite(model, tokenizer, model_name, output_dir):
    """Export PyTorch model -> ONNX -> TFLite via onnx2tf."""
    model.eval()
    model_cpu = model.cpu()

    dummy = tokenizer("benchmark test text", return_tensors="pt",
                       padding="max_length", max_length=128, truncation=True)

    onnx_path = os.path.join(output_dir, f"{model_name}.onnx")

    torch.onnx.export(
        model_cpu,
        tuple(dummy.values()),
        onnx_path,
        input_names=list(dummy.keys()),
        output_names=["logits"],
        dynamic_axes={n: {0: "batch", 1: "seq"} for n in dummy.keys()}
        | {"logits": {0: "batch"}},
        opset_version=14,
        dynamo=False,
    )

    tflite_dir = os.path.join(output_dir, f"{model_name}_tflite")

    subprocess.run([
        ".venv/bin/python3", "-m", "onnx2tf",
        "-i", onnx_path,
        "-o", tflite_dir,
    ], check=True, capture_output=True, text=True)

    # Find the .tflite file
    tflite_files = [f for f in os.listdir(tflite_dir) if f.endswith(".tflite")]
    assert len(tflite_files) > 0, f"No TFLite files produced for {model_name}"

    tflite_path = os.path.join(tflite_dir, tflite_files[0])
    return tflite_path
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tflite_runtime` standalone package | `ai-edge-litert` package | TF 2.20+ (2025) | Use `from ai_edge_litert import interpreter` instead of `import tflite_runtime.interpreter` |
| `tf.lite.Interpreter` | `ai_edge_litert.interpreter.Interpreter` | TF 2.20+ (2025) | Old API deprecated, crashes on numpy 2.4 |
| `optimum` TFLite export | Removed in optimum 2.0 | October 2025 | Must use optimum 1.27 (pinned) or ONNX->onnx2tf path |
| `torch.onnx.export()` (TorchScript) | `torch.onnx.export(dynamo=True)` default | PyTorch 2.9 | Dynamo exporter is default but broken for BERT; must pass `dynamo=False` |
| TF/JAX model classes in transformers | Deprecated, removal in v5 | transformers 4.57 | `TFAutoModelForSequenceClassification` still works but shows deprecation warning |
| `numpy<2.0` constraint | `numpy>=2.0` supported | TF 2.18+, onnxruntime 1.20+ | Old constraint no longer applies with current stack |

**Deprecated/outdated:**
- `tflite_runtime` PyPI package: No macOS ARM64 wheels published. Replaced by `ai-edge-litert`.
- `optimum.exporters.tflite`: Removed in optimum 2.0. Pinning to 1.27.0 is the last supported version.
- `tf.lite.Interpreter`: Deprecated in TF 2.20+. Will be deleted in TF 2.21 stable.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest (available via .venv) + Jupyter cell assertions |
| Config file | None -- validation is notebook-internal + benchmark_results.json |
| Quick run command | Run benchmark notebook cells sequentially |
| Full suite command | `jupyter nbconvert --execute research/notebooks/architecture_benchmark.ipynb` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEXT-02.1 | Three architectures benchmarked on identical splits | Notebook cell + JSON output | Assert 3 entries in `benchmark_results.json["candidates"]` | Wave 0 |
| TEXT-02.2 | End-to-end pipeline test (tokenizer->model->output) | Notebook cell | Per-architecture: tokenize -> forward pass -> logits shape [1,2] | Wave 0 |
| TEXT-02.3 | TFLite tested with standard runtime (no SELECT_TF_OPS) | Notebook cell | LiteRT Interpreter load + invoke without flex delegate | Wave 0 |
| TEXT-02.4 | DistilBERT excluded | JSON assertion | Assert "DistilBERT" in `benchmark_results.json["excluded"]` | Wave 0 |
| TEXT-02.5 | Student selected with rationale, binary baseline F1 recorded | JSON assertion | Assert `benchmark_results.json["winner"]["name"]` non-empty and `binary_baseline_f1 > 0` | Wave 0 |

### Sampling Rate
- **Per task commit:** Verify notebook cell outputs match expected shapes and metrics format
- **Per wave merge:** Full notebook re-execution to ensure reproducibility
- **Phase gate:** `benchmark_results.json` exists, all 5 assertions pass, winner selected

### Wave 0 Gaps
- [ ] Install `accelerate>=0.26.0` -- required before any training
- [ ] Install `evaluate>=0.4.0` and `seaborn>=0.13.0` -- optional but useful
- [ ] Create `research/models/` directory if not exists (for benchmark outputs)
- [ ] Verify MPS training works end-to-end with a 1-epoch quick test before full benchmark

## Open Questions

1. **ONNX vs optimum 1.27.0 for TFLite export**
   - What we know: optimum 2.1.0 (installed) has no TFLite support. ONNX->onnx2tf path works. optimum 1.27.0 requires older transformers.
   - What's unclear: Whether the user insists on D-02 (optimum 1.27.0) or accepts the ONNX path as equivalent.
   - Recommendation: Use ONNX->onnx2tf (already installed, verified). Flag deviation from D-02 to user. If user insists, create isolated venv for the export step only.

2. **ELECTRA-small SELECT_TF_OPS status**
   - What we know: Web search suggests ELECTRA may require SELECT_TF_OPS. ELECTRA is listed as supported by optimum TFLite export. No definitive test found.
   - What's unclear: Whether onnx2tf conversion of ELECTRA produces a model with only built-in ops.
   - Recommendation: Test it during the benchmark. If disqualified, document it and proceed with 2 candidates.

3. **MPS memory limits for MobileBERT (24.6M params)**
   - What we know: TinyBERT-4 (14.4M) works on MPS. MobileBERT is 1.7x larger with 24 layers.
   - What's unclear: Whether batch_size=16 fits in unified memory for MobileBERT training.
   - Recommendation: Start with batch_size=16, reduce to 8 if OOM. Document in notebook.

4. **onnx2tf INT8 quantization calibration**
   - What we know: onnx2tf supports `-oiqt` flag for INT8 quantization. It may need a representative dataset.
   - What's unclear: Exact calibration procedure for BERT-family models in onnx2tf.
   - Recommendation: Start with default calibration. If INT8 model shows >3% F1 degradation, investigate calibration dataset.

## Sources

### Primary (HIGH confidence)
- Environment audit: Direct `.venv/bin/python3` execution of all import tests, model loading, ONNX export, and LiteRT inference -- all performed 2026-04-04
- HuggingFace transformers 4.57.3 -- model classes, tokenizer verification, Trainer API
- PyTorch 2.9.1 MPS backend -- confirmed `torch.backends.mps.is_available() == True`, forward pass verified
- ai-edge-litert 2.1.2 -- LiteRT interpreter working, tested with existing TFLite model
- onnx2tf 2.3.9 + onnx 1.20.1 + onnxruntime 1.24.3 -- ONNX export path verified end-to-end

### Secondary (MEDIUM confidence)
- [HuggingFace Apple Silicon training docs](https://huggingface.co/docs/transformers/en/perf_train_special) -- MPS auto-detection, fp16 limitations
- [HuggingFace Optimum TFLite overview](https://huggingface.co/docs/optimum/en/exporters/tflite/overview) -- ELECTRA listed as supported, v1.27.0 still has TFLite
- [tflite-runtime PyPI](https://pypi.org/project/tflite-runtime/) -- No macOS ARM64 wheels
- [PyTorch MPS fp16 issue](https://github.com/huggingface/transformers/issues/32648) -- MPS does not support fp16

### Tertiary (LOW confidence)
- ELECTRA-small SELECT_TF_OPS requirement -- based on web search suggesting ELECTRA may need SELECT_TF_OPS, but no definitive test for the specific `google/electra-small-discriminator` model via onnx2tf path. Must be verified during benchmark execution.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages verified by direct import/execution in the project venv
- Architecture patterns: HIGH -- training code patterns verified against HuggingFace docs and MPS testing
- TFLite conversion: MEDIUM -- ONNX export path tested (TinyBERT), onnx2tf not tested end-to-end to TFLite for all 3 models
- Pitfalls: HIGH -- all pitfalls discovered by direct testing in the environment (not from web search alone)
- ELECTRA TFLite compatibility: LOW -- must be verified during execution

**Research date:** 2026-04-04
**Valid until:** 2026-04-18 (14 days -- PyTorch/HF ecosystem moves fast)
