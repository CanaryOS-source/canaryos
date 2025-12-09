import { loadTensorflowModel, TensorflowModel } from 'react-native-fast-tflite';
import * as ImageManipulator from 'expo-image-manipulator';
import { Asset } from 'expo-asset';

// Singleton to hold the model instance
let model: TensorflowModel | null = null;

export const ScanService = {
  loadModel: async (assetModule: any) => {
    if (model) return;
    
    try {
      console.log('Loading model...');
      // Resolve the asset URI
      const asset = Asset.fromModule(assetModule);
      await asset.downloadAsync();
      
      // Load the model using the local file URI
      if (asset.localUri) {
         // loadTensorflowModel expects a ModelSource object, not a string
         model = await loadTensorflowModel({ url: asset.localUri });
         console.log('Model loaded successfully');
      } else {
        throw new Error('Failed to download model asset');
      }
    } catch (e) {
      console.error('Failed to load model:', e);
      throw e;
    }
  },

  classifyImage: async (imageUri: string): Promise<number> => {
    if (!model) {
      throw new Error('Model not loaded');
    }

    try {
      // 1. Resize image to typical model input (e.g., 224x224)
      // This reduces memory usage before processing
      const manipResult = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 224, height: 224 } }],
        { format: ImageManipulator.SaveFormat.JPEG }
      );

      // 2. In a real scenario, we would extract RGB bytes here.
      // react-native-fast-tflite accepts raw buffers or typed arrays.
      // For this Phase 1 integration test, we will run the model with dummy data 
      // if we can't easily get pixel data without another native module (like react-native-image-editor).
      // However, let's assume valid input for now or pass a zerod buffer just to test the pipeline.
      
      // Input tensor size for MobileNetV3 is typically [1, 224, 224, 3] -> 150528 distinct values (float32 or uint8)
      // We will create a dummy buffer for the verification step.
      const input = new Float32Array(1 * 224 * 224 * 3); 
      
      // 3. Run Inference
      const output = await model.run([input]);
      
      // 4. Parse Output
      // For classification, output[0] is usually the probabilities.
      // We'll take the max value as a "confidence" proxy for this test.
      const resultData = output[0] as Float32Array | Uint8Array;
      
      // Find max probability
      let maxProb = 0;
      for (let i = 0; i < resultData.length; i++) {
        if (resultData[i] > maxProb) {
          maxProb = resultData[i];
        }
      }

      // Return a 0-1 score. 
      // (If using a real scam model, one index would be "scam")
      return maxProb;

    } catch (e) {
      console.error('Inference failed:', e);
      throw e;
    }
  }
};
