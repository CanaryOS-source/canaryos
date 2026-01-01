/**
 * OCR Service
 * Extracts text from images using Google ML Kit Text Recognition
 */

import { Platform } from 'react-native';
import { OCRResult, OCRBlock, OCRLine, OCRElement } from './types';

// Conditionally import ML Kit (not available on web)
let TextRecognition: any = null;
if (Platform.OS !== 'web') {
  try {
    TextRecognition = require('@react-native-ml-kit/text-recognition').default;
  } catch (e) {
    console.warn('[OCRService] ML Kit Text Recognition not available:', e);
  }
}

/**
 * Check if OCR is available on this platform
 */
export function isOCRAvailable(): boolean {
  return Platform.OS !== 'web' && TextRecognition !== null;
}

/**
 * Extract text from an image using ML Kit Text Recognition
 * 
 * @param imageUri - Local URI of the image to process (file:// or content://)
 * @returns OCR result with extracted text and structured blocks
 */
export async function extractText(imageUri: string): Promise<OCRResult> {
  const startTime = Date.now();
  
  if (!isOCRAvailable()) {
    console.warn('[OCRService] OCR not available on this platform');
    return {
      text: '',
      blocks: [],
      confidence: 0,
      latencyMs: Date.now() - startTime,
    };
  }
  
  try {
    console.log(`[OCRService] Extracting text from: ${imageUri}`);
    
    // ML Kit expects a file path, ensure proper format
    let processedUri = imageUri;
    
    // Handle different URI formats
    if (!imageUri.startsWith('file://') && !imageUri.startsWith('content://') && !imageUri.startsWith('http')) {
      processedUri = `file://${imageUri}`;
    }
    
    // Run text recognition
    const result = await TextRecognition.recognize(processedUri);
    
    const latencyMs = Date.now() - startTime;
    
    // Transform ML Kit result to our format
    const blocks: OCRBlock[] = result.blocks.map((block: any) => ({
      text: block.text,
      frame: block.frame || { width: 0, height: 0, top: 0, left: 0 },
      lines: (block.lines || []).map((line: any) => ({
        text: line.text,
        elements: (line.elements || []).map((element: any) => ({
          text: element.text,
        })),
      })),
    }));
    
    // Calculate average confidence (if available)
    const confidence = 0.9; // ML Kit doesn't always provide confidence
    
    console.log(`[OCRService] Extracted ${result.text.length} chars in ${latencyMs}ms`);
    
    return {
      text: result.text,
      blocks,
      confidence,
      latencyMs,
    };
  } catch (error) {
    console.error('[OCRService] Text extraction failed:', error);
    return {
      text: '',
      blocks: [],
      confidence: 0,
      latencyMs: Date.now() - startTime,
    };
  }
}

/**
 * Extract text from an image with preprocessing optimizations
 * Useful for screenshots that may have specific characteristics
 * 
 * @param imageUri - Local URI of the image
 * @param options - Preprocessing options
 */
export async function extractTextOptimized(
  imageUri: string,
  options: {
    language?: 'Latin' | 'Chinese' | 'Japanese' | 'Korean' | 'Devanagari';
  } = {}
): Promise<OCRResult> {
  const startTime = Date.now();
  
  if (!isOCRAvailable()) {
    return {
      text: '',
      blocks: [],
      confidence: 0,
      latencyMs: Date.now() - startTime,
    };
  }
  
  try {
    let processedUri = imageUri;
    if (!imageUri.startsWith('file://') && !imageUri.startsWith('content://') && !imageUri.startsWith('http')) {
      processedUri = `file://${imageUri}`;
    }
    
    // Use script-specific recognizer if specified
    const script = options.language || 'Latin';
    const result = await TextRecognition.recognize(processedUri, script);
    
    const latencyMs = Date.now() - startTime;
    
    const blocks: OCRBlock[] = result.blocks.map((block: any) => ({
      text: block.text,
      frame: block.frame || { width: 0, height: 0, top: 0, left: 0 },
      lines: (block.lines || []).map((line: any) => ({
        text: line.text,
        elements: (line.elements || []).map((element: any) => ({
          text: element.text,
        })),
      })),
    }));
    
    return {
      text: result.text,
      blocks,
      confidence: 0.9,
      latencyMs,
    };
  } catch (error) {
    console.error('[OCRService] Optimized text extraction failed:', error);
    return {
      text: '',
      blocks: [],
      confidence: 0,
      latencyMs: Date.now() - startTime,
    };
  }
}

/**
 * Clean and normalize extracted text
 * Handles common OCR artifacts and normalizes whitespace
 */
export function normalizeText(text: string): string {
  return text
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Remove null characters
    .replace(/\0/g, '')
    // Normalize quotes
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    // Normalize dashes
    .replace(/[–—]/g, '-')
    // Trim
    .trim();
}

/**
 * Get structured text regions for visualization
 * Useful for showing detected text areas on the image
 */
export function getTextRegions(ocrResult: OCRResult): Array<{
  text: string;
  bounds: { x: number; y: number; width: number; height: number };
}> {
  return ocrResult.blocks.map((block) => ({
    text: block.text,
    bounds: {
      x: block.frame.left,
      y: block.frame.top,
      width: block.frame.width,
      height: block.frame.height,
    },
  }));
}
