# CanaryOS

## What This Is

CanaryOS is an always-on digital immune system that detects and prevents scams in real-time, entirely on-device. It combines text classification with visual heuristic analysis to catch social engineering attacks across all apps and communication channels — without ever sending screen content to a server. Built as a React Native (Expo) mobile app targeting iOS and Android.

## Core Value

On-device scam detection that works across all apps, in real time, without compromising user privacy.

## Requirements

### Validated

- [x] **FOUND-01**: App builds and runs on iOS and Android via Expo
- [x] **FOUND-02**: Firebase auth (email/password) works — login, register, session persistence
- [x] **FOUND-03**: Family feature functional — create family, invite members by code, view member list
- [x] **FOUND-04**: On-device ML pipeline scaffolded — OCR → text model → fusion engine → result
- [x] **FOUND-05**: TFLite model loads and runs via react-native-fast-tflite (JSI)
- [x] **FOUND-06**: Codebase cleaned, dead code removed, project structure established

### Active

<!-- Milestone v1.0: Text Classification Research -->

- [x] **TEXT-01**: Synthetic scam/safe dataset generated covering all major scam vectors — *Validated in Phase 1: Data Foundation*
- [ ] **TEXT-02**: Architecture benchmark completed (MobileBERT vs DistilBERT vs TinyBERT)
- [ ] **TEXT-03**: Intent classifiers trained for specific scam sub-types
- [ ] **TEXT-04**: Knowledge distillation from large teacher model (RoBERTa/DeBERTa)
- [ ] **TEXT-05**: Int8 quantization-aware training applied
- [ ] **TEXT-06**: Retrained, quantized TFLite model replaces broken model in canaryapp

### Out of Scope

- Visual classifier (MobileNetV3 CNN) — Phase 2 of research agenda, after text classifier ships
- Real-time background triggering (Accessibility Service / Share Extension) — Phase 4 of strategy
- OTA model updates via Firebase ML — deferred until model pipeline is stable
- Fusion model learning — current max-score heuristic is sufficient until both signals are reliable
- Web/desktop targets — mobile-only for now

## Context

**Current state of the text model:** The existing MobileBERT model fine-tuned on SMS spam is broken in production — input format issues and severe overfitting to narrow training data. It fails to generalize to modern scam patterns (crypto, romance, tech support, government impersonation, etc.) that don't textually resemble classic SMS spam.

**ML research approach:** All ML research work (model training, benchmarking, evaluation, distillation, analysis) MUST use Jupyter notebooks (`.ipynb`) in `research/notebooks/`. Plain `.py` scripts in `research/scripts/` are only for non-research utilities (data download, format conversion, CI validation). Validated models are exported to TFLite and copied to `canaryapp/assets/models/`. The research environment uses Python + TensorFlow + Hugging Face, separate from the React Native app.

**On-device constraints:**
- Total pipeline latency must be <100ms
- Model size target: ~50MB or less (iOS extension memory cap)
- Inference runs on-device only — text is never sent to any server
- Quantized Int8 models required for production deployment

**Architecture (from executive strategy):**
```
Screen State Change → Ingestion → [OCR | Visual CNN] → [NLP Model | Layout Heuristics]
  → Fusion Engine → Intervention (alert / warning / block)
```

**Platform-agnostic service pattern:** Services use `.ts` / `Native.ts` / `Web.ts` wrappers. The on-device ML pipeline lives in `canaryapp/services/ondevice/`.

## Constraints

- **Performance**: <100ms total pipeline latency — drives model size and architecture choices
- **Memory**: ~50MB model budget (iOS extension caps) — requires Int8 quantization
- **Privacy**: Zero server-side inference — all ML runs on device, text is ephemeral
- **Platform**: TFLite via `react-native-fast-tflite` (JSI zero-copy) — models must be TFLite-compatible
- **iOS sandboxing**: No background screen access — real-time triggering not viable until Phase 4
- **False positives**: High-precision thresholds (>0.9 for Danger) — users uninstall if annoyed

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TFLite via react-native-fast-tflite (JSI) | Zero-copy inference, no bridge serialization | ✓ Good |
| Expo managed workflow | Cross-platform, faster iteration | ✓ Good |
| Firebase as control plane | Auth + family features, not inference | ✓ Good |
| Synthetic data generation via LLM | Public datasets too narrow (SMS spam only) | ✓ Phase 1 complete — 22,942 samples, 3-model pipeline |
| MobileBERT as baseline | Reasonable tradeoff, needs benchmarking vs alternatives | — Pending |
| Knowledge distillation from RoBERTa/DeBERTa | Transfer accuracy from large to small model | — Pending |

## Current Milestone: v1.0 Text Classification Research

**Goal:** Replace the broken MobileBERT model with a research-backed, synthetically-trained scam classifier that generalizes to modern scam patterns across all major vectors.

**Target features:**
- Synthetic dataset generation via LLM (all major scam vectors)
- Architecture benchmark: MobileBERT vs DistilBERT vs TinyBERT
- Intent classifiers for scam sub-types (urgency, authority, financial, remote access, reward/lottery)
- Knowledge distillation from teacher model
- Int8 quantization-aware training
- Retrained TFLite model deployed to canaryapp

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-04 — Phase 1 Data Foundation complete*
