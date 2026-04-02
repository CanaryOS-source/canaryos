# Requirements — Milestone v1.0: Text Classification Research

**Project:** CanaryOS
**Milestone:** v1.0 — Replace the broken MobileBERT model with a research-backed, synthetically-trained scam classifier that generalizes to modern scam patterns, deployed as a working TFLite model in canaryapp.
**Last updated:** 2026-04-01

---

## Active Requirements

### TEXT-01 — Synthetic Scam/Safe Dataset

**Statement:** A synthetic scam/safe training dataset is generated covering all major scam vectors, with a real-world holdout set built before any synthetic generation begins.

**Acceptance criteria:**
- Real-world holdout set of 200–500 samples collected from public sources (FTC complaint data, r/scams, PhishTank) before any synthetic generation runs
- Synthetic dataset covers all 8 scam vectors: crypto/investment (pig butchering), romance grooming, tech support, government impersonation, lottery/reward, urgency-payment, phishing, remote access
- Total synthetic sample count: 16,000–24,000 labeled samples across vectors + safe class
- Safe class contains at minimum 20–30% hard negatives (urgent-but-legitimate messages: bank alerts, delivery notifications, appointment reminders)
- Two-pass quality filter applied: (1) LLM self-consistency check — generated samples classified by zero-shot teacher, mismatches discarded; (2) rule-based post-filter removing duplicates and samples under 15 tokens
- 80/10/10 train/val/test split stratified by scam vector
- 100-sample human review completed before any model training begins
- Synthetic test split is NOT used as the sole evaluation oracle; real-world holdout is the primary metric throughout the milestone

**Phase:** Phase 1

---

### TEXT-02 — Architecture Benchmark

**Statement:** A head-to-head benchmark comparing MobileBERT, TinyBERT-4, and at least one additional candidate (ELECTRA-small or ALBERT-base-v2) is completed, selecting the student architecture for all subsequent training.

**Acceptance criteria:**
- Benchmark evaluates at minimum: MobileBERT (25.3M), TinyBERT-4 (14.5M), ELECTRA-small (14M)
- DistilBERT (66M) explicitly excluded — over budget
- Metrics recorded per architecture: F1 on held-out scam samples, INT8 model size (MB), inference latency on device (ms)
- Each candidate tested with the same tokenizer-to-model-to-output pipeline — not model in isolation with a Python tokenizer
- TFLite compatibility verified for each candidate using the standard TFLite runtime (not TensorFlow runtime); any candidate requiring SELECT_TF_OPS is disqualified from device deployment
- WordPiece vocabulary constraint enforced: only architectures sharing the BERT 30,522-token vocab qualify, preserving compatibility with existing TextTokenizer.ts
- Binary baseline trained on synthetic dataset for each candidate before distillation
- Benchmark results table produced in `research/models/benchmark_results.json`
- Student architecture selection documented with rationale

**Phase:** Phase 2

---

### TEXT-03 — Intent Classifiers for Scam Sub-Types

**Statement:** A single model with 8 sigmoid classification heads identifies which scam sub-type vectors are present in a given message.

**Acceptance criteria:**
- Intent head implemented as 8 independent sigmoid outputs on the shared student encoder — NOT 8 separate models
- Labels covered: urgency, authority, financial_request, remote_access, reward_lottery, impersonation, romance_grooming, crypto
- Intent head added after binary classifier is stable (binary F1 > 0.85 on real-world holdout)
- Per-label threshold tuning applied (class imbalance across vectors requires individual thresholds, not a shared threshold)
- Intent head evaluated on real-world holdout per label — precision and recall reported per vector
- Single forward pass produces both binary scam/safe output and 8-label intent output

**Phase:** Phase 5

---

### TEXT-04 — Knowledge Distillation from Large Teacher Model

**Statement:** A DeBERTa-v3-large teacher model is fine-tuned server-side and used to distill accuracy into the selected TinyBERT-4 student via intermediate layer transfer.

**Acceptance criteria:**
- Teacher model: microsoft/deberta-v3-large (435M params) fine-tuned on synthetic dataset, binary + multi-label heads
- Teacher achieves F1 > 0.80 on real-world holdout before distillation begins (hard gate — distillation does not proceed if this threshold is not met)
- Teacher achieves F1 > 0.95 on synthetic test set (internal quality bar)
- Distillation uses intermediate layer transfer (attention matrix + hidden state alignment) in addition to soft labels — NOT soft-labels-only
- Layer mapping defined before training: teacher layer N to student layer M via learnable linear projection (24-layer teacher to 4-layer student)
- Temperature swept across T = {2, 3, 4, 5}; optimal T selected by evaluation against real-world holdout
- Mixed distillation loss: KL divergence on temperature-scaled soft labels + cross-entropy on hard labels (alpha = 0.5 starting point)
- Distilled student achieves at least 3 F1 points improvement over direct fine-tune baseline established in TEXT-02
- Teacher checkpoint stored in `research/models/teacher_finetuned/` (gitignored)
- Student checkpoint stored in `research/models/student_finetuned/` (gitignored)

**Phase:** Phases 3 (teacher) and 4 (distillation)

---

### TEXT-05 — Int8 Quantization-Aware Training

**Statement:** Quantization-aware training (QAT) is applied to the distilled student model, producing an INT8 TFLite model that fits the on-device budget and passes dtype/shape assertions.

**Acceptance criteria:**
- QAT applied using TensorFlow Model Optimization Toolkit (TFMOT) — PTQ is explicitly prohibited
- QAT starts from the fully fine-tuned distilled student checkpoint, not from a randomly initialized model
- QAT learning rate set to 10x lower than the fine-tuning learning rate (typically 1e-6)
- QAT training runs for at minimum 2x the epochs of the original fine-tuning run
- Post-conversion assertion passes: `input_details[0]['dtype'] == numpy.int32` for token ID inputs (not float32 — the silent TFLite float32 fallback bug must be explicitly checked)
- Post-conversion assertion passes: `output_details[0]['dtype'] == numpy.float32`, output shape `[1, 2]`, scam class index documented
- Round-trip test passes: 5 known-safe and 5 known-scam texts processed through Python tokenizer → TFLite interpreter → scores differ from pre-conversion model by less than 0.05 absolute on scam probability
- Quantized model size: target <= 10MB (TinyBERT-4 INT8 budget); hard reject if > 20MB
- Accuracy degradation from FP32 baseline: target <= 1.5% F1 drop; hard reject if > 3%

**Phase:** Phase 6

---

### TEXT-06 — Retrained TFLite Model Deployed to canaryapp

**Statement:** The validated INT8 TFLite model replaces the broken model in canaryapp/assets/models/, the app loads it correctly, and inference produces plausible scam/safe scores on known test inputs.

**Acceptance criteria:**
- Model passes research evaluation gate: F1 >= 0.92 on held-out scam vectors in `research/scripts/evaluate_model.py`
- Old `mobilebert_scam_intent.tflite` (26.7MB broken model) deleted before new model is copied — no stale file in assets
- New model copied to `canaryapp/assets/models/mobilebert_scam_intent.tflite` (filename kept stable — contract for ModelLoaderService.ts)
- `vocab.txt` updated only if architecture requires a non-BERT-base vocabulary; TinyBERT-4 uses the same 30,522-token WordPiece vocab as existing file (no change expected)
- `DEFAULT_MODEL_CONFIG.textModel` in `canaryapp/services/ondevice/types.ts` updated with correct name and version
- Startup shape assertion added to `TextClassifierService.ts`: `model.inputs[0].shape[1] === EXPECTED_SEQUENCE_LENGTH` throws descriptive error on mismatch
- If TinyBERT-4 exports 3 inputs (with token_type_ids), the 3-input guard added to `classifyWithModel()` in `TextClassifierService.ts`
- App loads model without error: `[ModelLoader] Text model loaded in Xms` visible in logs
- App logs correct input shape `[1, 128]` and dtype `int32`
- Manual test with 5 known-scam texts: scam probability >= 0.7 on at least 4 of 5
- Manual test with 5 known-safe texts: scam probability <= 0.3 on at least 4 of 5
- `npx expo start --clear` run after model swap to force Metro cache invalidation
- Model SHA-256 hash updated in `ModelLoaderService.ts` MODEL_HASHES (replacing placeholder)
- Debug panel (`debugSection` in `index.tsx`) gated behind `__DEV__` before deployment
- App bundle size regression check: no `.tflite` file in `canaryapp/assets/models/` exceeds 20MB

**Phase:** Phase 6

---

## Out of Scope (Milestone v1.0)

| Item | Reason | Deferred To |
|------|--------|-------------|
| Visual classifier (MobileNetV3 CNN) | Phase 2 of research agenda — depends on text classifier being stable | Milestone v2.0 |
| Real-time background triggering (Accessibility Service / Share Extension) | iOS sandboxing prevents background screen access; requires Phase 4 strategy | Milestone v4.0 |
| OTA model updates via Firebase ML | `downloadModel()` in ModelLoaderService.ts is unwired; defer until pipeline is stable | Post-v1.0 |
| Fusion model learning (learned weights) | Current max-score heuristic is sufficient until both text and visual signals are reliable | Post-v2.0 |
| ModernBERT (149M params, SOTA Dec 2024) | No TFLite conversion path exists; too large for 50MB budget | Milestone v2.0 (CoreML evaluation) |
| Per-vector confidence calibration (Platt scaling / temperature scaling) | Requires multi-label head to exist first; follow-on step after TEXT-03 | Post-TEXT-03 sprint |
| OOD robustness (explicit hard-negative mining post-training) | Hard negatives are built into TEXT-01 dataset; dedicated OOD evaluation pass deferred | After v1.0 ships |
| Web/desktop targets | Mobile-only for this milestone | — |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TEXT-01 | Phase 1: Data Foundation | Pending |
| TEXT-02 | Phase 2: Architecture Benchmark | Pending |
| TEXT-04 (teacher) | Phase 3: Teacher Fine-Tuning | Pending |
| TEXT-04 (distillation) | Phase 4: Knowledge Distillation | Pending |
| TEXT-03 | Phase 5: Multi-Label Intent Head | Pending |
| TEXT-05 | Phase 6: QAT + TFLite Deployment | Pending |
| TEXT-06 | Phase 6: QAT + TFLite Deployment | Pending |
