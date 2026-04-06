# Plan SWD-02: Screen Text Extraction + Content Dedup + App Exclusions

**Phase:** System-Wide On-Device Scam Detection
**Plan:** 2 of 6
**Goal:** Build the supporting components that the Accessibility Service depends on: screen text extraction from the accessibility node tree, content change detection with throttling, and app exclusion list management.

**Depends on:** SWD-01 (module scaffold and native assets must be accessible)
**Estimated effort:** 1 session

---

## Context

These are the three utility classes that the Accessibility Service (SWD-03) will compose together. Building them separately allows focused unit testing before wiring into the service.

---

## Tasks

### Task 1: Implement ScreenTextExtractor

**What:** Recursive traversal of the AccessibilityNodeInfo tree to collect all visible text.

**File:** `canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/ScreenTextExtractor.kt`

**Requirements:**
- Traverse all nodes recursively, collecting `text` and `contentDescription` properties
- Skip invisible nodes (`!node.isVisibleToUser`)
- Skip password fields (`node.isPassword`)
- Limit traversal depth to 30 levels (prevent infinite recursion on malformed trees)
- Limit total text length to 4096 characters (model max is 128 tokens ~ 512 chars, but collect more for context)
- Properly recycle all AccessibilityNodeInfo objects to prevent memory leaks -- use try/finally blocks on every `getChild()` call
- Return extracted text as a single concatenated string with space separators

**Acceptance:**
- Handles null nodes, empty text, and deep trees without crashing
- Skips password fields
- Respects depth and length limits
- All node objects recycled (no memory leaks)

### Task 2: Implement ContentChangeDetector

**What:** Hash-based deduplication and throttling to avoid re-classifying unchanged or rapidly-changing content.

**File:** `canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/ContentChangeDetector.kt`

**Requirements:**
- Store hash of last processed text content
- Differentiated cooldowns: 500ms for `TYPE_WINDOW_STATE_CHANGED` (page transitions), 2000ms for `TYPE_WINDOW_CONTENT_CHANGED` (within-page updates)
- Skip if text hash matches previous (content unchanged)
- Skip if text length < 20 characters (too short to be meaningful)
- Maintain a ring buffer of last 5 recently-seen hashes (handles rapid back-and-forth navigation)
- Thread-safe: use `@Synchronized` or `AtomicInteger`/`AtomicLong` for concurrent access
- Expose `fun hasSignificantChange(text: String, eventType: Int): Boolean`

**Acceptance:**
- Same content submitted twice returns false on second call
- Different content after cooldown returns true
- Short text (<20 chars) returns false
- Thread-safe under concurrent access (test with coroutines)

### Task 3: Implement AppExclusionList

**What:** Skip classification for known-safe system apps and user-excluded apps.

**File:** `canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/AppExclusionList.kt`

**Default exclusions:**
```kotlin
val DEFAULT_EXCLUDED = setOf(
    "com.android.launcher3",
    "com.google.android.apps.nexuslauncher",
    "com.android.systemui",
    "com.android.settings",
    "com.android.dialer",
    "com.google.android.dialer",
    "com.android.camera2",
    "com.google.android.camera",
    "com.canaryapp",
)
```

**Requirements:**
- Read user-added exclusions from SharedPreferences key `shield_excluded_apps` (JSON string array)
- Merge defaults with user-added exclusions into a HashSet
- `fun isExcluded(packageName: String): Boolean` -- O(1) lookup
- `fun reload()` -- re-read SharedPreferences (called when config changes)

**Acceptance:**
- Default packages are excluded
- Custom exclusions from SharedPreferences are loaded
- Lookup is O(1)
- `reload()` picks up new values

### Task 4: Unit Tests for Components

**What:** Unit tests for all three components.

**File:** `canaryapp/modules/canary-shield/android/src/test/kotlin/com/canaryos/shield/ComponentTests.kt`

**Tests:**
- ContentChangeDetector: dedup, cooldown, short text, thread safety
- AppExclusionList: defaults, custom additions, reload
- ScreenTextExtractor: tested with mock AccessibilityNodeInfo if feasible, otherwise defer to integration test

**Acceptance:**
- Tests pass via `./gradlew :modules:canary-shield:test`

---

## Verification

- [ ] ScreenTextExtractor correctly traverses and extracts text
- [ ] ContentChangeDetector filters duplicates and respects cooldowns
- [ ] AppExclusionList correctly merges defaults with user config
- [ ] All unit tests pass
- [ ] No memory leaks in node tree traversal

---

## Risk Notes

- **Mock AccessibilityNodeInfo:** Android's `AccessibilityNodeInfo` is difficult to mock in unit tests (sealed class, requires Parcel). ScreenTextExtractor may need integration testing on a real device rather than pure unit testing. Consider using Robolectric or accepting that this component is tested via the service in SWD-03.
