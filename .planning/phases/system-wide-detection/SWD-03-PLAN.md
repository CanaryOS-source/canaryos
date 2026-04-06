# Plan SWD-03: Accessibility Service Assembly + Bridge API

**Phase:** System-Wide On-Device Scam Detection
**Plan:** 3 of 6
**Goal:** Assemble the Accessibility Service that wires together the text extractor, content change detector, app exclusion list, and scam classifier into a working end-to-end detection pipeline. Expose control and stats bridge API to React Native.

**Depends on:** SWD-01 (classifier, tokenizer), SWD-02 (extractor, dedup, exclusions)
**Estimated effort:** 1 session

---

## Context

This plan combines all the components built in SWD-01 and SWD-02 into the main `CanaryAccessibilityService`. This is the core of the system -- it receives OS events, extracts text, classifies it, and stores results for the overlay (SWD-04) to display.

---

## Tasks

### Task 1: Implement CanaryAccessibilityService

**What:** The main Accessibility Service that ties together all detection components.

**File:** `canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/CanaryAccessibilityService.kt`

**Lifecycle:**
1. `onServiceConnected()`:
   - Initialize ScamClassifier (lazy model load on first inference)
   - Initialize ContentChangeDetector
   - Initialize AppExclusionList (load from SharedPreferences)
   - Register SharedPreferences change listener for config updates
   - Log service start

2. `onAccessibilityEvent(event)`:
   - Check enabled state (SharedPreferences `shield_enabled`, default: true)
   - If disabled, return immediately
   - Validate event type: only process `TYPE_WINDOW_STATE_CHANGED` and `TYPE_WINDOW_CONTENT_CHANGED`
   - Get source package name -> check AppExclusionList
   - Get `rootInActiveWindow` (null-check, return if null)
   - Extract text via ScreenTextExtractor
   - Recycle root node
   - If text blank, return
   - Check ContentChangeDetector (pass event type for differentiated cooldowns)
   - **Offload to background thread:** Use a single-thread `ExecutorService` to avoid blocking the accessibility event thread
   - On background thread: classify via ScamClassifier
   - If scam detected (confidence > threshold): store detection result in a shared `LastDetection` holder (read by overlay manager and bridge)
   - Increment stats counters
   - Log result and latency

3. `onInterrupt()`: Log interruption
4. `onDestroy()`: Release classifier resources, shutdown executor

**Threading model:**
- `onAccessibilityEvent` runs on the main thread -- must not block
- Text extraction is fast (<10ms) and runs on main thread
- Classification is offloaded to a single-thread `ExecutorService`
- Use `AtomicReference<ClassificationResult?>` for the last detection result

**Configuration via SharedPreferences:**
- `shield_enabled` (Boolean, default: true)
- `shield_threshold` (Float, default: 0.7)
- `shield_excluded_apps` (String JSON array, default: "[]")

**Error handling:**
- Wrap entire `onAccessibilityEvent` in try/catch -- service must NEVER crash
- Log all exceptions with `[CanaryShield]` prefix
- On classifier failure, log and skip (do not show false positive)

**Acceptance:**
- Service starts when enabled in Android Settings > Accessibility
- Events are received and processed for non-excluded apps
- Duplicate content is filtered
- Classification runs on background thread
- Detection results stored for overlay/bridge access
- No crashes on any event type

### Task 2: Implement Detection Stats Tracker

**What:** Track detection statistics for the bridge API and settings screen.

**File:** `canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/DetectionStats.kt`

**Requirements:**
- Track per-session: `totalScreensProcessed`, `totalScamsDetected`, `averageLatencyMs`
- Track recent detections: ring buffer of last 20 detections with timestamp, app package, confidence, text snippet (first 100 chars)
- Persist daily stats to SharedPreferences (reset on new day)
- Thread-safe (accessed from executor thread, read from bridge on main thread)

**Acceptance:**
- Stats accurately reflect processing activity
- Recent detections retrievable as a list
- Daily reset works correctly

### Task 3: Update Bridge API for Service Control

**What:** Add service control, status, and stats functions to the Expo module bridge.

**Update files:**
- `canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/CanaryShieldModule.kt`
- `canaryapp/modules/canary-shield/src/CanaryShieldModule.ts`
- `canaryapp/modules/canary-shield/index.ts`

**Bridge functions to add:**
```typescript
// Control
export function setShieldEnabled(enabled: boolean): void;
export function setConfidenceThreshold(threshold: number): void;
export function setExcludedApps(packages: string[]): void;

// Status
export function isAccessibilityServiceEnabled(): boolean;
export function isOverlayPermissionGranted(): boolean;
export function isNotificationPermissionGranted(): Promise<boolean>;
export function isBatteryOptimizationExempt(): boolean;

// Settings openers
export function openAccessibilitySettings(): void;
export function openOverlaySettings(): void;
export function openBatteryOptimizationSettings(): void;

// Stats
export function getDetectionStats(): Promise<{
  totalScreensProcessed: number;
  totalScamsDetected: number;
  averageLatencyMs: number;
}>;
export function getRecentDetections(): Promise<Array<{
  timestamp: number;
  appPackage: string;
  confidence: number;
  snippetPreview: string;
}>>;
```

**Native implementation notes:**
- Permission checks use Android APIs (`Settings.canDrawOverlays()`, `AccessibilityManager.getEnabledAccessibilityServiceList()`, etc.)
- Settings openers use Intents (`Settings.ACTION_ACCESSIBILITY_SETTINGS`, `Settings.ACTION_MANAGE_OVERLAY_PERMISSION` with `package:com.canaryapp`, etc.)
- Config setters write to SharedPreferences (service picks up changes via listener)

**Acceptance:**
- RN app can enable/disable the shield
- Permission checks return accurate booleans
- Settings openers navigate to correct Android Settings pages
- Stats are accurately retrieved

### Task 4: Service Health Monitor

**What:** Mechanism for the RN app to detect when the Accessibility Service has been killed by the OS and prompt the user.

**Implementation:**
- In `CanaryShieldModule.kt`: `isServiceAlive()` checks if the service is in the enabled accessibility service list AND has responded within the last 60 seconds (heartbeat via SharedPreferences timestamp)
- In `CanaryAccessibilityService.kt`: write a heartbeat timestamp to SharedPreferences every 30 seconds (use a Handler with periodic posting)
- The RN settings screen polls `isServiceAlive()` on `AppState` 'active' event and shows a warning if the service appears dead

**Acceptance:**
- `isServiceAlive()` returns true when service is running
- Returns false when service has been killed (heartbeat stale >60s)
- RN app can detect dead service state

---

## Verification

- [ ] Accessibility Service receives events from screen transitions
- [ ] Text is extracted from real screens (install on device, navigate between apps)
- [ ] Excluded apps are skipped
- [ ] Duplicate content is not re-classified
- [ ] Classification runs on background thread (no ANR)
- [ ] Detection results and stats are accessible from RN bridge
- [ ] Permission check functions return correct values
- [ ] Settings opener functions navigate to correct pages
- [ ] Service health monitor detects killed service
- [ ] Total pipeline latency < 100ms on test device

---

## Risk Notes

- **ANR (Application Not Responding):** If classification blocks the main thread, Android will kill the service. The single-thread executor pattern prevents this, but verify with Android StrictMode.
- **SharedPreferences listener race:** Config changes from RN and reads from the service can race. Use `apply()` (async) for writes and accept eventual consistency.
- **Service singleton state:** The Accessibility Service is managed by Android OS. There is no guarantee about its lifecycle relative to the RN app. Use SharedPreferences as the communication channel, not in-memory shared state.
