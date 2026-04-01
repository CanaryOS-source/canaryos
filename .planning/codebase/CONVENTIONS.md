# Coding Conventions

_Last updated: 2026-04-01_

## Overview

CanaryOS uses TypeScript throughout the React Native/Expo app (`canaryapp/`). Strict mode is enabled. The codebase uses a clean, functional style with named exports from services and default exports from screen components. No test runner or formatter config (Prettier) is present — style is enforced only via ESLint with the `eslint-config-expo` flat config.

---

## TypeScript Usage

**Config:** `canaryapp/tsconfig.json` extends `expo/tsconfig.base` with `"strict": true`.

**Path alias:** `@/*` maps to `canaryapp/*` — use for all cross-directory imports.
```ts
import { useAuth } from '@/contexts/AuthContext';
import { Colors, CanaryColors } from '@/constants/theme';
```

**Type definitions:** All public service APIs have typed interfaces in dedicated `types.ts` files.
- On-device types: `canaryapp/services/ondevice/types.ts`
- Firebase user data typed via `UserData` interface in `canaryapp/services/firebase.ts`

**`any` usage pattern:** `error: any` is used widely in catch blocks across service files (not `unknown`). This is an established pattern throughout the codebase:
```ts
} catch (error: any) {
  console.error('...', error);
}
```

**Enums:** Used for finite sets of string values. Examples:
- `VisualCategory` enum in `canaryapp/services/ondevice/types.ts`
- `ScamPatternType` enum in `canaryapp/services/ondevice/types.ts`
- `ScanState` enum in `canaryapp/hooks/useScanner.ts`

**Interfaces over types:** All data shapes use `interface` declarations. Type aliases are used only for unions or utility types.

---

## Naming Patterns

**Files:**
- Screen/route files: `kebab-case.tsx` or `camelCase.tsx` (mixed — `index.tsx`, `login.tsx`, `settings.tsx`)
- Service files: `camelCase.ts` — wrapper uses plain name, implementations append platform suffix
  - `familyService.ts` (wrapper), `familyServiceNative.ts`, `familyServiceWeb.ts`
- Hook files: `use-kebab-case.ts` for theme/color hooks, `useCamelCase.ts` for feature hooks
  - `use-color-scheme.ts`, `use-theme-color.ts`, `useScanner.ts`, `useFamilyRole.ts`
- Component files: `kebab-case.tsx` (e.g., `themed-text.tsx`, `haptic-tab.tsx`, `external-link.tsx`)
- Platform variant files: append `.ios.tsx` or `.web.ts` suffix (e.g., `icon-symbol.ios.tsx`, `use-color-scheme.web.ts`)
- Service class files (on-device): `PascalCase.ts` (e.g., `ModelLoaderService.ts`, `FusionEngine.ts`, `TextTokenizer.ts`)

**Functions and variables:**
- All functions and variables: `camelCase`
- React component functions: `PascalCase` (default export from screen/component files)
- Constants at module scope: `SCREAMING_SNAKE_CASE` (e.g., `DEFAULT_MODEL_CONFIG`, `LOW_THRESHOLD`)

**Types and interfaces:** `PascalCase` (e.g., `ModelConfig`, `OnDeviceAnalysisResult`, `AuthContextType`)

---

## Import Organization

**Order observed in source files:**
1. React and React Native core imports
2. Expo library imports
3. Third-party packages
4. Internal `@/` path alias imports (services, contexts, constants, hooks)
5. Relative imports (sibling files within same module)

**Example from `canaryapp/app/(tabs)/index.tsx`:**
```ts
import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, ... } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { analyzeImageForScam, ... } from '@/services/scamAnalyzer';
import { Colors, CanaryColors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
```

**Module barrel files:** `canaryapp/services/ondevice/index.ts` re-exports the full on-device API. Service sub-modules are also re-exported as namespaced objects:
```ts
export * as FusionEngine from './FusionEngine';
export * as Tokenizer from './TextTokenizer';
```

---

## Component Patterns

**Screen components (Expo Router):** Default-exported function components. All state, effects, and handlers defined in the function body. `StyleSheet.create()` at the bottom of the file.
```ts
export default function HomeScreen() {
  const [state, setState] = useState(...);
  // ...handlers...
  return (...JSX...);
}
const styles = StyleSheet.create({ ... });
```

**Reusable components:** Named exports. Accept typed props extending React Native base types. Theme color pulled via `useThemeColor` hook.
```ts
export type ThemedTextProps = TextProps & { lightColor?: string; darkColor?: string; };
export function ThemedText({ style, lightColor, darkColor, ...rest }: ThemedTextProps) { ... }
```

**Contexts:** Defined with `createContext` and a typed interface. Provider is a `React.FC`. Custom `useX` hook validates context presence:
```ts
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
```

**Custom hooks:** Named exports. Return a plain object with state values and action functions. Internal state managed with `useState`, side effects with `useEffect`, stable callbacks with `useCallback`.

---

## Platform-Agnostic Service Pattern

Services that require different implementations for native vs. web use a 3-file pattern:

| File | Role |
|------|------|
| `serviceNameService.ts` | Wrapper — selects implementation via `Platform.select` |
| `serviceNameServiceNative.ts` | React Native Firebase SDK implementation |
| `serviceNameServiceWeb.ts` | Firebase JS SDK implementation |

Wrapper pattern:
```ts
const familyService = Platform.select({
  web: () => require('./familyServiceWeb'),
  default: () => require('./familyServiceNative'),
})();
export const { createFamily, getFamilyData, ... } = familyService;
```

---

## Service Module Structure (On-Device ML)

The `canaryapp/services/ondevice/` directory uses a module-level singleton pattern. Each service maintains a private singleton (e.g., `let model: TensorflowModel | null = null`) and exports named functions. No classes are used in this layer — pure functional module exports.

---

## Error Handling

**Pattern:** `try/catch` blocks in all async service functions. Errors are caught, logged via `console.error`, and re-thrown or returned as nulls depending on context. Error objects typed as `error: any` in catch clauses.

**UI errors:** Surface to user via `Alert.alert(...)` in screen components. Never swallow errors silently in UI code.

**Initialization guards:** Services throw descriptive errors when called before initialization:
```ts
if (!isInitialized || !isTextModelReady()) {
  throw new Error('On-device analyzer not initialized. Call initialize() first.');
}
```

---

## Logging

**Framework:** `console.log`, `console.warn`, `console.error` — no structured logging library.

**Prefix convention:** All service logs are prefixed with `[ServiceName]` in brackets:
```ts
console.log('[OnDeviceAnalyzer] Initializing...');
console.error('[HomeScreen] On-device initialization failed:', error);
```

---

## Comments

**Module-level JSDoc:** All service files open with a `/** ... */` block describing purpose, operation modes, and important constraints. Parameter `@param` annotations on complex public functions.

**Inline comments:** Used to explain non-obvious logic (e.g., ML inference steps, weight normalization, threshold meanings). Comments use plain language, no emoji.

---

## Theme Usage

**Import:** Always import from `@/constants/theme`.

**Color tokens:**
```ts
import { Colors, CanaryColors } from '@/constants/theme';
const colors = Colors[colorScheme ?? 'light']; // use dynamic colors
CanaryColors.primary  // #FFD300 - direct use for non-themeable elements
```

**No gradients, no emoji in UI.** Minimal icon use per design guidelines in `CLAUDE.md`.

---

## Linting

**Config:** `canaryapp/eslint.config.js` uses `eslint-config-expo` flat config. Only `dist/*` is excluded.

**No Prettier config detected.** Formatting is not enforced programmatically beyond ESLint.

**Lint command:** `npm run lint` runs `expo lint` from `canaryapp/`.

---

## Gaps / Unknowns

- No Prettier or Biome config found — exact formatting rules (quote style, trailing comma, semicolons) are inferred from reading source but not formally enforced
- `canaryapp/services/scamAnalyzer.ts` (Gemini/cloud path) not read — conventions there may differ
- No barrel files under `components/` — unclear if one should be added when creating new components
- `canaryapp/services/ScanService.ts` appears to be an older integration test stub (dummy inference input) — its conventions may not apply to new code
