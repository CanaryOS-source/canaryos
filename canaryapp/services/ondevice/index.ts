/**
 * On-Device Scam Analysis Module
 * 
 * This module provides complete on-device scam detection capabilities:
 * - Visual analysis using MobileNetV3 (TFLite)
 * - Text analysis using MobileBERT (TFLite) + heuristics
 * - OCR via Google ML Kit
 * - Score fusion for final risk assessment
 * 
 * IMPORTANT: TFLite models must be placed in assets/models/ before use.
 * See assets/models/README.md for setup instructions.
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
