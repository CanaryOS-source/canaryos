---
phase: 1
slug: data-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x |
| **Config file** | research/scripts/ (inline scripts, no pytest config yet — Wave 0 installs) |
| **Quick run command** | `python -m pytest research/scripts/test_dataset.py -q` |
| **Full suite command** | `python -m pytest research/scripts/ -v` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `python -m pytest research/scripts/test_dataset.py -q`
- **After every plan wave:** Run `python -m pytest research/scripts/ -v`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-holdout-01 | holdout | 1 | TEXT-01 | script | `python research/scripts/validate_holdout.py` | ❌ W0 | ⬜ pending |
| 1-holdout-02 | holdout | 1 | TEXT-01 | manual | see Manual-Only | N/A | ⬜ pending |
| 1-generate-01 | generate | 2 | TEXT-01 | script | `python research/scripts/validate_synthetic.py --check-counts` | ❌ W0 | ⬜ pending |
| 1-generate-02 | generate | 2 | TEXT-01 | script | `python research/scripts/validate_synthetic.py --check-jsd` | ❌ W0 | ⬜ pending |
| 1-generate-03 | generate | 2 | TEXT-01 | script | `python research/scripts/validate_synthetic.py --check-negatives` | ❌ W0 | ⬜ pending |
| 1-filter-01 | filter | 3 | TEXT-01 | script | `python research/scripts/validate_quality.py` | ❌ W0 | ⬜ pending |
| 1-split-01 | split | 4 | TEXT-01 | script | `python research/scripts/validate_split.py` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `research/scripts/validate_holdout.py` — validates holdout file exists, line count 200–500, all expected fields present, no training-set contamination flag
- [ ] `research/scripts/validate_synthetic.py` — validates synthetic file counts per vector, JSD computation, hard negative ratios
- [ ] `research/scripts/validate_quality.py` — validates two-pass filter applied (duplicate count = 0, no sub-15-token samples)
- [ ] `research/scripts/validate_split.py` — validates train/val/test files exist at correct paths, stratified counts match 80/10/10, no overlap between splits

*All validation scripts are simple JSON/JSONL readers — no ML framework dependencies needed for Wave 0.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 100-sample human review — no mode collapse | TEXT-01 SC-4 | Requires human judgment of linguistic diversity | Sample 100 random items from synthetic dataset, read each; flag if >30% of any vector's samples share identical surface phrases or topic anchors |
| Holdout source provenance | TEXT-01 SC-1 | Requires verifying URLs and source metadata | Check `holdout_realworld.jsonl` metadata field for source tag (ftc/reddit/phishtank) on each sample |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
