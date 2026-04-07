package com.canaryos.shield

import android.accessibilityservice.AccessibilityService
import android.content.SharedPreferences
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference

/**
 * Core accessibility service that wires together text extraction, content
 * change detection, app exclusions, and scam classification into a live
 * detection pipeline.
 *
 * Lifecycle:
 *  1. onServiceConnected() -- initialize components, start heartbeat
 *  2. onAccessibilityEvent() -- extract text, dedup, classify on background thread
 *  3. onInterrupt() -- log interruption
 *  4. onDestroy() -- release resources, stop heartbeat
 *
 * Threading model:
 *  - onAccessibilityEvent runs on the main thread and must NOT block
 *  - Text extraction is fast (<10ms) and runs on main thread
 *  - Classification is offloaded to a single-thread ExecutorService
 *  - Last detection result stored in AtomicReference for thread-safe access
 */
class CanaryAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "[CanaryShield]"
        private const val PREFS_NAME = "canary_shield_prefs"
        private const val KEY_ENABLED = "shield_enabled"
        private const val KEY_THRESHOLD = "shield_threshold"
        private const val KEY_HEARTBEAT = "shield_heartbeat_timestamp"
        private const val DEFAULT_THRESHOLD = 0.7f
        private const val HEARTBEAT_INTERVAL_MS = 30_000L

        /**
         * Shared reference to the last scam detection result.
         * Read by the bridge module and overlay manager from the main thread.
         * Written by the executor thread after classification.
         */
        val lastDetection: AtomicReference<DetectionEntry?> = AtomicReference(null)

        /**
         * Shared reference to the detection stats tracker.
         * Initialized when the service connects, read by the bridge.
         */
        @Volatile
        var detectionStats: DetectionStats? = null
            private set
    }

    private var classifier: ScamClassifier? = null
    private var contentChangeDetector: ContentChangeDetector? = null
    private var appExclusionList: AppExclusionList? = null
    private var executor: ExecutorService? = null
    private var prefs: SharedPreferences? = null
    private var heartbeatHandler: Handler? = null
    private var heartbeatRunnable: Runnable? = null

    private val prefsListener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
        try {
            when (key) {
                "shield_excluded_apps" -> {
                    appExclusionList?.reload()
                    Log.d(TAG, "App exclusion list reloaded")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling preference change for key=$key", e)
        }
    }

    override fun onServiceConnected() {
        try {
            Log.i(TAG, "Service connected, initializing components")

            prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)

            // Initialize components
            classifier = ScamClassifier(this)
            contentChangeDetector = ContentChangeDetector()
            appExclusionList = AppExclusionList(this)
            detectionStats = DetectionStats(this)
            executor = Executors.newSingleThreadExecutor()

            // Register prefs listener for config updates
            prefs?.registerOnSharedPreferenceChangeListener(prefsListener)

            // Start heartbeat
            startHeartbeat()

            Log.i(TAG, "Service initialization complete")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize service", e)
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        try {
            if (event == null) return

            // Check enabled state
            val enabled = prefs?.getBoolean(KEY_ENABLED, true) ?: true
            if (!enabled) return

            // Only process relevant event types
            val eventType = event.eventType
            if (eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED &&
                eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
            ) return

            // Check package exclusion
            val packageName = event.packageName?.toString() ?: return
            if (appExclusionList?.isExcluded(packageName) == true) return

            // Get root node (fast, main thread)
            val rootNode = rootInActiveWindow ?: return

            // Extract text (fast, <10ms, main thread)
            val text = ScreenTextExtractor.extractText(rootNode)
            rootNode.recycle()

            if (text.isBlank()) return

            // Check content change detector (dedup)
            val detector = contentChangeDetector ?: return
            if (!detector.hasSignificantChange(text, eventType)) return

            // Offload classification to background thread
            val currentClassifier = classifier ?: return
            val currentStats = detectionStats ?: return
            val threshold = prefs?.getFloat(KEY_THRESHOLD, DEFAULT_THRESHOLD) ?: DEFAULT_THRESHOLD
            val capturedPackage = packageName

            executor?.execute {
                try {
                    val startTimeMs = System.currentTimeMillis()
                    val result = currentClassifier.classify(text)
                    val latencyMs = System.currentTimeMillis() - startTimeMs

                    // Update stats
                    currentStats.recordScreenProcessed(latencyMs)

                    if (result.isScam && result.confidence > threshold) {
                        val snippet = if (text.length > 100) text.substring(0, 100) else text
                        val entry = DetectionEntry(
                            timestamp = System.currentTimeMillis(),
                            appPackage = capturedPackage,
                            confidence = result.confidence,
                            snippetPreview = snippet
                        )

                        lastDetection.set(entry)
                        currentStats.recordDetection(entry)

                        Log.w(
                            TAG,
                            "Scam detected: package=$capturedPackage, " +
                                "confidence=${result.confidence}, latency=${result.latencyMs}ms"
                        )
                    } else {
                        Log.d(
                            TAG,
                            "Content classified: isScam=${result.isScam}, " +
                                "confidence=${result.confidence}, latency=${result.latencyMs}ms"
                        )
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Classification failed for package=$capturedPackage", e)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in onAccessibilityEvent", e)
        }
    }

    override fun onInterrupt() {
        Log.w(TAG, "Service interrupted")
    }

    override fun onDestroy() {
        try {
            Log.i(TAG, "Service destroying, releasing resources")

            // Stop heartbeat
            stopHeartbeat()

            // Unregister prefs listener
            prefs?.unregisterOnSharedPreferenceChangeListener(prefsListener)

            // Shutdown executor (wait up to 2 seconds for in-flight work)
            executor?.shutdown()

            // Release classifier resources
            classifier?.close()
            classifier = null

            contentChangeDetector = null
            appExclusionList = null
            detectionStats = null
            executor = null
            prefs = null
        } catch (e: Exception) {
            Log.e(TAG, "Error during service destroy", e)
        }
        super.onDestroy()
    }

    private fun startHeartbeat() {
        heartbeatHandler = Handler(Looper.getMainLooper())
        heartbeatRunnable = object : Runnable {
            override fun run() {
                try {
                    prefs?.edit()
                        ?.putLong(KEY_HEARTBEAT, System.currentTimeMillis())
                        ?.apply()
                } catch (e: Exception) {
                    Log.e(TAG, "Heartbeat write failed", e)
                }
                heartbeatHandler?.postDelayed(this, HEARTBEAT_INTERVAL_MS)
            }
        }
        // Write initial heartbeat and schedule recurring
        heartbeatRunnable?.run()
    }

    private fun stopHeartbeat() {
        heartbeatRunnable?.let { heartbeatHandler?.removeCallbacks(it) }
        heartbeatHandler = null
        heartbeatRunnable = null
    }
}
