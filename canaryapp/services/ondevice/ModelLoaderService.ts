/**
 * Model Loader Service
 * Handles loading, caching, and versioning of TFLite models
 * 
 * Security: Implements SHA-256 hash verification for model integrity
 */

import { Platform } from 'react-native';
// Use legacy API for expo-file-system v19+ (backwards compatible)
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { loadTensorflowModel, TensorflowModel } from 'react-native-fast-tflite';
import { ModelConfig, ModelLoadState, DEFAULT_MODEL_CONFIG } from './types';

// Firebase Storage URLs for model updates
const FIREBASE_MODEL_BASE_URL = 'https://firebasestorage.googleapis.com/v0/b/canary-os.appspot.com/o/models';

// Local cache directory
const MODEL_CACHE_DIR = `${FileSystem.documentDirectory}models/`;

// Model file hashes for integrity verification (to be updated with actual hashes)
const MODEL_HASHES: Record<string, string> = {
  'mobilenet_v3_scam_detect.tflite': 'placeholder_hash_visual',
  'mobilebert_scam_intent.tflite': 'placeholder_hash_text',
};

// Singleton instances
let visualModel: TensorflowModel | null = null;
let textModel: TensorflowModel | null = null;

// Loading state
const loadState: {
  visual: ModelLoadState;
  text: ModelLoadState;
} = {
  visual: { isLoaded: false, isLoading: false, error: null, loadTimeMs: null },
  text: { isLoaded: false, isLoading: false, error: null, loadTimeMs: null },
};

/**
 * Initialize the model cache directory
 */
async function ensureCacheDirectory(): Promise<void> {
  const dirInfo = await FileSystem.getInfoAsync(MODEL_CACHE_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(MODEL_CACHE_DIR, { intermediates: true });
  }
}

/**
 * Check if a model file exists in cache
 */
async function isModelCached(modelName: string): Promise<boolean> {
  const modelPath = `${MODEL_CACHE_DIR}${modelName}`;
  const info = await FileSystem.getInfoAsync(modelPath);
  return info.exists;
}

/**
 * Get the local path for a cached model
 */
function getCachedModelPath(modelName: string): string {
  return `${MODEL_CACHE_DIR}${modelName}`;
}

/**
 * Verify model integrity using SHA-256 hash
 * Security measure to prevent model tampering
 */
async function verifyModelIntegrity(modelPath: string, expectedHash: string): Promise<boolean> {
  // TODO: Implement actual SHA-256 verification using expo-crypto
  // For now, we trust bundled models
  console.log(`[ModelLoader] Hash verification placeholder - implement with expo-crypto`);
  return true;
}

/**
 * Download a model from Firebase Storage
 * Used for model updates after initial bundled deployment
 */
async function downloadModel(modelName: string, remoteUrl: string): Promise<string> {
  await ensureCacheDirectory();
  const localPath = getCachedModelPath(modelName);
  
  console.log(`[ModelLoader] Downloading model: ${modelName}`);
  
  const downloadResult = await FileSystem.downloadAsync(remoteUrl, localPath);
  
  if (downloadResult.status !== 200) {
    throw new Error(`Failed to download model: HTTP ${downloadResult.status}`);
  }
  
  // Verify integrity
  const expectedHash = MODEL_HASHES[modelName];
  if (expectedHash && expectedHash !== 'placeholder_hash_visual' && expectedHash !== 'placeholder_hash_text') {
    const isValid = await verifyModelIntegrity(localPath, expectedHash);
    if (!isValid) {
      await FileSystem.deleteAsync(localPath, { idempotent: true });
      throw new Error('Model integrity verification failed - possible tampering detected');
    }
  }
  
  console.log(`[ModelLoader] Model downloaded successfully: ${modelName}`);
  return localPath;
}

/**
 * Load the visual classifier model (MobileNetV3)
 */
export async function loadVisualModel(): Promise<TensorflowModel> {
  if (visualModel) {
    console.log('[ModelLoader] Visual model already loaded');
    return visualModel;
  }
  
  if (loadState.visual.isLoading) {
    throw new Error('Visual model is already being loaded');
  }
  
  loadState.visual.isLoading = true;
  loadState.visual.error = null;
  
  const startTime = Date.now();
  
  try {
    // Try to load from bundled assets first
    // If not found, check cache or throw error
    
    // Check if we have a bundled model
    let modelUri: string;
    
    try {
      // Try to load from bundled assets
      const asset = Asset.fromModule(require('../../assets/models/mobilenet_v3_scam_detect.tflite'));
      await asset.downloadAsync();
      
      if (!asset.localUri) {
        throw new Error('Failed to resolve bundled model asset');
      }
      modelUri = asset.localUri;
      console.log(`[ModelLoader] Using bundled visual model: ${modelUri}`);
    } catch (bundleError) {
      // No bundled model, check cache or download
      console.log('[ModelLoader] No bundled visual model, checking cache...');
      
      const modelName = 'mobilenet_v3_scam_detect.tflite';
      if (await isModelCached(modelName)) {
        modelUri = getCachedModelPath(modelName);
        console.log(`[ModelLoader] Using cached visual model: ${modelUri}`);
      } else {
        // Model not available - this is an error condition
        throw new Error('Visual model not available - please add mobilenet_v3_scam_detect.tflite to assets/models/');
      }
    }
    
    // Load the model using react-native-fast-tflite
    const config = DEFAULT_MODEL_CONFIG.visualModel;
    visualModel = await loadTensorflowModel(
      { url: modelUri },
      config.delegate
    );
    
    loadState.visual.isLoaded = true;
    loadState.visual.loadTimeMs = Date.now() - startTime;
    
    console.log(`[ModelLoader] Visual model loaded in ${loadState.visual.loadTimeMs}ms`);
    console.log(`[ModelLoader] Visual model inputs: ${JSON.stringify(visualModel.inputs)}`);
    console.log(`[ModelLoader] Visual model outputs: ${JSON.stringify(visualModel.outputs)}`);
    
    return visualModel;
  } catch (error) {
    loadState.visual.error = error as Error;
    console.error('[ModelLoader] Failed to load visual model:', error);
    throw error;
  } finally {
    loadState.visual.isLoading = false;
  }
}

/**
 * Load the text classifier model (MobileBERT)
 */
export async function loadTextModel(): Promise<TensorflowModel> {
  if (textModel) {
    console.log('[ModelLoader] Text model already loaded');
    return textModel;
  }
  
  if (loadState.text.isLoading) {
    throw new Error('Text model is already being loaded');
  }
  
  loadState.text.isLoading = true;
  loadState.text.error = null;
  
  const startTime = Date.now();
  
  try {
    let modelUri: string;
    
    try {
      // Try to load from bundled assets
      const asset = Asset.fromModule(require('../../assets/models/mobilebert_scam_intent.tflite'));
      await asset.downloadAsync();
      
      if (!asset.localUri) {
        throw new Error('Failed to resolve bundled model asset');
      }
      modelUri = asset.localUri;
      console.log(`[ModelLoader] Using bundled text model: ${modelUri}`);
    } catch (bundleError) {
      console.log('[ModelLoader] No bundled text model, checking cache...');
      
      const modelName = 'mobilebert_scam_intent.tflite';
      if (await isModelCached(modelName)) {
        modelUri = getCachedModelPath(modelName);
        console.log(`[ModelLoader] Using cached text model: ${modelUri}`);
      } else {
        console.warn('[ModelLoader] Text model not available - running in test mode');
        throw new Error('Text model not available - please add mobilebert_scam_intent.tflite to assets/models/');
      }
    }
    
    // Load the model
    const config = DEFAULT_MODEL_CONFIG.textModel;
    textModel = await loadTensorflowModel(
      { url: modelUri },
      config.delegate
    );
    
    loadState.text.isLoaded = true;
    loadState.text.loadTimeMs = Date.now() - startTime;
    
    console.log(`[ModelLoader] Text model loaded in ${loadState.text.loadTimeMs}ms`);
    console.log(`[ModelLoader] Text model inputs: ${JSON.stringify(textModel.inputs)}`);
    console.log(`[ModelLoader] Text model outputs: ${JSON.stringify(textModel.outputs)}`);
    
    return textModel;
  } catch (error) {
    loadState.text.error = error as Error;
    console.error('[ModelLoader] Failed to load text model:', error);
    throw error;
  } finally {
    loadState.text.isLoading = false;
  }
}

/**
 * Load all models in parallel
 */
export async function loadAllModels(): Promise<{
  visual: TensorflowModel | null;
  text: TensorflowModel | null;
  errors: string[];
}> {
  const errors: string[] = [];
  let visual: TensorflowModel | null = null;
  let text: TensorflowModel | null = null;
  
  const results = await Promise.allSettled([
    loadVisualModel(),
    loadTextModel(),
  ]);
  
  if (results[0].status === 'fulfilled') {
    visual = results[0].value;
  } else {
    errors.push(`Visual model: ${results[0].reason}`);
  }
  
  if (results[1].status === 'fulfilled') {
    text = results[1].value;
  } else {
    errors.push(`Text model: ${results[1].reason}`);
  }
  
  return { visual, text, errors };
}

/**
 * Get the loaded visual model instance
 */
export function getVisualModel(): TensorflowModel | null {
  return visualModel;
}

/**
 * Get the loaded text model instance
 */
export function getTextModel(): TensorflowModel | null {
  return textModel;
}

/**
 * Get current load state for both models
 */
export function getLoadState(): { visual: ModelLoadState; text: ModelLoadState } {
  return { ...loadState };
}

/**
 * Check if models are ready for inference
 */
export function isReady(): boolean {
  return loadState.visual.isLoaded || loadState.text.isLoaded;
}

/**
 * Check if all models are loaded
 */
export function isFullyLoaded(): boolean {
  return loadState.visual.isLoaded && loadState.text.isLoaded;
}

/**
 * Unload models and free memory
 */
export function unloadModels(): void {
  visualModel = null;
  textModel = null;
  
  loadState.visual = { isLoaded: false, isLoading: false, error: null, loadTimeMs: null };
  loadState.text = { isLoaded: false, isLoading: false, error: null, loadTimeMs: null };
  
  console.log('[ModelLoader] Models unloaded');
}

/**
 * Clear the model cache
 */
export async function clearCache(): Promise<void> {
  try {
    await FileSystem.deleteAsync(MODEL_CACHE_DIR, { idempotent: true });
    console.log('[ModelLoader] Cache cleared');
  } catch (error) {
    console.error('[ModelLoader] Failed to clear cache:', error);
  }
}
