/**
 * Visual Classifier Service
 * Runs MobileNetV3 inference for visual scam detection
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
  // TODO: Use react-native-image-to-tensor or native module for efficient pixel extraction
  // Currently using placeholder - replace with actual pixel extraction
  const tensor = new Float32Array(INPUT_SIZE);
  
  // Placeholder implementation - replace with actual base64 to tensor conversion
  // In production, decode base64 and extract RGB pixel values
  for (let i = 0; i < INPUT_SIZE; i++) {
    // Placeholder: would be actual normalized pixel values (0-1 range)
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
    throw error;
  }
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
