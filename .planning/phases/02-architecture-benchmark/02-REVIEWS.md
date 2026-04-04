---
phase: 2
reviewers: [gemini]
reviewed_at: 2026-04-04T00:00:00Z
plans_reviewed: [02-01-PLAN.md, 02-02-PLAN.md]
---

# Cross-AI Plan Review — Phase 2

## Gemini Review

### 1. Summary
The implementation plans for Phase 2 provide a robust, empirical framework for selecting the optimal student architecture for CanaryOS. The strategy effectively pivots from the originally intended `optimum` library to a more reliable `ONNX → onnx2tf → TFLite` pipeline, addressing a critical research finding regarding library versioning. By focusing on real-world holdout performance as the primary metric and enforcing strict on-device constraints (size, latency, and standard TFLite op compatibility), the plans ensure that the selected model is not just "accurate on paper" but production-ready for the iOS/Android target environments.

### 2. Strengths
- **Empirical Rigor:** The plan avoids "architecture by intuition" by benchmarking all three candidates (MobileBERT, TinyBERT-4, ELECTRA-small) on identical data splits and hyperparameters.
- **Hardware Awareness:** Correctly identifies and mitigates MPS (Metal Performance Shaders) limitations, specifically the lack of `fp16/bf16` training support and the need for explicit cache clearing.
- **Pipeline Integrity:** Testing the full pipeline (Tokenizer → TFLite) rather than just model weights is crucial for catching real-world deployment issues like "SELECT_TF_OPS" disqualifications early.
- **Metric Alignment:** Prioritizing the real-world holdout F1 score (D-07) ensures the model generalizes beyond the synthetic training distribution.
- **Fallback Logic:** Includes proactive memory management (reducing batch size for MobileBERT) and explicit check-ins for human approval before proceeding to the expensive Phase 3 distillation.

### 3. Concerns

- **Quantization Strategy (MEDIUM):** Plan 02-02 mentions INT8 model size but doesn't explicitly detail the quantization method (e.g., Post-Training Quantization vs. Dynamic Range Quantization). Full INT8 quantization usually requires a representative dataset for calibration to prevent accuracy drops. *Risk:* If simple dynamic range quantization is used, it may meet the size requirement but fail to provide the expected hardware acceleration on mobile DSPs/NPUs.

- **Tokenizer Consistency (LOW):** While all architectures share the BERT 30,522 vocab, slight variations in tokenizer configuration (strip_accents, clean_text, handle_chinese_chars) can lead to subtle performance degradation. *Risk:* Using different tokenizer instances per model instead of one "Ground Truth" tokenizer configuration might introduce noise into the benchmark.

- **MobileBERT Memory Overhead (MEDIUM):** MobileBERT is significantly deeper/wider than TinyBERT. On a 16GB/24GB Mac, 5 parallel runs or high batch sizes might still trigger system swap despite `empty_cache()`. *Risk:* Throttling or OOM crashes could interrupt the long-running benchmark notebook.

- **Latency Measurement Environment (LOW):** D-08 specifies "Desktop TFLite interpreter only." *Risk:* While sufficient for ranking, desktop x86/ARM64 performance does not always scale linearly with mobile NPU/GPU performance (especially for MobileBERT's unique bottleneck layers).

### 4. Suggestions

- **Quantization Calibration:** In Plan 02-02, Task 1, explicitly specify the use of a small subset (e.g., 100 samples) from the synthetic training set as a representative dataset for `onnx2tf` full-integer quantization.
- **Centralized Tokenizer:** Ensure the notebook initializes a single `AutoTokenizer.from_pretrained("bert-base-uncased")` and applies it to all datasets once, rather than re-tokenizing per model, to guarantee input parity.
- **Gradient Accumulation:** If MobileBERT requires a batch size reduction to 8, suggest using `gradient_accumulation_steps=2` in the HF Trainer to maintain the effective batch size of 16 used by the other models, ensuring gradient stability remains a controlled variable.
- **Flex Ops Validation:** Add a specific grep-check or script check for "Flex" or "Select" prefixes in the generated TFLite model's operator list to programmatically confirm the `SELECT_TF_OPS` disqualification criteria.

### 5. Risk Assessment: LOW
The plans are exceptionally well-grounded in the project's specific constraints. The move to `onnx2tf` shows a high level of technical adaptability. Most risks are related to "fine-tuning" the benchmarking process rather than structural flaws. Following the suggested improvements regarding quantization calibration and gradient accumulation will further harden the benchmark against invalid results. The dependency chain is logical, and the success criteria are measurable and binary.

---

## Consensus Summary

*Single reviewer (Gemini) — consensus analysis requires 2+ reviewers. Claude CLI was skipped (current runtime). Codex CLI not installed.*

### Key Strengths (Gemini)
- Empirical, data-driven approach with identical conditions across all candidates
- Full pipeline testing (tokenizer → TFLite) catches deployment issues early
- Real-world holdout as primary metric prevents synthetic overfitting
- MPS hardware constraints properly identified and mitigated

### Key Concerns to Address
1. **(MEDIUM) Quantization calibration** — Phase 2 measures model size but doesn't detail the quantization method for the size measurement. This is acceptable for Phase 2 (QAT is Phase 6), but the size numbers from onnx2tf default conversion may differ from final INT8 QAT output. Plans should note that Phase 2 size is indicative, not final.
2. **(MEDIUM) MobileBERT memory** — OOM risk on MPS with batch_size=16 for the largest model. The plan includes a batch_size=8 fallback but should add gradient_accumulation_steps=2 to maintain effective batch parity.
3. **(LOW) Tokenizer consistency** — Each model uses its own tokenizer instance. Since all three share the same 30,522 WordPiece vocab, this is unlikely to cause issues, but worth a quick assertion.
4. **(LOW) Desktop vs mobile latency** — Acknowledged as a ranking-only measurement (D-08/D-09). No action needed for Phase 2.

### Actionable Items for Plan Revision
- Add `gradient_accumulation_steps=2` when batch_size is reduced to 8 for any model
- Add assertion that all three tokenizers have identical vocab size (30,522)
- Note in benchmark_results.json that tflite_size_mb is from default onnx2tf conversion, not INT8 QAT (final size determined in Phase 6)
