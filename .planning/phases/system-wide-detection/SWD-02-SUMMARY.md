---
phase: system-wide-detection
plan: 02
subsystem: native-module
tags: [accessibility-service, text-extraction, content-dedup, app-exclusion, kotlin, android, unit-tests]

requires:
  - phase: system-wide-detection
    plan: 01
    provides: canary-shield Expo local module scaffold

provides:
  - ScreenTextExtractor for recursive accessibility node tree traversal
  - ContentChangeDetector for hash-based dedup with differentiated cooldowns
  - AppExclusionList for system app exclusions + user customization
  - Unit tests for ContentChangeDetector and AppExclusionList

affects: [SWD-03 accessibility service wiring, SWD-04 settings UI]

tech-stack:
  added: [org.robolectric:robolectric:4.11.1, androidx.test:core:1.5.0]
  patterns: [object-singleton-extractor, synchronized-thread-safety, ring-buffer-dedup, shared-preferences-json]

key-files:
  created:
    - canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/ScreenTextExtractor.kt
    - canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/ContentChangeDetector.kt
    - canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/AppExclusionList.kt
    - canaryapp/modules/canary-shield/android/src/test/kotlin/com/canaryos/shield/ComponentTests.kt
  modified:
    - canaryapp/modules/canary-shield/android/build.gradle

key-decisions:
  - "ScreenTextExtractor as object singleton: stateless utility with no instance state needed, matches RESEARCH.md Pattern 2"
  - "ContentChangeDetector uses @Synchronized instead of AtomicInteger: simpler to reason about with multiple mutable fields (ring buffer + timestamp + index)"
  - "Robolectric for AppExclusionList tests: provides real Context/SharedPreferences without Android device, lightweight enough for unit test suite"
  - "ScreenTextExtractor tests deferred to SWD-03 integration: AccessibilityNodeInfo cannot be constructed or mocked in pure JVM tests without significant Robolectric shadow work"

requirements-completed: []

duration: 3min
completed: 2026-04-07
---

# Plan SWD-02: Screen Text Extraction + Content Dedup + App Exclusions Summary

**Three supporting components for the accessibility service: recursive node tree text extractor with memory-safe recycling, hash-based content change detector with differentiated event cooldowns, and app exclusion list with SharedPreferences user customization**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-07T03:13:59Z
- **Completed:** 2026-04-07T03:17:02Z
- **Tasks:** 4
- **Files modified:** 5

## Accomplishments

- ScreenTextExtractor: recursive AccessibilityNodeInfo traversal with depth limit (30), text length limit (4096), invisible/password node filtering, and proper child node recycling in finally blocks
- ContentChangeDetector: hash-based deduplication with ring buffer (5 entries), differentiated cooldowns (500ms window state, 2000ms content change), minimum text length check (20 chars), and thread-safe synchronized access
- AppExclusionList: 9 default system app exclusions, SharedPreferences JSON array merge for user exclusions, O(1) HashSet lookup, graceful malformed JSON handling
- 20 unit tests covering dedup logic, cooldown differentiation, thread safety (10-thread concurrent), ring buffer eviction, SharedPreferences loading, reload, and edge cases

## Task Commits

Each task was committed atomically:

1. **Task 1: ScreenTextExtractor** - `45d8b62` (feat)
2. **Task 2: ContentChangeDetector** - `dd7880b` (feat)
3. **Task 3: AppExclusionList** - `576e0a2` (feat)
4. **Task 4: Unit tests** - `f1e8c3b` (test)

## Files Created/Modified

- `canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/ScreenTextExtractor.kt` - Recursive node tree text extraction (88 lines)
- `canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/ContentChangeDetector.kt` - Hash-based dedup with cooldowns (84 lines)
- `canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/AppExclusionList.kt` - App exclusion management (95 lines)
- `canaryapp/modules/canary-shield/android/src/test/kotlin/com/canaryos/shield/ComponentTests.kt` - Unit tests (280+ lines, 20 test cases)
- `canaryapp/modules/canary-shield/android/build.gradle` - Added Robolectric + androidx.test:core test dependencies

## Decisions Made

- **ScreenTextExtractor as object singleton:** Stateless utility with no instance state, matches the pattern from RESEARCH.md. Caller retains ownership of root node (no root recycle), all child nodes recycled in finally blocks.
- **@Synchronized over AtomicInteger:** ContentChangeDetector has multiple mutable fields (ring buffer array, index, timestamp) that must be updated atomically together. @Synchronized is simpler and more correct than individual atomic operations.
- **Robolectric for AppExclusionList tests:** Provides real Android Context and SharedPreferences without requiring a device. Added as test-only dependency (4.11.1).
- **ScreenTextExtractor tests deferred:** AccessibilityNodeInfo is a final Android framework class that cannot be constructed in pure JVM tests. Will be tested via the full accessibility service in SWD-03 integration testing.
- **Constructor-injectable parameters in ContentChangeDetector:** Cooldown values and ring buffer size are configurable via constructor for testing with short durations, while production defaults match the plan spec.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all three components are complete implementations ready for SWD-03 wiring.

## Next Phase Readiness

- SWD-03 can now wire ScreenTextExtractor, ContentChangeDetector, and AppExclusionList into CanaryAccessibilityService.onAccessibilityEvent()
- The three components are decoupled and independently testable
- ContentChangeDetector.hasSignificantChange() signature matches what SWD-03 needs: `(text: String, eventType: Int) -> Boolean`

## Self-Check: PASSED
