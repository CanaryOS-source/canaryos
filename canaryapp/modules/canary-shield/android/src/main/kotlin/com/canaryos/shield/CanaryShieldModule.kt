package com.canaryos.shield

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray

class CanaryShieldModule : Module() {

    companion object {
        private const val PREFS_NAME = "canary_shield_prefs"
        private const val KEY_ENABLED = "shield_enabled"
        private const val KEY_THRESHOLD = "shield_threshold"
        private const val KEY_EXCLUDED_APPS = "shield_excluded_apps"
        private const val KEY_HEARTBEAT = "shield_heartbeat_timestamp"
        private const val HEARTBEAT_STALE_MS = 60_000L
    }

    private val classifier: ScamClassifier by lazy {
        ScamClassifier(appContext.reactContext!!)
    }

    override fun definition() = ModuleDefinition {
        Name("CanaryShield")

        // --- Existing: Classification ---

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

        // --- Control: Enable/Disable/Configure ---

        Function("setShieldEnabled") { enabled: Boolean ->
            val context = appContext.reactContext ?: return@Function
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_ENABLED, enabled)
                .apply()
        }

        Function("setConfidenceThreshold") { threshold: Double ->
            val context = appContext.reactContext ?: return@Function
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putFloat(KEY_THRESHOLD, threshold.toFloat())
                .apply()
        }

        Function("setExcludedApps") { packages: List<String> ->
            val context = appContext.reactContext ?: return@Function
            val jsonArray = JSONArray()
            for (pkg in packages) {
                jsonArray.put(pkg)
            }
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_EXCLUDED_APPS, jsonArray.toString())
                .apply()
        }

        // --- Status: Permission Checks ---

        Function("isAccessibilityServiceEnabled") {
            val context = appContext.reactContext ?: return@Function false
            isAccessibilityEnabled(context)
        }

        Function("isOverlayPermissionGranted") {
            val context = appContext.reactContext ?: return@Function false
            Settings.canDrawOverlays(context)
        }

        Function("isBatteryOptimizationExempt") {
            val context = appContext.reactContext ?: return@Function false
            val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
                ?: return@Function false
            pm.isIgnoringBatteryOptimizations(context.packageName)
        }

        // --- Settings Openers ---

        Function("openAccessibilitySettings") {
            val context = appContext.reactContext ?: return@Function
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        }

        Function("openOverlaySettings") {
            val context = appContext.reactContext ?: return@Function
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${context.packageName}")
            ).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        }

        Function("openBatteryOptimizationSettings") {
            val context = appContext.reactContext ?: return@Function
            val intent = Intent(
                Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:${context.packageName}")
            ).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        }

        // --- Stats ---

        AsyncFunction("getDetectionStats") {
            val stats = CanaryAccessibilityService.detectionStats
            if (stats != null) {
                stats.getStats()
            } else {
                mapOf(
                    "totalScreensProcessed" to 0L,
                    "totalScamsDetected" to 0L,
                    "averageLatencyMs" to 0.0
                )
            }
        }

        AsyncFunction("getRecentDetections") {
            val stats = CanaryAccessibilityService.detectionStats
            if (stats != null) {
                stats.getRecentDetections().map { entry ->
                    mapOf(
                        "timestamp" to entry.timestamp,
                        "appPackage" to entry.appPackage,
                        "confidence" to entry.confidence.toDouble(),
                        "snippetPreview" to entry.snippetPreview
                    )
                }
            } else {
                emptyList<Map<String, Any>>()
            }
        }

        // --- Health Monitor ---

        Function("isServiceAlive") {
            val context = appContext.reactContext ?: return@Function false

            // Check 1: Is the accessibility service enabled in system settings?
            if (!isAccessibilityEnabled(context)) return@Function false

            // Check 2: Has the service sent a heartbeat within the last 60 seconds?
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val lastHeartbeat = prefs.getLong(KEY_HEARTBEAT, 0L)
            val now = System.currentTimeMillis()
            val elapsed = now - lastHeartbeat

            elapsed <= HEARTBEAT_STALE_MS
        }
    }

    private fun isAccessibilityEnabled(context: Context): Boolean {
        val am = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager
            ?: return false
        val enabledServices = am.getEnabledAccessibilityServiceList(
            AccessibilityServiceInfo.FEEDBACK_GENERIC
        )
        return enabledServices.any {
            it.resolveInfo.serviceInfo.name == CanaryAccessibilityService::class.java.name
        }
    }
}
