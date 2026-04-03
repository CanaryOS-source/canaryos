"""
Validate the synthetic dataset at research/data/synthetic_scam_v1.jsonl.

Flags:
  --check-counts        Validate total count, vector coverage, safe ratio
  --check-jsd           Compute Jensen-Shannon divergence across scam vectors
  --check-negatives     Verify hard negative types in safe class
  --check-contamination TF-IDF semantic contamination check vs holdout

If no flag is given, all checks are run.

Exits 0 on pass, exits 1 on fail.
"""

import sys
import json
import argparse
from collections import Counter
from pathlib import Path

SYNTHETIC_PATH = Path("research/data/synthetic_scam_v1.jsonl")
HOLDOUT_PATH = Path("research/data/holdout_realworld.jsonl")

REQUIRED_VECTORS = {
    "crypto_investment",
    "romance_grooming",
    "tech_support",
    "government_impersonation",
    "lottery_reward",
    "urgency_payment",
    "phishing",
    "remote_access",
}

# Hard negative keyword groups per D-09
HARD_NEGATIVE_GROUPS = [
    ["bank", "fraud alert", "suspicious activity"],
    ["delivery", "package", "tracking", "shipped"],
    ["verification code", "2FA", "one-time", "OTP"],
    ["appointment", "prescription", "pharmacy", "doctor"],
]


def load_jsonl(path):
    samples = []
    with open(path, "r", encoding="utf-8") as fh:
        for i, line in enumerate(fh, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                samples.append(json.loads(line))
            except json.JSONDecodeError as exc:
                print(f"ERROR: {path} line {i}: invalid JSON — {exc}")
                sys.exit(1)
    return samples


def check_counts(samples):
    print("[check-counts] Running...")
    total = len(samples)
    if total < 16000:
        print(f"ERROR: synthetic dataset has {total} samples, need >= 16000")
        sys.exit(1)

    vectors_present = {s["vector"] for s in samples if s.get("label") == "scam"}
    missing = REQUIRED_VECTORS - vectors_present
    if missing:
        print(f"ERROR: Missing scam vectors in dataset: {sorted(missing)}")
        sys.exit(1)

    safe_count = sum(1 for s in samples if s.get("label") == "safe")
    safe_ratio = safe_count / total
    if not (0.40 <= safe_ratio <= 0.60):
        print(
            f"ERROR: safe ratio = {safe_ratio:.2%} ({safe_count}/{total}), "
            "need 40-60% per D-13 (50:50 target)"
        )
        sys.exit(1)

    vector_counts = Counter(s["vector"] for s in samples)
    print(f"  Total samples      : {total}")
    print(f"  Safe samples       : {safe_count} ({safe_ratio:.1%})")
    print(f"  Scam vectors found : {sorted(vectors_present)}")
    print(f"  Vector distribution:")
    for vec, cnt in sorted(vector_counts.items()):
        print(f"    {vec:<35}: {cnt}")
    print("[check-counts] PASSED")


def check_jsd(samples):
    print("[check-jsd] Running...")
    from scipy.spatial.distance import jensenshannon
    import numpy as np

    vectors = sorted(REQUIRED_VECTORS)
    # Build token unigram frequency distributions per vector
    freq_maps = {}
    for vec in vectors:
        texts = [s["text"] for s in samples if s.get("vector") == vec and s.get("label") == "scam"]
        if not texts:
            print(f"WARNING: No scam samples found for vector '{vec}' — skipping JSD for this vector")
            continue
        token_counts = Counter()
        for text in texts:
            token_counts.update(text.lower().split())
        freq_maps[vec] = token_counts

    available = sorted(freq_maps.keys())

    # Build a shared vocabulary
    vocab = set()
    for counts in freq_maps.values():
        vocab.update(counts.keys())
    vocab = sorted(vocab)

    # Build probability distributions
    dists = {}
    for vec in available:
        total = sum(freq_maps[vec].values())
        dists[vec] = np.array([freq_maps[vec].get(t, 0) / total for t in vocab])

    print()
    print("  Jensen-Shannon Divergence Matrix (scam vectors):")
    print("  JSD < 0.05 = likely mode collapse; JSD 0.1-0.2 = expected for related scam types; JSD > 0.3 = strong diversity")
    print()

    # Header row
    header = "  " + " " * 26 + "  ".join(f"{v[:12]:>12}" for v in available)
    print(header)

    failures = []
    for vec_a in available:
        row = f"  {vec_a:<26}"
        for vec_b in available:
            if vec_a == vec_b:
                row += f"{'---':>14}"
            else:
                jsd = jensenshannon(dists[vec_a], dists[vec_b])
                row += f"  {jsd:>10.4f}"
                if jsd < 0.05:
                    failures.append((vec_a, vec_b, jsd))
        print(row)

    print()
    if failures:
        for va, vb, jsd in failures:
            print(f"ERROR: Mode collapse detected: {va} vs {vb} JSD={jsd:.4f} (threshold: 0.05)")
        sys.exit(1)

    print("[check-jsd] PASSED — no mode collapse detected (all JSD >= 0.05)")


def check_negatives(samples):
    print("[check-negatives] Running...")
    safe_texts = [s["text"].lower() for s in samples if s.get("label") == "safe"]

    if not safe_texts:
        print("ERROR: No safe-class samples found in synthetic dataset")
        sys.exit(1)

    group_names = [
        "bank/fraud alerts",
        "delivery/package notifications",
        "2FA/verification codes",
        "medical/appointment alerts",
    ]

    matched_groups = 0
    for i, (group, name) in enumerate(zip(HARD_NEGATIVE_GROUPS, group_names)):
        found = any(
            any(kw in text for kw in group)
            for text in safe_texts
        )
        status = "FOUND" if found else "MISSING"
        print(f"  Hard negative type [{i+1}] {name}: {status}")
        if found:
            matched_groups += 1

    if matched_groups < 4:
        print(
            f"ERROR: Only {matched_groups}/4 hard negative types found in safe class. "
            "Need all 4 per D-09."
        )
        sys.exit(1)

    print("[check-negatives] PASSED — all 4 hard negative types present")


def check_contamination(samples):
    print("[check-contamination] Running TF-IDF semantic contamination check...")
    import numpy as np
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity

    if not HOLDOUT_PATH.exists():
        print(f"ERROR: Holdout file not found at {HOLDOUT_PATH} — cannot check contamination")
        sys.exit(1)

    holdout_samples = load_jsonl(HOLDOUT_PATH)
    holdout_texts = [s["text"] for s in holdout_samples]
    synthetic_texts = [s["text"] for s in samples]

    print(f"  Holdout samples   : {len(holdout_texts)}")
    print(f"  Synthetic samples : {len(synthetic_texts)}")
    print("  Computing TF-IDF vectors (this may take a moment)...")

    all_texts = holdout_texts + synthetic_texts
    vectorizer = TfidfVectorizer(max_features=10000, ngram_range=(1, 2))
    tfidf_matrix = vectorizer.fit_transform(all_texts)

    holdout_matrix = tfidf_matrix[: len(holdout_texts)]
    synthetic_matrix = tfidf_matrix[len(holdout_texts) :]

    # Compute pairwise cosine similarity in batches to avoid OOM
    WARN_THRESHOLD = 0.85
    HARD_THRESHOLD = 0.95
    warn_pairs = 0
    hard_violations = []

    BATCH_SIZE = 50
    for i_start in range(0, len(holdout_texts), BATCH_SIZE):
        i_end = min(i_start + BATCH_SIZE, len(holdout_texts))
        sim_block = cosine_similarity(
            holdout_matrix[i_start:i_end], synthetic_matrix
        )
        for i_offset, row in enumerate(sim_block):
            i = i_start + i_offset
            for j, sim in enumerate(row):
                if sim > WARN_THRESHOLD:
                    warn_pairs += 1
                    print(
                        f"  WARNING: Potential semantic contamination: "
                        f"holdout[{i}] vs synthetic[{j}] similarity={sim:.3f}"
                    )
                if sim > HARD_THRESHOLD:
                    hard_violations.append((i, j, sim))

    print(f"  Pairs above 0.85 similarity threshold: {warn_pairs}")

    if hard_violations:
        for i, j, sim in hard_violations:
            print(
                f"ERROR: Hard contamination gate: holdout[{i}] vs synthetic[{j}] "
                f"similarity={sim:.3f} exceeds 0.95 threshold"
            )
        sys.exit(1)

    print("[check-contamination] PASSED — no pairs exceed 0.95 cosine similarity")


def main():
    parser = argparse.ArgumentParser(description="Validate synthetic scam dataset")
    parser.add_argument("--check-counts", action="store_true")
    parser.add_argument("--check-jsd", action="store_true")
    parser.add_argument("--check-negatives", action="store_true")
    parser.add_argument("--check-contamination", action="store_true")
    args = parser.parse_args()

    run_all = not any([args.check_counts, args.check_jsd, args.check_negatives, args.check_contamination])

    if not SYNTHETIC_PATH.exists():
        print(f"ERROR: Synthetic dataset not found at {SYNTHETIC_PATH}")
        sys.exit(1)

    samples = load_jsonl(SYNTHETIC_PATH)

    if run_all or args.check_counts:
        check_counts(samples)
        print()

    if run_all or args.check_jsd:
        check_jsd(samples)
        print()

    if run_all or args.check_negatives:
        check_negatives(samples)
        print()

    if run_all or args.check_contamination:
        check_contamination(samples)
        print()

    print("All requested checks PASSED.")


if __name__ == "__main__":
    main()
