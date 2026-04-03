---
phase: 1
reviewers: [claude-sonnet-4-6-inline]
reviewed_at: 2026-04-03T01:27:55Z
plans_reviewed: [01-01-PLAN.md, 01-02-PLAN.md, 01-03-PLAN.md]
note: Gemini CLI requires GEMINI_API_KEY (not set). Codex not installed. Claude CLI skipped (current runtime). Review performed inline by Claude Sonnet 4.6 — treat as structured self-audit, not adversarial cross-AI review. For true adversarial review, set GEMINI_API_KEY and re-run /gsd:review --phase 1.
---

# Cross-AI Plan Review — Phase 1: Data Foundation

## Claude Sonnet 4.6 (Inline Self-Audit)

---

### Plan 01-01: Validation Scaffolding + Real-World Holdout Collection

#### Summary

Plan 01-01 establishes the critical evaluation oracle by building 4 validation scripts and collecting a real-world holdout set (200+ samples) from HuggingFace automated sources plus optional manual sources. The plan correctly enforces the hard gate — holdout is locked before any synthetic generation. However, it makes unvalidated size assumptions about HuggingFace datasets and uses brittle keyword-based vector mapping for the difraud dataset. Failure here cascades to all 6 downstream phases.

#### Strengths

- Hard gate enforcement: script explicitly refuses to overwrite holdout once written, directly preventing Pitfall 1.1 (evaluation contamination)
- Multi-source diversity: requires 3+ unique source families from different origin channels
- Correct dependency sequencing: holdout collection is Wave 1, before any generation
- Reusable validation infrastructure: 4 standalone scripts usable across all downstream phases
- Safe composition explicitly checked: assertion for >= 40 safe samples ensures precision evaluation is possible
- Vector gap documentation: plan acknowledges underrepresented vectors and documents gaps rather than blocking

#### Concerns

**HIGH — HuggingFace dataset size assumptions are unvalidated**
Plan assumes 3 HuggingFace datasets yield ~150 samples. These may be smaller, stale, or schema-changed. If automated sources yield only 80 samples, holdout falls below 200-sample requirement and blocks Plan 02. No fallback is documented.

**HIGH — Keyword-based vector mapping for difraud is brittle**
`redasers/difraud` likely has generic fraud labels (true/false), not scam vector annotations. Keyword extraction is error-prone — crypto scams may be misidentified as tech_support, romance scams conflated with phishing. This introduces label corruption into the evaluation oracle.

**HIGH — validate_holdout.py source-family check is too weak**
Asserting "3 unique source values" can pass if all 3 values are HuggingFace variants (huggingface_phishing, huggingface_difraud, huggingface_sms_spam). The intent of D-01 is diversification across origin families (automated + phishtank + manual), not just 3 different dataset names.

**MEDIUM — Manual holdout JSON schema not validated on load**
`manual_holdout.jsonl` is user-curated but loaded without field-level validation. A missing `vector` field in one record causes downstream failure when processing expects the field.

**MEDIUM — Validation script error messages are not actionable**
Acceptance criteria only require `sys.exit(1)` to exist, not that error messages specify which source is failing. "Holdout too small" is more helpful than "AssertionError".

**LOW — No Python version guard**
Scripts assume Python 3.12 but don't verify at entry. Incompatible API changes on Python 3.10 produce cryptic ImportErrors.

#### Suggestions

- Add `collect_holdout.py --dry-run` mode: query HuggingFace datasets and print expected sample counts without writing to disk. Run before committing.
- Strengthen validate_holdout.py: require at least 1 sample from `phishtank` OR `ftc`/`reddit_rscams` in addition to 3+ unique values.
- Add per-source sample count table before assembly: `crypto_investment | 5 | 25 | UNDERREPRESENTED (⚠️)`.
- Verify keyword mapping: print 5 random difraud texts with inferred vectors during collection so executor can spot-check before locking.
- Add schema validation for each manually-loaded sample before adding to assembly.

---

### Plan 01-02: Two-Model Synthetic Dataset Generation

#### Summary

Plan 01-02 generates ~27K raw synthetic samples via Gemini 2.5 Flash (75%) + Ollama Llama 3.1 8B (25%) with threat-weighted vector distribution and hard negatives. Pydantic-enforced schema validation and holdout contamination checking are well-designed. Execution risk is primarily environmental: Gemini API reliability with scam prompts at scale, and Ollama CPU inference speed. The estimated 3–8 hour runtime is likely optimistic. Safe class hard-negative prompts are underspecified.

#### Strengths

- Threat-weighted VECTORS config block is explicit and maps directly to D-12 decisions
- Two-model diversity directly addresses Pitfall 1.2 (mode collapse) with different model families
- Indirect prompting for sensitive vectors (romance, government impersonation routed to Ollama) is proactive Pitfall 1.4 mitigation
- Pydantic `ScamSample` schema with `response_json_schema` enforces structured output at the API level
- Idempotent generation loop: resumes from existing synthetic_raw.jsonl if interrupted
- Contamination check at generation time: holdout texts excluded from output in real-time
- Rate limiting built in: 0.5s sleep between Gemini calls

#### Concerns

**HIGH — Ollama CPU inference speed is unvalidated and likely underestimated**
For 6,750 Ollama samples, at 60–180s per sample on real hardware, wall-clock time ranges from 113 to 338 hours — far beyond the "3–8 hour" estimate. If the bottleneck is discovered mid-run, executor may reduce Ollama share from 25% to 5%, violating D-05 (two-model diversity) without documentation. This is the primary risk for this plan.

**HIGH — Gemini 2.5 Flash structured output with scam prompts is untested**
If Gemini refuses prompts or returns invalid JSON for >5% of calls, total sample count falls below 16K. If Gemini mislabels scam samples as "safe" for 2–3% of calls, ~400 mislabeled samples enter training. Label corruption in training data is unrecoverable without re-running the full pipeline.

**HIGH — Romance grooming and government impersonation Ollama routing has no fallback**
If Ollama is not running or llama3.1:8b is not pulled, generation for these two vectors fails silently. Validation later detects 0 or underrepresented samples. JSD check may also fail if these vectors collapse.

**HIGH — Safe class hard-negative prompts are not specified**
Plan lists hard-negative types (bank alerts, delivery, 2FA, medical) but provides no concrete prompt templates. Generator may produce obviously synthetic hard negatives ("Dear customer, your verification code is 123456") that are trivially distinguishable, defeating the purpose of D-09.

**MEDIUM — No error handling for Ollama JSON parse failures**
Ollama's `format: json` is a hint, not a guarantee. Non-JSON response raises an exception, halting the generation loop mid-run. Resume is possible but requires manual cleanup of the last N lines.

**MEDIUM — Prompt template diversity is referenced but not provided**
Plan says "create 5–8 diverse prompt templates per vector" but does not include them. If executor writes generic prompts ("Write a crypto scam"), JSD gate later detects mode collapse and the 3–8 hour generation loop must be re-run from scratch.

**MEDIUM — Gemini rate limit handling (0.5s sleep) insufficient for free-tier keys**
Free-tier Gemini API allows ~15 QPM. At 0.5s between calls (120 QPM), the script hits rate limits immediately, triggering repeated HTTP 429 errors and unpredictable slowdowns.

**LOW — No per-vector progress logging granularity**
Progress every 500 samples in a 3–8 hour run leaves executors unable to distinguish "hung" from "slow" for 5-10 minutes at a time.

#### Suggestions

- Add hardware benchmark at script start: run 1–2 Ollama test samples, measure time, estimate total. Print warning if total > 24 hours with suggestion to reduce Ollama share to 15%.
- Add preflight test: generate 5 test samples per vector (40 samples total) through Gemini before the main loop. If >1 fails, halt and print: "Gemini is rejecting scam prompts. Revise indirect prompting strategy."
- Add explicit Ollama availability check and llama3.1:8b model verification at startup (before any generation begins).
- Include concrete hard-negative prompt templates: `"Generate a realistic bank fraud alert SMS (legitimate, not a scam)"`, `"Generate a USPS delivery tracking notification with tracking number"`.
- Add exponential backoff for Gemini rate limiting (1s, 2s, 4s on 429 responses).
- Add per-vector progress logging every 100 samples with ETA: `[2350/13500 crypto_investment] ETA: 3.2h`.

---

### Plan 01-03: Quality Filter, JSD Gate, Stratified Split, Human Review

#### Summary

Plan 01-03 applies a rigorous 4-stage pipeline (JSD gate → LLM self-consistency → rule-based filter → stratified split) ending with a blocking human review. The design is architecturally sound. The key risk is that bart-large-mnli's accuracy on the scam/safe binary classification task is assumed but never validated — if it's miscalibrated, the adaptive threshold logic may cascade into accepting mislabeled samples. Human review acceptance criteria are too vague to be consistently enforced.

#### Strengths

- JSD gate runs on raw data before quality filter: correct order — mode collapse detected before committing samples
- bart-large-mnli zero-shot avoids circular dependency (teacher hasn't seen training data, judgments are independent)
- Adaptive threshold (0.6→0.5 per vector if >40% discard rate) provides pragmatic flexibility without abandoning quality
- Rule-based dedup + length filter is orthogonal to LLM filter: catches additional quality issues
- Stratified split on `vector` field ensures all 8 vectors appear in train/val/test proportionally
- 100-sample human review is a hard blocking gate — cannot be bypassed
- jsd_matrix.json persisted for transparency and later analysis

#### Concerns

**HIGH — bart-large-mnli domain accuracy on scam/safe task is unvalidated**
bart-large-mnli is trained on NLI with entailment/neutral/contradiction labels. Zero-shot performance on scam/safe binary classification may be significantly below 0.85. If the teacher has systematic biases (e.g., associates "urgent" with scam even in legitimate bank alerts), the adaptive threshold logic may cascade into accepting misclassified samples. Undiscovered until Phase 2 when training produces unexpectedly low F1.

**HIGH — Adaptive threshold cascade: lowering to 0.5 may accept corrupted samples**
If romance_grooming loses 45% of samples at threshold 0.6, lowering to 0.5 recovers samples in the 0.5–0.6 confidence band, which may be the most ambiguous and mislabeled region of the distribution. Final dataset could have label noise concentrated in the vectors where quality was already lowest.

**HIGH — bart-large-mnli model download (~1.6GB) is not pre-verified**
If disk space is insufficient or internet is slow, model download fails mid-script with a cryptic transformers error. No recovery path is documented.

**MEDIUM — JSD threshold (0.05) has no sensitivity analysis**
The threshold is fixed but unvalidated. Two legitimately-different vectors may share high-frequency terms ("urgent", "click", "verify") and produce JSD < 0.05 from vocabulary overlap, not semantic similarity. Or two genuinely collapsed vectors pass the gate. No guidance exists for interpreting JSD values.

**MEDIUM — Human review acceptance criteria are vague and subjective**
Task 2 describes failure modes qualitatively ("if you see mode collapse") but provides no quantitative thresholds. Different executors will apply different bars. This is the final gate before Phase 2 — it must be consistent.

**MEDIUM — Adaptive threshold: per-vector sample log not specified before lowering threshold**
Plan says: "lower to 0.5 if >40% discard rate", but does not require manual review of discarded samples before the threshold change. The 40% discard rate may be caused by legitimate label noise (lower the threshold) or by the vector having low-quality generated text (keep threshold, accept lower count).

**LOW — No pre-check for synthetic_raw.jsonl existence**
If Plan 02 was not completed, filter script fails with an unhelpful FileNotFoundError instead of a clear "Plan 02 must complete first" message.

**LOW — Stratified split random_state=42 undocumented as deterministic requirement**
Not documented as a reproducibility requirement — executors may change it without realizing the impact on cross-phase consistency.

#### Suggestions

- Add bart accuracy baseline: run bart-large-mnli on 100 holdout samples (known labels), print accuracy. If < 0.85, print warning and ask executor to confirm before proceeding.
- Before lowering adaptive threshold, log 20 discarded samples per affected vector. Executor reviews manually: if >50% are correctly labeled but low-confidence, lower threshold. If >50% are genuinely ambiguous, keep threshold and accept lower count.
- Add pre-check at script start: `if not Path("research/data/synthetic_raw.jsonl").exists(): sys.exit("Plan 02 must complete first.")`.
- Add quantitative human review criteria:
  - Reject if >30% of any vector's samples in the 100-sample set share identical surface phrases
  - Reject if any vector covers only 1–2 sub-scenarios
  - Reject if >5% of 100 samples appear mislabeled
  - Reject if hard-negative safe samples read as obviously synthetic
- Add JSD interpretation guidance (e.g., "JSD < 0.05 = likely mode collapse; JSD 0.1–0.2 = expected for related scam types; JSD > 0.3 = strong diversity").
- Pre-download bart-large-mnli in a setup step with disk space check before the main filter loop.

---

## Consensus Summary

*(Single reviewer — no cross-AI consensus possible. Run `/gsd:review --phase 1` with GEMINI_API_KEY set for adversarial review.)*

### Top Concerns (High Confidence)

**1. Ollama CPU inference will bottleneck Plan 02**
Estimated 3–8 hours is unrealistic. Real hardware clock time for 6.75K local samples at 60–180s each is 113–338 hours. This is the most likely cause of Phase 1 execution delays or D-05 violation. Add hardware benchmark before main loop.

**2. No validation that generative models work before committing to long-running loops**
Both Plan 02 (Gemini structured output) and Plan 03 (bart-large-mnli accuracy) rely on untested assumptions. A 10-minute preflight test for each would catch showstopper issues before 3–8 hour runs. Missing these preflight checks is the highest-probability failure mode.

**3. HuggingFace holdout source size assumptions are unvalidated**
Plan 01-01 may fail immediately if automated datasets return fewer samples than expected. A `--dry-run` mode on collect_holdout.py would catch this in 2 minutes. Without it, the first failure is discovered only after the full collection script runs.

### Agreed Strengths (High Confidence)

- Holdout-first hard gate is correctly enforced
- Threat-weighted distribution (D-12) correctly allocates more samples to hardest-to-detect vectors
- Two-model generation (D-05) is the right approach for mode collapse mitigation
- Pydantic schema + `response_json_schema` is correct structured output approach
- JSD gate runs before quality filter (correct pipeline order)
- 100-sample human review as blocking gate is appropriate
- 80/10/10 stratified split with `random_state=42` is reproducible

### Divergent Views

*(N/A — single reviewer)*

---

## Using This Review

To incorporate this feedback into planning:

```
/gsd:plan-phase 1 --reviews
```

### Priority Fixes Before Execution

**Must-fix (blocks execution):**
1. Add `collect_holdout.py --dry-run` to pre-validate HuggingFace dataset sizes
2. Add Ollama availability check + llama3.1:8b verification in generate_dataset.py
3. Add Ollama hardware benchmark (1–2 test samples) before main generation loop
4. Add Gemini preflight test (40 samples across all vectors) before main generation loop
5. Add bart-large-mnli accuracy baseline on holdout before self-consistency filter

**Should-fix (execution quality):**
6. Provide concrete hard-negative prompt templates (currently underspecified)
7. Provide concrete scam generation prompt templates with diversity (currently delegated to executor)
8. Strengthen validate_holdout.py source-family check (3 families, not just 3 unique values)
9. Add quantitative human review acceptance criteria
10. Add exponential backoff for Gemini rate-limiting

**Fix if time permits:**
11. Strengthen difraud keyword-based vector mapping with spot-check logging
12. Add JSD sensitivity analysis and interpretation guidance
13. Add per-vector progress logging with ETA to generate_dataset.py
