package com.canaryos.shield

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent

/**
 * Stub Accessibility Service declared in AndroidManifest.
 * Full implementation (screen text extraction, classification, overlay)
 * will be added in SWD-02 and SWD-03 plans.
 */
class CanaryAccessibilityService : AccessibilityService() {

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Will be implemented in SWD-02 (screen text extraction + classification pipeline)
    }

    override fun onInterrupt() {
        // Will be implemented in SWD-03 (overlay management)
    }
}
