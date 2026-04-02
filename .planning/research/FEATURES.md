# Feature Landscape: CanaryOS Scam Text Classifier

**Domain:** On-device mobile scam / phishing text classification
**Researched:** 2026-04-01
**Milestone:** v1.0 Text Classification Research

---

## Table Stakes

Features that must exist for the classifier to be credibly "working." Missing any of these means the model fails in production.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Multi-vector scam taxonomy coverage | Modern scams span 8+ distinct vectors; SMS-spam corpus covers only 1-2 | Medium | See taxonomy section below — must cover all 8 |
| Synthetic training data covering all vectors | Public datasets (UCI SMS Spam, ealvaradob/phishing-dataset) top out at ~6K samples and skew heavily toward legacy spam patterns | Medium | LLM-generated; target 10K–20K samples minimum |
| Architecture that fits on-device constraints | Model must be <50MB INT8-quantized; TFLite-compatible | Medium | TinyBERT-4 or quantized MobileBERT are the viable targets |
| Int8-quantized TFLite export | iOS memory cap ~50MB for extension; required for latency <100ms | Medium | QAT required — PTQ degrades BERT accuracy significantly |
| Binary scam / safe classification | Core signal the fusion engine consumes | Low | Prerequisite for everything else in the pipeline |
| Precision >= 0.90 at Danger threshold | Users uninstall at false positive rates above ~10% | Medium | Design for high-precision; sacrifice recall if needed |

---

## Differentiators

Features that go beyond table stakes and make CanaryOS better than a simple spam filter.

| Feature | Value Proposition | Complexity | Depends On | Notes |
|---------|-------------------|------------|------------|-------|
| Intent / vector classification (multi-label) | Explains *why* something is a scam — enables per-vector thresholds and explanations | High | Good synthetic data + binary classifier working first | Labels: urgency, authority, financial_request, remote_access, reward_lottery, impersonation, romance_grooming, crypto |
| Knowledge distillation from DeBERTa-v3-large teacher | Transfers accuracy from 435M param teacher to ~14M param student; expected 3–5 pt F1 gain over direct fine-tune | High | Requires: (1) clean labeled dataset, (2) teacher fine-tuned first | Do teacher fine-tune on synthetic data, then distill to TinyBERT-4 student |
| Synthetic data quality filtering pipeline | Self-consistency check (classify generated samples with zero-shot teacher, discard mismatches) ensures label noise stays below ~5% | Medium | LLM API access (GPT-4o or Claude 3.5 Sonnet as generator) | Solves the main failure mode of LLM-generated training data |
| Out-of-distribution (OOD) robustness | Hard-negative mining from legitimate messages that use scam-adjacent language (urgency from banks, delivery confirmations) | Medium | Binary classifier must be stable first | Prevents false positive spike on legitimate urgent messages |
| Per-vector confidence calibration | Platt scaling or temperature calibration per label head so confidence scores are meaningful | Low | Multi-label head must exist | Required before surfacing per-vector explanations to users |

---

## Anti-Features

Features to explicitly NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Fine-tuning DistilBERT (66M params / 207MB) | 207MB FP32 is 4x over the 50MB budget; even quantized, DistilBERT-INT8 at ~52MB leaves no headroom for the rest of the app | Use TinyBERT-4 (14.5M params) or MobileBERT (25.3M / quantizes to ~6MB) |
| Separate binary classifier per scam vector | Requires 8+ models deployed simultaneously; multiplies memory and latency | Single multi-label head on shared encoder; one forward pass |
| Cloud API fallback for inference | Violates privacy guarantee (text leaves device); already removed from production path | All inference stays on-device |
| Training on UCI SMS Spam Collection alone | 5,574 samples, ~13% spam, heavily biased toward legacy Nigerian/prize SMS patterns; causes the exact overfitting already observed | Use as a seed, augment heavily with synthetic data |
| ModernBERT (149M params base) | Despite being SOTA encoder released Dec 2024, 149M params is ~37MB FP32 — too large; no published TFLite conversion path yet | Revisit in Phase 2 when model budget relaxes |
| Fusion model learning (learned fusion weights) | Over-engineered until both text and visual signals are reliable; current max-score heuristic is sufficient | Leave fusion heuristic in place; improve individual signals first |
| Zero-shot LLM inference on-device | Current on-device LLMs (Qwen2.5-0.5B etc.) are too slow and large for <100ms latency target | Fine-tuned encoder is faster, smaller, and better for binary classification |

---

## Scam Vector Taxonomy

All training data and intent labels must cover these 8 categories. Missing a category means the deployed model will have blind spots on a major active threat.

| Vector | Example Patterns | 2024 Prevalence | Notes |
|--------|-----------------|-----------------|-------|
| **Impersonation — Government** | IRS, SSA, USPS, Medicare demanding immediate payment or arrest | Very high — FTC reports $785M from impostor scams 2024 | High urgency + authority signal |
| **Impersonation — Bank / Fraud Alert** | "Your account has been compromised, call us" | Very high | Legitimate banks use similar language — hard negatives critical |
| **Tech Support** | "Your device has a virus, call Microsoft/Apple" | High | Remote access request is distinguishing signal |
| **Package Delivery** | Fake USPS/FedEx/DHL "delivery fee" smishing | Very high — major 2024 SMS vector | Short messages; authority + financial request |
| **Prize / Lottery / Reward** | "You've won $500 Walmart gift card, claim now" | High | Classic pattern but still active |
| **Crypto / Investment ("Pig Butchering")** | Fake trading platforms, AI signal bots, guaranteed returns | Growing rapidly — +40% YoY 2024 | Longer grooming messages; hardest to detect |
| **Romance Grooming** | Slow trust-building before financial request | Growing — LLMs now automate 87% of conversation | Long messages; financial request comes late in thread |
| **Job Offer / Work from Home** | Too-good-to-be-true salary, requires upfront payment | Medium | Financial request pattern |

---

## Build-Order Dependencies

This is the correct implementation sequence. Each step is a blocker for the steps below it.

```
Step 1: Synthetic Dataset Generation
  - Generate 10K–20K samples covering all 8 vectors + legitimate (safe) examples
  - Include hard negatives (urgent-but-legitimate messages)
  - Filter with zero-shot teacher model (discard label-inconsistent samples)
  - Datasets to seed from:
      * ealvaradob/phishing-dataset (HuggingFace) — 5,971 SMS: 489 spam, 638 smishing, 4,844 ham
      * redasers/difraud (HuggingFace) — 95,854 samples, 7 fraud domains (use as supplemental)
      * ucirvine/sms_spam — 5,574 SMS (legacy baseline; use as hard-negative source)
  - LLM generator: GPT-4o or Claude 3.5 Sonnet (proven diverse, human-like)
  - Quality gate: 100-sample human review before training begins
        |
        v
Step 2: Architecture Selection + Binary Baseline
  - Benchmark MobileBERT (25.3M) vs TinyBERT-4 (14.5M) on synthetic dataset
  - Target metric: F1 on held-out scam samples; secondary: INT8 size, inference latency on device
  - Recommendation (medium confidence): TinyBERT-4 is likely winner — 7.5x smaller than BERT,
    9.4x faster, 14.5M params quantizes to ~3.6MB INT8 vs MobileBERT-TINY at ~6MB
  - Do NOT benchmark DistilBERT (207MB FP32, out of budget) or ModernBERT (149M, no TFLite path)
        |
        v
Step 3: Teacher Model Fine-Tuning (DeBERTa-v3-large)
  - Fine-tune microsoft/deberta-v3-large (435M params) on the synthetic dataset for binary + multi-label
  - This is a server-side training step only — teacher never deploys to device
  - DeBERTa-v3 preferred over RoBERTa-large: better GLUE scores, disentangled attention improves
    classification on short texts, available on HuggingFace with fine-tune recipes
  - Expected result: teacher should reach F1 > 0.95 on held-out test set
        |
        v
Step 4: Knowledge Distillation to Student (TinyBERT-4 or MobileBERT)
  - Distillation approach: intermediate layer transfer (attention matrices + hidden states) + soft labels
  - This is NOT just soft label distillation — TinyBERT-style intermediate layer transfer consistently
    outperforms soft-labels-only (research consensus, confirmed 2024)
  - Temperature T=4–8 for soft label cross-entropy component
  - Expected gain over direct fine-tune: 3–5 F1 points (MEDIUM confidence — task-specific, not guaranteed)
        |
        v
Step 5: Multi-Label Intent Head
  - Add multi-label classification head on top of distilled student encoder
  - Labels: urgency, authority, financial_request, remote_access, reward_lottery,
    impersonation, romance_grooming, crypto
  - Architecture: single shared encoder + 8 independent sigmoid heads (NOT 8 separate models)
  - Train jointly or via head-only fine-tune after binary classifier is stable
  - Threshold tuning per label head required (not all vectors have same base rate)
        |
        v
Step 6: Int8 QAT + TFLite Export
  - Apply TensorFlow Model Optimization Toolkit QAT (not PTQ)
  - PTQ degrades BERT accuracy significantly on GLUE; QAT recovers within ~1% of FP32 baseline
  - Target: INT8 model ≤ 10MB for TinyBERT-4 student
  - Validate: run inference through react-native-fast-tflite JSI bridge, measure latency on real device
  - Replace canaryapp/assets/models/ with new model + updated vocab
```

---

## How Much Synthetic Data Is Enough

Based on 2024 research on LLM-augmented text classification:

- **Minimum viable**: 1,000 samples per class for binary classifier (10K total across 8 scam vectors + safe)
- **Recommended**: 2,000–3,000 per vector = 16K–24K total; gains diminish above this for short-text classification
- **Quality beats quantity**: 3,000 high-quality human-labeled samples outperform 6,000 LLM-generated samples — therefore filtering is non-negotiable
- **Mixing ratio**: 50/50 real + synthetic outperforms all-synthetic; seed with ealvaradob/phishing-dataset and difraud as real anchors
- **Hard negatives are critical**: 20–30% of the "safe" class should be urgent-but-legitimate messages (bank alerts, actual delivery notifications, appointment reminders)

---

## Generalization vs Overfitting: What Makes the Difference

The existing MobileBERT model failed precisely because of these factors. Each is a concrete step to take.

| Factor | What Goes Wrong | Prevention |
|--------|----------------|------------|
| Narrow training distribution | Model learns "gift card" and "lottery" as scam proxies; misses crypto/romance patterns | Cover all 8 vectors with roughly equal sample counts |
| Label leakage via surface forms | Model learns specific brand names (Walmart, IRS) not underlying patterns | Prompt-vary brand names in generation; include multiple impersonation targets per vector |
| Insufficient hard negatives | Legitimate urgent messages (fraud alert from real bank) trigger false positive | Explicit hard-negative mining from safe-but-urgent messages |
| Single-domain vocabulary | SMS spam corpus uses older abbreviated register; modern scam texts are longer, more formal | Generate across short (SMS), medium (push notification), and long (email excerpt) lengths |
| No OOD evaluation | Train/test split from same distribution hides generalization failure | Hold out one entire vector from training, evaluate on it — tests transfer |
| Confidence miscalibration | Model is confident at wrong threshold; threshold tuned on training distribution | Calibrate on a held-out calibration set; use temperature scaling before threshold tuning |

---

## Dataset Sources (Named)

| Source | Location | Size | Use |
|--------|----------|------|-----|
| ealvaradob/phishing-dataset | HuggingFace | 5,971 SMS | Primary real-data seed; has smishing label |
| redasers/difraud | HuggingFace | 95,854 samples | Supplemental — multi-domain fraud text |
| ucirvine/sms_spam | HuggingFace / Kaggle | 5,574 SMS | Legacy baseline; use as hard-negative source |
| LLM-generated (synthetic) | Generate in research/notebooks/ | Target 16K–24K | Covers modern vectors not in public datasets |

---

## Sources

- [Comparative Analysis of Compact Language Models: DistilBERT, TinyBERT, MobileBERT](https://zenodo.org/records/15907007)
- [ModernBERT: Smarter, Better, Faster, Longer (arXiv 2412.13663)](https://arxiv.org/abs/2412.13663)
- [On LLMs-Driven Synthetic Data Generation, Curation, and Evaluation (ACL 2024)](https://aclanthology.org/2024.findings-acl.658.pdf)
- [Data Generation Using Large Language Models for Text Classification (arXiv 2407.12813)](https://arxiv.org/html/2407.12813)
- [Surveying Effects of Quality, Diversity, and Complexity in Synthetic Data (arXiv 2412.02980)](https://arxiv.org/html/2412.02980v1)
- [Knowledge Distillation in Automated Annotation with LLM-Generated Labels (arXiv 2406.17633)](https://arxiv.org/html/2406.17633)
- [TinyBERT: Distilling BERT for Natural Language Understanding (ACL Findings 2020)](https://aclanthology.org/2020.findings-emnlp.372.pdf)
- [DeBERTaV3: Improving DeBERTa using ELECTRA-Style Pre-Training (ICLR 2023)](https://arxiv.org/pdf/2111.09543)
- [Autocorrelation Matrix Knowledge Distillation for BERT (MDPI 2024)](https://www.mdpi.com/2076-3417/14/20/9180)
- [Are Intermediate Layers and Labels Really Necessary? (ACL Findings 2023)](https://aclanthology.org/2023.findings-acl.614.pdf)
- [TFLite QAT Documentation](https://www.tensorflow.org/model_optimization/guide/quantization/training)
- [ealvaradob/phishing-dataset on HuggingFace](https://huggingface.co/datasets/ealvaradob/phishing-dataset)
- [redasers/difraud on HuggingFace](https://huggingface.co/datasets/redasers/difraud)
- [FTC Top Text Scams 2024](https://www.ftc.gov/news-events/data-visualizations/data-spotlight/2025/04/top-text-scams-2024)
- [Romance-Baiting Scams: AI Role (arXiv 2512.16280)](https://arxiv.org/html/2512.16280v1)
- [Scam Classification and Measurement — GASA 2024](https://www.gasa.org/post/scam-classification-and-measurement-global-anti-scam-summit-americas-2024)
- [Hybrid Super Learner Ensemble for Phishing Detection on Mobile (Nature 2025)](https://www.nature.com/articles/s41598-025-02009-8)
