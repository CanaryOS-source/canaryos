# Phase 4: Knowledge Distillation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-04
**Phase:** 04-knowledge-distillation
**Areas discussed:** Distillation staging, Teacher loading vs pre-computation, F1 gate feasibility, Compute environment

---

## Distillation Staging

| Option | Description | Selected |
|--------|-------------|----------|
| Progressive (Recommended) | Phase A: soft-label-only as baseline. Phase B: add intermediate layer losses if needed. Gives fallback checkpoint and isolates whether intermediate transfer helps. | ✓ |
| Full intermediate from start | Single training run with soft labels + intermediate layer transfer combined. Matches TEXT-04 spec exactly. Faster if it works, harder to debug. | |
| You decide | Claude's discretion — researcher and planner determine staging. | |

**User's choice:** Progressive (Recommended)
**Notes:** User confirmed progressive approach.

### Follow-up: If soft-labels-only passes the gate, still add intermediate layers?

| Option | Description | Selected |
|--------|-------------|----------|
| Stop at soft labels | If gate passes, ship it. Keep intermediate cells but skip them. | |
| Always add intermediate | TEXT-04 requires it. Even if soft labels pass, add for maximum accuracy — Phase 5 benefits from stronger base encoder. | ✓ |
| You decide | Claude's discretion based on proximity to gate. | |

**User's choice:** Always add intermediate
**Notes:** Intermediate layer transfer is mandatory regardless of soft-label results.

---

## Teacher Loading vs Pre-computation

| Option | Description | Selected |
|--------|-------------|----------|
| Load teacher live (Recommended) | Load teacher during training, run forward pass each batch for intermediate representations. Needs more GPU memory but avoids massive disk storage. May require A100. | ✓ |
| Pre-compute per layer | Pre-compute hidden states for selected layers only (~20-40GB disk). Teacher not needed during student training. Fits T4 memory. | |
| You decide | Claude's discretion based on memory profiling. | |

**User's choice:** Load teacher live (Recommended)
**Notes:** Simpler code, avoids disk storage complexity.

### Follow-up: Teacher frozen or trainable?

| Option | Description | Selected |
|--------|-------------|----------|
| Frozen teacher (Recommended) | No gradients computed — saves ~50% GPU memory. Standard practice. | ✓ |
| You decide | Claude's discretion — standard practice is frozen. | |

**User's choice:** Frozen teacher (Recommended)

---

## F1 Gate Feasibility

| Option | Description | Selected |
|--------|-------------|----------|
| Relax to 2-point gain | Accept F1 ≥ 0.7919. More realistic given teacher ceiling (0.8052). Adjust TEXT-04 requirement. | |
| Improve teacher first | If student plateaus, improve teacher to raise ceiling, then re-distill. More work but keeps 3-point standard. | |
| Keep 3-point, accept risk | Keep original gate. MobileBERT's 24.6M params may close the gap. Escalate if it fails. | |
| You decide | Claude's discretion — researcher evaluates after first run and recommends. | ✓ |

**User's choice:** You decide
**Notes:** Claude's discretion on recovery strategy. Researcher evaluates after first distillation run.

---

## Compute Environment

| Option | Description | Selected |
|--------|-------------|----------|
| Start on T4, fallback A100 | Same Phase 3 strategy: try free T4 first, switch to A100 if OOM. Migration guide included. | ✓ |
| Go straight to A100 | Skip T4 debugging, start on Colab Pro. Saves iteration time. | |
| You decide | Claude's discretion based on memory profiling. | |

**User's choice:** Start on T4, fallback A100
**Notes:** Proven strategy from Phase 3.

### Follow-up: Memory profiling cell?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, profile first (Recommended) | Load both models, dummy forward pass, report peak VRAM before full training. | ✓ |
| You decide | Claude's discretion. | |

**User's choice:** Yes, profile first (Recommended)

---

## Claude's Discretion

- Layer mapping strategy (1:1, selective, or skip connections) for 24→24 layer alignment
- Linear projection architecture for dimension mismatch (DeBERTa 1024 → MobileBERT 512/128)
- Loss weights: alpha (soft-label KL vs hard-label CE), beta (intermediate layer losses)
- Learning rate, warmup, weight decay, gradient accumulation
- Batch size based on memory profiling
- Temperature selection from T={2,3,4,5} sweep
- F1 gate recovery strategy if distillation plateaus below 0.8019

## Deferred Ideas

None — discussion stayed within phase scope.
