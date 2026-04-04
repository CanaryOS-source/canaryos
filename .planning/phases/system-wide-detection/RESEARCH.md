# System-Wide On-Device Scam Detection - Research

**Researched:** 2026-04-04
**Domain:** Android system services, accessibility APIs, background processing, overlay UI, on-device ML inference
**Confidence:** MEDIUM (novel integration; no existing React Native library solves this end-to-end)

## Summary

Building system-wide scam detection on Android requires a **native Kotlin service layer** that operates independently of the React Native runtime. The recommended architecture uses an **Android Accessibility Service** to detect screen changes and extract text directly from the accessibility node tree (bypassing OCR entirely for most cases), a **native TFLite interpreter** for inference, and a **WindowManager overlay** for scam warnings. The React Native app serves as the configuration UI and permission onboarding flow, while the actual detection pipeline runs as a pure native Android service.

The Accessibility Service approach is strongly preferred over MediaProjection because it extracts text directly from the UI tree (sub-10ms) rather than taking screenshots and running OCR (100-300ms), requires no persistent screen recording consent dialog, and consumes dramatically less battery. However, Google Play's Accessibility Service policies are tightening significantly, with a January 28, 2026 enforcement deadline for stricter reviews. A scam detection app using accessibility services is a **policy risk** -- it is not a traditional accessibility tool, and Google does not explicitly exempt security/fraud apps from the "must assist people with disabilities" requirement.

**Primary recommendation:** Build a pure-native Kotlin Accessibility Service + TFLite pipeline as an Expo local module, with the RN app handling only configuration/onboarding. Plan for both Play Store distribution (with policy risk) and sideload/direct APK distribution as a fallback.

## Project Constraints (from CLAUDE.md)

- Do not use cloud API as default analysis path (on-device only)
- Do not create new native modules without discussion -- the overlay module was removed intentionally (NOTE: this research directly addresses the need for native modules; the user explicitly requested this investigation)
- Services use 3-file wrapper pattern: service.ts, serviceNative.ts, serviceWeb.ts
- Theme: Primary #FFD300, Alert #E63946, Trust #0077B6, Secondary #1C1C1C
- No emojis in UI or code
- No clutter, no gradients, minimal icons
- Core features one-click accessible
- Existing ML pipeline in canaryapp/services/ondevice/ uses react-native-fast-tflite and @react-native-ml-kit/text-recognition

## Standard Stack

### Core (Native Android Layer -- NEW)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TensorFlow Lite Android | 2.16.x | Native TFLite inference in Kotlin service | Required because react-native-fast-tflite uses JSI and cannot run outside RN context |
| Google ML Kit Text Recognition | 16.x | OCR fallback for image-heavy screens | Same engine as @react-native-ml-kit/text-recognition but native Android API |
| expo-modules-core | (bundled with Expo 54) | Bridge between native service and RN app | Official Expo way to create local native modules |

### Existing (React Native Layer -- UNCHANGED)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| react-native-fast-tflite | 1.6.1 | In-app TFLite inference (scanner feature) | Keep for in-app scanning; NOT used by background service |
| @react-native-ml-kit/text-recognition | 2.0.0 | In-app OCR | Keep for in-app scanning; NOT used by background service |
| expo | ~54.0.20 | App framework | Unchanged |

### New Dependencies

| Library | Purpose | Where Used |
|---------|---------|------------|
| org.tensorflow:tensorflow-lite:2.16.1 | Native TFLite runtime for Kotlin | Android native module |
| org.tensorflow:tensorflow-lite-support:0.4.4 | TFLite task library helpers | Android native module |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Accessibility Service | MediaProjection API | MediaProjection requires persistent consent UI, needs OCR step (slower), higher battery drain, but no Play Store policy risk |
| Accessibility Service | Content Observer + UsageStats | Much more limited -- can only detect app switches, cannot read screen content |
| Native TFLite | ONNX Runtime Mobile | TFLite is already used in the project; adding ONNX would mean two inference runtimes |
| WindowManager overlay | Notification (heads-up) | Notifications are dismissible and less impactful; overlay can be positioned precisely and styled |

**Installation (native dependencies via Gradle):**
```groovy
// In the Expo local module's build.gradle
dependencies {
    implementation 'org.tensorflow:tensorflow-lite:2.16.1'
    implementation 'org.tensorflow:tensorflow-lite-support:0.4.4'
}
```

## Architecture Patterns

### Recommended Architecture: Dual-Layer System

```
canaryapp/
├── app/                          # Expo Router screens (existing)
│   ├── settings/
│   │   └── system-scanner.tsx    # Toggle + permission onboarding UI
│   └── ...
├── modules/
│   └── canary-shield/            # Expo local module (NEW)
│       ├── index.ts              # JS bridge API
│       ├── src/
│       │   └── CanaryShieldModule.ts  # Expo module definition
│       ├── android/
│       │   └── src/main/
│       │       ├── kotlin/com/canaryos/shield/
│       │       │   ├── CanaryShieldModule.kt       # Expo module bridge
│       │       │   ├── CanaryAccessibilityService.kt  # Core service
│       │       │   ├── ScreenTextExtractor.kt      # Node tree traversal
│       │       │   ├── ScamClassifier.kt           # Native TFLite inference
│       │       │   ├── OverlayManager.kt           # Warning overlay UI
│       │       │   ├── ContentChangeDetector.kt    # Dedup/throttle logic
│       │       │   └── ShieldConfig.kt             # Config from RN app
│       │       ├── res/
│       │       │   ├── xml/
│       │       │   │   └── accessibility_service_config.xml
│       │       │   └── layout/
│       │       │       └── scam_warning_overlay.xml
│       │       └── AndroidManifest.xml
│       ├── expo-module.config.json
│       └── build.gradle
├── services/
│   └── ondevice/                 # Existing ML pipeline (UNCHANGED)
└── ...
```

### Pattern 1: Accessibility Service as Event Source

**What:** The Accessibility Service listens for `TYPE_WINDOW_STATE_CHANGED` and `TYPE_WINDOW_CONTENT_CHANGED` events, extracts text from the accessibility node tree, and passes it to the classifier.

**When to use:** Primary detection path -- handles all text-based screen content.

**How it works:**
```kotlin
// CanaryAccessibilityService.kt (simplified)
class CanaryAccessibilityService : AccessibilityService() {

    private lateinit var classifier: ScamClassifier
    private lateinit var overlayManager: OverlayManager
    private val contentDetector = ContentChangeDetector()

    override fun onServiceConnected() {
        classifier = ScamClassifier(this)  // loads TFLite model
        overlayManager = OverlayManager(this)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED &&
            event.eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) return

        val rootNode = rootInActiveWindow ?: return

        // Extract all visible text from the accessibility tree
        val screenText = ScreenTextExtractor.extractText(rootNode)
        rootNode.recycle()

        if (screenText.isBlank()) return

        // Deduplicate: skip if content hasn't meaningfully changed
        if (!contentDetector.hasSignificantChange(screenText)) return

        // Classify
        val result = classifier.classify(screenText)

        if (result.isScam && result.confidence > 0.7) {
            overlayManager.showWarning(result)
        }
    }

    override fun onInterrupt() {
        overlayManager.dismiss()
    }
}
```

### Pattern 2: Text Extraction via Node Tree Traversal

**What:** Recursively walk the AccessibilityNodeInfo tree to collect all visible text. This replaces OCR entirely for most screens.

**When to use:** Always -- this is the primary text extraction method. OCR is only needed as fallback for image-rendered text (Canvas, WebView images).

**Performance:** Sub-10ms for typical screen content (vs 100-300ms for screenshot + OCR).

```kotlin
// ScreenTextExtractor.kt
object ScreenTextExtractor {

    fun extractText(rootNode: AccessibilityNodeInfo): String {
        val builder = StringBuilder()
        traverseNode(rootNode, builder)
        return builder.toString()
    }

    private fun traverseNode(node: AccessibilityNodeInfo, builder: StringBuilder) {
        node.text?.let { text ->
            if (text.isNotBlank()) {
                builder.append(text).append(' ')
            }
        }
        node.contentDescription?.let { desc ->
            if (desc.isNotBlank()) {
                builder.append(desc).append(' ')
            }
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            traverseNode(child, builder)
            child.recycle()
        }
    }
}
```

### Pattern 3: Content Change Detection (Deduplication)

**What:** Hash-based deduplication to avoid re-classifying the same content. Accessibility events fire frequently (scrolls, animations), so most events should be skipped.

**When to use:** Always -- critical for battery and CPU efficiency.

```kotlin
// ContentChangeDetector.kt
class ContentChangeDetector {
    private var lastContentHash: Int = 0
    private var lastProcessedTime: Long = 0
    private val cooldownMs: Long = 500  // minimum 500ms between classifications

    fun hasSignificantChange(text: String): Boolean {
        val now = System.currentTimeMillis()
        if (now - lastProcessedTime < cooldownMs) return false

        val hash = text.hashCode()
        if (hash == lastContentHash) return false

        lastContentHash = hash
        lastProcessedTime = now
        return true
    }
}
```

### Pattern 4: Native TFLite Inference in Kotlin

**What:** Load and run the same TFLite model used by the RN app, but via the native TensorFlow Lite Android SDK.

**Why:** react-native-fast-tflite relies on JSI (JavaScript Interface) and cannot run outside the React Native runtime. The background service needs a standalone interpreter.

```kotlin
// ScamClassifier.kt
class ScamClassifier(context: Context) {
    private val interpreter: Interpreter
    private val tokenizer: BertTokenizer  // WordPiece tokenizer

    init {
        val modelFile = loadModelFile(context, "canary_v3_int8.tflite")
        val options = Interpreter.Options().apply {
            setNumThreads(2)
            // NNAPI delegate for supported devices
            // addDelegate(NnApiDelegate())
        }
        interpreter = Interpreter(modelFile, options)
        tokenizer = BertTokenizer(context, "vocab.txt")
    }

    fun classify(text: String): ClassificationResult {
        val startTime = SystemClock.elapsedRealtimeNanos()

        // Tokenize
        val tokens = tokenizer.tokenize(text, maxLength = 128)

        // Prepare input tensors
        val inputIds = Array(1) { tokens.inputIds }
        val attentionMask = Array(1) { tokens.attentionMask }

        // Prepare output
        val output = Array(1) { FloatArray(2) }  // [safe_logit, scam_logit]

        // Run inference
        interpreter.runForMultipleInputsOutputs(
            arrayOf(inputIds, attentionMask),
            mapOf(0 to output)
        )

        // Apply softmax
        val scores = softmax(output[0])
        val latencyMs = (SystemClock.elapsedRealtimeNanos() - startTime) / 1_000_000.0

        return ClassificationResult(
            isScam = scores[1] > 0.5f,
            confidence = scores[1],
            latencyMs = latencyMs
        )
    }
}
```

### Pattern 5: System Overlay Warning

**What:** Draw a warning overlay using WindowManager with TYPE_APPLICATION_OVERLAY. This appears on top of all apps.

**Design (per CLAUDE.md theme):**
- Alert Red (#E63946) header bar
- Charcoal Black (#1C1C1C) background
- Canary Yellow (#FFD300) dismiss button
- Trust Blue (#0077B6) "Learn more" link
- Minimal text: "Potential scam detected" + one-line explanation
- Auto-dismiss after 8 seconds OR tap to dismiss

```kotlin
// OverlayManager.kt
class OverlayManager(private val context: Context) {
    private val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private var overlayView: View? = null

    fun showWarning(result: ClassificationResult) {
        if (overlayView != null) dismiss()

        val params = WindowManager.LayoutParams().apply {
            type = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
            format = PixelFormat.TRANSLUCENT
            width = WindowManager.LayoutParams.MATCH_PARENT
            height = WindowManager.LayoutParams.WRAP_CONTENT
            gravity = Gravity.TOP
        }

        overlayView = LayoutInflater.from(context)
            .inflate(R.layout.scam_warning_overlay, null)

        // Setup dismiss button, auto-dismiss timer, etc.

        windowManager.addView(overlayView, params)

        // Auto-dismiss after 8 seconds
        Handler(Looper.getMainLooper()).postDelayed({ dismiss() }, 8000)
    }

    fun dismiss() {
        overlayView?.let {
            windowManager.removeView(it)
            overlayView = null
        }
    }
}
```

### Anti-Patterns to Avoid

- **Running TFLite from React Native's JS thread for background analysis:** JSI-based inference requires an active RN bridge; background services must use native TFLite directly.
- **Using MediaProjection for continuous monitoring:** Battery killer. Creates a persistent screen recording session with mandatory notification.
- **Processing every accessibility event:** Events fire on every UI change including scrolls and animations. Must debounce/dedup aggressively.
- **Sending screen content to a cloud API:** Violates privacy principles stated in CLAUDE.md and the project's core value proposition.
- **Using react-native-background-actions for this use case:** That library runs JS code in the background, but the Accessibility Service must be a native Android Service subclass -- it cannot be driven from JS.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WordPiece tokenization in Kotlin | Custom tokenizer | Google's `tensorflow-lite-support` BertTokenizer or port from HuggingFace tokenizers | WordPiece has edge cases (unknown tokens, max word length, special tokens) |
| TFLite model loading + inference | Custom buffer management | `org.tensorflow:tensorflow-lite` Interpreter API | Handles memory mapping, delegate selection, multi-input models |
| Accessibility event handling | Manual event filtering | Android's `AccessibilityServiceInfo` XML config with event type filtering | Let the OS pre-filter events before your code runs |
| Permission flow UI | Custom settings screens | Android's built-in Settings intents (ACTION_ACCESSIBILITY_SETTINGS, ACTION_MANAGE_OVERLAY_PERMISSION) | These are system settings pages; cannot be replicated |

## Common Pitfalls

### Pitfall 1: Google Play Store Rejection (Accessibility Service Policy)

**What goes wrong:** Google rejects the app because Accessibility Service use does not meet their policy requirement of "assisting people with disabilities."

**Why it happens:** Google's 2025-2026 policy explicitly states that only apps designed to help people with disabilities are eligible to declare `isAccessibilityTool="true"`. Scam detection is NOT in this category. The January 28, 2026 enforcement deadline introduces stricter reviews.

**How to avoid:**
1. Do NOT set `isAccessibilityTool="true"` in the accessibility service config -- this flag is reserved for true accessibility tools
2. In the Play Console declaration, clearly describe the security/fraud-prevention use case
3. Prepare a detailed privacy policy explaining what data is accessed and that it stays on-device
4. Have a sideload/direct APK distribution plan as fallback (e.g., GitHub releases, F-Droid, direct download from website)
5. Consider applying for Google Play's "security app" exception if one exists for your category

**Warning signs:** Policy violation warnings in Play Console pre-launch report.

**Confidence: MEDIUM-LOW.** Google does not explicitly exempt security/fraud apps from accessibility restrictions. Apps like Truecaller and some anti-malware apps have historically used accessibility services, but the 2026 enforcement may change this landscape.

### Pitfall 2: Accessibility Service Not Starting or Being Killed

**What goes wrong:** Android kills the service to save battery, or the user disables it without realizing.

**Why it happens:** Battery optimization (Doze mode), manufacturer-specific aggressive task killers (Xiaomi, Samsung, Huawei), or user accidentally toggling off in Settings.

**How to avoid:**
1. Guide users to exclude the app from battery optimization during onboarding
2. Monitor service state from the RN app and prompt user to re-enable if stopped
3. Use `AccessibilityService.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS` sparingly -- it increases event volume and battery drain
4. Register a `BroadcastReceiver` for `ACTION_PACKAGE_CHANGED` to detect service state changes

**Warning signs:** Service stops receiving events silently; no crash log.

### Pitfall 3: Event Storm from Accessibility Service

**What goes wrong:** The classifier runs hundreds of times per second on the same content, draining battery and heating the device.

**Why it happens:** `TYPE_WINDOW_CONTENT_CHANGED` fires on every UI update -- scroll events, animations, cursor blinks, progress bars.

**How to avoid:**
1. Implement aggressive debouncing (500ms-1000ms cooldown between classifications)
2. Hash-based content deduplication (skip if text hasn't changed)
3. Skip known-safe app packages (launcher, system UI, camera, dialer)
4. Only process `TYPE_WINDOW_STATE_CHANGED` (full screen transitions) as the primary trigger; use `TYPE_WINDOW_CONTENT_CHANGED` only for within-screen updates with longer cooldown

**Warning signs:** High CPU usage in Android profiler; device running warm.

### Pitfall 4: TFLite Model Sharing Between RN and Native

**What goes wrong:** The same model file is loaded twice in memory -- once by react-native-fast-tflite (for in-app scanning) and once by the native Kotlin service.

**Why it happens:** Two separate TFLite interpreter instances accessing the same model file.

**How to avoid:**
1. Accept the duplication -- the model is small (target <10MB) and the two contexts are isolated
2. Use memory-mapped file loading (MappedByteBuffer) in the Kotlin service to reduce actual RAM impact
3. Consider loading the native interpreter lazily only when the accessibility service is enabled

**Warning signs:** Increased app memory usage reported in Android Studio profiler.

### Pitfall 5: Overlay Not Showing or Showing Behind Other Apps

**What goes wrong:** The scam warning overlay doesn't appear, appears behind the current app, or is blocked by the system.

**Why it happens:** Missing SYSTEM_ALERT_WINDOW permission, Android version-specific behavior, or the overlay being dismissed by the system.

**How to avoid:**
1. Check `Settings.canDrawOverlays()` before attempting to show overlay
2. Use `TYPE_APPLICATION_OVERLAY` (not deprecated `TYPE_SYSTEM_ALERT`)
3. Test on multiple Android versions (API 26+ behavior differs from 31+)
4. Implement fallback to high-priority notification if overlay permission denied

**Warning signs:** `WindowManager$BadTokenException` in crash logs.

### Pitfall 6: Tokenizer Mismatch Between Python Training and Kotlin Inference

**What goes wrong:** The native Kotlin tokenizer produces different token IDs than the Python tokenizer used during training, causing incorrect inference results.

**Why it happens:** Different WordPiece implementations, different handling of special tokens ([CLS], [SEP], [PAD]), or different normalization (lowercasing, accent stripping).

**How to avoid:**
1. Use the same vocab.txt file in both Python and Kotlin
2. Write a validation test: tokenize 20 test strings in both Python and Kotlin, compare token ID arrays
3. Use Google's official `tensorflow-lite-support` BertTokenizer which matches HuggingFace's behavior
4. Add a startup assertion that tokenizes a known string and checks the output matches expected IDs

**Warning signs:** Model produces all-safe or all-scam predictions regardless of input.

## Performance Analysis

### Pipeline Latency Breakdown (Estimated)

| Stage | Accessibility Service Path | MediaProjection + OCR Path |
|-------|---------------------------|---------------------------|
| Event detection | ~0ms (OS delivers event) | ~0ms (OS delivers frame) |
| Text extraction | 2-10ms (node tree traversal) | 100-300ms (screenshot + ML Kit OCR) |
| Content dedup check | <1ms (hash comparison) | <1ms (hash comparison) |
| Tokenization | 1-5ms (WordPiece) | 1-5ms (WordPiece) |
| TFLite inference | 15-80ms (device dependent) | 15-80ms (device dependent) |
| Overlay display | 5-15ms (WindowManager add) | 5-15ms (WindowManager add) |
| **Total** | **25-110ms** | **125-405ms** |

### TFLite Inference Estimates by Device Class

| Device Class | Example | CPU (2 threads) | NNAPI | GPU Delegate |
|-------------|---------|-----------------|-------|--------------|
| Flagship 2023+ | Pixel 8, S24 | 15-30ms | 10-20ms | 12-25ms |
| Mid-range 2022+ | Pixel 6a, A54 | 30-50ms | 20-35ms | 25-40ms |
| Budget 2021+ | Redmi Note 11 | 50-80ms | 40-60ms | Not available |

**Notes:**
- These are estimates for a ~5-10MB INT8 quantized model with 128 token sequence length
- NNAPI delegate performance varies wildly by chipset; some devices are slower with NNAPI than CPU
- GPU delegate requires float model (no INT8 support in most cases)
- Confidence: LOW -- no specific benchmarks for the canary_v3_int8 model yet

### Battery Impact Assessment

**Accessibility Service approach:**
- Idle: Near-zero (service is event-driven, not polling)
- Active browsing: ~2-5% per hour additional drain (estimated)
  - Text extraction: negligible (sub-10ms, no GPU/camera)
  - TFLite inference: moderate (~15-80ms per classification)
  - Rate-limited to max ~2 classifications per second with debouncing
- Screen off: Zero (no accessibility events)

**MediaProjection approach (for comparison):**
- Active: ~8-15% per hour additional drain
  - Continuous frame capture
  - GPU-intensive OCR processing
  - Higher CPU utilization

## Permission Flow

### Required Permissions

| Permission | Type | How to Request | User Action |
|-----------|------|---------------|-------------|
| `BIND_ACCESSIBILITY_SERVICE` | Service declaration | Declared in manifest | User enables in Settings > Accessibility |
| `SYSTEM_ALERT_WINDOW` | Special | `Settings.ACTION_MANAGE_OVERLAY_PERMISSION` intent | User toggles in Settings |
| `FOREGROUND_SERVICE` | Normal | Declared in manifest | Auto-granted |
| `FOREGROUND_SERVICE_SPECIAL_USE` | Normal | Declared in manifest | Auto-granted (reviewed by Play Store) |
| `POST_NOTIFICATIONS` | Runtime (API 33+) | `PermissionsAndroid.request()` | User approves dialog |

### Onboarding Permission Flow (Recommended Order)

```
1. POST_NOTIFICATIONS (runtime dialog -- least friction, builds trust)
     |
2. SYSTEM_ALERT_WINDOW (Settings redirect -- explain why overlays needed)
     |
3. ACCESSIBILITY_SERVICE (Settings redirect -- most sensitive, explain clearly)
     |
4. BATTERY_OPTIMIZATION_EXEMPTION (optional, Settings redirect)
```

**Key UX principles:**
- Explain each permission BEFORE requesting it (why it's needed, what it does)
- Never request all permissions at once
- Allow the user to skip and come back later
- Show a status dashboard in the app indicating which permissions are granted
- If a permission is denied, degrade gracefully (e.g., no overlay = use notification instead)

## Feasibility Assessment

### Is sub-100ms realistic?

**YES, with the Accessibility Service path.** The total pipeline (text extraction + tokenization + inference) can hit sub-100ms on flagship and mid-range devices:
- Text extraction via node tree: 2-10ms
- Tokenization: 1-5ms
- INT8 TFLite inference on flagship: 15-30ms
- Total: 18-45ms on flagship, 35-90ms on mid-range

**NO, with MediaProjection + OCR.** OCR alone takes 100-300ms, making sub-100ms impossible.

### Main Bottlenecks

1. **TFLite inference** is the dominant cost (~60-80% of pipeline time)
2. **Device heterogeneity** -- budget phones may exceed 100ms for inference alone
3. **Accessibility event volume** -- must throttle aggressively to avoid wasting cycles
4. **Model loading time** -- first inference after service start may take 200-500ms (model warm-up)

### Recommended Compromises

1. Use NNAPI delegate on supported devices, fall back to CPU with 2 threads
2. Skip classification for known-safe apps (launcher, dialer, camera, system settings)
3. On budget devices, increase debounce interval to 1000ms+ to reduce battery impact
4. Cache model in memory persistently (accept ~10MB RAM cost)

## Implementation Approach: Expo Local Module

The recommended approach is an **Expo local module** that wraps the native Kotlin service. This allows:

1. The Accessibility Service runs as a pure native Android Service subclass
2. The Expo module bridge exposes configuration APIs to React Native (enable/disable, adjust sensitivity, view stats)
3. The config plugin injects the required manifest entries and permissions
4. All detection logic stays in Kotlin -- zero JS involvement in the hot path

### Why NOT a standalone APK or separate native app

- Users expect a single app experience
- Configuration (family features, alert history) lives in the RN app
- Firebase auth context is already in the RN app
- Expo custom dev client supports native modules

### Communication: Native Service <-> RN App

| Direction | Method | Use Case |
|-----------|--------|----------|
| RN -> Native | Expo Module functions (via bridge) | Enable/disable service, update config, get stats |
| Native -> RN | SharedPreferences + BroadcastReceiver | Detection events, service status changes |
| Persistent config | SharedPreferences | Sensitivity level, excluded apps, enabled state |

The service reads configuration from SharedPreferences and does not depend on the RN bridge being active. The RN app writes to SharedPreferences and the service picks up changes on next event.

## Existing Solutions and Libraries

### React Native Libraries

| Library | GitHub | Relevance | Status |
|---------|--------|-----------|--------|
| react-native-accessibility-service | zareanmasoud/react-native-accessibility-service | Direct -- wraps Android Accessibility Service for RN | Low activity; may not support Expo SDK 54 |
| rn-android-overlay-permission | 0x1bitcrack3r/rn-android-overlay-permission | Overlay permission handling | Small library, production viability uncertain |
| react-native-background-actions | Rapsssito/react-native-background-actions | Foreground service for background JS execution | NOT suitable -- we need a native Service, not JS background execution |

**Recommendation:** Do NOT depend on these small community libraries for critical functionality. Build the native module in-house using Expo Modules API. The accessibility service and overlay logic are too critical and platform-specific to rely on unmaintained wrappers.

### How Other Apps Do It

| App | Approach | Notes |
|-----|----------|-------|
| Google Messages (scam detection) | Built into Android OS, uses on-device Gemini Nano | Has privileged system access; not replicable by third-party apps |
| Truecaller (caller ID) | Uses Accessibility Service + overlay | Has been on Play Store for years; may be grandfathered into policy |
| Samsung SmartThings | Uses device admin + accessibility | OEM privilege |
| Kaspersky Mobile | Uses Accessibility Service for phishing detection | Enterprise/security category on Play Store |

**Key insight:** Established security apps (Truecaller, Kaspersky) have used Accessibility Services successfully, but they may have special arrangements with Google or be grandfathered into older policies. New apps face stricter scrutiny as of 2026.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| TYPE_SYSTEM_ALERT overlay | TYPE_APPLICATION_OVERLAY | Android 8 (API 26) | Must use new type; old type deprecated |
| Implicit foreground service | Typed foreground service (Android 14+) | 2023 | Must declare foreground service type in manifest |
| Background service start freely | Restrictions on BG service start (Android 12+) | 2021 | Accessibility Services exempt from most BG start restrictions |
| Any app can use Accessibility API | Strict policy + review (Jan 2026) | 2025-2026 | Major policy risk for non-accessibility apps |
| react-native-fast-tflite for all inference | Native TFLite for background services | Current | JSI-based libraries cannot operate outside RN context |

## Open Questions

1. **Play Store Policy Viability**
   - What we know: Google is tightening Accessibility Service policies. Security/fraud apps are not explicitly exempted. Enforcement deadline is January 28, 2026.
   - What's unclear: Whether a well-documented scam detection app will be approved or rejected under the new policy.
   - Recommendation: Develop with Play Store submission in mind, but prepare alternative distribution channels (sideload, F-Droid, website). Consider reaching out to Google Developer Relations for guidance.

2. **Model Compatibility Between RN and Native Paths**
   - What we know: The same .tflite model file can be loaded by both react-native-fast-tflite and native TFLite Interpreter. The vocab.txt is shared.
   - What's unclear: Whether the tokenization behavior is identical between the JS tokenizer (TextTokenizer.ts) and a Kotlin BertTokenizer.
   - Recommendation: Build a cross-validation test suite that tokenizes the same 50 strings in both JS and Kotlin and asserts identical output.

3. **NNAPI Delegate Reliability**
   - What we know: NNAPI can accelerate inference on supported chipsets. Some devices are actually slower with NNAPI.
   - What's unclear: Which specific chipsets benefit and which don't.
   - Recommendation: Default to CPU (2 threads). Add NNAPI as an opt-in setting with a self-benchmark on first enable.

4. **Overlay Module History**
   - What we know: CLAUDE.md states "the overlay module was removed intentionally."
   - What's unclear: Why it was removed and whether the concerns that led to removal apply to this new use case.
   - Recommendation: Discuss with stakeholders before implementation. The system overlay use case (warning from background service) is architecturally different from an in-app overlay.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Android SDK | Native module compilation | Assumed (Expo dev) | -- | -- |
| Kotlin | Native service code | Bundled with Android Gradle Plugin | -- | -- |
| TFLite Android | Native inference | Via Gradle dependency | 2.16.1 | -- |
| Expo CLI | Module scaffolding | Assumed (project uses Expo) | -- | -- |
| Android device (API 26+) | Overlay permission, accessibility | Required | -- | No fallback for API < 26 |

**Missing dependencies with no fallback:**
- None identified. All dependencies are available via standard Android/Gradle toolchain.

**Note:** This feature is Android-only. iOS has no equivalent to Accessibility Service for reading other apps' screen content.

## Sources

### Primary (HIGH confidence)
- [Android AccessibilityService API reference](https://developer.android.com/reference/android/accessibilityservice/AccessibilityService) -- event types, node tree API
- [Android foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types) -- specialUse type for non-standard services
- [Android foreground service changes](https://developer.android.com/develop/background-work/services/fgs/changes) -- Android 14/15 restrictions
- [Expo Modules API: Get started](https://docs.expo.dev/modules/get-started/) -- local module creation
- [Create your own accessibility service](https://developer.android.com/guide/topics/ui/accessibility/service) -- official guide

### Secondary (MEDIUM confidence)
- [Google Play Accessibility Services policy](https://support.google.com/googleplay/android-developer/answer/10964491?hl=en) -- policy requirements
- [Google Play Accessibility Services Policy Update 2026](https://myappmonitor.com/blog/google-play-accessibility-services-policy-update) -- January 2026 enforcement timeline
- [Google Codelabs: Developing an Accessibility Service](https://codelabs.developers.google.com/codelabs/developing-android-a11y-service) -- implementation patterns
- [react-native-fast-tflite GitHub](https://github.com/mrousavy/react-native-fast-tflite) -- JSI architecture constraints
- [Google Security Blog: AI-Powered Scam Detection](https://security.googleblog.com/2025/03/new-ai-powered-scam-detection-features.html) -- Google's own approach

### Tertiary (LOW confidence)
- [react-native-accessibility-service](https://github.com/zareanmasoud/react-native-accessibility-service) -- community library, low activity
- TFLite inference benchmarks -- estimates extrapolated from various sources, not measured on target model
- Battery impact estimates -- based on general Android profiling knowledge, not measured

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- TFLite Android and Expo Modules API are well-documented, stable
- Architecture: MEDIUM -- the dual-layer (native service + RN app) pattern is sound but untested in this specific combination with Expo SDK 54
- Play Store policy: LOW -- the biggest risk; Google's intent is unclear for security/scam apps
- Performance estimates: LOW -- based on general benchmarks, not measured with the canary_v3_int8 model
- Pitfalls: HIGH -- these are well-known Android development challenges with documented solutions

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (30 days -- stable technologies, but Play Store policy may shift)
