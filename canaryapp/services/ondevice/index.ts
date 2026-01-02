/**
 * On-Device Scam Analysis Module
 * 
 * This module provides complete on-device scam detection capabilities:
 * - Visual analysis using MobileNetV3 (TFLite) [OPTIONAL]
 * - Text analysis using MobileBERT (TFLite) + heuristics [REQUIRED]
 * - OCR via Google ML Kit
 * - Score fusion for final risk assessment
 * 
 * OPERATION MODES:
 * - Full Mode: Both visual and text models loaded (best accuracy)
 * - Text-Only Mode: Only text model loaded (still effective)
 * 
 * IMPORTANT: 
 * - Text model (mobilebert_scam_intent.tflite) MUST be in assets/models/
 * - Visual model (mobilenet_v3_scam_detect.tflite) is OPTIONAL
 * - See docs/VISUAL_CLASSIFIER_INTEGRATION.md for visual model setup
 * 
 * Privacy: All processing happens on-device. No data leaves the device.
 */

// Main analyzer (primary API)
export {
  initialize,
  analyzeImage,
  analyzeText,
  quickAnalyze,
  getStatus,
  isAvailable,
  isRunningTextOnlyMode,
  cleanup,
} from './OnDeviceScamAnalyzer';

// Types
export type {
  OnDeviceAnalysisResult,
  OnDeviceServiceStatus,
  VisualAnalysisResult,
  TextAnalysisResult,
  ScamPattern,
  OCRResult,
  ModelLoadState,
} from './types';

export {
  VisualCategory,
  ScamPatternType,
} from './types';

// Sub-services (for advanced usage)
export * as ModelLoader from './ModelLoaderService';
export * as OCRService from './OCRService';
export * as VisualClassifier from './VisualClassifierService';
export * as TextClassifier from './TextClassifierService';
export * as FusionEngine from './FusionEngine';
export * as Tokenizer from './TextTokenizer';
