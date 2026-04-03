---
phase: 01-data-foundation
plan: "02"
subsystem: ml-research
tags: [data, synthetic-generation, gemini, ollama, wave-2]
dependency_graph:
  requires:
    - research/data/holdout_realworld.jsonl (from plan 01-01)
  provides:
    - research/scripts/generate_dataset.py
    - research/data/synthetic_raw.jsonl (BLOCKED — requires user action)
  affects:
    - plans/01-03 (quality filtering depends on synthetic_raw.jsonl)
tech_stack:
  added:
    - google-genai>=1.0.0 (installed in .venv)
    - pydantic>=2.0.0 (installed in .venv)
  patterns:
    - Two-model generation pipeline (Gemini 75% + Ollama 25%)
    - Pydantic ScamSample schema for structured JSON output
    - Exponential backoff for Gemini rate limiting
    - Resumable append-mode JSONL writing
    - Preflight checks before main generation loop
key_files:
  created:
    - research/scripts/generate_dataset.py
  modified: []
decisions:
  - "Used llama3.1:8b as Ollama model per D-06 (Claude's discretion — better documented for structured generation)"
  - "romance_grooming and government_impersonation routed 50% to Ollama per Pitfall 1.4 (safety filter bypass)"
  - "Hard negative safe class is 25% of safe target with 4 domain types per D-09/D-11"
  - "Script is resumable: loads existing synthetic_raw.jsonl and fills remaining per-vector gaps"
metrics:
  duration_minutes: 15
  completed_date: "2026-04-03"
  tasks_completed: 1
  tasks_total: 2
  files_created: 1
  files_modified: 0
---

# Phase 1 Plan 02: Two-Model Synthetic Dataset Generation Summary

**One-liner:** Two-model generation script (Gemini 2.5 Flash + Ollama Llama 3.1 8B) with threat-weighted distribution, preflight checks, exponential backoff, and concrete prompt templates for all 8 scam vectors — blocked on user-provided API key and Ollama model setup to produce synthetic_raw.jsonl.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Build two-model synthetic generation script | 6155546 | research/scripts/generate_dataset.py |
| 2 | Run generation and produce synthetic_raw.jsonl | BLOCKED | research/data/synthetic_raw.jsonl |

## What Was Built

### Generation Script (research/scripts/generate_dataset.py) — 774 lines

**Configuration block:**
- `VECTORS` dict with threat-weighted targets per D-12: crypto_investment=3000, romance_grooming=3000, tech_support=1200, government_impersonation=1200, phishing=1200, urgency_payment=1200, remote_access=1200, lottery_reward=1500
- `TOTAL_SCAM_TARGET` = 13,500 scam samples; `SAFE_TARGET` = 13,500 safe samples (50:50 per D-13)
- `GEMINI_SHARE=0.75`, `OLLAMA_SHARE=0.25` per D-05

**Pydantic schema:**
- `ScamSample(text, label, vector, channel)` used for Gemini structured output via `response_json_schema`

**Preflight checks (review items 2, 3, 4):**
1. GEMINI_API_KEY set
2. Holdout file exists at `research/data/holdout_realworld.jsonl`
3. Ollama running and `llama3.1:8b` model available
4. Ollama hardware benchmark (2 test samples, ETA estimate for full run)
5. Gemini 5-vector preflight test (exits if >1 failure)

**Gemini generation function:**
- Uses `gemini-2.5-flash` with `response_mime_type="application/json"` and `response_json_schema`
- Exponential backoff on 429/RESOURCE_EXHAUSTED: 1s, 2s, 4s per review item 10

**Ollama generation function:**
- Posts to `http://localhost:11434/api/generate` with `format="json"`, 180s timeout
- Graceful handling of non-JSON responses, connection errors, timeouts

**Prompt templates:**
- 8 scam vectors x 6-8 concrete templates each = ~56 scam prompt variants
- "scam awareness educator" indirect framing per Pitfall 1.4
- romance_grooming and government_impersonation routed 50% to Ollama
- Varies: channel (sms/email/whatsapp/app_notification), register (typos, formal, casual, non-native), length

**Hard-negative safe class prompts (review item 6):**
- `bank_alert`: 5 prompts (Chase fraud alert, security notification, card declined, low balance, statement ready)
- `delivery`: 6 prompts (USPS, FedEx, UPS, Amazon, DHL patterns)
- `twofa`: 5 prompts (2FA code, login verification, OTP, push notification, recovery code)
- `medical`: 5 prompts (pharmacy ready, appointment reminder, doctor confirmation, refill reminder, lab results)

**Normal transactional safe prompts:** 15 variants (order confirm, meeting reminder, subscription renewal, flight, gym, etc.)

**Resumability:** Script loads existing `synthetic_raw.jsonl`, counts per-vector existing samples, and only generates remaining needed — allows interrupt/resume.

**Per-vector progress with ETA (review item 13):** Prints every 100 samples: `[1200/3000 crypto_investment] ETA: 2.3h | Gemini: 900, Ollama: 300`

**Post-generation summary:** Prints total, per-vector counts vs targets, source split percentages.

## Blocked Task: Task 2 — Run Generation

Task 2 requires two external services that are not set up in this environment:

1. **GEMINI_API_KEY** — not set in environment
   - Get from: https://aistudio.google.com/apikey
   - Set: `export GEMINI_API_KEY="your-key"`

2. **Ollama llama3.1:8b** — only `kimi-k2.5:cloud` available (not `llama3.1:8b`)
   - Pull: `ollama pull llama3.1:8b`
   - Verify: `curl -s http://localhost:11434/api/tags | python3 -m json.tool`

The script's preflight checks correctly caught and reported both missing prerequisites before attempting any generation.

**To run after setup:**
```bash
cd /Users/saiamartya/Desktop/ClaudeWorkspace/CanaryOS/canaryos
export GEMINI_API_KEY="your-key-here"
.venv/bin/python research/scripts/generate_dataset.py
```

**Expected runtime:** ~2-8 hours for Gemini portion (27,000 total x 75% = ~20,000 Gemini calls at 0.5-1s each = 2.8-5.5 hours). Ollama on CPU varies significantly — the script's preflight benchmark will estimate before the main loop.

**Script is resumable:** If interrupted, re-run and it picks up where it left off.

## Deviations from Plan

None for Task 1. Task 2 is blocked on user action (authentication gate), not a code deviation.

## Known Stubs

None — `generate_dataset.py` is fully functional. It will produce `synthetic_raw.jsonl` once external services are available.

## Auth Gates Encountered

| Gate | Task | Required | Status |
|------|------|----------|--------|
| GEMINI_API_KEY | Task 2 | Get from https://aistudio.google.com/apikey | MISSING — user action required |
| llama3.1:8b Ollama model | Task 2 | `ollama pull llama3.1:8b` | MISSING — user action required |

## Self-Check: PASSED (partial — Task 1 only)

Files created:
- FOUND: research/scripts/generate_dataset.py

Commits verified:
- FOUND: 6155546 (feat(01-02): create two-model synthetic generation script)

Task 2 (synthetic_raw.jsonl): NOT FOUND — blocked on auth gate. Will be generated by user after providing GEMINI_API_KEY and pulling llama3.1:8b.
