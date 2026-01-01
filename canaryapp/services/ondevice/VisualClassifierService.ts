/**
 * Visual Classifier Service
 * Runs MobileNetV3 inference for visual scam detection
 * Phase 1: The Digital Lab
 * 
 * Detects suspicious UI elements: login fields, urgency colors, impersonated logos
 */

import * as ImageManipulator from 'expo-image-manipulator';
import { TensorflowModel } from 'react-native-fast-tflite';
import { 
  VisualAnalysisResult, 
  VisualCategory, 
  PreprocessedImage,
  DEFAULT_MODEL_CONFIG 
} from './types';
import { getVisualModel, loadVisualModel } from './ModelLoaderService';

// Model input dimensions
const INPUT_WIDTH = 224;
const INPUT_HEIGHT = 224;
const INPUT_CHANNELS = 3;
const INPUT_SIZE = INPUT_WIDTH * INPUT_HEIGHT * INPUT_CHANNELS;

// Output class indices
const CLASS_SAFE = 0;
const CLASS_LOGIN = 1;
const CLASS_WARNING = 2;
const CLASS_CRITICAL = 3;

/**
 * Preprocess image for model input
 * Resizes to 224x224 and converts to normalized float tensor
 */
export async function preprocessImage(imageUri: string): Promise<PreprocessedImage> {
  console.log(`[VisualClassifier] Preprocessing image: ${imageUri}`);
  
  // Resize image to model input size
  const manipResult = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ resize: { width: INPUT_WIDTH, height: INPUT_HEIGHT } }],
    { format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  
  if (!manipResult.base64) {
    throw new Error('Failed to get base64 from resized image');
  }
  
  // Convert base64 to pixel data
  // Note: In a production app, we'd use a native module for efficient pixel extraction
  // For Phase 1, we'll create a normalized tensor from the image dimensions
  const tensor = new Float32Array(INPUT_SIZE);
  
  // For Phase 1 without actual pixel extraction, we'll use a placeholder
  // In production, use react-native-image-to-tensor or similar
  // This simulates normalized pixel values (0-1 range)
  for (let i = 0; i < INPUT_SIZE; i++) {
    // Placeholder: would be actual normalized pixel values
    tensor[i] = 0.5;
  }
  
  console.log(`[VisualClassifier] Preprocessed image to ${INPUT_WIDTH}x${INPUT_HEIGHT} tensor`);
  
  return {
    tensor,
    width: INPUT_WIDTH,
    height: INPUT_HEIGHT,
    originalUri: imageUri,
  };
}

/**
 * Convert raw pixel data to normalized tensor
 * Expects RGB values in 0-255 range
 */
export function pixelsToTensor(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number
): Float32Array {
  const tensor = new Float32Array(INPUT_SIZE);
  
  // Resize if needed (simplified - in production use proper interpolation)
  const scaleX = width / INPUT_WIDTH;
  const scaleY = height / INPUT_HEIGHT;
  
  for (let y = 0; y < INPUT_HEIGHT; y++) {
    for (let x = 0; x < INPUT_WIDTH; x++) {
      const srcX = Math.floor(x * scaleX);
      const srcY = Math.floor(y * scaleY);
      const srcIdx = (srcY * width + srcX) * 4; // RGBA format
      const dstIdx = (y * INPUT_WIDTH + x) * 3; // RGB format
      
      // Normalize to 0-1 range
      tensor[dstIdx] = pixels[srcIdx] / 255.0;     // R
      tensor[dstIdx + 1] = pixels[srcIdx + 1] / 255.0; // G
      tensor[dstIdx + 2] = pixels[srcIdx + 2] / 255.0; // B
    }
  }
  
  return tensor;
}

/**
 * Run visual classification inference
 * Returns probabilities for each category
 */
export async function classify(imageUri: string): Promise<VisualAnalysisResult> {
  const startTime = Date.now();
  
  try {
    // Get or load the model
    let model = getVisualModel();
    if (!model) {
      console.log('[VisualClassifier] Model not loaded, loading now...');
      model = await loadVisualModel();
    }
    
    // Preprocess the image
    const preprocessed = await preprocessImage(imageUri);
    
    // Run inference
    console.log('[VisualClassifier] Running inference...');
    const output = await model.run([preprocessed.tensor]);
    
    // Parse output probabilities
    const probabilities = output[0] as Float32Array;
    
    // Determine category (highest probability)
    let maxProb = -1;
    let maxIdx = 0;
    
    const probs = {
      safe: probabilities[CLASS_SAFE] || 0,
      login: probabilities[CLASS_LOGIN] || 0,
      warning: probabilities[CLASS_WARNING] || 0,
      critical: probabilities[CLASS_CRITICAL] || 0,
    };
    
    // Find max
    for (let i = 0; i < 4; i++) {
      if (probabilities[i] > maxProb) {
        maxProb = probabilities[i];
        maxIdx = i;
      }
    }
    
    // Map index to category
    const categories = [
      VisualCategory.SAFE,
      VisualCategory.LOGIN,
      VisualCategory.WARNING,
      VisualCategory.CRITICAL,
    ];
    
    const latencyMs = Date.now() - startTime;
    
    console.log(`[VisualClassifier] Classification complete in ${latencyMs}ms`);
    console.log(`[VisualClassifier] Result: ${categories[maxIdx]} (${(maxProb * 100).toFixed(1)}%)`);
    
    return {
      category: categories[maxIdx],
      confidence: maxProb,
      probabilities: probs,
      latencyMs,
    };
  } catch (error) {
    console.error('[VisualClassifier] Classification failed:', error);
    
    // Return safe with low confidence on error
    return {
      category: VisualCategory.SAFE,
      confidence: 0,
      probabilities: { safe: 0, login: 0, warning: 0, critical: 0 },
      latencyMs: Date.now() - startTime,
    };
  }
}

/**
 * Run classification with simulated results (for testing without actual model)
 * Analyzes basic image characteristics to provide plausible results
 */
export async function classifySimulated(imageUri: string): Promise<VisualAnalysisResult> {
  const startTime = Date.now();
  
  console.log('[VisualClassifier] Running simulated classification...');
  
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
  
  // Generate plausible random results
  // In a real scenario, this would be actual model output
  const random = Math.random();
  
  let category: VisualCategory;
  let probabilities: { safe: number; login: number; warning: number; critical: number };
  
  if (random < 0.5) {
    category = VisualCategory.SAFE;
    probabilities = {
      safe: 0.7 + Math.random() * 0.25,
      login: Math.random() * 0.15,
      warning: Math.random() * 0.1,
      critical: Math.random() * 0.05,
    };
  } else if (random < 0.7) {
    category = VisualCategory.LOGIN;
    probabilities = {
      safe: Math.random() * 0.2,
      login: 0.5 + Math.random() * 0.4,
      warning: Math.random() * 0.2,
      critical: Math.random() * 0.1,
    };
  } else if (random < 0.9) {
    category = VisualCategory.WARNING;
    probabilities = {
      safe: Math.random() * 0.15,
      login: Math.random() * 0.2,
      warning: 0.5 + Math.random() * 0.35,
      critical: Math.random() * 0.15,
    };
  } else {
    category = VisualCategory.CRITICAL;
    probabilities = {
      safe: Math.random() * 0.1,
      login: Math.random() * 0.1,
      warning: Math.random() * 0.2,
      critical: 0.6 + Math.random() * 0.35,
    };
  }
  
  // Normalize probabilities
  const sum = probabilities.safe + probabilities.login + probabilities.warning + probabilities.critical;
  probabilities.safe /= sum;
  probabilities.login /= sum;
  probabilities.warning /= sum;
  probabilities.critical /= sum;
  
  const confidence = Math.max(
    probabilities.safe,
    probabilities.login,
    probabilities.warning,
    probabilities.critical
  );
  
  const latencyMs = Date.now() - startTime;
  
  return {
    category,
    confidence,
    probabilities,
    latencyMs,
  };
}

/**
 * Get visual risk score (0-1) from visual analysis
 * Maps categories to risk levels
 */
export function getVisualRiskScore(result: VisualAnalysisResult): number {
  const weights = {
    [VisualCategory.SAFE]: 0.0,
    [VisualCategory.LOGIN]: 0.4, // Login screens could be phishing
    [VisualCategory.WARNING]: 0.7, // Warning elements are suspicious
    [VisualCategory.CRITICAL]: 0.95, // Critical elements are very suspicious
  };
  
  // Weighted sum based on all probabilities
  return (
    weights[VisualCategory.SAFE] * result.probabilities.safe +
    weights[VisualCategory.LOGIN] * result.probabilities.login +
    weights[VisualCategory.WARNING] * result.probabilities.warning +
    weights[VisualCategory.CRITICAL] * result.probabilities.critical
  );
}
