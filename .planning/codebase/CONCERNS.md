# Codebase Concerns

_Last updated: 2026-04-01_

## Overview

The codebase is in active development with a partially functional on-device ML pipeline and a cloud-fallback (Gemini) path. The critical text classification model is committed to history as broken (see commit `b2e457f`), the visual classifier has a non-functional placeholder pixel extraction stub, and Firebase credentials are hardcoded in source. No tests exist anywhere in the project. The core on-device analysis path has multiple unfinished components that could silently fall back to degraded behavior without user awareness.

---

## Critical Issues

**Text model inference is known-broken (commit-flagged):**
- Issue: Commit `b2e457f` message explicitly states "TEXT MODEL IS BROKEN, TO-DO: FIX CUZ IT'S BUNZ". The model file `mobilebert_scam_intent.tflite` exists in `canaryapp/assets/models/` but the inference path has not been confirmed working end-to-end.
- Files: `canaryapp/services/ondevice/TextClassifierService.ts`, `canaryapp/services/ondevice/OnDeviceScamAnalyzer.ts`
- Impact: The text model is designated REQUIRED for all on-device analysis. If inference fails, `classify()` throws instead of gracefully degrading, crashing the on-device flow entirely.
- Fix approach: Trace the `classifyWithModel()` return path in `TextClassifierService.ts` lines 193–252 against actual model inputs/outputs; validate tokenizer output matches model's expected `int32 [1, 128]` shape.

**Visual classifier uses dummy tensor — visual analysis is non-functional:**
- Issue: `preprocessImage()` fills the input tensor with constant `0.5` values instead of actual pixel data. The comment explicitly says "Placeholder implementation — replace with actual base64 to tensor conversion."
- Files: `canaryapp/services/ondevice/VisualClassifierService.ts` lines 49–57
- Impact: Any visual model inference runs on garbage input, producing meaningless results. The visual model (`mobilenet_v3_scam_detect.tflite`) does not even exist in `canaryapp/assets/models/` — so in practice the system always falls back to text-only mode, but the placeholder code would produce bad results if the model were ever loaded.
- Fix approach: Implement real base64-to-RGB pixel extraction (likely via `expo-image-manipulator` base64 output decoded into a `Uint8Array`, then normalize to `Float32Array`).

**Firebase API key and credentials hardcoded in source:**
- Issue: `canaryapp/config/firebase.ts` contains the Firebase `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`, and `GOOGLE_WEB_CLIENT_ID` as plaintext strings committed to git since commit `68f34f3`.
- Files: `canaryapp/config/firebase.ts` lines 3–12
- Impact: Firebase project credentials are permanently exposed in git history. While Firebase Web API keys are designed to be public (security enforced by Firebase Security Rules), the `appId`, `messagingSenderId`, and `GOOGLE_WEB_CLIENT_ID` being hardcoded means they cannot be rotated without a code change. More critically, there is no `.env` pattern in place to prevent future developers from also hardcoding secrets.
- Fix approach: Move to `app.json` `extra` block populated from `.env` via `expo-constants`, or at minimum document that these values are intentionally public and add a comment to that effect.

**Debug UI panel shipped in production home screen:**
- Issue: `canaryapp/app/(tabs)/index.tsx` lines 452–522 render a "DEBUG: Direct Text Model Testing" section (`debugSection`, `debugTitle`) with a raw score display visible to all users on native platforms when on-device is ready.
- Files: `canaryapp/app/(tabs)/index.tsx`
- Impact: Users see a `🔬 Test Text Model Directly` panel. Violates the project's "no emojis in UI" convention and exposes internal model diagnostics publicly.
- Fix approach: Gate behind `__DEV__` or remove entirely before any production release.

---

## Technical Debt

**Duplicate auth route directories:**
- Issue: Both `canaryapp/app/auth/` and `canaryapp/app/(auth)/` exist with near-identical `login.tsx` and `register.tsx` files. The `_layout.tsx` router uses `(auth)` group; the `auth/` directory is orphaned code from a previous routing approach with one minor type cast difference (`router.push('/(auth)/register' as any)` vs without `as any`).
- Files: `canaryapp/app/auth/login.tsx`, `canaryapp/app/auth/register.tsx`, `canaryapp/app/(auth)/login.tsx`, `canaryapp/app/(auth)/register.tsx`
- Impact: Confusion about which files are active. Both are compiled, increasing bundle size.
- Fix approach: Delete `canaryapp/app/auth/` entirely — only the `(auth)` group is referenced by the router.

**Legacy `ScanService.ts` is dead code:**
- Issue: `canaryapp/services/ScanService.ts` is an early Phase 1 integration stub that feeds a zeroed `Float32Array` dummy buffer to the TFLite model. It is not imported or used anywhere in the current codebase.
- Files: `canaryapp/services/ScanService.ts`
- Impact: Dead code adds confusion about which model loading path is canonical. The dummy inference pattern could be accidentally adopted.
- Fix approach: Delete the file.

**Model integrity verification is a no-op:**
- Issue: `verifyModelIntegrity()` in `ModelLoaderService.ts` always returns `true` with a log message saying "Hash verification placeholder — implement with expo-crypto". Model hashes in `MODEL_HASHES` are string literals `'placeholder_hash_visual'` and `'placeholder_hash_text'`. The download flow explicitly skips hashing when the hash equals the placeholder string.
- Files: `canaryapp/services/ondevice/ModelLoaderService.ts` lines 29–31, 77–82, 101–108
- Impact: Tampered or corrupted models downloaded from Firebase Storage would be accepted silently.
- Fix approach: Implement with `expo-crypto`'s `digestStringAsync` or `digestAsync` on the model file bytes; replace placeholder strings with real SHA-256 hashes after each model release.

**`downloadModel()` function is dead code:**
- Issue: `downloadModel()` is defined in `ModelLoaderService.ts` (line 88) but never called. The `FIREBASE_MODEL_BASE_URL` constant is defined but unreferenced beyond the variable declaration. There is no over-the-air model update mechanism actually wired up.
- Files: `canaryapp/services/ondevice/ModelLoaderService.ts` lines 22, 88–112
- Impact: The implied feature (OTA model updates) is not functional. The Firebase Storage URL hardcodes the old `canary-os.appspot.com` bucket name which differs from the actual `storageBucket` in `firebase.ts` (`canary-os.firebasestorage.app`).

**Widespread `any` typing (69 occurrences):**
- Issue: 69 uses of `: any` throughout the codebase. Most critical is `AuthContext.tsx` where the `user` object is typed as `any | null`, eliminating all type safety for Firebase User properties used downstream.
- Files: `canaryapp/contexts/AuthContext.tsx` lines 6, 34, 51; `canaryapp/services/firebaseWeb.ts`; most screen components.
- Impact: Type errors in Firebase user property access will only surface at runtime.
- Fix approach: Import the Firebase `User` type from `@react-native-firebase/auth` or `firebase/auth` and replace `any` in `AuthContext`.

**OCRService confidence is hardcoded:**
- Issue: `canaryapp/services/ondevice/OCRService.ts` line 74 sets `const confidence = 0.9` with comment "ML Kit doesn't always provide confidence". This value propagates into the OCR result and is never used meaningfully, but it creates a false impression of high-confidence OCR results.
- Files: `canaryapp/services/ondevice/OCRService.ts`

**`app.json` missing iOS bundle identifier and Android package name:**
- Issue: `app.json` has `"ios": {}` and `"android": {}` sections with no `bundleIdentifier` or `package` specified. Without these, EAS builds will fail or generate non-deterministic identifiers.
- Files: `canaryapp/app.json`

---

## Incomplete Features

**Visual model does not exist:**
- What's missing: `mobilenet_v3_scam_detect.tflite` is referenced in `ModelLoaderService.ts` and `VisualClassifierService.ts` but the file does not exist in `canaryapp/assets/models/`. The system gracefully falls back to text-only mode, but the entire visual classification branch is an unfired code path.
- Files: `canaryapp/services/ondevice/VisualClassifierService.ts`, `canaryapp/services/ondevice/ModelLoaderService.ts`
- Status: The research notebook (`research/notebooks/`) may have model training code but no `mobilenet_v3_scam_detect.tflite` is produced yet.

**`analyzeText()` on home screen is not wired to on-device path:**
- What's missing: The text input search box on the home screen (`canaryapp/app/(tabs)/index.tsx` `analyzeSearch()`) calls cloud Gemini via `analyzeTextForScam()`, not the on-device `analyzeText()` from `OnDeviceScamAnalyzer.ts`. The on-device text analysis path exists and works independently, but the UI does not offer it as an option for text input.
- Files: `canaryapp/app/(tabs)/index.tsx` lines 300–333

**`scanner.tsx` screen uses deprecated `MediaTypeOptions`:**
- What's missing: `canaryapp/app/scanner.tsx` line 21 uses `ImagePicker.MediaTypeOptions.Images` which is deprecated in `expo-image-picker` v14+. The active home screen (`index.tsx`) correctly uses the new `mediaTypes: ['images']` array syntax. The scanner screen is not linked in the tab navigation and may be an orphaned UI.
- Files: `canaryapp/app/scanner.tsx`

**Family scan history per-member is incomplete:**
- Issue: `canaryapp/app/family/member/[userId].tsx` (383 lines) exists but the actual scan history display depends on Firestore queries that may not be fully tested.
- Files: `canaryapp/app/family/member/[userId].tsx`

---

## Security Concerns

**Firebase credentials in git history (permanent):**
- Risk: `firebaseConfig` object with `apiKey`, `appId`, and OAuth client ID is committed in `canaryapp/config/firebase.ts` and has been in git history since commit `68f34f3`. Rotating these values requires contacting Firebase support and is not easily reversible.
- Files: `canaryapp/config/firebase.ts`
- Current mitigation: Firebase Web API keys are scoped by Firebase Security Rules; however, Security Rules have not been audited in this review.
- Recommendation: Add Security Rules audit; consider if `GOOGLE_WEB_CLIENT_ID` needs additional protection.

**Google Generative AI API key has no client-side protection:**
- Risk: `scamAnalyzer.ts` reads the Gemini API key from `Constants.expoConfig?.extra?.googleApiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY`. If the key is embedded in the `app.json` `extra` block (the intended mechanism), it will be bundled into the compiled app binary and extractable by anyone who decompiles it.
- Files: `canaryapp/services/scamAnalyzer.ts` lines 29, 106, 172
- Current mitigation: None visible — the `extra` block in `app.json` is empty/absent, meaning the Gemini path may simply fail silently with an unconfigured key error.
- Recommendation: Move Gemini API calls to a lightweight backend proxy (Vercel Edge Function or Firebase Cloud Function) to avoid shipping the key in the binary.

**No input sanitization on text scam analysis:**
- Risk: User text entered in the search box is passed directly to `analyzeTextForScam(query)` and injected into a Gemini prompt without sanitization. Prompt injection attacks are possible.
- Files: `canaryapp/app/(tabs)/index.tsx` lines 313, `canaryapp/services/scamAnalyzer.ts` lines 219–225
- Current mitigation: Gemini's `generateText` system prompt is separate from user content, providing partial isolation.

**No authentication token expiry handling:**
- Risk: `AuthContext.tsx` subscribes to auth state changes but there is no visible handling of token refresh errors or forced re-authentication on expired sessions.
- Files: `canaryapp/contexts/AuthContext.tsx`

---

## Performance Concerns

**26 MB TFLite model bundled in app:**
- Problem: `mobilebert_scam_intent.tflite` is 26.7 MB and is bundled directly in `canaryapp/assets/models/`. This adds ~27 MB to the app download size on every install.
- Files: `canaryapp/assets/models/mobilebert_scam_intent.tflite`
- Cause: MobileBERT is a large model for on-device use; alternatives like DistilBERT or a custom smaller model would reduce this.
- Improvement path: Evaluate model quantization (INT8) to reduce size; or move to on-demand download via the `downloadModel()` path that already exists but is unwired.

**207 `console.log/warn/error` calls in production code:**
- Problem: The entire on-device pipeline and UI screens log extensively to the console (207 log statements). This includes token IDs, model input/output tensors, and inference scores on every analysis.
- Files: Concentrated in `canaryapp/services/ondevice/` (all files) and `canaryapp/app/(tabs)/index.tsx`
- Cause: Added during debugging of the broken text model; not cleaned up.
- Improvement path: Wrap in a `__DEV__` guard or a lightweight logger that no-ops in production.

**Vocabulary file loaded from asset on every app cold start:**
- Problem: `TextTokenizer.ts` reads the full 231 KB `vocab.txt` file via `FileSystem.readAsStringAsync()` and parses 30,522 lines into a `Map` on initialization. This runs synchronously on the main thread path before the app is usable.
- Files: `canaryapp/services/ondevice/TextTokenizer.ts` lines 48–136
- Improvement path: Pre-compile vocab to a binary format or use a lazy-loading approach tied to first scan, not app startup.

---

## Gaps / Unknowns

**Text model accuracy is unvalidated in the app:**
- The MobileBERT model was trained in research notebooks but there is no evaluation run logged against the production tokenizer configuration. The notebook refactor (commit `1530a0e`) added "tokenization diagnostics and vocab compatibility" checks, suggesting the tokenizer-model mismatch was an open issue.

**Firebase Security Rules not visible:**
- Firebase Security Rules for Firestore (family data, analytics, scan history) are not part of this repository. It is unknown whether rules are permissive or correctly scoped to authenticated users.

**No test suite of any kind:**
- Zero test files exist in the entire `canaryapp/` directory. No unit, integration, or E2E tests. Critical ML pipeline components (`TextClassifierService`, `FusionEngine`, `TextTokenizer`) have no coverage.

**`modal.tsx` screen is empty:**
- `canaryapp/app/modal.tsx` exists as a registered route in `_layout.tsx` but its purpose is undetermined — it appears to be a placeholder from the Expo starter template that was never removed or implemented.
- Files: `canaryapp/app/modal.tsx`

**`app/(tabs)/explore.tsx` may be leftover from Expo template:**
- The explore tab renders static content describing Gemini-based analysis with hardcoded scam type icons. It does not connect to any live data. It may be a placeholder that was never replaced with real explore/history functionality.
- Files: `canaryapp/app/(tabs)/explore.tsx`

---

*Concerns audit: 2026-04-01*
