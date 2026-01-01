# Canary OS - AI Coding Agent Instructions

## Project Overview
Canary OS is a React Native/Expo scam detection app that analyzes screenshots, text, and voicemails for potential scams using Vercel AI SDK (Google Gemini). The app features family protection groups, Firebase authentication, and plans for on-device ML with floating overlay functionality.

## Architecture

### Platform-Agnostic Service Pattern
Services use a **platform-switching wrapper pattern**. Always maintain this structure:
```typescript
// services/firebase.ts (wrapper)
import { Platform } from 'react-native';
const firebaseService = Platform.select({
  web: () => require('./firebaseWeb'),
  default: () => require('./firebaseNative'),
})();
export const { createAccount, signIn, ... } = firebaseService;
```
- Create separate `*Native.ts` (React Native Firebase) and `*Web.ts` (Firebase JS SDK) implementations
- See: [familyService.ts](canaryapp/services/familyService.ts), [analyticsService.ts](canaryapp/services/analyticsService.ts)

### Context Providers (Root Layout)
Auth and Family contexts wrap the app in [app/_layout.tsx](canaryapp/app/_layout.tsx):
- `AuthContext` handles auth state, `userData`, and auto-redirects
- `FamilyContext` manages family groups (admin/member roles, invite codes)
- Always access user data via `useAuth()` and family data via `useFamily()`

### Scam Analysis (Core Feature)
The [scamAnalyzer.ts](canaryapp/services/scamAnalyzer.ts) service uses:
- `@ai-sdk/google` with `gemini-2.5-flash` model
- Zod schemas for structured output (`ScamAnalysisResult`)
- Three analysis types: `analyzeImageForScam`, `analyzeTextForScam`, `analyzeAudioForScam`
- API key via `Constants.expoConfig.extra.googleApiKey` (from env)

## Key Conventions

### Theme & Colors
Use the defined palette from [constants/theme.ts](canaryapp/constants/theme.ts):
```typescript
import { Colors, CanaryColors } from '@/constants/theme';
const colorScheme = useColorScheme();
const colors = Colors[colorScheme ?? 'light'];
```
- Primary: `#FFD300` (Canary Yellow)
- Alert: `#E63946` (scam warnings)
- Trust: `#0077B6` (safe content)

### UI Principles
- **No clutter**: Avoid fancy gradients, minimize emojis/icons
- **One-click done**: Core features immediately accessible
- Dark mode support via `useColorScheme()` hook

### File Routing (Expo Router)
- `(auth)/` - Login/register screens (protected when authenticated)
- `(tabs)/` - Main tab navigation (protected when unauthenticated)
- `family/` - Family management screens
- Route guards in `_layout.tsx` handle auth redirects automatically

## Firebase Integration

### Firestore Collections
- `users/{userId}` - User profile with `familyId` reference
- `families/{familyId}` - Family with `adminId`, `inviteCode`, `memberIds`
- `families/{familyId}/members/{memberId}` - Member subcollection
- Security rules enforce owner-only access patterns in [firestore.rules](firestore.rules)

### Native vs Web Firebase
- **Native** (Android/iOS): `@react-native-firebase/*` packages
- **Web**: Standard `firebase` JS SDK
- Google Sign-In configured with `GOOGLE_WEB_CLIENT_ID` from [config/firebase.ts](canaryapp/config/firebase.ts)

## Development Commands

```bash
cd canaryapp
npm install          # Install dependencies
npm run android      # Run on Android (requires dev build)
npm run ios          # Run on iOS
npm run web          # Run web version
npm run lint         # ESLint check
```

### Environment Variables
Set `GOOGLE_GENERATIVE_AI_API_KEY` for scam analysis to work.

## Planned Features (Do Not Implement Without Discussion)
- **Floating Scanner**: Native module in [modules/floating-scanner/](canaryapp/modules/floating-scanner/) for overlay functionality
- **On-Device ML**: TFLite integration planned (see [ON-DEVICE_MODEL_IMPLEMENTATION_RESEARCH.md](ON-DEVICE_MODEL_IMPLEMENTATION_RESEARCH.md))
- **Phase 2+**: Background overlay, community blacklists, voice/SMS analysis

## Code Patterns to Follow
1. Use `@/` path alias for imports (configured in tsconfig)
2. Track scans with `recordScan(userId, isScam)` from analyticsService
3. Handle loading states with `ActivityIndicator` and proper UX feedback
4. Always use `try/catch` with user-friendly `Alert.alert()` for errors
