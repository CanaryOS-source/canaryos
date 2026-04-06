import CanaryShieldModule from "./src/CanaryShieldModule";

export interface ClassificationResult {
  isScam: boolean;
  confidence: number;
  latencyMs: number;
}

export interface ServiceStatus {
  modelLoaded: boolean;
  vocabLoaded: boolean;
}

/**
 * Classify text for scam content using on-device TFLite model.
 * Runs native Kotlin inference pipeline (tokenization + model).
 */
export async function classifyText(text: string): Promise<ClassificationResult> {
  return CanaryShieldModule.classifyText(text);
}

/**
 * Get the current status of the native classifier service.
 * Reports whether model and vocabulary are loaded and ready.
 */
export async function getServiceStatus(): Promise<ServiceStatus> {
  return CanaryShieldModule.getServiceStatus();
}

/**
 * Check if the Android Accessibility Service is currently enabled.
 * Returns false on non-Android platforms.
 */
export function isAccessibilityServiceEnabled(): boolean {
  return CanaryShieldModule.isAccessibilityServiceEnabled();
}

/**
 * Check if the SYSTEM_ALERT_WINDOW overlay permission is granted.
 * Returns false on non-Android platforms.
 */
export function isOverlayPermissionGranted(): boolean {
  return CanaryShieldModule.isOverlayPermissionGranted();
}
