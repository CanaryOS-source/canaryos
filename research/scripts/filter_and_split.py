"""
Filter and split the synthetic dataset through a 6-stage quality pipeline.

Stages:
  0. Pre-checks (file existence, BART model download)
  1. BART accuracy baseline on holdout (falls back to keyword consistency
     if BART accuracy < 0.70 on holdout)
  2. JS Divergence gate (D-08)
  3. Self-consistency check (two-pass filter, pass 1) -- BART if baseline
     passed, keyword-based vector consistency as fallback
  4. Rule-based post-filter (two-pass filter, pass 2)
  5. Stratified split (80/10/10 train/val/test)
  6. Summary report

Input:  research/data/synthetic_raw.jsonl
Output: research/data/synthetic_scam_v1.jsonl (train+val)
        research/data/test_split.jsonl (test)
        research/data/jsd_matrix.json

Usage:
  python research/scripts/filter_and_split.py
"""

import glob
import json
import os
import random
import re
import shutil
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

# Work around broken TensorFlow Metal plugin on macOS (does not affect PyTorch)
_METAL_PLUGIN = glob.glob(
    os.path.join(sys.prefix, "lib", "python*", "site-packages",
                 "tensorflow-plugins", "libmetal_plugin.dylib")
)
for _p in _METAL_PLUGIN:
    _bak = _p + ".bak"
    if os.path.exists(_p) and not os.path.exists(_bak):
        os.rename(_p, _bak)

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

import numpy as np
import pandas as pd
from scipy.spatial.distance import jensenshannon

# --- Paths ---------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
RAW_PATH = PROJECT_ROOT / "research" / "data" / "synthetic_raw.jsonl"
HOLDOUT_PATH = PROJECT_ROOT / "research" / "data" / "holdout_realworld.jsonl"
OUTPUT_TRAINVAL = PROJECT_ROOT / "research" / "data" / "synthetic_scam_v1.jsonl"
OUTPUT_TEST = PROJECT_ROOT / "research" / "data" / "test_split.jsonl"
JSD_OUTPUT = PROJECT_ROOT / "research" / "data" / "jsd_matrix.json"

# --- Constants ------------------------------------------------------------
REQUIRED_VECTORS = [
    "crypto_investment",
    "government_impersonation",
    "lottery_reward",
    "phishing",
    "remote_access",
    "romance_grooming",
    "tech_support",
    "urgency_payment",
]
JSD_THRESHOLD = 0.05
MIN_TOKENS = 15
BART_MIN_ACCURACY = 0.70
BART_GOOD_ACCURACY = 0.85
DEFAULT_CONSISTENCY_THRESHOLD = 0.6
MODERATE_CONSISTENCY_THRESHOLD = 0.5
ADAPTIVE_DISCARD_RATE = 0.40
HOLDOUT_SAMPLE_SIZE = 100
RANDOM_SEED = 42

# Keyword lists for vector consistency check (fallback when BART fails).
# Each vector has terms that should appear in at least one keyword for the
# text to be consistent with its label.  Safe samples always pass (hard
# negatives intentionally mimic scam vocabulary).
VECTOR_KEYWORDS = {
    "crypto_investment": [
        "crypto", "bitcoin", "btc", "eth", "ethereum", "token", "blockchain",
        "invest", "yield", "roi", "defi", "trading", "wallet", "exchange",
        "mining", "nft", "coin", "profit", "return", "stake", "airdrop",
        "usdt", "binance", "coinbase", "guaranteed", "portfolio", "deposit",
    ],
    "romance_grooming": [
        "love", "darling", "dear", "sweetheart", "beautiful", "handsome",
        "lonely", "heart", "relationship", "romance", "widow", "military",
        "deployed", "marry", "feelings", "connection", "caring", "miss you",
        "attractive", "soul", "companion", "dating", "profile",
    ],
    "tech_support": [
        "virus", "malware", "infected", "computer", "windows", "microsoft",
        "apple", "antivirus", "security", "firewall", "trojan", "hacked",
        "breach", "license", "expired", "renew", "subscription", "norton",
        "mcafee", "tech support", "error", "warning", "alert", "system",
        "software", "router",
    ],
    "government_impersonation": [
        "irs", "tax", "social security", "ssn", "warrant", "arrest",
        "federal", "government", "department", "agent", "officer", "law",
        "enforcement", "fine", "penalty", "legal", "court", "subpoena",
        "immigration", "visa", "customs", "compliance", "authority",
        "investigation", "suspend", "revoke",
    ],
    "lottery_reward": [
        "lottery", "winner", "prize", "reward", "congratulations", "won",
        "lucky", "draw", "jackpot", "claim", "sweepstake", "raffle",
        "selected", "million", "cash", "gift", "free", "award",
    ],
    "urgency_payment": [
        "urgent", "overdue", "payment", "invoice", "bill", "wire",
        "transfer", "deadline", "immediate", "penalty", "late", "suspend",
        "cancel", "electricity", "utility", "account", "balance", "owe",
        "past due", "final notice", "disconnection",
    ],
    "phishing": [
        "click", "link", "verify", "password", "account", "login",
        "confirm", "update", "suspend", "security", "unauthorized",
        "access", "credential", "expire", "unlock", "reset", "log in",
        "http", "www", "txt", "reply", "subscribe",
    ],
    "remote_access": [
        "remote", "teamviewer", "anydesk", "screen", "control", "access",
        "desktop", "install", "download", "connect", "session", "fix",
        "technician", "support", "share", "software", "tool",
    ],
}

# Minimum keyword matches for a scam sample to be considered consistent
KEYWORD_MIN_MATCHES = 2


def load_jsonl(path: Path) -> list[dict]:
    """Load a JSONL file, returning list of dicts."""
    samples = []
    with open(path, "r", encoding="utf-8") as fh:
        for i, line in enumerate(fh, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                samples.append(json.loads(line))
            except json.JSONDecodeError as exc:
                print(f"ERROR: {path} line {i}: invalid JSON -- {exc}")
                sys.exit(1)
    return samples


def write_jsonl(path: Path, samples: list[dict]) -> None:
    """Write list of dicts to JSONL."""
    with open(path, "w", encoding="utf-8") as fh:
        for s in samples:
            fh.write(json.dumps(s, ensure_ascii=False) + "\n")


def stage_header(num: int, name: str) -> None:
    print()
    print("=" * 70)
    print(f"  STAGE {num}: {name}")
    print("=" * 70)
    print()


# =====================================================================
# Stage 0: Pre-checks
# =====================================================================

def stage_0_prechecks():
    stage_header(0, "Pre-checks")

    if not RAW_PATH.exists():
        print("ERROR: synthetic_raw.jsonl not found -- Plan 02 must complete first")
        print(f"  Expected at: {RAW_PATH}")
        sys.exit(1)
    print(f"  [OK] synthetic_raw.jsonl found ({RAW_PATH})")

    if not HOLDOUT_PATH.exists():
        print("ERROR: holdout_realworld.jsonl not found -- needed for BART baseline")
        print(f"  Expected at: {HOLDOUT_PATH}")
        sys.exit(1)
    print(f"  [OK] holdout_realworld.jsonl found ({HOLDOUT_PATH})")

    # Check disk space
    disk_usage = shutil.disk_usage(PROJECT_ROOT)
    free_gb = disk_usage.free / (1024 ** 3)
    print(f"  Disk space available: {free_gb:.1f} GB")
    if free_gb < 3.0:
        print(
            "ERROR: Less than 3GB free disk space. "
            "bart-large-mnli requires ~1.6GB for download."
        )
        sys.exit(1)

    # Pre-download BART model
    print("  Downloading/verifying bart-large-mnli model...")
    try:
        from transformers import (
            AutoModelForSequenceClassification,
            AutoTokenizer,
        )
        AutoTokenizer.from_pretrained("facebook/bart-large-mnli")
        AutoModelForSequenceClassification.from_pretrained(
            "facebook/bart-large-mnli"
        )
        print("  [OK] bart-large-mnli model ready")
    except Exception as exc:
        print(
            f"WARNING: Failed to download bart-large-mnli: {exc}\n"
            "  Will attempt baseline evaluation with existing cache."
        )


# =====================================================================
# Stage 1: BART Accuracy Baseline on Holdout
# =====================================================================

def stage_1_bart_baseline() -> tuple[str, float]:
    """Validate BART accuracy on holdout before using as filter.

    Returns (filter_mode, bart_accuracy):
      filter_mode: "bart" if BART passes baseline, "keyword" if fallback
      bart_accuracy: BART's measured accuracy on holdout
    """
    stage_header(1, "BART Accuracy Baseline on Holdout")

    from transformers import pipeline

    holdout = load_jsonl(HOLDOUT_PATH)
    print(f"  Holdout samples loaded: {len(holdout)}")

    random.seed(RANDOM_SEED)
    if len(holdout) > HOLDOUT_SAMPLE_SIZE:
        holdout_sample = random.sample(holdout, HOLDOUT_SAMPLE_SIZE)
    else:
        holdout_sample = holdout

    n_eval = len(holdout_sample)
    print(f"  Evaluating BART on {n_eval} holdout samples...")

    classifier = pipeline(
        "zero-shot-classification",
        model="facebook/bart-large-mnli",
        device=-1,
    )

    correct = 0
    for i, sample in enumerate(holdout_sample):
        true_label = sample["label"]
        text = sample["text"]
        result = classifier(text, candidate_labels=["scam", "safe"])
        predicted = result["labels"][0]
        if predicted == true_label:
            correct += 1
        if (i + 1) % 20 == 0:
            print(f"    [{i+1}/{n_eval}] accuracy so far: {correct/(i+1):.2%}")

    accuracy = correct / n_eval
    print()
    print(f"  BART baseline accuracy on holdout: {accuracy:.2%} ({correct}/{n_eval})")

    if accuracy < BART_MIN_ACCURACY:
        print(
            f"\n  BART accuracy on holdout is {accuracy:.2%} -- below {BART_MIN_ACCURACY:.0%}"
            " minimum threshold."
        )
        print(
            "  bart-large-mnli's NLI zero-shot framing cannot distinguish 'scam'"
            " from 'safe' at useful accuracy for this domain."
        )
        print(
            "  FALLBACK: Switching to keyword-based vector consistency check."
            " This verifies that scam-labeled samples contain vocabulary"
            " consistent with their assigned vector. Safe samples pass"
            " unconditionally (hard negatives intentionally mimic scam"
            " patterns)."
        )
        return "keyword", accuracy

    if accuracy < BART_GOOD_ACCURACY:
        print(
            f"\n  WARNING: BART accuracy is {accuracy:.2%} -- moderate. "
            "Self-consistency filter may be noisy. "
            f"Using lowered threshold {MODERATE_CONSISTENCY_THRESHOLD}."
        )
    else:
        print(
            f"\n  BART accuracy is {accuracy:.2%} -- good. "
            f"Proceeding with default threshold {DEFAULT_CONSISTENCY_THRESHOLD}."
        )

    return "bart", accuracy


# =====================================================================
# Stage 2: JS Divergence Gate (D-08)
# =====================================================================

def stage_2_jsd_gate(raw_samples: list[dict]) -> None:
    stage_header(2, "JS Divergence Gate (D-08)")

    freq_maps = {}
    for vec in REQUIRED_VECTORS:
        texts = [
            s["text"]
            for s in raw_samples
            if s.get("vector") == vec and s.get("label") == "scam"
        ]
        if not texts:
            print(f"  WARNING: No scam samples for vector '{vec}' -- skipping")
            continue
        token_counts = Counter()
        for text in texts:
            token_counts.update(text.lower().split())
        freq_maps[vec] = token_counts
        print(f"  {vec}: {len(texts)} scam samples, {len(token_counts)} unique tokens")

    available = sorted(freq_maps.keys())

    vocab = set()
    for counts in freq_maps.values():
        vocab.update(counts.keys())
    vocab = sorted(vocab)
    print(f"\n  Shared vocabulary size: {len(vocab)}")

    dists = {}
    for vec in available:
        total = sum(freq_maps[vec].values())
        dists[vec] = np.array([freq_maps[vec].get(t, 0) / total for t in vocab])

    jsd_matrix = {}
    failures = []

    print()
    print(
        "  JSD Matrix (interpretation: <0.05 = likely mode collapse; "
        "0.1-0.2 = expected for related types; >0.3 = strong diversity):"
    )
    print()

    for vec_a in available:
        jsd_matrix[vec_a] = {}
        for vec_b in available:
            if vec_a == vec_b:
                jsd_matrix[vec_a][vec_b] = 0.0
                continue
            jsd_val = float(jensenshannon(dists[vec_a], dists[vec_b]))
            jsd_matrix[vec_a][vec_b] = jsd_val
            if vec_a < vec_b:
                flag = ""
                if jsd_val < JSD_THRESHOLD:
                    flag = " *** MODE COLLAPSE ***"
                    failures.append((vec_a, vec_b, jsd_val))
                print(f"    {vec_a} vs {vec_b}: {jsd_val:.4f}{flag}")

    print()

    if failures:
        for va, vb, jsd_val in failures:
            print(
                f"  ERROR: Mode collapse detected: {va} vs {vb} "
                f"JSD={jsd_val:.4f} (threshold: {JSD_THRESHOLD})"
            )
        print(
            "\n  Revise prompt templates for these vectors to increase "
            "vocabulary diversity. Re-run Plan 02."
        )
        sys.exit(1)

    min_jsd = float("inf")
    min_pair = ("", "")
    for va in available:
        for vb in available:
            if va < vb and jsd_matrix[va][vb] < min_jsd:
                min_jsd = jsd_matrix[va][vb]
                min_pair = (va, vb)

    print(f"  Minimum JSD: {min_pair[0]} vs {min_pair[1]} = {min_jsd:.4f}")
    print("  [OK] JSD gate PASSED -- no mode collapse detected (all pairs >= 0.05)")

    with open(JSD_OUTPUT, "w") as fh:
        json.dump(jsd_matrix, fh, indent=2)
    print(f"  Saved JSD matrix to {JSD_OUTPUT}")


# =====================================================================
# Stage 3 (BART path): LLM Self-Consistency Check
# =====================================================================

def stage_3_bart_consistency(
    raw_samples: list[dict],
    bart_accuracy: float,
) -> list[dict]:
    """Filter using BART zero-shot classification. Used when BART baseline >= 0.70."""
    stage_header(3, "LLM Self-Consistency Check (Pass 1 -- BART)")

    from transformers import pipeline

    effective_threshold = (
        MODERATE_CONSISTENCY_THRESHOLD
        if bart_accuracy < BART_GOOD_ACCURACY
        else DEFAULT_CONSISTENCY_THRESHOLD
    )

    classifier = pipeline(
        "zero-shot-classification",
        model="facebook/bart-large-mnli",
        device=-1,
    )

    n_total = len(raw_samples)
    kept = []
    discarded_per_vector = defaultdict(list)
    kept_per_vector = defaultdict(int)
    total_per_vector = defaultdict(int)
    vector_thresholds = {}

    vectors_in_data = set(s.get("vector", "safe") for s in raw_samples)
    for vec in vectors_in_data:
        vector_thresholds[vec] = effective_threshold

    print(f"  Processing {n_total} samples with BART zero-shot classification...")
    print(f"  Default threshold: {effective_threshold}")
    print()

    start_time = time.time()

    for i, sample in enumerate(raw_samples):
        vec = sample.get("vector", "safe")
        true_label = sample["label"]
        text = sample["text"]
        total_per_vector[vec] += 1

        result = classifier(text, candidate_labels=["scam", "safe"])
        predicted = result["labels"][0]
        confidence = result["scores"][0]
        threshold = vector_thresholds[vec]

        if predicted == true_label and confidence >= threshold:
            kept.append(sample)
            kept_per_vector[vec] += 1
        else:
            discarded_per_vector[vec].append({
                "text": text,
                "true_label": true_label,
                "predicted": predicted,
                "confidence": confidence,
            })

        if (i + 1) % 2000 == 0 or (i + 1) == n_total:
            elapsed = time.time() - start_time
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            eta_min = (n_total - i - 1) / rate / 60 if rate > 0 else 0
            parts = []
            for v in sorted(total_per_vector.keys()):
                if total_per_vector[v] > 0:
                    pct = kept_per_vector[v] / total_per_vector[v] * 100
                    parts.append(f"{v}: {pct:.0f}% kept")
            print(
                f"  [{i+1}/{n_total}] "
                f"{rate:.1f} samples/s, ETA {eta_min:.0f}min | "
                f"{', '.join(parts)}"
            )

        if (i + 1) % 2000 == 0:
            for vec_check in sorted(total_per_vector.keys()):
                if total_per_vector[vec_check] == 0:
                    continue
                discard_rate = (
                    len(discarded_per_vector[vec_check])
                    / total_per_vector[vec_check]
                )
                current_thresh = vector_thresholds[vec_check]
                min_thresh = max(0.5, effective_threshold - 0.1)

                if (discard_rate > ADAPTIVE_DISCARD_RATE
                        and current_thresh > min_thresh):
                    discards = discarded_per_vector[vec_check]
                    sample_size = min(20, len(discards))
                    random.seed(RANDOM_SEED)
                    review_samples = random.sample(discards, sample_size)

                    print()
                    print(
                        f"  [REVIEW] {vec_check}: {sample_size} discarded samples "
                        "before threshold change:"
                    )
                    for rs in review_samples:
                        print(
                            f"    - pred={rs['predicted']} "
                            f"conf={rs['confidence']:.3f} "
                            f"true={rs['true_label']} "
                            f"text={rs['text'][:80]}..."
                        )

                    new_thresh = min_thresh
                    print(
                        f"\n  Adaptive threshold: {vec_check} lowered from "
                        f"{current_thresh} to {new_thresh} "
                        f"(discard rate was {discard_rate:.1%})"
                    )
                    vector_thresholds[vec_check] = new_thresh
                    print()

    total_kept = len(kept)
    total_discarded = n_total - total_kept
    print()
    print(f"  Self-consistency filter results:")
    print(f"    Total kept: {total_kept} ({total_kept/n_total:.1%})")
    print(f"    Total discarded: {total_discarded} ({total_discarded/n_total:.1%})")
    print()
    print(f"  Per-vector stats:")
    for vec in sorted(total_per_vector.keys()):
        t = total_per_vector[vec]
        k = kept_per_vector[vec]
        d = len(discarded_per_vector[vec])
        thresh = vector_thresholds[vec]
        print(
            f"    {vec:<30}: {k:>5} kept / {d:>5} discarded "
            f"({k/t:.1%} kept) [threshold={thresh}]"
        )

    return kept


# =====================================================================
# Stage 3 (Keyword path): Vector Keyword Consistency Check
# =====================================================================

def _count_keyword_matches(text: str, keywords: list[str]) -> int:
    """Count how many keywords from the list appear in text (case-insensitive)."""
    text_lower = text.lower()
    return sum(1 for kw in keywords if kw in text_lower)


def stage_3_keyword_consistency(raw_samples: list[dict]) -> list[dict]:
    """Filter samples using keyword-based vector consistency.

    - Scam samples must contain >= KEYWORD_MIN_MATCHES keywords for their
      assigned vector.  This catches mislabeled or off-topic generated text.
    - Safe samples always pass (hard negatives intentionally mimic scam
      vocabulary, so filtering them would defeat their purpose).

    Returns kept samples.
    """
    stage_header(3, "Keyword Vector Consistency Check (Pass 1 -- fallback)")

    print("  Mode: keyword-based (BART baseline failed, using domain keyword lists)")
    print(f"  Minimum keyword matches for scam samples: {KEYWORD_MIN_MATCHES}")
    print()

    n_total = len(raw_samples)
    kept = []
    discarded_per_vector = defaultdict(list)
    kept_per_vector = defaultdict(int)
    total_per_vector = defaultdict(int)

    start_time = time.time()

    for i, sample in enumerate(raw_samples):
        vec = sample.get("vector", "safe")
        label = sample["label"]
        text = sample["text"]
        total_per_vector[vec] += 1

        if label == "safe":
            # Safe samples always pass
            kept.append(sample)
            kept_per_vector[vec] += 1
        else:
            # Scam samples: check keyword consistency
            keywords = VECTOR_KEYWORDS.get(vec, [])
            matches = _count_keyword_matches(text, keywords)
            if matches >= KEYWORD_MIN_MATCHES:
                kept.append(sample)
                kept_per_vector[vec] += 1
            else:
                discarded_per_vector[vec].append({
                    "text": text,
                    "label": label,
                    "matches": matches,
                    "keywords_checked": len(keywords),
                })

        if (i + 1) % 5000 == 0 or (i + 1) == n_total:
            elapsed = time.time() - start_time
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            parts = []
            for v in sorted(total_per_vector.keys()):
                if total_per_vector[v] > 0:
                    pct = kept_per_vector[v] / total_per_vector[v] * 100
                    parts.append(f"{v}: {pct:.0f}% kept")
            print(
                f"  [{i+1}/{n_total}] {rate:.0f} samples/s | "
                f"{', '.join(parts)}"
            )

    # Log discarded samples for review
    for vec in sorted(discarded_per_vector.keys()):
        discards = discarded_per_vector[vec]
        if not discards:
            continue
        sample_size = min(20, len(discards))
        random.seed(RANDOM_SEED)
        review_set = random.sample(discards, sample_size)
        print()
        print(
            f"  [REVIEW] {vec}: {len(discards)} total discarded, "
            f"showing {sample_size} samples:"
        )
        for rs in review_set:
            print(
                f"    - matches={rs['matches']}/{rs['keywords_checked']} "
                f"text={rs['text'][:80]}..."
            )

    total_kept = len(kept)
    total_discarded = n_total - total_kept
    print()
    print(f"  Keyword consistency filter results:")
    print(f"    Total kept: {total_kept} ({total_kept/n_total:.1%})")
    print(f"    Total discarded: {total_discarded} ({total_discarded/n_total:.1%})")
    print()
    print(f"  Per-vector stats:")
    for vec in sorted(total_per_vector.keys()):
        t = total_per_vector[vec]
        k = kept_per_vector[vec]
        d = len(discarded_per_vector[vec])
        print(
            f"    {vec:<30}: {k:>5} kept / {d:>5} discarded "
            f"({k/t:.1%} kept)"
        )

    return kept


# =====================================================================
# Stage 4: Rule-Based Post-Filter (Pass 2)
# =====================================================================

def stage_4_rule_filter(
    samples: list[dict],
) -> tuple[list[dict], int, int]:
    """Apply dedup and min-token filter. Returns (filtered, n_dupes, n_short)."""
    stage_header(4, "Rule-Based Post-Filter (Pass 2 of two-pass filter)")

    n_before = len(samples)

    df = pd.DataFrame(samples)
    df["text_stripped"] = df["text"].str.strip()

    n_before_dedup = len(df)
    df = df.drop_duplicates(subset=["text_stripped"])
    n_after_dedup = len(df)
    n_dupes = n_before_dedup - n_after_dedup
    print(f"  Duplicates removed: {n_dupes}")

    df["token_count"] = df["text"].apply(lambda x: len(x.split()))
    n_before_short = len(df)
    df = df[df["token_count"] >= MIN_TOKENS]
    n_after_short = len(df)
    n_short = n_before_short - n_after_short
    print(f"  Sub-{MIN_TOKENS}-token samples removed: {n_short}")

    df = df.drop(columns=["text_stripped", "token_count"])

    result = df.to_dict(orient="records")
    n_after = len(result)
    print(f"  Before rule filter: {n_before}")
    print(f"  After rule filter: {n_after} ({n_after/n_before:.1%} retained)")

    return result, n_dupes, n_short


# =====================================================================
# Stage 5: Stratified Split
# =====================================================================

def stage_5_split(
    samples: list[dict],
) -> tuple[list[dict], list[dict]]:
    stage_header(5, "Stratified Split")

    from sklearn.model_selection import train_test_split

    strat_keys = [s["vector"] for s in samples]

    # First split: 90% train+val, 10% test
    trainval_samples, test_samples = train_test_split(
        samples,
        test_size=0.10,
        stratify=strat_keys,
        random_state=42,
    )

    # Second split: ~88.9% train, ~11.1% val (yields ~80/10/10 of total)
    trainval_strat = [s["vector"] for s in trainval_samples]
    train_samples, val_samples = train_test_split(
        trainval_samples,
        test_size=0.1111,
        stratify=trainval_strat,
        random_state=42,
    )

    for s in train_samples:
        s["split"] = "train"
    for s in val_samples:
        s["split"] = "val"
    for s in test_samples:
        s["split"] = "test"

    combined_trainval = train_samples + val_samples

    n_total = len(samples)
    print(f"  Total post-filter: {n_total}")
    print(f"  Train: {len(train_samples)} ({len(train_samples)/n_total:.1%})")
    print(f"  Val: {len(val_samples)} ({len(val_samples)/n_total:.1%})")
    print(f"  Test: {len(test_samples)} ({len(test_samples)/n_total:.1%})")
    print()
    print(
        "  Note: splits use random_state=42 for deterministic "
        "reproducibility across phases"
    )

    write_jsonl(OUTPUT_TRAINVAL, combined_trainval)
    write_jsonl(OUTPUT_TEST, test_samples)
    print(f"\n  Written: {OUTPUT_TRAINVAL} ({len(combined_trainval)} samples)")
    print(f"  Written: {OUTPUT_TEST} ({len(test_samples)} samples)")

    print("\n  Per-vector split distribution:")
    print(f"  {'Vector':<30} {'Train':>8} {'Val':>8} {'Test':>8} {'Total':>8}")
    print(f"  {'-'*30} {'-'*8} {'-'*8} {'-'*8} {'-'*8}")

    vec_train = Counter(s["vector"] for s in train_samples)
    vec_val = Counter(s["vector"] for s in val_samples)
    vec_test = Counter(s["vector"] for s in test_samples)
    all_vecs = sorted(set(vec_train) | set(vec_val) | set(vec_test))

    for vec in all_vecs:
        t = vec_train.get(vec, 0)
        v = vec_val.get(vec, 0)
        te = vec_test.get(vec, 0)
        print(f"  {vec:<30} {t:>8} {v:>8} {te:>8} {t+v+te:>8}")

    return combined_trainval, test_samples


# =====================================================================
# Stage 6: Summary Report
# =====================================================================

def stage_6_summary(
    n_raw: int,
    bart_accuracy: float,
    filter_mode: str,
    n_post_consistency: int,
    n_dupes_removed: int,
    n_short_removed: int,
    n_post_filter: int,
    trainval_samples: list[dict],
    test_samples: list[dict],
):
    stage_header(6, "Summary Report")

    n_total_final = len(trainval_samples) + len(test_samples)

    print(f"  Raw samples loaded:          {n_raw}")
    print(f"  BART baseline accuracy:      {bart_accuracy:.2%}")
    print(f"  Consistency filter mode:     {filter_mode}")
    print()
    print(f"  JSD gate:                    PASSED")
    print()
    print(f"  Self-consistency filter ({filter_mode}):")
    print(f"    Kept:                      {n_post_consistency}")
    print(f"    Discarded:                 {n_raw - n_post_consistency}")
    print()
    print(f"  Rule-based filter:")
    print(f"    Duplicates removed:        {n_dupes_removed}")
    print(f"    Sub-{MIN_TOKENS}-token removed:      {n_short_removed}")
    print()
    print(f"  Post-filter total:           {n_post_filter}")
    print(f"  Yield:                       {n_post_filter/n_raw:.1%} of raw")
    print()

    all_final = trainval_samples + test_samples
    train_count = sum(1 for s in all_final if s.get("split") == "train")
    val_count = sum(1 for s in all_final if s.get("split") == "val")
    test_count = sum(1 for s in all_final if s.get("split") == "test")

    print(f"  Final split counts:")
    print(f"    Train: {train_count}")
    print(f"    Val:   {val_count}")
    print(f"    Test:  {test_count}")
    print(f"    Total: {n_total_final}")
    print()

    safe_samples = [s for s in all_final if s.get("label") == "safe"]
    scam_samples = [s for s in all_final if s.get("label") == "scam"]
    print(f"  Safe class: {len(safe_samples)} samples")
    print(f"  Scam class: {len(scam_samples)} samples")

    print()
    print("  Pipeline complete.")


# =====================================================================
# Main
# =====================================================================

def main():
    print("=" * 70)
    print("  FILTER AND SPLIT PIPELINE")
    print("  Input:  research/data/synthetic_raw.jsonl")
    print("  Output: research/data/synthetic_scam_v1.jsonl (train+val)")
    print("          research/data/test_split.jsonl (test)")
    print("=" * 70)

    # Stage 0: Pre-checks
    stage_0_prechecks()

    # Stage 1: BART baseline
    filter_mode, bart_accuracy = stage_1_bart_baseline()

    # Load raw data
    print("\n  Loading synthetic_raw.jsonl...")
    raw_samples = load_jsonl(RAW_PATH)
    n_raw = len(raw_samples)
    print(f"  Loaded {n_raw} raw samples")

    # Stage 2: JSD gate
    stage_2_jsd_gate(raw_samples)

    # Stage 3: Self-consistency filter (BART or keyword fallback)
    if filter_mode == "bart":
        kept_samples = stage_3_bart_consistency(raw_samples, bart_accuracy)
    else:
        kept_samples = stage_3_keyword_consistency(raw_samples)
    n_post_consistency = len(kept_samples)

    # Stage 4: Rule-based filter
    filtered_samples, n_dupes_removed, n_short_removed = stage_4_rule_filter(
        kept_samples
    )
    n_post_filter = len(filtered_samples)

    # Stage 5: Stratified split
    trainval_samples, test_samples = stage_5_split(filtered_samples)

    # Stage 6: Summary
    stage_6_summary(
        n_raw=n_raw,
        bart_accuracy=bart_accuracy,
        filter_mode=filter_mode,
        n_post_consistency=n_post_consistency,
        n_dupes_removed=n_dupes_removed,
        n_short_removed=n_short_removed,
        n_post_filter=n_post_filter,
        trainval_samples=trainval_samples,
        test_samples=test_samples,
    )


if __name__ == "__main__":
    main()
