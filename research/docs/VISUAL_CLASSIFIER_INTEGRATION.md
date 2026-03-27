# Visual Classifier Integration Guide

## Overview

This document provides comprehensive instructions for integrating the Visual Classifier (MobileNetV3) into the Canary OS on-device scam detection pipeline. The system is designed to operate in two modes:

- **Text-Only Mode** (Current): Only the MobileBERT text classifier is active
- **Full Mode** (After Visual Integration): Both Visual and Text classifiers work together

The architecture is already prepared for visual model integration - you only need to train/obtain the model and place it in the correct location.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       On-Device Scam Analyzer                        │
│                     (OnDeviceScamAnalyzer.ts)                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐                                                   │
│  │   Image      │                                                   │
│  │   Input      │                                                   │
│  └──────┬───────┘                                                   │
│         │                                                           │
│         ├────────────────────────┬────────────────────────┐        │
│         │                        │                        │        │
│         ▼                        ▼                        ▼        │
│  ┌──────────────┐    ┌───────────────────┐    ┌─────────────────┐ │
│  │   OCR        │    │   Visual          │    │                 │ │
│  │  (ML Kit)    │    │   Classifier      │    │   Preprocess    │ │
│  │              │    │   (MobileNetV3)   │◄───│   Image         │ │
│  └──────┬───────┘    │   ⚠️ PLACEHOLDER  │    │   224x224 RGB   │ │
│         │            └─────────┬─────────┘    └─────────────────┘ │
│         │                      │                                   │
│         ▼                      │                                   │
│  ┌──────────────┐             │                                   │
│  │ Text         │             │                                   │
│  │ Normalizer   │             │                                   │
│  └──────┬───────┘             │                                   │
│         │                      │                                   │
│         ▼                      │                                   │
│  ┌──────────────┐             │                                   │
│  │ WordPiece    │             │                                   │
│  │ Tokenizer    │             │                                   │
│  │ (vocab.txt)  │             │                                   │
│  └──────┬───────┘             │                                   │
│         │                      │                                   │
│         ▼                      │                                   │
│  ┌───────────────────┐        │                                   │
│  │   Text Classifier │        │                                   │
│  │   (MobileBERT)    │        │                                   │
│  │   ✓ ACTIVE        │        │                                   │
│  └─────────┬─────────┘        │                                   │
│            │                   │                                   │
│            └───────────┬───────┘                                   │
│                        │                                           │
│                        ▼                                           │
│              ┌─────────────────┐                                   │
│              │  Fusion Engine  │                                   │
│              │  MAX(visual,    │                                   │
│              │      text)      │                                   │
│              └────────┬────────┘                                   │
│                       │                                            │
│                       ▼                                            │
│              ┌─────────────────┐                                   │
│              │  Risk Score     │                                   │
│              │  0.0 - 1.0      │                                   │
│              └─────────────────┘                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Visual Model Specifications

### Required Model File
- **Filename**: `mobilenet_v3_scam_detect.tflite`
- **Location**: `canaryapp/assets/models/`

### Input Tensor Specification

| Property | Value |
|----------|-------|
| Name | `input` |
| Shape | `[1, 224, 224, 3]` |
| Dtype | `float32` |
| Range | `0.0 - 1.0` (normalized RGB) |

### Output Tensor Specification

| Property | Value |
|----------|-------|
| Name | `output` |
| Shape | `[1, 4]` |
| Dtype | `float32` |
| Values | Softmax probabilities |

### Output Classes

| Index | Class | Description |
|-------|-------|-------------|
| 0 | `safe` | Normal UI elements, legitimate content |
| 1 | `login_form` | Login/credential forms (potential phishing) |
| 2 | `warning_popup` | Warning dialogs, urgent prompts |
| 3 | `critical_scam` | Known scam patterns, high-risk UI |

---

## Integration Steps

### Step 1: Train or Obtain the Visual Model

**Option A: Transfer Learning (Recommended)**

```python
# Training script outline for MobileNetV3-Small
import tensorflow as tf

# Load pre-trained MobileNetV3-Small
base_model = tf.keras.applications.MobileNetV3Small(
    input_shape=(224, 224, 3),
    include_top=False,
    weights='imagenet'
)

# Freeze base layers initially
base_model.trainable = False

# Add classification head
model = tf.keras.Sequential([
    base_model,
    tf.keras.layers.GlobalAveragePooling2D(),
    tf.keras.layers.Dropout(0.2),
    tf.keras.layers.Dense(4, activation='softmax')  # 4 classes
])

# Compile and train
model.compile(
    optimizer=tf.keras.optimizers.Adam(1e-4),
    loss='categorical_crossentropy',
    metrics=['accuracy']
)

# Train on your scam screenshot dataset
# ...

# Export to TFLite with quantization
converter = tf.lite.TFLiteConverter.from_keras_model(model)
converter.optimizations = [tf.lite.Optimize.DEFAULT]
converter.target_spec.supported_types = [tf.float16]
tflite_model = converter.convert()

with open('mobilenet_v3_scam_detect.tflite', 'wb') as f:
    f.write(tflite_model)
```

**Training Data Requirements:**
- Minimum 5,000 labeled screenshots per class
- Include diverse scam types: phishing, fake prizes, tech support scams
- Balance positive (scam) and negative (legitimate) samples
- Consider using datasets like Phishpedia or manually collected screenshots

**Option B: Use Pre-trained Model**
- Download a phishing detection model from TensorFlow Hub
- Ensure it matches the expected input/output specifications

### Step 2: Place Model in Assets

```bash
# Copy the trained model to assets directory
cp mobilenet_v3_scam_detect.tflite canaryapp/assets/models/

# Verify the model file
ls -la canaryapp/assets/models/
# Should show:
#   mobilebert_scam_intent.tflite (text model - already present)
#   mobilenet_v3_scam_detect.tflite (visual model - NEW)
#   vocab.txt (tokenizer vocabulary)
```

### Step 3: Update Model Hash for Security

Calculate the SHA-256 hash of the model:

```bash
shasum -a 256 canaryapp/assets/models/mobilenet_v3_scam_detect.tflite
```

Update `ModelLoaderService.ts`:

```typescript
// In canaryapp/services/ondevice/ModelLoaderService.ts

const MODEL_HASHES: Record<string, string> = {
  'mobilenet_v3_scam_detect.tflite': 'YOUR_ACTUAL_SHA256_HASH_HERE', // ← Update this
  'mobilebert_scam_intent.tflite': 'f71f1c5edb98c9ec1636e1b1cc4fdf89a1f72cde04a69effc3624f1c0fadf1ab',
};
```

### Step 4: Rebuild the App

```bash
cd canaryapp

# Clean build cache to include new assets
npx expo prebuild --clean

# Build for Android
npm run android

# Build for iOS
npx pod-install
npm run ios
```

### Step 5: Verify Integration

Check console logs during app startup:

```
[ModelLoader] Loading vocabulary from bundled assets...
[ModelLoader] ✓ Loaded vocabulary with 30522 tokens
[ModelLoader] Using bundled visual model: ...
[ModelLoader] Visual model loaded in Xms
[ModelLoader] Using bundled text model: ...
[ModelLoader] Text model loaded in Xms
[OnDeviceAnalyzer] ✓ Initialization complete
[OnDeviceAnalyzer] Mode: FULL (Visual + Text)
```

---

## Code Components Reference

### Key Files to Understand

| File | Purpose |
|------|---------|
| [ModelLoaderService.ts](../services/ondevice/ModelLoaderService.ts) | Loads TFLite models from assets |
| [VisualClassifierService.ts](../services/ondevice/VisualClassifierService.ts) | Runs visual model inference |
| [OnDeviceScamAnalyzer.ts](../services/ondevice/OnDeviceScamAnalyzer.ts) | Orchestrates the analysis pipeline |
| [FusionEngine.ts](../services/ondevice/FusionEngine.ts) | Combines visual + text scores |

### VisualClassifierService Overview

The visual classifier service is already implemented and ready. Key functions:

```typescript
// Preprocess image to 224x224 tensor
async function preprocessImage(imageUri: string): Promise<PreprocessedImage>

// Run visual classification
async function classify(imageUri: string): Promise<VisualAnalysisResult>

// Convert classification to risk score
function getVisualRiskScore(result: VisualAnalysisResult): number
```

**⚠️ TODO**: The `preprocessImage` function has a placeholder for actual pixel extraction. You may need to implement proper base64-to-tensor conversion:

```typescript
// In VisualClassifierService.ts, update preprocessImage()
// Current: Placeholder that fills tensor with 0.5
// Needed: Actual pixel extraction from base64 image

// Option 1: Use a library like react-native-image-to-tensor
// Option 2: Implement native module for efficient pixel extraction
// Option 3: Use expo-image-manipulator to get raw pixel data
```

### Fusion Engine

The fusion engine uses a **MAX strategy**:

```
Score_Final = max(Score_Visual, Score_Text)
```

This means if EITHER the visual OR text analysis detects a scam, the system flags it. The logic is already implemented - no changes needed.

---

## Testing the Integration

### Test Cases

1. **Known Scam Screenshot**
   - Upload a phishing email/website screenshot
   - Expected: High risk score from both visual and text

2. **Legitimate Content**
   - Upload a normal app screenshot
   - Expected: Low risk score

3. **Visual-Only Scam** (no text)
   - Upload an image with suspicious UI but no readable text
   - Expected: High visual score drives the result

4. **Text-Only Scam** (plain text)
   - Upload an image with just scam text, no suspicious UI
   - Expected: High text score drives the result

### Debug Logging

Enable verbose logging by checking console output:

```
[VisualClassifier] Preprocessing image: file:///...
[VisualClassifier] Running inference...
[VisualClassifier] Classification complete in Xms
[VisualClassifier] Result: critical_scam (85.2%)

[TextClassifier] Analyzing text (234 chars)...
[TextClassifier] Model score: 78.5%
[TextClassifier] Combined score: 82.1%

[FusionEngine] Fused result: 85.2% risk
[FusionEngine] Visual: 85.2%, Text: 82.1%
```

---

## Performance Considerations

### Expected Latency

| Component | Target | Actual (Placeholder) |
|-----------|--------|---------------------|
| Image Preprocessing | <50ms | TBD |
| Visual Inference | <100ms | TBD |
| Total Pipeline | <300ms | ~200ms (text-only) |

### Memory Usage

- Visual model: ~10-20MB (quantized)
- Text model: ~50-100MB
- Peak memory during inference: ~150MB

### Optimization Tips

1. **Quantization**: Use INT8 or FLOAT16 quantization for smaller, faster models
2. **Delegate**: Use GPU delegate for Android (`'android-gpu'`) or Core ML for iOS (`'core-ml'`)
3. **Lazy Loading**: Models are loaded on-demand, not at app startup

---

## Troubleshooting

### "Visual model not available - running in text-only mode"

**Cause**: Model file not found in assets

**Solution**:
1. Verify `mobilenet_v3_scam_detect.tflite` exists in `canaryapp/assets/models/`
2. Run `npx expo prebuild --clean`
3. Rebuild the app

### "Visual model inference failed"

**Cause**: Model input/output shape mismatch

**Solution**:
1. Verify model has exactly the expected shapes:
   - Input: `[1, 224, 224, 3]` float32
   - Output: `[1, 4]` float32
2. Check quantization compatibility
3. Review model conversion script

### Low Visual Accuracy

**Cause**: Poor training data or overfitting

**Solution**:
1. Use more diverse training data
2. Add data augmentation (rotation, brightness, etc.)
3. Fine-tune hyperparameters
4. Consider using a larger base model

---

## Security Considerations

1. **Hash Verification**: Always update `MODEL_HASHES` when deploying new models
2. **Model Signing**: Consider implementing model signing for production
3. **Secure Delivery**: Use Firebase Remote Config for OTA model updates
4. **On-Device Only**: All inference happens locally - no data leaves the device

---

## Future Enhancements

1. **Dynamic Model Updates**: Download model updates via Firebase without app update
2. **Ensemble Models**: Run multiple visual models and average predictions
3. **Attention Visualization**: Highlight suspicious regions in the image
4. **Model Compression**: Knowledge distillation for smaller models
5. **Batch Processing**: Analyze multiple images in parallel

---

## Appendix: Class Definitions

### VisualAnalysisResult

```typescript
interface VisualAnalysisResult {
  category: VisualCategory;  // 'safe' | 'login' | 'warning' | 'critical'
  confidence: number;        // 0.0 - 1.0
  probabilities: {
    safe: number;
    login: number;
    warning: number;
    critical: number;
  };
  latencyMs: number;
}
```

### Risk Score Mapping

```typescript
// In VisualClassifierService.ts
const categoryToRiskWeight = {
  safe: 0.0,       // No risk
  login: 0.4,      // Moderate - could be phishing
  warning: 0.7,    // High - urgent/warning UI patterns
  critical: 0.95,  // Very high - known scam patterns
};
```

---

## Contact & Resources

- **Model Training**: See `notebooks/` directory for training scripts
- **Architecture Docs**: [PHASE_1_MODEL_STRATEGY.md](../../PHASE_1_MODEL_STRATEGY.md)
- **Text Model Guide**: [assets/models/README.md](../assets/models/README.md)
