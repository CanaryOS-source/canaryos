# Phase 1: Data Foundation - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the real-world holdout set (locked evaluation oracle for all downstream phases) and generate the synthetic training dataset covering all 8 modern scam vectors. No model training happens in this phase.

</domain>

<decisions>
## Implementation Decisions

### Real-World Holdout

- **D-01:** Sources: FTC complaint data, r/scams (Reddit), and PhishTank — all three, not just one
- **D-02:** Target size: 200–300 samples (lower bound of TEXT-01 requirement)
- **D-03:** Vector balance: best-effort — aim for ~25–37 per vector but do not block on hard-to-find vectors (romance grooming and crypto grooming are underrepresented in public sources); document any gaps
- **D-04:** Holdout composition: mixed scam + safe — include ~50 legitimate messages so precision can be computed alongside recall. The safe samples in the holdout are sourced separately from the hard negatives in training data.

### Synthetic Generation — LLM Strategy

- **D-05:** Two-model generation: Gemini 2.5 Flash (~75% of samples) + a local open-source model via Ollama (~25%) to diversify token distribution and reduce mode collapse risk
- **D-06:** Local model choice: Claude's discretion — pick whichever of Llama 3.1 8B or Mistral 7B is easier to set up in the existing research environment (`.venv`, no GPU required — CPU inference is acceptable for the ~25% share)
- **D-07:** Prompt structural diversity required within each model's generation. Implemented via parametric prompt builder (`build_scam_prompt`, `build_safe_prompt`) that samples from 7 independent parameter spaces per call: scam sub-variant (12+/vector), writing register (12 styles), length target (3/channel), emotional angle (5/vector), sender persona (6-8/vector), cultural/demographic context (16 options), channel (4). This replaced static template cycling (5-8 fixed prompts) that caused structural repetition observed in initial 128-sample inspection.
- **D-08:** JS divergence check: compute token-unigram Jensen-Shannon divergence across vectors after generation and before training. If divergence is very low between vectors, generation strategy must be revised before proceeding.

### Synthetic Generation — Safe Class / Hard Negatives

- **D-09:** Hard negative types to include in safe class: bank/fraud alerts, package delivery notifications (USPS/FedEx/UPS real-pattern), 2FA/verification codes, medical/pharmacy alerts (appointments, prescription ready)
- **D-10:** Marketing and promotional messages excluded from safe class — keep safe class to transactional and functional messages only to avoid noisy labels
- **D-11:** Safe class hard negatives must be represented within the same topic domains as their corresponding scam vectors (e.g., legitimate bank notification vs bank impersonation scam, real delivery confirmation vs fake delivery fee scam)

### Synthetic Generation — Sample Distribution

- **D-12:** Threat-weighted distribution — not equal across vectors:
  - Crypto/investment (pig butchering) and romance grooming: ~2.5× base allocation (hardest to detect, fastest growing)
  - Tech support, government impersonation, phishing, urgency-payment, remote access: base allocation
  - Lottery/prize/reward: ~1.5K (classic pattern, simpler signal — least training coverage needed)
  - Total target: 16,000–24,000 scam samples across all vectors
- **D-13:** Scam:safe ratio in training set: 50:50 (balanced classes, no class weighting required; supports the >0.9 precision requirement by not over-representing scam class)

### Claude's Discretion

- Local Ollama model selection (Llama 3.1 8B vs Mistral 7B) — pick whichever installs cleanly in the existing `.venv` / Ollama environment
- Exact per-vector sample counts within the threat-weighted bands (researcher determines final numbers based on quality filter yield)
- LLM self-consistency discard threshold (aggressiveness of the two-pass quality filter)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Dataset Requirements
- `.planning/REQUIREMENTS.md` §TEXT-01 — Full acceptance criteria for the dataset (sample counts, vector list, quality filter spec, split ratios, human review gate)

### Research Docs (Phase 1 specific)
- `.planning/research/FEATURES.md` — Scam vector taxonomy, hard negative rationale, dataset sources, build-order dependencies
- `.planning/research/PITFALLS.md` — Pitfalls 1.1–1.4: evaluation contamination, mode collapse, prompt leakage, safety filtering
- `.planning/research/STACK.md` — Gemini structured output generation pattern via `google-genai` SDK; Pydantic schema for `ScamSample`; two-LLM note

### Project Constraints
- `.planning/PROJECT.md` §Constraints — <100ms latency, <50MB model budget, privacy (no server inference), TFLite constraint (affects downstream phases but informs what the dataset must enable)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `research/notebooks/improved_scam_classifier.ipynb` — Existing notebook; check for any reusable data loading or preprocessing cells before writing new ones
- `research/scripts/test_tflite.py` — Existing TFLite test script; not directly relevant to Phase 1 but documents the expected inference contract
- `research/data/README.md` — Check for any existing data directory conventions or gitignore notes before writing dataset files

### Established Patterns
- Research environment: Python + TF + HuggingFace in `.venv` at repo root; Jupyter notebooks in `research/notebooks/`
- Data outputs: gitignored in `research/data/` — dataset files go here, not committed to git
- Model outputs: gitignored in `research/models/` — benchmark results and checkpoints go here

### Integration Points
- Output files from Phase 1 consumed by Phase 2: `research/data/synthetic_scam_v1.jsonl` (train/val splits) and `research/data/test_split.jsonl` (test split) + the real-world holdout set
- Filename convention for holdout: `research/data/holdout_realworld.jsonl` (not specified in REQUIREMENTS.md — use this stable name so Phase 2+ can reference it)

</code_context>

<specifics>
## Specific Ideas

- Holdout includes ~50 safe messages (not just scam-only) so precision can be measured at each phase's evaluation gate
- The two-LLM approach is specifically to address the token-distribution uniformity pitfall — not just about prompt diversity
- JS divergence check is a mandatory pre-training gate, not optional diagnostics

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-data-foundation*
*Context gathered: 2026-04-02*
