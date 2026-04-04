# Phase 3: Teacher Fine-Tuning - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Fine-tune DeBERTa-v3-large (435M params) server-side on the Phase 1 synthetic dataset with both binary scam/safe and 8-label intent heads. Validate against the real-world holdout (hard gate: F1 > 0.80 on binary head). Generate pre-computed soft labels at multiple temperatures for Phase 4 distillation. Teacher never deploys to device.

</domain>

<decisions>
## Implementation Decisions

### Training Environment
- **D-01:** Google Colab is the training environment. Notebook must include Colab-specific patterns: drive mounting for checkpoint persistence, `!pip install` cells, session timeout awareness.
- **D-02:** Start on free tier (T4, 16GB VRAM). DeBERTa-v3-large fits on T4 with gradient accumulation and batch size 4-8. Notebook must be designed with aggressive checkpointing so training can resume after Colab session timeouts (~90 min idle disconnect).
- **D-03:** Fallback to Colab Pro (A100, 40GB VRAM) if T4 proves insufficient. The notebook must include a clearly documented T4-to-A100 migration section: how to resume from the latest checkpoint, what batch size / gradient accumulation settings to change, and what to expect differently. This migration guide must be comprehensive enough that the user can switch environments at any point in the training process without losing progress.
- **D-04:** All checkpoints saved to Google Drive (`/content/drive/MyDrive/canaryos_teacher/`). Every epoch checkpoint saved, not just best — enables mid-training environment migration.

### Teacher Training Scope
- **D-05:** Teacher trained with BOTH binary scam/safe head AND 8 sigmoid intent heads (urgency, authority, financial_request, remote_access, reward_lottery, impersonation, romance_grooming, crypto). Single shared DeBERTa encoder, two output heads.
- **D-06:** Binary F1 > 0.80 on real-world holdout is the only hard gate for proceeding to Phase 4. Intent head quality is logged and reviewed (per-label precision/recall on holdout) but does NOT block Phase 4 — holdout sample count (202) is too small for meaningful per-label metrics.
- **D-07:** Teacher F1 > 0.95 on synthetic test set is an internal quality bar (TEXT-04 requirement). If met on synthetic but not on holdout, this is a generalization problem — see recovery decisions.

### Soft Label Pipeline
- **D-08:** Pre-compute teacher soft labels at the END of Phase 3, not during Phase 4 distillation. Run teacher inference on the full synthetic training set and save soft labels to disk. Decouples phases and avoids loading 435M param teacher during Phase 4 distillation (critical for T4 memory).
- **D-09:** Generate soft labels at FOUR temperatures: T={2, 3, 4, 5}. Save all four versions (e.g., `research/data/teacher_soft_labels_T2.pt`, `_T3.pt`, `_T4.pt`, `_T5.pt`). Phase 4 sweeps temperatures by loading different files — no teacher reload needed.
- **D-10:** Soft labels include BOTH binary logits and 8-label intent logits at each temperature. Phase 4 distillation can use both signals.
- **D-11:** ECE (Expected Calibration Error) measured before and after temperature scaling on a held-out calibration set (per TEXT-04 requirement and Pitfall 2.2 prevention).

### Failure Recovery
- **D-12:** If teacher fails F1 > 0.80 holdout gate: retry with 2 different hyperparameter configurations (e.g., lower learning rate + more epochs, then class weighting adjustment). Checkpoint each attempt.
- **D-13:** If 2 hyperparameter retries both fail: escalate to data augmentation. Claude's discretion on scope — targeted generation (weak vectors only) or comprehensive re-run with improved prompts, based on the teacher's per-vector error analysis at the time.
- **D-14:** The notebook must include a per-vector error breakdown cell that runs automatically after each training attempt, making the failure mode visible immediately. This informs whether the issue is training config or data quality.

### Claude's Discretion
- Exact learning rate, warmup steps, and weight decay values (within reasonable ranges for DeBERTa-v3-large fine-tuning)
- Batch size / gradient accumulation split for T4 (must fit in 16GB VRAM)
- Calibration set construction (subset of val split or separate holdout partition)
- Notebook cell structure and visualization choices
- If data augmentation is needed: scope of re-generation (targeted vs full) based on error analysis

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Teacher Model & Distillation Requirements
- `.planning/REQUIREMENTS.md` ~TEXT-04 -- Full acceptance criteria for teacher fine-tuning (F1 gates, checkpoint locations, calibration requirement, distillation loss formula)

### Research Docs (Phase 3 specific)
- `.planning/research/FEATURES.md` -- Step 3: DeBERTa-v3-large rationale, F1 > 0.95 target, knowledge distillation as differentiator
- `.planning/research/SUMMARY.md` -- Teacher fine-tune phase note, GPU requirement flag, layer mapping gap
- `.planning/research/PITFALLS.md` -- Pitfall 2.1: teacher inherits generalization problem (validates holdout gate); Pitfall 2.2: over-confident soft labels at low temperature (validates multi-temp generation and ECE calibration)
- `.planning/research/STACK.md` -- DeBERTa-v3 PyTorch-only note (no TF implementation in HF), distillation loss formula (KL + CE, alpha=0.5, T=4 starting point)

### Prior Phase Outputs (inputs to this phase)
- `.planning/phases/01-data-foundation/01-CONTEXT.md` -- Data generation decisions, dataset structure, holdout composition
- `.planning/phases/02-architecture-benchmark/02-CONTEXT.md` -- Training framework decisions (PyTorch primary), TF escape hatch
- `research/data/synthetic_scam_v1.jsonl` -- Training dataset (22,942 samples, 8 vectors + safe)
- `research/data/holdout_realworld.jsonl` -- Real-world evaluation oracle (202 samples)
- `research/data/test_split.jsonl` -- Synthetic test split
- `research/models/benchmark_results.json` -- Phase 2 benchmark results (MobileBERT baseline F1=0.7719)

### Project Constraints
- `.planning/PROJECT.md` ~Constraints -- Privacy (no server inference for production), TFLite target (affects Phase 4+, not Phase 3 directly)
- `.planning/PROJECT.md` ~Key Decisions -- MobileBERT selected as student (teacher's soft labels distill into MobileBERT in Phase 4)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `research/notebooks/architecture_benchmark.ipynb` -- Phase 2 benchmark notebook; reuse data loading cells (synthetic dataset + holdout loading patterns)
- `research/notebooks/improved_scam_classifier.ipynb` -- Original training notebook; check for reusable HuggingFace Trainer patterns
- `research/scripts/validate_split.py` -- Validates dataset splits; can verify data loading is correct in Colab before training
- `research/data/` -- All dataset files ready; no preprocessing needed beyond loading

### Established Patterns
- Research environment: Jupyter notebooks in `research/notebooks/` (mandatory)
- PyTorch + HuggingFace Transformers as training framework (Phase 2 D-01)
- Data in `research/data/` (gitignored), model outputs in `research/models/` (gitignored)
- In Colab: checkpoints to Google Drive, notebook committed to `research/notebooks/`

### Integration Points
- Output: Teacher checkpoint in `research/models/teacher_finetuned/` (gitignored, also on Google Drive)
- Output: Pre-computed soft labels at T={2,3,4,5} in `research/data/teacher_soft_labels_T{N}.pt`
- Output: Per-vector error analysis (informs Phase 4 expectations and potential data augmentation)
- Output: ECE calibration results (validates soft label quality before Phase 4 uses them)
- Phase 4 consumes: soft label files + teacher training metrics (not the teacher model itself)

</code_context>

<specifics>
## Specific Ideas

- Notebook must have a dedicated "T4 to A100 Migration" section with step-by-step instructions for resuming training on Colab Pro — comprehensive enough that the user can switch at any point without losing progress
- Every epoch checkpoint saved to Drive (not just best) — enables mid-training environment switch
- Per-vector error breakdown cell runs automatically after training — makes failure mode immediately visible for recovery decisions
- Soft label generation at 4 temperatures is a one-time GPU cost (~20-30 min on T4) that saves significant Phase 4 iteration time
- DeBERTa-v3-large is PyTorch-only in HuggingFace — no TF escape hatch for this phase specifically (unlike Phase 2). The TF escape hatch from Phase 2 D-03 does not apply here.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope.

</deferred>

---

*Phase: 03-teacher-fine-tuning*
*Context gathered: 2026-04-04*
