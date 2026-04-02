# Phase 1: Data Foundation — Discussion Log

**Date:** 2026-04-02
**Workflow:** /gsd:discuss-phase 1

---

## Area 1: Real-World Holdout Sources

**Q:** Which sources to prioritize for the real-world holdout set?
**Options:** FTC + r/scams + PhishTank / r/scams only / Existing public datasets
**Selected:** FTC + r/scams + PhishTank (all three)

**Q:** How many real-world samples to target?
**Options:** 200–300 / 400–500 / You decide
**Selected:** 200–300 samples

**Q:** Should the holdout be balanced across vectors or best-effort?
**Options:** Best-effort balance / Strictly balanced
**Selected:** Best-effort balance — aim for ~25–37 per vector, accept gaps in romance/crypto, document them

**Q:** Should the holdout include safe-class messages?
**Options:** Scam-only / Mixed scam + safe
**Selected:** Mixed scam + safe — include ~50 legitimate messages for precision measurement

---

## Area 2: Multi-LLM Diversity Strategy

**Q:** Which generation strategy to prevent mode collapse?
**Options:** Gemini-only with prompt diversity / Gemini + open-source model / Two hosted APIs
**Selected:** Gemini + open-source model via Ollama (~75% Gemini, ~25% local model)

**Q:** Should JS divergence be measured across vectors post-generation?
**Options:** Yes, measure divergence / No, rely on human review
**Selected:** Yes — token-unigram JS divergence check is a mandatory pre-training gate

**Q:** Which local model to use via Ollama?
**Options:** Llama 3.1 8B / Mistral 7B / You decide
**Selected:** Claude's discretion (whichever installs cleanly in existing environment)

---

## Area 3: Hard Negative Scope

**Q:** Which legitimate-but-urgent message types for safe class hard negatives?
**Options (multiSelect):** Bank/fraud alerts / Package delivery / 2FA codes / Medical/pharmacy
**Selected:** All four — bank/fraud alerts, package delivery, 2FA/verification codes, medical/pharmacy

**Q:** Include marketing/promotional messages in safe class?
**Options:** Include marketing / Exclude marketing
**Selected:** Exclude — keep safe class to transactional/functional messages only

---

## Area 4: Sample Distribution Weighting

**Q:** How to distribute 16K–24K samples across 8 vectors?
**Options:** Threat-weighted / Equal distribution / You decide
**Selected:** Threat-weighted — crypto/romance at ~2.5× base; lottery/prize at ~1.5K base

**Q:** Scam:safe ratio in training set?
**Options:** 50:50 / 70:30 scam-heavy / You decide
**Selected:** 50:50 balanced classes

---

## Additional Areas

User opted out — no additional areas needed.
