import CanaryShieldModule from "./src/CanaryShieldModule";

// --- Types ---

export interface ClassificationResult {
  isScam: boolean;
  confidence: number;
  latencyMs: number;
}

export interface ServiceStatus {
  modelLoaded: boolean;
  vocabLoaded: boolean;
}

export interface DetectionStats {
  totalScreensProcessed: number;
  totalScamsDetected: number;
  averageLatencyMs: number;
}

export interface DetectionEntry {
  timestamp: number;
  appPackage: string;
  confidence: number;
  snippetPreview: string;
}

// --- Classification ---

/**
 * Classify text for scam content using on-device TFLite model.
 * Runs native Kotlin inference pipeline (tokenization + model).
 */
export async function classifyText(
  text: string
): Promise<ClassificationResult> {
  return CanaryShieldModule.classifyText(text);
}

/**
 * Get the current status of the native classifier service.
 * Reports whether model and vocabulary are loaded and ready.
 */
export async function getServiceStatus(): Promise<ServiceStatus> {
  return CanaryShieldModule.getServiceStatus();
}

// --- Control ---

/**
 * Enable or disable the shield detection pipeline.
 * Takes effect immediately via SharedPreferences.
 */
export function setShieldEnabled(enabled: boolean): void {
  CanaryShieldModule.setShieldEnabled(enabled);
}

/**
 * Set the confidence threshold for scam detection alerts.
 * Value between 0.0 and 1.0 (default: 0.7).
 */
export function setConfidenceThreshold(threshold: number): void {
  CanaryShieldModule.setConfidenceThreshold(threshold);
}

/**
 * Set the list of app packages to exclude from scam scanning.
 * Merged with built-in system app exclusions on the native side.
 */
export function setExcludedApps(packages: string[]): void {
  CanaryShieldModule.setExcludedApps(packages);
}

// --- Permission Status ---

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

/**
 * Check if the app is exempt from battery optimization (Doze mode).
 * Returns false on non-Android platforms.
 */
export function isBatteryOptimizationExempt(): boolean {
  return CanaryShieldModule.isBatteryOptimizationExempt();
}

// --- Settings Openers ---

/**
 * Open Android Accessibility Settings so the user can enable the service.
 */
export function openAccessibilitySettings(): void {
  CanaryShieldModule.openAccessibilitySettings();
}

/**
 * Open overlay permission settings for this app.
 */
export function openOverlaySettings(): void {
  CanaryShieldModule.openOverlaySettings();
}

/**
 * Open battery optimization settings to request exemption.
 */
export function openBatteryOptimizationSettings(): void {
  CanaryShieldModule.openBatteryOptimizationSettings();
}

// --- Stats ---

/**
 * Get daily detection statistics (screens processed, scams detected, avg latency).
 * Returns zero values if the accessibility service has not been started.
 */
export async function getDetectionStats(): Promise<DetectionStats> {
  return CanaryShieldModule.getDetectionStats();
}

/**
 * Get the list of recent scam detections (up to 20), newest first.
 * Returns empty array if the accessibility service has not been started.
 */
export async function getRecentDetections(): Promise<DetectionEntry[]> {
  return CanaryShieldModule.getRecentDetections();
}

// --- Health Monitor ---

/**
 * Check if the accessibility service is alive and responsive.
 * Returns true if the service is enabled AND has sent a heartbeat within 60 seconds.
 * Use on AppState 'active' events to detect killed services.
 */
export function isServiceAlive(): boolean {
  return CanaryShieldModule.isServiceAlive();
}
