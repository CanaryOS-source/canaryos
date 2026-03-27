# ONNX → TFLite Model Conversion for CanaryOS

## Status: IN PROGRESS (Blocked on quantization incompatibility)

**Last updated:** 2026-03-16
**Goal:** Convert `canary_v3_int8.onnx` to TFLite for use with `react-native-fast-tflite`

---

## Why TFLite (not ONNX Runtime)?

`onnxruntime-react-native` uses the legacy React Native bridge API (`NativeModules` + `getCatalystInstance()` in `OnnxruntimeModule.java` line 51). This is **incompatible** with React Native New Architecture (Fabric/TurboModules), which CanaryOS requires (`newArchEnabled: true` in `app.json`).

- `react-native-fast-tflite` uses JSI (New Architecture compatible) and works correctly
- Disabling New Architecture is not an option — `react-native-reanimated` and `react-native-worklets` require it
- **All models must be in TFLite format** for on-device inference

## Current Working Setup

| Component | Details |
|-----------|---------|
| **Runtime** | `react-native-fast-tflite` (JSI-based, New Arch compatible) |
| **Working model** | `assets/models/mobilebert_scam_intent.tflite` |
| **Working model spec** | 1 input (`input_ids` int32 [1,128]), 1 output (float32 [1,1] sigmoid score) |
| **Service files** | `TextClassifierService.ts`, `ModelLoaderService.ts` — both use TFLite API |
| **Inference** | `model.run([Int32Array])` → `Float32Array[]` (positional, not named) |

## V3 ONNX Model to Convert

| Property | Value |
|----------|-------|
| **File** | `assets/models/canary_v3_int8.onnx` |
| **Inputs** | `input_ids` [1,128] int64, `attention_mask` [1,128] int64 |
| **Outputs** | `output` [1,2] float32 (safe/scam logits → softmax → probabilities) |
| **Architecture** | MobileBERT (24 layers, 128 embedding, 512 hidden, 4 heads, 4 FFNs) |
| **Opset** | 18 |
| **Nodes** | 3961 (362 MatMulInteger, 290 DynamicQuantizeLinear) |
| **Quantization** | ONNX Int8 dynamic quantization (uint8 weights + per-tensor scale/zero_point) |
| **Verified output** | zeros input → `[4.69, -5.80]` logits (via onnxruntime) |
| **Vocab** | `assets/models/vocab.txt` (30522 tokens, standard BERT WordPiece) |

### Why V3 is Better

The V3 model has:
- 2 inputs (input_ids + attention_mask) for better context understanding
- 2-class output (safe/scam logits) instead of single sigmoid score
- Larger model with better accuracy on scam detection

## The Conversion Problem

The ONNX model uses **ONNX-specific Int8 quantization ops** that have no TFLite equivalent:

- `MatMulInteger` — integer matrix multiply (362 nodes)
- `DynamicQuantizeLinear` — runtime activation quantization (290 nodes)
- `DequantizeLinear` — weight dequantization

TFLite has its own quantization scheme (post-training quantization, QAT) that is fundamentally different. **No standard conversion tool can bridge these two quantization formats.**

## What Has Been Tried (All Failed)

### 1. `onnx2tf` (direct ONNX → TFLite)
```
TypeError: Input 'y' of 'Sub' Op has type int64 that does not match type int32 of argument 'x'
```
- Fails on `Slice` node due to int64/int32 type mismatch in shape operations
- Even after pre-processing int64→int32, the quantization ops themselves are unsupported

### 2. `onnx-tf` (ONNX → TF SavedModel)
```
cannot import name 'mapping' from 'onnx'
missing tensorflow_addons
```
- Broken dependencies with current onnx/tf versions

### 3. `onnx2torch` (ONNX → PyTorch)
```
NotImplementedError: Converter is not implemented (DequantizeLinear)
```
- Doesn't support quantization ops

### 4. Manual int64→int32 ONNX preprocessing
```
INVALID_GRAPH: Type 'tensor(int32)' of input parameter is invalid
```
- Blindly converting all int64 breaks ops that require int64 inputs

### 5. onnxruntime graph optimization (remove quantization)
- Optimized model still contains `DynamicQuantizeMatMul` and `MatMulIntegerToFloat` (ORT-specific fused ops)
- These are even less standard than the original ops

### 6. Dequantize weights + load into TF MobileBERT (MOST PROMISING)
- Successfully dequantized 1089 weights from uint8 to float32
- Created `TFMobileBertForSequenceClassification` with matching config
- **Mapped 905/1115 weights** (direct name matching + graph-order matching)
- Remaining ~210 unmapped weights are anonymous `onnx::MatMul_*` that need order-based matching
- **Script was killed due to time constraints before completing**

### 7. PyTorch MobileBERT → float32 ONNX → onnx2tf
- Successfully exported 5.7 MB float32 ONNX via `torch.onnx.export`
- But onnx2tf still fails on int64 concat issues in shape operations

## Recommended Next Steps (in order of likelihood to succeed)

### Option A: Complete the TF MobileBERT weight loading (Best bet)
The dequantize → TF MobileBERT → TFLite pipeline was working but ran out of time. Resume with:

1. **Fix weight mapping**: The 210 unmapped weights are linear layer kernels stored as `onnx::MatMul_XXXX`. They need to be matched to TF weights by graph traversal order. The shapes match — it's just a naming problem.
2. **Verify outputs match**: Compare TF model output vs ONNX output on test inputs
3. **Convert**: `tf.lite.TFLiteConverter.from_saved_model()` should work on the float32 TF model
4. **Quantize (optional)**: Apply TFLite's own post-training quantization for size reduction

Key code that was working:
```python
from transformers import MobileBertConfig, TFMobileBertForSequenceClassification
config = MobileBertConfig(
    vocab_size=30522, hidden_size=512, num_hidden_layers=24,
    num_attention_heads=4, intermediate_size=512, embedding_size=128,
    true_hidden_size=128, num_feedforward_networks=4,
    max_position_embeddings=512, num_labels=2,
)
tf_model = TFMobileBertForSequenceClassification(config)
```

### Option B: `ai_edge_torch` (PyTorch → TFLite directly)
Google's `ai_edge_torch` converts PyTorch models to TFLite without going through ONNX:
```python
import ai_edge_torch
# Load dequantized weights into PyTorch MobileBERT (same as above)
# Then:
edge_model = ai_edge_torch.convert(pt_model, sample_input)
edge_model.export("model.tflite")
```
- Was installed but not yet tested
- Avoids all ONNX↔TF conversion issues

### Option C: Re-train/export from original training pipeline
If the original training code/checkpoint is available:
1. Load the PyTorch checkpoint (before ONNX quantization)
2. Export directly to TFLite via `ai_edge_torch` or `tf.lite.TFLiteConverter`
3. Apply TFLite's post-training quantization

### Option D: Use a pre-trained MobileBERT and fine-tune for TFLite
If the training data is available:
1. Load `google/mobilebert-uncased` from HuggingFace
2. Fine-tune on scam detection data
3. Export directly to TFLite (no quantization compatibility issues)

## Environment Details

### Project .venv (`canaryos/.venv`)
```
Python 3.12
tensorflow 2.18.0 → upgraded to 2.19.0 (dependency conflicts with numpy/protobuf)
transformers 4.57.3
keras 3.13.0
torch (CPU, installed from pytorch.org/whl/cpu)
onnx, onnxruntime, onnx2tf, onnxsim (all installed)
optimum 2.1.0
ai_edge_torch (installed, untested)
numpy 2.0.2 → may have been upgraded to 2.4.3 (conflict with tf 2.19)
```

### App Stack
- Expo SDK 54 / React Native 0.81.5
- `react-native-fast-tflite` for TFLite inference
- `newArchEnabled: true` (required, cannot disable)
- Metro config includes `.tflite` and `.onnx` asset extensions

## Files Reference

| File | Purpose |
|------|---------|
| `canaryapp/services/ondevice/TextClassifierService.ts` | Text classification inference (TFLite API) |
| `canaryapp/services/ondevice/ModelLoaderService.ts` | Model loading/caching (TFLite via react-native-fast-tflite) |
| `canaryapp/services/ondevice/TextTokenizer.ts` | BERT WordPiece tokenization |
| `canaryapp/services/ondevice/types.ts` | Type definitions, model config |
| `canaryapp/assets/models/canary_v3_int8.onnx` | V3 ONNX model (to convert) |
| `canaryapp/assets/models/mobilebert_scam_intent.tflite` | Current working TFLite model |
| `canaryapp/assets/models/vocab.txt` | BERT vocabulary (30522 tokens) |
| `canaryapp/scripts/convert_onnx_to_tflite.py` | Conversion script (needs updating) |
| `canaryapp/app.json` | Expo config (`newArchEnabled: true`) |

## After Successful Conversion

Once a V3 TFLite model is created:

1. **Replace** `assets/models/mobilebert_scam_intent.tflite` with the new model
2. **Update `TextClassifierService.ts`**: Already handles 2-input (input_ids + attention_mask) and 2-output (logits → softmax) — no changes needed if model shape matches
3. **Update `types.ts`**: Verify `DEFAULT_MODEL_CONFIG.textModel.outputShape` matches actual output
4. **Test**: Run `npx expo run:android`, use debug "Test Model" button on home screen
5. **Verify**: Model should return scores in 0-1 range (not -1 which indicates failure)

## General Guide: Converting Future Models to TFLite

For future model improvements, **avoid ONNX Int8 quantization** if the target is TFLite:

1. **Best path**: Train in PyTorch → export to TFLite via `ai_edge_torch` or export to TF SavedModel → `tf.lite.TFLiteConverter`
2. **If you need quantization**: Use TFLite's post-training quantization (applied during `TFLiteConverter.convert()`) instead of ONNX quantization
3. **If you must use ONNX**: Export as **float32 ONNX** (no quantization), then convert to TFLite with `onnx2tf`
4. **Avoid**: `torch.quantization`, `onnxruntime.quantization` — these produce ONNX-specific quantized ops that don't translate to TFLite
