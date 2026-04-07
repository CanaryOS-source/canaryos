package com.canaryos.shield

import android.animation.ObjectAnimator
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.view.animation.AccelerateInterpolator
import android.view.animation.DecelerateInterpolator
import android.widget.ImageButton
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView

/**
 * Manages system overlay warnings displayed on top of all apps when scam
 * content is detected.
 *
 * Features:
 *  - Slide-down entrance / slide-up exit animations
 *  - Auto-dismiss after configurable timeout (default 8s)
 *  - Rate-limiting: max 1 warning per 10 seconds
 *  - Haptic feedback on show
 *  - Falls back to NotificationHelper when overlay permission denied
 *  - Thread-safe: all UI operations posted to main thread
 *
 * Must be initialized and used from a service context (not Activity).
 */
class OverlayManager(
    private val context: Context,
    private val notificationHelper: NotificationHelper
) {
    companion object {
        private const val TAG = "[CanaryShield]"
        private const val PREFS_NAME = "canary_shield_prefs"
        private const val KEY_AUTODISMISS = "shield_autodismiss_seconds"
        private const val DEFAULT_AUTODISMISS_SECONDS = 8
        private const val RATE_LIMIT_MS = 10_000L
        private const val ENTRANCE_DURATION_MS = 200L
        private const val EXIT_DURATION_MS = 150L
        private const val HAPTIC_DURATION_MS = 100L
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager

    private var currentOverlayView: View? = null
    private var autoDismissRunnable: Runnable? = null
    private var lastShowTimeMs: Long = 0L

    /**
     * Show a scam warning overlay for the given classification result.
     *
     * If overlay permission is not granted, falls back to notification.
     * Rate-limited to 1 warning per 10 seconds.
     * Only one overlay visible at a time (previous is dismissed first).
     *
     * Must be called on the main thread.
     */
    fun showWarning(result: ClassificationResult) {
        // Rate-limit check
        val now = System.currentTimeMillis()
        if (now - lastShowTimeMs < RATE_LIMIT_MS) {
            Log.d(TAG, "Overlay rate-limited, skipping (${now - lastShowTimeMs}ms since last)")
            return
        }

        // Check overlay permission
        if (!Settings.canDrawOverlays(context)) {
            Log.d(TAG, "Overlay permission not granted, falling back to notification")
            notificationHelper.showWarning(result)
            return
        }

        // Dismiss existing overlay before showing new one
        dismissInternal(animate = false)

        lastShowTimeMs = now

        try {
            val overlayView = inflateOverlay(result)
            val layoutParams = createLayoutParams()

            windowManager.addView(overlayView, layoutParams)
            currentOverlayView = overlayView

            // Slide-down entrance animation
            animateEntrance(overlayView)

            // Haptic feedback
            triggerHaptic()

            // Schedule auto-dismiss
            scheduleAutoDismiss()

            Log.i(TAG, "Overlay shown for confidence=${result.confidence}")
        } catch (e: WindowManager.BadTokenException) {
            // Service is being destroyed, fail silently
            Log.w(TAG, "BadTokenException: service likely destroyed, overlay not shown")
            currentOverlayView = null
        } catch (e: Exception) {
            Log.e(TAG, "Failed to show overlay", e)
            currentOverlayView = null
            // Fall back to notification on any overlay failure
            notificationHelper.showWarning(result)
        }
    }

    /**
     * Dismiss the current overlay with slide-up animation.
     */
    fun dismiss() {
        mainHandler.post { dismissInternal(animate = true) }
    }

    /**
     * Remove overlay immediately without animation. Called during cleanup.
     */
    fun destroy() {
        mainHandler.post { dismissInternal(animate = false) }
    }

    private fun dismissInternal(animate: Boolean) {
        // Cancel pending auto-dismiss
        autoDismissRunnable?.let { mainHandler.removeCallbacks(it) }
        autoDismissRunnable = null

        val view = currentOverlayView ?: return
        currentOverlayView = null

        if (animate) {
            animateExit(view) {
                removeViewSafely(view)
            }
        } else {
            removeViewSafely(view)
        }
    }

    private fun removeViewSafely(view: View) {
        try {
            windowManager.removeView(view)
        } catch (e: IllegalArgumentException) {
            // View not attached — already removed
            Log.d(TAG, "Overlay view already removed")
        } catch (e: Exception) {
            Log.e(TAG, "Error removing overlay view", e)
        }
    }

    private fun inflateOverlay(result: ClassificationResult): View {
        val inflater = LayoutInflater.from(context)
        val view = inflater.inflate(R.layout.scam_warning_overlay, null)

        // Set confidence text
        val confidencePercent = (result.confidence * 100).toInt()
        val confidenceText = view.findViewById<TextView>(R.id.confidence_text)
        confidenceText.text = "${confidencePercent}% detection confidence"

        // Wire close button
        val closeBtn = view.findViewById<ImageButton>(R.id.btn_close)
        closeBtn.setOnClickListener { dismissInternal(animate = true) }

        // Wire dismiss button
        val dismissBtn = view.findViewById<Button>(R.id.btn_dismiss)
        dismissBtn.setOnClickListener { dismissInternal(animate = true) }

        // Wire open app button
        val openAppBtn = view.findViewById<Button>(R.id.btn_open_app)
        openAppBtn.setOnClickListener {
            launchApp(result)
            dismissInternal(animate = true)
        }

        return view
    }

    private fun createLayoutParams(): WindowManager.LayoutParams {
        return WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP
            x = 0
            y = 0
        }
    }

    private fun animateEntrance(view: View) {
        view.translationY = -view.height.toFloat().coerceAtLeast(300f)
        view.animate()
            .translationY(0f)
            .setDuration(ENTRANCE_DURATION_MS)
            .setInterpolator(DecelerateInterpolator())
            .start()
    }

    private fun animateExit(view: View, onEnd: () -> Unit) {
        view.animate()
            .translationY(-view.height.toFloat().coerceAtLeast(300f))
            .setDuration(EXIT_DURATION_MS)
            .setInterpolator(AccelerateInterpolator())
            .withEndAction(onEnd)
            .start()
    }

    private fun scheduleAutoDismiss() {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val autoDismissSeconds = prefs.getInt(KEY_AUTODISMISS, DEFAULT_AUTODISMISS_SECONDS)
        val autoDismissMs = autoDismissSeconds * 1000L

        // Animate the countdown progress bar
        val progressBar = currentOverlayView?.findViewById<ProgressBar>(R.id.countdown_progress)
        if (progressBar != null) {
            val animator = ObjectAnimator.ofInt(progressBar, "progress", 100, 0)
            animator.duration = autoDismissMs
            animator.interpolator = null // linear
            animator.start()
        }

        val runnable = Runnable { dismissInternal(animate = true) }
        autoDismissRunnable = runnable
        mainHandler.postDelayed(runnable, autoDismissMs)
    }

    private fun triggerHaptic() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vibratorManager?.defaultVibrator?.vibrate(
                    VibrationEffect.createOneShot(HAPTIC_DURATION_MS, VibrationEffect.DEFAULT_AMPLITUDE)
                )
            } else {
                @Suppress("DEPRECATION")
                val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                vibrator?.vibrate(
                    VibrationEffect.createOneShot(HAPTIC_DURATION_MS, VibrationEffect.DEFAULT_AMPLITUDE)
                )
            }
        } catch (e: Exception) {
            Log.d(TAG, "Haptic feedback not available", e)
        }
    }

    private fun launchApp(result: ClassificationResult) {
        try {
            val launchIntent = context.packageManager
                .getLaunchIntentForPackage(context.packageName)
                ?.apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    putExtra("from_scam_warning", true)
                    putExtra("scam_confidence", result.confidence)
                    putExtra("scam_is_scam", result.isScam)
                }
            if (launchIntent != null) {
                context.startActivity(launchIntent)
            } else {
                Log.w(TAG, "Could not resolve launch intent for ${context.packageName}")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch app from overlay", e)
        }
    }
}
