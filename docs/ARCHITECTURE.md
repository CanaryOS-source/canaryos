# CanaryOS Architecture

## System Overview

CanaryOS is a React Native (Expo) mobile app with two analysis paths:

1. **On-device ML pipeline** (primary) — TFLite models for text and visual classification
2. **Cloud fallback** (demo only) — Vercel AI SDK with Google Gemini, kept as a discrete option

## App Layer

### Routing (Expo Router)
```
app/
├── _layout.tsx           # Root layout with AuthContext + FamilyContext providers
├── (auth)/               # Login/register screens (unauthenticated)
├── (tabs)/               # Main tab navigation (authenticated)
│   ├── index.tsx         # Home / scan screen
│   ├── explore.tsx       # Explore
│   ├── family.tsx        # Family management
│   └── settings.tsx      # App settings
├── scanner.tsx           # Screenshot analysis screen
├── modal.tsx             # Modal component
└── family/               # Family deep-link routes
```

### State Management
- `AuthContext` — Firebase Auth state, user data, auto-redirects
- `FamilyContext` — Family group management (create, join, roles, invite codes)

Access via `useAuth()` and `useFamily()` hooks.

## Service Layer

### Platform-Agnostic Pattern
Every cross-platform service follows a 3-file pattern:

```
services/
├── firebase.ts           # Wrapper: Platform.select({ web, default })
├── firebaseNative.ts     # React Native Firebase SDK implementation
└── firebaseWeb.ts        # Firebase JS SDK implementation
```

This pattern is used for: Firebase, Family Service, Analytics.

### On-Device ML Pipeline

```
services/ondevice/
├── OnDeviceScamAnalyzer.ts    # Orchestrator — coordinates the full pipeline
├── ModelLoaderService.ts      # Loads/caches TFLite models from bundled assets
├── OCRService.ts              # Text extraction via ML Kit
├── TextClassifierService.ts   # NLP classification (MobileBERT)
├── TextTokenizer.ts           # WordPiece tokenization for BERT models
├── VisualClassifierService.ts # Visual classification (scaffolded, no model yet)
├── FusionEngine.ts            # Combines text + visual signals into risk score
├── types.ts                   # Shared type definitions
└── index.ts                   # Public exports
```

**Pipeline flow:**
1. `OnDeviceScamAnalyzer` receives an image
2. `OCRService` extracts text blocks (with spatial data)
3. `TextTokenizer` converts text to token IDs (WordPiece)
4. `TextClassifierService` runs MobileBERT inference via TFLite
5. `VisualClassifierService` would run visual model (not yet active)
6. `FusionEngine` combines signals into final risk score

**Model loading:**
- Models are bundled in `assets/models/` and loaded via `expo-asset`
- `react-native-fast-tflite` provides JSI-based zero-copy inference
- Models are cached in the document directory after first load

### Cloud Analysis (Demo Fallback)
- `scamAnalyzer.ts` — Uses Vercel AI SDK with `@ai-sdk/google` (Gemini)
- Provides `analyzeImageForScam`, `analyzeTextForScam`, `analyzeAudioForScam`
- Uses Zod schemas for structured output
- **Not the default path** — exists only for demo/comparison purposes

## Firebase Backend

### Services Used
- **Firebase Auth** — Email/password + Google Sign-In
- **Firestore** — User profiles, family groups, scan history
- **Cloud Storage** — Model distribution (future)
- **Remote Config** — Model versioning, feature flags (future)

### Security Rules
- Users can only read/write their own documents
- Family data scoped by family group membership
- Rules defined in `canaryapp/firestore.rules`

## Data Flow

```
User taps "Scan" → Image selected → OnDeviceScamAnalyzer
                                          |
                              ┌───────────┼───────────┐
                              v           v           v
                           OCR      Visual Model   Heuristics
                              |           |           |
                              v           v           v
                         Text Model   (future)    Pattern Match
                              |           |           |
                              └───────────┼───────────┘
                                          v
                                    FusionEngine
                                          |
                                          v
                                    Risk Score → UI Display
```
