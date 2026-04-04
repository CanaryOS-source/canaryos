---
phase: 2
slug: architecture-benchmark
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (available via .venv) + Jupyter cell assertions |
| **Config file** | None — validation is notebook-internal + benchmark_results.json |
| **Quick run command** | Run benchmark notebook cells sequentially |
| **Full suite command** | `jupyter nbconvert --execute research/notebooks/architecture_benchmark.ipynb` |
| **Estimated runtime** | ~30 minutes (3 models × 3-5 epochs each + TFLite conversion) |

---

## Sampling Rate

- **After every task commit:** Verify notebook cell outputs match expected shapes and metrics format
- **After every plan wave:** Full notebook re-execution to ensure reproducibility
- **Before `/gsd:verify-work`:** Full suite must be green — `benchmark_results.json` exists, all 5 assertions pass, winner selected
- **Max feedback latency:** ~30 minutes (training-bound)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 0 | TEXT-02 | env setup | `python -c "import accelerate; print(accelerate.__version__)"` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | TEXT-02.1 | training | Assert 3 entries in `benchmark_results.json["candidates"]` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | TEXT-02.2 | pipeline | Per-architecture: tokenize → forward pass → logits shape [1,2] | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 2 | TEXT-02.3 | TFLite compat | LiteRT Interpreter load + invoke without flex delegate | ❌ W0 | ⬜ pending |
| 02-01-05 | 01 | 2 | TEXT-02.4 | exclusion | Assert "DistilBERT" in `benchmark_results.json["excluded"]` | ❌ W0 | ⬜ pending |
| 02-01-06 | 01 | 3 | TEXT-02.5 | selection | Assert `benchmark_results.json["winner"]["name"]` non-empty and `binary_baseline_f1 > 0` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `pip install accelerate>=0.26.0` — required before any HuggingFace Trainer call
- [ ] `pip install evaluate>=0.4.0 seaborn>=0.13.0` — metrics computation + visualization
- [ ] `mkdir -p research/models` — output directory for benchmark results
- [ ] MPS 1-epoch smoke test — verify PyTorch MPS training works before committing to full benchmark

*All are blocking: Trainer will not initialize without accelerate.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Architecture selection rationale is sound | TEXT-02.5 | Requires human judgment on trade-off reasoning | Review winner rationale in benchmark_results.json — check that F1, size, and latency are all considered |
| TFLite model produces plausible outputs | TEXT-02.2 | Numerical plausibility requires domain knowledge | Feed 5 known scam + 5 known safe texts, verify scores align with expected labels |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30min
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
