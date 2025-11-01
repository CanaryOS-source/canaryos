# Native Module Setup Guide for Floating Scanner

## Prerequisites

Before starting, ensure you have:
- Android Studio installed
- Java Development Kit (JDK) 17 or higher
- Node.js and npm
- Expo CLI

## Step 1: Install Development Build Dependencies

```bash
cd canaryapp
npx expo install expo-dev-client
```

## Step 2: Create Local Expo Module

```bash
npx create-expo-module@latest --local
```

When prompted:
- **Module name:** `floating-scanner`
- **Location:** Press enter (default: `modules/floating-scanner`)

This creates:
```
modules/
  floating-scanner/
    android/          # Android native code
    ios/              # iOS native code (not needed for Phase 2)
    src/              # TypeScript interface
    index.ts          # Main export
```

## Step 3: Module Structure

### TypeScript Interface (`modules/floating-scanner/src/index.ts`)

```typescript
import { NativeModulesProxy, EventEmitter } from 'expo-modules-core';

const FloatingScannerModule = NativeModulesProxy.FloatingScanner;

export async function hasOverlayPermission(): Promise<boolean> {
  return await FloatingScannerModule.hasOverlayPermission();
}

export async function requestOverlayPermission(): Promise<boolean> {
  return await FloatingScannerModule.requestOverlayPermission();
}

export async function hasScreenCapturePermission(): Promise<boolean> {
  return await FloatingScannerModule.hasScreenCapturePermission();
}

export async function requestScreenCapturePermission(): Promise<void> {
  return await FloatingScannerModule.requestScreenCapturePermission();
}

export async function startFloatingScanner(): Promise<void> {
  return await FloatingScannerModule.startFloatingScanner();
}

export async function stopFloatingScanner(): Promise<void> {
  return await FloatingScannerModule.stopFloatingScanner();
}

export async function isFloatingScannerRunning(): Promise<boolean> {
  return await FloatingScannerModule.isFloatingScannerRunning();
}

// Event emitter for screenshot captured
const emitter = new EventEmitter(FloatingScannerModule);

export function addScreenshotListener(
  listener: (event: { base64: string; timestamp: number }) => void
): { remove: () => void } {
  return emitter.addListener('onScreenshotCaptured', listener);
}
```

### Android Module Definition (`modules/floating-scanner/android/src/main/java/expo/modules/floatingscanner/FloatingScannerModule.kt`)

```kotlin
package expo.modules.floatingscanner

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings

class FloatingScannerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React context not available")

  override fun definition() = ModuleDefinition {
    Name("FloatingScanner")

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

    // Check screen capture permission (always requires user action)
    AsyncFunction("hasScreenCapturePermission") {
      // MediaProjection permission must be requested each session
      false
    }

    // Start floating scanner service
    AsyncFunction("startFloatingScanner") {
      val intent = Intent(context, FloatingBubbleService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    // Stop floating scanner service
    AsyncFunction("stopFloatingScanner") {
      val intent = Intent(context, FloatingBubbleService::class.java)
      context.stopService(intent)
    }

    // Check if service is running
    AsyncFunction("isFloatingScannerRunning") {
      FloatingBubbleService.isRunning
    }

    // Events
    Events("onScreenshotCaptured")
  }
}
```

### Floating Bubble Service (`modules/floating-scanner/android/src/main/java/expo/modules/floatingscanner/FloatingBubbleService.kt`)

```kotlin
package expo.modules.floatingscanner

import android.app.*
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import androidx.core.app.NotificationCompat

class FloatingBubbleService : Service() {
    private lateinit var windowManager: WindowManager
    private var floatingView: View? = null
    
    companion object {
        var isRunning = false
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "floating_scanner_channel"
    }

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())
        createFloatingBubble()
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

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Canary Scanner Active")
            .setContentText("Tap the floating button to scan for scams")
            .setSmallIcon(android.R.drawable.ic_dialog_info) // TODO: Use Canary icon
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    private fun createFloatingBubble() {
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        
        // Inflate floating view layout
        floatingView = LayoutInflater.from(this).inflate(
            R.layout.floating_bubble, null
        )

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        )

        params.gravity = Gravity.TOP or Gravity.START
        params.x = 0
        params.y = 100

        floatingView?.setOnClickListener {
            // TODO: Trigger screenshot capture
            onBubbleClicked()
        }

        windowManager.addView(floatingView, params)
    }

    private fun onBubbleClicked() {
        // TODO: Request MediaProjection and capture screenshot
        // For now, just show feedback
    }

    override fun onDestroy() {
        super.onDestroy()
        isRunning = false
        floatingView?.let {
            windowManager.removeView(it)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
```

### Floating Bubble Layout (`modules/floating-scanner/android/src/main/res/layout/floating_bubble.xml`)

```xml
<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="60dp"
    android:layout_height="60dp"
    android:background="@drawable/bubble_background">
    
    <ImageView
        android:id="@+id/bubble_icon"
        android:layout_width="40dp"
        android:layout_height="40dp"
        android:layout_gravity="center"
        android:src="@drawable/ic_scan"
        android:contentDescription="Scan for scams" />
</FrameLayout>
```

### Bubble Background (`modules/floating-scanner/android/src/main/res/drawable/bubble_background.xml`)

```xml
<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="oval">
    <solid android:color="#FFD300" />
    <stroke
        android:width="2dp"
        android:color="#1C1C1C" />
</shape>
```

## Step 4: Update AndroidManifest.xml

Add to `modules/floating-scanner/android/src/main/AndroidManifest.xml`:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    
    <application>
        <service
            android:name=".FloatingBubbleService"
            android:enabled="true"
            android:exported="false"
            android:foregroundServiceType="mediaProjection" />
    </application>
</manifest>
```

## Step 5: Build Development Build

```bash
# Install dependencies
npm install

# Build for Android
eas build --profile development --platform android
```

Or build locally:

```bash
npx expo run:android
```

## Step 6: Test on Device

1. Install the development build on your Android device
2. Open the app
3. Go to the Info tab
4. Enable the floating scanner
5. Grant overlay permission when prompted
6. A floating button should appear

## Next Steps: MediaProjection Implementation

After the basic floating bubble works, implement screenshot capture:

1. Add MediaProjectionManager in the service
2. Request screen capture permission (requires Activity)
3. Create VirtualDisplay for screen capture
4. Convert captured bitmap to base64
5. Send to React Native via event emitter
6. Integrate with existing scam analyzer

## Troubleshooting

### Module not found
```bash
cd modules/floating-scanner/android
./gradlew clean
cd ../../..
npx expo prebuild --clean
```

### Permission denied
- Check Settings > Apps > Canary > Display over other apps
- Ensure SYSTEM_ALERT_WINDOW is in manifest

### Service crashes
- Check Logcat for errors: `adb logcat | grep FloatingBubble`
- Ensure notification channel is created before startForeground()
- On Android 14+, ensure foregroundServiceType is set

## Resources

- [Expo Modules API Docs](https://docs.expo.dev/modules/overview/)
- [Android WindowManager](https://developer.android.com/reference/android/view/WindowManager)
- [Android MediaProjection](https://developer.android.com/reference/android/media/projection/MediaProjection)
- [Foreground Services](https://developer.android.com/develop/background-work/services/foreground-services)
