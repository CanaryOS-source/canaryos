# Testing Patterns

_Last updated: 2026-04-01_

## Overview

There are no project-level test files in CanaryOS. No test runner configuration exists in `canaryapp/` (no `jest.config.*`, `vitest.config.*`, or equivalent). The `package.json` has no `test` script. All test files found in the codebase belong to `node_modules/` (e.g., from the `zod` package). Testing is currently absent at every level — unit, integration, and E2E.

---

## Test Framework

**Runner:** Not configured.

**Assertion Library:** Not configured.

**Run Commands:**
```bash
# No test command exists. package.json scripts:
# start, reset-project, android, ios, web, lint
```

**Lint command (closest to quality gate):**
```bash
cd canaryapp && npm run lint  # runs: expo lint
```

---

## Test File Organization

**Location:** No test files exist outside `node_modules/`.

**Naming:** No established pattern.

**Structure:** No established pattern.

---

## What Is Currently Tested

Nothing. There are no automated tests of any kind for the application code.

---

## What Is Not Tested (Full Coverage Gap)

### On-Device ML Pipeline (`canaryapp/services/ondevice/`)

Critical path with zero test coverage:

- `FusionEngine.ts` — score fusion logic (`fuseResults`, `fuseResultsWeighted`, threshold calculations)
- `TextClassifierService.ts` — MobileBERT inference wrapper and `quickScamCheck` heuristics
- `VisualClassifierService.ts` — MobileNetV3 inference wrapper and `getVisualRiskScore`
- `TextTokenizer.ts` — vocabulary loading and BERT tokenization
- `ModelLoaderService.ts` — model lifecycle (load, unload, state management)
- `OCRService.ts` — text extraction and `normalizeText`
- `OnDeviceScamAnalyzer.ts` — orchestration of the full analysis pipeline

### Service Layer

- `canaryapp/services/familyServiceNative.ts` — Firestore family CRUD
- `canaryapp/services/familyServiceWeb.ts` — Firebase JS SDK family CRUD
- `canaryapp/services/firebase.ts` / `firebaseNative.ts` / `firebaseWeb.ts` — auth and user data
- `canaryapp/services/analyticsService.ts` / `analyticsServiceNative.ts` / `analyticsServiceWeb.ts`
- `canaryapp/services/scamAnalyzer.ts` — Gemini cloud analysis fallback
- `canaryapp/services/ScanService.ts` — TFLite model loading stub

### Hooks

- `canaryapp/hooks/useScanner.ts` — ScanState transitions, `scanImage`, `scanText`
- `canaryapp/hooks/useFamilyRole.ts`

### Contexts

- `canaryapp/contexts/AuthContext.tsx` — authentication state, redirect logic
- `canaryapp/contexts/FamilyContext.tsx`

### UI/Screens

- All screens under `canaryapp/app/` have no rendering or interaction tests

---

## Manual / Debug Testing

The only testing mechanism present is a **debug UI panel** embedded directly in the home screen (`canaryapp/app/(tabs)/index.tsx`, lines 452–522). It appears when `Platform.OS !== 'web'` and `isOnDeviceReady` is true. It allows:

- Entering raw text input
- Calling `classifyWithModel(debugText)` directly
- Displaying the raw risk score (0–1) from the MobileBERT model

This is dev-only debug tooling, not automated testing, and is currently shipped in the production build.

---

## CI/CD

No CI pipeline detected. No `.github/workflows/` directory exists.

---

## Recommended Test Approach (When Adding Tests)

Based on the tech stack (React Native + Expo), appropriate choices would be:

**Unit / Integration:**
- Jest with `jest-expo` preset (standard for Expo projects)
- Config file: `jest.config.js` at `canaryapp/` root
- Preset: `jest-expo` handles Metro resolver and platform mocking

**Component rendering:**
- `@testing-library/react-native`

**E2E:**
- Detox (for native device testing) or Maestro (simpler YAML-based flows)

**Suggested test script to add to `canaryapp/package.json`:**
```json
"test": "jest --watchAll=false",
"test:coverage": "jest --coverage"
```

---

## Priority Test Areas

Given the project's core value proposition (scam detection accuracy), these areas carry the highest risk if untested:

1. **`FusionEngine.ts`** — Pure functions with no native dependencies. Highest value, easiest to test. Threshold logic (`LOW_THRESHOLD`, `MEDIUM_THRESHOLD`) directly determines user-facing risk classifications.

2. **`quickScamCheck` in `TextClassifierService.ts`** — Heuristic pattern matching that runs without the ML model. Pure logic, testable without mocks.

3. **`useScanner.ts`** — State machine transitions (IDLE → LOADING_MODEL → SCANNING → SAFE/DANGER/ERROR) are critical for UI correctness.

4. **`AuthContext.tsx`** — Authentication gate and redirect logic controls all app access.

5. **`normalizeText` in `OCRService.ts`** — Text preprocessing directly affects model input quality.

---

## Gaps / Unknowns

- No decision has been made on test framework — `jest-expo` is the conventional choice for this stack but nothing is configured
- The debug UI panel in `index.tsx` suggests the team uses manual device testing as the primary QA method
- Research notebooks in `canaryos/research/notebooks/` contain model evaluation code (Python/Jupyter) but this is separate from app testing
- No mocking strategy defined for Firebase or TFLite native modules
