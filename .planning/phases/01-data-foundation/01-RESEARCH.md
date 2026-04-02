# Phase 1: Data Foundation - Research

**Researched:** 2026-04-02
**Domain:** Synthetic scam dataset generation, real-world data collection, quality filtering pipeline
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Real-World Holdout**
- D-01: Sources: FTC complaint data, r/scams (Reddit), and PhishTank — all three, not just one
- D-02: Target size: 200–300 samples (lower bound of TEXT-01 requirement)
- D-03: Vector balance: best-effort — aim for ~25–37 per vector but do not block on hard-to-find vectors (romance grooming and crypto grooming are underrepresented in public sources); document any gaps
- D-04: Holdout composition: mixed scam + safe — include ~50 legitimate messages so precision can be computed alongside recall. The safe samples in the holdout are sourced separately from the hard negatives in training data.

**Synthetic Generation — LLM Strategy**
- D-05: Two-model generation: Gemini 2.5 Flash (~75% of samples) + a local open-source model via Ollama (~25%) to diversify token distribution and reduce mode collapse risk
- D-06: Local model choice: Claude's discretion — pick whichever of Llama 3.1 8B or Mistral 7B is easier to set up in the existing research environment (`.venv`, no GPU required — CPU inference is acceptable for the ~25% share)
- D-07: Prompt structural diversity required even within Gemini generation: vary channel (SMS/email/WhatsApp/app notification), register (typos, non-native English, formal, colloquial), length, and formality
- D-08: JS divergence check: compute token-unigram Jensen-Shannon divergence across vectors after generation and before training. If divergence is very low between vectors, generation strategy must be revised before proceeding.

**Synthetic Generation — Safe Class / Hard Negatives**
- D-09: Hard negative types to include in safe class: bank/fraud alerts, package delivery notifications (USPS/FedEx/UPS real-pattern), 2FA/verification codes, medical/pharmacy alerts (appointments, prescription ready)
- D-10: Marketing and promotional messages excluded from safe class — keep safe class to transactional and functional messages only to avoid noisy labels
- D-11: Safe class hard negatives must be represented within the same topic domains as their corresponding scam vectors (e.g., legitimate bank notification vs bank impersonation scam, real delivery confirmation vs fake delivery fee scam)

**Synthetic Generation — Sample Distribution**
- D-12: Threat-weighted distribution — not equal across vectors:
  - Crypto/investment (pig butchering) and romance grooming: ~2.5× base allocation (hardest to detect, fastest growing)
  - Tech support, government impersonation, phishing, urgency-payment, remote access: base allocation
  - Lottery/prize/reward: ~1.5K (classic pattern, simpler signal — least training coverage needed)
  - Total target: 16,000–24,000 scam samples across all vectors
- D-13: Scam:safe ratio in training set: 50:50 (balanced classes, no class weighting required; supports the >0.9 precision requirement by not over-representing scam class)

### Claude's Discretion

- Local Ollama model selection (Llama 3.1 8B vs Mistral 7B) — pick whichever installs cleanly in the existing `.venv` / Ollama environment
- Exact per-vector sample counts within the threat-weighted bands (researcher determines final numbers based on quality filter yield)
- LLM self-consistency discard threshold (aggressiveness of the two-pass quality filter)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEXT-01 | Synthetic scam/safe training dataset covering all 8 scam vectors, with a locked real-world holdout built first, two-pass quality filter, 100-sample human review, and 80/10/10 stratified split | Covered by Standard Stack (google-genai SDK, datasets, scikit-learn), Architecture Patterns (holdout-first workflow, generation loop, quality filter pipeline), and Environment Availability section (critical gaps identified) |

</phase_requirements>

---

## Summary

Phase 1 builds the evaluation oracle and training dataset that all downstream phases depend on. The work splits into three sequential steps: (1) collect and lock the real-world holdout set before any synthetic generation, (2) run the two-model generation pipeline (Gemini 2.5 Flash + Ollama local model) to produce 16K–24K labeled samples across 8 scam vectors and a balanced safe class, (3) apply the two-pass quality filter and produce the final train/val/test JSONL files.

The research environment has evolved significantly from what STACK.md assumed as of April 2026. Several packages critical to later phases are at wrong versions (numpy 2.4.3 vs required <2.0, tensorflow 2.19.0 vs required 2.15/2.16, optimum 2.1.0 vs required 1.27.0). These are not blockers for Phase 1 because Phase 1 is data-only and does not require TFLite conversion or TFMOT. However, Phase 1 scripts should not pin or upgrade these packages, as any environment changes made in Phase 1 notebooks could break the versioning setup for later phases. The environment conflicts must be documented and resolved in Phase 2 before any model training begins.

For Phase 1 specifically, two installation gaps exist: `google-genai` is not installed (required for D-05 Gemini generation), and neither `llama3.1` nor `mistral` is available in the local Ollama instance (only `kimi-k2.5:cloud`, a remote model, is present). The plan must include installation steps for `google-genai` and a `ollama pull` step for the chosen local model.

**Primary recommendation:** Follow the holdout-first, then generate, then filter workflow exactly as specified in CONTEXT.md decisions. Install `google-genai` in the venv before any generation begins. For the Ollama local model (D-06 discretion), pull `llama3.1:8b` — it is better documented for structured generation tasks than Mistral 7B and more widely used in data generation pipelines as of 2025.

---

## Standard Stack

### Core (Phase 1 Specific)

| Library | Version in Venv | Purpose | Status |
|---------|----------------|---------|--------|
| `google-genai` | NOT INSTALLED | Gemini 2.5 Flash structured output generation | MUST INSTALL |
| `ollama` (CLI) | 0.17.0 | Local model inference for ~25% of synthetic data | Available; pull `llama3.1:8b` |
| `datasets` | 4.4.2 | HuggingFace dataset loading (phishing-dataset, difraud, sms_spam), stratified splits | Installed |
| `transformers` | 4.57.3 | Zero-shot teacher for LLM self-consistency quality filter | Installed |
| `scikit-learn` | 1.8.0 | Stratified train/val/test split | Installed |
| `pandas` | 2.3.3 | Dataset management and deduplication | Installed |
| `numpy` | 2.4.3 | Numerical ops for JS divergence computation | Installed (see environment warning) |
| `scipy` | 1.16.3 | `scipy.spatial.distance.jensenshannon` for D-08 divergence check | Installed |
| `matplotlib` | 3.10.8 | Distribution plots, per-vector sample counts | Installed |

### Installation Required

```bash
# Activate venv first
source .venv/bin/activate

# Install missing Phase 1 dependency
pip install "google-genai>=1.0.0"

# Pull local Ollama model for ~25% generation share (D-06 discretion: use llama3.1:8b)
ollama pull llama3.1:8b
```

### Real-World Data Sources

| Source | Location | Format | Use in Phase 1 |
|--------|----------|--------|----------------|
| FTC complaint data | https://www.ftc.gov/enforcement/data-visualizations | Manual download / CSV | Real-world holdout (scam samples) |
| r/scams (Reddit) | https://www.reddit.com/r/Scams/ | Manual curation | Real-world holdout (scam samples) |
| PhishTank | https://phishtank.org/developer_info.php | CSV download | Real-world holdout (phishing samples) |
| ealvaradob/phishing-dataset | `load_dataset("ealvaradob/phishing-dataset", "sms")` | HuggingFace | Supplemental holdout seed + real-anchor for generation |
| redasers/difraud | `load_dataset("redasers/difraud")` | HuggingFace | Supplemental real-anchor samples |
| ucirvine/sms_spam | `load_dataset("ucirvine/sms_spam")` | HuggingFace | Hard-negative source (legitimate urgent SMS) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `google-genai` SDK | OpenAI Python SDK + GPT-4o | OpenAI has no Gemini API key in this project; Gemini already established |
| `ollama` CLI + Python `requests` | `ollama` Python SDK | Python SDK adds an extra install; `requests` to localhost:11434 is simpler and more portable |
| `scipy.spatial.distance.jensenshannon` | Manual JS divergence implementation | scipy is already installed; no reason to hand-roll |
| Manual FTC CSV download | Programmatic FTC API | FTC data is not available via a clean public API; CSV download is the standard approach |

---

## Architecture Patterns

### Recommended Project Structure

```
research/
├── notebooks/
│   └── phase1_data_foundation.ipynb   # Main notebook for Phase 1
├── scripts/
│   └── (existing scripts — do not modify)
└── data/                              # gitignored
    ├── holdout_realworld.jsonl        # Locked before any generation
    ├── synthetic_scam_v1.jsonl        # Train + val splits (post-filter)
    └── test_split.jsonl               # Synthetic test split (post-filter)
```

### Pattern 1: Holdout-First Workflow (Hard Gate)

**What:** Collect and lock the real-world holdout before running any generation. The holdout file is written to disk and not touched after this step.

**When to use:** Always — this is the most critical sequencing rule of the entire milestone (Pitfall 1.1).

**Example:**
```python
# Source: PITFALLS.md §1.1, CONTEXT.md D-01/D-02/D-04
import json
from pathlib import Path

HOLDOUT_PATH = Path("research/data/holdout_realworld.jsonl")

def lock_holdout(samples: list[dict]) -> None:
    """Write holdout to disk. Call this exactly once, before any generation."""
    assert not HOLDOUT_PATH.exists(), "Holdout already locked — do not overwrite"
    assert len(samples) >= 200, f"Holdout too small: {len(samples)} samples"
    with open(HOLDOUT_PATH, "w") as f:
        for s in samples:
            f.write(json.dumps(s) + "\n")
    print(f"Holdout locked: {len(samples)} samples at {HOLDOUT_PATH}")
```

### Pattern 2: Gemini Structured Output Generation

**What:** Use `google-genai` SDK with `response_json_schema` to enforce structured output per sample. Generate one sample per API call for simplicity; batch with a loop.

**When to use:** For the ~75% Gemini share of synthetic generation.

**Example:**
```python
# Source: STACK.md §1, google-genai official docs
from google import genai
from google.genai import types
from pydantic import BaseModel
import os

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

class ScamSample(BaseModel):
    text: str
    label: str    # "scam" or "safe"
    vector: str   # e.g., "crypto", "romance_grooming", "tech_support"
    channel: str  # "sms", "email", "whatsapp", "app_notification"

def generate_sample(prompt: str) -> ScamSample:
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_json_schema=ScamSample.model_json_schema(),
        ),
    )
    import json
    return ScamSample(**json.loads(response.text))
```

### Pattern 3: Ollama Local Generation via HTTP

**What:** Send generation requests to Ollama's local HTTP endpoint for the ~25% local-model share. Avoids installing the `ollama` Python SDK.

**When to use:** For the ~25% local model share after `ollama pull llama3.1:8b`.

**Example:**
```python
# Source: Ollama REST API docs (localhost:11434)
import requests
import json

def generate_local(prompt: str, model: str = "llama3.1:8b") -> str:
    response = requests.post(
        "http://localhost:11434/api/generate",
        json={
            "model": model,
            "prompt": prompt,
            "stream": False,
            "format": "json",  # Request JSON output
        },
        timeout=120,  # CPU inference is slow — allow 2 minutes per sample
    )
    response.raise_for_status()
    return response.json()["response"]
```

### Pattern 4: Two-Pass Quality Filter

**What:** (1) Zero-shot LLM self-consistency check via a HuggingFace zero-shot-classification pipeline; (2) rule-based post-filter removing duplicates and sub-15-token samples.

**When to use:** After all generation is complete, before train/val/test split.

**Example:**
```python
# Source: REQUIREMENTS.md §TEXT-01, CONTEXT.md D-01 quality filter spec
from transformers import pipeline
import pandas as pd

def apply_quality_filter(
    samples: list[dict],
    consistency_threshold: float = 0.6,  # Claude's discretion per CONTEXT.md
) -> list[dict]:
    # Pass 1: LLM self-consistency check
    classifier = pipeline(
        "zero-shot-classification",
        model="facebook/bart-large-mnli",  # Zero-shot teacher
        device=-1,  # CPU
    )
    candidate_labels = ["scam", "safe"]
    filtered = []
    for s in samples:
        result = classifier(s["text"], candidate_labels)
        predicted_label = result["labels"][0]
        confidence = result["scores"][0]
        if predicted_label == s["label"] and confidence >= consistency_threshold:
            filtered.append(s)

    # Pass 2: Rule-based post-filter
    df = pd.DataFrame(filtered)
    df = df.drop_duplicates(subset=["text"])
    df = df[df["text"].str.split().str.len() >= 15]  # Min 15 tokens (approx)
    return df.to_dict("records")
```

### Pattern 5: Jensen-Shannon Divergence Check (D-08)

**What:** Compute token-unigram JS divergence across vectors after generation. Gate for mode collapse detection.

**When to use:** After generation and before quality filter, as a mandatory pre-training gate.

**Example:**
```python
# Source: CONTEXT.md D-08, scipy.spatial.distance
from scipy.spatial.distance import jensenshannon
from collections import Counter
import numpy as np

def compute_js_divergence_matrix(samples: list[dict]) -> dict:
    """Returns JS divergence between all vector pairs. Low values = mode collapse risk."""
    vectors = list(set(s["vector"] for s in samples if s["label"] == "scam"))
    vocab = set()
    vector_tokens = {}
    for v in vectors:
        texts = [s["text"] for s in samples if s["vector"] == v]
        tokens = " ".join(texts).lower().split()
        vector_tokens[v] = Counter(tokens)
        vocab.update(tokens)

    vocab = sorted(vocab)
    matrix = {}
    for v1 in vectors:
        for v2 in vectors:
            if v1 >= v2:
                continue
            p = np.array([vector_tokens[v1].get(w, 0) for w in vocab], dtype=float)
            q = np.array([vector_tokens[v2].get(w, 0) for w in vocab], dtype=float)
            p /= p.sum() + 1e-10
            q /= q.sum() + 1e-10
            matrix[f"{v1}_vs_{v2}"] = float(jensenshannon(p, q))
    return matrix

# Interpretation: JSD < 0.05 between two scam vectors is a mode collapse warning
```

### Pattern 6: Stratified Train/Val/Test Split

**What:** 80/10/10 split stratified by `vector` field using scikit-learn.

**When to use:** After quality filter passes, as the final step before writing output files.

**Example:**
```python
# Source: REQUIREMENTS.md §TEXT-01, scikit-learn docs
from sklearn.model_selection import train_test_split
import json
from pathlib import Path

def write_splits(samples: list[dict]) -> None:
    labels = [s["vector"] for s in samples]  # Stratify by vector
    train_val, test = train_test_split(samples, test_size=0.10, stratify=labels, random_state=42)
    labels_tv = [s["vector"] for s in train_val]
    train, val = train_test_split(train_val, test_size=0.111, stratify=labels_tv, random_state=42)
    # test_size=0.111 of 90% ≈ 10% of total

    for split_name, split_data, path in [
        ("train+val", train + val, Path("research/data/synthetic_scam_v1.jsonl")),
        ("test", test, Path("research/data/test_split.jsonl")),
    ]:
        with open(path, "w") as f:
            for s in split_data:
                f.write(json.dumps(s) + "\n")
        print(f"{split_name}: {len(split_data)} samples → {path}")
```

### Anti-Patterns to Avoid

- **Generating holdout synthetically:** The holdout must come from real-world public sources (FTC, r/scams, PhishTank). Synthetically-generated holdout samples make evaluation meaningless (Pitfall 1.1).
- **Marketing/promotional messages in the safe class:** D-10 explicitly excludes these. They introduce noisy labels because some promotional messages use scam-adjacent language. Safe class is transactional and functional messages only.
- **Using the Ollama `kimi-k2.5:cloud` model for local generation:** This model is a remote API model despite being in `ollama list` — it routes traffic to `ollama.com:443`. It is not local CPU inference and introduces a privacy concern. Pull `llama3.1:8b` instead.
- **Running quality filter before JS divergence check:** The divergence check must run on raw generated data. If mode collapse is detected, you revise the generation strategy — which means the filtered dataset would need to be regenerated. Run divergence check first.
- **Committing dataset files to git:** `research/data/` is gitignored per `research/data/README.md`. Never add `.jsonl` files to git.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LLM self-consistency scoring | Custom prompt-based scorer | `transformers` zero-shot-classification pipeline with `facebook/bart-large-mnli` | bart-large-mnli is a well-calibrated zero-shot model; custom prompting is brittle and unreproducible |
| Stratified splitting | Manual shuffle + slice | `sklearn.model_selection.train_test_split(stratify=...)` | Handles minority-class edge cases; reproducible with `random_state` |
| Token-level JS divergence | Manual probability computation | `scipy.spatial.distance.jensenshannon` | scipy is already installed; manual implementation risks numerical errors in probability normalization |
| Duplicate detection | String equality check | `pandas.DataFrame.drop_duplicates(subset=["text"])` | Handles Unicode normalization edge cases; one line |
| JSON output enforcement | Prompt-based "respond in JSON" | `response_json_schema` in `google-genai` SDK | Server-side schema enforcement eliminates JSON parse failures in long generation loops |

**Key insight:** Phase 1 is data engineering, not ML engineering. The tooling that exists (datasets, pandas, scikit-learn, scipy) handles every non-generation task cleanly. Custom implementations add bugs and slow down iteration.

---

## Common Pitfalls

### Pitfall 1.1: Evaluation Set Contamination (Critical)

**What goes wrong:** Train and test splits both come from the same LLM generation run. Model achieves 95%+ accuracy on the synthetic test split but fails in production because it learned the LLM's stylistic patterns, not real scam intent.

**Why it happens:** This is the failure mode of the current broken MobileBERT model (overfitting to SMS spam corpus). Reproducing it with a new generation pipeline would repeat the same mistake.

**How to avoid:** Collect and lock `holdout_realworld.jsonl` BEFORE any generation cell runs. Never include holdout samples in training or synthetic validation.

**Warning signs:** Model F1 on synthetic test set is >5 points higher than on real-world holdout. This gap indicates distribution mismatch.

---

### Pitfall 1.2: Stylistic Mode Collapse (Critical)

**What goes wrong:** All generated scam examples across 8 vectors share the same rhetorical structure (urgency + authority + link). Model learns the template, not vector-specific patterns. Fails on slow-burn romance scams and investment grooming where urgency appears late or not at all.

**Why it happens:** A single LLM trained on safety-filtered data defaults to the most recognizable scam pattern. The two-LLM strategy (D-05) directly addresses this.

**How to avoid:** (1) Use Gemini + Llama3.1:8b mix. (2) Vary prompts structurally: channel, register, formality per D-07. (3) Run the JS divergence check (D-08) — JSD < 0.05 between any two scam vectors is a hard stop.

**Warning signs:** During 100-sample human review (success criterion 4), crypto scam examples all contain "wallet" + "guaranteed returns" in every sample.

---

### Pitfall 1.3: Prompt Leakage into Decision Boundary (Moderate)

**What goes wrong:** All crypto scam examples mention "Bitcoin wallet"; no legitimate examples do. Classifier learns "Bitcoin wallet" → scam rather than financial manipulation intent → scam. Flags any legitimate crypto exchange notification as a scam.

**Why it happens:** Generation prompts name the vector explicitly ("generate a crypto scam"). LLM anchors on the most salient surface terms.

**How to avoid:** For each scam vector, generate paired safe examples in the same topic domain (D-11). Check: for each scam vector, count how many legitimate examples share the same domain-specific vocabulary.

**Warning signs:** A legitimate Coinbase "Your deposit arrived" notification triggers the classifier with high confidence.

---

### Pitfall 1.4: Safety Filtering Removes Realistic Examples (Moderate)

**What goes wrong:** Gemini's safety filters soften or refuse the most realistic scam scripts. Romance grooming prompts and government impersonation with coercive language are particularly likely to be filtered. The resulting dataset skews toward obviously-fake scam text.

**Why it happens:** Production LLM APIs have conservative content policies. Realistic scam scripts can read as harmful content to safety classifiers.

**How to avoid:** Use indirect prompting ("Write an example of a message that a scam awareness educator might use to train people to recognize..."). Route romance grooming and high-coercion government impersonation categories to the Ollama local model (no safety filters). After generation, manually review 20 samples per vector for realism during the 100-sample human review gate.

**Warning signs:** All romance grooming examples are only 1-2 sentences long and contain explicit financial requests immediately. Real romance scams groom over multiple messages and delay the financial ask.

---

### Pitfall 1.5: kimi-k2.5:cloud is Not a Local Model

**What goes wrong:** The only model currently in `ollama list` is `kimi-k2.5:cloud`. Its size is `—` (dash) and its `ollama show` output says `Remote model` with `Remote URL: https://ollama.com:443`. Using this model for the "local CPU inference" ~25% generation share routes data through Moonshot AI's servers, violating the privacy rationale for using a local model.

**Why it happens:** This is a discovery from environment audit — the model was installed for a different purpose.

**How to avoid:** Run `ollama pull llama3.1:8b` before any generation. Verify the model appears with a non-zero SIZE in `ollama list` before use.

**Warning signs:** `ollama list` shows `kimi-k2.5:cloud` with empty SIZE column after attempting to use it.

---

## Environment Availability

### Phase 1 Dependencies

| Dependency | Required By | Available | Version | Status |
|------------|------------|-----------|---------|--------|
| Python 3.12 | All scripts | Yes | 3.12.x | Available in `.venv` |
| `google-genai` SDK | D-05 Gemini generation | **No** | — | **MUST INSTALL: `pip install "google-genai>=1.0.0"`** |
| Ollama CLI | D-05 local model generation | Yes | 0.17.0 | Available at `/opt/homebrew/bin/ollama` |
| `llama3.1:8b` model | D-06 local model (25% share) | **No** | — | **MUST PULL: `ollama pull llama3.1:8b`** |
| `datasets` | HuggingFace data loading | Yes | 4.4.2 | Available |
| `transformers` | Zero-shot quality filter | Yes | 4.57.3 | Available |
| `scikit-learn` | Stratified split | Yes | 1.8.0 | Available |
| `pandas` | Deduplication, dataset ops | Yes | 2.3.3 | Available |
| `scipy` | JS divergence (D-08) | Yes | 1.16.3 | Available |
| `matplotlib` | Distribution visualization | Yes | 3.10.8 | Available |
| Internet access | FTC/PhishTank/Reddit collection | Yes | — | Required for holdout collection |
| Gemini API key | D-05 Gemini generation | Must be set | — | Set `GEMINI_API_KEY` env var |

**Missing dependencies blocking Phase 1 execution:**
- `google-genai`: Not installed. All Gemini generation (75% of synthetic data) is blocked until installed.
- `llama3.1:8b` in Ollama: Not pulled. Local model generation share (25%) is blocked. `kimi-k2.5:cloud` must NOT be used as a substitute (it is a remote model).

**Missing dependencies with no fallback:**
- Gemini API key: Must be present as env var before generation begins. No alternative — project uses Gemini by decision D-05.

### Environment Conflicts (Do Not Resolve in Phase 1)

These conflicts affect Phases 2–6 but are not blockers for Phase 1 (data generation does not use TFLite conversion or TFMOT):

| Package | Installed | Required by STATE.md | Impact | When to Fix |
|---------|-----------|---------------------|--------|------------|
| `numpy` | 2.4.3 | `<2.0` | Breaks TF 2.15/onnxruntime | Phase 2 setup |
| `tensorflow` | 2.19.0 | `2.15.x` or `2.16.x` | Keras 3.x breaks TFMOT QAT | Phase 2 setup |
| `optimum` | 2.1.0 | `==1.27.0` | TFLite export removed in 2.0 | Phase 2 setup |
| `tensorflow-model-optimization` | Not installed | Required for QAT (TEXT-05) | Blocks Phase 6 | Phase 2 setup |
| `evaluate` library | Not installed | Required for F1 metrics | Minor — use sklearn.metrics | Phase 2 setup |
| `seaborn` | Not installed | Mentioned in STACK.md | Non-critical (matplotlib available) | Optional |

**Important note on environment resolution:** The environment has `ai_edge_litert 2.1.2`, `ai_edge_quantizer 0.4.2`, and `litert-torch 0.8.0` — Google's new AI Edge stack that supersedes the TFMOT + classic TFLite converter approach. Whether Phase 2 should use this newer stack or downgrade to the STACK.md-specified stack is a decision for Phase 2 research to resolve. Do not attempt to resolve it in Phase 1 notebooks.

---

## Code Examples

Verified patterns from official sources:

### Loading HuggingFace Seed Datasets

```python
# Source: HuggingFace datasets docs, FEATURES.md §Dataset Sources
from datasets import load_dataset

# Primary phishing/SMS dataset
phishing = load_dataset("ealvaradob/phishing-dataset", "sms")
# Fields: text, label (0=ham, 1=spam/smishing)

# Multi-domain fraud text (supplemental)
difraud = load_dataset("redasers/difraud")

# Legacy SMS spam (for hard-negative sourcing)
sms_spam = load_dataset("ucirvine/sms_spam")
```

### Gemini API Key Setup

```python
# Source: google-genai official docs
import os
from google import genai

# Set before any generation
# export GEMINI_API_KEY="your-key-here"
client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
```

### JSONL Output Schema (Standard Sample Format)

```python
# Source: CONTEXT.md §code_context, REQUIREMENTS.md §TEXT-01
# Every sample written to disk uses this schema
sample = {
    "text": "Your account has been compromised...",
    "label": "scam",           # "scam" or "safe"
    "vector": "government_impersonation",  # One of 8 vectors or "safe"
    "channel": "sms",          # "sms", "email", "whatsapp", "app_notification"
    "source": "gemini-2.5-flash",  # "gemini-2.5-flash" or "llama3.1:8b"
    "split": "train",          # "train", "val", "test" (added after split step)
}
```

### Checking Ollama Service

```python
# Verify Ollama is running before attempting local generation
import requests

def check_ollama() -> bool:
    try:
        r = requests.get("http://localhost:11434/api/tags", timeout=5)
        models = [m["name"] for m in r.json().get("models", [])]
        print(f"Ollama models available: {models}")
        return "llama3.1:8b" in models
    except Exception as e:
        print(f"Ollama not reachable: {e}")
        return False
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `google-generativeai` SDK | `google-genai` SDK (unified) | Mid-2024 | Old package is deprecated; must use `google-genai` |
| `optimum` TFLite export | `optimum==1.27.0` (pinned) or `ai_edge_*` stack | Oct 2025 (optimum 2.0) | TFLite support removed from latest optimum; pin to 1.27.0 for classic path OR use new ai_edge stack |
| TFLite Python runtime (`import tflite_runtime`) | `ai_edge_litert` (2.1.2 installed) | 2024–2025 | Google renamed TFLite runtime to LiteRT; `ai_edge_litert` is the current package name |
| `tensorflow-model-optimization` (TFMOT) for QAT | `ai_edge_quantizer` (0.4.2 installed) | 2024–2025 | Google's new quantizer stack replaces classic TFMOT for newer workflows |

**Deprecated/outdated:**
- `google-generativeai` Python package: Deprecated. Use `google-genai` instead. Both names exist on PyPI but only the new one is maintained.
- `optimum>=2.0` for TFLite export: TFLite export removed. `optimum-cli export tflite` does not exist in 2.x.

---

## Open Questions

1. **AI Edge stack vs classic TFMOT/optimum stack**
   - What we know: The venv has `ai_edge_litert 2.1.2`, `ai_edge_quantizer 0.4.2`, `litert-torch 0.8.0` — Google's current recommended quantization pipeline. It also has `tensorflow 2.19.0` and `onnx2tf 2.3.9`. The classic stack (TFMOT + optimum==1.27.0) documented in STACK.md and STATE.md is absent.
   - What's unclear: Whether `ai_edge_quantizer` can replace TFMOT QAT for BERT-family models, and whether the exported format is compatible with `react-native-fast-tflite` (which expects `.tflite` format).
   - Recommendation: Do not resolve in Phase 1. Phase 2 research must evaluate both paths with the actual model files and verify `react-native-fast-tflite` compatibility.

2. **LLM self-consistency discard threshold**
   - What we know: The threshold for zero-shot self-consistency check is listed as Claude's discretion in CONTEXT.md. Too aggressive (>0.8) may discard realistic samples that the zero-shot model scores ambiguously. Too lenient (<0.5) passes label-inconsistent samples through.
   - What's unclear: Optimal threshold depends on the specific zero-shot model used and the domain.
   - Recommendation: Start at 0.6 (moderate), log discard statistics per vector, and adjust if any vector loses >40% of samples to the filter.

3. **FTC complaint data format and accessibility**
   - What we know: CONTEXT.md D-01 specifies FTC complaint data as one of three holdout sources. FTC publishes consumer fraud reports but the raw text of complaints is not publicly downloadable in a structured format — the available data is aggregate statistics.
   - What's unclear: Whether FTC provides individual complaint text or only statistical summaries.
   - Recommendation: Use FTC's Consumer Sentinel Network data portal (https://www.ftc.gov/enforcement/consumer-sentinel-network) — it provides downloadable datasets. If complaint text is unavailable, use FTC's "Top Text Scams" spotlight reports which contain verbatim example messages.

---

## Project Constraints (from CLAUDE.md)

The following directives from the project `CLAUDE.md` apply to Phase 1 planning:

- **Do not use cloud API (scamAnalyzer.ts / Gemini) as the default analysis path** — this applies to the app, not the research pipeline. Gemini is valid for dataset generation in `research/`.
- **Do not add files to `canaryapp/assets/models/` without removing old versions** — not relevant to Phase 1 (no model files produced).
- **Do not check large model files (.tflite, .onnx) into git outside of `canaryapp/assets/models/`** — not relevant to Phase 1. Dataset files go to `research/data/` which is gitignored.
- **NEVER commit secrets, credentials, or .env files** — `GEMINI_API_KEY` must be set as an environment variable, never hardcoded in notebooks or scripts.
- **Data outputs go to `research/data/` (gitignored)** — all JSONL output files go here, never to `research/notebooks/` or project root.
- **ALWAYS read a file before editing it** — before modifying `research/notebooks/improved_scam_classifier.ipynb`, read it for reusable cells.

---

## Validation Architecture

No `config.json` exists in `.planning/` — treating `nyquist_validation` as enabled (default).

Phase 1 is a data pipeline with no model training. Automated tests are limited to structural assertions; human review (100 samples) is the primary quality gate.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest (standard) |
| Config file | None — create `research/tests/` in Wave 0 if automated assertions are desired |
| Quick run command | `python -c "import json; assert sum(1 for _ in open('research/data/holdout_realworld.jsonl')) >= 200"` |
| Full suite command | Manual 100-sample review per success criterion 4 |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEXT-01 | Holdout locked before generation | Structural assertion | `python -c "from pathlib import Path; assert Path('research/data/holdout_realworld.jsonl').exists()"` | Wave 0 (no file yet) |
| TEXT-01 | Holdout >= 200 samples | Structural assertion | `python -c "assert sum(1 for _ in open('research/data/holdout_realworld.jsonl')) >= 200"` | Wave 0 |
| TEXT-01 | Synthetic dataset >= 16K samples | Count assertion | `python -c "assert sum(1 for _ in open('research/data/synthetic_scam_v1.jsonl')) >= 16000"` | Wave 0 |
| TEXT-01 | All 8 vectors present in dataset | Label coverage check | In-notebook assertion on `df["vector"].value_counts()` | Wave 0 |
| TEXT-01 | 20–30% hard negatives in safe class | Class composition check | In-notebook assertion on safe class breakdown | Wave 0 |
| TEXT-01 | No duplicates in final dataset | Deduplication check | `pandas drop_duplicates` count assertion | Wave 0 |
| TEXT-01 | 80/10/10 split ratio | Split size assertion | In-notebook assertion on split counts | Wave 0 |
| TEXT-01 | 100-sample human review | Manual gate | Human review log documented in notebook | Manual only |
| TEXT-01 | JS divergence check passes | Divergence matrix | In-notebook: `all(v > 0.05 for v in matrix.values())` | Wave 0 |

### Sampling Rate

- **Per task commit:** Run structural assertions (holdout size, file existence, sample counts)
- **Per wave merge:** Run full label coverage and split ratio checks
- **Phase gate:** 100-sample human review completed and documented; all structural assertions green; JS divergence check passes before marking Phase 1 complete

### Wave 0 Gaps

- [ ] `research/notebooks/phase1_data_foundation.ipynb` — main notebook; read `improved_scam_classifier.ipynb` first for reusable data loading cells
- [ ] Inline assertion cells throughout notebook (not a separate test file — notebook-native assertions are appropriate for research pipeline)
- [ ] `google-genai>=1.0.0` installed and `GEMINI_API_KEY` set
- [ ] `ollama pull llama3.1:8b` completed and verified via `ollama list`

---

## Sources

### Primary (HIGH confidence)

- CONTEXT.md (01-CONTEXT.md) — Locked decisions D-01 through D-13, canonical references
- REQUIREMENTS.md §TEXT-01 — Full acceptance criteria
- FEATURES.md — Scam vector taxonomy, dataset sources, build-order dependencies
- PITFALLS.md §1.1–1.4 — Evaluation contamination, mode collapse, prompt leakage, safety filtering
- STACK.md §1 — Gemini `google-genai` SDK generation pattern with `ScamSample` Pydantic schema
- Direct venv introspection — All package versions verified from dist-info metadata files
- `ollama list` + `ollama show kimi-k2.5:cloud` — Confirmed kimi is a remote model, not local

### Secondary (MEDIUM confidence)

- `research/data/README.md` — Confirmed gitignore convention for dataset files
- STATE.md §Accumulated Context — Version constraints (numpy <2.0, optimum==1.27.0, tf 2.15/2.16)
- Ollama REST API docs — HTTP endpoint format for local generation (`localhost:11434/api/generate`)

### Tertiary (LOW confidence)

- FTC Consumer Sentinel Network data portal — holdout collection feasibility (not yet verified whether complaint text is available in downloadable format)

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all versions verified from venv dist-info metadata
- Architecture patterns: HIGH — patterns derived directly from locked decisions in CONTEXT.md and REQUIREMENTS.md TEXT-01 spec
- Environment availability: HIGH — direct venv introspection; Ollama binary confirmed at `/opt/homebrew/bin/ollama`
- Common pitfalls: HIGH — sourced from PITFALLS.md which cites primary research sources
- FTC data format: LOW — requires access verification before holdout collection step

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable domain — package versions may shift but generation patterns are stable)
