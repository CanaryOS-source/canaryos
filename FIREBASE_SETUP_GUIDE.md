# Firebase Authentication & Firestore Setup Guide

## Overview

This project implements Firebase Authentication and Firestore with platform-specific implementations:
- **Web**: Firebase JS SDK v10
- **Native (iOS/Android)**: React Native Firebase

## ✅ What's Implemented

### Features
- ✅ Email/Password authentication
- ✅ Google Sign-In (web and native)
- ✅ User account creation with Firestore document
- ✅ Secure authentication state management
- ✅ User profile data in Firestore
- ✅ Sign out functionality
- ✅ Account deletion
- ✅ Protected routes (requires authentication)
- ✅ Clean, modern login/register UI

### Security
- ✅ Secure Firestore rules (users can only access their own data)
- ✅ Platform-specific service architecture
- ✅ Proper error handling
- ✅ Re-authentication prompts for sensitive actions

## 📁 File Structure

```
canaryapp/
├── config/
│   └── firebase.ts              # Firebase configuration
├── services/
│   ├── firebase.ts              # Platform-agnostic wrapper
│   ├── firebaseWeb.ts           # Web implementation (Firebase JS SDK)
│   └── firebaseNative.ts        # Native implementation (RN Firebase)
├── contexts/
│   └── AuthContext.tsx          # Authentication context provider
├── app/
│   ├── _layout.tsx              # Root layout with auth protection
│   ├── (auth)/
│   │   ├── _layout.tsx          # Auth screens layout
│   │   ├── login.tsx            # Login screen
│   │   └── register.tsx         # Register screen
│   └── (tabs)/
│       └── settings.tsx         # Settings with logout/delete
├── google-services.json         # Android Firebase config
└── GoogleService-Info.plist     # iOS Firebase config (to be added)
```

## 🚀 Setup Instructions

### Step 1: Install Dependencies

Already completed! The following packages are installed:
- `firebase` - Firebase JS SDK for web
- `@react-native-firebase/app` - Core Firebase module for native
- `@react-native-firebase/auth` - Authentication for native
- `@react-native-firebase/firestore` - Firestore for native
- `@react-native-google-signin/google-signin` - Google Sign-In for native
- `expo-web-browser` - For web OAuth flows
- `expo-auth-session` - For native OAuth flows

### Step 2: Configure Firebase (Already Done)

The Firebase configuration is set up in `config/firebase.ts` using credentials from `google-services.json`.

### Step 3: Add iOS Configuration

**You need to create `GoogleService-Info.plist` for iOS:**

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: **canary-os**
3. Click on iOS app (or add one if it doesn't exist)
4. Download `GoogleService-Info.plist`
5. Save it to: `canaryapp/GoogleService-Info.plist`

### Step 4: Deploy Firestore Rules

The Firestore security rules are in `firestore.rules`. Deploy them:

1. **Install Firebase CLI** (if not already installed):
   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**:
   ```bash
   firebase login
   ```

3. **Initialize Firebase** (if not already done):
   ```bash
   firebase init firestore
   ```
   - Select existing project: canary-os
   - Accept default locations for rules and indexes

4. **Deploy the rules**:
   ```bash
   firebase deploy --only firestore:rules
   ```

### Step 5: Configure Google Sign-In

#### For Android:

1. **Get SHA fingerprints** (see `SHA_FINGERPRINT_GUIDE.md`)
   ```bash
   cd canaryapp
   npx expo prebuild
   cd android
   ./gradlew signingReport
   ```

2. **Add to Firebase Console**:
   - Go to Project Settings → Your apps → Android app
   - Add SHA-1 and SHA-256 fingerprints
   - Download updated `google-services.json`

3. **Enable Google Sign-In**:
   - In Firebase Console, go to Authentication → Sign-in method
   - Enable "Google" provider
   - Add support email

#### For iOS:

1. **Add iOS app** in Firebase Console (if not exists):
   - iOS bundle ID: `com.canaryapp`
   - Download `GoogleService-Info.plist`

2. **Enable Google Sign-In**:
   - Same as Android (already enabled if you did Android setup)

3. **Add URL schemes**:
   - Open `GoogleService-Info.plist`
   - Copy the `REVERSED_CLIENT_ID`
   - This is automatically handled by `@react-native-firebase/auth`

#### For Web:

1. **Add Web app** in Firebase Console (if not exists)
2. **Configure authorized domains**:
   - Go to Authentication → Settings → Authorized domains
   - Add your development and production domains

### Step 6: Prebuild and Test

1. **Clean prebuild** (generates native projects):
   ```bash
   npx expo prebuild --clean
   ```

2. **Run on Android**:
   ```bash
   npx expo run:android
   ```

3. **Run on iOS**:
   ```bash
   npx expo run:ios
   ```

4. **Run on Web**:
   ```bash
   npx expo start --web
   ```

## 🔧 Configuration Files

### app.config.js

Updated with Firebase plugins:
- `@react-native-firebase/app`
- `@react-native-firebase/auth`
- `@react-native-firebase/firestore`
- `expo-build-properties` (for iOS frameworks)

### google-services.json (Android)

Located at: `canaryapp/google-services.json`
- Project ID: `canary-os`
- Package name: `com.canaryapp`
- Already configured with your project credentials

### GoogleService-Info.plist (iOS) - TO ADD

Should be placed at: `canaryapp/GoogleService-Info.plist`
Download from Firebase Console.

## 📱 Platform-Specific Implementation

### Web (firebaseWeb.ts)

Uses Firebase JS SDK v10:
- `initializeApp` from `firebase/app`
- `getAuth` from `firebase/auth`
- `getFirestore` from `firebase/firestore`
- `signInWithPopup` for Google Sign-In

### Native (firebaseNative.ts)

Uses React Native Firebase:
- `@react-native-firebase/auth`
- `@react-native-firebase/firestore`
- `@react-native-google-signin/google-signin`
- Native Google Sign-In flow

### Automatic Platform Selection (firebase.ts)

Uses `Platform.select()` to automatically import the correct implementation.

## 🔐 Security Rules

The Firestore rules ensure:
- Users can only read/write their own documents
- Email and UID cannot be changed after creation
- All required fields are validated
- Authenticated users only

**Rules location**: `firestore.rules`

**Key rules**:
- `/users/{userId}`: User can only access their own document
- `/scam_reports/{reportId}`: User can only access their own reports
- Default deny for all other collections

## 🎨 UI Components

### Login Screen (`app/(auth)/login.tsx`)

Features:
- Email/password input
- Password visibility toggle
- Google Sign-In button
- Link to registration
- Error handling with friendly messages
- Loading states

### Register Screen (`app/(auth)/register.tsx`)

Features:
- Email/password/confirm password inputs
- Password validation (min 6 characters)
- Password matching validation
- Google Sign-In button
- Link to login
- Error handling

### Settings Screen (`app/(tabs)/settings.tsx`)

Features:
- User email display
- Sign Out button
- Delete Account button (with confirmation)
- Notifications toggle
- Floating scanner controls

## 🔄 Authentication Flow

1. **App starts** → `_layout.tsx` wraps app with `AuthProvider`
2. **AuthProvider** → Subscribes to auth state changes
3. **User not authenticated** → Redirect to login
4. **User authenticated** → Access main app
5. **User signs out** → Redirect to login

## 🧪 Testing

### Test Email/Password Registration

1. Open the app
2. Click "Sign Up"
3. Enter email and password
4. Click "Create Account"
5. Should redirect to main app

### Test Email/Password Login

1. Open the app
2. Enter email and password
3. Click "Sign In"
4. Should redirect to main app

### Test Google Sign-In

**Web**:
1. Click "Continue with Google"
2. Select Google account
3. Should redirect to main app

**Native** (requires SHA fingerprints):
1. Click "Continue with Google"
2. Select Google account in native sheet
3. Should redirect to main app

### Test Sign Out

1. Go to Settings tab
2. Click "Sign Out"
3. Confirm
4. Should redirect to login

### Test Delete Account

1. Go to Settings tab
2. Click "Delete Account"
3. Confirm twice
4. Account deleted, redirect to login

## 🐛 Troubleshooting

### "Error 10: Developer Error" (Google Sign-In on Android)

**Solution**: Add SHA fingerprints to Firebase Console. See `SHA_FINGERPRINT_GUIDE.md`.

### "Invalid API key" Error

**Solution**: 
1. Check `config/firebase.ts` has correct API key
2. Ensure `google-services.json` is in correct location
3. Run `npx expo prebuild --clean`

### "Missing google-services.json" Error

**Solution**: 
1. Download from Firebase Console
2. Place in `canaryapp/google-services.json`
3. Run `npx expo prebuild --clean`

### Firestore "Permission denied" Error

**Solution**:
1. Deploy Firestore rules: `firebase deploy --only firestore:rules`
2. Check user is authenticated
3. Verify rules in Firebase Console

### Google Sign-In doesn't work on Web

**Solution**:
1. Add your domain to authorized domains in Firebase Console
2. For localhost, add `http://localhost:8081`

## 📚 Additional Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [React Native Firebase](https://rnfirebase.io/)
- [Expo Firebase Guide](https://docs.expo.dev/guides/using-firebase/)
- [SHA Fingerprint Guide](./SHA_FINGERPRINT_GUIDE.md)

## 🎯 Next Steps

1. ✅ Add `GoogleService-Info.plist` for iOS
2. ✅ Deploy Firestore rules
3. ✅ Get and add SHA fingerprints for Android
4. ✅ Test on all platforms
5. ✅ Configure authorized domains for web
6. Consider adding:
   - Password reset functionality
   - Email verification
   - Social login (Facebook, Apple)
   - Profile editing
   - Avatar upload

## 🆘 Need Help?

Refer to:
1. `SHA_FINGERPRINT_GUIDE.md` - For getting SHA fingerprints
2. Firebase Console - For project configuration
3. `firestore.rules` - For security rules
4. Component files - For implementation details
