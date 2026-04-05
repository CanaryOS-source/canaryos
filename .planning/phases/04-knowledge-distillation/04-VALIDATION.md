---
phase: 4
slug: knowledge-distillation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | scikit-learn (F1, classification_report) + inline notebook evaluation cells |
| **Config file** | None — evaluation embedded in notebook cells |
| **Quick run command** | Run holdout evaluation cell in notebook |
| **Full suite command** | Run all evaluation cells (Phase A eval + Phase B eval + temperature sweep + gate check) |
| **Estimated runtime** | ~30 seconds (holdout is 202 samples) |

---

## Sampling Rate

- **After every task commit:** Run holdout evaluation cell in notebook
- **After every plan wave:** Run all evaluation cells (Phase A + Phase B + temp sweep + gate)
- **Before `/gsd:verify-work`:** Full evaluation suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | TEXT-04 | manual | Verify memory profiling cell loads both models and reports VRAM | Wave 0 (notebook) | ⬜ pending |
| 04-01-02 | 01 | 1 | TEXT-04 | automated | Phase A soft-label training cell runs; holdout F1 printed | Wave 0 (notebook) | ⬜ pending |
| 04-01-03 | 01 | 1 | TEXT-04 | automated | Phase B intermediate layer training cell runs; holdout F1 printed | Wave 0 (notebook) | ⬜ pending |
| 04-01-04 | 01 | 1 | TEXT-04 | automated | Temperature sweep cell produces T={2,3,4,5} comparison table | Wave 0 (notebook) | ⬜ pending |
| 04-01-05 | 01 | 1 | TEXT-04 | automated | Gate check cell: F1 >= 0.8019 (or D-06 recovery triggered) | Wave 0 (notebook) | ⬜ pending |
| 04-02-01 | 02 | 2 | TEXT-04 | automated | Checkpoint saved to research/models/student_finetuned/ | Wave 0 (notebook) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] All validation is embedded in the notebook cells — no separate test files needed
- [ ] Notebook structure includes: memory profiling, Phase A training+eval, Phase B training+eval, temperature sweep, gate check, checkpoint save
- [ ] Layer mapping table documented in config cell before any training code

*The notebook IS the test infrastructure for this research phase.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Layer mapping documented before training | TEXT-04-02 | Structural decision in config cell | Verify Cell 2 contains 24-row layer mapping table before running training |
| Intermediate layer loss active in Phase B | TEXT-04-01 | Loss composition is code-level check | Verify Phase B loss function includes hidden_loss + attn_loss components |
| Memory profiling confirms T4 fit | D-08 | Hardware-dependent | Run memory profiling cell, confirm peak VRAM < 14GB |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
