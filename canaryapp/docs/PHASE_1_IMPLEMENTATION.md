# Phase 1 Implementation: The Digital Lab

## Overview

Phase 1 ("The Digital Lab") implements on-device scam detection for user-uploaded screenshots. This document details the technical implementation, architecture decisions, and usage guidelines.

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
import { analyzeImageOnDevice, analyzeTextOnDevice, isOnDeviceAvailable } from '@/services/ondevice';

// Check availability
const available = await isOnDeviceAvailable();

// Analyze an image
const result = await analyzeImageOnDevice(imageUri);
console.log(result.riskScore); // 0.0 - 1.0
console.log(result.classification); // 'safe' | 'suspicious' | 'scam'
console.log(result.redFlags); // ['Urgency language detected', ...]
```

### 2. OCRService (`services/ondevice/OCRService.ts`)

Extracts text from images using Google ML Kit:

- **Platform Support:** iOS and Android (native ML Kit)
- **Web Fallback:** Placeholder that returns empty text
- **Features:**
  - Block-level text extraction
  - Confidence scoring
  - Bounding box information

### 3. VisualClassifierService (`services/ondevice/VisualClassifierService.ts`)

Classifies screenshots using MobileNetV3-Small (or heuristics in simulation mode):

- **Input:** 224x224 RGB image
- **Output Categories:**
  - `safe` - Normal UI elements
  - `login_form` - Credential input forms
  - `warning_popup` - Urgency dialogs
  - `critical_scam` - Known scam patterns

**Simulation Mode:** When TFLite models aren't available, uses OCR-based heuristics.

### 4. TextClassifierService (`services/ondevice/TextClassifierService.ts`)

Analyzes extracted text for scam indicators:

#### Heuristic Engine
The TextClassifierService includes a comprehensive heuristic engine that detects:

| Pattern Type | Examples | Weight |
|-------------|----------|--------|
| **Urgency** | "act now", "expires today", "urgent" | 0.15-0.20 |
| **Financial** | "bank account", "SSN", "credit card" | 0.20-0.25 |
| **Coercion** | "account suspended", "legal action" | 0.25 |
| **Impersonation** | "Microsoft Support", "Apple Security" | 0.30 |
| **Homoglyphs** | "Аpple" (Cyrillic А), "Gооgle" (Cyrillic о) | 0.35 |

#### MobileBERT (When Available)
- 128-token sequence input
- WordPiece tokenization with 30522 vocabulary
- Single float output (risk score 0-1)

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
- **Security:** SHA-256 hash verification (placeholder in Phase 1)

## Risk Classification

| Risk Score | Classification | Action |
|------------|----------------|--------|
| 0.0 - 0.3 | `safe` | Green badge, "Looks Safe" |
| 0.3 - 0.7 | `suspicious` | Yellow badge, "Suspicious" |
| 0.7 - 1.0 | `scam` | Red badge, "Likely Scam" |

## UI Components

### Scanner Screen (`app/scanner.tsx`)

The scanner screen displays:

1. **Risk Score Badge** - Color-coded (green/yellow/red)
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
    isAnalyzing 
  } = useScanner();

  const handleCapture = async (uri: string) => {
    await scanImage(uri);
    // analysisResult will be populated with OnDeviceAnalysisResult
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

## Testing

### Simulation Mode

Without actual TFLite models, the system runs in simulation mode:

1. Visual classification uses OCR-based keyword detection
2. Text classification uses the full heuristic engine
3. All UI components function normally

### Test Cases

```typescript
// High-risk test case
const testText = "URGENT: Your Microsoft account has been suspended! " +
                 "Click here to verify your identity within 24 hours " +
                 "or your account will be permanently deleted.";
// Expected: riskScore > 0.7, classification: 'scam'

// Safe test case  
const safeText = "Welcome to your email inbox. You have 3 new messages.";
// Expected: riskScore < 0.3, classification: 'safe'
```

## Future Enhancements (Phase 2+)

- [ ] Actual TFLite model training and deployment
- [ ] Firebase Remote Config for model updates
- [ ] A/B testing between model versions
- [ ] Real-time feedback collection for model improvement
- [ ] Edge case handling and confidence calibration

## Files Created

| File | Description |
|------|-------------|
| `services/ondevice/types.ts` | Type definitions |
| `services/ondevice/ModelLoaderService.ts` | Model loading & caching |
| `services/ondevice/OCRService.ts` | ML Kit text extraction |
| `services/ondevice/TextTokenizer.ts` | WordPiece tokenization |
| `services/ondevice/VisualClassifierService.ts` | Visual classification |
| `services/ondevice/TextClassifierService.ts` | Text classification |
| `services/ondevice/FusionEngine.ts` | Score fusion |
| `services/ondevice/OnDeviceScamAnalyzer.ts` | Main orchestrator |
| `services/ondevice/index.ts` | Module exports |
| `assets/models/README.md` | Model documentation |

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `react-native-fast-tflite` | 1.6.1 | TFLite inference (JSI) |
| `@react-native-ml-kit/text-recognition` | 2.2.0 | OCR (Google ML Kit) |
| `expo-image-manipulator` | existing | Image preprocessing |
| `expo-file-system` | existing | Model caching |
| `expo-asset` | existing | Asset bundling |

## Troubleshooting

### "Visual model not available"
The system gracefully falls back to simulation mode. This is expected in Phase 1.

### OCR returns empty text
- Check platform: ML Kit only works on iOS/Android, not web
- Ensure image has sufficient resolution
- Check image format (JPEG/PNG supported)

### High latency
- First run includes model loading overhead
- Subsequent runs should be faster (cached models)
- Consider image downscaling for faster OCR
