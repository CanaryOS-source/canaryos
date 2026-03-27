# CanaryOS Executive Strategy

## Vision

CanaryOS is an always-on digital immune system that detects and prevents scams in real-time, entirely on-device. It combines text classification with visual heuristic analysis to catch social engineering attacks across all apps and communication channels without compromising user privacy.

## Core Technical Thesis

Modern scams are multimodal — they combine deceptive text (urgency, authority, financial requests) with visual mimicry (fake login pages, spoofed logos, counterfeit UI elements). Effective detection requires fusing both signals. By running lightweight ML models directly on the device, triggered by meaningful screen state changes ("page shifts"), CanaryOS can intervene before a user completes a dangerous action — without ever sending sensitive screen content to a server.

## Architecture Overview

```
Screen State Change (page shift / user action)
         |
         v
  ┌──────────────┐
  │   Ingestion   │  Capture frame, downscale to model input size
  └──────┬───────┘
         |
    ┌────┴────┐
    v         v
┌────────┐ ┌────────┐
│  OCR   │ │ Visual │  Parallel analysis paths
│ (Text) │ │ (CNN)  │
└───┬────┘ └───┬────┘
    v          v
┌────────┐ ┌────────┐
│  NLP   │ │ Layout │  Intent classification + UI anomaly detection
│ Model  │ │ Heur.  │
└───┬────┘ └───┬────┘
    └────┬─────┘
         v
  ┌──────────────┐
  │ Fusion Engine │  Combine signals into confidence score
  └──────┬───────┘
         v
  ┌──────────────┐
  │  Intervention │  Alert, warning, or block based on severity
  └──────────────┘
```

**Key technology choices:**
- React Native (Expo) for cross-platform app development
- TFLite via `react-native-fast-tflite` for JSI-based zero-copy inference
- Google ML Kit for OCR (Android), Vision Framework (iOS)
- Firebase as control plane (auth, model distribution, anonymized threat data)

## Research Agenda

### 1. Text Classification
**Current state:** MobileBERT fine-tuned on scam text corpus, running via TFLite. Has known issues with accuracy and model input format.

**Research priorities:**
- Curate and expand the training dataset (phishing SMS, scam emails, social engineering scripts)
- Evaluate MobileBERT vs. DistilBERT vs. TinyBERT for accuracy-latency tradeoff
- Implement knowledge distillation from a larger teacher model (RoBERTa/DeBERTa)
- Train intent classifiers for specific scam vectors: urgency, authority, financial request, remote access, reward/lottery
- Quantization-aware training (Int8) for model size and speed

### 2. Visual Heuristic Engine
**Current state:** Architecture scaffolded (VisualClassifierService.ts) but no trained visual model.

**Research priorities:**
- Define the visual scam taxonomy (fake login pages, urgent pop-ups, spoofed brand UIs, suspicious overlays)
- Evaluate MobileNetV3-Small for UI layout classification
- Investigate metric learning (triplet loss) for visual similarity to detect brand impersonation
- Logo detection using lightweight object detection (SSDLite/YOLOv8-Nano) for top impersonated brands
- Dataset sourcing: Phishpedia, manual screenshot collection, synthetic generation

### 3. Fusion Strategy
**Current state:** Basic heuristic fusion engine exists (max of text/visual scores).

**Research priorities:**
- Design signal combination rules that account for context (app type, URL patterns, interaction state)
- Evaluate Bayesian scoring vs. learned fusion model vs. rule-based heuristics
- Define confidence thresholds: Safe (0-0.2), Caution (0.2-0.6), Warning (0.6-0.8), Danger (0.8-1.0)
- Reduce false positives: personal whitelists, app-aware context, calibration using high-precision thresholds

### 4. Trigger Mechanism
**Current state:** Manual (user uploads screenshot). No automated triggering.

**Research priorities:**
- Android: Accessibility Service events (`TYPE_WINDOW_CONTENT_CHANGED`) with settle detection
- iOS: Share Extension and potential Broadcast Upload Extension approaches
- "Page shift" detection heuristic (major content change vs. minor scroll)
- Duty cycling strategy to balance detection coverage with battery life
- Evaluate alternative trigger signals beyond screen content changes

## Development Phases

### Phase 1: Foundation (Current)
**Goal:** Clean, stable app with a working text classifier for user-initiated screenshot analysis.

- Clean codebase and establish project structure
- Fix known text model issues (input format, accuracy)
- Ensure the scan -> OCR -> classify -> result pipeline works end-to-end
- Family feature functional for multi-user protection

### Phase 2: Research
**Goal:** Develop and validate improved models in isolation before app integration.

- Train improved text classifiers with expanded datasets
- Develop and train visual classification model
- Design and test fusion strategies
- Benchmark all models for latency (<100ms total pipeline) and accuracy
- All work happens in `research/` directory with Jupyter notebooks

### Phase 3: Integration
**Goal:** Wire validated research outputs into the mobile app.

- Replace/upgrade production models in `canaryapp/assets/models/`
- Integrate visual classifier into the on-device pipeline
- Implement improved fusion engine
- End-to-end testing on real devices (latency, accuracy, battery impact)

### Phase 4: Real-Time
**Goal:** Background protection with automated triggering and intervention UI.

- Android: Implement Accessibility Service + MediaProjection for background scanning
- iOS: Implement Share Extension for streamlined user-initiated analysis
- System Alert Window overlay (Android) for real-time intervention
- NPU delegate optimization for sustained background operation
- Battery and thermal management (duty cycling, adaptive scan frequency)

## Technical Constraints

| Constraint | Impact | Mitigation |
|------------|--------|------------|
| Battery drain | Background ML kills battery in <4hrs | Duty cycling, NPU delegates, event-driven scanning |
| iOS sandboxing | No background screen access | Share Extensions, user-initiated flows |
| Memory limits | iOS extensions capped at ~50MB | Aggressive Int8 quantization, memory-mapped model loading |
| Bridge latency | React Native bridge serialization freezes UI | JSI/TurboModules for zero-copy native memory access |
| False positives | Users uninstall if annoyed | High-precision thresholds (>0.9 for Danger), personal whitelists |
| Adversarial attacks | Scammers try to evade detection | Adversarial training, homoglyph normalization, multi-signal fusion |

## Open Questions

- **Model architecture:** Is MobileBERT the best tradeoff, or should we evaluate newer architectures (e.g., distilled versions of more recent models)?
- **Dataset sourcing:** Where do we get high-quality labeled scam/safe training data at scale? Synthetic generation? Community contribution?
- **Trigger design:** What defines a "page shift" in practice? How do we distinguish meaningful state changes from noise?
- **iOS real-time:** Given iOS restrictions, is there a viable path to near-real-time protection beyond Share Extensions?
- **Fusion model:** Should the fusion engine eventually be a learned model itself, or are handcrafted rules more interpretable and maintainable?
- **Model updates:** How do we handle OTA model updates without app store releases? Firebase ML Custom Model Downloader vs. bundled models?

## Privacy & Security Principles

- All ML inference happens on-device. Screen content is never sent to any server.
- Extracted text is ephemeral — discarded immediately after inference.
- Cloud services are limited to: authentication, model distribution, anonymized threat reputation data.
- PII redaction before any optional cloud communication.
- Granular, explicit permission UIs during onboarding.
