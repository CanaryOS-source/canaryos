# Plan SWD-04: System Overlay Warning + Notification Fallback

**Phase:** System-Wide On-Device Scam Detection
**Plan:** 4 of 6
**Goal:** Implement the scam warning overlay that appears on top of all apps when a scam is detected, with a notification fallback if overlay permission is denied.

**Depends on:** SWD-03 (Accessibility Service must be detecting scams and storing results)
**Estimated effort:** 1 session

---

## Context

When the Accessibility Service detects a scam, it needs to alert the user immediately. The primary mechanism is a system overlay (TYPE_APPLICATION_OVERLAY) that slides down from the top of the screen. If the user hasn't granted overlay permission, a high-priority notification is used instead.

**Design principles from CLAUDE.md:** No clutter, no gradients, minimal icons, no emojis. Theme: Alert Red (#E63946), Charcoal Black (#1C1C1C), Canary Yellow (#FFD300), Trust Blue (#0077B6).

---

## Tasks

### Task 1: Create Overlay Layout

**What:** Design the scam warning overlay as a native Android XML layout.

**File:** `canaryapp/modules/canary-shield/android/src/main/res/layout/scam_warning_overlay.xml`

**Design spec:**
```
┌──────────────────────────────────────────┐
│ Alert Red (#E63946) header bar           │
│   "Scam Warning"           [X] dismiss   │
├──────────────────────────────────────────┤
│ Charcoal Black (#1C1C1C) body            │
│                                           │
│ "This screen may contain a scam."        │
│ "{confidence}% detection confidence"      │
│                                           │
│ ┌──────────────┐  ┌──────────────────┐   │
│ │  Dismiss     │  │  Open CanaryOS   │   │
│ │  (#FFD300)   │  │  (#0077B6 text)  │   │
│ └──────────────┘  └──────────────────┘   │
└──────────────────────────────────────────┘
```

**Requirements:**
- Full-width, positioned at top of screen (Gravity.TOP)
- Height: WRAP_CONTENT (user can still interact with underlying app)
- Rounded bottom corners (12dp radius)
- Text: system font, white on dark background
- Dismiss button: Canary Yellow background, dark text
- "Open CanaryOS" button: Trust Blue text, no background
- Auto-dismiss countdown: thin progress bar at bottom of header (8 seconds)

**Acceptance:**
- Layout renders correctly on various screen sizes
- Meets theme requirements
- Readable, not cluttered

### Task 2: Implement OverlayManager

**What:** Kotlin class that manages showing and dismissing the system overlay.

**File:** `canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/OverlayManager.kt`

**Requirements:**
- `showWarning(result: ClassificationResult)` -- inflate layout, configure text, add to WindowManager
- `dismiss()` -- remove overlay from WindowManager with slide-up animation
- Auto-dismiss after 8 seconds (configurable via SharedPreferences `shield_autodismiss_seconds`)
- Only one overlay visible at a time (dismiss existing before showing new)
- Rate-limit warnings: maximum 1 warning per 10 seconds (prevent alert fatigue)
- WindowManager.LayoutParams: TYPE_APPLICATION_OVERLAY, FLAG_NOT_FOCUSABLE | FLAG_NOT_TOUCH_MODAL, TRANSLUCENT, Gravity.TOP, MATCH_PARENT width, WRAP_CONTENT height
- Tap dismiss button -> call `dismiss()`
- Tap "Open CanaryOS" -> launch app Intent with detection data as extras
- Check `Settings.canDrawOverlays(context)` before showing; fall back to notification
- All UI operations on main thread (Handler + Looper.getMainLooper)
- Slide-down entrance animation (200ms), slide-up exit animation (150ms)
- Haptic feedback on show (short vibration, 100ms)
- Catch `WindowManager$BadTokenException` -- if service is being destroyed, fail silently

**Acceptance:**
- Overlay appears on top of any app when scam detected
- Dismiss button works
- Auto-dismiss after 8 seconds
- Only one overlay at a time
- Rate-limited to 1 per 10 seconds
- Falls back to notification when overlay permission missing

### Task 3: Implement Notification Fallback

**What:** High-priority notification for when overlay permission is denied.

**File:** `canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/NotificationHelper.kt`

**Requirements:**
- Create notification channel on first use: "Scam Alerts", IMPORTANCE_HIGH
- Channel ID: `canary_scam_alerts`
- Notification: title "Scam Warning", body from classification result, Alert Red color, auto-cancel on tap
- Tap action: open CanaryOS app
- Heads-up display (IMPORTANCE_HIGH ensures this)
- Dedup: do not repeat notification for same content hash within 30 seconds
- Create simple shield vector drawable: `canaryapp/modules/canary-shield/android/src/main/res/drawable/ic_shield_warning.xml`

**Acceptance:**
- Notification appears with correct content
- Heads-up display works on Android 8+
- Tap opens the app
- No duplicate notifications within 30 seconds

### Task 4: Wire Overlay/Notification into Accessibility Service

**What:** Connect the OverlayManager and NotificationHelper to the service's detection results.

**Update:** `canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/CanaryAccessibilityService.kt`

**Add to `onServiceConnected()`:**
- Initialize OverlayManager
- Initialize NotificationHelper

**Add after classification (on background thread, post to main thread for overlay):**
```kotlin
if (result.isScam && result.confidence > threshold) {
    mainHandler.post {
        overlayManager.showWarning(result)  // internally falls back to notification
    }
    stats.incrementScamsDetected()
}
```

**Acceptance:**
- Scam detection triggers overlay (or notification fallback)
- Main thread used for overlay display
- Stats updated on detection

---

## Verification

- [ ] Overlay appears on top of other apps when scam detected
- [ ] Overlay matches theme (Alert Red, Charcoal Black, Canary Yellow, Trust Blue)
- [ ] Dismiss button works
- [ ] Auto-dismiss after 8 seconds
- [ ] "Open CanaryOS" opens the app
- [ ] Rate-limiting prevents alert fatigue (max 1 per 10s)
- [ ] Notification fallback works when overlay permission denied
- [ ] Animations are smooth
- [ ] No memory leaks (overlay views properly removed)
- [ ] No BadTokenException crashes

---

## Risk Notes

- **Android 12+ overlay restrictions:** Some OEMs restrict overlay visibility. Test on Samsung, Xiaomi, Pixel.
- **Overlay vs DND mode:** In Do Not Disturb mode, both overlay and notifications may be suppressed. Accept this limitation -- DND is user's explicit choice.
