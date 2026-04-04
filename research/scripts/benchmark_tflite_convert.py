"""
TFLite conversion, validation, and latency measurement for architecture benchmark.

Utility script that converts trained PyTorch checkpoints to TFLite via two paths:
  1. ONNX export (PyTorch -> ONNX, for size/sanity validation)
  2. TF SavedModel path (PyTorch checkpoint -> TFAutoModel from_pt=True -> SavedModel -> TFLite)

The TF SavedModel path is used for final TFLite conversion because onnx2tf 2.3.9
has a Slice op int64/int32 type mismatch bug with BERT-family position embeddings.
The ONNX export is retained as a sanity check (validates model traceability).

D-02 deviation: Using TFAutoModel.from_pretrained(from_pt=True) -> TFLiteConverter
instead of optimum==1.27.0 (optimum 2.1.0 installed has no TFLite export;
downgrade requires transformers<4.50). Also deviating from ONNX->onnx2tf
due to onnx2tf Slice op bug.

Outputs: JSON results to stdout for consumption by the benchmark notebook / results aggregation.
"""

import json
import os
import subprocess
import sys
import time
import warnings

warnings.filterwarnings("ignore")

import numpy as np
import torch
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    TFAutoModelForSequenceClassification,
)


# --- Configuration ---

MODELS = {
    "MobileBERT": {
        "checkpoint": "research/models/benchmark_tmp/mobilebert/checkpoint-3444",
        "tokenizer_id": "google/mobilebert-uncased",
        "tf_class_hint": "TFMobileBertForSequenceClassification",
    },
    "TinyBERT-4": {
        "checkpoint": "research/models/benchmark_tmp/tinybert_4/checkpoint-3444",
        "tokenizer_id": "huawei-noah/TinyBERT_General_4L_312D",
        "tf_class_hint": "TFBertForSequenceClassification",
    },
    "ELECTRA-small": {
        "checkpoint": "research/models/benchmark_tmp/electra_small/checkpoint-3444",
        "tokenizer_id": "google/electra-small-discriminator",
        "tf_class_hint": "TFElectraForSequenceClassification",
    },
}

OUTPUT_DIR = "research/models/benchmark_tmp"


# --- ONNX Export (for sanity check) ---

def export_to_onnx(model, tokenizer, model_name):
    """Export PyTorch model to ONNX format.
    CRITICAL: dynamo=False required (Pitfall 2 from RESEARCH.md).
    CRITICAL: model.cpu() required (Pitfall 8 from RESEARCH.md).
    """
    model.eval()
    model_cpu = model.cpu()

    dummy = tokenizer(
        "benchmark test text for onnx export",
        return_tensors="pt",
        padding="max_length",
        max_length=128,
        truncation=True,
    )

    safe_name = model_name.lower().replace(" ", "_").replace("-", "_")
    onnx_path = os.path.join(OUTPUT_DIR, f"{safe_name}.onnx")
    os.makedirs(os.path.dirname(onnx_path), exist_ok=True)

    torch.onnx.export(
        model_cpu,
        tuple(dummy.values()),
        onnx_path,
        input_names=list(dummy.keys()),
        output_names=["logits"],
        dynamic_axes={n: {0: "batch", 1: "seq"} for n in dummy.keys()}
        | {"logits": {0: "batch"}},
        opset_version=14,
        dynamo=False,  # CRITICAL: legacy exporter required (Pitfall 2)
    )

    file_size_mb = os.path.getsize(onnx_path) / (1024 * 1024)
    print(f"  {model_name} ONNX exported: {onnx_path} ({file_size_mb:.1f} MB)", file=sys.stderr)

    # Sanity check: ONNX file must be > 1MB for models with >10M params
    assert file_size_mb > 1.0, (
        f"ONNX file too small ({file_size_mb:.1f} MB) -- dynamo exporter may have been used"
    )

    return onnx_path, file_size_mb


# --- TFLite Conversion via TF SavedModel ---

def convert_to_tflite_via_tf(checkpoint_path, model_name):
    """Convert PyTorch checkpoint to TFLite via TF SavedModel path.

    Path: PyTorch checkpoint -> TFAutoModel.from_pretrained(from_pt=True)
          -> model.save(SavedModel) -> TFLiteConverter.from_saved_model()

    This avoids the onnx2tf Slice op int64/int32 type mismatch bug that affects
    all BERT-family models with position embeddings.
    """
    import tensorflow as tf

    safe_name = model_name.lower().replace(" ", "_").replace("-", "_")
    savedmodel_dir = os.path.join(OUTPUT_DIR, f"{safe_name}_tf")
    tflite_dir = os.path.join(OUTPUT_DIR, f"{safe_name}_tflite")
    os.makedirs(tflite_dir, exist_ok=True)

    print(f"  Loading TF model from PyTorch checkpoint: {checkpoint_path}", file=sys.stderr)
    tf_model = TFAutoModelForSequenceClassification.from_pretrained(
        checkpoint_path,
        num_labels=2,
        from_pt=True,
    )
    print(f"  TF model loaded: {tf_model.__class__.__name__}", file=sys.stderr)

    # Create a concrete function with fixed input shapes [1, 128]
    # This ensures TFLite model has proper input shapes for inference
    max_length = 128

    @tf.function(input_signature=[
        tf.TensorSpec(shape=[1, max_length], dtype=tf.int32, name="input_ids"),
        tf.TensorSpec(shape=[1, max_length], dtype=tf.int32, name="attention_mask"),
        tf.TensorSpec(shape=[1, max_length], dtype=tf.int32, name="token_type_ids"),
    ])
    def serving_fn(input_ids, attention_mask, token_type_ids):
        outputs = tf_model(
            input_ids=input_ids,
            attention_mask=attention_mask,
            token_type_ids=token_type_ids,
            training=False,
        )
        return {"logits": outputs.logits}

    # Save as TF SavedModel with concrete function
    tf.saved_model.save(
        tf_model,
        savedmodel_dir,
        signatures={"serving_default": serving_fn},
    )
    print(f"  SavedModel saved to {savedmodel_dir} (input shape: [1, {max_length}])", file=sys.stderr)

    # Convert to TFLite
    converter = tf.lite.TFLiteConverter.from_saved_model(savedmodel_dir)
    tflite_model = converter.convert()

    tflite_path = os.path.join(tflite_dir, "model.tflite")
    with open(tflite_path, "wb") as f:
        f.write(tflite_model)

    size_mb = len(tflite_model) / (1024 * 1024)
    print(f"  {model_name} TFLite: {tflite_path} ({size_mb:.1f} MB)", file=sys.stderr)

    return tflite_path, size_mb


# --- Flex Ops Check ---

def check_flex_ops(tflite_path, model_name):
    """Programmatic check for Flex/Select ops in the TFLite model.
    Reads the TFLite flatbuffer to inspect for any ops with 'Flex' or 'Select'
    prefixes, which indicate SELECT_TF_OPS dependency.
    Returns (has_flex_ops: bool, flex_op_names: list[str]).
    """
    with open(tflite_path, "rb") as f:
        data = f.read()

    flex_ops = set()
    idx = 0
    while idx < len(data):
        pos = data.find(b"Flex", idx)
        if pos == -1:
            break
        end = pos
        while end < len(data) and (data[end:end + 1].isalnum() or data[end:end + 1] == b"_"):
            end += 1
        op_name = data[pos:end].decode("ascii", errors="ignore")
        if op_name.startswith("Flex") and len(op_name) > 4:
            flex_ops.add(op_name)
        idx = end + 1

    if flex_ops:
        print(f"  {model_name}: FLEX OPS FOUND: {sorted(flex_ops)}", file=sys.stderr)
    else:
        print(f"  {model_name}: No Flex/Select ops found -- standard ops only", file=sys.stderr)

    return bool(flex_ops), sorted(flex_ops)


# --- TFLite Validation ---

def validate_tflite(tflite_path, model_name):
    """Validate TFLite model with LiteRT (no SELECT_TF_OPS).
    Two-layer validation:
      1. Programmatic Flex ops scan
      2. Load without flex delegate to confirm standard runtime compatibility
    """
    from ai_edge_litert import interpreter as litert

    # Layer 1: Programmatic Flex ops check
    has_flex, flex_ops_list = check_flex_ops(tflite_path, model_name)

    try:
        # Layer 2: Load with ONLY built-in ops (no flex delegate)
        interp = litert.Interpreter(model_path=tflite_path)
        interp.allocate_tensors()

        input_details = interp.get_input_details()
        output_details = interp.get_output_details()

        print(f"  {model_name} TFLite Validation:", file=sys.stderr)
        for inp in input_details:
            print(f"    Input: {inp['name']}: shape={inp['shape']}, dtype={inp['dtype']}", file=sys.stderr)
        for out in output_details:
            print(f"    Output: {out['name']}: shape={out['shape']}, dtype={out['dtype']}", file=sys.stderr)

        # Run test inference with realistic dummy data
        for inp in input_details:
            name = inp["name"].lower()
            shape = inp["shape"]
            dtype = inp["dtype"]
            if "input_ids" in name:
                data = np.full(shape, 101, dtype=dtype)  # [CLS] token
            elif "attention_mask" in name:
                data = np.ones(shape, dtype=dtype)
            elif "token_type_ids" in name:
                data = np.zeros(shape, dtype=dtype)
            else:
                data = np.ones(shape, dtype=dtype)
            interp.set_tensor(inp["index"], data)
        interp.invoke()

        output = interp.get_tensor(output_details[0]["index"])
        print(f"    Output shape: {output.shape}, values: {output}", file=sys.stderr)
        assert output.shape[-1] == 2, f"Expected 2-class output, got shape {output.shape}"

        if has_flex:
            print(f"  {model_name}: WARNING -- Flex ops in flatbuffer but loaded without flex delegate", file=sys.stderr)
            return False, input_details, output_details, flex_ops_list

        print(f"  {model_name}: PASSED -- standard TFLite ops only", file=sys.stderr)
        return True, input_details, output_details, []

    except Exception as e:
        print(f"  {model_name}: DISQUALIFIED -- {e}", file=sys.stderr)
        return False, None, None, flex_ops_list


# --- Latency Measurement ---

def measure_latency(tflite_path, model_name, n_warmup=10, n_runs=100):
    """Measure TFLite inference latency on desktop.
    Per D-08: Desktop interpreter only, sufficient for ranking.
    Uses realistic input values: valid token IDs for input_ids,
    ones for attention_mask, zeros for token_type_ids.
    """
    from ai_edge_litert import interpreter as litert

    interp = litert.Interpreter(model_path=tflite_path)
    interp.allocate_tensors()
    input_details = interp.get_input_details()

    # Set realistic inputs based on tensor name
    for inp in input_details:
        name = inp["name"].lower()
        shape = inp["shape"]
        dtype = inp["dtype"]
        if "input_ids" in name:
            # Valid token IDs within vocab range (0-30521)
            data = np.random.randint(100, 10000, size=shape).astype(dtype)
        elif "attention_mask" in name:
            # All ones (attend to all tokens)
            data = np.ones(shape, dtype=dtype)
        elif "token_type_ids" in name:
            # All zeros (single sentence)
            data = np.zeros(shape, dtype=dtype)
        else:
            data = np.ones(shape, dtype=dtype)
        interp.set_tensor(inp["index"], data)

    # Warm up
    for _ in range(n_warmup):
        interp.invoke()

    # Measure
    latencies = []
    for _ in range(n_runs):
        start = time.perf_counter()
        interp.invoke()
        elapsed = (time.perf_counter() - start) * 1000  # ms
        latencies.append(elapsed)

    p50 = float(np.median(latencies))
    p95 = float(np.percentile(latencies, 95))
    print(f"  {model_name} Latency: p50={p50:.1f}ms, p95={p95:.1f}ms (100 runs)", file=sys.stderr)
    return {"p50_ms": round(p50, 1), "p95_ms": round(p95, 1)}


# --- Main ---

def main():
    results = {}

    for name, config in MODELS.items():
        print(f"\n=== {name} ===", file=sys.stderr)
        entry = {
            "onnx_path": None,
            "onnx_size_mb": -1,
            "tflite_path": None,
            "tflite_size_mb": -1,
            "conversion_method": "tf_savedmodel",
            "validation_passed": False,
            "flex_ops_found": [],
            "inputs": [],
            "outputs": [],
            "latency": {"p50_ms": -1, "p95_ms": -1},
        }

        try:
            # Step 1: ONNX export (sanity check -- validates model traceability)
            pt_model = AutoModelForSequenceClassification.from_pretrained(config["checkpoint"])
            tokenizer = AutoTokenizer.from_pretrained(config["tokenizer_id"])
            print(f"  PyTorch model loaded from {config['checkpoint']}", file=sys.stderr)

            onnx_path, onnx_size = export_to_onnx(pt_model, tokenizer, name)
            entry["onnx_path"] = onnx_path
            entry["onnx_size_mb"] = round(onnx_size, 1)

            # Free PyTorch model memory before loading TF model
            del pt_model
            torch.cuda.empty_cache() if torch.cuda.is_available() else None

            # Step 2: TFLite conversion via TF SavedModel path
            # (onnx2tf has int64/int32 Slice bug with BERT position embeddings)
            tflite_path, size_mb = convert_to_tflite_via_tf(config["checkpoint"], name)
            entry["tflite_path"] = tflite_path
            entry["tflite_size_mb"] = round(size_mb, 1)

            # Step 3: Validation + Flex ops check
            passed, inp_det, out_det, flex_ops = validate_tflite(tflite_path, name)
            entry["validation_passed"] = passed
            entry["flex_ops_found"] = flex_ops
            if inp_det:
                entry["inputs"] = [
                    {"name": d["name"], "shape": d["shape"].tolist(), "dtype": str(d["dtype"])}
                    for d in inp_det
                ]
            if out_det:
                entry["outputs"] = [
                    {"name": d["name"], "shape": d["shape"].tolist(), "dtype": str(d["dtype"])}
                    for d in out_det
                ]

            # Step 4: Latency measurement (only if validation passed)
            if passed:
                entry["latency"] = measure_latency(tflite_path, name)
            else:
                print(f"  {name}: SKIPPED latency (validation failed)", file=sys.stderr)

        except Exception as e:
            print(f"  {name}: FAILED -- {e}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)

        results[name] = entry

    # Output JSON to stdout
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
