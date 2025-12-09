# Phase 1: Model Implementation Strategy (The Digital Lab)

## Executive Summary
This document outlines the precise technical architecture for implementing the "Digital Lab" (Static Screenshot Analysis). It serves as the blueprint for the next development phase, detailing the specific models, libraries, and external tools required to achieve high-accuracy, on-device scam detection.

## 1. The Architecture: "Hybrid-Native" Pipeline
To balance the speed of native code with the flexibility of React Native, we will use a hybrid approach.
- **Visual Analysis**: Handled by TFLite (via `react-native-fast-tflite`).
- **Text Extraction**: Handled by platform-native APIs (Google ML Kit / Vision Framework) via a wrapper.
- **Text Analysis**: Handled by TFLite (NLP model).
- **Orchestration**: JavaScript/TypeScript layer fuses the signals.

### Component Breakdown
| Component | Technology | Rationale |
| :--- | :--- | :--- |
| **OCR Engine** | `@react-native-ml-kit/text-recognition` | Superior accuracy/speed vs Tesseract. Zero-config on Android; uses Vision on iOS. |
| **Visual Model** | **MobileNetV3-Small (Quantized)** | < 20ms latency. Optimized for mobile CPUs. Sufficient for UI layout classification. |
| **NLP Model** | **MobileBERT (Quantized)** | Designed specifically for mobile constraints. 4x smaller than BERT-Base. |
| **Inference** | `react-native-fast-tflite` | JSI-based binding allows passing memory references directly to C++, checking the <100ms goal. |

---

## 2. Model Specifications

### A. Visual Classifier (The "Eye")
**Objective**: Detect suspicious UI elements (e.g., "Login Fields", "Urgency Colors", "Impersonated Logos").
*   **Architecture**: MobileNetV3-Small (Int8 Quantization).
*   **Input**: 224x224 RGB Image.
*   **Output**: Probability Vector (Safe, Login, Warning, Critical).
*   **Training Strategy (Future)**: Fine-tune a pre-trained ImageNet model on a dataset of 5,000 Phishing vs. Safe screenshots (e.g., Phishpedia dataset).

### B. Textual Classifier (The "Brain")
**Objective**: Detect semantic intent (e.g., "Urgency", "Financial Request", "Coercion").
*   **Pipeline**:
    1.  **OCR**: Extract raw text blocks.
    2.  **Preprocessing**: Normalize text (handling homoglyphs like Cyrillic 'a').
    3.  **Tokenization**: Use a JS-based WordPiece tokenizer (or C++ via JSI if JS is too slow, but JS is usually fine for <512 tokens).
    4.  **Inference**: Feed token IDs into MobileBERT.
*   **Output**: Risk Score (0.0 - 1.0).

### C. The Fusion Logic (Phase 1 Heuristic)
For Phase 1, we will use a **Weighted Heuristic Fusion** instead of a third ML model to keep simplicity.
$$ Score_{Final} = max(Score_{Visual}, Score_{Text}) $$
*Logic*: If *either* the screen looks like a fake bank OR the text says "Wire money now", flag it.

---

## 3. Implementation Roadmap for Next Agent

### Step 1: Specific Dependencies
The next agent needs to install these precise packages:
```bash
npm install @react-native-ml-kit/text-recognition
npm install react-native-fast-tflite
# Tokenizer library (e.g., @xenova/transformers or custom rigid implementation)
```

### Step 2: The "Model Bundle"
We need to create a `models/` directory in assets containing:
1.  `mobilenet_v3_scam_detect.tflite`
2.  `mobilebert_scam_intent.tflite`
3.  `vocab.txt` (for tokenizer)

### Step 3: Secure Model Delivery (Firebase)
Using **Firebase MCP**, the agent should:
1.  Upload the initial `.tflite` models to Firebase Cloud Storage.
2.  Implement a `ModelLoader` service that checks for updates on launch.
    *   *Security*: Verify the SHA-256 hash of the downloaded model before loading it into the TFLite interpreter to prevent model tampering.

---

## 4. Recommended Toolset for the AI Agent
To execute this plan, the working agent should utilize:

1.  **Firebase MCP Server** (`firebase-mcp-server`):
    *   *Usage*: Creating the Storage buckets, setting up Remote Config for model versioning, and configuring Authentication.
2.  **Context7 MCP Server** (`context7`):
    *   *Usage*: Fetching up-to-date documentation for `pytorch` (for training scripts), `tensorflow-lite` (for conversion), and `react-native-ml-kit`.
3.  **Browser Subagent**:
    *   *Usage*: If a dataset is needed, the browser agent can be tasked to find open-source phishing datasets (like Phishpedia or UCI Repo) to bootstrap the initial model training.

## 5. Security & Privacy Guardrails
*   **Sandboxing**: The OCR and Inference must happen on the `ScanService` isolated from the main logic where possible.
*   **Data Minimization**: The text extracted by OCR must be discarded immediately after the inference score is calculated. It should *never* be persisted to disk or sent to the cloud in Phase 1.
