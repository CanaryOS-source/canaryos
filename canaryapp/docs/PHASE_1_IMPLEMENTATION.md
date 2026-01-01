# Phase 1 Implementation: On-Device Scam Detection

## Overview

Phase 1 implements on-device scam detection for user-uploaded screenshots. This document details the technical implementation, architecture decisions, and usage guidelines.

**IMPORTANT:** TFLite models are REQUIRED. Place model files in `assets/models/` before running the app. See [assets/models/README.md](../assets/models/README.md) for setup instructions.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Scanner UI                                │
│                     (app/scanner.tsx)                           │
├─────────────────────────────────────────────────────────────────┤
│                       useScanner Hook                            │
│                    (hooks/useScanner.ts)                        │
├─────────────────────────────────────────────────────────────────┤
│                  OnDeviceScamAnalyzer                           │
│           (services/ondevice/OnDeviceScamAnalyzer.ts)           │
├──────────────┬──────────────┬──────────────┬───────────────────┤
│   OCRService │ VisualClass. │ TextClassif. │   FusionEngine    │
│   (ML Kit)   │ (MobileNet)  │ (MobileBERT) │  (Score Fusion)   │
├──────────────┴──────────────┴──────────────┴───────────────────┤
│                    ModelLoaderService                           │
│              (TFLite model loading & caching)                   │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. OnDeviceScamAnalyzer (`services/ondevice/OnDeviceScamAnalyzer.ts`)

The main orchestrator that coordinates all on-device analysis:

```typescript
import { initialize, analyzeImage, isAvailable } from '@/services/ondevice';

// Initialize (loads models - REQUIRED before analysis)
await initialize();

// Check if ready
const available = isAvailable();

// Analyze an image
const result = await analyzeImage(imageUri);
console.log(result.fusedScore); // 0.0 - 1.0
console.log(result.riskLevel); // 'low' | 'medium' | 'high' | 'critical'
console.log(result.redFlags); // ['Urgency language detected', ...]
```

### 2. OCRService (`services/ondevice/OCRService.ts`)

Extracts text from images using Google ML Kit:

- **Platform Support:** iOS and Android (native ML Kit)
- **Web:** Not available (on-device analysis requires native platform)
- **Features:**
  - Block-level text extraction
  - Confidence scoring
  - Bounding box information

### 3. VisualClassifierService (`services/ondevice/VisualClassifierService.ts`)

Classifies screenshots using MobileNetV3-Small TFLite model:

- **Input:** 224x224 RGB image (normalized 0-1)
- **Output Categories:**
  - `safe` - Normal UI elements
  - `login_form` - Credential input forms
  - `warning_popup` - Urgency dialogs
  - `critical_scam` - Known scam patterns

### 4. TextClassifierService (`services/ondevice/TextClassifierService.ts`)

Analyzes extracted text using MobileBERT + heuristic pattern detection:

#### ML Model
- 128-token sequence input
- WordPiece tokenization with 30522 vocabulary
- Single float output (risk score 0-1)

#### Heuristic Engine (Combined with ML)
The TextClassifierService combines ML inference with pattern detection:

| Pattern Type | Examples | Weight |
|-------------|----------|--------|
| **Urgency** | "act now", "expires today", "urgent" | 0.30 |
| **Financial** | "bank account", "SSN", "credit card" | 0.40 |
| **Coercion** | "account suspended", "legal action" | 0.35 |
| **Impersonation** | "Microsoft Support", "Apple Security" | 0.35 |
| **Homoglyphs** | "Аpple" (Cyrillic А), "Gооgle" (Cyrillic о) | 0.50 |

Final score: `ML_score * 0.6 + Heuristic_score * 0.4`

### 5. FusionEngine (`services/ondevice/FusionEngine.ts`)

Combines visual and text analysis using **MAX strategy**:

```
Score_Final = max(Score_Visual, Score_Text)
```

This ensures that if EITHER the visual or text analysis detects risk, the overall score reflects that detection. The fusion engine also:

- Generates human-readable explanations
- Aggregates red flags from both pipelines
- Provides contextual safety recommendations

### 6. ModelLoaderService (`services/ondevice/ModelLoaderService.ts`)

Handles TFLite model lifecycle:

- **Loading:** From bundled assets or Firebase Storage
- **Caching:** Persists models to device storage
- **Versioning:** Supports model updates via Firebase
- **Security:** SHA-256 hash verification for model integrity

## Risk Classification

| Risk Score | Classification | Action |
|------------|----------------|--------|
| 0.0 - 0.3 | `low` | Green badge, "Looks Safe" |
| 0.3 - 0.6 | `medium` | Yellow badge, "Suspicious" |
| 0.6 - 0.8 | `high` | Orange badge, "Likely Scam" |
| 0.8 - 1.0 | `critical` | Red badge, "Scam Detected" |

## UI Components

### Scanner Screen (`app/scanner.tsx`)

The scanner screen displays:

1. **Risk Score Badge** - Color-coded (green/yellow/orange/red)
2. **On-Device Badge** - Indicates local processing
3. **Latency Display** - Processing time in milliseconds
4. **Red Flags List** - Detected suspicious patterns
5. **Detailed Analysis** - Visual and text breakdown
6. **Safety Tips** - Contextual recommendations

### Usage Example

```tsx
import { useScanner } from '@/hooks/useScanner';

function MyComponent() {
  const { 
    scanImage, 
    analysisResult,
    state,
    isInitializing,
  } = useScanner();

  // Note: Hook automatically initializes on mount
  // state will be ERROR if models fail to load
  
  const handleCapture = async (uri: string) => {
    const result = await scanImage(uri);
    // result contains OnDeviceAnalysisResult
  };
}
```

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| OCR Latency | < 200ms | ML Kit on-device |
| Visual Classification | < 100ms | MobileNetV3 quantized |
| Text Classification | < 150ms | MobileBERT + heuristics |
| Total E2E Latency | < 500ms | Including fusion |
| Model Size (Visual) | < 5MB | Quantized |
| Model Size (Text) | < 15MB | Quantized |

## Configuration

### metro.config.js

The metro config already supports `.tflite` files:

```javascript
config.resolver.assetExts.push('tflite');
```

### app.config.js

ML Kit is automatically configured through the `@react-native-ml-kit/text-recognition` plugin.

## Setup Requirements

### Before Running the App

1. **Add TFLite models** to `assets/models/`:
   - `mobilenet_v3_scam_detect.tflite`
   - `mobilebert_scam_intent.tflite`

2. **Update model hashes** in `ModelLoaderService.ts`

3. **Rebuild the app**:
   ```bash
   npx expo prebuild --clean
   npm run android  # or npm run ios
   ```

See [assets/models/README.md](../assets/models/README.md) for detailed setup instructions.

## Test Cases

```typescript
// High-risk test case
const testText = "URGENT: Your Microsoft account has been suspended! " +
                 "Click here to verify your identity within 24 hours " +
                 "or your account will be permanently deleted.";
// Expected: riskScore > 0.7, riskLevel: 'high' or 'critical'

// Safe test case  
const safeText = "Welcome to your email inbox. You have 3 new messages.";
// Expected: riskScore < 0.3, riskLevel: 'low'
```

## Files

| File | Description |
|------|-------------|
| `services/ondevice/types.ts` | Type definitions |
| `services/ondevice/ModelLoaderService.ts` | Model loading & caching |
| `services/ondevice/OCRService.ts` | ML Kit text extraction |
| `services/ondevice/TextTokenizer.ts` | WordPiece tokenization |
| `services/ondevice/VisualClassifierService.ts` | Visual classification |
| `services/ondevice/TextClassifierService.ts` | Text classification + heuristics |
| `services/ondevice/FusionEngine.ts` | Score fusion |
| `services/ondevice/OnDeviceScamAnalyzer.ts` | Main orchestrator |
| `services/ondevice/index.ts` | Module exports |
| `assets/models/README.md` | Model setup documentation |

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `react-native-fast-tflite` | 1.6.1 | TFLite inference (JSI) |
| `@react-native-ml-kit/text-recognition` | 2.2.0 | OCR (Google ML Kit) |
| `expo-image-manipulator` | existing | Image preprocessing |
| `expo-file-system` | existing | Model caching |
| `expo-asset` | existing | Asset bundling |

## Troubleshooting

### "On-device analyzer not initialized"
- Models failed to load during initialization
- Ensure `.tflite` files are in `assets/models/`
- Run `npx expo prebuild --clean` to refresh assets

### OCR returns empty text
- Check platform: ML Kit only works on iOS/Android, not web
- Ensure image has sufficient resolution
- Check image format (JPEG/PNG supported)

### High latency
- First run includes model loading overhead
- Subsequent runs should be faster (cached models)
- Consider image downscaling for faster OCR
