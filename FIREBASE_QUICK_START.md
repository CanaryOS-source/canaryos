# 🚀 Firebase Quick Start Guide

## What's Been Implemented

✅ **Complete Firebase Authentication & Firestore integration**
- Platform-specific implementations (Web + Native)
- Email/Password authentication
- Google Sign-In
- User profile storage in Firestore
- Secure authentication state management
- Protected routes
- Beautiful login/register UI
- Logout and delete account functionality

## 🏃 Quick Start (3 Steps)

### 1. Get SHA Fingerprints for Android

```bash
cd canaryapp
npx expo prebuild --clean
cd android
./gradlew signingReport
```

**Copy the SHA-1 and SHA-256 fingerprints** from the output.

### 2. Add SHA Fingerprints to Firebase

1. Go to: https://console.firebase.google.com/project/canary-os
2. Click **Project Settings** (gear icon)
3. Under **Your apps** → Android app → Click **Add fingerprint**
4. Paste SHA-1 and click **Save**
5. Click **Add fingerprint** again
6. Paste SHA-256 and click **Save**
7. Download updated `google-services.json` (optional, but recommended)

### 3. Deploy Firestore Rules

```bash
cd canaryapp
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

## ✅ Test Your Implementation

### Web Testing

```bash
npx expo start --web
```

1. Navigate to login page
2. Test email/password registration
3. Test Google Sign-In (popup)
4. Test logout and delete account

### Android Testing

```bash
npx expo run:android
```

Same tests as web, Google Sign-In uses native flow.

### iOS Testing

**First, add iOS app to Firebase:**

1. Firebase Console → Add iOS app
2. Bundle ID: `com.canaryapp`
3. Download `GoogleService-Info.plist`
4. Place in: `canaryapp/GoogleService-Info.plist`

Then run:
```bash
npx expo run:ios
```

## 📂 Key Files Created

### Configuration
- ✅ `config/firebase.ts` - Firebase config
- ✅ `google-services.json` - Android credentials
- ⚠️ `GoogleService-Info.plist` - iOS credentials **(YOU NEED TO ADD THIS)**

### Services
- ✅ `services/firebase.ts` - Platform-agnostic wrapper
- ✅ `services/firebaseWeb.ts` - Web implementation
- ✅ `services/firebaseNative.ts` - Native implementation

### Context & Layout
- ✅ `contexts/AuthContext.tsx` - Auth state management
- ✅ `app/_layout.tsx` - Root layout with auth protection

### UI Screens
- ✅ `app/(auth)/login.tsx` - Login screen
- ✅ `app/(auth)/register.tsx` - Registration screen
- ✅ `app/(tabs)/settings.tsx` - Updated with auth actions

### Security
- ✅ `firestore.rules` - Secure Firestore rules
- ✅ `.firebaserc` - Firebase project config
- ✅ `firebase.json` - Firebase deployment config

### Documentation
- ✅ `FIREBASE_SETUP_GUIDE.md` - Complete setup guide
- ✅ `SHA_FINGERPRINT_GUIDE.md` - SHA fingerprint guide
- ✅ `FIREBASE_QUICK_START.md` - This file

## 🔐 Firestore Security Rules

Your data is secure! The rules ensure:
- Users can only read/write their own documents
- Authenticated access only
- Field validation on all writes
- UID and email cannot be changed

**Deploy with**: `firebase deploy --only firestore:rules`

## 🎨 User Flow

```
1. App Start
   ↓
2. Check Auth State
   ↓
3. Not Authenticated → Login Screen
   ├─ Email/Password Sign In
   ├─ Email/Password Register
   └─ Google Sign-In
   ↓
4. Authenticated → Main App
   └─ Settings
      ├─ Sign Out
      └─ Delete Account
```

## 📱 Platforms Supported

| Platform | Status | Auth Methods | Notes |
|----------|--------|--------------|-------|
| **Web** | ✅ Ready | Email, Google | Uses Firebase JS SDK |
| **Android** | ⚠️ Needs SHA | Email, Google | Add SHA fingerprints |
| **iOS** | ⚠️ Needs plist | Email, Google | Add GoogleService-Info.plist |

## ⚡ Next Steps

### Required (To make it work)

1. **Get SHA fingerprints** for Android
   ```bash
   cd canaryapp/android && ./gradlew signingReport
   ```

2. **Add SHA fingerprints** to Firebase Console

3. **Download iOS config**:
   - Add iOS app in Firebase Console
   - Download `GoogleService-Info.plist`
   - Place in `canaryapp/GoogleService-Info.plist`

4. **Deploy Firestore rules**:
   ```bash
   firebase deploy --only firestore:rules
   ```

5. **Test on all platforms**

### Optional (Enhancements)

- [ ] Add password reset functionality
- [ ] Add email verification
- [ ] Add Apple Sign-In
- [ ] Add Facebook Sign-In
- [ ] Add profile editing
- [ ] Add avatar upload
- [ ] Add phone authentication
- [ ] Add biometric authentication

## 🐛 Common Issues

### Google Sign-In Error on Android

**Error**: "Error 10: Developer Error"

**Fix**: Add SHA-1 and SHA-256 to Firebase Console (see Step 2)

### Permission Denied in Firestore

**Fix**: Deploy Firestore rules
```bash
firebase deploy --only firestore:rules
```

### Can't find GoogleService-Info.plist (iOS)

**Fix**: Download from Firebase Console and place in `canaryapp/`

## 📚 Need More Help?

- **Detailed Setup**: See `FIREBASE_SETUP_GUIDE.md`
- **SHA Fingerprints**: See `SHA_FINGERPRINT_GUIDE.md`
- **Firebase Console**: https://console.firebase.google.com/project/canary-os
- **React Native Firebase Docs**: https://rnfirebase.io/

## ✨ What You Can Do Now

```typescript
// Sign in with email/password
await signIn('user@example.com', 'password123');

// Create account
await createAccount('user@example.com', 'password123');

// Sign in with Google
await signInWithGoogle();

// Sign out
await signOut();

// Delete account
await deleteAccount();

// Get user data
const userData = await getUserData(userId);
```

## 🎯 Testing Checklist

- [ ] Email/password registration works
- [ ] Email/password login works
- [ ] Google Sign-In works on web
- [ ] Google Sign-In works on Android (after SHA setup)
- [ ] Google Sign-In works on iOS (after plist setup)
- [ ] User data is saved to Firestore
- [ ] Sign out works
- [ ] Delete account works
- [ ] Can't access app without authentication
- [ ] Redirects properly between auth and main app

## 🎊 You're All Set!

Your Firebase Authentication and Firestore are configured and ready to use. Just complete the 3 quick start steps above and you're good to go!

**Questions?** Check the detailed guides:
- `FIREBASE_SETUP_GUIDE.md` - Complete setup instructions
- `SHA_FINGERPRINT_GUIDE.md` - SHA fingerprint help
