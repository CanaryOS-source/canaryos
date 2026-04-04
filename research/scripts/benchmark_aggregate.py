"""
Aggregate benchmark results from training metrics and TFLite conversion results
into the final benchmark_results.json.

This script combines:
  1. Known training metrics (from notebook outputs)
  2. TFLite conversion results (from benchmark_tflite_convert.py output)

Outputs: research/models/benchmark_results.json
"""

import json
import os
from datetime import date

# --- Training Results (from 02-01 notebook outputs) ---

TRAINING_RESULTS = {
    "MobileBERT": {
        "val_f1": 1.0000,
        "holdout_f1": 0.7719,
        "holdout_precision": 0.7333,
        "holdout_recall": 0.8148,
        "training_loss": 1130.8120,
    },
    "TinyBERT-4": {
        "val_f1": 0.9985,
        "holdout_f1": 0.7059,
        "holdout_precision": 0.7500,
        "holdout_recall": 0.6667,
        "training_loss": 0.0215,
    },
    "ELECTRA-small": {
        "val_f1": 0.9990,
        "holdout_f1": 0.7289,
        "holdout_precision": 0.7009,
        "holdout_recall": 0.7593,
        "training_loss": 0.0214,
    },
}

MODEL_INFO = {
    "MobileBERT": {"model_id": "google/mobilebert-uncased", "params_M": 24.6},
    "TinyBERT-4": {"model_id": "huawei-noah/TinyBERT_General_4L_312D", "params_M": 14.4},
    "ELECTRA-small": {"model_id": "google/electra-small-discriminator", "params_M": 13.5},
}

# --- Load TFLite conversion results ---

tflite_results_path = "research/models/tflite_results.json"
with open(tflite_results_path) as f:
    tflite_results = json.load(f)

# --- Dataset sizes (from Phase 1) ---
# train: 20648, val: 2294, holdout: 202 (from 01-03 summary)
DATASET = {
    "train_samples": 20648,
    "val_samples": 2294,
    "holdout_samples": 202,
    "source": "research/data/synthetic_scam_v1.jsonl",
}

# --- Build benchmark_results.json ---

results = {
    "benchmark_date": str(date.today()),
    "export_path_note": (
        "D-02 deviation: Using TF direct path "
        "(PyTorch->TFAutoModel.from_pretrained(from_pt=True)->TFLiteConverter) "
        "instead of optimum==1.27.0 or ONNX->onnx2tf. "
        "Reason: optimum 2.1.0 removed TFLite export; onnx2tf 2.3.9 fails with "
        "int64/int32 type mismatch on Slice op for all BERT-family position embeddings. "
        "TF direct path is functionally equivalent and produces standard TFLite ops."
    ),
    "tflite_size_note": (
        "tflite_size_mb values are from default FP32 TF direct conversion, not INT8 QAT. "
        "Final INT8 model size will be determined in Phase 6 after quantization-aware training. "
        "Expect ~4x size reduction from FP32 to INT8."
    ),
    "dataset": DATASET,
    "training_config": {
        "epochs": 5,
        "learning_rate": 2e-5,
        "batch_size": 16,
        "batch_size_note": (
            "MobileBERT used batch_size=8 + gradient_accumulation_steps=2 "
            "(effective=16) to prevent MPS OOM; other models used batch_size=16 directly"
        ),
        "device": "mps",
        "fp16": False,
        "bf16": False,
    },
    "candidates": [],
    "winner": {"name": "", "rationale": "", "binary_baseline_f1": 0.0},
    "excluded": [
        {
            "name": "DistilBERT",
            "model_id": "distilbert-base-uncased",
            "reason": "66M params, exceeds 50MB INT8 budget (D-11)",
        }
    ],
}

# Populate candidates
for name in ["MobileBERT", "TinyBERT-4", "ELECTRA-small"]:
    train_res = TRAINING_RESULTS[name]
    info = MODEL_INFO[name]
    tflite = tflite_results[name]

    candidate = {
        "name": name,
        "model_id": info["model_id"],
        "params_M": info["params_M"],
        "synthetic_val_f1": round(train_res["val_f1"], 4),
        "holdout_f1": round(train_res["holdout_f1"], 4),
        "holdout_precision": round(train_res["holdout_precision"], 4),
        "holdout_recall": round(train_res["holdout_recall"], 4),
        "tflite_size_mb": tflite["tflite_size_mb"],
        "tflite_size_is_fp32": True,
        "tflite_latency_p50_ms": tflite["latency"]["p50_ms"],
        "tflite_latency_p95_ms": tflite["latency"]["p95_ms"],
        "tflite_ops": "builtin_only" if tflite["validation_passed"] else "requires_select_tf_ops_or_failed",
        "tflite_inputs": tflite["inputs"],
        "flex_ops_found": tflite["flex_ops_found"],
        "disqualified": not tflite["validation_passed"],
        "disqualification_reason": None if tflite["validation_passed"] else (
            f"Flex ops detected: {tflite['flex_ops_found']}"
            if tflite["flex_ops_found"]
            else "TFLite validation failed (SELECT_TF_OPS or conversion error)"
        ),
    }
    results["candidates"].append(candidate)

# --- Winner selection ---

eligible = [c for c in results["candidates"] if not c["disqualified"]]
assert len(eligible) > 0, "All candidates disqualified -- cannot select winner"

# Sort by holdout_f1 (desc), then tflite_size_mb (asc), then latency (asc)
eligible.sort(key=lambda c: (-c["holdout_f1"], c["tflite_size_mb"], c["tflite_latency_p50_ms"]))
winner = eligible[0]

rationale_parts = [
    f"{winner['name']} selected as student architecture.",
    f"Holdout F1: {winner['holdout_f1']:.4f} (primary metric per D-07).",
    f"TFLite FP32 size: {winner['tflite_size_mb']:.1f} MB "
    f"(note: this is pre-QAT FP32; final INT8 size determined in Phase 6, "
    f"expected ~{winner['tflite_size_mb']/4:.1f} MB).",
    f"Desktop latency: p50={winner['tflite_latency_p50_ms']}ms, "
    f"p95={winner['tflite_latency_p95_ms']}ms.",
]

if len(eligible) > 1:
    runner_up = eligible[1]
    rationale_parts.append(
        f"Runner-up: {runner_up['name']} (F1={runner_up['holdout_f1']:.4f}, "
        f"size={runner_up['tflite_size_mb']:.1f}MB FP32, "
        f"latency p50={runner_up['tflite_latency_p50_ms']}ms)."
    )

for c in results["candidates"]:
    if c["disqualified"]:
        rationale_parts.append(
            f"Disqualified: {c['name']} -- {c['disqualification_reason']}."
        )

rationale = " ".join(rationale_parts)

results["winner"] = {
    "name": winner["name"],
    "model_id": winner["model_id"],
    "rationale": rationale,
    "binary_baseline_f1": winner["holdout_f1"],
}

# --- Write output ---

os.makedirs("research/models", exist_ok=True)
output_path = "research/models/benchmark_results.json"
with open(output_path, "w") as f:
    json.dump(results, f, indent=2)

print(f"Results written to {output_path}")
print(f"Winner: {results['winner']['name']}")
print(f"Binary baseline F1: {results['winner']['binary_baseline_f1']}")
print(f"Rationale: {rationale}")

# --- Assertions ---

assert len(results["candidates"]) == 3
assert results["excluded"][0]["name"] == "DistilBERT"
assert results["winner"]["name"] != ""
assert results["winner"]["binary_baseline_f1"] > 0
assert "tflite_size_note" in results
assert "FP32" in results["tflite_size_note"]
for c in results["candidates"]:
    assert "flex_ops_found" in c, f"Missing flex_ops_found on {c['name']}"
    assert "tflite_size_is_fp32" in c, f"Missing tflite_size_is_fp32 on {c['name']}"
    assert "tflite_size_mb" in c
    assert "tflite_latency_p50_ms" in c
    assert "tflite_latency_p95_ms" in c

print("All assertions passed.")
