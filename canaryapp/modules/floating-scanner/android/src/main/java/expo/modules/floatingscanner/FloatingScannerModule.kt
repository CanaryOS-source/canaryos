package expo.modules.floatingscanner

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class FloatingScannerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React context not available")

  override fun definition() = ModuleDefinition {
    Name("FloatingScanner")

    // Event that fires when a screenshot is captured
    Events("onScreenshotCaptured")

    // Check if overlay permission is granted
    AsyncFunction("hasOverlayPermission") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        Settings.canDrawOverlays(context)
      } else {
        true
      }
    }

    // Request overlay permission
    AsyncFunction("requestOverlayPermission") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        if (!Settings.canDrawOverlays(context)) {
          val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:${context.packageName}")
          )
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          context.startActivity(intent)
        }
        Settings.canDrawOverlays(context)
      } else {
        true
      }
    }

    // Check screen capture permission (MediaProjection always requires user action)
    AsyncFunction("hasScreenCapturePermission") {
      // MediaProjection permission must be requested each session
      false
    }

    // Start floating scanner service
    AsyncFunction("startFloatingScanner") {
      // Setup callback to send events to React Native
      FloatingBubbleService.onScreenshotCallback = { base64, timestamp ->
        sendEvent("onScreenshotCaptured", mapOf(
          "base64" to base64,
          "timestamp" to timestamp
        ))
      }
      
      val intent = Intent(context, FloatingBubbleService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      // Return null to avoid ComponentName serialization error
      null
    }

    // Stop floating scanner service
    AsyncFunction("stopFloatingScanner") {
      val intent = Intent(context, FloatingBubbleService::class.java)
      context.stopService(intent)
      null
    }

    // Check if service is running
    AsyncFunction("isFloatingScannerRunning") {
      FloatingBubbleService.isRunning
    }
  }
}
