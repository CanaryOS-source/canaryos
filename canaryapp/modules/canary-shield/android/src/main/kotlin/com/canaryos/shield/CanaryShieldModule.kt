package com.canaryos.shield

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CanaryShieldModule : Module() {

    private val classifier: ScamClassifier by lazy {
        ScamClassifier(appContext.reactContext!!)
    }

    override fun definition() = ModuleDefinition {
        Name("CanaryShield")

        AsyncFunction("classifyText") { text: String ->
            val context = appContext.reactContext
                ?: throw IllegalStateException("React context not available")
            val result = classifier.classify(text)
            mapOf(
                "isScam" to result.isScam,
                "confidence" to result.confidence.toDouble(),
                "latencyMs" to result.latencyMs
            )
        }

        AsyncFunction("getServiceStatus") {
            val context = appContext.reactContext
                ?: throw IllegalStateException("React context not available")
            val status = classifier.getStatus()
            mapOf(
                "modelLoaded" to status.modelLoaded,
                "vocabLoaded" to status.vocabLoaded
            )
        }

        Function("isAccessibilityServiceEnabled") {
            val context = appContext.reactContext ?: return@Function false
            val am = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager
                ?: return@Function false
            val enabledServices = am.getEnabledAccessibilityServiceList(
                AccessibilityServiceInfo.FEEDBACK_GENERIC
            )
            enabledServices.any {
                it.resolveInfo.serviceInfo.name == CanaryAccessibilityService::class.java.name
            }
        }

        Function("isOverlayPermissionGranted") {
            val context = appContext.reactContext ?: return@Function false
            Settings.canDrawOverlays(context)
        }
    }
}
