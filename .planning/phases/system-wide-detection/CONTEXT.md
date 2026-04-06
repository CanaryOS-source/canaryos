# System-Wide On-Device Scam Detection - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning
**Source:** User request (direct specification)

<domain>
## Phase Boundary

This phase delivers a system-wide, always-on scam detection system for Android that monitors screen content across ALL apps (not just within CanaryOS). When the user navigates to a new screen anywhere on their phone, the system extracts visible text, runs it through a lightweight TFLite scam classifier, and shows an overlay warning if a scam is detected.

**Scope:** Android only. iOS has no equivalent API for reading other apps' screen content.

**Relationship to v1.0 milestone:** This phase can be developed in parallel with the ML model development (Phases 1-6). The native integration layer uses the same model artifact (.tflite + vocab.txt) that Phase 6 produces. During development, a placeholder/mock model can be used.

</domain>

<decisions>
## Implementation Decisions

### Architecture
- Pure native Kotlin Accessibility Service for the detection pipeline (not JS-based)
- react-native-fast-tflite CANNOT run outside RN context (JSI dependency) -- must use native org.tensorflow:tensorflow-lite
- Expo local module (`canary-shield`) bridges native service to RN app for configuration
- RN app handles onboarding, permissions, settings UI only -- zero JS in the hot path

### Text Extraction Method
- Android Accessibility Service extracts text directly from the UI node tree (2-10ms)
- This REPLACES OCR for system-wide detection (OCR only needed for image-rendered text)
- Accessibility Service responds to TYPE_WINDOW_STATE_CHANGED events (page transitions)

### Performance
- Target: sub-200ms total pipeline, preferably sub-100ms
- Accessibility path enables sub-100ms on flagship/mid-range: text extraction (2-10ms) + tokenization (1-5ms) + inference (15-50ms) = 18-65ms typical
- Aggressive debouncing: 500ms minimum cooldown between classifications
- Hash-based content deduplication to skip unchanged screens
- Skip known-safe apps (launcher, dialer, camera, system settings)

### Battery
- Event-driven, not polling -- near-zero idle drain
- Estimated 2-5% additional battery per hour during active browsing
- Model cached in memory persistently (~10MB RAM)
- Rate-limited to max ~2 classifications per second

### Overlay Warning
- SYSTEM_ALERT_WINDOW with TYPE_APPLICATION_OVERLAY
- Theme: Alert Red header, Charcoal Black body, Canary Yellow dismiss, Trust Blue learn-more
- Auto-dismiss after 8 seconds or tap to dismiss
- Fallback to high-priority notification if overlay permission denied

### Permissions (ordered by friction)
1. POST_NOTIFICATIONS (runtime dialog)
2. SYSTEM_ALERT_WINDOW (Settings redirect)
3. ACCESSIBILITY_SERVICE (Settings redirect -- most sensitive)
4. BATTERY_OPTIMIZATION_EXEMPTION (optional)

### Distribution Risk
- Google Play Accessibility Service policy tightened Jan 2026
- Scam detection is NOT a traditional accessibility use case
- Must prepare sideload/direct APK as fallback distribution

### Claude's Discretion
- Exact debounce intervals and throttling strategy
- App package exclusion list (which apps to skip)
- Overlay animation and timing details
- SharedPreferences schema for config communication
- Error handling and service recovery patterns
- Model warm-up strategy on service start
- Whether to support NNAPI delegate (opt-in vs CPU-only default)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing ML Pipeline
- `canaryapp/services/ondevice/OnDeviceScamAnalyzer.ts` -- Current orchestrator pattern to maintain consistency with
- `canaryapp/services/ondevice/TextClassifierService.ts` -- JS text classification logic (heuristic + ML hybrid)
- `canaryapp/services/ondevice/TextTokenizer.ts` -- JS WordPiece tokenizer (Kotlin port must match output)
- `canaryapp/services/ondevice/types.ts` -- Shared type definitions

### App Configuration
- `canaryapp/app.config.js` -- Android permissions already declared (SYSTEM_ALERT_WINDOW, FOREGROUND_SERVICE, FOREGROUND_SERVICE_SPECIAL_USE, POST_NOTIFICATIONS)
- `canaryapp/android/app/src/main/java/com/canaryapp/MainActivity.kt` -- Current native entry point
- `canaryapp/android/app/src/main/java/com/canaryapp/MainApplication.kt` -- Current native app setup

### Research
- `.planning/phases/system-wide-detection/RESEARCH.md` -- Full technical research including architecture patterns, performance analysis, pitfalls, permission flow

### Project Constraints
- `CLAUDE.md` -- Theme colors, UI principles, no-emoji rule, overlay module removal note

</canonical_refs>

<specifics>
## Specific Ideas

- User requested flow: page switch -> screenshot -> OCR -> TFLite -> verdict -> overlay
- Research revealed Accessibility Service path is superior: page switch -> node tree text extraction -> TFLite -> verdict -> overlay (skips screenshot + OCR entirely)
- The same .tflite model file and vocab.txt are shared between in-app scanner and background service
- Tokenizer parity validation needed: JS TextTokenizer.ts output must match Kotlin BertTokenizer output
- Model is still being developed (v1.0 Phases 1-6) -- integration layer can use placeholder model during development

</specifics>

<deferred>
## Deferred Ideas

- iOS support (no equivalent API exists)
- Visual/image-based detection in background (would require MediaProjection -- battery killer)
- Cloud-based analysis for uncertain cases (violates on-device-only principle)
- Per-app sensitivity configuration (nice-to-have, not MVP)
- Detection history/analytics dashboard (can add later)
- Family notification when scam detected on child's device (requires family feature integration)

</deferred>

---

*Phase: system-wide-detection*
*Context gathered: 2026-04-04 via direct user specification + research*
