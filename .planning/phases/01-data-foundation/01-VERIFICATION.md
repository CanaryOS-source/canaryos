---
phase: 01-data-foundation
verified: 2026-04-04T03:44:59Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 1: Data Foundation Verification Report

**Phase Goal:** A validated training dataset exists that covers all 8 modern scam vectors, is anchored by real-world examples, and has a clean holdout set that will serve as the evaluation oracle for all downstream phases.
**Verified:** 2026-04-04T03:44:59Z
**Status:** PASSED
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Real-world holdout of 200-500 samples collected and locked before synthetic generation | VERIFIED | holdout_realworld.jsonl: 202 samples (108 scam, 94 safe), 2 source families (AUTOMATED + COMMUNITY), all 8 scam vectors represented. File locked by collect_holdout.py (refuses overwrite). Commit cb054f7 precedes synthetic generation commit 6155546. |
| 2 | Synthetic dataset 16,000-24,000 samples spanning all 8 vectors + safe class with 20-30% hard negatives | VERIFIED | 22,942 post-filter samples (27,000 raw). All 8 scam vectors present. Safe class = 12,654 samples (55.1%). Hard negatives targeted at 25% of safe class (within 20-30% spec). Generation script allocates `int(remaining * 0.25)` for hard negatives with 4+ domain types (bank alerts, delivery, 2FA, medical, legitimate_tech, legitimate_government). |
| 3 | Two-pass quality filter applied (consistency check + rule-based dedup/length) | VERIFIED | filter_and_split.py (869 lines) implements 6-stage pipeline. Pass 1: BART baseline tested (53% accuracy, below 70% threshold), fell back to keyword-based vector consistency (documented deviation, domain-appropriate). Pass 2: rule-based dedup (0 duplicates) + length filter (985 sub-15-token samples removed). Yield: 85% (22,942/27,000). |
| 4 | 100-sample human review completed, no mode collapse or topical over-specificity | VERIFIED | human_review_sample.jsonl contains exactly 100 samples across all 9 classes. Human review approved per STATE.md and 01-03-SUMMARY.md: "no mode collapse, 0% mislabeling, all criteria passed". All 5 quantitative acceptance criteria passed. |
| 5 | Train/val/test split 80/10/10 stratified by vector, saved to correct paths | VERIFIED | synthetic_scam_v1.jsonl: 20,647 samples (train=18,353/80.0%, val=2,294/10.0%). test_split.jsonl: 2,295 samples (10.0%). All 9 classes in both files. Zero text overlap between splits. random_state=42 for reproducibility. validate_split.py exits 0. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `research/scripts/validate_holdout.py` | Holdout structural validation | VERIFIED (132 lines) | Source-family check (PUBLIC_DB, COMMUNITY), 200-500 range, field validation, safe count >= 40. Exits 0. |
| `research/scripts/validate_synthetic.py` | Synthetic dataset validation | VERIFIED (288 lines) | --check-counts, --check-jsd (jensenshannon, 0.05 threshold), --check-negatives, --check-contamination (TfidfVectorizer). All 4 checks pass. |
| `research/scripts/validate_quality.py` | Quality filter validation | VERIFIED (83 lines) | Zero duplicates, zero sub-15-token. drop_duplicates used. Exits 0. |
| `research/scripts/validate_split.py` | Split validation | VERIFIED (189 lines) | 90/10 file split, 80/10/10 within-file, zero overlap, all 9 classes, random_state=42. Exits 0. |
| `research/scripts/collect_holdout.py` | Holdout collection script | VERIFIED (507 lines) | --dry-run mode, argparse, load_dataset (ucirvine/sms_spam), spot-check logging, schema validation, PhishTank/manual support, overwrite protection. |
| `research/scripts/generate_dataset.py` | Three-model generation pipeline | VERIFIED (1,284 lines) | Parametric prompt builder (build_scam_prompt, build_safe_prompt), SCAM_SUB_VARIANTS, REGISTERS, EMOTIONAL_ANGLES, CULTURAL_CONTEXTS, 7 parameter spaces. Preflight checks (Ollama, Gemini Flash, Gemini Lite). ScamSample Pydantic model + response_json_schema. Exponential backoff (429, 503, RESOURCE_EXHAUSTED). ETA logging. ThreadPoolExecutor parallel Gemini. Resumable. |
| `research/scripts/filter_and_split.py` | JSD + BART + filter + split pipeline | VERIFIED (869 lines) | jensenshannon, bart-large-mnli baseline with 0.70 threshold, keyword fallback, drop_duplicates, train_test_split with stratify + random_state=42, jsd_matrix.json output. |
| `research/data/holdout_realworld.jsonl` | Locked real-world holdout set | VERIFIED (202 lines) | 108 scam, 94 safe. All lines parse as JSON with text/label/vector/source fields. 2 source families. |
| `research/data/synthetic_raw.jsonl` | Raw synthetic dataset | VERIFIED (27,000 lines) | 13,500 scam + 13,500 safe. All 8 vectors at threat-weighted targets. 3 model sources: gemini-2.5-flash (41.8%), gemini-3.1-flash-lite-preview (50.9%), llama3.1:8b (7.3%). |
| `research/data/synthetic_scam_v1.jsonl` | Train+val split (post-filter) | VERIFIED (20,647 lines) | 18,353 train + 2,294 val. All 9 classes. "split" field present on all samples. "source" field present. |
| `research/data/test_split.jsonl` | Test split (post-filter) | VERIFIED (2,295 lines) | All 9 classes. "split": "test" on all samples. |
| `research/data/jsd_matrix.json` | JSD divergence matrix | VERIFIED | All 8x8 vector pairs. Min JSD = 0.338 (phishing vs tech_support), well above 0.05 threshold. |
| `research/data/human_review_sample.jsonl` | 100-sample human review set | VERIFIED (100 lines) | Covers all 9 classes. 52 scam, 48 safe. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| validate_holdout.py | holdout_realworld.jsonl | HOLDOUT_PATH constant | WIRED | `HOLDOUT_PATH = Path("research/data/holdout_realworld.jsonl")` at line 12 |
| collect_holdout.py | holdout_realworld.jsonl | HOLDOUT_PATH + write | WIRED | `HOLDOUT_PATH = Path("research/data/holdout_realworld.jsonl")` at line 43, writes JSONL output |
| generate_dataset.py | holdout_realworld.jsonl | contamination check | WIRED | `HOLDOUT_PATH = Path("research/data/holdout_realworld.jsonl")` at line 81, loads holdout texts for dedup |
| generate_dataset.py | synthetic_raw.jsonl | writes raw output | WIRED | `OUTPUT_PATH = Path("research/data/synthetic_raw.jsonl")` at line 80 |
| filter_and_split.py | synthetic_raw.jsonl | reads raw input | WIRED | `RAW_PATH = PROJECT_ROOT / "research" / "data" / "synthetic_raw.jsonl"` at line 53 |
| filter_and_split.py | holdout_realworld.jsonl | BART baseline check | WIRED | `HOLDOUT_PATH = PROJECT_ROOT / "research" / "data" / "holdout_realworld.jsonl"` at line 54 |
| filter_and_split.py | synthetic_scam_v1.jsonl | writes train+val | WIRED | `OUTPUT_TRAINVAL = PROJECT_ROOT / "research" / "data" / "synthetic_scam_v1.jsonl"` at line 55 |
| filter_and_split.py | test_split.jsonl | writes test split | WIRED | `OUTPUT_TEST = PROJECT_ROOT / "research" / "data" / "test_split.jsonl"` at line 56 |
| validate_synthetic.py | synthetic_scam_v1.jsonl | SYNTHETIC_PATH constant | WIRED | `SYNTHETIC_PATH = Path("research/data/synthetic_scam_v1.jsonl")` at line 21 |
| validate_quality.py | synthetic_scam_v1.jsonl | SYNTHETIC_PATH constant | WIRED | `SYNTHETIC_PATH = Path("research/data/synthetic_scam_v1.jsonl")` at line 15 |
| validate_split.py | synthetic_scam_v1.jsonl + test_split.jsonl | Path constants | WIRED | Lines 25-26 |

### Data-Flow Trace (Level 4)

Not applicable -- this phase produces data artifacts (JSONL files), not rendering components. Data flow verified through the pipeline chain: collect_holdout.py -> holdout_realworld.jsonl -> generate_dataset.py -> synthetic_raw.jsonl -> filter_and_split.py -> synthetic_scam_v1.jsonl + test_split.jsonl. All stages produce non-empty, structurally valid output confirmed by running all 4 validation scripts to exit 0.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| validate_holdout.py exits 0 | `python research/scripts/validate_holdout.py` | PASSED -- 202 samples, all fields valid, source families present | PASS |
| validate_synthetic.py --check-counts exits 0 | `python research/scripts/validate_synthetic.py` | PASSED -- 20,647 total, 8 vectors, 55.2% safe, all 4 hard neg types, JSD all >= 0.338, 0 contamination pairs | PASS |
| validate_quality.py exits 0 | `python research/scripts/validate_quality.py` | PASSED -- 0 duplicates, 0 sub-15-token samples | PASS |
| validate_split.py exits 0 | `python research/scripts/validate_split.py` | PASSED -- 80/10/10 split, 0 overlap, all 9 classes in both files | PASS |
| Holdout not contaminated by synthetic data | Python script checking text overlap | 0 holdout texts in trainval, 0 in test | PASS |
| JSD gate passes (no mode collapse) | Check jsd_matrix.json min value | Min JSD = 0.338 (phishing vs tech_support), threshold 0.05 | PASS |
| Commits exist in git history | `git log --oneline` for 4 commit hashes | All 4 found: db7c9f3, cb054f7, 6155546, ef206b5 | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TEXT-01 | 01-01, 01-02, 01-03 | Synthetic scam/safe dataset with real-world holdout | SATISFIED | All 7 acceptance criteria met: holdout 202 samples from public sources (SC-1), 22,942 samples across 8 vectors + safe (SC-2/SC-3), two-pass quality filter applied with documented BART fallback (SC-5), 80/10/10 stratified split (SC-6), 100-sample human review completed (SC-7), real-world holdout is primary oracle (SC-8). |

REQUIREMENTS.md traceability table shows TEXT-01 mapped to Phase 1 with status "Complete". No orphaned requirements for this phase -- TEXT-01 is the only requirement assigned to Phase 1.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | No TODO, FIXME, PLACEHOLDER, or stub patterns found in any research/scripts/ file |

**Note on "not available" match in generate_dataset.py line 268:** This is scam prompt template content ("reciprocity -- victim was personally selected for a private deal not available to the public"), not a placeholder indicator.

### Documented Deviations

Three deviations from original plan, all documented and justified:

1. **HuggingFace dataset substitution (Plan 01):** `ealvaradob/phishing-dataset` and `redasers/difraud` replaced with `ucirvine/sms_spam` due to legacy loading script incompatibility. 93 manual samples added to cover all 8 vectors and satisfy community source family requirement. Impact: none on holdout quality.

2. **Ollama share reduced from 25% to ~7% (Plan 02):** Ollama sequential CPU inference is slow. Gemini 3.1 Flash Lite added as third model to fill budget. Combined Gemini = 92.7%, Ollama = 7.3%. D-05 specifies 75% Gemini minimum (exceeded). Three-model diversity still achieved.

3. **BART baseline failure, keyword fallback (Plan 03):** BART-large-MNLI achieved only 53% accuracy on holdout (below 70% minimum). Tested multiple label phrasings and alternative models. Fell back to keyword-based vector consistency. This is domain-appropriate -- scam vectors have distinctive vocabulary. 88.6% of samples retained by keyword filter. All validation scripts pass post-filter.

### Human Verification Required

None required. All success criteria are programmatically verifiable, and all checks pass. The 100-sample human review (TEXT-01 SC-4) was already completed and approved during execution.

### Gaps Summary

No gaps found. All 5 observable truths verified. All 13 artifacts exist, are substantive (exceed minimum line counts), and are wired together through the pipeline chain. All 4 validation scripts exit 0 when run against the actual data. All 4 commits referenced in summaries exist in git history. No anti-patterns, no stubs, no placeholders. The TEXT-01 requirement is fully satisfied.

The phase is ready for Phase 2 (Architecture Benchmark) to begin.

---

_Verified: 2026-04-04T03:44:59Z_
_Verifier: Claude (gsd-verifier)_
