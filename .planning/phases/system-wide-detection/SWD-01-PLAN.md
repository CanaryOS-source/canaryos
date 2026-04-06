# Plan SWD-01: Expo Local Module Scaffold + Config Plugin + Native TFLite Inference

**Phase:** System-Wide On-Device Scam Detection
**Plan:** 1 of 6
**Goal:** Create the `canary-shield` Expo local module with config plugin (AndroidManifest injection), resolve native asset access for model/vocab files, build a working native Kotlin TFLite classifier, and validate tokenizer parity with the JS implementation.

**Depends on:** Nothing (can start immediately; uses existing model during development)
**Estimated effort:** 1-2 sessions

---

## Context

The background scam detection system requires a pure native Kotlin pipeline because `react-native-fast-tflite` uses JSI and cannot operate outside the React Native runtime. This plan scaffolds the entire Expo local module, resolves the critical asset access question, and builds the core inference engine.

**Key constraint:** The Kotlin tokenizer MUST produce identical token IDs to the existing JS `TextTokenizer.ts` for the same input strings.

**Placeholder model:** The existing `mobilebert_scam_intent.tflite` (26.7MB, known broken output quality) will be used for integration testing. It still loads and produces float output -- the inference pipeline can be validated even if predictions are garbage. Once v1.0 Phase 6 produces the real model, it drops in without code changes (same input shape [1, 128], output shape [1, 2]).

---

## Tasks

### Task 1: Scaffold Expo Local Module + Config Plugin

**What:** Create the `canary-shield` Expo local module directory structure AND the config plugin that injects all required AndroidManifest entries.

**Files to create:**
```
canaryapp/modules/canary-shield/
├── index.ts                           # JS bridge API exports
├── src/
│   └── CanaryShieldModule.ts          # Expo module TypeScript definition
├── app.plugin.js                      # Expo config plugin for AndroidManifest
├── android/
│   ├── build.gradle                   # Gradle config with TFLite dependencies
│   └── src/main/
│       ├── AndroidManifest.xml        # Module manifest (service + permissions)
│       ├── res/
│       │   ├── xml/
│       │   │   └── accessibility_service_config.xml
│       │   └── values/
│       │       └── strings.xml        # Service description string
│       └── kotlin/com/canaryos/shield/
│           └── CanaryShieldModule.kt  # Expo module bridge (Kotlin)
├── expo-module.config.json            # Expo module registration
```

**Module AndroidManifest.xml** (merged automatically by Android build system):
```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />

    <application>
        <service
            android:name="com.canaryos.shield.CanaryAccessibilityService"
            android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE"
            android:exported="false">
            <intent-filter>
                <action android:name="android.accessibilityservice.AccessibilityService" />
            </intent-filter>
            <meta-data
                android:name="android.accessibilityservice"
                android:resource="@xml/accessibility_service_config" />
        </service>
    </application>
</manifest>
```

**Config plugin (`app.plugin.js`):** Verify whether Android build system auto-merges the module's manifest. If it does (standard for Expo local modules), the plugin only needs to register the module. If not, the plugin uses `withAndroidManifest` to inject entries.

**Also update:** `canaryapp/app.config.js` to include `"./modules/canary-shield/app.plugin.js"` in plugins array.

**Accessibility service config XML:**
```xml
<accessibility-service
    xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeWindowStateChanged|typeWindowContentChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:notificationTimeout="300"
    android:canRetrieveWindowContent="true"
    android:settingsActivity="com.canaryapp.MainActivity"
    android:description="@string/accessibility_service_description" />
```

Do NOT set `isAccessibilityTool="true"` (reserved for true accessibility tools per Google policy).

**Gradle dependencies:**
```groovy
dependencies {
    implementation 'org.tensorflow:tensorflow-lite:2.16.1'
    implementation 'org.tensorflow:tensorflow-lite-support:0.4.4'
}
```

**Acceptance:**
- `npx expo prebuild --platform android` succeeds without errors
- Module is recognized by Expo (appears in auto-linking output)
- AndroidManifest in build output contains the accessibility service declaration and all permissions
- `res/xml/accessibility_service_config.xml` is included in the build output

### Task 2: Resolve Native Asset Access for Model + Vocab Files

**What:** Determine how the native Kotlin code accesses `vocab.txt` and `.tflite` model files, and implement the solution.

**Investigation:**
1. After `npx expo prebuild --platform android`, check where Expo places files from `canaryapp/assets/models/` -- specifically `vocab.txt` and `mobilebert_scam_intent.tflite`
2. Check if they appear in `android/app/src/main/assets/` (accessible via `context.assets.open()`)
3. If NOT present in native assets, implement one of:
   - **Option A:** Add a Gradle `copy` task in the module's `build.gradle` that copies from the Metro-bundled location to native assets
   - **Option B:** Add the model/vocab files directly to the module's `android/src/main/assets/` directory (duplicates files but guarantees access)
   - **Option C:** Use Expo's asset resolution (`expo-asset`) from JS and pass file paths to native via bridge

**Recommended:** Option A or verify that Metro's asset bundling already makes them available. Read Expo docs on asset handling for native modules.

**Acceptance:**
- Kotlin code can successfully call `context.assets.open("vocab.txt")` and read the file
- Kotlin code can successfully load `.tflite` model via `MappedByteBuffer` from assets
- Verified after a clean prebuild + build

### Task 3: Implement Native Kotlin WordPiece Tokenizer

**What:** Port the WordPiece tokenization logic to Kotlin.

**File:** `canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/BertTokenizer.kt`

**Requirements:**
- Load `vocab.txt` from assets (using path resolved in Task 2)
- Implement: text normalization (Unicode NFC, lowercase) -> basic tokenization (split on whitespace/punctuation) -> WordPiece sub-word tokenization -> convert to token IDs
- Handle special tokens: [CLS] (101), [SEP] (102), [PAD] (0), [UNK] (100)
- Sequence length: 128 tokens (matching existing model input shape [1, 128])
- Generate attention mask (1 for real tokens, 0 for padding)
- Homoglyph detection: detect Cyrillic/Greek mixed with Latin (matching JS implementation)

**Reference:** Read `canaryapp/services/ondevice/TextTokenizer.ts` for exact normalization and tokenization behavior to replicate.

**Acceptance:**
- Tokenizer loads vocab.txt without error
- Produces IntArray of length 128 for any input
- Attention mask correctly marks padding positions

### Task 4: Implement Native TFLite ScamClassifier

**What:** Create the Kotlin class that loads a TFLite model and runs inference.

**File:** `canaryapp/modules/canary-shield/android/src/main/kotlin/com/canaryos/shield/ScamClassifier.kt`

**Requirements:**
- Load .tflite model file from assets using MappedByteBuffer (resolved in Task 2)
- Configure Interpreter with 2 threads (CPU default)
- Accept tokenized input (inputIds IntArray + attentionMask IntArray)
- Run inference with `runForMultipleInputsOutputs`
- Apply softmax to output logits
- Return `ClassificationResult(isScam: Boolean, confidence: Float, latencyMs: Double)`
- Handle model loading failure gracefully (log error, return safe verdict)
- Lazy initialization: model loads on first classify() call, not on construction

**Acceptance:**
- Existing `mobilebert_scam_intent.tflite` loads from assets without crash
- Inference runs and returns a Float confidence score (accuracy doesn't matter -- model is known broken)
- Latency is logged for profiling

### Task 5: Expose Bridge API + Cross-Platform Tokenizer Parity Test

**What:** Wire the Kotlin classifier through the Expo module bridge AND validate tokenizer parity.

**Bridge functions to expose:**
```typescript
export function classifyText(text: string): Promise<{ isScam: boolean; confidence: number; latencyMs: number }>;
export function getServiceStatus(): Promise<{ modelLoaded: boolean; vocabLoaded: boolean }>;
export function isAccessibilityServiceEnabled(): boolean;
export function isOverlayPermissionGranted(): boolean;
```

**Tokenizer parity test workflow:**
1. Create `canaryapp/scripts/dump-tokenizer-output.ts` -- runs JS `TextTokenizer` on 20 test strings, outputs JSON fixture: `{ "test_string": [token_id_array], ... }`
2. Run the script: `npx ts-node canaryapp/scripts/dump-tokenizer-output.ts > canaryapp/modules/canary-shield/android/src/test/resources/tokenizer_expected.json`
3. Create `canaryapp/modules/canary-shield/android/src/test/kotlin/com/canaryos/shield/BertTokenizerTest.kt` -- loads the JSON fixture, tokenizes same strings in Kotlin, asserts exact match

**Test strings (20):** short, long, Unicode, homoglyphs (Cyrillic а mixed with Latin a), empty string, special characters, real scam examples ("You've won $10,000! Click here to claim"), safe examples ("Your meeting is at 3pm tomorrow"), edge cases (128+ tokens, all-punctuation, numbers only).

**Acceptance:**
- `classifyText("you won a free iPhone click here")` callable from JS and returns result
- `getServiceStatus()` correctly reports model/vocab loaded state
- All 20 tokenizer parity tests pass (`./gradlew :modules:canary-shield:test`)

---

## Verification

- [ ] `npx expo prebuild --platform android` succeeds
- [ ] AndroidManifest contains service declaration and all permissions
- [ ] Native code can access vocab.txt and .tflite via `context.assets`
- [ ] `classifyText()` callable from JS and returns valid result
- [ ] Tokenizer parity test passes for all 20 test strings
- [ ] Model inference latency logged (target: <80ms on mid-range device)

---

## Risk Notes

- **Gradle version conflicts:** `org.tensorflow:tensorflow-lite:2.16.1` may conflict with other native dependencies. Check for version clashes during prebuild.
- **Expo module manifest merge:** Standard Android library modules auto-merge their manifests. Verify this works for Expo local modules specifically. If not, the config plugin must use `withAndroidManifest` mod.
- **Model size in assets:** The existing 26.7MB model will be duplicated (Metro bundle + native assets). This is temporary -- the v1.0 Phase 6 model targets <10MB.
