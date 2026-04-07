package com.canaryos.shield

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Notification fallback for scam warnings when overlay permission is denied.
 *
 * Features:
 *  - Creates a high-importance notification channel ("Scam Alerts")
 *  - Heads-up notification display
 *  - Content hash-based dedup: no repeat for same content within 30 seconds
 *  - Tap action opens CanaryOS app with detection data
 */
class NotificationHelper(private val context: Context) {

    companion object {
        private const val TAG = "[CanaryShield]"
        private const val CHANNEL_ID = "canary_scam_alerts"
        private const val CHANNEL_NAME = "Scam Alerts"
        private const val NOTIFICATION_ID = 9001
        private const val DEDUP_WINDOW_MS = 30_000L
    }

    private val notificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    private var channelCreated = false
    private var lastContentHash: Int = 0
    private var lastNotificationTimeMs: Long = 0L

    /**
     * Show a heads-up notification for the given classification result.
     *
     * Deduplicates: does not repeat for the same content hash within 30 seconds.
     */
    fun showWarning(result: ClassificationResult) {
        val contentHash = result.hashCode()
        val now = System.currentTimeMillis()

        // Dedup: skip if same content hash within window
        if (contentHash == lastContentHash && now - lastNotificationTimeMs < DEDUP_WINDOW_MS) {
            Log.d(TAG, "Notification dedup: skipping repeat for same content within 30s")
            return
        }

        ensureChannel()

        val confidencePercent = (result.confidence * 100).toInt()
        val bodyText = "This screen may contain a scam. $confidencePercent% detection confidence."

        val tapIntent = createTapIntent(result)
        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_shield_warning)
            .setContentTitle("Scam Warning")
            .setContentText(bodyText)
            .setStyle(NotificationCompat.BigTextStyle().bigText(bodyText))
            .setColor(0xFFE63946.toInt())
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setDefaults(NotificationCompat.DEFAULT_SOUND or NotificationCompat.DEFAULT_VIBRATE)
            .build()

        try {
            notificationManager.notify(NOTIFICATION_ID, notification)
            lastContentHash = contentHash
            lastNotificationTimeMs = now
            Log.i(TAG, "Notification shown for confidence=$confidencePercent%")
        } catch (e: SecurityException) {
            Log.w(TAG, "Notification permission not granted", e)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to show notification", e)
        }
    }

    private fun ensureChannel() {
        if (channelCreated) return

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Alerts when potential scam content is detected on screen"
                enableVibration(true)
                enableLights(true)
                lightColor = 0xFFE63946.toInt()
            }
            notificationManager.createNotificationChannel(channel)
        }

        channelCreated = true
        Log.d(TAG, "Notification channel created: $CHANNEL_ID")
    }

    private fun createTapIntent(result: ClassificationResult): Intent {
        val launchIntent = context.packageManager
            .getLaunchIntentForPackage(context.packageName)
            ?: Intent().apply {
                setPackage(context.packageName)
            }

        return launchIntent.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            putExtra("from_scam_warning", true)
            putExtra("scam_confidence", result.confidence)
            putExtra("scam_is_scam", result.isScam)
        }
    }
}
