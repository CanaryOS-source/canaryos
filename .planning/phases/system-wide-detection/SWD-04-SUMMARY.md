---
phase: system-wide-detection
plan: 04
subsystem: native-module
tags: [overlay, notification, warning-ui, accessibility-service, android, kotlin, haptic, animation]

requires:
  - phase: system-wide-detection
    plan: 03
    provides: CanaryAccessibilityService detection pipeline, ClassificationResult, DetectionStats

provides:
  - System overlay warning (TYPE_APPLICATION_OVERLAY) with theme-matching layout
  - OverlayManager with show/dismiss/auto-dismiss/rate-limit/animation/haptic
  - NotificationHelper fallback with heads-up display and dedup
  - ic_shield_warning vector drawable for notifications
  - Full alert pipeline wired into CanaryAccessibilityService

affects: [SWD-05 settings/onboarding UI, future per-app sensitivity config]

tech-stack:
  added: [androidx.core NotificationCompat]
  patterns: [overlay-with-notification-fallback, rate-limited-alerts, content-hash-dedup, main-thread-ui-posting]

key-files:
  created:
    - canaryapp/modules/canary-shield/android/src/main/res/layout/scam_warning_overlay.xml
    - canaryapp/modules/canary-shield/android/src/main/res/drawable/ic_shield_warning.xml
    - canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/OverlayManager.kt
    - canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/NotificationHelper.kt
  modified:
    - canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/CanaryAccessibilityService.kt

key-decisions:
  - "OverlayManager receives NotificationHelper via constructor for clean fallback delegation"
  - "Rate-limit and dedup are separate concerns: OverlayManager rate-limits at 10s, NotificationHelper deduplicates by content hash at 30s"
  - "Haptic feedback uses VibratorManager on Android 12+ with legacy Vibrator fallback"
  - "Overlay destroyed before executor shutdown in onDestroy to prevent BadTokenException from in-flight posts"

duration: 3min
completed: 2026-04-07
---

# Plan SWD-04: System Overlay Warning + Notification Fallback Summary

**TYPE_APPLICATION_OVERLAY scam warning with Alert Red/Charcoal Black/Canary Yellow theme, slide animations, 8s auto-dismiss with countdown, 10s rate-limiting, haptic feedback, and heads-up notification fallback with 30s content-hash dedup**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-07T03:35:37Z
- **Completed:** 2026-04-07T03:38:21Z
- **Tasks:** 4
- **Files created:** 4
- **Files modified:** 1

## Accomplishments

- Overlay layout (scam_warning_overlay.xml): Alert Red header with dismiss X, Charcoal Black body with confidence text, Canary Yellow dismiss button, Trust Blue "Open CanaryOS" button, countdown progress bar
- Shield warning vector drawable (ic_shield_warning.xml): outline shield with exclamation mark in Alert Red
- OverlayManager (279 lines): TYPE_APPLICATION_OVERLAY with FLAG_NOT_FOCUSABLE | FLAG_NOT_TOUCH_MODAL, slide-down entrance (200ms, DecelerateInterpolator), slide-up exit (150ms, AccelerateInterpolator), auto-dismiss with ObjectAnimator countdown (8s default from SharedPreferences), rate-limit 1 per 10s, haptic 100ms vibration, BadTokenException catch, notification fallback
- NotificationHelper (126 lines): IMPORTANCE_HIGH channel "canary_scam_alerts" for heads-up display, content hash dedup within 30s window, tap opens app with detection extras, Alert Red accent color, auto-cancel
- CanaryAccessibilityService wired: initializes both in onServiceConnected(), posts showWarning() to main thread from executor after scam detection, destroys overlay before executor shutdown in onDestroy()

## Task Commits

1. **Task 1: Overlay layout + icon** - `d5e1af3` (feat)
2. **Task 2: OverlayManager** - `714de63` (feat)
3. **Task 3: NotificationHelper** - `92583f6` (feat)
4. **Task 4: Wire into service** - `9e0e309` (feat)

## Decisions Made

- **Constructor injection for fallback:** OverlayManager takes NotificationHelper as a constructor parameter rather than creating it internally. This keeps fallback logic clean and testable.
- **Separate rate-limit vs dedup:** OverlayManager enforces a 10-second cooldown between any overlay shows (regardless of content). NotificationHelper deduplicates by content hash within 30 seconds. These are complementary: rate-limit prevents alert fatigue, dedup prevents redundant notifications for the same detection.
- **Haptic with version branching:** Android 12+ requires VibratorManager; older versions use the deprecated Vibrator service. Both paths are handled with try/catch fallback if vibration hardware is unavailable.
- **Overlay cleanup ordering:** In onDestroy(), the overlay is destroyed before the executor is shut down. This prevents a race where an in-flight executor task could try to post to a destroyed overlay view.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all components are complete implementations.

## Next Phase Readiness

- SWD-05 can build settings/onboarding UI; the full detection-to-alert pipeline is now operational
- End-to-end flow: accessibility event -> text extraction -> dedup -> background classification -> main-thread overlay (or notification fallback) -> user sees warning
- All bridge functions from SWD-03 remain operational for SWD-05 settings screens
