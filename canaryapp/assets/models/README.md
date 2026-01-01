# TFLite Models for On-Device Scam Detection

This directory contains TensorFlow Lite models for on-device scam detection.

## Required Models

### 1. Visual Classifier (MobileNetV3-Small)
**File:** `mobilenet_v3_scam_detect.tflite`

- **Input:** 224x224x3 RGB image (float32, normalized 0-1)
- **Output:** 4-class softmax probabilities
  - Class 0: `safe` - Normal UI elements
  - Class 1: `login_form` - Login/credential forms
  - Class 2: `warning_popup` - Warning dialogs/urgent prompts
  - Class 3: `critical_scam` - Known scam patterns

**Training Data Categories:**
- Legitimate app screenshots (banking, social media, e-commerce)
- Known phishing page screenshots
- Fake login forms
- Urgency-inducing popup screenshots

### 2. Text Classifier (MobileBERT-Tiny)
**File:** `mobilebert_scam_intent.tflite`

- **Input:** 128-token sequence (int32 input_ids)
- **Output:** Single risk score (float32, 0-1)
  - 0.0-0.3: Safe content
  - 0.3-0.7: Suspicious content
  - 0.7-1.0: Likely scam

**Training Data:**
- Phishing email/SMS text corpus
- Legitimate notification text
- Social engineering message patterns

## Phase 1: Simulation Mode

In Phase 1 (The Digital Lab), the system operates in **simulation mode** without actual TFLite models:

1. **Visual classification** uses heuristic analysis based on OCR results
2. **Text classification** uses pattern matching for:
   - Urgency keywords ("urgent", "immediately", "suspended")
   - Financial keywords ("verify", "payment", "bank", "SSN")
   - Coercion phrases ("account closed", "legal action")
   - Impersonation patterns (brand names in URLs/text)

The simulation mode provides accurate scam detection using the heuristic engine while actual ML models are being trained.

## Adding Real Models

When trained models are ready:

1. Place the `.tflite` files in this directory
2. Update `ModelLoaderService.ts` with SHA-256 hashes:
   ```typescript
   const MODEL_HASHES: Record<string, string> = {
     'mobilenet_v3_scam_detect.tflite': 'actual_sha256_hash_here',
     'mobilebert_scam_intent.tflite': 'actual_sha256_hash_here',
   };
   ```
3. Test model loading with `loadVisualModel()` and `loadTextModel()`
4. Verify inference results match expected outputs

## Model Training Resources

- **TensorFlow Model Garden:** MobileNetV3 pretrained checkpoints
- **Hugging Face:** MobileBERT for sequence classification
- **Training Pipeline:** See `/docs/MODEL_TRAINING.md` (future)

## Security Considerations

- Models should be quantized (int8/float16) for reduced size
- SHA-256 hash verification prevents model tampering
- Firebase Remote Config can deliver model updates securely
