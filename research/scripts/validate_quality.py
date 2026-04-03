"""
Validate quality filters for the synthetic dataset at research/data/synthetic_scam_v1.jsonl.

Checks:
  - Zero exact-duplicate text values (after whitespace stripping)
  - Zero samples with fewer than 15 whitespace-delimited tokens

Exits 0 on pass, exits 1 with descriptive error message on fail.
"""

import sys
import json
from pathlib import Path

SYNTHETIC_PATH = Path("research/data/synthetic_scam_v1.jsonl")
MIN_TOKENS = 15


def main():
    if not SYNTHETIC_PATH.exists():
        print(f"ERROR: Synthetic dataset not found at {SYNTHETIC_PATH}")
        sys.exit(1)

    samples = []
    with open(SYNTHETIC_PATH, "r", encoding="utf-8") as fh:
        for i, line in enumerate(fh, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as exc:
                print(f"ERROR: Line {i}: invalid JSON — {exc}")
                sys.exit(1)
            samples.append(obj)

    total = len(samples)

    # --- Duplicate check ---
    texts = [s["text"].strip() for s in samples]
    seen = set()
    duplicat_indices = []
    for i, text in enumerate(texts, start=1):
        if text in seen:
            duplicat_indices.append(i)
        seen.add(text)

    # --- Sub-15-token check ---
    short_indices = [
        i for i, s in enumerate(samples, start=1)
        if len(s["text"].split()) < MIN_TOKENS
    ]

    # --- Report ---
    print("=" * 60)
    print("QUALITY VALIDATION")
    print("=" * 60)
    print(f"Total samples          : {total}")
    print(f"Duplicate texts found  : {len(duplicat_indices)} (should be 0)")
    print(f"Sub-{MIN_TOKENS}-token samples    : {len(short_indices)} (should be 0)")
    print("=" * 60)

    failed = False
    if duplicat_indices:
        print(f"ERROR: {len(duplicat_indices)} exact-duplicate text values found")
        print(f"  First duplicate at line(s): {duplicat_indices[:5]}")
        failed = True

    if short_indices:
        print(
            f"ERROR: {len(short_indices)} samples have fewer than {MIN_TOKENS} tokens"
        )
        print(f"  First short sample at line(s): {short_indices[:5]}")
        failed = True

    if failed:
        sys.exit(1)

    print("QUALITY VALIDATION: PASSED")


if __name__ == "__main__":
    main()
