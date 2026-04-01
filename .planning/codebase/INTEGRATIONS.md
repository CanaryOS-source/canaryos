# External Integrations

_Last updated: 2026-04-01_

## Overview

CanaryOS integrates with Firebase as its primary backend (auth, Firestore, Storage), Google services for sign-in and ML Kit OCR, and the Google Generative AI API (Gemini) as a cloud-only fallback analysis path. All primary scam detection runs fully on-device with no external calls. A dual-SDK pattern handles platform differences: `@react-native-firebase` for iOS/Android, Firebase JS SDK for web.

---

## APIs & External Services

### Google Generative AI (Gemini) — Demo/Fallback Only

- Purpose: Cloud-based scam analysis of images, text/URLs, and audio (voicemail); used only when on-device analysis is unavailable or as an explicit demo path
- Implementation: `canaryapp/services/scamAnalyzer.ts`
- SDK: `@ai-sdk/google` ^2.0.25 via Vercel AI SDK (`ai` ^5.0.82)
- Model: `gemini-2.5-flash`
- Features used: `generateObject` (structured output with Zod schema), `generateText` with `google_search` grounding tool for URL/text analysis
- Auth: `GOOGLE_GENERATIVE_AI_API_KEY` environment variable
- Runtime access: `Constants.expoConfig.extra.googleApiKey` (injected via `canaryapp/app.config.js`)
- **Warning:** This path is explicitly marked as demo fallback in project conventions. Do not use it as the default analysis route.

### Google ML Kit Text Recognition (On-Device OCR)

- Purpose: Extract text from images (screenshots, photos) for on-device scam analysis
- Implementation: `canaryapp/services/ondevice/OCRService.ts`
- SDK: `@react-native-ml-kit/text-recognition` ^2.0.0
- Platform: iOS and Android only (guarded with `Platform.OS !== 'web'` check)
- Auth: None — runs fully on-device, no network calls
- Loaded conditionally at runtime via `require('@react-native-ml-kit/text-recognition')`

---

## Data Storage

### Firebase Firestore

- Purpose: User profiles, family groups, member management, analytics/scan history
- Collections:
  - `users/{uid}` — user profile document (email, displayName, photoURL, familyId, timestamps)
  - `families/{familyId}` — family group (adminId, memberIds, inviteCode, name)
  - `families/{familyId}/members/{memberId}` — family member subcollection
  - `analytics/{userId}` — scan stats, risk score, scams detected/blocked/reported
  - `scam_reports/{reportId}` — user-submitted scam reports (future use)
- Security rules: `canaryapp/firestore.rules` — owner-only access for user docs; family-scoped access for family docs
- Indexes: `canaryapp/firestore.indexes.json`
- Native SDK: `@react-native-firebase/firestore` ^23.5.0 — used in `canaryapp/services/firebaseNative.ts`, `canaryapp/services/analyticsServiceNative.ts`, `canaryapp/services/familyServiceNative.ts`
- Web SDK: `firebase/firestore` (from `firebase` ^12.5.0) — used in `canaryapp/services/firebaseWeb.ts`

### Firebase Storage

- Purpose: Hosts updated TFLite model files for OTA model updates
- Base URL: `https://firebasestorage.googleapis.com/v0/b/canary-os.appspot.com/o/models`
- Implementation: `canaryapp/services/ondevice/ModelLoaderService.ts` — `downloadModel()` function fetches updated models to local cache at `FileSystem.documentDirectory + 'models/'`
- Auth: Uses Firebase project credentials (via `google-services.json`)
- Note: Model hash verification is currently a placeholder (TODO in `ModelLoaderService.ts`); actual SHA-256 verification not yet implemented

### Local Model Cache

- Purpose: Caches downloaded TFLite models on-device to avoid re-download
- Location: `FileSystem.documentDirectory + 'models/'` (device-local)
- Managed by: `canaryapp/services/ondevice/ModelLoaderService.ts`
- Not a remote service — pure local filesystem via `expo-file-system/legacy`

---

## Authentication & Identity

### Firebase Authentication

- Purpose: Primary user auth (email/password and Google OAuth)
- Native SDK: `@react-native-firebase/auth` ^23.5.0 — used in `canaryapp/services/firebaseNative.ts`
- Web SDK: `firebase/auth` — used in `canaryapp/services/firebaseWeb.ts`
- Methods supported:
  - Email/password (`createUserWithEmailAndPassword`, `signInWithEmailAndPassword`)
  - Google Sign-In (native: `@react-native-google-signin/google-signin` ^16.0.0; web: `signInWithPopup` + `GoogleAuthProvider`)
- Platform abstraction: `canaryapp/services/firebase.ts` — selects native or web implementation via `Platform.select`
- Context: `canaryapp/contexts/AuthContext.tsx`

### Google Sign-In (Native)

- SDK: `@react-native-google-signin/google-signin` ^16.0.0
- Web Client ID: configured at `canaryapp/config/firebase.ts` as `GOOGLE_WEB_CLIENT_ID`
- Used in: `canaryapp/services/firebaseNative.ts` — `signInWithGoogle()`
- Requires Google Play Services on Android

### Firebase Project

- Project ID: `canary-os`
- Auth domain: `canary-os.firebaseapp.com`
- Storage bucket: `canary-os.firebasestorage.app`
- Config file (Android): `canaryapp/google-services.json` (committed to repo — contains public config only, not secrets)
- Config constants: `canaryapp/config/firebase.ts`

---

## File Storage

- Local filesystem only for user-generated content (images, audio) during a scan session
- `expo-file-system` ^19.0.17 — reads audio buffers (`FileSystem.File.bytes()`), manages model cache directory
- No permanent cloud storage of user scan content — privacy by design

---

## Monitoring & Observability

**Error Tracking:** None detected — no Sentry, Bugsnag, or equivalent SDK present.

**Logs:** `console.log` / `console.warn` / `console.error` throughout all service files. No structured logging library.

**Analytics:** Custom Firestore-based scan analytics (`canaryapp/services/analyticsService.ts`, `canaryapp/services/analyticsServiceNative.ts`) — tracks scans detected, blocked, reported, and a computed risk score. No third-party analytics SDK (no Firebase Analytics, Amplitude, Mixpanel, etc.).

---

## CI/CD & Deployment

**Build Service:** EAS Build (Expo Application Services)
- Config: `canaryapp/eas.json`
- Profiles: `development` (internal distribution), `preview` (internal), `production` (auto-increment version)
- EAS Project ID: `44122a16-b5ac-4197-9644-a834f96b9a37` (set in `canaryapp/app.config.js`)

**CI Pipeline:** None detected — no GitHub Actions, CircleCI, or equivalent configuration found.

**Hosting:** EAS handles iOS/Android binary distribution. Web output is static (`web.output: 'static'` in `app.config.js`), but no hosting platform detected.

---

## Environment Configuration

**Required environment variables:**
- `GOOGLE_GENERATIVE_AI_API_KEY` — Google Gemini API key; only required for cloud fallback path in `canaryapp/services/scamAnalyzer.ts`

**Template:** `canaryapp/.env.example`

**Secrets location:** `.env` file in `canaryapp/` (gitignored); EAS secrets for production builds.

**Firebase config:** `canaryapp/google-services.json` — Android Firebase config committed to repo (contains public identifiers, not private keys).

---

## Webhooks & Callbacks

**Incoming:** None detected.

**Outgoing:** None detected (no webhook dispatch code found).

---

## On-Device ML Pipeline (No External Calls)

The core scam detection pipeline makes no network requests during inference:

| Component | Implementation | External Dependency |
|-----------|---------------|-------------------|
| Text OCR | Google ML Kit (on-device) | None at runtime |
| Text Classification | MobileBERT TFLite (`mobilebert_scam_intent.tflite`) | None |
| Visual Classification | MobileNetV3 TFLite (`mobilenet_v3_scam_detect.tflite`) | None (model optional) |
| Score Fusion | Custom weighted logic | None |
| Tokenization | Custom WordPiece tokenizer + `vocab.txt` | None |

Entry point: `canaryapp/services/ondevice/OnDeviceScamAnalyzer.ts`
Orchestration hook: `canaryapp/hooks/useScanner.ts`

---

## Gaps / Unknowns

- No error monitoring service (Sentry etc.) found — runtime errors are only logged to console.
- No CI/CD pipeline configuration detected — build and release process relies entirely on manual EAS CLI invocations.
- Model integrity verification (`verifyModelIntegrity` in `ModelLoaderService.ts`) is a stub — SHA-256 hash checks are not yet implemented.
- Firebase Notifications (`expo-notifications` ^0.32.12 is installed) — push notification integration is present in the dependency list but no server-side FCM trigger code was found.
- No iOS `GoogleService-Info.plist` was observed in the explored files (only `google-services.json` for Android); iOS Firebase config may rely on Expo's native module auto-linking from `app.config.js` plugins.

---

_Integration audit: 2026-04-01_
