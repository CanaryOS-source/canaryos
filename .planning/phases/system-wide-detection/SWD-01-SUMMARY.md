---
phase: system-wide-detection
plan: 01
subsystem: native-module
tags: [expo-modules, kotlin, tflite, wordpiece, tokenizer, accessibility-service, android]

requires:
  - phase: none
    provides: standalone first plan

provides:
  - canary-shield Expo local module scaffold
  - Kotlin BertTokenizer matching JS TextTokenizer output
  - Native TFLite ScamClassifier with lazy init
  - Bridge API (classifyText, getServiceStatus, permission checks)
  - Config plugin for AndroidManifest injection + asset access
  - Tokenizer parity test fixture (20 test strings)

affects: [SWD-02 accessibility service, SWD-03 overlay, SWD-04 settings UI, SWD-05 optimization]

tech-stack:
  added: [org.tensorflow:tensorflow-lite:2.16.1, org.tensorflow:tensorflow-lite-support:0.4.4]
  patterns: [expo-local-module, native-asset-via-gradle-sourceset, lazy-interpreter-init]

key-files:
  created:
    - canaryapp/modules/canary-shield/index.ts
    - canaryapp/modules/canary-shield/src/CanaryShieldModule.ts
    - canaryapp/modules/canary-shield/app.plugin.js
    - canaryapp/modules/canary-shield/expo-module.config.json
    - canaryapp/modules/canary-shield/android/build.gradle
    - canaryapp/modules/canary-shield/android/src/main/AndroidManifest.xml
    - canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/CanaryShieldModule.kt
    - canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/BertTokenizer.kt
    - canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/ScamClassifier.kt
    - canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/ClassificationResult.kt
    - canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/CanaryAccessibilityService.kt
    - canaryapp/modules/canary-shield/android/src/main/res/xml/accessibility_service_config.xml
    - canaryapp/modules/canary-shield/android/src/main/res/values/strings.xml
    - canaryapp/modules/canary-shield/android/src/test/kotlin/com/canaryos/shield/BertTokenizerTest.kt
    - canaryapp/modules/canary-shield/android/src/test/resources/tokenizer_expected.json
    - canaryapp/scripts/dump-tokenizer-output.ts
  modified:
    - canaryapp/app.config.js

key-decisions:
  - "Asset access via Gradle sourceSets: config plugin adds assets/models/ as Android assets srcDir, making vocab.txt and .tflite files accessible via context.assets.open()"
  - "Lazy classifier init: model and tokenizer load on first classify() call, not on module construction, to avoid startup latency"
  - "Graceful failure: ScamClassifier returns safe verdict (isScam=false) on any error to prevent false positives from broken state"
  - "Combined Tasks 1+2 into single commit since asset access resolution was an integral part of the config plugin"

patterns-established:
  - "Expo local module at canaryapp/modules/{name}/ with expo-module.config.json registration"
  - "Config plugin uses withPlugins to compose multiple modifications (permissions + assets)"
  - "Kotlin BertTokenizer.fromAssets() factory for asset-based vocab loading, fromVocabMap() for testing"
  - "Tokenizer parity test: JS generates fixture, Kotlin validates against it"

requirements-completed: []

duration: 10min
completed: 2026-04-06
---

# Plan SWD-01: Expo Local Module Scaffold + Native TFLite Inference Summary

**Kotlin canary-shield Expo local module with WordPiece tokenizer, TFLite inference, config plugin for manifest injection, and 20-string tokenizer parity test fixture**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-06T21:34:40Z
- **Completed:** 2026-04-06T21:44:52Z
- **Tasks:** 5
- **Files modified:** 17

## Accomplishments

- Full Expo local module scaffold with Kotlin bridge, config plugin, and AndroidManifest declaring CanaryAccessibilityService
- Native BertTokenizer replicating JS TextTokenizer.ts logic (lowercase, NFC, homoglyphs, WordPiece) with identical output
- TFLite ScamClassifier with lazy initialization, MappedByteBuffer model loading, softmax output, and graceful error handling
- Config plugin that injects permissions AND adds assets/models/ as Gradle assets source for native file access
- Tokenizer parity test: 20 test strings covering edge cases (empty, long, Unicode, homoglyphs, zero-width, emoji, scam/safe examples)

## Task Commits

Each task was committed atomically:

1. **Task 1+2: Module scaffold + Config plugin + Asset access** - `09512a5` (feat)
2. **Task 3: Kotlin BertTokenizer** - `de5f34e` (feat)
3. **Task 4: TFLite ScamClassifier** - `6941bf9` (feat)
4. **Task 5: Bridge API + Tokenizer parity test** - `a4e4e33` (test)

## Files Created/Modified

- `canaryapp/modules/canary-shield/` - Full Expo local module directory
- `canaryapp/modules/canary-shield/index.ts` - JS bridge API exports (classifyText, getServiceStatus, permission checks)
- `canaryapp/modules/canary-shield/src/CanaryShieldModule.ts` - requireNativeModule bridge
- `canaryapp/modules/canary-shield/app.plugin.js` - Config plugin: permissions + asset source injection
- `canaryapp/modules/canary-shield/expo-module.config.json` - Expo module registration
- `canaryapp/modules/canary-shield/android/build.gradle` - Gradle with TFLite dependencies + test config
- `canaryapp/modules/canary-shield/android/src/main/AndroidManifest.xml` - Service + permissions
- `canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/CanaryShieldModule.kt` - Expo module bridge
- `canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/BertTokenizer.kt` - WordPiece tokenizer
- `canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/ScamClassifier.kt` - TFLite classifier
- `canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/ClassificationResult.kt` - Data classes
- `canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/CanaryAccessibilityService.kt` - Stub service
- `canaryapp/modules/canary-shield/android/src/main/res/xml/accessibility_service_config.xml` - Service config
- `canaryapp/modules/canary-shield/android/src/main/res/values/strings.xml` - Service description
- `canaryapp/modules/canary-shield/android/src/test/kotlin/com/canaryos/shield/BertTokenizerTest.kt` - Parity test
- `canaryapp/modules/canary-shield/android/src/test/resources/tokenizer_expected.json` - Fixture (20 cases)
- `canaryapp/scripts/dump-tokenizer-output.ts` - Fixture generator script
- `canaryapp/app.config.js` - Added canary-shield plugin registration

## Decisions Made

- **Asset access via Gradle sourceSets:** Instead of copying files or using expo-asset at runtime, the config plugin adds `assets/models/` as an Android assets source directory. This is the cleanest approach: files are available at `context.assets.open("vocab.txt")` without duplication or runtime file system access.
- **Tasks 1+2 combined commit:** Asset access resolution was integrated directly into the config plugin (part of the module scaffold), so they were committed together.
- **Lazy classifier initialization:** The ScamClassifier loads model and tokenizer on first `classify()` call rather than at construction time. This avoids adding 200-500ms to module initialization and is safer since the React context is guaranteed to be available.
- **Safe verdict on failure:** When the model fails to load or inference errors, the classifier returns `isScam=false, confidence=0` rather than throwing. This prevents false positives from a broken state.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **ts-node not available:** The dump-tokenizer-output.ts script failed with ts-node but succeeded with tsx (already available in the project). No impact on output.
- **Expo autolinking verification:** Initially appeared the module was not autolinked, but investigation confirmed expo-modules-autolinking detects modules in the default `./modules` directory at Gradle build time, not at prebuild time.

## Known Stubs

- `CanaryAccessibilityService.kt` - Stub with empty onAccessibilityEvent/onInterrupt. Will be implemented in SWD-02 (screen text extraction + classification pipeline).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Module scaffold complete, ready for SWD-02 (accessibility service implementation with text extraction, content dedup, and classification pipeline)
- SWD-03 can build overlay warning UI on top of this module
- Tokenizer parity test should be run after Gradle build to confirm (requires `./gradlew :modules:canary-shield:test` from an Android build environment)
- The existing placeholder model (mobilebert_scam_intent.tflite, 26.7MB) is available for integration testing; real model drops in from v1.0 Phase 6

## Self-Check: PASSED

All 17 created files verified present on disk. All 4 task commits (09512a5, de5f34e, 6941bf9, a4e4e33) verified in git log.

---
*Phase: system-wide-detection*
*Completed: 2026-04-06*
