package com.canaryos.shield

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Thread-safe detection statistics tracker with ring buffer for recent detections
 * and daily stats persistence via SharedPreferences.
 *
 * Accessed from the executor thread (writes) and the main thread via bridge (reads).
 * All public methods are synchronized for thread safety.
 */
class DetectionStats(context: Context) {

    companion object {
        private const val TAG = "[CanaryShield]"
        private const val PREFS_NAME = "canary_shield_stats"
        private const val KEY_DATE = "stats_date"
        private const val KEY_SCREENS_PROCESSED = "stats_screens_processed"
        private const val KEY_SCAMS_DETECTED = "stats_scams_detected"
        private const val KEY_TOTAL_LATENCY = "stats_total_latency_ms"
        private const val KEY_RECENT_DETECTIONS = "stats_recent_detections"
        private const val RING_BUFFER_SIZE = 20
    }

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    // Daily counters
    private var currentDate: String = todayDateString()
    private var totalScreensProcessed: Long = 0L
    private var totalScamsDetected: Long = 0L
    private var totalLatencyMs: Long = 0L

    // Ring buffer for recent detections
    private val recentDetections: Array<DetectionEntry?> = arrayOfNulls(RING_BUFFER_SIZE)
    private var ringIndex: Int = 0
    private var ringCount: Int = 0

    init {
        loadFromPrefs()
    }

    /**
     * Record that a screen was processed (regardless of classification result).
     *
     * @param latencyMs Classification latency in milliseconds
     */
    @Synchronized
    fun recordScreenProcessed(latencyMs: Long) {
        checkDayRollover()
        totalScreensProcessed++
        totalLatencyMs += latencyMs
        persistCounters()
    }

    /**
     * Record a scam detection event.
     *
     * @param entry The detection entry to record
     */
    @Synchronized
    fun recordDetection(entry: DetectionEntry) {
        checkDayRollover()
        totalScamsDetected++
        recentDetections[ringIndex] = entry
        ringIndex = (ringIndex + 1) % RING_BUFFER_SIZE
        if (ringCount < RING_BUFFER_SIZE) ringCount++
        persistCounters()
        persistRecentDetections()
    }

    /**
     * Get current daily statistics snapshot.
     *
     * @return Map with totalScreensProcessed, totalScamsDetected, averageLatencyMs
     */
    @Synchronized
    fun getStats(): Map<String, Any> {
        checkDayRollover()
        val avgLatency = if (totalScreensProcessed > 0) {
            totalLatencyMs.toDouble() / totalScreensProcessed.toDouble()
        } else {
            0.0
        }
        return mapOf(
            "totalScreensProcessed" to totalScreensProcessed,
            "totalScamsDetected" to totalScamsDetected,
            "averageLatencyMs" to avgLatency
        )
    }

    /**
     * Get the list of recent detections, newest first.
     *
     * @return Immutable list of recent detection entries
     */
    @Synchronized
    fun getRecentDetections(): List<DetectionEntry> {
        val result = mutableListOf<DetectionEntry>()
        if (ringCount == 0) return result

        // Walk backwards from the most recent entry
        var idx = (ringIndex - 1 + RING_BUFFER_SIZE) % RING_BUFFER_SIZE
        for (i in 0 until ringCount) {
            recentDetections[idx]?.let { result.add(it) }
            idx = (idx - 1 + RING_BUFFER_SIZE) % RING_BUFFER_SIZE
        }
        return result.toList()
    }

    /**
     * Reset all counters and recent detections for the current day.
     */
    @Synchronized
    fun reset() {
        totalScreensProcessed = 0L
        totalScamsDetected = 0L
        totalLatencyMs = 0L
        recentDetections.fill(null)
        ringIndex = 0
        ringCount = 0
        currentDate = todayDateString()
        persistCounters()
        persistRecentDetections()
    }

    private fun checkDayRollover() {
        val today = todayDateString()
        if (today != currentDate) {
            Log.i(TAG, "Day rollover detected ($currentDate -> $today), resetting stats")
            totalScreensProcessed = 0L
            totalScamsDetected = 0L
            totalLatencyMs = 0L
            // Keep recent detections across day boundaries (user may want to see them)
            currentDate = today
            persistCounters()
        }
    }

    private fun loadFromPrefs() {
        try {
            val savedDate = prefs.getString(KEY_DATE, null)
            val today = todayDateString()

            if (savedDate == today) {
                totalScreensProcessed = prefs.getLong(KEY_SCREENS_PROCESSED, 0L)
                totalScamsDetected = prefs.getLong(KEY_SCAMS_DETECTED, 0L)
                totalLatencyMs = prefs.getLong(KEY_TOTAL_LATENCY, 0L)
            } else {
                // Different day: start fresh counters
                currentDate = today
            }

            // Load recent detections ring buffer
            loadRecentDetections()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load detection stats from SharedPreferences", e)
        }
    }

    private fun persistCounters() {
        try {
            prefs.edit()
                .putString(KEY_DATE, currentDate)
                .putLong(KEY_SCREENS_PROCESSED, totalScreensProcessed)
                .putLong(KEY_SCAMS_DETECTED, totalScamsDetected)
                .putLong(KEY_TOTAL_LATENCY, totalLatencyMs)
                .apply()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to persist detection stats", e)
        }
    }

    private fun persistRecentDetections() {
        try {
            val jsonArray = JSONArray()
            // Persist in ring buffer order (oldest to newest)
            val startIdx = if (ringCount < RING_BUFFER_SIZE) 0 else ringIndex
            for (i in 0 until ringCount) {
                val idx = (startIdx + i) % RING_BUFFER_SIZE
                val entry = recentDetections[idx] ?: continue
                val obj = JSONObject().apply {
                    put("timestamp", entry.timestamp)
                    put("appPackage", entry.appPackage)
                    put("confidence", entry.confidence.toDouble())
                    put("snippetPreview", entry.snippetPreview)
                }
                jsonArray.put(obj)
            }
            prefs.edit()
                .putString(KEY_RECENT_DETECTIONS, jsonArray.toString())
                .apply()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to persist recent detections", e)
        }
    }

    private fun loadRecentDetections() {
        try {
            val json = prefs.getString(KEY_RECENT_DETECTIONS, null) ?: return
            val jsonArray = JSONArray(json)
            val count = minOf(jsonArray.length(), RING_BUFFER_SIZE)

            for (i in 0 until count) {
                val obj = jsonArray.getJSONObject(i)
                recentDetections[i] = DetectionEntry(
                    timestamp = obj.getLong("timestamp"),
                    appPackage = obj.getString("appPackage"),
                    confidence = obj.getDouble("confidence").toFloat(),
                    snippetPreview = obj.getString("snippetPreview")
                )
            }
            ringIndex = count % RING_BUFFER_SIZE
            ringCount = count
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load recent detections from SharedPreferences", e)
            // Start with empty buffer on parse error
            recentDetections.fill(null)
            ringIndex = 0
            ringCount = 0
        }
    }

    private fun todayDateString(): String {
        return SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
    }
}
