# Codebase Structure

_Last updated: 2026-04-01_

## Overview

The repository is split into two top-level workspaces: `canaryapp/` (the React Native / Expo mobile app) and `research/` (Python ML research). These are intentionally isolated — research outputs (`.tflite` model files) are copied into `canaryapp/assets/models/` for production deployment. A shared `.venv` at the repo root serves the Python research environment.

## Directory Layout

```
canaryos/
├── canaryapp/                  # React Native / Expo mobile application
│   ├── app/                    # Expo Router file-based screens
│   │   ├── _layout.tsx         # Root navigator shell; wraps context providers
│   │   ├── (auth)/             # Auth group: login, register (unauthenticated)
│   │   │   ├── _layout.tsx
│   │   │   ├── login.tsx
│   │   │   └── register.tsx
│   │   ├── (tabs)/             # Main tab navigator (authenticated)
│   │   │   ├── _layout.tsx     # Tab bar config (Home, Info, Family, Settings)
│   │   │   ├── index.tsx       # Home screen — primary scan UI
│   │   │   ├── explore.tsx     # Info/Education tab
│   │   │   ├── family.tsx      # Family management tab
│   │   │   └── settings.tsx    # Settings tab
│   │   ├── family/             # Deep-linked family screens
│   │   │   ├── _layout.tsx
│   │   │   ├── join/[code].tsx # Join family by invite code (dynamic route)
│   │   │   └── member/[userId].tsx  # Family member detail (dynamic route)
│   │   ├── auth/               # Duplicate auth screens (legacy/dead code — see Gaps)
│   │   │   ├── login.tsx
│   │   │   └── register.tsx
│   │   ├── scanner.tsx         # Standalone scanner screen (uses useScanner hook)
│   │   └── modal.tsx           # Generic modal presentation
│   ├── assets/
│   │   ├── images/             # App icons, splash screens
│   │   └── models/             # Bundled TFLite models + vocab (production)
│   │       ├── mobilebert_scam_intent.tflite   # Required text model
│   │       ├── vocab.txt                        # BERT vocabulary (30522 tokens)
│   │       └── README.md
│   ├── components/             # Reusable UI components
│   │   ├── external-link.tsx
│   │   ├── haptic-tab.tsx      # Tab bar button with haptic feedback
│   │   ├── hello-wave.tsx
│   │   ├── parallax-scroll-view.tsx
│   │   ├── themed-text.tsx     # Theme-aware text wrapper
│   │   ├── themed-view.tsx     # Theme-aware view wrapper
│   │   └── ui/
│   │       ├── collapsible.tsx
│   │       ├── icon-symbol.tsx         # Cross-platform icon (default/Android)
│   │       └── icon-symbol.ios.tsx     # iOS-specific SF Symbols icon
│   ├── config/
│   │   └── firebase.ts         # Firebase app initialization (not the service wrapper)
│   ├── constants/
│   │   └── theme.ts            # CanaryColors, Colors (light/dark), Fonts
│   ├── contexts/               # React Context providers for shared state
│   │   ├── AuthContext.tsx     # Auth state; wraps Firebase auth subscription
│   │   └── FamilyContext.tsx   # Family state; exposes CRUD actions
│   ├── hooks/                  # Custom React hooks
│   │   ├── use-color-scheme.ts         # System color scheme (native)
│   │   ├── use-color-scheme.web.ts     # System color scheme (web override)
│   │   ├── use-theme-color.ts          # Resolve theme color from Colors map
│   │   ├── useFamilyRole.ts            # Permission checks derived from FamilyContext
│   │   └── useScanner.ts               # ML pipeline state machine (IDLE→SCANNING→result)
│   ├── plugins/                # Expo config plugins (custom native config)
│   └── services/               # Platform-agnostic service wrappers + ML pipeline
│       ├── firebase.ts                 # Platform selector → firebaseNative | firebaseWeb
│       ├── firebaseNative.ts           # React Native Firebase SDK implementation
│       ├── firebaseWeb.ts              # Firebase JS SDK implementation
│       ├── familyService.ts            # Platform selector → familyServiceNative | familyServiceWeb
│       ├── familyServiceNative.ts
│       ├── familyServiceWeb.ts
│       ├── analyticsService.ts         # Platform selector → analyticsServiceNative | analyticsServiceWeb
│       ├── analyticsServiceNative.ts
│       ├── analyticsServiceWeb.ts
│       ├── ScanService.ts              # Legacy scan prototype (not wired into current flows)
│       ├── scamAnalyzer.ts             # Cloud Gemini API fallback (demo only)
│       └── ondevice/                   # On-device ML inference pipeline
│           ├── index.ts                # Barrel export (public API surface)
│           ├── types.ts                # All shared types + DEFAULT_MODEL_CONFIG
│           ├── OnDeviceScamAnalyzer.ts # Orchestrator: init, analyzeImage, analyzeText
│           ├── ModelLoaderService.ts   # TFLite model loading, caching, singleton management
│           ├── OCRService.ts           # Google ML Kit text recognition wrapper
│           ├── TextClassifierService.ts # MobileBERT inference + heuristic pattern detection
│           ├── TextTokenizer.ts        # BERT tokenizer (vocab.txt based)
│           ├── VisualClassifierService.ts # MobileNetV3 inference (placeholder pixel extraction)
│           └── FusionEngine.ts         # MAX fusion of visual + text scores → final result
├── research/                   # ML model research and training (Python)
│   ├── notebooks/              # Jupyter notebooks for model development
│   │   ├── mobilebert_scam_intent.ipynb     # MobileBERT fine-tuning pipeline
│   │   └── improved_scam_classifier.ipynb
│   ├── scripts/                # Model conversion and evaluation
│   │   ├── convert_onnx_to_tflite.py
│   │   └── test_tflite.py
│   ├── models/                 # Model output files (gitignored for large binaries)
│   │   └── canary_v3_int8.onnx
│   ├── data/                   # Training datasets (gitignored)
│   │   └── README.md
│   └── docs/                   # ML-specific documentation
│       ├── ONNX_TO_TFLITE_CONVERSION.md
│       └── VISUAL_CLASSIFIER_INTEGRATION.md
├── docs/                       # Project-level documentation
├── .planning/                  # GSD planning artifacts
│   └── codebase/               # Codebase analysis documents
├── .venv/                      # Shared Python virtualenv for research (gitignored)
└── CLAUDE.md                   # Project conventions for AI assistants
```

## Directory Purposes

**`canaryapp/app/`:**
- Purpose: Expo Router file-based screen definitions
- Contains: `.tsx` screen files and `_layout.tsx` navigator shells
- Key files: `_layout.tsx` (root shell with auth guards), `(tabs)/index.tsx` (home screen)
- Route groups use Expo Router conventions: `(auth)` and `(tabs)` are groups (not URL segments); `family/join/[code].tsx` and `family/member/[userId].tsx` are dynamic routes

**`canaryapp/services/ondevice/`:**
- Purpose: Self-contained on-device ML inference pipeline
- Contains: Orchestrator, model loading, OCR, text classification, visual classification, score fusion
- Key files: `index.ts` (public API), `OnDeviceScamAnalyzer.ts` (orchestrator), `types.ts` (all shared types)
- All privacy-sensitive processing stays in this directory — no network calls

**`canaryapp/services/` (top level):**
- Purpose: Firebase integration and platform-agnostic service wrappers
- Pattern: Each domain (firebase, family, analytics) has three files: `foo.ts` (selector), `fooNative.ts`, `fooWeb.ts`
- Key files: `scamAnalyzer.ts` (Gemini cloud fallback — demo only, not default path)

**`canaryapp/contexts/`:**
- Purpose: Application-wide React state management
- Key files: `AuthContext.tsx` (owns `user`, `userData`, `isAuthenticated`), `FamilyContext.tsx` (owns `family`, `members`, role derivations)

**`canaryapp/hooks/`:**
- Purpose: Reusable logic that components can subscribe to
- Key files: `useScanner.ts` (ML state machine, wraps `services/ondevice`), `useFamilyRole.ts` (permission queries over FamilyContext)

**`canaryapp/assets/models/`:**
- Purpose: Production TFLite model binaries and vocabulary shipped with the app bundle
- Key files: `mobilebert_scam_intent.tflite` (required, currently present), `vocab.txt` (BERT tokenizer vocab)
- `mobilenet_v3_scam_detect.tflite` not yet present — system runs in text-only mode without it

**`research/`:**
- Purpose: ML experimentation, model training, and conversion scripts
- Not imported by `canaryapp/` — outputs are manually copied to `canaryapp/assets/models/`
- Uses Python `.venv` at repo root; Jupyter notebooks for training

## Key File Locations

**Entry Points:**
- `canaryapp/app/_layout.tsx`: Root navigator shell; context providers and auth guards
- `canaryapp/app/(tabs)/index.tsx`: Primary user-facing screen

**Configuration:**
- `canaryapp/constants/theme.ts`: All colors (`CanaryColors`, `Colors`, `Fonts`)
- `canaryapp/config/firebase.ts`: Firebase app initialization

**Core ML Logic:**
- `canaryapp/services/ondevice/OnDeviceScamAnalyzer.ts`: Top-level ML orchestrator
- `canaryapp/services/ondevice/TextClassifierService.ts`: MobileBERT inference + heuristics
- `canaryapp/services/ondevice/FusionEngine.ts`: Score combination logic
- `canaryapp/services/ondevice/types.ts`: All shared type definitions and `DEFAULT_MODEL_CONFIG`

**Auth/Family State:**
- `canaryapp/contexts/AuthContext.tsx`
- `canaryapp/contexts/FamilyContext.tsx`

**Testing:**
- No test files found in `canaryapp/`
- `research/scripts/test_tflite.py`: Python TFLite model evaluation script

## Naming Conventions

**Files:**
- Screens: `kebab-case.tsx` (e.g., `external-link.tsx`, `haptic-tab.tsx`)
- Services: `camelCase.ts` with `Native`/`Web` suffix for platform variants (e.g., `familyServiceNative.ts`)
- Contexts: `PascalCase.tsx` (e.g., `AuthContext.tsx`)
- Hooks: `useCamelCase.ts` (e.g., `useScanner.ts`, `useFamilyRole.ts`)
- Types file: `types.ts` (flat in each domain directory)

**Directories:**
- Route groups: `(groupName)/` — parentheses are Expo Router convention for layout groups
- Dynamic routes: `[paramName].tsx` — bracket syntax for URL params
- Feature modules: `camelCase/` (e.g., `ondevice/`)

## Where to Add New Code

**New Screen:**
- Authenticated tab screen: `canaryapp/app/(tabs)/newscreen.tsx`; register in `canaryapp/app/(tabs)/_layout.tsx`
- Deep-linked screen: `canaryapp/app/newscreen.tsx` or `canaryapp/app/section/newscreen.tsx`; add `<Stack.Screen>` entry in `canaryapp/app/_layout.tsx`

**New Service (Firebase/backend):**
- Create three files: `canaryapp/services/fooService.ts` (selector), `canaryapp/services/fooServiceNative.ts`, `canaryapp/services/fooServiceWeb.ts`
- Follow the `Platform.select` pattern in `canaryapp/services/familyService.ts`

**New On-Device ML Feature:**
- Add implementation file to `canaryapp/services/ondevice/`
- Export public API in `canaryapp/services/ondevice/index.ts`
- Add types to `canaryapp/services/ondevice/types.ts`

**New Shared State:**
- Add a context to `canaryapp/contexts/`; wrap provider in `canaryapp/app/_layout.tsx`
- Or add a hook to `canaryapp/hooks/` if the state is component-local or derived from an existing context

**New Theme Color:**
- Add to `CanaryColors` in `canaryapp/constants/theme.ts`; extend `Colors.light` and `Colors.dark` entries

**New TFLite Model:**
- Place `.tflite` file in `canaryapp/assets/models/` (remove any old version first per project conventions)
- Register model config in `canaryapp/services/ondevice/types.ts` (`DEFAULT_MODEL_CONFIG`)
- Update loading logic in `canaryapp/services/ondevice/ModelLoaderService.ts`

**New Research Notebook:**
- Add to `research/notebooks/`; document outputs and conversion steps in `research/docs/`

## Special Directories

**`canaryapp/assets/models/`:**
- Purpose: Production ML model binaries and vocab
- Generated: Yes (from `research/` pipeline)
- Committed: Yes (small enough; large ONNX/raw model files are gitignored in `research/models/`)

**`canaryapp/.expo/`:**
- Purpose: Expo build cache and router type generation
- Generated: Yes
- Committed: Partial (`.expo/types/router.d.ts` for TypeScript support; cache directories ignored)

**`.venv/`:**
- Purpose: Python virtualenv for research notebooks and scripts
- Generated: Yes
- Committed: No (gitignored)

**`.planning/`:**
- Purpose: GSD planning and codebase analysis artifacts
- Generated: By GSD tooling
- Committed: Yes (planning context is tracked)

## Gaps / Unknowns

- `canaryapp/app/auth/login.tsx` and `canaryapp/app/auth/register.tsx` exist alongside `canaryapp/app/(auth)/login.tsx` and `canaryapp/app/(auth)/register.tsx` — the `app/auth/` versions appear to be unreferenced duplicates; the `(auth)` group versions are the active routes based on `_layout.tsx` configuration
- `canaryapp/services/ScanService.ts` is a legacy prototype using dummy input data; it is not imported by any current screen or hook and appears to be dead code
- `canaryapp/plugins/` directory exists but no plugin files were found in the TypeScript file listing — contents unknown
- No `__tests__/` directory or `*.test.ts` / `*.spec.ts` files exist in `canaryapp/`
