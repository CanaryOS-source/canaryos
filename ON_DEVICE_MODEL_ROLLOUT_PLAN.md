# On-Device Model Implementation Rollout Plan

## Executive Summary
**Objective**: Build a high-agency multimodal scam detection system for Canary OS.
**Philosophy**: "Crawl, Walk, Run." We will cut complexity by starting with a robust, user-initiated analysis tool before tackling the engineering challenges of real-time background protection.
**Tech Stack**: React Native (Expo) + `react-native-fast-tflite` (JSI).

---

## Phase 1: The "Digital Lab" (Weeks 1-3)
**Goal**: Enable on-device classification of *uploaded* screenshots.
**Use Case**: User takes a screenshot of a suspicious text/website, opens Canary OS, uploads it, and gets an instant "Safe" or "Scam" verdict.

### Implementation Steps
1.  **Dependency Setup**:
    *   Install `react-native-fast-tflite` for hardware-accelerated inference.
    *   Configure `expo-image-picker` for gallery access.
2.  **Model Integration**:
    *   Deploy a quantized MobileNetV3 (Visual) and DistilBERT/TinyBERT (Text) model to Firebase Storage.
    *   Implement logic to download models on app launch.
3.  **Core Logic**:
    *   **Ingestion**: Convert image to tensor.
    *   **Inference**: Run standard classification pass.
    *   **Result**: Display probability score (0-100% Risk).

### Benefit
*   **Immediate Value**: Users can verify suspicious content immediately.
*   **Low Risk**: No complex background services or battery drain issues yet.
*   **Validation**: Verifies our model accuracy before we automate it.

---

## Phase 2: The "Background Sentinel" (Weeks 3-6)
**Goal**: Automated scanning and system integration.
**Use Case**: Android scans silently in background; iOS users use "Share to Canary" from other apps.

### Implementation Steps
1.  **Android Accessibility Service**:
    *   Create a native module to listen for `TYPE_WINDOW_CONTENT_CHANGED`.
    *   Trigger scans only on "settle" (when scrolling stops).
2.  **iOS Share Extension**:
    *   Create a Share Extension target.
    *   Share memory with the main app to run the model without launching the full UI.
3.  **Fusion Engine**:
    *   Combine visual signals (OCR + CNN) with "context" (e.g., package name `com.whatsapp` vs `org.telegram`).

### Benefit
*   **Frictionless**: Protection becomes passive (Android) or streamlined (iOS).
*   **Data Loop**: Start collecting "False Positives" to retrain the model.

---

## Phase 3: Real-Time "God Mode" (Weeks 7+)
**Goal**: <100ms latency protection and full "High Agency" intervention.
**Use Case**: A red overlay blocks the screen *before* the user can click a phishing link.

### Implementation Steps
1.  **Optimization**:
    *   Implement "Duty Cycling" (scan every 500ms, not every frame).
    *   Use Neural Processing Unit (NPU) delegates strictly.
2.  **Intervention UI**:
    *   Android: "System Alert Window" overlay.
    *   iOS: Local Push Notifications with "Critical" entitlement.

### Benefit
*   **Ultimate Safety**: Proactive prevention of financial loss.

---

## Immediate Next Actions
We will begin with **Phase 1**.
1.  [ ] Setup `react-native-fast-tflite`.
2.  [ ] Create `ScreenScanner` component.
3.  [ ] Wire up a placeholder model (or simple mobile-net) to test the pipeline.
