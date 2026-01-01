# TFLite Models for On-Device Scam Detection

This directory contains TensorFlow Lite models for on-device scam detection.

**⚠️ IMPORTANT: Both models are REQUIRED for the app to function.** Place the `.tflite` files in this directory before running the app.

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

## Setup Instructions

### Step 1: Obtain or Train Models

**Option A: Use Pre-trained Models**
- Download MobileNetV3-Small from TensorFlow Model Garden
- Fine-tune on scam detection dataset
- Export as TFLite with float32 or int8 quantization

**Option B: Train Custom Models**
- Use training scripts (see `/docs/MODEL_TRAINING.md`)
- Dataset requirements: minimum 10,000 labeled samples per class

### Step 2: Place Models in Directory

```bash
# Copy models to this directory
cp /path/to/mobilenet_v3_scam_detect.tflite ./
cp /path/to/mobilebert_scam_intent.tflite ./
```

### Step 3: Update Model Hashes (Security)

After adding models, calculate SHA-256 hashes and update `ModelLoaderService.ts`:

```bash
# Calculate hashes
shasum -a 256 mobilenet_v3_scam_detect.tflite
shasum -a 256 mobilebert_scam_intent.tflite
```

Update in `services/ondevice/ModelLoaderService.ts`:
```typescript
const MODEL_HASHES: Record<string, string> = {
  'mobilenet_v3_scam_detect.tflite': 'your_visual_model_sha256_hash',
  'mobilebert_scam_intent.tflite': 'your_text_model_sha256_hash',
};
```

### Step 4: Rebuild the App

```bash
cd canaryapp

# Clean build cache to include new assets
npx expo prebuild --clean

# Build for Android
npm run android

# Build for iOS (requires pod install)
npx pod-install
npm run ios
```

### Step 5: Verify Model Loading

Check console logs for successful model loading:
```
[ModelLoader] Using bundled visual model: ...
[ModelLoader] Visual model loaded in Xms
[ModelLoader] Using bundled text model: ...  
[ModelLoader] Text model loaded in Xms
[OnDeviceAnalyzer] Initialization complete
```

## Model Specifications

### Visual Model Input Tensor
| Property | Value |
|----------|-------|
| Name | `input` |
| Shape | `[1, 224, 224, 3]` |
| Dtype | `float32` |
| Range | `0.0 - 1.0` (normalized) |

### Visual Model Output Tensor
| Property | Value |
|----------|-------|
| Name | `output` |
| Shape | `[1, 4]` |
| Dtype | `float32` |
| Values | Softmax probabilities |

### Text Model Input Tensor
| Property | Value |
|----------|-------|
| Name | `input_ids` |
| Shape | `[1, 128]` |
| Dtype | `int32` |
| Values | WordPiece token IDs |

### Text Model Output Tensor
| Property | Value |
|----------|-------|
| Name | `output` |
| Shape | `[1, 1]` |
| Dtype | `float32` |
| Range | `0.0 - 1.0` (risk score) |

## Model Training Resources

### Visual Classifier
- **Base Architecture:** MobileNetV3-Small (pretrained on ImageNet)
- **Transfer Learning:** Fine-tune final layers on scam screenshot dataset
- **TensorFlow Hub:** `https://tfhub.dev/google/imagenet/mobilenet_v3_small_100_224/feature_vector/5`

### Text Classifier  
- **Base Architecture:** MobileBERT-Tiny (distilled from BERT)
- **Fine-tuning:** Sequence classification on scam text corpus
- **Hugging Face:** `google/mobilebert-uncased`

### Quantization
For optimal mobile performance, use post-training quantization:
```python
converter = tf.lite.TFLiteConverter.from_saved_model(model_path)
converter.optimizations = [tf.lite.Optimize.DEFAULT]
converter.target_spec.supported_types = [tf.float16]  # or tf.int8
tflite_model = converter.convert()
```

## Security Considerations

- Models should be quantized (int8/float16) for reduced size
- SHA-256 hash verification prevents model tampering
- Firebase Remote Config can deliver model updates securely

## Troubleshooting

### "Visual model not available"
- Ensure `mobilenet_v3_scam_detect.tflite` is in this directory
- Run `npx expo prebuild --clean` to refresh assets
- Verify file is not corrupted (check file size > 1MB)

### "Text model not available"
- Ensure `mobilebert_scam_intent.tflite` is in this directory
- Run `npx expo prebuild --clean` to refresh assets
- Verify file is not corrupted (check file size > 5MB)

### Model Loading Slow
- First load includes file I/O overhead
- Subsequent loads use cached models
- Consider lazy loading for faster app startup

### Inference Errors
- Verify model input/output shapes match expected specifications
- Check that image preprocessing produces correct tensor format
- Ensure tokenizer vocabulary matches model training
