import { useState, useEffect } from 'react';
import { ScanService } from '../services/ScanService';

export enum ScanState {
  IDLE,
  LOADING_MODEL,
  SCANNING,
  SAFE,
  SUSPICIOUS,
  DANGER,
  ERROR
}

export function useScanner() {
  const [state, setState] = useState<ScanState>(ScanState.IDLE);
  const [confidence, setConfidence] = useState<number>(0);

  useEffect(() => {
    // Attempt to load model on mount
    const init = async () => {
      setState(ScanState.LOADING_MODEL);
      try {
        // We need to pass the require() of the .tflite file here.
        // For now, we will wrap this in a try/catch in the UI or pass a dummy if missing.
        // This is a placeholder; in real app, import the asset.
        // await ScanService.loadModel(require('../../assets/model.tflite'));
        
        // Simulating load for now since we don't have the actual file yet
        setState(ScanState.IDLE);
      } catch (e) {
        console.error(e);
        setState(ScanState.ERROR);
      }
    };
    init();
  }, []);

  const scanImage = async (uri: string) => {
    setState(ScanState.SCANNING);
    try {
      // START SIMULATION (Remove when real model is present)
      // Simulate network/processing delay
      await new Promise(r => setTimeout(r, 1500));
      const simulatedScore = Math.random(); // Random score for demo
      // END SIMULATION
      
      // REAL CALL (Uncomment when model is present)
      // const score = await ScanService.classifyImage(uri);
      // const simulatedScore = score;

      setConfidence(simulatedScore);

      if (simulatedScore > 0.8) {
        setState(ScanState.DANGER);
      } else if (simulatedScore > 0.5) {
        setState(ScanState.SUSPICIOUS);
      } else {
        setState(ScanState.SAFE);
      }
    } catch (e) {
      console.error(e);
      setState(ScanState.ERROR);
    }
  };

  const reset = () => {
    setState(ScanState.IDLE);
    setConfidence(0);
  };

  return {
    state,
    confidence,
    scanImage,
    reset
  };
}
