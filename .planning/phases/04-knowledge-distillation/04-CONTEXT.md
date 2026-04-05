# Phase 4: Knowledge Distillation - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Distill DeBERTa-v3-large teacher accuracy into MobileBERT student (24.6M params) via intermediate layer transfer + soft labels, achieving at least 3 F1 points improvement over the Phase 2 direct fine-tune baseline (F1=0.7719) on the real-world holdout. Teacher is loaded live during training (frozen, no gradients). Student checkpoint saved for Phase 6 QAT.

**ROADMAP CORRECTION:** Phase 4 text in ROADMAP.md still references "TinyBERT-4" as the student. The actual student is **MobileBERT** (`google/mobilebert-uncased`, 24.6M params), selected in Phase 2. This changes layer mapping fundamentally: 24-layer teacher → 24-layer student (1:1 possible) instead of 24→4. MobileBERT's bottleneck architecture (inter-block hidden 128, intra-block 512) creates dimension mismatch with DeBERTa's 1024 hidden dim — learnable linear projections required.

</domain>

<decisions>
## Implementation Decisions

### Distillation Staging
- **D-01:** Progressive approach — Phase A: soft-labels-only distillation as a debuggable baseline checkpoint. Phase B: add intermediate layer transfer (attention matrix + hidden state alignment) on top. Both phases run regardless of Phase A results.
- **D-02:** Intermediate layer transfer is ALWAYS added even if soft-labels-only passes the 3-point gate. Soft labels are the diagnostic baseline, not a stopping point. TEXT-04 mandates intermediate layers, and a stronger base encoder benefits Phase 5 (multi-label intent head).

### Teacher Loading
- **D-03:** Teacher model loaded live during distillation training (not pre-computed intermediate representations). Teacher runs forward pass each batch to produce intermediate hidden states and attention matrices on-the-fly.
- **D-04:** Teacher is frozen (no gradients computed) during distillation — saves ~50% GPU memory vs trainable. Teacher's role is to provide alignment targets, not to learn.
- **D-05:** Pre-computed soft labels from Phase 3 (T={2,3,4,5} on Google Drive) are still used for the soft-label loss component. The live teacher forward pass is only for intermediate layer alignment.

### F1 Gate Recovery
- **D-06:** Claude's discretion on recovery strategy if the 3 F1 point gate (F1 ≥ 0.8019) proves infeasible given teacher ceiling (F1=0.8052, only 0.33 pts headroom). Researcher evaluates after first distillation run and recommends: relax gate to 2-point gain, improve teacher first, or iterate on distillation hyperparameters — based on where the student plateaus and error analysis.

### Compute Environment
- **D-07:** Start on Colab T4 (free tier, 16GB VRAM), fallback to Colab Pro A100 (40GB) if OOM. Same proven strategy as Phase 3. Notebook must include T4-to-A100 migration guide (Phase 3 D-03 pattern).
- **D-08:** Memory profiling cell runs before training — loads both models, runs a dummy forward pass with target batch size, reports peak VRAM usage. Catches OOM before committing to a full training run.
- **D-09:** Aggressive checkpointing to Google Drive (every epoch, same as Phase 3 D-04) for session timeout recovery.

### Claude's Discretion
- Layer mapping strategy: which of teacher's 24 layers to align with student's 24 layers (1:1, selective, or skip connections) — researcher determines based on MobileBERT's bottleneck architecture
- Linear projection architecture for dimension mismatch (DeBERTa 1024 → MobileBERT 512/128)
- Exact loss weights: alpha for soft-label KL vs hard-label CE, beta for intermediate layer losses
- Learning rate, warmup, weight decay, and gradient accumulation settings
- Batch size selection based on memory profiling results
- Temperature selection from T={2,3,4,5} sweep — selected by holdout F1, not training loss

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Distillation Requirements
- `.planning/REQUIREMENTS.md` §TEXT-04 — Full acceptance criteria: intermediate layer transfer required, layer mapping before training, temperature sweep T={2,3,4,5}, mixed loss (KL + CE, alpha=0.5 start), 3 F1 point improvement gate, checkpoint locations

### Research Docs (Phase 4 specific)
- `.planning/research/SUMMARY.md` — Intermediate layer distillation rationale, 3–5 F1 gain estimate (LOW confidence), layer mapping gap flag, MobileBERT vs TinyBERT-4 update
- `.planning/research/FEATURES.md` §Step 4 — Distillation approach details, temperature T=4–8 guidance, TinyBERT-style intermediate transfer rationale
- `.planning/research/PITFALLS.md` §Pitfall 2.1 — Teacher gate validation (F1 > 0.80 before distillation)
- `.planning/research/PITFALLS.md` §Pitfall 2.2 — Over-confident soft labels at low temperature (validates multi-temp generation)
- `.planning/research/PITFALLS.md` §Pitfall 2.3 — Architecture mismatch for intermediate layers (DeBERTa → MobileBERT dimension mismatch, projection layers needed)
- `.planning/research/STACK.md` — Distillation loss formula (KL + CE, alpha=0.5, T=4 starting point), PyTorch framework notes

### Prior Phase Outputs (inputs to this phase)
- `.planning/phases/01-data-foundation/01-CONTEXT.md` — Data generation decisions, dataset structure
- `.planning/phases/02-architecture-benchmark/02-CONTEXT.md` — MobileBERT selection rationale, PyTorch framework decision
- `.planning/phases/03-teacher-fine-tuning/03-CONTEXT.md` — Teacher training decisions, soft label pipeline, Colab environment patterns
- `research/notebooks/teacher_finetuning.ipynb` — Teacher training notebook (reuse data loading, Colab patterns, Drive mounting)
- `research/notebooks/architecture_benchmark.ipynb` — MobileBERT binary baseline training (reference for student fine-tuning patterns)
- `research/data/synthetic_scam_v1.jsonl` — Training dataset (22,942 samples)
- `research/data/holdout_realworld.jsonl` — Real-world evaluation oracle (202 samples)
- `research/models/benchmark_results.json` — Phase 2 results (MobileBERT baseline F1=0.7719)

### Teacher Artifacts (on Google Drive)
- `/content/drive/MyDrive/canaryos_teacher/` — Teacher checkpoint (1663.67 MB)
- Soft labels at T={2,3,4,5} — 4 files, 0.70 MB each, on Google Drive

### Key Prior Decisions (locked)
- Student: MobileBERT (`google/mobilebert-uncased`) — 24.6M params, 24 layers, bottleneck architecture (512→128→512)
- Teacher: DeBERTa-v3-large — 24 layers, 1024 hidden dim, F1=0.8052 holdout, F1=0.9990 synthetic
- Phase 2 binary baseline F1=0.7719 — the floor distillation must beat by ≥3 points
- Phase 3 ECE=0.0005 after calibration — soft labels are well-calibrated

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `research/notebooks/teacher_finetuning.ipynb` — Colab patterns: Drive mounting, checkpointing, session timeout recovery, per-vector error breakdown cell. Reuse data loading and evaluation cells.
- `research/notebooks/architecture_benchmark.ipynb` — MobileBERT training loop, binary classification head. Reference for student model initialization.
- `research/scripts/test_tflite.py` — TFLite verification patterns (not needed this phase but documents expected output contract)

### Established Patterns
- Research environment: Jupyter notebooks in `research/notebooks/` (mandatory for all ML research)
- Training framework: PyTorch + HuggingFace Transformers
- Colab: checkpoints to Google Drive, Drive mounting pattern, aggressive epoch-level saves
- Data in `research/data/` (gitignored), model outputs in `research/models/` (gitignored)

### Integration Points
- Input: Teacher checkpoint from Google Drive + pre-computed soft labels at T={2,3,4,5}
- Input: Synthetic training data (`research/data/synthetic_scam_v1.jsonl`) and holdout (`research/data/holdout_realworld.jsonl`)
- Output: Distilled student checkpoint in `research/models/student_finetuned/` — consumed by Phase 6 QAT
- Output: Per-temperature evaluation results on holdout — documents which T was optimal

</code_context>

<specifics>
## Specific Ideas

- Memory profiling cell must run BEFORE training starts — loads both models (teacher frozen, student trainable), runs dummy forward pass, reports peak VRAM. This is a hard requirement, not optional diagnostics.
- The soft-labels-only baseline (Phase A) serves as a diagnostic checkpoint: if it already exceeds the 3-point gate, the intermediate layer transfer (Phase B) should still improve further. If Phase A is far below target, the intermediate layers are the primary lever.
- MobileBERT's bottleneck architecture (inter-block 128 hidden) is unusual — standard TinyBERT distillation papers assume uniform hidden dimensions. The researcher should investigate whether aligning at the 512 (intra-block) or 128 (inter-block) dimension is more effective, or whether to align at both levels.
- The 0.33 F1 point headroom between gate (0.8019) and teacher ceiling (0.8052) is the tightest constraint in this phase. The progressive staging helps because Phase A results will reveal early whether the ceiling is reachable.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-knowledge-distillation*
*Context gathered: 2026-04-04*
