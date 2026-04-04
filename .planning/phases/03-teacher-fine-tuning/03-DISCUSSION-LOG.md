# Phase 3: Teacher Fine-Tuning - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-04
**Phase:** 03-teacher-fine-tuning
**Areas discussed:** Training environment, Teacher training scope, Soft label pipeline, Failure recovery

---

## Training Environment

| Option | Description | Selected |
|--------|-------------|----------|
| Google Colab (Recommended) | A100/T4 GPU via Colab Pro. Notebook needs drive mounting, runtime setup cells, session timeout handling. | |
| Lambda Labs / cloud GPU | Dedicated cloud GPU instance. SSH + Jupyter. More control, no timeouts. | |
| Local with external GPU | Machine with >16GB VRAM available locally. Simple notebook. | |

**User's choice:** Google Colab (Recommended)

### Follow-up: Colab Tier

| Option | Description | Selected |
|--------|-------------|----------|
| Colab Pro / Pro+ | A100 GPU (40GB VRAM). Batch size 16+. ~12 hour session limit. | |
| Free tier (T4) | T4 GPU (16GB VRAM). Gradient accumulation, batch size 4-8. ~90 min session limit. | |

**User's choice:** Free Tier (T4), with explicit request for a comprehensive T4-to-A100 migration plan saved in the notebook so training can be resumed on Colab Pro at any point.
**Notes:** User will pay for Pro if needed but wants to try free tier first. Migration plan must be comprehensive enough to pick up from any checkpoint.

---

## Teacher Training Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Binary + intent (Recommended) | Train teacher with binary head AND 8 sigmoid intent heads. Enables distillation of both in Phase 4. | |
| Binary only | Teacher learns scam/safe only. Intent added cold in Phase 5. | |
| You decide | Claude's discretion based on GPU constraints. | |

**User's choice:** Binary + intent (Recommended)

### Follow-up: Intent Head Gate

| Option | Description | Selected |
|--------|-------------|----------|
| Binary gate only (Recommended) | F1 > 0.80 on binary holdout is the only hard gate. Intent quality logged but doesn't block Phase 4. | |
| Both gates | Require binary F1 > 0.80 AND minimum per-label recall. Stricter. | |
| You decide | Claude evaluates holdout size constraints. | |

**User's choice:** Binary gate only (Recommended)
**Notes:** Holdout (202 samples) too small for meaningful per-label intent metrics.

---

## Soft Label Pipeline

| Option | Description | Selected |
|--------|-------------|----------|
| End of Phase 3 (Recommended) | Pre-compute soft labels and save to disk. Decouples phases, saves Phase 4 VRAM. | |
| On-the-fly in Phase 4 | Load teacher + student simultaneously. More VRAM, no stale files. | |
| You decide | Claude picks based on T4 VRAM constraints. | |

**User's choice:** End of Phase 3 (Recommended)

### Follow-up: Temperature Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Multiple temps (Recommended) | Generate at T={2,3,4,5}. Phase 4 sweeps by loading different files. ~20-30 min extra GPU. | |
| Single T=4 | Generate at T=4 only. Phase 4 must reload teacher for different T. | |
| You decide | Claude picks based on compute tradeoffs. | |

**User's choice:** Multiple temps (Recommended)

---

## Failure Recovery

| Option | Description | Selected |
|--------|-------------|----------|
| Hyperparameter retry (Recommended) | 2-3 configs before escalating. Checkpoint each attempt. | |
| Data augmentation | Augment weak vectors. More expensive, addresses root cause. | |
| Lower the gate to 0.75 | Accept lower teacher quality. | |
| You decide | Claude assesses failure mode. | |

**User's choice:** Hyperparameter retry (Recommended)

### Follow-up: Retry Budget

| Option | Description | Selected |
|--------|-------------|----------|
| 2 retries (Recommended) | Two different configs, then escalate to data augmentation. | |
| 3 retries | More thorough search. | |
| 1 retry then augment | Aggressive escalation. | |

**User's choice:** 2 retries (Recommended)

### Follow-up: Augmentation Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Targeted generation (Recommended) | Generate 1-2K additional samples for weak vectors only. | |
| Full Phase 1 re-run | Regenerate entire dataset with revised prompts. | |
| You decide | Claude evaluates error breakdown and picks scope. | |

**User's choice:** You decide -- Claude's discretion based on per-vector error analysis at the time. Originally selected "Targeted generation" then changed to "You decide."

---

## Claude's Discretion

- Learning rate, warmup, weight decay values
- Batch size / gradient accumulation split for T4
- Calibration set construction
- Notebook cell structure
- Data augmentation scope (targeted vs full re-run) if needed after 2 hyperparameter retries fail

## Deferred Ideas

None -- discussion stayed within phase scope.
