import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import {
  initialize,
  analyzeImage,
  analyzeText,
  getStatus,
  isAvailable,
  isRunningTextOnlyMode,
  OnDeviceAnalysisResult,
} from '../services/ondevice';

export enum ScanState {
  IDLE,
  LOADING_MODEL,
  SCANNING,
  SAFE,
  SUSPICIOUS,
  DANGER,
  ERROR
}

export interface ScanResult {
  state: ScanState;
  confidence: number;
  analysisResult: OnDeviceAnalysisResult | null;
  isOnDevice: boolean;
}

export function useScanner() {
  const [state, setState] = useState<ScanState>(ScanState.IDLE);
  const [confidence, setConfidence] = useState<number>(0);
  const [analysisResult, setAnalysisResult] = useState<OnDeviceAnalysisResult | null>(null);
  const [isOnDevice, setIsOnDevice] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const [isTextOnlyMode, setIsTextOnlyMode] = useState<boolean>(false);

  // Initialize on-device analysis on mount
  useEffect(() => {
    const init = async () => {
      // Only initialize on native platforms
      if (Platform.OS === 'web') {
        console.log('[useScanner] Web platform - on-device analysis unavailable');
        setState(ScanState.IDLE);
        return;
      }
      
      setIsInitializing(true);
      setState(ScanState.LOADING_MODEL);
      
      try {
        await initialize();
        const status = getStatus();
        setIsTextOnlyMode(isRunningTextOnlyMode());
        console.log('[useScanner] On-device analysis initialized:', status);
        console.log(`[useScanner] Mode: ${isRunningTextOnlyMode() ? 'TEXT-ONLY' : 'FULL'}`);
        setState(ScanState.IDLE);
      } catch (e) {
        console.error('[useScanner] On-device initialization failed:', e);
        // Set error state - text model is required
        setState(ScanState.ERROR);
      } finally {
        setIsInitializing(false);
      }
    };
    
    init();
  }, []);

  /**
   * Scan an image for scam content using on-device analysis
   * REQUIRES: Text model must be loaded successfully during initialization
   * 
   * In text-only mode (no visual model), OCR extracts text and
   * the MobileBERT model analyzes it for scam patterns.
   */
  const scanImage = useCallback(async (uri: string) => {
    setState(ScanState.SCANNING);
    setAnalysisResult(null);
    
    try {
      console.log(`[useScanner] Scanning image: ${uri}`);
      console.log(`[useScanner] Analysis mode: ${isRunningTextOnlyMode() ? 'TEXT-ONLY' : 'FULL'}`);
      
      // Use on-device analysis (text model required)
      const result = await analyzeImage(uri);
      
      setAnalysisResult(result);
      setConfidence(result.fusedScore);
      setIsOnDevice(result.isOnDevice);
      
      // Map risk level to scan state
      if (result.riskLevel === 'critical' || result.riskLevel === 'high') {
        setState(ScanState.DANGER);
      } else if (result.riskLevel === 'medium') {
        setState(ScanState.SUSPICIOUS);
      } else {
        setState(ScanState.SAFE);
      }
      
      console.log(`[useScanner] Analysis complete: ${result.isScam ? 'SCAM' : 'SAFE'} (${(result.fusedScore * 100).toFixed(1)}%)`);
      
      return result;
    } catch (e) {
      console.error('[useScanner] Scan failed:', e);
      setState(ScanState.ERROR);
      return null;
    }
  }, []);

  /**
   * Scan text content directly (no image)
   * Uses MobileBERT model for text classification
   */
  const scanText = useCallback(async (text: string) => {
    setState(ScanState.SCANNING);
    setAnalysisResult(null);
    
    try {
      console.log(`[useScanner] Scanning text (${text.length} chars)`);
      
      const result = await analyzeText(text);
      
      setAnalysisResult(result);
      setConfidence(result.fusedScore);
      setIsOnDevice(result.isOnDevice);
      
      // Map risk level to scan state
      if (result.riskLevel === 'critical' || result.riskLevel === 'high') {
        setState(ScanState.DANGER);
      } else if (result.riskLevel === 'medium') {
        setState(ScanState.SUSPICIOUS);
      } else {
        setState(ScanState.SAFE);
      }
      
      return result;
    } catch (e) {
      console.error('[useScanner] Text scan failed:', e);
      setState(ScanState.ERROR);
      return null;
    }
  }, []);

  /**
   * Reset scanner state
   */
  const reset = useCallback(() => {
    setState(ScanState.IDLE);
    setConfidence(0);
    setAnalysisResult(null);
  }, []);

  /**
   * Check if on-device scanning is available
   */
  const checkAvailability = useCallback(() => {
    return isAvailable();
  }, []);

  return {
    // State
    state,
    confidence,
    analysisResult,
    isOnDevice,
    isInitializing,
    isTextOnlyMode,
    
    // Actions
    scanImage,
    scanText,
    reset,
    
    // Utilities
    checkAvailability,
    getStatus,
  };
}

// Re-export types for convenience
export type { OnDeviceAnalysisResult };
