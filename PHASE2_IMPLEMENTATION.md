# Phase 2: Overlay Implementation Plan

## Overview
Implement a persistent floating overlay button that allows users to capture and analyze screenshots from any app on Android.

## Technical Requirements

### 1. Core Android Permissions Needed
- **SYSTEM_ALERT_WINDOW** - Display floating overlay over other apps
- **FOREGROUND_SERVICE** - Keep service running in background (Android 9+)
- **FOREGROUND_SERVICE_MEDIA_PROJECTION** - Required for MediaProjection (Android 14+)
- **MediaProjection API** - Capture screenshots of other apps

### 2. Architecture Components

#### A. Foreground Service
- Keeps the app alive in the background
- Shows persistent notification (required for foreground services)
- Manages the floating bubble lifecycle

#### B. Floating Overlay Window
- WindowManager-based overlay UI
- FloatingActionButton or custom bubble view
- Always on top (TYPE_APPLICATION_OVERLAY)

#### C. Screenshot Capture
- MediaProjection API for screen capture
- Requires one-time user consent via system dialog
- Cannot be done silently for security reasons

#### D. Analysis Integration
- Pass captured screenshot to existing scam analyzer
- Display results in a popup overlay or notification

## Implementation Approach

### Option 1: Expo Development Build + Local Native Module (RECOMMENDED)

**Pros:**
- Keeps Expo workflow benefits
- Uses Expo Modules API (cleaner, easier to maintain)
- Can still use EAS Build
- Better TypeScript integration

**Cons:**
- Cannot use Expo Go (need development build)
- Slightly more setup initially

**Steps:**
1. Create local Expo module for Android overlay functionality
2. Implement native Android code for:
   - Floating bubble service
   - MediaProjection screenshot capture
   - Overlay permission management
3. Bridge to React Native via Expo Modules API
4. Build development build for testing

### Option 2: Eject from Expo (NOT RECOMMENDED)

**Pros:**
- Full native control

**Cons:**
- Lose Expo managed workflow benefits
- More complex maintenance
- Manual native builds required

## Detailed Implementation Steps

### Step 1: Setup Development Build
```bash
# Install Expo development client
npx expo install expo-dev-client

# Build development version
eas build --profile development --platform android
```

### Step 2: Create Local Native Module
```bash
# Create local Expo module
npx create-expo-module@latest --local

# Module name suggestion: floating-scanner
```

### Step 3: Implement Android Native Components

#### A. Floating Bubble Service (Kotlin)
```kotlin
// modules/floating-scanner/android/src/main/java/expo/modules/floatingscanner/FloatingBubbleService.kt

class FloatingBubbleService : Service() {
    private lateinit var windowManager: WindowManager
    private lateinit var floatingView: View
    
    override fun onCreate() {
        super.onCreate()
        createFloatingBubble()
    }
    
    private fun createFloatingBubble() {
        // Create floating bubble UI
        // Add to WindowManager with TYPE_APPLICATION_OVERLAY
        // Handle click events
    }
    
    // Handle screenshot capture on click
    private fun captureScreen() {
        // Use MediaProjection API
    }
}
```

#### B. MediaProjection Manager
```kotlin
class ScreenCaptureManager(private val context: Context) {
    private var mediaProjection: MediaProjection? = null
    
    fun requestScreenCapture(activityResultLauncher: ActivityResultLauncher) {
        // Request MediaProjection permission
        val mediaProjectionManager = context.getSystemService(
            Context.MEDIA_PROJECTION_SERVICE
        ) as MediaProjectionManager
        
        val intent = mediaProjectionManager.createScreenCaptureIntent()
        activityResultLauncher.launch(intent)
    }
    
    fun captureScreen(): Bitmap {
        // Capture screen using VirtualDisplay
        // Return bitmap
    }
}
```

### Step 4: Expo Module API Bridge
```typescript
// modules/floating-scanner/src/index.ts

import { NativeModulesProxy } from 'expo-modules-core';
import FloatingScannerModule from './FloatingScannerModule';

export async function requestOverlayPermission(): Promise<boolean> {
  return await FloatingScannerModule.requestOverlayPermission();
}

export async function startFloatingScanner(): Promise<void> {
  return await FloatingScannerModule.startFloatingScanner();
}

export async function stopFloatingScanner(): Promise<void> {
  return await FloatingScannerModule.stopFloatingScanner();
}

export function addScreenshotListener(listener: (base64: string) => void) {
  // Listen for screenshot events from native
}
```

### Step 5: React Native Integration
```typescript
// app/services/floatingScanner.ts

import * as FloatingScanner from '@/modules/floating-scanner';
import { analyzeImageForScam } from './scamAnalyzer';

export async function initializeFloatingScanner() {
  // Request permissions
  const hasPermission = await FloatingScanner.requestOverlayPermission();
  
  if (hasPermission) {
    // Start floating scanner
    await FloatingScanner.startFloatingScanner();
    
    // Listen for screenshots
    FloatingScanner.addScreenshotListener(async (base64Image) => {
      const result = await analyzeImageForScam(base64Image);
      // Show result in notification or overlay
    });
  }
}
```

## Key Challenges & Solutions

### Challenge 1: MediaProjection Permission
**Issue:** MediaProjection requires explicit user consent via system dialog every time app starts (Android 10+)

**Solution:** 
- Show user-friendly explanation before requesting
- Consider caching permission for session (but re-request on app restart)
- Use persistent notification to remind user scanner is active

### Challenge 2: Battery & Performance
**Issue:** Foreground service with overlay consumes battery

**Solution:**
- Optimize service to be lightweight
- Only activate screenshot processing when button pressed
- Add toggle to enable/disable in settings
- Show battery usage transparency to user

### Challenge 3: Android 14+ Restrictions
**Issue:** Stricter foreground service type requirements

**Solution:**
- Declare FOREGROUND_SERVICE_MEDIA_PROJECTION in manifest
- Show clear notification explaining why service is running
- Handle permission denial gracefully

### Challenge 4: Screenshot Quality & Size
**Issue:** Full screen captures are large

**Solution:**
- Compress images before analysis (already done - quality: 0.8)
- Consider allowing user to crop before analysis
- Cache last screenshot to avoid re-processing

## AndroidManifest.xml Configuration

```xml
<manifest>
    <!-- Permissions -->
    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    
    <application>
        <!-- Floating Bubble Service -->
        <service
            android:name=".FloatingBubbleService"
            android:enabled="true"
            android:exported="false"
            android:foregroundServiceType="mediaProjection" />
    </application>
</manifest>
```

## Alternative: Simplified Phase 2A (Intermediate Step)

If full overlay is too complex initially, consider:

1. **Background service only** - No floating bubble yet
2. **Quick Settings Tile** - Android native tile to trigger scan
3. **Notification with action button** - Press to scan current screen
4. **Share target** - Share screenshots from other apps to Canary

This provides 80% of functionality with 40% of complexity.

## Recommended Next Steps

1. ✅ **Start with development build setup**
   ```bash
   npx expo install expo-dev-client
   ```

2. ✅ **Create local native module**
   ```bash
   npx create-expo-module@latest --local
   # Name: floating-scanner
   ```

3. ✅ **Implement overlay permission request first**
   - Test permission flow
   - Ensure it works on various Android versions

4. ✅ **Add floating bubble UI**
   - Simple FAB that follows user
   - Basic click handling

5. ✅ **Integrate MediaProjection**
   - Request screen capture permission
   - Test screenshot capture

6. ✅ **Connect to existing analyzer**
   - Pass screenshot to analyzeImageForScam
   - Show results in overlay dialog

## Testing Checklist

- [ ] Overlay permission flow (Android 6+)
- [ ] MediaProjection permission flow (Android 10+)
- [ ] Floating bubble appears and is draggable
- [ ] Screenshot captures correctly
- [ ] Analysis results display properly
- [ ] Service survives app backgrounding
- [ ] Notification shows when service active
- [ ] Battery consumption is reasonable
- [ ] Works on Android 10, 11, 12, 13, 14

## Resources

- [Expo Modules API](https://docs.expo.dev/modules/overview/)
- [react-native-floating-bubble](https://github.com/hybriteq/react-native-floating-bubble)
- [Android MediaProjection API](https://developer.android.com/reference/android/media/projection/MediaProjection)
- [Android Overlay Permissions](https://developer.android.com/reference/android/Manifest.permission#SYSTEM_ALERT_WINDOW)
- [Expo Development Build](https://docs.expo.dev/develop/development-builds/introduction/)

## Estimated Implementation Time

- Setup & module creation: 2-4 hours
- Floating bubble implementation: 4-6 hours
- MediaProjection integration: 4-6 hours
- Testing & debugging: 6-8 hours
- **Total: 16-24 hours**

Simplified Phase 2A: 6-10 hours
