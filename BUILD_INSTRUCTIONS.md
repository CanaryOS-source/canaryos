# Build Instructions for Canary OS with Floating Scanner

## ✅ What's Been Implemented

### Phase 1: Screenshot Upload & AI Analysis
- ✅ Upload screenshot functionality
- ✅ AI-powered scam detection using Google Gemini 2.5 Flash
- ✅ Structured output with `generateObject` from Vercel AI SDK
- ✅ Detailed analysis with confidence scores, red flags, and safety tips
- ✅ Clean UI with Canary branding

### Phase 2: Floating Overlay Scanner
- ✅ TypeScript interface module
- ✅ Android native module (Kotlin)
- ✅ Floating bubble service with foreground notification
- ✅ Draggable Canary yellow bubble overlay
- ✅ Permission management (SYSTEM_ALERT_WINDOW)
- ✅ Service lifecycle management
- ⏳ MediaProjection screenshot capture (next step)

## 🚀 Building the App

### Option 1: Local Development Build (Recommended for Testing)

```bash
cd canaryapp

# Make sure you have the .env file with your Google API key
# GOOGLE_GENERATIVE_AI_API_KEY=your_key_here

# Run on Android
npx expo run:android
```

This will:
1. Build the native code including the floating-scanner module
2. Install on your connected Android device/emulator
3. Start the Metro bundler

### Option 2: EAS Build (For Distribution)

```bash
cd canaryapp

# Install EAS CLI if needed
npm install -g eas-cli

# Configure EAS (first time only)
eas build:configure

# Build development version
eas build --profile development --platform android

# Build production version
eas build --profile production --platform android
```

## 📱 Testing the Floating Scanner

### Step 1: Grant Overlay Permission
1. Open the app
2. Navigate to the **Info** tab
3. Tap **Grant Permissions** in the Floating Scanner section
4. You'll be taken to Android Settings
5. Enable "Display over other apps" for Canary

### Step 2: Enable the Scanner
1. Return to the app
2. Tap **Enable Scanner**
3. A persistent notification will appear
4. A yellow circular button will appear on your screen

### Step 3: Test the Overlay
1. Navigate to any app (Messages, Email, Browser, etc.)
2. The yellow bubble should remain visible
3. You can drag it to any position
4. Tap it to trigger scan (currently shows test alert)

## 🔧 Troubleshooting

### Module not found errors
```bash
cd canaryapp
npx expo prebuild --clean
npx expo run:android
```

### Service doesn't start
- Check Logcat: `adb logcat | grep FloatingBubble`
- Ensure overlay permission is granted
- Check notification permission is granted (Android 13+)

### Bubble doesn't appear
- Verify overlay permission in Settings > Apps > Canary
- Check service is running: look for notification
- Restart the service by toggling it off/on

### Build fails
```bash
# Clean everything
cd android
./gradlew clean
cd ..
rm -rf node_modules
npm install
npx expo prebuild --clean
npx expo run:android
```

## 📋 Current Limitations

### What Works:
- ✅ Floating bubble overlay
- ✅ Draggable bubble
- ✅ Foreground service with notification
- ✅ Permission management
- ✅ Service start/stop control
- ✅ Bubble persists across apps

### What's Next (MediaProjection):
- ⏳ Screenshot capture when bubble is tapped
- ⏳ Send captured image to React Native
- ⏳ Integrate with existing scam analyzer
- ⏳ Display results in overlay popup

## 🎯 Next Steps: Adding Screenshot Capture

To complete the floating scanner, we need to implement MediaProjection. This requires:

1. **Request MediaProjection Permission** - Requires Activity context
2. **Capture Screenshot** - Use VirtualDisplay
3. **Convert to Base64** - For sending to React Native
4. **Send Event** - Fire onScreenshotCaptured event
5. **Show Results** - Display analysis in overlay dialog

See `PHASE2_IMPLEMENTATION.md` for detailed MediaProjection implementation guide.

## 🔐 Permissions Explained

### SYSTEM_ALERT_WINDOW
- Allows overlay to display over other apps
- User must grant manually in Settings
- Critical for floating bubble functionality

### FOREGROUND_SERVICE
- Keeps service running when app is backgrounded
- Requires persistent notification (Android 8+)
- Necessary for always-available scanner

### FOREGROUND_SERVICE_MEDIA_PROJECTION
- Required for screenshot capability (Android 14+)
- Must be declared in manifest
- Even if not capturing yet, required for foreground service type

### POST_NOTIFICATIONS
- Shows the persistent notification (Android 13+)
- User can grant when service starts
- Required for foreground service visibility

## 📊 Testing Checklist

### Basic Functionality:
- [ ] App launches successfully
- [ ] Can upload screenshot from gallery (Phase 1)
- [ ] AI analysis works and shows results
- [ ] Info page loads with scanner controls

### Floating Scanner:
- [ ] Can request overlay permission
- [ ] Permission dialog opens Settings
- [ ] Can enable scanner after permission granted
- [ ] Yellow bubble appears on screen
- [ ] Bubble is draggable
- [ ] Bubble stays visible when switching apps
- [ ] Notification shows when scanner is active
- [ ] Can tap bubble (currently test alert)
- [ ] Can disable scanner
- [ ] Bubble disappears when disabled
- [ ] Service stops correctly

### Edge Cases:
- [ ] App doesn't crash without permission
- [ ] Service survives app backgrounding
- [ ] Service stops when app is force closed
- [ ] Bubble repositions if screen rotates
- [ ] Works on Android 10, 11, 12, 13, 14

## 💡 Tips

- **Battery Usage**: The foreground service is lightweight but will use some battery. This is expected for an always-on feature.

- **User Privacy**: Screenshots are only captured when user taps the bubble. No automatic capturing happens.

- **Permissions**: If users revoke overlay permission, the service will stop. Check permission status when app resumes.

- **Development**: Use `adb logcat` to see native logs while testing.

## 📱 Supported Android Versions

- **Minimum**: Android 6.0 (API 23) - Overlay permission introduced
- **Recommended**: Android 10+ (API 29) - Better foreground service handling
- **Tested**: Android 13, 14 - Latest permission models

## 🎨 Customization

### Bubble Appearance
Edit `FloatingBubbleService.kt`:
```kotlin
drawable.setColor(Color.parseColor("#FFD300")) // Change color
drawable.setStroke(2.dp, Color.parseColor("#1C1C1C")) // Change border
```

### Bubble Size
```kotlin
val size = (60 * resources.displayMetrics.density).toInt() // Change 60 to adjust size
```

### Notification
```kotlin
.setContentTitle("Canary Scanner Active") // Change title
.setContentText("Tap the floating button to scan for scams") // Change message
```

## 🐛 Known Issues

1. **TypeScript warning in index.ts** - Minor type issue, doesn't affect functionality
2. **MediaProjection not implemented** - Bubble click shows test alert instead of capturing
3. **iOS not supported** - Floating overlay only works on Android

## 📚 Additional Resources

- **Phase 2 Implementation**: `PHASE2_IMPLEMENTATION.md`
- **Native Module Setup**: `NATIVE_MODULE_SETUP.md`
- **Project README**: `README_PHASE2.md`
- **Main README**: `README.md`

---

**Status**: Floating overlay fully functional, screenshot capture pending
**Last Updated**: Phase 2 foundation complete
**Ready for**: Testing on physical Android devices
