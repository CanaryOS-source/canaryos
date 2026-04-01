# Technology Stack

_Last updated: 2026-04-01_

## Overview

CanaryOS is a React Native (Expo) mobile application for on-device, real-time scam detection. The app targets iOS and Android with a shared web-compatible layer. A separate Python-based research directory handles ML model training and conversion, independent from the mobile app build.

## Languages

**Primary:**
- TypeScript ~5.9.2 — all mobile app source code (`canaryapp/**/*.ts`, `canaryapp/**/*.tsx`)
- Python 3.10–3.12 — ML research, model training, and conversion scripts (`research/notebooks/`, `research/scripts/`)

**Secondary:**
- JavaScript — Expo config (`canaryapp/app.config.js`, `canaryapp/metro.config.js`)

## Runtime

**Environment:**
- Node.js — required for Expo/React Native toolchain (version pinned by Expo SDK 54)
- Python — research environment using `.venv` at repo root (`source ../.venv/bin/activate`)

**Package Manager:**
- npm (lockfile: `canaryapp/package-lock.json`)
- pip — Python dependencies for research (not tracked in a requirements.txt; install `onnx onnxruntime tensorflow` per script comments)

## Frameworks

**Core:**
- React 19.1.0 — UI component model
- React Native 0.81.5 — native mobile runtime
- Expo SDK ~54.0.20 — build toolchain, device APIs, and managed workflow

**Routing:**
- Expo Router ~6.0.13 — file-based routing under `canaryapp/app/`; typed routes enabled via `experiments.typedRoutes`

**Build/Dev:**
- Metro Bundler — default React Native bundler, configured in `canaryapp/metro.config.js` to bundle `.tflite` and `.txt` asset types
- EAS Build — cloud build service configured in `canaryapp/eas.json`; project ID `44122a16-b5ac-4197-9644-a834f96b9a37`
- expo-dev-client ~6.0.16 — development build support (required for native modules)
- expo-build-properties ~1.0.9 — native build config; sets `ios.useFrameworks: static` (required for Firebase)
- React Compiler — enabled via `experiments.reactCompiler: true`
- New Architecture — enabled via `newArchEnabled: true` in `canaryapp/app.config.js`

**Research / ML Training:**
- TensorFlow — primary training framework (`import tensorflow as tf`)
- Hugging Face `transformers` — MobileBERT tokenizer (`MobileBertTokenizer.from_pretrained('google/mobilebert-uncased')`)
- Hugging Face `datasets` — loads `sms_spam` dataset
- scikit-learn — evaluation (`train_test_split`, `classification_report`, `confusion_matrix`)
- numpy, pandas — data processing
- onnx, onnxruntime — ONNX model handling for conversion pipeline
- TFLite — final export format consumed by the mobile app

## Key Dependencies

**Critical (ML Inference):**
- `react-native-fast-tflite` ^1.6.1 — runs TFLite models on-device; loaded via `loadTensorflowModel` in `canaryapp/services/ondevice/ModelLoaderService.ts`
- `react-native-worklets` 0.5.1 — required peer dependency of `react-native-fast-tflite`
- `@react-native-ml-kit/text-recognition` ^2.0.0 — Google ML Kit OCR for image-to-text extraction; used in `canaryapp/services/ondevice/OCRService.ts`

**Cloud AI (Demo/Fallback Only):**
- `@ai-sdk/google` ^2.0.25 — Vercel AI SDK Google provider; connects to Gemini 2.5 Flash
- `ai` ^5.0.82 — Vercel AI SDK core (`generateObject`, `generateText`)
- `@ai-sdk/react` ^2.0.82 — React hooks for AI SDK
- `zod` ^3.25.76 — schema validation for structured AI responses in `canaryapp/services/scamAnalyzer.ts`

**Firebase:**
- `@react-native-firebase/app` ^23.5.0 — native Firebase SDK for iOS/Android
- `@react-native-firebase/auth` ^23.5.0 — native auth
- `@react-native-firebase/firestore` ^23.5.0 — native Firestore
- `firebase` ^12.5.0 — Firebase JS SDK for web platform (`canaryapp/services/firebaseWeb.ts`)

**Navigation:**
- `@react-navigation/native` ^7.1.8
- `@react-navigation/bottom-tabs` ^7.4.0
- `react-native-screens` ~4.16.0
- `react-native-gesture-handler` ~2.28.0
- `react-native-reanimated` ~4.1.1

**Expo APIs:**
- `expo-file-system` ^19.0.17 — file I/O for model cache and audio reading; uses legacy API (`expo-file-system/legacy`) in `ModelLoaderService.ts`
- `expo-image-picker` ~17.0.8 — user photo selection for scan input
- `expo-image-manipulator` ^14.0.8 — image preprocessing
- `expo-document-picker` ^14.0.7 — voicemail file selection
- `expo-notifications` ^0.32.12 — push notification support
- `expo-constants` ~18.0.10 — access `expoConfig.extra` (API keys, EAS project ID)
- `expo-auth-session` ^7.0.8 — OAuth session handling
- `expo-asset` — bundled asset resolution (used in `ModelLoaderService.ts` via `Asset.fromModule`)

**Auth:**
- `@react-native-google-signin/google-signin` ^16.0.0 — Google OAuth for native Android/iOS

**Linting:**
- `eslint` ^9.25.0 with `eslint-config-expo` ~10.0.0
- Config: `canaryapp/eslint.config.js`

## Configuration

**TypeScript:**
- `canaryapp/tsconfig.json` — extends `expo/tsconfig.base`, strict mode enabled, path alias `@/*` maps to `canaryapp/`

**Environment:**
- `GOOGLE_GENERATIVE_AI_API_KEY` — required for cloud AI fallback (Gemini); set in `.env` or injected via EAS secrets
- Template: `canaryapp/.env.example`
- Key exposed to app at runtime via `Constants.expoConfig.extra.googleApiKey` (set in `canaryapp/app.config.js`)

**Build:**
- `canaryapp/app.config.js` — Expo config, Android permissions, Firebase plugin registration, EAS project ID
- `canaryapp/eas.json` — EAS build profiles: `development` (internal), `preview` (internal), `production` (auto-increment)
- `canaryapp/metro.config.js` — extends default Expo Metro config, adds `.tflite` and `.txt` to `assetExts`
- `canaryapp/firebase.json` — Firebase project config
- `canaryapp/firestore.rules` — Firestore security rules
- `canaryapp/firestore.indexes.json` — Firestore index definitions
- `canaryapp/google-services.json` — Android Firebase config (committed to repo)

## Platform Requirements

**Development:**
- Node.js (version managed by Expo SDK 54)
- Android: `google-services.json` present, Android SDK
- iOS: `expo-build-properties` sets `useFrameworks: static` (required for Firebase native SDK)
- Python 3.10–3.12 for research work

**Production:**
- Android: package `com.canaryapp`, `googleServicesFile: ./google-services.json`
- iOS: bundle ID `com.canaryapp`, `supportsTablet: true`
- Models bundled at `canaryapp/assets/models/` (`.tflite`, `vocab.txt`)
- Firebase Storage used as CDN for model updates: `https://firebasestorage.googleapis.com/v0/b/canary-os.appspot.com/o/models`

## Bundled Model Assets

- `canaryapp/assets/models/mobilebert_scam_intent.tflite` — required text classifier (MobileBERT fine-tuned)
- `canaryapp/assets/models/vocab.txt` — MobileBERT vocabulary file for tokenization
- `canaryapp/assets/models/mobilenet_v3_scam_detect.tflite` — optional visual classifier (not currently present; system falls back to text-only mode)

---

_Stack analysis: 2026-04-01_
