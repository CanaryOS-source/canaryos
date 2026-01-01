/**
 * On-Device Scam Analyzer
 * Main orchestrator for Phase 1: The Digital Lab
 * 
 * Coordinates:
 * 1. OCR text extraction
 * 2. Visual classification
 * 3. Text classification  
 * 4. Score fusion
 * 
 * Privacy: All processing happens on-device. No data leaves the device.
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
  isReady, 
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
  classifySimulated as classifyVisualSimulated,
} from './VisualClassifierService';
import { 
  classify as classifyText, 
  classifySimulated as classifyTextSimulated,
  quickScamCheck,
} from './TextClassifierService';
import { fuseResults } from './FusionEngine';

// Service state
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize the on-device analysis system
 * Loads models and prepares services
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
      // Load models in parallel
      const { visual, text, errors } = await loadAllModels();
      
      if (errors.length > 0) {
        console.warn('[OnDeviceAnalyzer] Some models failed to load:', errors);
        // Continue anyway - we can fall back to simulated/heuristic mode
      }
      
      isInitialized = true;
      console.log('[OnDeviceAnalyzer] Initialization complete');
      console.log(`[OnDeviceAnalyzer] Visual model: ${visual ? 'loaded' : 'unavailable'}`);
      console.log(`[OnDeviceAnalyzer] Text model: ${text ? 'loaded' : 'unavailable'}`);
      console.log(`[OnDeviceAnalyzer] OCR: ${isOCRAvailable() ? 'available' : 'unavailable'}`);
    } catch (error) {
      console.error('[OnDeviceAnalyzer] Initialization failed:', error);
      // Mark as initialized anyway so we can use fallback mode
      isInitialized = true;
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
  };
}

/**
 * Analyze an image for scam content
 * This is the main entry point for Phase 1: The Digital Lab
 * 
 * @param imageUri - Local URI of the image to analyze
 * @param options - Analysis options
 */
export async function analyzeImage(
  imageUri: string,
  options: {
    useSimulation?: boolean; // Use simulated results for testing
    skipOCR?: boolean; // Skip text extraction
    skipVisual?: boolean; // Skip visual analysis
  } = {}
): Promise<OnDeviceAnalysisResult> {
  const startTime = Date.now();
  
  console.log(`[OnDeviceAnalyzer] Analyzing image: ${imageUri}`);
  
  // Ensure initialized
  if (!isInitialized) {
    console.log('[OnDeviceAnalyzer] Auto-initializing...');
    try {
      await initialize();
    } catch (e) {
      console.warn('[OnDeviceAnalyzer] Initialization failed, using fallback mode');
    }
  }
  
  const useSimulation = options.useSimulation || !isReady();
  
  // Run analysis tasks in parallel
  const tasks: Promise<any>[] = [];
  
  // Visual classification
  if (!options.skipVisual) {
    if (useSimulation) {
      tasks.push(classifyVisualSimulated(imageUri));
    } else {
      tasks.push(classifyVisual(imageUri).catch(err => {
        console.error('[OnDeviceAnalyzer] Visual classification failed:', err);
        return classifyVisualSimulated(imageUri);
      }));
    }
  } else {
    tasks.push(Promise.resolve(null));
  }
  
  // OCR + Text classification
  if (!options.skipOCR && isOCRAvailable()) {
    tasks.push(
      (async () => {
        // Extract text
        const ocrResult = await extractText(imageUri);
        
        if (!ocrResult.text || ocrResult.text.trim().length === 0) {
          console.log('[OnDeviceAnalyzer] No text found in image');
          return null;
        }
        
        const normalizedText = normalizeText(ocrResult.text);
        console.log(`[OnDeviceAnalyzer] Extracted ${normalizedText.length} chars of text`);
        
        // Classify text
        if (useSimulation) {
          return classifyTextSimulated(normalizedText);
        } else {
          return classifyText(normalizedText).catch(err => {
            console.error('[OnDeviceAnalyzer] Text classification failed:', err);
            return classifyTextSimulated(normalizedText);
          });
        }
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
  
  // Fuse results
  const fusedResult = fuseResults(visualResult, textResult);
  
  // Add total latency including overhead
  fusedResult.totalLatencyMs = Date.now() - startTime;
  
  console.log(`[OnDeviceAnalyzer] Analysis complete in ${fusedResult.totalLatencyMs}ms`);
  console.log(`[OnDeviceAnalyzer] Result: ${fusedResult.isScam ? 'SCAM' : 'SAFE'} (${(fusedResult.fusedScore * 100).toFixed(1)}%)`);
  
  return fusedResult;
}

/**
 * Analyze text directly (without image)
 * Useful for analyzing copied text or direct input
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
  
  console.log(`[OnDeviceAnalyzer] Analyzing text (${text.length} chars)`);
  
  // Quick check for obvious scams
  if (quickScamCheck(text)) {
    console.log('[OnDeviceAnalyzer] Quick check detected obvious scam');
  }
  
  // Run text classification
  const useSimulation = !isReady();
  const textResult = useSimulation
    ? await classifyTextSimulated(text)
    : await classifyText(text).catch(err => {
        console.error('[OnDeviceAnalyzer] Text classification failed:', err);
        return classifyTextSimulated(text);
      });
  
  // Fuse with null visual result
  const fusedResult = fuseResults(null, textResult);
  fusedResult.totalLatencyMs = Date.now() - startTime;
  
  console.log(`[OnDeviceAnalyzer] Text analysis complete in ${fusedResult.totalLatencyMs}ms`);
  
  return fusedResult;
}

/**
 * Quick analysis for real-time feedback
 * Returns basic risk assessment with minimal latency
 */
export async function quickAnalyze(imageUri: string): Promise<{
  isScam: boolean;
  score: number;
  latencyMs: number;
}> {
  const startTime = Date.now();
  
  // Use simulated classification for speed
  const visualResult = await classifyVisualSimulated(imageUri);
  
  return {
    isScam: visualResult.confidence > 0.5 && 
            visualResult.category !== 'safe',
    score: visualResult.confidence,
    latencyMs: Date.now() - startTime,
  };
}

/**
 * Check if on-device analysis is available
 */
export function isAvailable(): boolean {
  // On web, we fall back to cloud
  if (Platform.OS === 'web') return false;
  
  // On native, we can always use simulation mode
  return true;
}

/**
 * Cleanup resources
 */
export function cleanup(): void {
  unloadModels();
  isInitialized = false;
  console.log('[OnDeviceAnalyzer] Cleaned up');
}

// Export types for consumers
export type { OnDeviceAnalysisResult, OnDeviceServiceStatus };
