# Plan SWD-05: Permission Onboarding UI + Shield Settings Screen

**Phase:** System-Wide On-Device Scam Detection
**Plan:** 5 of 6
**Goal:** Build the React Native permission onboarding wizard and the shield settings screen that allows users to configure and monitor the system-wide protection.

**Depends on:** SWD-03 (bridge API for permission checks, settings openers, config setters, stats)
**Estimated effort:** 1-2 sessions

---

## Context

The system requires three special permissions that cannot be requested via standard runtime dialogs -- the user must navigate to Android Settings. The onboarding flow guides users through this process. The settings screen provides ongoing control.

---

## Tasks

### Task 1: Permission Onboarding Screen

**What:** A step-by-step wizard that guides users through granting all required permissions.

**File:** `canaryapp/app/shield-setup.tsx` (new Expo Router screen)

**Design:** Multi-step wizard, one permission per step. Each step:
1. Explains WHY the permission is needed (one sentence)
2. Has a primary action button (grant permission)
3. Has a "Skip for now" text link
4. Auto-advances when permission is detected as granted (poll on `AppState` 'active' with 500ms delay)

**Steps:**

**Step 1: Notifications** (lowest friction -- runtime dialog)
- Title: "Stay Informed"
- Body: "CanaryOS needs to send you alerts when a potential scam is detected."
- Action: Request POST_NOTIFICATIONS via `PermissionsAndroid.request()`
- Skip allowed

**Step 2: Overlay Permission** (Settings redirect)
- Title: "See Warnings Instantly"
- Body: "CanaryOS shows a warning on top of any app when a scam is detected. This requires the 'Display over other apps' permission."
- Action: Call `openOverlaySettings()` bridge function
- On return: check `isOverlayPermissionGranted()`

**Step 3: Accessibility Service** (most sensitive -- Settings redirect)
- Title: "System-Wide Protection"
- Body: "To scan screens across all apps, CanaryOS uses Android's Accessibility Service to read screen text. All processing is 100% on-device -- your data never leaves your phone."
- Action: Call `openAccessibilitySettings()` bridge function
- On return: check `isAccessibilityServiceEnabled()`

**Step 4: Battery Optimization** (optional -- Settings redirect)
- Title: "Reliable Protection"
- Body: "For uninterrupted protection, allow CanaryOS to run without battery restrictions."
- Action: Call `openBatteryOptimizationSettings()` bridge function
- Skip prominently shown (this step is optional)

**Completion:**
- Title: "Shield Active"
- Show permission status dashboard (green/red indicators for each)
- "Done" button -> navigate to home

**Requirements:**
- Skip already-granted permissions (check on step mount)
- Use `AppState` listener to detect returns from Settings (add 500ms delay before rechecking)
- Persist onboarding completion in AsyncStorage (`shield_setup_complete`)
- Theme: Canary Yellow primary buttons, Charcoal Black backgrounds, white text
- No emojis, no gradients, minimal icons

**Acceptance:**
- Flow completes successfully granting all permissions
- Skips already-granted permissions
- Auto-detects grants when returning from Settings
- Completion screen shows accurate status

### Task 2: Shield Settings Screen

**What:** Settings screen for ongoing shield management.

**File:** `canaryapp/app/settings/shield.tsx` (new Expo Router screen)

**Layout:**
```
┌──────────────────────────────────────────┐
│ Shield Settings                          │
├──────────────────────────────────────────┤
│ Shield Protection               [ON/OFF] │
│ "System-wide scam detection"             │
│                                          │
│ ── Permission Status ──────────────────  │
│ Accessibility Service    [Enabled]       │
│ Overlay Permission       [Enabled]       │
│ Notifications            [Enabled]       │
│ Battery Optimization     [Not set]       │
│                                          │
│ ── Sensitivity ────────────────────────  │
│ Detection Threshold       [======o==]    │
│ "Higher = fewer false alarms"     70%    │
│                                          │
│ ── App Exclusions ─────────────────────  │
│ "Apps that Shield will skip"             │
│ [Manage Excluded Apps >]                 │
│                                          │
│ ── Today's Activity ───────────────────  │
│ Screens analyzed              142        │
│ Scams detected                  0        │
│ Average detection time        38ms       │
│                                          │
│ ── About ──────────────────────────────  │
│ Model version            v0.1 (dev)      │
│ [Re-run Setup Wizard >]                  │
└──────────────────────────────────────────┘
```

**Requirements:**
- Shield toggle: calls `setShieldEnabled()` bridge function
- Permission status: check via bridge functions on screen focus (`useFocusEffect`)
- Tapping a "Not set" permission row opens the relevant Settings page
- Sensitivity slider: 50-95% range, calls `setConfidenceThreshold()`
- Stats: fetched from `getDetectionStats()` on mount and on focus
- "Manage Excluded Apps" navigates to a sub-screen (simple list with add/remove)
- "Re-run Setup Wizard" navigates to `shield-setup`
- Service health: if `isServiceAlive()` returns false, show warning banner at top: "Shield is not running. [Re-enable >]"
- Theme per CLAUDE.md

**Acceptance:**
- All sections render correctly
- Toggle enables/disables the shield
- Permission statuses are accurate and tappable
- Sensitivity slider updates threshold
- Stats display correctly
- Service health warning shows when service killed

### Task 3: Navigation Integration

**What:** Wire the new screens into existing app navigation.

**Files to update:**
- `canaryapp/app/(tabs)/index.tsx` -- Add small "Shield" status indicator (dot or text)
- Add route for `shield-setup` and `settings/shield`

**Requirements:**
- Home screen: show "Shield: Active" / "Shield: Inactive" status text (subtle, not dominant)
- First-time prompt: if `shield_setup_complete` not in AsyncStorage, show a dismissible card on home: "Protect your entire phone from scams. [Set up Shield >]"
- Shield settings accessible from main app settings/profile area
- All navigation uses Expo Router (`router.push()`)

**Acceptance:**
- Navigation to shield-setup and shield settings works
- Home screen shows shield status
- First-time prompt appears once and is dismissible

---

## Verification

- [ ] Permission onboarding flow completes on real device
- [ ] All 4 permissions grantable through the flow
- [ ] Shield settings screen renders correctly
- [ ] Toggle, slider, permission rows all functional
- [ ] Service health warning appears when service killed
- [ ] Home screen shows shield status
- [ ] First-time setup prompt shows and dismisses correctly

---

## Risk Notes

- **AppState detection delay:** When returning from Settings, the OS may report stale permission state for a brief period. The 500ms delay before rechecking mitigates this.
- **Accessibility Settings UI varies by OEM:** Samsung, Xiaomi, OnePlus have different layouts. The service description string should be clear so users can find it in the list.
- **Battery optimization Intent blocked:** `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` may not work on all OEMs. Include manual instructions as fallback text.
