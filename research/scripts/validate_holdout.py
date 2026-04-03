"""
Validate the real-world holdout set at research/data/holdout_realworld.jsonl.

Exits 0 on pass, exits 1 with descriptive error message on fail.
"""

import sys
import json
from collections import Counter
from pathlib import Path

HOLDOUT_PATH = Path("research/data/holdout_realworld.jsonl")

VALID_LABELS = {"scam", "safe"}
VALID_SOURCES = {
    "ftc",
    "reddit_rscams",
    "phishtank",
    "huggingface_phishing",
    "huggingface_difraud",
    "huggingface_sms_spam",
    "manual",
}

# Source-family check per D-01 (review item 8)
AUTOMATED = {"huggingface_phishing", "huggingface_difraud", "huggingface_sms_spam"}
PUBLIC_DB = {"phishtank", "ftc"}
COMMUNITY = {"reddit_rscams", "manual"}

REQUIRED_FIELDS = {"text", "label", "vector", "source"}


def main():
    # --- File existence ---
    if not HOLDOUT_PATH.exists():
        print(f"ERROR: Holdout file not found at {HOLDOUT_PATH}")
        sys.exit(1)

    samples = []
    with open(HOLDOUT_PATH, "r", encoding="utf-8") as fh:
        for i, line in enumerate(fh, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as exc:
                print(f"ERROR: Line {i}: invalid JSON — {exc}")
                sys.exit(1)

            # Required field check
            for field in REQUIRED_FIELDS:
                if field not in obj:
                    print(f"ERROR: Line {i}: missing field '{field}'")
                    sys.exit(1)

            # Label check
            label = obj["label"]
            if label not in VALID_LABELS:
                print(f"ERROR: Line {i}: invalid label '{label}'")
                sys.exit(1)

            # Source check
            source = obj["source"]
            if source not in VALID_SOURCES:
                print(f"ERROR: Line {i}: invalid source '{source}'")
                sys.exit(1)

            samples.append(obj)

    count = len(samples)

    # --- Line count ---
    if not (200 <= count <= 500):
        print(f"ERROR: Holdout has {count} samples, need 200-500")
        sys.exit(1)

    # --- Source-family check (review item 8) ---
    sources_present = {s["source"] for s in samples}
    has_automated_only = sources_present.issubset(AUTOMATED)
    has_non_automated = bool(sources_present & (PUBLIC_DB | COMMUNITY))
    if not has_non_automated:
        print(
            "ERROR: All samples are from HuggingFace — holdout must include at least 1 "
            "sample from phishtank/ftc/reddit_rscams/manual per D-01"
        )
        sys.exit(1)

    # --- Safe sample count ---
    safe_count = sum(1 for s in samples if s["label"] == "safe")
    if safe_count < 40:
        print(f"ERROR: Only {safe_count} safe samples, need >= 40 per D-04")
        sys.exit(1)

    # --- Print summary table ---
    label_counts = Counter(s["label"] for s in samples)
    source_counts = Counter(s["source"] for s in samples)
    vector_counts = Counter(s["vector"] for s in samples)

    families_represented = []
    if sources_present & AUTOMATED:
        families_represented.append("AUTOMATED (HuggingFace)")
    if sources_present & PUBLIC_DB:
        families_represented.append("PUBLIC_DB (phishtank/ftc)")
    if sources_present & COMMUNITY:
        families_represented.append("COMMUNITY (reddit/manual)")

    print("=" * 60)
    print("HOLDOUT VALIDATION: PASSED")
    print("=" * 60)
    print(f"Total samples : {count}")
    print()
    print("Label distribution:")
    for lbl, cnt in sorted(label_counts.items()):
        print(f"  {lbl:<10} : {cnt}")
    print()
    print("Source distribution:")
    for src, cnt in sorted(source_counts.items()):
        print(f"  {src:<30} : {cnt}")
    print()
    print("Vector distribution:")
    for vec, cnt in sorted(vector_counts.items()):
        print(f"  {vec:<30} : {cnt}")
    print()
    print("Source families represented:")
    for fam in families_represented:
        print(f"  - {fam}")
    print("=" * 60)


if __name__ == "__main__":
    main()
