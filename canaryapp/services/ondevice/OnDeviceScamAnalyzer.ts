/**
 * On-Device Scam Analyzer
 * Main orchestrator for on-device scam detection
 * 
 * Coordinates:
 * 1. OCR text extraction
 * 2. Visual classification (OPTIONAL - system works without it)
 * 3. Text classification (REQUIRED)
 * 4. Score fusion
 * 
 * Privacy: All processing happens on-device. No data leaves the device.
 * 
 * OPERATION MODES:
 * - Full Mode: Both visual and text models loaded (best accuracy)
 * - Text-Only Mode: Only text model loaded (still effective for most scams)
 * 
 * @see docs/VISUAL_CLASSIFIER_INTEGRATION.md for future visual model integration
 */

import { Platform } from 'react-native';
import {
  OnDeviceAnalysisResult,
  OnDeviceServiceStatus,
  VisualAnalysisResult,
  TextAnalysisResult,
} from './types';

// Import services
import { 
  loadAllModels,
  loadTextModelOnly,
  isReady,
  isTextModelReady,
  isVisualModelReady,
  isFullyLoaded,
  getLoadState,
  unloadModels,
} from './ModelLoaderService';
import { 
  extractText, 
  isOCRAvailable, 
  normalizeText,
} from './OCRService';
import { 
  classify as classifyVisual,
} from './VisualClassifierService';
import { 
  classify as classifyText,
  quickScamCheck,
} from './TextClassifierService';
import { loadVocabulary } from './TextTokenizer';
import { fuseResults } from './FusionEngine';

// Service state
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;
let isTextOnlyMode = false;

/**
 * Initialize the on-device analysis system
 * Loads models and prepares services
 * 
 * IMPORTANT: 
 * - Text model (MobileBERT) is REQUIRED for analysis
 * - Visual model (MobileNetV3) is OPTIONAL - system works without it
 * 
 * If visual model is unavailable, system runs in text-only mode.
 */
export async function initialize(): Promise<void> {
  if (isInitialized) {
    console.log('[OnDeviceAnalyzer] Already initialized');
    return;
  }
  
  if (initializationPromise) {
    console.log('[OnDeviceAnalyzer] Initialization in progress, waiting...');
    return initializationPromise;
  }
  
  console.log('[OnDeviceAnalyzer] Initializing...');
  
  initializationPromise = (async () => {
    try {
      // Load vocabulary first (required for text tokenization)
      console.log('[OnDeviceAnalyzer] Loading vocabulary...');
      await loadVocabulary();
      
      // Load models in parallel
      console.log('[OnDeviceAnalyzer] Loading models...');
      const { visual, text, errors, isTextReady, isVisualReady } = await loadAllModels();
      
      // Text model is REQUIRED
      if (!text || !isTextReady) {
        throw new Error('Text model failed to load - ensure mobilebert_scam_intent.tflite is in assets/models/');
      }
      
      // Visual model is OPTIONAL
      if (!visual || !isVisualReady) {
        isTextOnlyMode = true;
        console.warn('[OnDeviceAnalyzer] Running in TEXT-ONLY mode (visual model unavailable)');
        console.warn('[OnDeviceAnalyzer] Text analysis is still fully functional');
      } else {
        isTextOnlyMode = false;
        console.log('[OnDeviceAnalyzer] Visual model loaded - full analysis available');
      }
      
      isInitialized = true;
      
      console.log('[OnDeviceAnalyzer] ✓ Initialization complete');
      console.log(`[OnDeviceAnalyzer] Mode: ${isTextOnlyMode ? 'TEXT-ONLY' : 'FULL (Visual + Text)'}`);
      console.log(`[OnDeviceAnalyzer] OCR: ${isOCRAvailable() ? 'available' : 'unavailable'}`);
      
    } catch (error) {
      console.error('[OnDeviceAnalyzer] Initialization failed:', error);
      initializationPromise = null;
      throw error;
    } finally {
      initializationPromise = null;
    }
  })();
  
  return initializationPromise;
}

/**
 * Get current service status
 */
export function getStatus(): OnDeviceServiceStatus {
  const loadState = getLoadState();
  
  return {
    isAvailable: isInitialized,
    visualModelStatus: loadState.visual,
    textModelStatus: loadState.text,
    ocrAvailable: isOCRAvailable(),
    lastError: loadState.visual.error?.message || loadState.text.error?.message || null,
    isTextOnlyMode,
  };
}

/**
 * Check if running in text-only mode (visual model unavailable)
 */
export function isRunningTextOnlyMode(): boolean {
  return isTextOnlyMode;
}

/**
 * Analyze an image for scam content
 * This is the main entry point for on-device scam detection.
 * 
 * OPERATION MODES:
 * - If visual model is loaded: Performs full visual + text analysis
 * - If text-only mode: Uses OCR to extract text, then analyzes with text model
 * 
 * REQUIRES: Text model must be loaded via initialize()
 * 
 * @param imageUri - Local URI of the image to analyze
 * @param options - Analysis options
 */
export async function analyzeImage(
  imageUri: string,
  options: {
    skipOCR?: boolean; // Skip text extraction
    skipVisual?: boolean; // Skip visual analysis (or force text-only)
  } = {}
): Promise<OnDeviceAnalysisResult> {
  const startTime = Date.now();
  
  console.log(`[OnDeviceAnalyzer] Analyzing image: ${imageUri}`);
  
  // Ensure initialized with at least text model
  if (!isInitialized || !isTextModelReady()) {
    throw new Error('On-device analyzer not initialized. Call initialize() first.');
  }
  
  // Run analysis tasks in parallel
  const tasks: Promise<any>[] = [];
  
  // Visual classification (only if visual model is available and not skipped)
  const shouldDoVisual = !options.skipVisual && !isTextOnlyMode && isVisualModelReady();
  
  if (shouldDoVisual) {
    tasks.push(classifyVisual(imageUri));
  } else {
    tasks.push(Promise.resolve(null));
    if (!options.skipVisual && isTextOnlyMode) {
      console.log('[OnDeviceAnalyzer] Skipping visual analysis (text-only mode)');
    }
  }
  
  // OCR + Text classification (primary analysis path)
  if (!options.skipOCR && isOCRAvailable()) {
    tasks.push(
      (async () => {
        // Extract text from image
        const ocrResult = await extractText(imageUri);
        
        if (!ocrResult.text || ocrResult.text.trim().length === 0) {
          console.log('[OnDeviceAnalyzer] No text found in image');
          return null;
        }
        
        const normalizedText = normalizeText(ocrResult.text);
        console.log(`[OnDeviceAnalyzer] Extracted ${normalizedText.length} chars of text`);
        
        // Classify the extracted text
        return classifyText(normalizedText);
      })()
    );
  } else {
    console.log('[OnDeviceAnalyzer] OCR skipped or unavailable');
    tasks.push(Promise.resolve(null));
  }
  
  // Wait for all tasks
  const [visualResult, textResult] = await Promise.all(tasks) as [
    VisualAnalysisResult | null,
    TextAnalysisResult | null
  ];
  
  // Log analysis status
  if (isTextOnlyMode) {
    console.log('[OnDeviceAnalyzer] Analysis: TEXT-ONLY mode');
  } else {
    console.log(`[OnDeviceAnalyzer] Analysis: Visual=${visualResult ? 'yes' : 'no'}, Text=${textResult ? 'yes' : 'no'}`);
  }
  
  // Fuse results (handles null visual result gracefully)
  const fusedResult = fuseResults(visualResult, textResult);
  
  // Add metadata
  fusedResult.totalLatencyMs = Date.now() - startTime;
  
  console.log(`[OnDeviceAnalyzer] Analysis complete in ${fusedResult.totalLatencyMs}ms`);
  console.log(`[OnDeviceAnalyzer] Result: ${fusedResult.isScam ? 'SCAM' : 'SAFE'} (${(fusedResult.fusedScore * 100).toFixed(1)}%)`);
  
  return fusedResult;
}

/**
 * Analyze text directly (without image)
 * Useful for analyzing copied text or direct input
 * 
 * REQUIRES: Text model must be loaded via initialize()
 */
export async function analyzeText(text: string): Promise<OnDeviceAnalysisResult> {
  const startTime = Date.now();
  
  if (!text || text.trim().length === 0) {
    return {
      isScam: false,
      confidence: 0,
      riskLevel: 'low',
      visualScore: 0,
      textScore: 0,
      fusedScore: 0,
      visualAnalysis: null,
      textAnalysis: null,
      explanation: 'No text provided for analysis.',
      redFlags: [],
      safetyTips: [],
      totalLatencyMs: Date.now() - startTime,
      modelVersions: { visual: 'N/A', text: '1.0.0' },
      analysisTimestamp: Date.now(),
      isOnDevice: true,
    };
  }
  
  // Ensure initialized with text model
  if (!isInitialized || !isTextModelReady()) {
    throw new Error('On-device analyzer not initialized. Call initialize() first.');
  }
  
  console.log(`[OnDeviceAnalyzer] Analyzing text (${text.length} chars)`);
  
  // Quick check for obvious scams
  if (quickScamCheck(text)) {
    console.log('[OnDeviceAnalyzer] Quick check detected obvious scam indicators');
  }
  
  // Run text classification
  const textResult = await classifyText(text);
  
  // Fuse with null visual result (text-only analysis)
  const fusedResult = fuseResults(null, textResult);
  fusedResult.totalLatencyMs = Date.now() - startTime;
  
  console.log(`[OnDeviceAnalyzer] Text analysis complete in ${fusedResult.totalLatencyMs}ms`);
  
  return fusedResult;
}

/**
 * Quick analysis for real-time feedback
 * Uses only visual classification for fastest results
 * 
 * NOTE: In text-only mode, this falls back to heuristic-only analysis
 * 
 * @param imageUri - Local URI of the image
 */
export async function quickAnalyze(imageUri: string): Promise<{
  isScam: boolean;
  score: number;
  latencyMs: number;
}> {
  const startTime = Date.now();
  
  // Ensure initialized
  if (!isInitialized || !isTextModelReady()) {
    throw new Error('On-device analyzer not initialized. Call initialize() first.');
  }
  
  // If visual model is available, use it for quick analysis
  if (!isTextOnlyMode && isVisualModelReady()) {
    const visualResult = await classifyVisual(imageUri);
    
    return {
      isScam: visualResult.confidence > 0.5 && visualResult.category !== 'safe',
      score: visualResult.confidence,
      latencyMs: Date.now() - startTime,
    };
  }
  
  // Text-only fallback: extract text and do quick heuristic check
  console.log('[OnDeviceAnalyzer] Quick analyze: text-only fallback');
  
  if (isOCRAvailable()) {
    const ocrResult = await extractText(imageUri);
    if (ocrResult.text && ocrResult.text.length > 0) {
      const isQuickScam = quickScamCheck(ocrResult.text);
      return {
        isScam: isQuickScam,
        score: isQuickScam ? 0.8 : 0.2,
        latencyMs: Date.now() - startTime,
      };
    }
  }
  
  // No analysis possible
  return {
    isScam: false,
    score: 0,
    latencyMs: Date.now() - startTime,
  };
}

/**
 * Check if on-device analysis is available
 * Returns true on native platforms with at least text model loaded
 */
export function isAvailable(): boolean {
  // On web, on-device analysis is not available
  if (Platform.OS === 'web') return false;
  
  // Requires at least text model to be initialized
  return isInitialized && isTextModelReady();
}

/**
 * Cleanup resources
 */
export function cleanup(): void {
  unloadModels();
  isInitialized = false;
  isTextOnlyMode = false;
  console.log('[OnDeviceAnalyzer] Cleaned up');
}

// Export types for consumers
export type { OnDeviceAnalysisResult, OnDeviceServiceStatus };
