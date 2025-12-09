Technical Architecture and Strategic Implementation of Canary OS ML models

1. Executive Overview and Architectural Philosophy
The proposed system architecture acknowledges the "Hard constraints" of mobile operating systems.1 While Android allows for deep system integration via Accessibility Services, iOS imposes strict sandboxing that necessitates a creative reliance on App Extensions and user-initiated actions. By leveraging React Native for the orchestration layer and cross-platform UI, while dropping down to native C++ and OS-specific ML accelerators (NNAPI on Android, Core ML on iOS) for the heavy lifting, Canary OS can achieve the low-latency performance required to intervene before a user falls victim to a scam.1
The implementation strategy detailed herein prioritizes a "privacy-by-design" philosophy. The analysis of sensitive screen content—financial dashboards, private messages, and emails—must occur locally. The cloud, represented by Firebase, serves strictly as a control plane for model distribution, authentication, and anonymized reputation lookups, rather than a processing center for raw user data. This approach not only satisfies stringent regulatory frameworks like GDPR and CCPA but also builds the user trust necessary for an application requesting such elevated permissions.1
2. The Threat Landscape and Requirement Analysis
To design an effective classification engine, one must first understand the adversary. Scams are no longer static "Nigerian Prince" emails; they are dynamic, multi-modal interactions.
2.1 Taxonomy of Modern Digital Fraud
The data suggests a migration of fraud from simple technical exploits (malware) to psychological exploitation (social engineering). The Canary OS detection pipeline must address several distinct archetypes identified in the research:
The "Urgency" Vector: Scams that demand immediate action to override critical thinking. This often manifests textually as "Your account will be suspended in 24 hours" or visually as fake countdown timers and high-contrast warning colors (red/yellow). The ML model must detect the semantic concept of urgency.1
The "Authority" Vector: Impersonation of trusted entities (banks, government bodies, tech support). The visual classifier must recognize the misuse of logos (e.g., a Chase Bank logo in a browser window that is not chase.com) and the textual model must identify authoritative scripts.1
The "Reward" Vector: Investment scams, crypto doublers, and "you've won" lottery notifications. These rely on greed and often use specific visual cues like ascending green charts or luxury imagery.
The "Remote Access" Vector: A critical threat where scammers coerce users into installing tools like AnyDesk or TeamViewer. The system must detect the specific iconography and textual prompts associated with these applications when they appear in a conversational context.1
2.2 System Requirements and Constraints
The "High Agency" goal implies a system that is always watching, yet the "Hard constraints" of battery life and OS policy dictate a more nuanced approach.1
2.2.1 Latency Requirements
For a warning to be effective, it must appear before the user completes a hazardous action (clicking a link, copying an OTP). Psychological research suggests a reaction time window of approximately 500ms to 2 seconds. Therefore, the total inference time for the screenshot analysis pipeline—capture, pre-processing, OCR, classification, and fusion—must ideally remain under 100ms to allow for smooth UI updates and immediate intervention.1
2.2.2 The "Brownfield" React Native Constraint
Building this system in React Native offers velocity but introduces a "bridge" bottleneck. Standard React Native communicates between the JavaScript (JS) thread and the Native (Host) platform via an asynchronous bridge that serializes messages to JSON. Passing a 4MB bitmap (screenshot) across this bridge as a base64 string will freeze the UI and destroy battery life.
Requirement: The architecture must utilize the React Native New Architecture (Fabric and TurboModules) or the JavaScript Interface (JSI) to allow the JavaScript realm to hold references to native memory buffers (HostObjects) without serialization. The ML inference must happen on a background thread, not the JS thread.
2.2.3 OS-Specific Ingestion Constraints
Android: The system can utilize AccessibilityService to read the view hierarchy directly (text capture) and MediaProjection for pixel capture. The research notes the capability to run a "Foreground Service" to keep the app alive.1
iOS: The system is far more restricted. Background screen recording is prohibited for third-party apps. The solution must rely on "Share Extensions" (user manually shares a screenshot) or "Broadcast Upload Extensions" (user activates a control center toggle). This fundamental difference necessitates a bifurcated ingestion pipeline where Android is proactive and iOS is often reactive or user-initiated.1
3. The React Native and Firebase Ecosystem Architecture
The choice of React Native (RN) and Firebase provides a robust foundation for rapid development and cloud synchronization, but it requires careful architectural planning to support high-performance ML.
3.1 The Hybrid Bridge Architecture
To meet the requirement of classifying screenshots within a React Native app, we cannot rely on pure JavaScript implementations of ML models (e.g., TensorFlow.js), as they lack access to hardware acceleration (GPU/NPU) and run on the single-threaded JS engine. Instead, the architecture must implement a "Native Module" pattern.
3.1.1 The JSI (JavaScript Interface) Layer
The JSI allows C++ code to register functions directly into the JavaScript runtime. This is the critical conduit for Canary OS.
Mechanism: When a screenshot is captured (via native code), a pointer to that image buffer is wrapped in a C++ HostObject.
Zero-Copy Passing: This HostObject reference is passed to the JavaScript layer. The JS code can then pass this reference back to a different C++ function (the ML Inference Engine) without ever copying the pixel data.
Relevance: This enables the React Native app to orchestrate the pipeline—deciding when to scan based on user settings—while the heavy lifting of OCR and Classification stays in efficient native memory.
3.2 Firebase as the Control Plane
While the "High Agency" mandate requires on-device processing 1, Firebase is essential for the management and evolution of the system.
3.2.1 Firebase ML and Model Distribution
Canary OS will utilize Firebase ML Custom Model Downloader.
Workflow: The ML team trains models (PyTorch/TensorFlow) and converts them to TFLite (Android) and Core ML (iOS) formats. These artifacts are uploaded to Firebase Cloud Storage.
Dynamic Updates: The app checks for model updates on launch. This allows the team to ship improved detection logic (e.g., a new model trained on a freshly emerged "AI Voice" scam) instantly without waiting for a full App Store review cycle.1
Versioning: Firebase Remote Config can be used to A/B test different model versions (e.g., v1.2_conservative vs. v1.2_aggressive) to find the optimal balance between sensitivity and false positives.
3.2.2 Firestore and User Reporting
The "Community Intelligence" aspect 1 relies on Firestore.
Schema: When a user flags a scam that the model missed (False Negative), a report is generated.
Privacy-Preserving Upload: The raw screenshot is never uploaded automatically. The app generates a hashed signature of the text and visual features. Only if the user explicitly consents to "Help improve Canary OS" is the raw data encrypted and uploaded to a restricted Cloud Storage bucket for retraining.
Global Blacklists: A Cloud Function aggregates confirmed scam reports and updates a global "Bloom Filter" of malicious URLs and phone numbers, which devices download periodically.
3.2.3 Authentication and Subscription
Firebase Auth manages user identity, linking their subscription status (handled via RevenueCat or similar, integrated with Firebase) to their ability to access premium "Deep Scan" features.
4. Technical Research: On-Device Computer Vision (Visual Classification)
The first half of the classification problem is visual: Does this screenshot look like a scam? This involves analyzing the UI layout, logos, and iconography.
4.1 Ingestion Pipeline: Getting the Pixels
Before analysis, the app must acquire the frame.
Android Implementation: A MediaProjection service runs in the foreground. To conserve battery, it does not capture at 60fps. Instead, it listens to AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED. When the screen settles (scroll stops), a frame is captured.
Optimization: The frame is downscaled immediately. A 1080p screen is unnecessary for classification; a 224x224 or 320x320 resolution is standard for CNN inputs.
iOS Implementation: The app utilizes a Share Extension. When the user screenshots a suspicious text, they tap "Share to Canary." The extension receives the UIImage, downscales it, and passes it to the Core ML runner embedded in the extension.
Constraint: Extensions have a strictly limited memory footprint (often <50MB). The models used here must be highly quantized to avoid crashing the extension.1
4.2 Optical Character Recognition (OCR)
To understand the text, we must extract it.
Technology Selection: Google's ML Kit (On-Device) for Android and Apple's Vision Framework for iOS are the superior choices over Tesseract or other open-source libraries. They are hardware-accelerated and optimized by the OS vendors.
React Native Integration: The @react-native-ml-kit/text-recognition library can be used, but for performance, we should invoke the native APIs directly via the JSI bridge established in Section 3.1.
Output Data: The OCR engine returns a list of TextBlock objects. Crucially, we must preserve the spatial data (bounding boxes). A "Login" button text is only suspicious if it appears in a non-standard location or overlaying a different app.
4.3 The Visual Classifier: Convolutional Neural Networks (CNNs)
We need a model to classify the visual intent of the screen (e.g., "Login Page," "Chat Interface," "Bank Dashboard," "Pop-up Warning").
4.3.1 Model Architecture: MobileNetV3 vs. EfficientNet
For mobile deployment, parameter count and FLOPs (Floating Point Operations) are key.
Recommendation: MobileNetV3-Small.
Why: It utilizes "inverted residual blocks" and "linear bottlenecks" specifically tuned for mobile CPUs. It also employs "Squeeze-and-Excitation" (SE) layers that weigh channel importance with minimal computational cost.
Size: Approx 2-3 MB in size (Quantized).
Latency: < 20ms on modern Snapdragons.
4.3.2 Training Strategy: Triplet Loss for UI Similarity
Standard classification (Softmax) is brittle. A better approach for scam detection is Metric Learning.
Concept: We want the model to learn a "visual embedding" space where all "Chase Bank Login" screens cluster together.
Triplet Loss: During training, we feed the model three images:
Anchor: A real Bank of America app screen.
Positive: A different screenshot of the real Bank of America app.
Negative: A phishing site mimicking Bank of America.
Outcome: The model learns to output a vector where the distance between the real app and the phishing site is maximized. If a user is in a browser (checked via Accessibility Service) but the visual embedding matches a "Banking App" cluster, it is a high-confidence phishing indicator.
4.4 Logo Detection
A specialized object detection model (e.g., SSDLite or YOLOv8-Nano) is trained on the top 100 most impersonated brands (PayPal, Amazon, Microsoft, Chase, etc.).
Function: If the model detects the "PayPal" logo, but the OCR extracts a URL containing paypal-support-verify.com, the mismatch triggers a high risk score.
5. Technical Research: On-Device NLP & Semantic Analysis (Textual Classification)
The second half of the problem is textual: Does the language used imply a scam?
5.1 The Challenge of Mobile NLP
Large Language Models (LLMs) like GPT-4 are too large for on-device inference. Even "small" LLMs (Llama-3-8B) require 4GB+ of RAM, which is unacceptable for a background service.
5.2 Knowledge Distillation: The Teacher-Student Approach
To achieve high accuracy with low latency, Canary OS will employ Knowledge Distillation.1
Teacher: A massive server-side model (e.g., RoBERTa-Large or DeBERTa-v3) trained on millions of scam and benign texts.
Student: A highly compact architecture, such as DistilBERT or TinyBERT (approx. 14M to 66M parameters).
Training: The Student is trained to mimic the probability distributions (logits) of the Teacher. It learns the "reasoning" of the large model without needing the massive parameter count.
5.3 Quantization: Shrinking the Model
To fit the model into the React Native bundle and ensure it runs within the <100ms budget:
Int8 Quantization: We convert the model weights from 32-bit floating-point numbers (FP32) to 8-bit integers (Int8). This reduces the model size by 4x.
Quantization-Aware Training (QAT): We simulate the precision loss during the training phase. This allows the neural network to adjust its weights to compensate for the lower precision, maintaining near-FP32 accuracy.
Frameworks:
Android: TensorFlow Lite Model Maker supports QAT out of the box.
iOS: Core ML Tools (coremltools) provides a robust quantization suite.
5.4 Intent Classification Taxonomy
The NLP model classifies the extracted text into specific intent vectors. The research highlights several key categories 1:
Urgency/Coercion: ("Act now", "Police on way").
Financial Transaction: ("Wire transfer", "Gift card code").
Authentication: ("Verify password", "Send OTP").
Remote Access: ("Download AnyDesk", "Start screen share").
5.5 Input Pipeline: Tokenization
Tokenization (converting text to numbers) is a common trap in React Native.
Problem: Most tokenizers are written in Python. A JavaScript implementation is slow.
Solution: Use the TFLite Support Library (Android) and NaturalLanguage framework (iOS) or a C++ tokenizer implementation linked via JSI. This ensures that the preprocessing step does not become a bottleneck.
6. The Risk Fusion Engine: Planning the Confidence Rating
Accurately classifying a screenshot requires fusing the visual and textual signals. A single signal is often insufficient (e.g., a "Login" screen is not inherently bad; "Urgency" in a work email is normal).
6.1 The Fusion Architecture
We define a fusion function $F$ that takes inputs from the various sub-modules and outputs a Confidence Score $C \in $.
Inputs:
$P_{text}$: Probability vector from NLP model (e.g., $0.9$ Urgency).
$P_{visual}$: Probability vector from CNN (e.g., $0.8$ Banking UI).
$R_{meta}$: Reputation score from Bloom Filter (0 = Safe, 1 = Known Malicious).
$C_{context}$: Heuristic context flags (e.g., App Package Name).
6.2 The Bayesian Scoring Logic
The system uses a Bayesian update rule to adjust the probability of a scam given the evidence.
Signal Combination
Interpretation
Risk Score Calculation
Urgency Text + Unknown Number
Typical SMS Phishing
$0.6 + (0.4 \times 0.5) = 0.8$
Banking UI + Browser App + Bad URL
Phishing Site
1.0 (Critical)
Banking UI + Official Bank App
Legitimate Usage
0.0 (Safe)
Remote Access Text + Phone Call Active
Tech Support Scam
$0.5 + 0.4 = 0.9$


6.3 The "Bloom Filter" for Reputation
1

To check URLs and phone numbers without privacy-invading API calls:
Structure: A bit array of size $m$.
Operation: Hash the extracted URL/Number $k$ times. Check if all bits at those indices are 1.
Property: If the filter says "No," the URL is definitely not in the blacklist. If it says "Yes," it might be (small false positive rate).
Integration: If "Yes," the app performs a secondary, anonymous DNS lookup to confirm, or treats it as high-risk if offline.
6.4 Confidence Rating Levels
The final output is mapped to user-facing states 1:
Safe ($0.0 - 0.2$): No action.
Caution ($0.2 - 0.6$): Subtle indicator (e.g., yellow icon in status bar). "This looks like a generic spam message."
Warning ($0.6 - 0.8$): Heads-up notification. "Suspicious request detected."
Danger ($0.8 - 1.0$): Full-screen intervention. "SCAM DETECTED: Do not send money."
7. Privacy, Security, and Compliance
The user grants Canary OS "God-mode" permissions. The architecture must justify this trust.
7.1 Data Residency and Privacy
Local-First Processing: All ML inference (Stages 1-4) occurs strictly on the device. The screenshot bitmap is destroyed immediately after inference.
Ephemeral Buffers: As noted in the research, audio and screen data should be stored in rolling buffers (e.g., keeping only the last 30 seconds) that are constantly overwritten.1
PII Redaction: Before any optional cloud verification or logging, a lightweight Regex and Named Entity Recognition (NER) model strips credit card numbers, SSNs, and names.
7.2 Legal Compliance (Wiretapping Laws)
The research explicitly mentions the variation in US state laws (One-party vs. Two-party consent).1
Constraint: Automatically recording audio or transcribing calls can be a felony in states like California if the other party is not notified.
Technical Mitigation:
Geofencing: The app checks the device locale/SIM region. In two-party states, the "Audio Protection" feature defaults to "Off" or switches to a mode where it only analyzes incoming audio (which is sometimes legally distinct) or requires the user to play a pre-recorded disclaimer ("This call is being monitored for scam protection").
User Consent UI: During onboarding, explicit, granular permission screens must explain exactly what is captured.
7.3 Adversarial Robustness
Scammers will try to defeat Canary OS.
Adversarial Examples: Scammers might overlay imperceptible noise on a phishing site to trick the CNN into seeing it as "Safe."
Defense: Train the models with Adversarial Training (injecting noise during the learning process).
Homoglyph Attacks: Using Cyrillic 'a' instead of Latin 'a' in text.
Defense: The text preprocessing pipeline includes a "Confusables Normalization" step (Unicode normalization) before the text reaches the NLP model.
8. Implementation Roadmap and Engineering Challenges
8.1 Phase 1: The Foundation (Android First)
The research suggests an "Android First" MVP due to the "High Agency" capabilities.1
Goal: Build the React Native app with a native module for AccessibilityService.
Task: Implement the "Keyword Filter" (Stage 1). This is a simple Regex engine running on notification text.
Infrastructure: Set up Firebase Auth and the Firestore database for the global blacklist.
8.2 Phase 2: The Core ML Pipeline
Goal: Integrate TFLite (Android) and Core ML (iOS).
Task: Train and distill the "Student" BERT model. Implement the JSI bridge to pass screenshot data to the TFLite interpreter without freezing the UI.
Feature: Launch "Screenshot Analysis" where users share a screenshot to the app.
8.3 Phase 3: Real-Time & Cross-Platform Fusion
Goal: Full real-time protection.
Task: Implement the MediaProjection service on Android. Implement the "Live Activity" on iOS to show protection status.
Feature: Activate the "Risk Fusion Engine" to combine visual and textual signals.
8.4 Engineering Challenges & Solutions

Challenge
Impact
Technical Solution
Battery Drain
High CPU usage kills battery in <4 hours.
Duty Cycling: Only scan on scroll events. Use NPU delegates. VAD: Only process audio when speech is detected.1
False Positives
User uninstalls due to annoyance.
Personal Whitelist: "Mark as Safe" button updates local DB. Calibration: Use high precision thresholds (>0.9) for "Danger" alerts initially.
iOS Memory
Extension crashes if >50MB RAM used.
Quantization: Aggressive Int8 quantization. Mapped Memory: Load models using mmap to avoid duplicating memory.
Bridge Latency
UI freezes during scan.
TurboModules / JSI: Direct C++ memory access. Move inference to a background thread (std::thread in C++).

9. Conclusion
Canary OS represents a technically ambitious but feasible convergence of mobile systems engineering and modern AI. By consolidating the fragmented landscape of scam prevention into a single "High Agency" layer, it addresses the critical gaps in current user protection. The key to success lies not just in the accuracy of the models, but in the efficiency of the engineering—specifically, the skillful integration of React Native's development velocity with the raw performance of native on-device ML accelerators.
The roadmap defined above—moving from regex-based filters to distilled Transformer models, and from manual reporting to automated, privacy-preserving risk fusion—provides a clear path to accurate, confident scam classification. With the proper adherence to privacy constraints and a robust data loop via Firebase, Canary OS can evolve from a simple utility into an essential digital immune system.

