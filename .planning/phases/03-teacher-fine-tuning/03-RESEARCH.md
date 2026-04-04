# Phase 3: Teacher Fine-Tuning - Research

**Researched:** 2026-04-04
**Domain:** DeBERTa-v3-large fine-tuning for scam/safe classification with multi-label intent heads, Google Colab T4 training, soft label pre-computation for distillation
**Confidence:** HIGH

## Summary

Phase 3 fine-tunes `microsoft/deberta-v3-large` (435M params, 24 layers, hidden size 1024) on the Phase 1 synthetic dataset (~18,353 training samples) with a dual-head architecture: one binary scam/safe head and eight sigmoid intent heads sharing a single DeBERTa encoder. The teacher runs server-side only (Colab) and never deploys to device. Its purpose is to establish an accuracy ceiling and produce calibrated soft labels for Phase 4 distillation into MobileBERT.

DeBERTa-v3-large fits on a T4 GPU (15GB usable VRAM) with batch size 4, gradient accumulation steps of 4 (effective batch 16), max sequence length 128, FP16 mixed precision, and gradient checkpointing. The model's base memory footprint is ~3.2GB in FP16 for training (Adam optimizer states included), leaving ~11.8GB for activations and gradients. This is feasible but tight -- aggressive checkpointing to Google Drive is mandatory since Colab free tier sessions disconnect after 90 minutes of idle time or 12 hours total.

The critical deliverables are: (1) teacher checkpoint passing both F1 gates (>0.95 synthetic test, >0.80 real-world holdout), (2) ECE calibration measurement before and after temperature scaling, and (3) pre-computed soft labels at T={2,3,4,5} saved to disk for Phase 4. The soft label pre-computation is a one-time GPU cost (~20-30 minutes on T4) that completely decouples Phase 4 from the 435M parameter teacher model.

**Primary recommendation:** Use PyTorch + HuggingFace Trainer with a custom dual-head model class wrapping `DebertaV2Model`, training with combined BCE (binary) + BCE (intent multi-label) loss. Pre-compute soft labels at four temperatures at the end of training.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Google Colab is the training environment. Notebook must include Colab-specific patterns: drive mounting for checkpoint persistence, `!pip install` cells, session timeout awareness.
- **D-02:** Start on free tier (T4, 16GB VRAM). DeBERTa-v3-large fits on T4 with gradient accumulation and batch size 4-8. Notebook must be designed with aggressive checkpointing so training can resume after Colab session timeouts (~90 min idle disconnect).
- **D-03:** Fallback to Colab Pro (A100, 40GB VRAM) if T4 proves insufficient. The notebook must include a clearly documented T4-to-A100 migration section: how to resume from the latest checkpoint, what batch size / gradient accumulation settings to change, and what to expect differently. This migration guide must be comprehensive enough that the user can switch environments at any point in the training process without losing progress.
- **D-04:** All checkpoints saved to Google Drive (`/content/drive/MyDrive/canaryos_teacher/`). Every epoch checkpoint saved, not just best -- enables mid-training environment migration.
- **D-05:** Teacher trained with BOTH binary scam/safe head AND 8 sigmoid intent heads (urgency, authority, financial_request, remote_access, reward_lottery, impersonation, romance_grooming, crypto). Single shared DeBERTa encoder, two output heads.
- **D-06:** Binary F1 > 0.80 on real-world holdout is the only hard gate for proceeding to Phase 4. Intent head quality is logged and reviewed (per-label precision/recall on holdout) but does NOT block Phase 4 -- holdout sample count (202) is too small for meaningful per-label metrics.
- **D-07:** Teacher F1 > 0.95 on synthetic test set is an internal quality bar (TEXT-04 requirement). If met on synthetic but not on holdout, this is a generalization problem -- see recovery decisions.
- **D-08:** Pre-compute teacher soft labels at the END of Phase 3, not during Phase 4 distillation. Run teacher inference on the full synthetic training set and save soft labels to disk. Decouples phases and avoids loading 435M param teacher during Phase 4 distillation (critical for T4 memory).
- **D-09:** Generate soft labels at FOUR temperatures: T={2, 3, 4, 5}. Save all four versions (e.g., `research/data/teacher_soft_labels_T2.pt`, `_T3.pt`, `_T4.pt`, `_T5.pt`). Phase 4 sweeps temperatures by loading different files -- no teacher reload needed.
- **D-10:** Soft labels include BOTH binary logits and 8-label intent logits at each temperature. Phase 4 distillation can use both signals.
- **D-11:** ECE (Expected Calibration Error) measured before and after temperature scaling on a held-out calibration set (per TEXT-04 requirement and Pitfall 2.2 prevention).
- **D-12:** If teacher fails F1 > 0.80 holdout gate: retry with 2 different hyperparameter configurations (e.g., lower learning rate + more epochs, then class weighting adjustment). Checkpoint each attempt.
- **D-13:** If 2 hyperparameter retries both fail: escalate to data augmentation. Claude's discretion on scope.
- **D-14:** The notebook must include a per-vector error breakdown cell that runs automatically after each training attempt, making the failure mode visible immediately.

### Claude's Discretion
- Exact learning rate, warmup steps, and weight decay values (within reasonable ranges for DeBERTa-v3-large fine-tuning)
- Batch size / gradient accumulation split for T4 (must fit in 16GB VRAM)
- Calibration set construction (subset of val split or separate holdout partition)
- Notebook cell structure and visualization choices
- If data augmentation is needed: scope of re-generation (targeted vs full) based on error analysis

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEXT-04 (teacher component) | DeBERTa-v3-large fine-tuned on synthetic dataset with binary + multi-label heads; F1 > 0.80 on real-world holdout (hard gate); F1 > 0.95 on synthetic test; teacher checkpoint saved; soft labels calibrated via temperature scaling with ECE measured | Full architecture pattern documented below (dual-head model class, loss computation, training hyperparameters, T4 memory budget, checkpoint strategy, ECE calibration protocol, soft label pre-computation at 4 temperatures) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- All ML research MUST be Jupyter notebooks (`.ipynb`) in `research/notebooks/` -- no `.py` files for research tasks
- Model outputs go in `research/models/` (gitignored)
- Data files in `research/data/` (gitignored)
- No emojis in code or UI
- Keep files under 500 lines (notebook cells should be modular)
- NEVER commit secrets, credentials, or .env files
- PyTorch is the primary training framework (Phase 2 D-01)

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `transformers` | >=4.48.0 | DeBERTa-v3-large model loading, DebertaV2Model, tokenizer | Official HuggingFace implementation of DeBERTa-v2/v3; Trainer API for training loop |
| `torch` | >=2.1.0 (Colab pre-installed) | Training framework, GPU compute, model definition | DeBERTa-v3-large is PyTorch-only in HuggingFace (no TF implementation exists) |
| `datasets` | >=3.0.0 | Dataset loading from JSONL, stratified sampling | HuggingFace ecosystem standard |
| `accelerate` | >=0.25.0 | FP16 mixed precision, gradient accumulation via Trainer | Required by Trainer for GPU training optimization |
| `evaluate` | >=0.4.0 | F1, precision, recall metrics computation | HuggingFace metrics standard |
| `scikit-learn` | >=1.4.0 | classification_report, confusion_matrix, per-vector breakdown | Standard for evaluation reporting |
| `numpy` | >=1.26.0 | Array operations for soft label computation | Already in Colab environment |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `torchmetrics` | >=1.2.0 | BinaryCalibrationError (ECE computation) | ECE measurement before/after temperature scaling |
| `matplotlib` | >=3.8.0 | Training curves, reliability diagrams, confusion matrices | Visualization cells in notebook |
| `seaborn` | >=0.13.0 | Heatmaps for per-vector error breakdown | Per-vector analysis visualization |
| `google-colab` | (pre-installed) | Drive mounting, session management | Colab-specific patterns (drive.mount) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom dual-head model | `DebertaV2ForSequenceClassification` with `problem_type="multi_label_classification"` | Only supports one head type; cannot combine binary + multi-label in a single model. Custom class is required per D-05 |
| Manual training loop | HuggingFace Trainer with custom `compute_loss` | Trainer handles checkpointing, logging, gradient accumulation automatically; custom loss needed for dual-head but rest is standard |
| `netcal` library for ECE | `torchmetrics.classification.BinaryCalibrationError` | torchmetrics is more widely used and directly integrates with PyTorch tensors |
| scipy.optimize for temperature | Manual grid search over T={2,3,4,5} | D-09 already specifies the four temperatures; no optimization needed, just compute soft labels at each |

**Installation (Colab first cell):**
```python
!pip install -q transformers>=4.48.0 datasets>=3.0.0 accelerate>=0.25.0 evaluate>=0.4.0 torchmetrics>=1.2.0 sentencepiece
```

Note: `sentencepiece` is required for the DeBERTa-v3 tokenizer (`DebertaV2TokenizerFast` uses SentencePiece, not WordPiece). `torch` is pre-installed in Colab.

## Architecture Patterns

### Recommended Project Structure

```
research/
  notebooks/
    teacher_finetuning.ipynb          # Main Phase 3 notebook (Colab)
  models/
    teacher_finetuned/                # Best checkpoint (gitignored)
      config.json
      model.safetensors
      tokenizer files
  data/
    synthetic_scam_v1.jsonl           # Training data (train+val splits)
    test_split.jsonl                  # Synthetic test set
    holdout_realworld.jsonl           # Real-world holdout (202 samples)
    teacher_soft_labels_T2.pt         # Soft labels at T=2
    teacher_soft_labels_T3.pt         # Soft labels at T=3
    teacher_soft_labels_T4.pt         # Soft labels at T=4
    teacher_soft_labels_T5.pt         # Soft labels at T=5
```

Google Drive checkpoint structure:
```
/content/drive/MyDrive/canaryos_teacher/
  epoch_1/
  epoch_2/
  epoch_3/
  best_binary/                        # Best by holdout binary F1
  training_state.json                 # Tracks current epoch, best metrics
```

### Pattern 1: Dual-Head Teacher Model

**What:** Custom `nn.Module` wrapping `DebertaV2Model` (not `ForSequenceClassification`) with two separate classification heads on the shared encoder's `[CLS]` output.

**When to use:** Whenever you need simultaneous binary and multi-label classification from a shared encoder.

**Why not use `DebertaV2ForSequenceClassification`:** That class supports only a single classification head. Setting `problem_type="multi_label_classification"` gives you multi-label but loses the binary head. D-05 requires both.

**Example:**
```python
# Source: HuggingFace transformers DebertaV2Model docs + multi-task pattern
from transformers import DebertaV2Model, DebertaV2PreTrainedModel
import torch
import torch.nn as nn

class DualHeadDeBERTaTeacher(DebertaV2PreTrainedModel):
    def __init__(self, config):
        super().__init__(config)
        self.deberta = DebertaV2Model(config)
        self.dropout = nn.Dropout(config.hidden_dropout_prob)
        
        # Binary scam/safe head (2 classes for logits, softmax at inference)
        self.binary_head = nn.Linear(config.hidden_size, 2)
        
        # Intent multi-label head (8 sigmoid outputs)
        self.intent_head = nn.Linear(config.hidden_size, 8)
        
        self.post_init()
    
    def forward(self, input_ids=None, attention_mask=None, token_type_ids=None,
                labels=None, intent_labels=None):
        outputs = self.deberta(
            input_ids=input_ids,
            attention_mask=attention_mask,
            token_type_ids=token_type_ids,
        )
        # Use [CLS] token representation
        cls_output = self.dropout(outputs.last_hidden_state[:, 0, :])
        
        binary_logits = self.binary_head(cls_output)   # [batch, 2]
        intent_logits = self.intent_head(cls_output)    # [batch, 8]
        
        loss = None
        if labels is not None:
            # Binary: CrossEntropyLoss (scam=1, safe=0)
            binary_loss = nn.CrossEntropyLoss()(binary_logits, labels)
            
            if intent_labels is not None:
                # Multi-label: BCEWithLogitsLoss (8 independent sigmoids)
                intent_loss = nn.BCEWithLogitsLoss()(intent_logits, intent_labels.float())
                # Combined loss: weight binary head more heavily since it's the hard gate
                loss = 0.7 * binary_loss + 0.3 * intent_loss
            else:
                loss = binary_loss
        
        return {
            "loss": loss,
            "binary_logits": binary_logits,
            "intent_logits": intent_logits,
        }
```

### Pattern 2: Intent Label Mapping

**What:** Map the `vector` field from training data to 8 binary intent labels.

**Example:**
```python
INTENT_LABELS = [
    "urgency", "authority", "financial_request", "remote_access",
    "reward_lottery", "impersonation", "romance_grooming", "crypto"
]

VECTOR_TO_INTENTS = {
    "crypto_investment":        [0, 0, 1, 0, 0, 0, 0, 1],  # financial_request + crypto
    "romance_grooming":         [0, 0, 1, 0, 0, 0, 1, 0],  # financial_request + romance
    "tech_support":             [1, 1, 0, 1, 0, 0, 0, 0],  # urgency + authority + remote_access
    "government_impersonation": [1, 1, 1, 0, 0, 1, 0, 0],  # urgency + authority + financial + impersonation
    "lottery_reward":           [0, 0, 1, 0, 1, 0, 0, 0],  # financial_request + reward_lottery
    "phishing":                 [1, 1, 0, 0, 0, 1, 0, 0],  # urgency + authority + impersonation
    "remote_access":            [1, 0, 0, 1, 0, 0, 0, 0],  # urgency + remote_access
    "urgency_payment":          [1, 0, 1, 0, 0, 0, 0, 0],  # urgency + financial_request
    "safe":                     [0, 0, 0, 0, 0, 0, 0, 0],  # all zeros
}
```

Note: This mapping is approximate and should be reviewed. Some scam vectors activate multiple intents. The planner should decide on exact mappings.

### Pattern 3: Colab Checkpoint Resume Pattern

**What:** Robust checkpointing that survives Colab session disconnects.

**Example:**
```python
# Source: HuggingFace Trainer checkpointing + Colab Drive pattern
import os
import json
from google.colab import drive

DRIVE_CHECKPOINT_DIR = "/content/drive/MyDrive/canaryos_teacher"

def save_checkpoint(model, optimizer, epoch, metrics, drive_dir):
    """Save full training state to Google Drive."""
    checkpoint_dir = os.path.join(drive_dir, f"epoch_{epoch}")
    os.makedirs(checkpoint_dir, exist_ok=True)
    
    # Save model
    model.save_pretrained(checkpoint_dir)
    
    # Save optimizer state
    torch.save(optimizer.state_dict(), os.path.join(checkpoint_dir, "optimizer.pt"))
    
    # Save training state metadata
    state = {
        "epoch": epoch,
        "metrics": metrics,
        "completed": True,
    }
    with open(os.path.join(drive_dir, "training_state.json"), "w") as f:
        json.dump(state, f, indent=2)
    print(f"Checkpoint saved to {checkpoint_dir}")

def load_latest_checkpoint(drive_dir):
    """Resume from latest completed epoch."""
    state_path = os.path.join(drive_dir, "training_state.json")
    if not os.path.exists(state_path):
        return None, 0
    with open(state_path) as f:
        state = json.load(f)
    epoch = state["epoch"]
    checkpoint_dir = os.path.join(drive_dir, f"epoch_{epoch}")
    return checkpoint_dir, epoch
```

### Pattern 4: Soft Label Pre-Computation

**What:** After training, run teacher inference on full training set and save temperature-scaled logits to disk.

**Example:**
```python
# Source: Knowledge distillation standard practice
import torch
import torch.nn.functional as F

def precompute_soft_labels(model, dataloader, temperatures, device, save_dir):
    """Pre-compute soft labels at multiple temperatures.
    
    Saves both binary logits and intent logits at each temperature.
    """
    model.eval()
    
    for T in temperatures:
        all_binary_soft = []
        all_intent_soft = []
        all_indices = []
        
        with torch.no_grad():
            for batch_idx, batch in enumerate(dataloader):
                input_ids = batch["input_ids"].to(device)
                attention_mask = batch["attention_mask"].to(device)
                
                outputs = model(input_ids=input_ids, attention_mask=attention_mask)
                
                # Temperature-scaled softmax for binary head
                binary_soft = F.softmax(outputs["binary_logits"] / T, dim=-1)
                
                # Temperature-scaled sigmoid for intent head
                intent_soft = torch.sigmoid(outputs["intent_logits"] / T)
                
                all_binary_soft.append(binary_soft.cpu())
                all_intent_soft.append(intent_soft.cpu())
        
        result = {
            "binary_soft_labels": torch.cat(all_binary_soft, dim=0),
            "intent_soft_labels": torch.cat(all_intent_soft, dim=0),
            "temperature": T,
        }
        
        save_path = os.path.join(save_dir, f"teacher_soft_labels_T{T}.pt")
        torch.save(result, save_path)
        print(f"Saved soft labels at T={T} to {save_path}")
        print(f"  Binary shape: {result['binary_soft_labels'].shape}")
        print(f"  Intent shape: {result['intent_soft_labels'].shape}")
```

### Pattern 5: ECE Calibration Measurement

**What:** Measure Expected Calibration Error before and after temperature scaling.

**Example:**
```python
# Source: torchmetrics CalibrationError docs
from torchmetrics.classification import BinaryCalibrationError

def measure_ece(model, dataloader, device, n_bins=15):
    """Measure ECE on the binary head predictions."""
    ece_metric = BinaryCalibrationError(n_bins=n_bins, norm="l1")
    model.eval()
    
    with torch.no_grad():
        for batch in dataloader:
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            labels = batch["labels"].to(device)
            
            outputs = model(input_ids=input_ids, attention_mask=attention_mask)
            probs = F.softmax(outputs["binary_logits"], dim=-1)[:, 1]  # scam prob
            
            ece_metric.update(probs.cpu(), labels.cpu())
    
    return ece_metric.compute().item()

def find_optimal_temperature(model, cal_dataloader, device):
    """Find temperature that minimizes ECE on calibration set."""
    best_t, best_ece = 1.0, float("inf")
    
    for t in [x * 0.1 for x in range(5, 51)]:  # 0.5 to 5.0
        ece_metric = BinaryCalibrationError(n_bins=15, norm="l1")
        model.eval()
        
        with torch.no_grad():
            for batch in cal_dataloader:
                input_ids = batch["input_ids"].to(device)
                attention_mask = batch["attention_mask"].to(device)
                labels = batch["labels"].to(device)
                
                outputs = model(input_ids=input_ids, attention_mask=attention_mask)
                probs = F.softmax(outputs["binary_logits"] / t, dim=-1)[:, 1]
                ece_metric.update(probs.cpu(), labels.cpu())
        
        ece = ece_metric.compute().item()
        if ece < best_ece:
            best_ece = ece
            best_t = t
    
    return best_t, best_ece
```

### Anti-Patterns to Avoid

- **Using `DebertaV2ForSequenceClassification` for dual-head:** This class wraps the model with a single classification head. You must use `DebertaV2Model` (raw encoder) and add custom heads to support both binary and multi-label simultaneously.
- **Training without gradient checkpointing on T4:** DeBERTa-v3-large with batch size 4 and seq length 128 is close to the T4 memory limit. Without gradient checkpointing, activations alone can OOM on longer sequences.
- **Saving checkpoints only locally in Colab `/content/`:** Colab wipes `/content/` on session timeout. All checkpoints MUST go to Google Drive.
- **Using the same temperature for all soft label components:** Binary head (2-class softmax) and intent head (8-class sigmoid) respond differently to temperature. Pre-computing at T={2,3,4,5} lets Phase 4 select independently.
- **Forgetting `sentencepiece` dependency:** DeBERTa-v3 uses a SentencePiece tokenizer (128K vocab), not WordPiece. Missing `sentencepiece` package causes a silent fallback to slow tokenizer or outright error.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Training loop with checkpointing | Custom epoch loop with manual optimizer steps | HuggingFace `Trainer` with custom `compute_loss` | Trainer handles gradient accumulation, FP16 scaling, checkpoint saving, logging, and resume automatically |
| ECE computation | Manual binning + calibration error computation | `torchmetrics.classification.BinaryCalibrationError` | Correct binning with edge cases (empty bins, boundary handling) is error-prone |
| Learning rate scheduling | Manual LR decay | `Trainer` with `warmup_ratio` and `cosine` scheduler | Standard scheduler implementations are correct; manual ones often have bugs at boundary conditions |
| Multi-GPU or multi-TPU distribution | Custom `nn.DataParallel` | `accelerate` via Trainer | Handles device placement, gradient sync, and mixed precision automatically |

**Key insight:** Phase 3 is a training-heavy phase where correctness of the training loop matters more than flexibility. The Trainer API eliminates most training loop bugs while still allowing custom loss computation for the dual-head architecture.

## Common Pitfalls

### Pitfall 1: Teacher Inherits Generalization Problem (from PITFALLS.md 2.1)
**What goes wrong:** Teacher achieves F1 > 0.95 on synthetic test set but fails the F1 > 0.80 holdout gate. The teacher learned the LLM's output style, not real scam patterns.
**Why it happens:** Synthetic training data and synthetic test data share the same generator distribution. High synthetic F1 is a necessary but insufficient condition.
**How to avoid:** The holdout gate (D-06) is specifically designed to catch this. The per-vector error breakdown cell (D-14) identifies which scam vectors the teacher fails on, distinguishing "training config issue" from "data quality issue."
**Warning signs:** F1 > 0.98 on synthetic test but < 0.75 on holdout. Large gap between synthetic and holdout precision/recall.

### Pitfall 2: Over-Confident Teacher Soft Labels (from PITFALLS.md 2.2)
**What goes wrong:** Fine-tuned DeBERTa produces near-one-hot outputs (e.g., [0.001, 0.999]). At T=1, soft labels carry no inter-class information. Distillation degrades to hard-label training.
**Why it happens:** BERT-family models fine-tuned on binary tasks push logits to extreme values quickly. The binary classification task has only 2 classes, making overconfidence especially severe.
**How to avoid:** D-09 pre-computes at T={2,3,4,5} specifically to address this. D-11 measures ECE before and after calibration to quantify the overconfidence.
**Warning signs:** ECE > 0.10 before calibration. Mean max-probability > 0.98 on the calibration set.

### Pitfall 3: Colab Session Timeout During Training
**What goes wrong:** Training takes 3-5 hours on T4. Free Colab disconnects after ~90 min idle or 12 hours total. Training progress is lost if checkpoints are only in `/content/`.
**Why it happens:** Colab free tier is designed for interactive use, not long-running training.
**How to avoid:** D-02 and D-04 mandate aggressive checkpointing to Google Drive every epoch. The resume pattern (Pattern 3 above) ensures training can continue from any checkpoint on a new session.
**Warning signs:** N/A -- this WILL happen. The notebook must handle it by design.

### Pitfall 4: T4 OOM with DeBERTa-v3-large
**What goes wrong:** Even with batch size 4, DeBERTa-v3-large can OOM on T4 if gradient checkpointing is disabled or sequence length exceeds 128.
**Why it happens:** DeBERTa-v3-large has 435M parameters. With Adam optimizer (2x state), FP16 model copy, and activations, peak memory can exceed 15GB.
**How to avoid:** Enable gradient checkpointing (`model.gradient_checkpointing_enable()`). Use max_length=128 (scam texts are typically short). Use FP16 mixed precision. Set `per_device_train_batch_size=4` with `gradient_accumulation_steps=4`.
**Warning signs:** CUDA OOM error during first training step. Solution: reduce batch size to 2, increase gradient accumulation to 8.

### Pitfall 5: SentencePiece Tokenizer vs WordPiece Confusion
**What goes wrong:** Developer assumes DeBERTa uses the same WordPiece tokenizer as BERT/MobileBERT. Code that works with MobileBERT tokenizer fails silently with DeBERTa's SentencePiece tokenizer.
**Why it happens:** DeBERTa-v3 uses `DebertaV2Tokenizer` (SentencePiece, 128K vocab) while MobileBERT uses WordPiece (30,522 vocab). The tokenizer is ONLY used server-side for teacher training -- it never affects the device-side pipeline.
**How to avoid:** Always load tokenizer via `AutoTokenizer.from_pretrained("microsoft/deberta-v3-large")`. Never assume BERT-base vocab. Install `sentencepiece` package.
**Warning signs:** ImportError for sentencepiece. Tokenizer falls back to slow Python implementation.

### Pitfall 6: Intent Label Noise from Approximate Vector-to-Intent Mapping
**What goes wrong:** The mapping from `vector` field (e.g., "crypto_investment") to 8 binary intent labels is approximate. Some vectors activate intents that their samples don't actually exhibit (e.g., not all crypto scams use urgency).
**Why it happens:** The training data has `vector` labels but not fine-grained intent labels. The mapping is a heuristic.
**How to avoid:** Since intent head quality does NOT block Phase 4 (D-06), accept this as a known limitation. The intent head serves to generate soft labels for Phase 5 where per-label threshold tuning can correct for noisy training labels. Log per-label metrics but do not gate on them.
**Warning signs:** Very low precision on specific intent labels. High false positive rate for "urgency" (activated by many vectors).

## Code Examples

### Colab Setup Cell
```python
# Source: Colab best practices + HuggingFace docs
# Cell 1: Environment Setup
!pip install -q transformers>=4.48.0 datasets>=3.0.0 accelerate>=0.25.0 \
    evaluate>=0.4.0 torchmetrics>=1.2.0 sentencepiece

import torch
print(f"PyTorch: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"GPU: {torch.cuda.get_device_name(0)}")
    print(f"VRAM: {torch.cuda.get_device_properties(0).total_mem / 1024**3:.1f} GB")

# Mount Google Drive for checkpoint persistence
from google.colab import drive
drive.mount("/content/drive")

import os
CHECKPOINT_DIR = "/content/drive/MyDrive/canaryos_teacher"
os.makedirs(CHECKPOINT_DIR, exist_ok=True)
```

### Data Loading Pattern
```python
# Source: Phase 1 data format (verified from synthetic_scam_v1.jsonl)
import json
from torch.utils.data import Dataset

class ScamDataset(Dataset):
    def __init__(self, jsonl_path, tokenizer, max_length=128, split=None):
        self.samples = []
        with open(jsonl_path) as f:
            for line in f:
                sample = json.loads(line)
                if split is None or sample.get("split") == split:
                    self.samples.append(sample)
        self.tokenizer = tokenizer
        self.max_length = max_length
    
    def __len__(self):
        return len(self.samples)
    
    def __getitem__(self, idx):
        sample = self.samples[idx]
        encoding = self.tokenizer(
            sample["text"],
            max_length=self.max_length,
            padding="max_length",
            truncation=True,
            return_tensors="pt",
        )
        
        # Binary label: scam=1, safe=0
        label = 1 if sample["label"] == "scam" else 0
        
        # Intent labels: 8-dim binary vector from vector field
        intent = VECTOR_TO_INTENTS.get(sample["vector"], [0]*8)
        
        return {
            "input_ids": encoding["input_ids"].squeeze(0),
            "attention_mask": encoding["attention_mask"].squeeze(0),
            "labels": torch.tensor(label, dtype=torch.long),
            "intent_labels": torch.tensor(intent, dtype=torch.float),
        }
```

### Recommended Hyperparameters for DeBERTa-v3-large

```python
# Source: Microsoft DeBERTa official fine-tuning example (MNLI) + community patterns
# Adapted for T4 16GB VRAM constraint

# === T4 Configuration (Default) ===
T4_CONFIG = {
    "per_device_train_batch_size": 4,
    "gradient_accumulation_steps": 4,      # effective batch = 16
    "learning_rate": 8e-6,                 # DeBERTa-v3-large sweet spot: 5e-6 to 1e-5
    "num_train_epochs": 3,                 # 2-3 epochs to avoid overfitting
    "warmup_ratio": 0.1,                   # ~10% warmup steps
    "weight_decay": 0.01,                  # standard for DeBERTa
    "lr_scheduler_type": "cosine",         # cosine decay recommended
    "fp16": True,                          # required for T4 memory
    "gradient_checkpointing": True,        # required for T4 memory
    "max_grad_norm": 1.0,                  # gradient clipping
    "max_seq_length": 128,                 # scam texts are short
    "eval_strategy": "epoch",
    "save_strategy": "epoch",
    "save_total_limit": None,              # keep ALL checkpoints (D-04)
    "load_best_model_at_end": True,
    "metric_for_best_model": "f1",
}

# === A100 Configuration (Migration) ===
A100_CONFIG = {
    "per_device_train_batch_size": 16,
    "gradient_accumulation_steps": 1,      # effective batch = 16 (same)
    "learning_rate": 8e-6,                 # unchanged
    "num_train_epochs": 3,                 # unchanged
    "warmup_ratio": 0.1,
    "weight_decay": 0.01,
    "lr_scheduler_type": "cosine",
    "fp16": True,                          # A100 also supports bf16
    "gradient_checkpointing": False,       # not needed with 40GB
    "max_grad_norm": 1.0,
    "max_seq_length": 128,
    "eval_strategy": "epoch",
    "save_strategy": "epoch",
    "save_total_limit": None,
    "load_best_model_at_end": True,
    "metric_for_best_model": "f1",
}
```

### Retry Hyperparameter Configurations (D-12)
```python
# Retry 1: Lower LR + more epochs
RETRY_1 = {
    **T4_CONFIG,
    "learning_rate": 3e-6,        # halved from default
    "num_train_epochs": 5,        # more epochs at lower LR
    "warmup_ratio": 0.15,         # slightly longer warmup
}

# Retry 2: Class weighting for imbalanced holdout
RETRY_2 = {
    **T4_CONFIG,
    "learning_rate": 6e-6,        # between default and retry 1
    "num_train_epochs": 4,
    # Apply class weights in loss function:
    # weight scam class higher since holdout has 108 scam vs 94 safe
    # but training data has 8,230 scam vs 10,123 safe (scam is minority in training)
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| DeBERTa PyTorch-only | TFDebertaV2 classes now exist in transformers but are poorly tested and have known TPU issues | ~2023 | For this project: use PyTorch only. TF implementation exists but is not reliable for DeBERTa-v3 specifically |
| Optimum TFLite export via CLI | Optimum v2.0+ removed TFLite export entirely | Oct 2025 | Does not affect Phase 3 (teacher never exports to TFLite), but confirms PyTorch-only path for teacher |
| Single-temperature distillation (T=4) | Multi-temperature pre-computation | Standard practice | D-09 pre-computes at 4 temperatures, letting Phase 4 select optimal T empirically |
| Online distillation (teacher + student co-loaded) | Offline pre-computed soft labels | Common when GPU memory is limited | D-08 decouples phases; critical for T4 where 435M teacher + student cannot co-exist |
| `numpy<2.0` constraint | numpy 2.4.3 works with latest TF and onnxruntime | Per STATE.md | No longer a constraint for Phase 3 (PyTorch-only phase) |

**Deprecated/outdated:**
- STACK.md recommendation of `torch` "not in existing stack" is outdated. Phase 2 established PyTorch as the primary training framework (D-01). Phase 3 continues this.
- STACK.md recommendation to avoid `accelerate` is outdated. HuggingFace Trainer requires accelerate for GPU training; it is pre-installed in Colab.
- STACK.md listed `numpy<2.0` as critical. Per STATE.md, numpy 2.4.3 is now compatible. For Phase 3, numpy version is not critical since training is PyTorch-only.

## Dataset Inventory

| Dataset | Path | Samples | Purpose in Phase 3 |
|---------|------|---------|---------------------|
| Synthetic train | `research/data/synthetic_scam_v1.jsonl` (split=train) | 18,353 | Teacher training set |
| Synthetic val | `research/data/synthetic_scam_v1.jsonl` (split=val) | 2,294 | Validation during training + calibration set source |
| Synthetic test | `research/data/test_split.jsonl` | 2,295 | Internal quality bar: F1 > 0.95 |
| Real-world holdout | `research/data/holdout_realworld.jsonl` | 202 (108 scam, 94 safe) | Hard gate: F1 > 0.80 |
| Soft labels output | `research/data/teacher_soft_labels_T{N}.pt` | 18,353 each | Phase 4 input (pre-computed at end) |

**Vector distribution in holdout (critical for per-vector error analysis):**
| Vector | Count | Notes |
|--------|-------|-------|
| safe | 94 | |
| phishing | 38 | Largest scam vector in holdout |
| lottery_reward | 23 | |
| romance_grooming | 10 | Very small sample |
| government_impersonation | 10 | Very small sample |
| urgency_payment | 10 | Very small sample |
| crypto_investment | 7 | Very small sample |
| tech_support | 5 | Smallest -- per-vector F1 unreliable |
| remote_access | 5 | Smallest -- per-vector F1 unreliable |

**Implication:** Per-vector metrics on holdout are unreliable for vectors with fewer than 10 samples. This validates D-06's decision to NOT gate on intent quality.

## Training Time Estimates

| Configuration | Epoch Time (est.) | Total 3 Epochs | Notes |
|---------------|-------------------|-----------------|-------|
| T4, batch 4, grad accum 4, FP16 | ~45-60 min | ~2.5-3 hours | With gradient checkpointing (20-30% overhead) |
| A100, batch 16, no grad checkpointing | ~15-20 min | ~45-60 min | 3-4x faster than T4 |

**Soft label pre-computation:** ~20-30 min on T4 (single forward pass on 18,353 samples, 4 temperatures).

**Total Phase 3 GPU time (happy path):** ~3.5-4 hours on T4 (training + eval + soft labels).
**Total Phase 3 GPU time (with 2 retries):** ~10-12 hours on T4 across multiple sessions.

This means the happy path fits within a single Colab free tier session (12 hour limit) but will require at least 2-3 session reconnects due to the 90-minute idle timeout. Retry scenarios will span multiple days of free tier usage.

## Notebook Cell Structure (Recommended)

```
Cell 1:  Environment setup + drive mount
Cell 2:  Configuration (T4/A100 toggle, hyperparameters, paths)
Cell 3:  Data loading + dataset class + label mapping
Cell 4:  Model definition (DualHeadDeBERTaTeacher class)
Cell 5:  Custom Trainer (compute_loss override for dual-head)
Cell 6:  Resume-from-checkpoint logic
Cell 7:  Training execution
Cell 8:  Synthetic test evaluation (F1 > 0.95 check)
Cell 9:  Holdout evaluation (F1 > 0.80 gate) + per-vector breakdown
Cell 10: ECE measurement (before calibration)
Cell 11: Temperature scaling + ECE after calibration
Cell 12: Soft label pre-computation (T=2,3,4,5)
Cell 13: Save final checkpoint to research/models/teacher_finetuned/
Cell 14: T4-to-A100 migration guide (markdown + code)
Cell 15: Summary / gate check (pass/fail report)
```

## T4-to-A100 Migration Checklist

Per D-03, the notebook must include a comprehensive migration section. Key changes:

| Setting | T4 Value | A100 Value | Why |
|---------|----------|------------|-----|
| `per_device_train_batch_size` | 4 | 16 | A100 has 40GB VRAM |
| `gradient_accumulation_steps` | 4 | 1 | Effective batch stays 16 |
| `gradient_checkpointing` | True | False | Not needed with 40GB |
| `fp16` | True | True (or bf16=True) | A100 supports bf16 natively |

Migration steps:
1. Mount Google Drive in new A100 session
2. Run `load_latest_checkpoint()` to find last completed epoch
3. Update config dict to A100 values
4. Resume training from checkpoint -- Trainer handles epoch/step counting

## Open Questions

1. **Exact loss weighting for binary vs intent head**
   - What we know: Binary head is the hard gate; intent head is informational
   - What's unclear: Optimal ratio (0.7/0.3 is a starting point based on typical multi-task patterns)
   - Recommendation: Start with 0.7/0.3 (binary/intent). If intent head significantly degrades binary F1, increase binary weight to 0.9/0.1

2. **Calibration set construction**
   - What we know: D-11 requires ECE measurement on a held-out calibration set
   - What's unclear: Whether to carve from val split or use a portion of the holdout
   - Recommendation: Use 20% of val split (459 samples) as calibration set. Do NOT use any holdout samples for calibration -- the holdout must remain untouched for the F1 gate.

3. **Vector-to-intent label mapping precision**
   - What we know: Mapping from scam vector to 8 intent labels is heuristic
   - What's unclear: Whether individual samples within a vector exhibit all mapped intents
   - Recommendation: Accept approximate mapping. Intent head is not a hard gate. Phase 5 will add proper multi-label training with per-label threshold tuning.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual validation cells in Colab notebook (no pytest -- Colab environment) |
| Config file | N/A (notebook-internal) |
| Quick run command | Run Cell 9 (holdout evaluation) |
| Full suite command | Run Cells 8-12 (synthetic test + holdout + ECE + soft labels) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEXT-04-T1 | Teacher F1 > 0.95 on synthetic test | notebook cell | Cell 8: `assert synthetic_f1 > 0.95` | Wave 0 |
| TEXT-04-T2 | Teacher F1 > 0.80 on real-world holdout | notebook cell | Cell 9: `assert holdout_f1 > 0.80` | Wave 0 |
| TEXT-04-T3 | Teacher checkpoint saved to research/models/teacher_finetuned/ | notebook cell | Cell 13: `assert os.path.exists(...)` | Wave 0 |
| TEXT-04-T4 | ECE measured before and after calibration | notebook cell | Cells 10-11: print ECE values | Wave 0 |
| TEXT-04-T5 | Soft labels at T={2,3,4,5} saved | notebook cell | Cell 12: verify 4 .pt files exist | Wave 0 |

### Sampling Rate
- **Per training attempt:** Run holdout eval cell (Cell 9) + per-vector breakdown (Cell 9)
- **After all training:** Run full Cells 8-12 suite
- **Phase gate:** All assertion cells green before proceeding to Phase 4

### Wave 0 Gaps
- [x] No separate test infrastructure needed -- all validation is notebook-internal
- [ ] Notebook `research/notebooks/teacher_finetuning.ipynb` -- contains all validation cells
- [ ] Soft label output verification script (optional, could be a cell in the notebook)

## Sources

### Primary (HIGH confidence)
- [microsoft/deberta-v3-large model card](https://huggingface.co/microsoft/deberta-v3-large) -- architecture specs (24 layers, 1024 hidden, 304M backbone + 131M embedding), fine-tuning hyperparameters (lr=6e-6, batch=8, 2 epochs for MNLI)
- [HuggingFace DeBERTa-v2 docs](https://huggingface.co/docs/transformers/model_doc/deberta-v2) -- model classes (PyTorch only for v3), tokenizer (SentencePiece, 128K vocab)
- [DeBERTa-v3-large memory requirements](https://huggingface.co/microsoft/deberta-v3-large/discussions/5) -- ~3.23GB VRAM for training with Adam in FP16
- [HuggingFace GPU training guide](https://huggingface.co/docs/transformers/en/perf_train_gpu_one) -- gradient checkpointing, gradient accumulation, mixed precision patterns
- [PyTorch Knowledge Distillation Tutorial](https://docs.pytorch.org/tutorials/beginner/knowledge_distillation_tutorial.html) -- soft label computation, temperature scaling, KL divergence loss
- [torchmetrics CalibrationError docs](https://lightning.ai/docs/torchmetrics/stable/classification/calibration_error.html) -- BinaryCalibrationError API, ECE computation

### Secondary (MEDIUM confidence)
- [DeBERTaV3 ICLR 2023 paper](https://arxiv.org/pdf/2111.09543) -- ELECTRA-style pre-training, disentangled attention, recommended hyperparameter ranges (5e-6 to 1e-5)
- [Understanding Model Calibration ICLR Blogpost 2025](https://iclr-blogposts.github.io/2025/blog/calibration/) -- ECE step-by-step, temperature scaling effectiveness
- [PITFALLS.md Pitfall 2.1/2.2](../../research/PITFALLS.md) -- teacher generalization problem and over-confident soft labels (project-specific research, validated against literature)
- [Colab FAQ](https://research.google.com/colaboratory/faq.html) -- session limits (12h max, 90min idle disconnect)

### Tertiary (LOW confidence)
- T4 training time estimates: extrapolated from BERT-large benchmarks and DeBERTa-v3-large parameter count. Actual training time depends on data loading speed and Drive I/O.
- Exact memory usage during training: 3.23GB base + activations is theoretical. Actual peak depends on sequence length distribution and batch composition.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- DeBERTa-v3-large is well-documented; PyTorch training path is established in Phases 1-2; Colab T4 is a common training target
- Architecture: HIGH -- dual-head pattern is standard multi-task learning; custom model class pattern is well-documented in HuggingFace ecosystem
- Hyperparameters: MEDIUM -- recommended ranges from official docs and community, but optimal values are task-specific and require experimentation
- Training time estimates: LOW -- extrapolated from similar model sizes, not measured on this specific dataset/hardware combination
- Pitfalls: HIGH -- Pitfalls 2.1 and 2.2 from PITFALLS.md are directly validated by the decision to gate on holdout F1 and pre-compute at multiple temperatures

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (30 days -- stable domain, no fast-moving dependencies)
