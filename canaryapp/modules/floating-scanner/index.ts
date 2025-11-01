import { EventEmitter } from 'expo-modules-core';
import FloatingScannerModule from './src/FloatingScannerModule';

export type ScreenshotEvent = {
  base64: string;
  timestamp: number;
};

/**
 * Check if the app has overlay permission (display over other apps)
 */
export async function hasOverlayPermission(): Promise<boolean> {
  return await FloatingScannerModule.hasOverlayPermission();
}

/**
 * Request overlay permission - opens system settings
 */
export async function requestOverlayPermission(): Promise<boolean> {
  return await FloatingScannerModule.requestOverlayPermission();
}

/**
 * Check if screen capture permission is available
 * Note: MediaProjection permission must be requested each session
 */
export async function hasScreenCapturePermission(): Promise<boolean> {
  return await FloatingScannerModule.hasScreenCapturePermission();
}

/**
 * Start the floating scanner service
 */
export async function startFloatingScanner(): Promise<void> {
  return await FloatingScannerModule.startFloatingScanner();
}

/**
 * Stop the floating scanner service
 */
export async function stopFloatingScanner(): Promise<void> {
  return await FloatingScannerModule.stopFloatingScanner();
}

/**
 * Check if the floating scanner service is currently running
 */
export async function isFloatingScannerRunning(): Promise<boolean> {
  return await FloatingScannerModule.isFloatingScannerRunning();
}

// Event emitter for screenshot captured
const emitter = new EventEmitter(FloatingScannerModule);

/**
 * Add listener for when a screenshot is captured
 * @param listener Callback function that receives the screenshot data
 * @returns Subscription-like object to remove the listener
 */
export function addScreenshotListener(
  listener: (event: ScreenshotEvent) => void
) {
  return emitter.addListener('onScreenshotCaptured', listener);
}
