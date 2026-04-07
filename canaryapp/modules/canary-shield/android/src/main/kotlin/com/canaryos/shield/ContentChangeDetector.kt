package com.canaryos.shield

import android.view.accessibility.AccessibilityEvent

/**
 * Hash-based content deduplication and throttling for accessibility events.
 *
 * Prevents re-classifying unchanged or rapidly-changing content by:
 * 1. Skipping text shorter than [MIN_TEXT_LENGTH] (too short to be meaningful)
 * 2. Applying differentiated cooldowns per event type
 * 3. Checking a ring buffer of recent content hashes to catch back-and-forth navigation
 *
 * Thread-safe: all mutable state is guarded by [synchronized] blocks since
 * accessibility events can arrive on any thread.
 */
class ContentChangeDetector(
    private val windowStateCooldownMs: Long = DEFAULT_WINDOW_STATE_COOLDOWN_MS,
    private val contentChangeCooldownMs: Long = DEFAULT_CONTENT_CHANGE_COOLDOWN_MS,
    private val ringBufferSize: Int = DEFAULT_RING_BUFFER_SIZE
) {

    companion object {
        private const val MIN_TEXT_LENGTH = 20
        private const val DEFAULT_WINDOW_STATE_COOLDOWN_MS = 500L
        private const val DEFAULT_CONTENT_CHANGE_COOLDOWN_MS = 2000L
        private const val DEFAULT_RING_BUFFER_SIZE = 5
    }

    // Ring buffer of recently-seen content hashes
    private val recentHashes = IntArray(ringBufferSize)
    private var ringIndex = 0

    // Timestamp of last processed event
    private var lastProcessedTimeMs = 0L

    /**
     * Determine whether the given [text] represents a significant content change
     * that warrants classification.
     *
     * @param text Extracted screen text
     * @param eventType AccessibilityEvent type constant
     *   (e.g., [AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED])
     * @return true if the content should be classified, false if it should be skipped
     */
    @Synchronized
    fun hasSignificantChange(text: String, eventType: Int): Boolean {
        // Skip text too short to be meaningful
        if (text.length < MIN_TEXT_LENGTH) return false

        val now = System.currentTimeMillis()

        // Apply event-type-specific cooldown
        val cooldown = when (eventType) {
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> windowStateCooldownMs
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> contentChangeCooldownMs
            else -> contentChangeCooldownMs
        }

        if (now - lastProcessedTimeMs < cooldown) return false

        // Check against ring buffer of recent hashes
        val hash = text.hashCode()
        for (i in 0 until ringBufferSize) {
            if (recentHashes[i] == hash) return false
        }

        // New content: record hash and timestamp
        recentHashes[ringIndex] = hash
        ringIndex = (ringIndex + 1) % ringBufferSize
        lastProcessedTimeMs = now

        return true
    }

    /**
     * Reset all state. Useful when the service restarts or user triggers a manual scan.
     */
    @Synchronized
    fun reset() {
        recentHashes.fill(0)
        ringIndex = 0
        lastProcessedTimeMs = 0L
    }
}
