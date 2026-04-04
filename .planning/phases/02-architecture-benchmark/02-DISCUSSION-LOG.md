# Phase 2: Architecture Benchmark - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-04
**Phase:** 02-architecture-benchmark
**Areas discussed:** Training framework, Benchmark depth, Latency measurement, Third candidate

---

## Training Framework

| Option | Description | Selected |
|--------|-------------|----------|
| Native TensorFlow (Recommended) | Use TF versions of models. Clean QAT path, no ONNX conversion. Less HF ecosystem support. | |
| PyTorch + Optimum export | Standard HuggingFace PyTorch, export via optimum==1.27.0. More ecosystem support but ONNX conversion step. | |
| PyTorch train, TF for QAT only | Hybrid — PyTorch for training, convert weights to TF for Phase 6 QAT only. | |

**User's choice:** PyTorch + MPS (custom response)
**Notes:** User runs on Apple Silicon Mac. TF Metal plugin is deprecated and already caused crashes in Phase 1. PyTorch MPS gives GPU acceleration out of the box. User wants TF escape hatch available — if PyTorch causes blocking issues at any point, pivot to TF training on Google Colab (external compute). Keep notebooks TF-pivot-compatible.

---

## Benchmark Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Focused validation | 3-5 epochs, fixed LR (2e-5), same batch size. ~1-2 hours on MPS. | ✓ |
| Light sweep | 2-3 learning rates per model, best-of-3. ~3-4 hours. | |
| Exhaustive benchmark | Full grid search over LR, batch size, warmup. 6-8+ hours. | |

**User's choice:** Focused validation (Recommended)
**Notes:** None — straightforward selection.

---

## Latency Measurement

| Option | Description | Selected |
|--------|-------------|----------|
| Desktop TFLite only | TFLite interpreter on Mac. Relative comparison sufficient for selection. | ✓ |
| Desktop + device spot-check | Desktop benchmark plus deploy winner to canaryapp for on-device timing. | |
| On-device only | All latency from actual device. Most accurate but heavy setup. | |

**User's choice:** Desktop TFLite only (Recommended)
**Notes:** None — straightforward selection.

---

## Third Candidate

| Option | Description | Selected |
|--------|-------------|----------|
| Keep ELECTRA-small | 14M params, different pretraining paradigm. Genuine alternative signal. | ✓ |
| Swap for ALBERT-base-v2 | 12M params, parameter-sharing. Sometimes unstable with TFLite export. | |
| Only benchmark two | Skip third candidate. TinyBERT-4 is frontrunner; third adds time without likely changing outcome. | |

**User's choice:** Keep ELECTRA-small (Recommended)
**Notes:** None — straightforward selection.

---

## Claude's Discretion

- Exact epoch count (3-5 range)
- Batch size (based on MPS memory)
- Mixed precision (fp16) usage
- Notebook cell structure and visualizations

## Deferred Ideas

None — discussion stayed within phase scope.
