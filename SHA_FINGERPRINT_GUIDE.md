# SHA Fingerprint Guide for Google Authentication

This guide will help you obtain the SHA-1 and SHA-256 fingerprints needed for Google Sign-In on Android.

## Why You Need SHA Fingerprints

Google Sign-In on Android requires SHA fingerprints to verify that the app requesting authentication is legitimate. You'll need:
- **SHA-1** fingerprint for your debug and release builds
- **SHA-256** fingerprint for your debug and release builds

## Getting SHA Fingerprints

### Option 1: Using Expo EAS (Recommended for Expo Projects)

1. **Install EAS CLI** (if not already installed):
   ```bash
   npm install -g eas-cli
   ```

2. **Login to Expo**:
   ```bash
   eas login
   ```

3. **Get your credentials**:
   ```bash
   eas credentials
   ```

4. **Select your project** and choose:
   - Platform: Android
   - Select: "Keystore: Manage everything..."
   - Choose: "Set up a new keystore"

5. **View your SHA fingerprints**:
   ```bash
   eas credentials -p android
   ```
   
   Then select "Keystore: Manage everything related to Android Keystore" and "Show SHA-1 and SHA-256"

### Option 2: Using Gradle (For Local Builds)

#### Debug Build

1. **Navigate to your Android project**:
   ```bash
   cd canaryapp/android
   ```

2. **Get debug SHA fingerprints**:
   ```bash
   ./gradlew signingReport
   ```
   
   On Windows:
   ```cmd
   gradlew signingReport
   ```

3. **Look for the debug variant** in the output:
   ```
   Variant: debug
   SHA1: XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX
   SHA256: XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX
   ```

#### Release Build

For release builds, you'll need your keystore file. If using Expo, it's managed by EAS. For custom keystores:

```bash
keytool -list -v -keystore /path/to/your/keystore.jks -alias your-key-alias
```

### Option 3: Using keytool Directly

#### For Debug Keystore

**On Windows**:
```cmd
keytool -list -v -keystore %USERPROFILE%\.android\debug.keystore -alias androiddebugkey -storepass android -keypass android
```

**On macOS/Linux**:
```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

## Adding SHA Fingerprints to Firebase

1. **Go to Firebase Console**: https://console.firebase.google.com

2. **Select your project**: canary-os

3. **Click on Project Settings** (gear icon)

4. **Scroll down to "Your apps"**

5. **Find your Android app** (com.canaryapp)

6. **Click "Add fingerprint"**

7. **Paste your SHA-1 fingerprint** and click "Save"

8. **Repeat step 6-7** for SHA-256

9. **Add fingerprints for both**:
   - Debug build (for development)
   - Release build (for production)

## Important Notes

### Multiple Fingerprints

You should add SHA fingerprints for:
1. **Debug builds** - Used during development
2. **Release builds** - Used for production
3. **All team members** - If multiple developers are working on the project
4. **CI/CD systems** - If building on continuous integration

### After Adding Fingerprints

1. **Download the updated `google-services.json`**:
   - In Firebase Console, go to Project Settings
   - Scroll to "Your apps"
   - Click "Download google-services.json"
   - Replace the file in `canaryapp/google-services.json`

2. **For Expo projects**, run:
   ```bash
   npx expo prebuild --clean
   ```

3. **Rebuild your app** to apply the changes

## Troubleshooting

### "Error 10: Developer Error" in Google Sign-In

This means your SHA fingerprint is not registered or incorrect:
1. Double-check your SHA fingerprints match what's in Firebase
2. Ensure you've added fingerprints for the correct build type (debug/release)
3. Download the latest `google-services.json` after adding fingerprints
4. Clean and rebuild your project

### Finding Your Current Build's SHA

Run this command in your Android device/emulator:
```bash
adb shell pm list packages -f | grep canary
adb shell dumpsys package com.canaryapp | grep signatures
```

### Multiple Environments

If you have multiple environments (dev, staging, production):
- Each environment may have different keystores
- Add SHA fingerprints for all keystores
- Ensure each environment uses the correct `google-services.json`

## Quick Reference

**Debug Keystore Location**:
- Windows: `%USERPROFILE%\.android\debug.keystore`
- macOS/Linux: `~/.android/debug.keystore`

**Debug Keystore Password**:
- Store Password: `android`
- Key Password: `android`
- Alias: `androiddebugkey`

**EAS Commands**:
```bash
# View credentials
eas credentials

# Configure Android
eas credentials -p android

# Build development client
eas build --profile development --platform android
```

## Security Best Practices

1. **Never commit keystores** to version control
2. **Use environment variables** for sensitive data
3. **Keep SHA fingerprints private** (don't share publicly)
4. **Rotate keystores** if compromised
5. **Use separate keystores** for debug and release
6. **Back up your release keystore** securely

## Next Steps

After adding your SHA fingerprints:
1. ✅ Download updated `google-services.json`
2. ✅ Add it to `canaryapp/google-services.json`
3. ✅ Run `npx expo prebuild --clean`
4. ✅ Test Google Sign-In on a real device or emulator
5. ✅ Repeat for release build before publishing

For more information, see:
- [Firebase Android Setup](https://firebase.google.com/docs/android/setup)
- [Google Sign-In for Android](https://developers.google.com/identity/sign-in/android/start)
- [Expo Credentials](https://docs.expo.dev/app-signing/app-credentials/)
