"""
Validate train/val/test split integrity.

Checks against:
  - research/data/synthetic_scam_v1.jsonl  (train + val portion)
  - research/data/test_split.jsonl          (test portion)

Verifies:
  - Both files exist
  - ~80/10/10 train-val/test split ratios (tolerance 78-82% / 8-12%)
  - Zero text overlap between synthetic and test files
  - All 8 scam vectors + safe class appear in both files (stratification)
  - random_state=42 documented for reproducibility

Exits 0 on pass, exits 1 with descriptive error message on fail.
"""

import sys
import json
from collections import Counter
from pathlib import Path

SYNTHETIC_PATH = Path("research/data/synthetic_scam_v1.jsonl")
TEST_SPLIT_PATH = Path("research/data/test_split.jsonl")

REQUIRED_CLASSES = {
    "crypto_investment",
    "romance_grooming",
    "tech_support",
    "government_impersonation",
    "lottery_reward",
    "urgency_payment",
    "phishing",
    "remote_access",
    "safe",
}

# Note: splits are deterministic (random_state=42) for cross-phase reproducibility


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


def get_class(sample):
    """Return effective class label: vector for scam, 'safe' for safe samples."""
    if sample.get("label") == "safe":
        return "safe"
    return sample.get("vector", "unknown")


def main():
    print("Note: splits are deterministic (random_state=42) for cross-phase reproducibility")
    print()

    # --- File existence ---
    if not SYNTHETIC_PATH.exists():
        print(f"ERROR: synthetic_scam_v1.jsonl not found at {SYNTHETIC_PATH}")
        sys.exit(1)
    if not TEST_SPLIT_PATH.exists():
        print(f"ERROR: test_split.jsonl not found at {TEST_SPLIT_PATH}")
        sys.exit(1)

    train_val_samples = load_jsonl(SYNTHETIC_PATH)
    test_samples = load_jsonl(TEST_SPLIT_PATH)

    n_train_val = len(train_val_samples)
    n_test = len(test_samples)
    n_total = n_train_val + n_test

    if n_total == 0:
        print("ERROR: Both files are empty")
        sys.exit(1)

    # --- Split ratio check ---
    train_val_ratio = n_train_val / n_total
    test_ratio = n_test / n_total

    print("=" * 60)
    print("SPLIT VALIDATION")
    print("=" * 60)
    print(f"synthetic_scam_v1.jsonl : {n_train_val:>6} samples ({train_val_ratio:.1%} of total)")
    print(f"test_split.jsonl        : {n_test:>6} samples ({test_ratio:.1%} of total)")
    print(f"Total (implied)         : {n_total:>6}")
    print()

    failed = False

    if not (0.78 <= train_val_ratio <= 0.82):
        print(
            f"ERROR: Train+val ratio = {train_val_ratio:.1%}, need 78-82% "
            f"(expected ~80% = ~{int(n_total * 0.8)} samples)"
        )
        failed = True

    if not (0.08 <= test_ratio <= 0.12):
        print(
            f"ERROR: Test ratio = {test_ratio:.1%}, need 8-12% "
            f"(expected ~10% = ~{int(n_total * 0.1)} samples)"
        )
        failed = True

    # --- Overlap check ---
    train_texts = {s["text"].strip() for s in train_val_samples}
    test_texts = {s["text"].strip() for s in test_samples}
    overlap = train_texts & test_texts

    if overlap:
        print(f"ERROR: {len(overlap)} text(s) appear in both synthetic and test files (data leakage)")
        print(f"  Example overlap: {list(overlap)[:3]}")
        failed = True
    else:
        print(f"Text overlap check    : 0 overlapping samples (PASS)")

    # --- Stratification check ---
    train_classes = {get_class(s) for s in train_val_samples}
    test_classes = {get_class(s) for s in test_samples}

    missing_from_train = REQUIRED_CLASSES - train_classes
    missing_from_test = REQUIRED_CLASSES - test_classes

    if missing_from_train:
        print(f"ERROR: Classes missing from synthetic_scam_v1.jsonl: {sorted(missing_from_train)}")
        failed = True

    if missing_from_test:
        print(f"ERROR: Classes missing from test_split.jsonl: {sorted(missing_from_test)}")
        failed = True

    # --- Per-vector distribution ---
    print()
    print("Per-vector distribution:")
    print(f"  {'Class':<30} {'Train+Val':>10} {'Test':>8}")
    print(f"  {'-'*30} {'-'*10} {'-'*8}")
    train_dist = Counter(get_class(s) for s in train_val_samples)
    test_dist = Counter(get_class(s) for s in test_samples)
    all_classes = sorted(train_dist.keys() | test_dist.keys())
    for cls in all_classes:
        print(f"  {cls:<30} {train_dist[cls]:>10} {test_dist[cls]:>8}")

    print("=" * 60)

    if failed:
        sys.exit(1)

    print("SPLIT VALIDATION: PASSED")


if __name__ == "__main__":
    main()
