---
phase: 3
slug: teacher-fine-tuning
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual validation cells in Colab notebook (no pytest — Colab environment) |
| **Config file** | N/A (notebook-internal) |
| **Quick run command** | Run Cell 9 (holdout evaluation) |
| **Full suite command** | Run Cells 8-12 (synthetic test + holdout + ECE + soft labels) |
| **Estimated runtime** | ~5 minutes (evaluation cells only, not training) |

---

## Sampling Rate

- **Per training attempt:** Run holdout eval cell (Cell 9) + per-vector breakdown
- **After all training:** Run full Cells 8-12 suite
- **Before `/gsd:verify-work`:** All assertion cells green
- **Max feedback latency:** ~300 seconds (evaluation cells on T4)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | TEXT-04-T1 | notebook cell | Cell 8: `assert synthetic_f1 > 0.95` | Wave 0 | pending |
| 03-01-02 | 01 | 1 | TEXT-04-T2 | notebook cell | Cell 9: `assert holdout_f1 > 0.80` | Wave 0 | pending |
| 03-01-03 | 01 | 1 | TEXT-04-T3 | notebook cell | Cell 13: `assert os.path.exists(checkpoint_path)` | Wave 0 | pending |
| 03-02-01 | 02 | 2 | TEXT-04-T4 | notebook cell | Cells 10-11: print ECE before/after calibration | Wave 0 | pending |
| 03-02-02 | 02 | 2 | TEXT-04-T5 | notebook cell | Cell 12: verify 4 `.pt` files exist at T={2,3,4,5} | Wave 0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `research/notebooks/teacher_finetuning.ipynb` — notebook with all validation cells embedded
- [ ] No separate test infrastructure needed — all validation is notebook-internal

*Existing infrastructure covers all phase requirements via notebook cells.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Per-vector error breakdown | TEXT-04 recovery | Colab-only visual inspection | Run Cell 9 per-vector breakdown, inspect for systematic weak vectors |
| T4-to-A100 migration | D-03 | Environment switch is manual user action | Follow migration section in notebook, verify checkpoint resume |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
