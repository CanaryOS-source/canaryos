package expo.modules.floatingscanner

import android.app.*
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import androidx.core.app.NotificationCompat

class FloatingBubbleService : Service() {
    private lateinit var windowManager: WindowManager
    private var floatingView: View? = null
    private var params: WindowManager.LayoutParams? = null
    
    // For drag functionality
    private var initialX = 0
    private var initialY = 0
    private var initialTouchX = 0f
    private var initialTouchY = 0f
    
    companion object {
        var isRunning = false
        var onScreenshotCallback: ((String, Long) -> Unit)? = null
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "floating_scanner_channel"
    }

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())
        createFloatingBubble()
        
        // Setup screenshot callback
        ScreenCaptureManager.setScreenshotCallback { base64, timestamp ->
            onScreenshotCallback?.invoke(base64, timestamp)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Floating Scanner",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Scam detection scanner is active"
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        val intent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Get app icon resource ID
        val iconResId = applicationInfo.icon

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Canary Scanner Active")
            .setContentText("Tap the floating button to scan for scams")
            .setSmallIcon(iconResId)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createFloatingBubble() {
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        
        // Get screen size
        val displayMetrics = resources.displayMetrics
        val screenWidth = displayMetrics.widthPixels
        val screenHeight = displayMetrics.heightPixels
        
        // Create floating bubble view
        floatingView = createBubbleView()
        
        val size = (60 * displayMetrics.density).toInt()

        params = WindowManager.LayoutParams(
            size, // Fixed width
            size, // Fixed height
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        )

        // Position in bottom right corner
        params?.gravity = Gravity.TOP or Gravity.START
        params?.x = screenWidth - size - (16 * displayMetrics.density).toInt()
        params?.y = screenHeight - size - (100 * displayMetrics.density).toInt()

        floatingView?.setOnTouchListener(BubbleTouchListener())

        windowManager.addView(floatingView, params)
    }

    private fun createBubbleView(): View {
        // Create a FrameLayout to hold the icon and background
        val container = android.widget.FrameLayout(this)
        val size = (60 * resources.displayMetrics.density).toInt()
        
        // Set the size of the container
        container.layoutParams = android.view.ViewGroup.LayoutParams(size, size)
        
        // Create circular background
        val backgroundView = View(this)
        val bgParams = android.widget.FrameLayout.LayoutParams(size, size)
        backgroundView.layoutParams = bgParams
        
        val drawable = android.graphics.drawable.GradientDrawable()
        drawable.shape = android.graphics.drawable.GradientDrawable.OVAL
        drawable.setColor(android.graphics.Color.parseColor("#FFD300")) // Canary yellow
        drawable.setStroke(
            (3 * resources.displayMetrics.density).toInt(),
            android.graphics.Color.parseColor("#1C1C1C") // Charcoal black
        )
        backgroundView.background = drawable
        container.addView(backgroundView)
        
        // Add icon on top
        val iconView = android.widget.ImageView(this)
        val iconSize = (40 * resources.displayMetrics.density).toInt()
        val iconParams = android.widget.FrameLayout.LayoutParams(iconSize, iconSize)
        iconParams.gravity = android.view.Gravity.CENTER
        iconView.layoutParams = iconParams
        
        // Use app icon
        try {
            val appIcon = packageManager.getApplicationIcon(packageName)
            iconView.setImageDrawable(appIcon)
        } catch (e: Exception) {
            // Fallback: create a simple shield icon using text
            iconView.setImageResource(android.R.drawable.ic_dialog_info)
        }
        
        iconView.scaleType = android.widget.ImageView.ScaleType.FIT_CENTER
        container.addView(iconView)
        
        // Add shadow effect
        container.elevation = (8 * resources.displayMetrics.density)
        
        return container
    }

    private inner class BubbleTouchListener : View.OnTouchListener {
        private var isDragging = false
        private val clickThreshold = 10 // pixels

        override fun onTouch(v: View, event: MotionEvent): Boolean {
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params?.x ?: 0
                    initialY = params?.y ?: 0
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    isDragging = false
                    
                    // Visual feedback - slightly scale down
                    v.animate().scaleX(0.9f).scaleY(0.9f).setDuration(100).start()
                    return true
                }
                MotionEvent.ACTION_MOVE -> {
                    val deltaX = (event.rawX - initialTouchX).toInt()
                    val deltaY = (event.rawY - initialTouchY).toInt()
                    
                    if (Math.abs(deltaX) > clickThreshold || Math.abs(deltaY) > clickThreshold) {
                        isDragging = true
                        params?.x = initialX + deltaX
                        params?.y = initialY + deltaY
                        windowManager.updateViewLayout(floatingView, params)
                    }
                    return true
                }
                MotionEvent.ACTION_UP -> {
                    // Restore scale
                    v.animate().scaleX(1.0f).scaleY(1.0f).setDuration(100).start()
                    
                    if (!isDragging) {
                        // This was a click, not a drag
                        onBubbleClicked()
                    }
                    return true
                }
                MotionEvent.ACTION_CANCEL -> {
                    // Restore scale if touch is canceled
                    v.animate().scaleX(1.0f).scaleY(1.0f).setDuration(100).start()
                    return true
                }
            }
            return false
        }
    }

    private fun onBubbleClicked() {
        // Capture screenshot using MediaProjection
        ScreenCaptureManager.captureScreen(this)
    }

    override fun onDestroy() {
        super.onDestroy()
        isRunning = false
        ScreenCaptureManager.cleanup()
        floatingView?.let {
            windowManager.removeView(it)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
