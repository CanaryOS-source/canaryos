# Roadmap — Milestone v1.0: Text Classification Research

**Project:** CanaryOS
**Milestone goal:** Replace the broken MobileBERT model with a research-backed, synthetically-trained scam classifier that generalizes to modern scam patterns, deployed as a working TFLite model in canaryapp.
**Granularity:** Standard (6 phases derived from dependency constraints)
**Last updated:** 2026-04-04

---

## Phases

- [ ] **Phase 1: Data Foundation** — Build real-world holdout set and generate synthetic training dataset
- [x] **Phase 2: Architecture Benchmark** — Validate student architecture selection with binary baseline (completed 2026-04-04)
- [x] **Phase 3: Teacher Fine-Tuning** — Fine-tune DeBERTa-v3-large server-side to F1 > 0.95 gate (completed 2026-04-04)
- [ ] **Phase 4: Knowledge Distillation** — Distill teacher accuracy into MobileBERT student via intermediate layer transfer
- [ ] **Phase 5: Multi-Label Intent Head** — Add 8 sigmoid heads to the stable binary classifier
- [ ] **Phase 6: QAT + TFLite Deployment** — Quantize, export, validate, and deploy to canaryapp

---

## Phase Details

### Phase 1: Data Foundation
**Goal:** A validated training dataset exists that covers all 8 modern scam vectors, is anchored by real-world examples, and has a clean holdout set that will serve as the evaluation oracle for all downstream phases.
**Depends on:** Nothing (first phase)
**Requirements:** TEXT-01

**Success Criteria** (what must be TRUE):
  1. A real-world holdout set of 200-500 samples from public sources (FTC, r/scams, PhishTank) is collected and locked before any synthetic generation begins -- this set is never used for training
  2. Synthetic dataset contains 16,000-24,000 labeled samples spanning all 8 vectors (crypto/investment, romance grooming, tech support, government impersonation, lottery/reward, urgency-payment, phishing, remote access) plus a safe class where 20-30% are hard negatives
  3. Two-pass quality filter is applied: LLM self-consistency check discards label-inconsistent samples; rule-based filter removes duplicates and sub-15-token samples
  4. 100-sample human review is completed and no obvious mode collapse or topical over-specificity is found (e.g., all crypto scam examples do not share identical surface vocabulary)
  5. Train/val/test split (80/10/10) is stratified by vector and saved to `research/data/synthetic_scam_v1.jsonl` and `research/data/test_split.jsonl`

**Plans:** 3/3 plans executed

Plans:
- [x] 01-01-PLAN.md — Validation scaffolding + real-world holdout collection
- [x] 01-02-PLAN.md — Two-model synthetic dataset generation (Gemini + Ollama)
- [x] 01-03-PLAN.md — Quality filter, JSD gate, stratified split, human review

**Research refs:** `.planning/research/FEATURES.md` (scam vector taxonomy, hard negative rationale, dataset sources), `.planning/research/PITFALLS.md` (Pitfalls 1.1-1.4: evaluation contamination, mode collapse, prompt leakage, safety filtering), `.planning/research/STACK.md` (Gemini structured output generation pattern via google-genai SDK)

---

### Phase 2: Architecture Benchmark
**Goal:** The student architecture is selected based on measured F1, INT8 model size, and device latency -- not assumptions -- and a binary baseline is established as the floor that distillation must beat.
**Depends on:** Phase 1 (requires validated dataset)
**Requirements:** TEXT-02

**Success Criteria** (what must be TRUE):
  1. At least three architectures are benchmarked on identical data splits: MobileBERT (25.3M), TinyBERT-4 (14.5M), and ELECTRA-small (14M) -- results table produced in `research/models/benchmark_results.json`
  2. Each candidate is tested end-to-end through the full pipeline (Python tokenizer -> TFLite model -> output), not model weights in isolation, confirming the tokenizer-model pairing is valid
  3. Each candidate's TFLite conversion is tested against the standard TFLite runtime (not TensorFlow runtime); any candidate requiring SELECT_TF_OPS is marked as disqualified for device deployment
  4. DistilBERT (66M) is not evaluated -- explicitly excluded for exceeding the 50MB INT8 budget
  5. Student architecture is selected and documented with rationale; binary baseline F1 on real-world holdout is recorded as the floor for Phase 4

**Plans:** 2/2 plans complete

Plans:
- [x] 02-01-PLAN.md — Environment setup + train three architectures on identical data splits
- [x] 02-02-PLAN.md — TFLite conversion, latency measurement, results aggregation, winner selection

**Research refs:** `.planning/research/STACK.md` (benchmark table, optimum 1.27.0 pinning, TFLite conversion path), `.planning/research/ARCHITECTURE.md` (input format per architecture, token_type_ids variance), `.planning/research/PITFALLS.md` (Pitfalls 2.4 tokenizer mismatch, 3.4 SELECT_TF_OPS, 4.4 vocab mismatch)

---

### Phase 3: Teacher Fine-Tuning
**Goal:** A DeBERTa-v3-large teacher model is fine-tuned server-side and validated against the real-world holdout, establishing the accuracy ceiling that the student must approximate through distillation.
**Depends on:** Phase 1 (requires validated dataset), Phase 2 (binary baseline must exist to confirm task is learnable before investing in large teacher)
**Requirements:** TEXT-04 (teacher component)

**Compute prerequisite:** DeBERTa-v3-large (435M params) requires >16GB GPU VRAM for fine-tuning. Confirm training environment (Colab A100, Lambda Labs, or equivalent) before starting this phase. Teacher never deploys to device -- server-side only.

**Success Criteria** (what must be TRUE):
  1. Teacher model (microsoft/deberta-v3-large) is fine-tuned on the synthetic training split and achieves F1 > 0.95 on the synthetic test split
  2. Teacher achieves F1 > 0.80 on the real-world holdout -- this is the hard gate for Phase 4; if this threshold is not met, teacher training is revised before distillation begins
  3. Teacher checkpoint is saved to `research/models/teacher_finetuned/` with training metrics logged
  4. Teacher soft labels are calibrated via temperature scaling on a held-out calibration set; Expected Calibration Error (ECE) measured before and after calibration
  5. Teacher is NOT exported to TFLite or deployed to the app -- its role ends at producing soft labels for distillation

**Plans:** 2 plans

Plans:
- [x] 03-01-PLAN.md — Create teacher fine-tuning notebook (DualHead DeBERTa-v3-large, training pipeline, evaluation, ECE calibration, soft label pre-computation)
- [x] 03-02-PLAN.md — Verify training results meet Phase 3 gate (user runs notebook in Colab, confirms F1 > 0.80 holdout)

**Research refs:** `.planning/research/FEATURES.md` (Step 3: DeBERTa-v3-large rationale, F1 > 0.95 target), `.planning/research/SUMMARY.md` (teacher fine-tune phase note, GPU requirement flag), `.planning/research/PITFALLS.md` (Pitfall 2.1: teacher inherits generalization problem, Pitfall 2.2: over-confident teacher soft labels), `.planning/research/STACK.md` (DeBERTa-v3 PyTorch-only note -- dual framework implication)

---

### Phase 4: Knowledge Distillation
**Goal:** The MobileBERT student (24.6M params, 24 layers) learns the teacher's decision boundary through intermediate layer transfer (1:1 layer mapping with learnable linear projections), achieving meaningfully higher F1 on the real-world holdout than the direct fine-tune baseline (F1=0.7719) established in Phase 2.
**Depends on:** Phase 3 (teacher must pass F1 > 0.80 on real-world holdout -- hard gate)
**Requirements:** TEXT-04 (distillation component)

**Success Criteria** (what must be TRUE):
  1. Distillation uses intermediate layer transfer (attention matrix alignment + hidden state alignment) in addition to soft labels -- soft-labels-only distillation is not acceptable
  2. Layer mapping table between teacher (24 layers) and student (24 layers) is defined and documented before any training code is written; 1:1 mapping with learnable linear projections (1024 -> 512) handling dimension mismatch
  3. Temperature is swept across T = {2, 3, 4, 5}; optimal T is selected by evaluation against real-world holdout, not distillation training loss
  4. Distilled student achieves at least 3 F1 points improvement over the direct fine-tune baseline from Phase 2, measured on the real-world holdout
  5. Distilled student checkpoint saved to `research/models/student_finetuned/` -- this checkpoint is the input to Phase 6 QAT

**Plans:** 2 plans

Plans:
- [ ] 04-01-PLAN.md — Create distillation notebook: setup, memory profiling, data/model loading, DistillationWrapper, Phase A soft-labels-only training + evaluation
- [ ] 04-02-PLAN.md — Phase B intermediate layer training, temperature sweep, gate check, checkpoint save, Colab verification

**Research refs:** `.planning/research/SUMMARY.md` (intermediate layer distillation rationale, 3-5 F1 gain estimate, layer mapping gap), `.planning/research/FEATURES.md` (Step 4: distillation loss formula, temperature guidance), `.planning/research/PITFALLS.md` (Pitfall 2.1: teacher gate, Pitfall 2.2: temperature calibration, Pitfall 2.3: architecture mismatch for intermediate layers)

---

### Phase 5: Multi-Label Intent Head
**Goal:** The stable binary classifier is extended with 8 sigmoid classification heads that identify which scam vectors are present in a message, without requiring a second model or a second forward pass.
**Depends on:** Phase 4 (binary classifier must be stable: binary F1 > 0.85 on real-world holdout before adding intent head)
**Requirements:** TEXT-03

**Success Criteria** (what must be TRUE):
  1. Intent classification is implemented as 8 independent sigmoid heads on the shared student encoder -- a single forward pass produces both binary scam/safe output and 8-label intent vector
  2. All 8 labels are covered: urgency, authority, financial_request, remote_access, reward_lottery, impersonation, romance_grooming, crypto
  3. Per-label threshold tuning is applied using a held-out calibration set -- each label has its own threshold, not a shared one across all vectors
  4. Intent head evaluated on real-world holdout: precision and recall reported per label; no label has recall of 0.0 (indicating the head learned to never fire)
  5. Binary scam/safe F1 on real-world holdout does not degrade by more than 1.5% after adding the intent head (shared encoder must not catastrophically forget the binary task)

**Plans:** 3 plans

Plans:
- [ ] 01-01-PLAN.md — Validation scaffolding + real-world holdout collection
- [ ] 01-02-PLAN.md — Two-model synthetic dataset generation (Gemini + Ollama)
- [ ] 01-03-PLAN.md — Quality filter, JSD gate, stratified split, human review

**Research refs:** `.planning/research/FEATURES.md` (Step 5: single encoder + 8 sigmoid heads, threshold tuning requirement), `.planning/research/SUMMARY.md` (multi-label pitfall: threshold tuning non-trivial given class imbalance)

---

### Phase 6: QAT + TFLite Deployment
**Goal:** The distilled, multi-head student model is quantized to INT8 via QAT, exported as a valid TFLite file, and deployed to canaryapp -- replacing the broken 26.7MB model with a working, validated classifier.
**Depends on:** Phase 5 (fixed architecture required -- QAT must apply to the final model shape)
**Requirements:** TEXT-05, TEXT-06

**Success Criteria** (what must be TRUE):
  1. Post-conversion dtype assertion passes: `input_details[0]['dtype'] == numpy.int32` -- the TFLite silent float32 input fallback bug is explicitly checked and confirmed absent
  2. Round-trip validation passes: 5 known-safe and 5 known-scam texts processed through Python tokenizer -> TFLite interpreter produce scam probability scores that differ from the pre-conversion FP32 model by less than 0.05 absolute
  3. Deployed model loads in canaryapp without error and logs correct input shape `[1, 128]` dtype `int32`; manual test with 10 known inputs (5 scam, 5 safe) confirms plausible scores (scam >= 0.7 for 4/5 scam inputs, <= 0.3 for 4/5 safe inputs)
  4. Model file size is <= 10MB (target) and strictly <= 20MB (hard reject); old `mobilebert_scam_intent.tflite` is deleted from `canaryapp/assets/models/` before the new file is copied
  5. Startup shape assertion exists in `TextClassifierService.ts` that throws a descriptive error if `model.inputs[0].shape[1] !== EXPECTED_SEQUENCE_LENGTH`; debug panel in `index.tsx` is gated behind `__DEV__` before deployment

**Plans:** 3 plans

Plans:
- [ ] 01-01-PLAN.md — Validation scaffolding + real-world holdout collection
- [ ] 01-02-PLAN.md — Two-model synthetic dataset generation (Gemini + Ollama)
- [ ] 01-03-PLAN.md — Quality filter, JSD gate, stratified split, human review

**Research refs:** `.planning/research/PITFALLS.md` (Pitfall 3.1: TFLite silent float32 bug -- primary; Pitfall 3.2: BERT softmax/LayerNorm quantization instability; Pitfall 3.3: QAT epochs; Pitfall 3.4: SELECT_TF_OPS; Pitfall 4.1: shape mismatch; Pitfall 4.2: output tensor index; Pitfall 4.3: stale Metro cache; Pitfall 4.6: bundle size), `.planning/research/STACK.md` (TFMOT QAT code pattern, TF 2.15 pinning rationale, optimum 1.27.0 export path), `.planning/research/ARCHITECTURE.md` (deployment step-by-step, token_type_ids 3-input guard)

**UI hint**: yes

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Foundation | 3/3 | Complete |  |
| 2. Architecture Benchmark | 2/2 | Complete   | 2026-04-04 |
| 3. Teacher Fine-Tuning | 2/2 | Complete | 2026-04-04 |
| 4. Knowledge Distillation | 0/2 | Planned | - |
| 5. Multi-Label Intent Head | 0/0 | Not started | - |
| 6. QAT + TFLite Deployment | 0/0 | Not started | - |

---

## Hard Gates (Must Not Be Bypassed)

| Gate | Blocks | Condition |
|------|--------|-----------|
| Real-world holdout built before synthetic generation | Phase 1 completion | Holdout must be collected and locked before generate_dataset.py runs |
| Binary baseline F1 recorded | Phase 3 start | Phase 2 must produce a documented floor before teacher investment begins |
| Teacher F1 > 0.80 on real-world holdout | Phase 4 start | Teacher trained on bad data distills bad decision boundary; this gate prevents compounding the existing failure |
| Binary classifier F1 > 0.85 on real-world holdout | Phase 5 start | Intent head added to a broken binary base causes training instability |
| Architecture fixed before QAT | Phase 6 start | QAT simulates quantization during training; any architecture change after QAT begins requires restarting QAT |
| dtype assertion passes post-conversion | Phase 6 completion / deployment | TFLite silent float32 fallback bug reproduces the exact failure mode of the current broken model |

---

## Dependency Graph

```
Phase 1: Data Foundation (TEXT-01)
  └── Phase 2: Architecture Benchmark (TEXT-02)
        └── Phase 3: Teacher Fine-Tuning (TEXT-04 teacher)
              └── Phase 4: Knowledge Distillation (TEXT-04 student)
                    └── Phase 5: Multi-Label Intent Head (TEXT-03)
                          └── Phase 6: QAT + TFLite Deployment (TEXT-05, TEXT-06)
```

All phases are strictly sequential. No parallelism is possible -- each phase gates the next.

---

## Coverage

| Requirement | Phase | Covered By |
|-------------|-------|------------|
| TEXT-01 | Phase 1 | Data Foundation |
| TEXT-02 | Phase 2 | Architecture Benchmark |
| TEXT-04 (teacher) | Phase 3 | Teacher Fine-Tuning |
| TEXT-04 (distillation) | Phase 4 | Knowledge Distillation |
| TEXT-03 | Phase 5 | Multi-Label Intent Head |
| TEXT-05 | Phase 6 | QAT + TFLite Deployment |
| TEXT-06 | Phase 6 | QAT + TFLite Deployment |

**Coverage: 6/6 v1 requirements mapped. No orphaned requirements.**
