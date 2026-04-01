# Architecture

_Last updated: 2026-04-01_

## Overview

CanaryOS is a React Native (Expo) mobile app for real-time, on-device scam detection. The architecture is layered: a file-based routing UI layer (Expo Router) over a React Context state layer over a platform-agnostic service layer that wraps either Firebase Native SDK or Firebase JS SDK depending on platform. The core value proposition — on-device ML inference — is encapsulated entirely within `canaryapp/services/ondevice/` and never routes data off-device.

## Pattern Overview

**Overall:** Layered service architecture with React Context for shared state

**Key Characteristics:**
- Expo Router handles navigation via filesystem conventions (no manual route registry)
- Context providers (`AuthContext`, `FamilyContext`) wrap the entire navigator tree, making auth/family state globally accessible
- All Firebase calls are hidden behind a platform-selection wrapper (`Platform.select`) so web and native can coexist without `#ifdef`-style guards
- The on-device ML pipeline is a self-contained module that degrades gracefully: text model required, visual model optional

## Layers

**UI Layer (Screens):**
- Purpose: Render UI and handle user input only; delegate analysis and state to hooks and contexts
- Location: `canaryapp/app/`
- Contains: Expo Router screens (`.tsx` files), layout files (`_layout.tsx`)
- Depends on: Context hooks (`useAuth`, `useFamily`), feature hooks (`useScanner`), services (directly in some screens)
- Used by: End users via Expo Router navigation

**State Layer (Contexts + Hooks):**
- Purpose: Hold shared application state and expose domain actions to screens
- Location: `canaryapp/contexts/`, `canaryapp/hooks/`
- Contains: `AuthContext.tsx` (auth state + Firebase subscription), `FamilyContext.tsx` (family CRUD + membership), `useScanner.ts` (ML pipeline state machine), `useFamilyRole.ts` (permission checks)
- Depends on: Service layer
- Used by: UI layer screens

**Service Layer:**
- Purpose: Side effects, external calls, and ML inference; platform-agnostic wrappers
- Location: `canaryapp/services/`
- Contains: Firebase wrappers (`firebase.ts`, `firebaseNative.ts`, `firebaseWeb.ts`), family service wrappers, analytics service wrappers, on-device ML pipeline (`ondevice/`), cloud fallback analyzer (`scamAnalyzer.ts`)
- Depends on: Firebase SDKs, Google Gemini API, TFLite runtime, ML Kit OCR
- Used by: Context layer and screens

**On-Device ML Sub-Layer:**
- Purpose: Complete privacy-preserving scam inference pipeline
- Location: `canaryapp/services/ondevice/`
- Contains: Orchestrator (`OnDeviceScamAnalyzer.ts`), model loader (`ModelLoaderService.ts`), OCR (`OCRService.ts`), visual classifier (`VisualClassifierService.ts`), text classifier (`TextClassifierService.ts`), tokenizer (`TextTokenizer.ts`), score fusion (`FusionEngine.ts`), types (`types.ts`), barrel export (`index.ts`)
- Depends on: `react-native-fast-tflite`, `@react-native-ml-kit/text-recognition`, `expo-asset`, `expo-file-system`
- Used by: `useScanner` hook and the Home screen directly

## Data Flow

**On-Device Scam Analysis (primary path):**

1. User picks image via `ImagePicker` in `canaryapp/app/(tabs)/index.tsx`
2. `analyzeImageOnDevice(uri)` calls `canaryapp/services/ondevice/OnDeviceScamAnalyzer.ts#analyzeImage()`
3. Orchestrator runs two tasks in parallel via `Promise.all`:
   - Visual: `VisualClassifierService.classify(uri)` (only if visual model loaded; currently placeholder pixel extraction)
   - OCR + Text: `OCRService.extractText(uri)` → `TextClassifierService.classify(text)` (MobileBERT + heuristic patterns)
4. `FusionEngine.fuseResults(visualResult, textResult)` applies MAX fusion strategy to produce `OnDeviceAnalysisResult`
5. Result flows back to screen state (`setOnDeviceAnalysis`)
6. `recordScan(uid, isScam)` is called against analytics service to persist scan event to Firebase

**Cloud Fallback Analysis (demo path):**

1. `pickImage()` in Home screen picks image as base64
2. `analyzeImageForScam(base64)` in `canaryapp/services/scamAnalyzer.ts` calls Gemini 2.5 Flash
3. Structured output (`ScamAnalysisResult`) rendered in UI

**Authentication Flow:**

1. `AuthContext` subscribes to Firebase auth state via `subscribeToAuthState()` on mount
2. `app/_layout.tsx` (`RootLayoutNav`) reads `isAuthenticated` from `useAuth()` and uses `useSegments` + `router.replace` to enforce route guards
3. Unauthenticated users are redirected to `/(auth)/login`; authenticated users in auth group are pushed to `/(tabs)`

**Family Data Flow:**

1. `FamilyContext` depends on `AuthContext` — reads `userData.familyId` to know which family to load
2. `getFamilyData` + `getFamilyMembers` are fetched in parallel on `familyId` change
3. Context exposes typed action methods (`createFamily`, `joinFamily`, `removeMember`, etc.) that call familyService then refresh context state

**State Management:**
- No external state library (Redux, Zustand, MobX); all state lives in React Context (`useState` + `useEffect`) and component-local state
- ML pipeline state is managed by `useScanner` hook as a finite state machine with `ScanState` enum (`IDLE → LOADING_MODEL → SCANNING → SAFE | SUSPICIOUS | DANGER | ERROR`)

## Key Abstractions

**Platform-Agnostic Service Wrapper:**
- Purpose: Allow the same import path to resolve to the correct Firebase SDK for web vs. native
- Examples: `canaryapp/services/firebase.ts`, `canaryapp/services/familyService.ts`, `canaryapp/services/analyticsService.ts`
- Pattern: `Platform.select({ web: () => require('./fooWeb'), default: () => require('./fooNative') })()`; re-exports all symbols from the selected implementation

**OnDeviceScamAnalyzer (Orchestrator):**
- Purpose: Single public API for the on-device ML pipeline; manages initialization, mode detection (full vs. text-only), and delegates to sub-services
- Examples: `canaryapp/services/ondevice/OnDeviceScamAnalyzer.ts`
- Pattern: Module-level singleton state (`isInitialized`, `isTextOnlyMode`); all public functions exported individually; barrel re-exported through `index.ts`

**FusionEngine:**
- Purpose: Combine multi-modal signals (visual + text) into a single `OnDeviceAnalysisResult`
- Location: `canaryapp/services/ondevice/FusionEngine.ts`
- Pattern: MAX fusion by default (OR logic — either signal can trigger scam detection); weighted fusion variant available (`fuseResultsWeighted`)

**React Context Providers:**
- Purpose: Domain-scoped shared state accessible anywhere in the component tree
- Examples: `canaryapp/contexts/AuthContext.tsx`, `canaryapp/contexts/FamilyContext.tsx`
- Pattern: `createContext` + `useContext` hook + guard error; provider wraps navigator tree in `app/_layout.tsx`

## Entry Points

**Root Layout:**
- Location: `canaryapp/app/_layout.tsx`
- Triggers: Expo Router bootstraps this as the root shell
- Responsibilities: Wraps tree in `AuthProvider` + `FamilyProvider`; implements auth-based route guards using `useSegments` + `router.replace`

**Home Screen:**
- Location: `canaryapp/app/(tabs)/index.tsx`
- Triggers: Default tab on app launch
- Responsibilities: Primary user-facing scan UI; initializes on-device analyzer on mount; routes to both on-device and cloud analysis paths

**Scanner Screen:**
- Location: `canaryapp/app/scanner.tsx`
- Triggers: Navigation from another screen
- Responsibilities: Simplified scan UI backed by `useScanner` hook; delegates all ML logic to the hook

## Analysis Modes

**On-Device Full Mode:** Both `mobilebert_scam_intent.tflite` (text) and `mobilenet_v3_scam_detect.tflite` (visual) loaded. Visual model currently not bundled (placeholder pixel extraction in `VisualClassifierService`).

**On-Device Text-Only Mode:** Only text model loaded. OCR extracts text, MobileBERT classifies it. This is the active production mode.

**Cloud Fallback Mode:** Gemini 2.5 Flash API via `canaryapp/services/scamAnalyzer.ts`. Requires `GOOGLE_GENERATIVE_AI_API_KEY`. Intended as demo only per project conventions.

## Error Handling

**Strategy:** Throw errors up to calling layer; screens catch and show `Alert.alert`. On-device pipeline errors set `ScanState.ERROR` in `useScanner`.

**Patterns:**
- Text model failure throws (required); visual model failure returns `null` and activates text-only mode (optional)
- Firebase errors logged to console; auth errors surface via context state (`loading: false`, `isAuthenticated: false`)
- Analytics errors are caught and suppressed to avoid blocking auth flow

## Cross-Cutting Concerns

**Logging:** `console.log` with `[ServiceName]` prefix namespacing (e.g., `[OnDeviceAnalyzer]`, `[ModelLoader]`, `[OCRService]`)
**Validation:** Input validation at service entry points (empty text checks, platform checks via `Platform.OS`)
**Authentication:** Enforced in `app/_layout.tsx` via segment-based route guards; not enforced at service level
**Platform Gating:** `Platform.OS !== 'web'` checks gate all on-device ML features; services return graceful no-ops on web

## Gaps / Unknowns

- `VisualClassifierService.preprocessImage()` uses a placeholder `Float32Array` of `0.5` values — real pixel extraction is not yet implemented; visual model is not bundled in `assets/models/`
- `ModelLoaderService` SHA-256 hash verification is stubbed (`verifyModelIntegrity` always returns `true`)
- `canaryapp/app/auth/login.tsx` and `canaryapp/app/auth/register.tsx` exist alongside `app/(auth)/login.tsx` and `app/(auth)/register.tsx` — unclear which are active routes vs. dead code
- `ScanService.ts` uses dummy `Float32Array` input — appears to be an older prototype not wired into current flows
- No offline queue for analytics `recordScan` calls; failed calls are silently dropped
