/**
 * Type definitions for On-Device Scam Analysis
 */

// Model configuration types
export interface ModelConfig {
  name: string;
  version: string;
  inputShape: number[];
  outputShape: number[];
  delegate?: 'default' | 'core-ml' | 'metal' | 'nnapi' | 'android-gpu';
}

export interface ModelMetadata {
  visualModel: ModelConfig;
  textModel: ModelConfig;
  vocabSize: number;
  maxSequenceLength: number;
}

// Default model configuration
export const DEFAULT_MODEL_CONFIG: ModelMetadata = {
  visualModel: {
    name: 'mobilenet_v3_scam_detect',
    version: '1.0.0',
    inputShape: [1, 224, 224, 3], // Batch, Height, Width, Channels (RGB)
    outputShape: [1, 4], // Safe, Login, Warning, Critical
    delegate: 'default',
  },
  textModel: {
    name: 'mobilebert_scam_intent',
    version: '1.0.0',
    inputShape: [1, 128], // Batch, Sequence Length (token IDs)
    outputShape: [1, 1], // Risk score 0-1
    delegate: 'default',
  },
  vocabSize: 30522, // Standard BERT vocab size
  maxSequenceLength: 128,
};

// Visual classification categories
export enum VisualCategory {
  SAFE = 'safe',
  LOGIN = 'login',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

// Analysis result types
export interface VisualAnalysisResult {
  category: VisualCategory;
  confidence: number;
  probabilities: {
    safe: number;
    login: number;
    warning: number;
    critical: number;
  };
  latencyMs: number;
}

export interface TextAnalysisResult {
  riskScore: number;
  extractedText: string;
  detectedPatterns: ScamPattern[];
  latencyMs: number;
}

export interface ScamPattern {
  type: ScamPatternType;
  confidence: number;
  matchedText: string;
}

export enum ScamPatternType {
  URGENCY = 'urgency',
  FINANCIAL_REQUEST = 'financial_request',
  COERCION = 'coercion',
  IMPERSONATION = 'impersonation',
  SUSPICIOUS_LINK = 'suspicious_link',
  PERSONAL_INFO_REQUEST = 'personal_info_request',
  TOO_GOOD_TO_BE_TRUE = 'too_good_to_be_true',
  HOMOGLYPH_ATTACK = 'homoglyph_attack',
}

// Fused analysis result
export interface OnDeviceAnalysisResult {
  // Core result
  isScam: boolean;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  
  // Component scores
  visualScore: number;
  textScore: number;
  fusedScore: number;
  
  // Detailed analysis
  visualAnalysis: VisualAnalysisResult | null;
  textAnalysis: TextAnalysisResult | null;
  
  // Explanation for user
  explanation: string;
  redFlags: string[];
  safetyTips: string[];
  
  // Performance metrics
  totalLatencyMs: number;
  modelVersions: {
    visual: string;
    text: string;
  };
  
  // Metadata
  analysisTimestamp: number;
  isOnDevice: true;
}

// OCR result type
export interface OCRResult {
  text: string;
  blocks: OCRBlock[];
  confidence: number;
  latencyMs: number;
}

export interface OCRBlock {
  text: string;
  frame: {
    width: number;
    height: number;
    top: number;
    left: number;
  };
  lines: OCRLine[];
}

export interface OCRLine {
  text: string;
  elements: OCRElement[];
}

export interface OCRElement {
  text: string;
}

// Image preprocessing types
export interface PreprocessedImage {
  tensor: Float32Array;
  width: number;
  height: number;
  originalUri: string;
}

// Model loading state
export interface ModelLoadState {
  isLoaded: boolean;
  isLoading: boolean;
  error: Error | null;
  loadTimeMs: number | null;
}

// Service status
export interface OnDeviceServiceStatus {
  isAvailable: boolean;
  visualModelStatus: ModelLoadState;
  textModelStatus: ModelLoadState;
  ocrAvailable: boolean;
  lastError: string | null;
  /** True if running without visual model (text analysis only) */
  isTextOnlyMode?: boolean;
}
