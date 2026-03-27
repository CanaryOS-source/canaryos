# Firebase Setup Guide

## Overview

CanaryOS uses Firebase for authentication, data storage, and (future) model distribution. The app has platform-specific implementations:
- **Web**: Firebase JS SDK v10
- **Native (iOS/Android)**: React Native Firebase

## Prerequisites

- Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
- Project ID: `canary-os`

## Quick Start

### 1. Get SHA Fingerprints (Android)

Google Sign-In on Android requires SHA fingerprints:

```bash
cd canaryapp
npx expo prebuild --clean
cd android
./gradlew signingReport
```

Copy the **SHA-1** and **SHA-256** fingerprints from the output.

#### Alternative: Using EAS

```bash
npm install -g eas-cli
eas login
eas credentials --platform android
```

#### Alternative: Using keytool

```bash
# Debug keystore
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

### 2. Add SHA Fingerprints to Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/project/canary-os)
2. Project Settings > General > Your apps > Android app
3. Click "Add fingerprint"
4. Add both SHA-1 and SHA-256

### 3. Download Config Files

- **Android**: Download `google-services.json` and place in `canaryapp/`
- **iOS**: Download `GoogleService-Info.plist` and place in `canaryapp/ios/`
- **Web**: Config is in `canaryapp/config/firebase.ts`

### 4. Environment Variables

Create `canaryapp/.env`:
```
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
```

### 5. Run the App

```bash
cd canaryapp
npm install
npx expo start
```

## Implemented Features

- Email/password authentication
- Google Sign-In (web and native)
- User profile storage in Firestore
- Family group management
- Secure Firestore rules (users access only their own data)
- Re-authentication for sensitive actions (account deletion)

## Security Rules

Firestore rules are in `canaryapp/firestore.rules`. Key principles:
- Users can only read/write their own user document
- Family data is scoped by group membership
- Admin-only operations require role verification

## Firestore Indexes

Custom indexes are defined in `canaryapp/firestore.indexes.json`. Deploy with:

```bash
cd canaryapp
firebase deploy --only firestore:indexes
```
