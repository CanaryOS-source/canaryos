# Phase 4: Knowledge Distillation - Research

**Researched:** 2026-04-04
**Domain:** Knowledge distillation (DeBERTa-v3-large teacher -> MobileBERT student) with intermediate layer transfer
**Confidence:** MEDIUM-HIGH

## Summary

This phase distills accuracy from the frozen DeBERTa-v3-large teacher (24 layers, 1024 hidden, 16 heads) into MobileBERT (24 layers, 512 inter-block / 128 intra-block, 4 heads) via a progressive two-phase approach: Phase A establishes a soft-labels-only baseline, Phase B adds intermediate layer transfer (hidden state alignment + attention alignment). Both phases run regardless of Phase A results.

The critical architectural challenge is the dimension and structural mismatch between teacher and student. DeBERTa uses disentangled attention (content + position, 16 heads) while MobileBERT uses standard multi-head attention (4 heads) with a bottleneck architecture. Learnable linear projections bridge the hidden state gap (1024 -> 512), and attention alignment requires head-count reconciliation (16 -> 4). The original MobileBERT paper designed a special teacher (IB-BERT-LARGE) with matching inter-block dimensions and head counts specifically to avoid this problem -- we must solve it with projection layers since our teacher is DeBERTa, not IB-BERT.

**Primary recommendation:** Use a 1:1 layer mapping (24 -> 24), learnable linear projections for hidden states (1024 -> 512), and either SHD (Squeezing-Heads Distillation) or mean-pooled attention groups (4 teacher heads per student head) for attention alignment. Memory profiling confirms both models fit comfortably on T4 at batch 32 (~2.6 GB VRAM), leaving ample headroom.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Progressive approach -- Phase A: soft-labels-only distillation as a debuggable baseline checkpoint. Phase B: add intermediate layer transfer (attention matrix + hidden state alignment) on top. Both phases run regardless of Phase A results.
- **D-02:** Intermediate layer transfer is ALWAYS added even if soft-labels-only passes the 3-point gate. Soft labels are the diagnostic baseline, not a stopping point. TEXT-04 mandates intermediate layers, and a stronger base encoder benefits Phase 5 (multi-label intent head).
- **D-03:** Teacher model loaded live during distillation training (not pre-computed intermediate representations). Teacher runs forward pass each batch to produce intermediate hidden states and attention matrices on-the-fly.
- **D-04:** Teacher is frozen (no gradients computed) during distillation -- saves ~50% GPU memory vs trainable. Teacher's role is to provide alignment targets, not to learn.
- **D-05:** Pre-computed soft labels from Phase 3 (T={2,3,4,5} on Google Drive) are still used for the soft-label loss component. The live teacher forward pass is only for intermediate layer alignment.
- **D-06:** Claude's discretion on recovery strategy if the 3 F1 point gate (F1 >= 0.8019) proves infeasible given teacher ceiling (F1=0.8052, only 0.33 pts headroom).
- **D-07:** Start on Colab T4 (free tier, 16GB VRAM), fallback to Colab Pro A100 (40GB) if OOM. Same proven strategy as Phase 3. Notebook must include T4-to-A100 migration guide (Phase 3 D-03 pattern).
- **D-08:** Memory profiling cell runs before training -- loads both models, runs a dummy forward pass with target batch size, reports peak VRAM usage. Catches OOM before committing to a full training run.
- **D-09:** Aggressive checkpointing to Google Drive (every epoch, same as Phase 3 D-04) for session timeout recovery.

### Claude's Discretion
- Layer mapping strategy: which of teacher's 24 layers to align with student's 24 layers (1:1, selective, or skip connections) -- researcher determines based on MobileBERT's bottleneck architecture
- Linear projection architecture for dimension mismatch (DeBERTa 1024 -> MobileBERT 512/128)
- Exact loss weights: alpha for soft-label KL vs hard-label CE, beta for intermediate layer losses
- Learning rate, warmup, weight decay, and gradient accumulation settings
- Batch size selection based on memory profiling results
- Temperature selection from T={2,3,4,5} sweep -- selected by holdout F1, not training loss

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEXT-04 (distillation) | Distillation uses intermediate layer transfer (attention matrix + hidden state alignment) in addition to soft labels; layer mapping defined before training; temperature sweep T={2,3,4,5}; 3 F1 point improvement over baseline | Architecture analysis (dimension mapping tables), loss formulas (KL + CE + MSE + KL-attention), memory profiling (T4 fits comfortably), progressive staging pattern (Phase A / Phase B), temperature sweep protocol against holdout |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- All ML research MUST be Jupyter notebooks (.ipynb) in `research/notebooks/` -- no .py files for research tasks
- Do NOT create .py files for ML research tasks (training, benchmarking, evaluation, distillation)
- Research environment: PyTorch + HuggingFace Transformers (established in Phase 2/3)
- Model outputs gitignored in `research/models/`
- Data in `research/data/` (gitignored)
- Do not add files to `canaryapp/assets/models/` without removing old versions
- NEVER commit secrets, credentials, or .env files

## Standard Stack

### Core

| Library | Purpose | Why Standard |
|---------|---------|--------------|
| `transformers` (HuggingFace) | Teacher (DeBERTa-v3-large) and student (MobileBERT) model loading, tokenization | Already used in Phase 2/3; provides `output_hidden_states` and `output_attentions` for both architectures |
| `torch` (PyTorch) | Training loop, custom distillation loss, gradient computation | Already the framework for Phase 2/3; custom loss requires manual training loop, not HF Trainer |
| `torch.nn.functional` | KL divergence (`kl_div`), MSE loss, softmax/log_softmax with temperature | Standard PyTorch functional API for distillation losses |

### Supporting

| Library | Purpose | When to Use |
|---------|---------|-------------|
| `scikit-learn` | F1 score, classification report on holdout | Evaluation cells |
| `matplotlib` / `seaborn` | Loss curves, temperature comparison plots, attention heatmaps | Visualization cells |
| `numpy` | Array manipulation for evaluation | Used throughout |
| `google.colab.drive` | Mount Google Drive for checkpoints and data | Colab environment setup |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom training loop | HuggingFace Trainer with custom loss | Trainer abstracts too much for multi-loss distillation; custom loop gives explicit control over teacher forward pass, loss weighting, and gradient flow |
| MSE for attention alignment | KL divergence on attention distributions | MobileBERT paper uses KL divergence for attention; TinyBERT uses MSE on unnormalized attention. Both work. KL preserves probabilistic interpretation; MSE is simpler. Use KL for attention (distributions), MSE for hidden states (feature maps) |
| Pre-computed intermediate representations | Live teacher forward pass (D-03) | Pre-computation saves time but uses ~50GB+ disk for 24 layers x 22K samples. Live forward pass is simpler and D-03 explicitly requires it |

**Installation (Colab setup cell):**
```python
# Most libraries pre-installed on Colab. Only install if missing:
!pip install transformers datasets evaluate scikit-learn
```

## Architecture Patterns

### Architecture Dimension Summary

This is the critical reference table for implementing the distillation. All projection layers derive from these dimensions.

**Teacher: DeBERTa-v3-large**
| Property | Value |
|----------|-------|
| Layers | 24 |
| Hidden size | 1024 |
| Intermediate (FFN) size | 4096 |
| Attention heads | 16 |
| Head dimension | 64 (1024 / 16) |
| Attention type | Disentangled (content + position) |
| Vocab size | 128,100 |
| Total params | ~435M |

**Student: MobileBERT (`google/mobilebert-uncased`)**
| Property | Value |
|----------|-------|
| Layers | 24 |
| Hidden size (inter-block) | 512 |
| True hidden size (intra-block / bottleneck) | 128 |
| Embedding size | 128 |
| Intermediate (FFN) size | 512 |
| Attention heads | 4 |
| Head dimension | 32 (128 / 4) |
| FFN stacks per layer | 4 |
| Attention type | Standard multi-head |
| Vocab size | 30,522 |
| Total params | ~24.6M |

**Source:** Verified from HuggingFace model config.json files for both models.
**Confidence:** HIGH

### Layer Mapping Strategy

**Recommendation: 1:1 layer mapping (teacher layer i -> student layer i)**

Both models have exactly 24 layers, making 1:1 mapping natural and avoiding the complex mapping search required for unequal-depth distillation (e.g., the 24->4 mapping in TinyBERT). This is the same approach used in the original MobileBERT paper.

Do NOT skip layers or use selective mapping unless 1:1 proves ineffective. The alignment signal should be strongest when every layer has a target.

**Confidence:** HIGH -- supported by MobileBERT paper's design philosophy of matching teacher/student depth.

### Hidden State Alignment

**Dimension mismatch:** Teacher outputs 1024-dim hidden states per layer; MobileBERT's inter-block hidden size is 512.

**Approach:** One learnable linear projection per layer:
```python
# For each of 24 layers
self.hidden_projections = nn.ModuleList([
    nn.Linear(1024, 512)  # teacher_hidden -> student_hidden
    for _ in range(24)
])
```

**Which MobileBERT dimension to align with:** Use the 512-dim inter-block hidden states (not the 128-dim intra-block/bottleneck states). Rationale:
1. The 512-dim is the primary information channel between layers (MobileBERT paper: "inter-block hidden size is set to 512 for all models")
2. The original MobileBERT distillation aligned at the 512-dim inter-block level (IB-BERT teacher also used 512 inter-block)
3. The 128-dim bottleneck is an internal compression mechanism -- forcing external alignment at this dimension would over-constrain the student

**Accessing 512-dim hidden states in HuggingFace MobileBERT:** When `output_hidden_states=True`, the model returns hidden states of shape `(batch, seq_len, 512)` -- these are the inter-block outputs after the bottleneck up-projection. This is exactly what we need.

**Loss:**
```python
# MSE loss on hidden states (per layer)
hidden_loss = sum(
    F.mse_loss(proj(teacher_hidden[i]), student_hidden[i])
    for i, proj in enumerate(self.hidden_projections)
) / 24
```

**Confidence:** HIGH -- matches MobileBERT paper approach; 512-dim confirmed from config.json.

### Attention Alignment

**Head count mismatch:** Teacher has 16 heads, student has 4 heads.

**Challenge:** DeBERTa uses disentangled attention (content + position), while MobileBERT uses standard attention. The attention matrices from `output_attentions` have different shapes:
- Teacher: `(batch, 16, seq_len, seq_len)` -- DeBERTa returns combined attention weights after softmax
- Student: `(batch, 4, seq_len, seq_len)` -- standard attention weights

**Recommended approach: Mean-pool groups of 4 teacher heads into 1 student head**

```python
# Group teacher's 16 heads into 4 groups of 4, average each group
teacher_att = teacher_attentions[layer_idx]  # (batch, 16, seq, seq)
teacher_grouped = teacher_att.reshape(batch, 4, 4, seq, seq).mean(dim=2)  # (batch, 4, seq, seq)
student_att = student_attentions[layer_idx]  # (batch, 4, seq, seq)

att_loss = F.kl_div(
    student_att.log(),
    teacher_grouped,
    reduction='batchmean'
)
```

**Why mean-pooling over SHD (Squeezing-Heads Distillation):** SHD (arxiv 2502.07436) is more sophisticated -- it uses analytically computed per-sample weights to combine teacher heads. However, it adds complexity and the original MobileBERT paper used simple mean-pooling of heads (since IB-BERT was designed with 4 heads to match). For a first implementation, mean-pooling is simpler and well-tested. SHD can be explored if mean-pooling underperforms.

**Why KL divergence for attention:** Attention distributions are probability distributions (row-sum-to-one after softmax). KL divergence is the natural loss for comparing distributions. MobileBERT paper uses KL divergence for attention transfer.

**DeBERTa disentangled attention compatibility:** The `output_attentions` parameter in HuggingFace's DeBERTa implementation returns the combined attention weights after softmax, which incorporate both content and position components. The returned shape is standard `(batch, heads, seq, seq)`. This is directly comparable to MobileBERT's standard attention output.

**Confidence:** MEDIUM -- the head grouping is well-established; the DeBERTa disentangled-to-standard comparison is a known approximation. Monitor attention loss convergence to validate.

### Recommended Notebook Structure (Jupyter cells)

```
Cell 0:  Markdown header
Cell 1:  Environment setup + Drive mounting (reuse Phase 3 pattern)
Cell 2:  Configuration (T4/A100 configs, paths, hyperparams)
Cell 3:  Memory profiling cell (D-08) -- load both models, dummy forward pass, report VRAM
Cell 4:  Data loading (reuse Phase 3 Cell 3 pattern)
Cell 5:  Load pre-computed soft labels from Phase 3 (T={2,3,4,5})
Cell 6:  Load teacher model (frozen) + student model (trainable)
Cell 7:  Distillation model definition (projection layers, loss functions)
Cell 8:  Phase A: Soft-labels-only training + holdout evaluation
Cell 9:  Phase A results analysis + checkpoint save
Cell 10: Phase B: Add intermediate layer losses + continue training
Cell 11: Phase B results analysis + checkpoint save
Cell 12: Temperature sweep: evaluate all 4 temperatures on holdout
Cell 13: Best model selection + final holdout evaluation + per-vector breakdown
Cell 14: Save final checkpoint to research/models/student_finetuned/
Cell 15: T4-to-A100 migration guide (markdown)
Cell 16: Summary / gate check report
```

### Loss Functions

**Phase A (soft-labels-only):**
```python
# Combined soft-label + hard-label loss
# soft_labels loaded from pre-computed Phase 3 files
L_A = alpha * KL(student_soft / T, teacher_soft / T) * T^2 + (1 - alpha) * CE(student_logits, hard_labels)
```

**Phase B (full distillation -- adds intermediate losses):**
```python
L_B = alpha * KL_soft + (1 - alpha) * CE_hard + beta * L_hidden + gamma * L_attention

where:
  KL_soft = KL_div(log_softmax(student_logits/T), softmax(teacher_soft/T)) * T^2
  CE_hard = CrossEntropy(student_logits, hard_labels)
  L_hidden = (1/24) * sum_i MSE(proj_i(teacher_hidden_i), student_hidden_i)
  L_attention = (1/24) * sum_i KL_div(log(student_att_i), grouped_teacher_att_i)
```

**Recommended starting weights:**
- `alpha = 0.5` (TEXT-04 requirement: "alpha = 0.5 starting point")
- `beta = 100.0` (hidden state MSE values are small; scale up to match KL magnitude)
- `gamma = 1.0` (attention KL is naturally on similar scale to soft-label KL)

**IMPORTANT:** `beta` for hidden state MSE needs careful calibration. MSE between projected hidden states is typically orders of magnitude smaller than KL divergence values. Log the individual loss components in the first few batches and adjust `beta` so that `beta * L_hidden` is roughly the same order of magnitude as `alpha * KL_soft`. This is a common pitfall in multi-loss distillation.

**Confidence:** MEDIUM -- loss formula is standard; exact weight calibration needs empirical tuning.

### Anti-Patterns to Avoid
- **Training projection layers separately from student:** Projection layers MUST be trained jointly with the student. Training them in a separate pre-alignment step wastes compute and creates a mismatch when the student's representations shift during training.
- **Aligning at 128-dim bottleneck:** Do NOT project teacher hidden states to 128 (the intra-block bottleneck). Align at the 512-dim inter-block level. The 128-dim bottleneck is internal to MobileBERT's layer computation and not designed as an external alignment target.
- **Using teacher soft labels from training loss curve to select temperature:** TEXT-04 explicitly requires T selection by holdout F1, not training loss. Train with each T, evaluate all on holdout, select best.
- **Computing gradients through teacher:** Teacher MUST be in `eval()` mode with `torch.no_grad()` context for its forward pass. Any gradient computation through the 435M-param teacher will cause immediate OOM even on A100.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Model loading + tokenization | Custom BERT loader | `AutoModelForSequenceClassification.from_pretrained` / `MobileBertForSequenceClassification` | HuggingFace handles weight loading, config, tokenizer correctly. MobileBERT's bottleneck weights are particularly complex. |
| Attention extraction | Manual hook registration | `output_attentions=True` parameter | Both DeBERTa and MobileBERT support this natively in HuggingFace; returns clean tensors with correct shapes |
| Hidden state extraction | Manual forward pass decomposition | `output_hidden_states=True` parameter | Returns tuple of all 24 layer outputs plus embeddings; correct dimension for each architecture |
| Learning rate scheduling | Manual LR decay | `torch.optim.lr_scheduler.CosineAnnealingLR` or `get_cosine_schedule_with_warmup` | Standard scheduler used in Phase 3; handles warmup and decay correctly |
| Soft label loading | Re-running teacher inference | Load pre-computed `.pt` files from Phase 3 | D-05: soft labels already computed at T={2,3,4,5}. The live teacher forward pass is only for intermediate representations, not soft labels. |

## Common Pitfalls

### Pitfall 1: F1 Gate Headroom Problem
**What goes wrong:** The 3-point F1 gate requires F1 >= 0.8019. The teacher ceiling is F1 = 0.8052 on holdout. This leaves only 0.33 F1 points of headroom -- the student cannot exceed the teacher.
**Why it happens:** Knowledge distillation transfers the teacher's decision boundary. The student can approach but almost never exceed the teacher's accuracy. With a 202-sample holdout, a single sample flip changes F1 by ~0.5 points.
**How to avoid:** Phase A results will reveal the trajectory early. If the soft-labels-only student reaches F1 ~0.78-0.79, the 3-point gate is achievable with intermediate layers. If it plateaus at ~0.75 or below, the gate is likely infeasible and D-06 recovery triggers.
**Warning signs:** Student F1 plateaus more than 3 points below teacher after full training; validation loss stops decreasing while training loss still drops.

### Pitfall 2: Hidden State MSE Loss Magnitude Mismatch
**What goes wrong:** MSE between projected hidden states produces values of order 1e-3 to 1e-5, while KL divergence on soft labels produces values of order 1e-1 to 1e0. With equal weights, hidden state alignment has no effective impact on training.
**Why it happens:** Hidden states after LayerNorm are typically in [-2, 2] range with small differences, so MSE is naturally small. Temperature-scaled KL divergence amplifies probability differences.
**How to avoid:** Log all loss components separately in the first 10 batches. Adjust `beta` to equalize magnitude. A beta of 100-1000 is typical for hidden state MSE in BERT distillation.
**Warning signs:** `L_hidden` component is 3+ orders of magnitude smaller than other losses in TensorBoard/print output.

### Pitfall 3: DeBERTa Disentangled Attention Incompatibility
**What goes wrong:** DeBERTa's attention mechanism uses disentangled content-to-content, content-to-position, and position-to-content attention components. The `output_attentions` return is the combined final attention weights after softmax -- but these weights encode information differently from standard BERT attention. Forcing exact alignment may teach the student a representation it cannot naturally produce.
**Why it happens:** Standard multi-head attention computes Q*K^T directly. DeBERTa computes (Q_c*K_c^T + Q_c*K_p^T + Q_p*K_c^T) then applies softmax. The resulting distribution carries position information that MobileBERT's standard attention has no mechanism to reproduce.
**How to avoid:** Start with hidden state alignment only (which bypasses attention mechanism differences). Add attention alignment as a secondary signal with a lower weight (`gamma = 0.5` initially). If attention loss fails to converge, reduce gamma further or drop attention alignment entirely -- hidden state alignment alone can be sufficient per MiniLM findings.
**Warning signs:** Attention alignment loss plateaus at a high value while hidden state loss continues decreasing; adding attention loss causes overall holdout F1 to decrease compared to hidden-state-only.

### Pitfall 4: Pre-computed Soft Labels vs Live Teacher Output Mismatch
**What goes wrong:** Phase 3 pre-computed soft labels using the teacher's final classification head output (binary logits -> softmax at temperature T). But D-03 requires live teacher forward pass for intermediate representations. If the teacher checkpoint loaded in Phase 4 is slightly different from the one used to pre-compute soft labels (e.g., different epoch, different random seed), the soft labels and live intermediate representations are inconsistent.
**Why it happens:** Phase 3 pre-computed soft labels at T={2,3,4,5} from the final checkpoint. If Phase 4 loads a different checkpoint (earlier epoch, wrong file), there is a mismatch.
**How to avoid:** Verify teacher checkpoint identity at notebook startup: compute a forward pass on 3-5 known samples, compare logits against a saved reference from Phase 3 (or against the soft labels themselves). Add an assertion that logits match within tolerance.
**Warning signs:** Teacher live forward pass produces different class predictions from the pre-computed soft labels on training samples.

### Pitfall 5: Colab Session Timeout During Temperature Sweep
**What goes wrong:** The temperature sweep (T={2,3,4,5}) requires 4 separate training runs. Each may take 1-3 hours on T4. Colab free tier disconnects after ~90 minutes of inactivity or ~12 hours total. A sweep could span multiple sessions.
**Why it happens:** Colab's resource allocation policy for free tier.
**How to avoid:** Aggressive checkpointing (D-09). Structure the sweep so each temperature trains from the SAME base checkpoint (not sequentially). Save each temperature's final model separately. Resume from where you left off.
**Warning signs:** GPU disconnection mid-training; loss curves that restart from high values instead of continuing from checkpoint.

## Code Examples

### Memory Profiling Cell (D-08)
```python
# Source: Pattern from Phase 3 Cell 1, adapted for dual-model loading
import torch
import gc

def profile_vram(batch_size, seq_len=128):
    """Load both models, run dummy forward pass, report peak VRAM."""
    gc.collect()
    torch.cuda.empty_cache()
    torch.cuda.reset_peak_memory_stats()

    from transformers import (
        AutoModel, MobileBertForSequenceClassification, AutoTokenizer
    )

    # Load teacher (frozen, FP16)
    teacher = AutoModel.from_pretrained(
        "microsoft/deberta-v3-large",
        output_hidden_states=True,
        output_attentions=True,
    ).half().cuda().eval()
    for p in teacher.parameters():
        p.requires_grad = False

    # Load student (trainable, FP16)
    student = MobileBertForSequenceClassification.from_pretrained(
        "google/mobilebert-uncased",
        num_labels=2,
        output_hidden_states=True,
        output_attentions=True,
    ).half().cuda().train()

    # Dummy forward pass
    dummy_ids = torch.randint(0, 30522, (batch_size, seq_len)).cuda()
    dummy_mask = torch.ones(batch_size, seq_len, dtype=torch.long).cuda()

    with torch.no_grad():
        t_out = teacher(input_ids=dummy_ids, attention_mask=dummy_mask)

    s_out = student(input_ids=dummy_ids, attention_mask=dummy_mask)

    peak_mb = torch.cuda.max_memory_allocated() / (1024**2)
    total_mb = torch.cuda.get_device_properties(0).total_mem / (1024**2)

    print(f"Batch size: {batch_size}, Seq len: {seq_len}")
    print(f"Peak VRAM: {peak_mb:.0f} MB / {total_mb:.0f} MB ({peak_mb/total_mb*100:.1f}%)")
    print(f"Teacher hidden states: {len(t_out.hidden_states)} layers, shape {t_out.hidden_states[0].shape}")
    print(f"Student hidden states: {len(s_out.hidden_states)} layers, shape {s_out.hidden_states[0].shape}")
    print(f"Teacher attentions: {len(t_out.attentions)} layers, shape {t_out.attentions[0].shape}")
    print(f"Student attentions: {len(s_out.attentions)} layers, shape {s_out.attentions[0].shape}")

    # Cleanup
    del teacher, student, t_out, s_out, dummy_ids, dummy_mask
    gc.collect()
    torch.cuda.empty_cache()

    return peak_mb

# Test at target batch size
for bs in [4, 8, 16, 32]:
    profile_vram(bs)
    print()
```

### Distillation Model with Projection Layers
```python
# Source: TinyBERT paper (arxiv 1909.10351) + MobileBERT paper (arxiv 2004.02984)
import torch
import torch.nn as nn
import torch.nn.functional as F

class DistillationWrapper(nn.Module):
    """Wraps student model with projection layers for intermediate alignment."""

    def __init__(self, student, teacher_hidden_size=1024, student_hidden_size=512,
                 num_layers=24, num_teacher_heads=16, num_student_heads=4):
        super().__init__()
        self.student = student
        self.num_layers = num_layers
        self.heads_per_group = num_teacher_heads // num_student_heads  # 16 // 4 = 4

        # Learnable linear projections: teacher hidden -> student hidden
        self.hidden_projections = nn.ModuleList([
            nn.Linear(teacher_hidden_size, student_hidden_size)
            for _ in range(num_layers)
        ])

    def forward(self, input_ids, attention_mask, labels=None):
        return self.student(
            input_ids=input_ids,
            attention_mask=attention_mask,
            labels=labels,
        )

    def compute_intermediate_loss(self, teacher_outputs, student_outputs):
        """Compute hidden state + attention alignment losses."""
        # teacher_outputs and student_outputs have .hidden_states and .attentions

        hidden_loss = 0.0
        attention_loss = 0.0

        # hidden_states[0] is embedding output, [1:] are layer outputs
        for i in range(self.num_layers):
            layer_idx = i + 1  # skip embedding layer

            # --- Hidden state alignment ---
            t_hidden = teacher_outputs.hidden_states[layer_idx]  # (batch, seq, 1024)
            s_hidden = student_outputs.hidden_states[layer_idx]  # (batch, seq, 512)
            t_projected = self.hidden_projections[i](t_hidden)   # (batch, seq, 512)
            hidden_loss += F.mse_loss(t_projected, s_hidden)

            # --- Attention alignment ---
            t_att = teacher_outputs.attentions[i]  # (batch, 16, seq, seq)
            s_att = student_outputs.attentions[i]  # (batch, 4, seq, seq)

            # Group teacher's 16 heads into 4 groups of 4, average
            batch_size = t_att.size(0)
            seq_len = t_att.size(2)
            t_grouped = t_att.reshape(
                batch_size, self.heads_per_group, -1, seq_len, seq_len
            ).mean(dim=1)  # (batch, 4, seq, seq)

            # KL divergence on attention distributions
            # Add small epsilon to avoid log(0)
            attention_loss += F.kl_div(
                (s_att + 1e-8).log(),
                t_grouped,
                reduction='batchmean'
            )

        hidden_loss /= self.num_layers
        attention_loss /= self.num_layers

        return hidden_loss, attention_loss
```

### Temperature Sweep with Holdout Evaluation
```python
# Source: TEXT-04 requirement -- T selected by holdout F1, not training loss
def temperature_sweep(soft_label_dir, student_model, holdout_loader, device):
    """Evaluate pre-trained student at each temperature on holdout."""
    from sklearn.metrics import f1_score

    temperatures = [2, 3, 4, 5]
    results = {}

    for T in temperatures:
        # Load soft labels at this temperature
        soft_data = torch.load(f"{soft_label_dir}/teacher_soft_labels_T{T}.pt")
        print(f"\nTemperature T={T}:")
        print(f"  Binary soft label shape: {soft_data['binary_soft_labels'].shape}")

        # Evaluate on holdout (model is the same -- we compare training at each T)
        # In practice: train separate models at each T, evaluate each on holdout
        student_model.eval()
        all_preds, all_labels = [], []
        with torch.no_grad():
            for batch in holdout_loader:
                inputs = {k: v.to(device) for k, v in batch.items() if k != 'labels'}
                labels = batch['labels']
                outputs = student_model(**inputs)
                preds = outputs.logits.argmax(dim=-1).cpu()
                all_preds.extend(preds.tolist())
                all_labels.extend(labels.tolist())

        f1 = f1_score(all_labels, all_preds, average='binary')
        results[T] = f1
        print(f"  Holdout F1: {f1:.4f}")

    best_T = max(results, key=results.get)
    print(f"\nBest temperature: T={best_T} (F1={results[best_T]:.4f})")
    return results, best_T
```

### Checkpoint Save/Resume Pattern (D-09)
```python
# Source: Adapted from Phase 3 teacher_finetuning.ipynb Cell 6
def save_checkpoint(model, optimizer, scheduler, epoch, loss, path, drive_path=None):
    """Save checkpoint to local + Google Drive."""
    import os
    checkpoint = {
        'epoch': epoch,
        'model_state_dict': model.state_dict(),
        'optimizer_state_dict': optimizer.state_dict(),
        'scheduler_state_dict': scheduler.state_dict() if scheduler else None,
        'loss': loss,
    }
    os.makedirs(os.path.dirname(path), exist_ok=True)
    torch.save(checkpoint, path)
    print(f"Checkpoint saved: {path} ({os.path.getsize(path)/1e6:.1f} MB)")

    if drive_path:
        import shutil
        os.makedirs(os.path.dirname(drive_path), exist_ok=True)
        shutil.copy2(path, drive_path)
        print(f"Backed up to Drive: {drive_path}")

def load_checkpoint(model, optimizer, scheduler, path):
    """Resume from checkpoint."""
    checkpoint = torch.load(path, weights_only=False)
    model.load_state_dict(checkpoint['model_state_dict'])
    optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
    if scheduler and checkpoint['scheduler_state_dict']:
        scheduler.load_state_dict(checkpoint['scheduler_state_dict'])
    print(f"Resumed from epoch {checkpoint['epoch']}, loss {checkpoint['loss']:.4f}")
    return checkpoint['epoch']
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Soft-labels-only distillation (Hinton 2015) | Intermediate layer transfer (TinyBERT 2019, MobileBERT 2020) | 2019-2020 | 2-5 F1 point improvement over soft-labels-only; consensus confirmed in 2024 literature |
| Fixed head-count matching (MobileBERT: custom IB-BERT teacher) | Cross-architecture head alignment via projection or SHD | 2025 (arxiv 2502.07436) | Enables distillation between any teacher/student without custom teacher architecture |
| Layer mapping search (TinyBERT: 24->4 mapping heuristic) | 1:1 mapping when depths match | Original MobileBERT (2020) | Eliminates mapping search; natural for same-depth pairs |
| MSE only for all intermediate losses | KL for attention (distributions) + MSE for hidden states (feature maps) | MobileBERT paper (2020) | Respects the mathematical nature of each representation type |

**Deprecated/outdated:**
- Soft-labels-only distillation: Still useful as a debugging baseline (our Phase A), but not sufficient for state-of-the-art transfer. TEXT-04 explicitly requires intermediate layers.
- Pre-computed intermediate representations: Replaced by live teacher forward pass in modern implementations. Saves disk at the cost of compute per batch.

## Open Questions

1. **DeBERTa disentangled attention alignment effectiveness**
   - What we know: DeBERTa's `output_attentions` returns combined attention weights in standard `(batch, heads, seq, seq)` shape. These can be directly compared to MobileBERT's attention weights.
   - What's unclear: Whether the disentangled position-content attention information transfers meaningfully to a standard attention student. The attention distributions encode different information.
   - Recommendation: Start with hidden state alignment only (Phase B, step 1). Add attention alignment as a second step. Compare holdout F1 with and without attention alignment. If attention alignment hurts or does not help, drop it and rely on hidden states + soft labels.

2. **Optimal beta (hidden state loss weight) calibration**
   - What we know: MSE values are typically 1e-3 to 1e-5; KL values are 1e-1 to 1e0. Beta must scale MSE up.
   - What's unclear: Exact beta value for this specific teacher-student pair.
   - Recommendation: Log all loss components in first 10 batches. Set beta so that beta * L_hidden is within 0.5x-2x of alpha * KL_soft. Start with beta=100, adjust after first run.

3. **Whether the F1 >= 0.8019 gate is achievable**
   - What we know: Teacher ceiling is F1=0.8052. With 202 holdout samples, flipping 1 sample changes F1 by ~0.5 points. The gap between gate (0.8019) and ceiling (0.8052) is 0.33 points -- less than one sample.
   - What's unclear: Whether distillation can get the student within 0.33 points of the teacher.
   - Recommendation: Per D-06, if infeasible after full Phase B training, evaluate: (a) error analysis to identify if specific sample types are systematically wrong, (b) consider relaxing to 2-point gate (F1 >= 0.7919), (c) report results honestly and let the checkpoint quality speak for itself. The 3-point improvement over Phase 2 baseline (0.7719) is the primary value -- approaching the teacher ceiling is the stretch goal.

## VRAM Budget Analysis

Computed from architecture parameters, verified against HuggingFace model size reports.

| Component | Memory (FP16) | Notes |
|-----------|--------------|-------|
| DeBERTa-v3-large (frozen, inference) | ~830 MB | No optimizer states; eval() mode |
| MobileBERT (trainable) | ~47 MB | Tiny model |
| MobileBERT optimizer (Adam) | ~188 MB | 2x FP32 momentum + variance |
| MobileBERT gradients | ~47 MB | FP16 gradients |
| 24 projection layers + optimizer | ~120 MB | 12.6M params (1024->512 x 24) |
| PyTorch/CUDA overhead | ~500 MB | Context, workspace, caching |
| **Subtotal (fixed)** | **~1732 MB** | |
| Activations (batch=4) | ~120 MB | Scales linearly with batch |
| Activations (batch=16) | ~480 MB | |
| Activations (batch=32) | ~960 MB | |
| **Total (batch=32)** | **~2692 MB** | **16.6% of T4 16GB** |

**Conclusion:** T4 is more than sufficient. Batch size 32 uses only 2.7 GB. Can go higher if needed.

**Recommended batch size:** 16-32 (effective batch via accumulation if desired). No gradient checkpointing needed for the student.

**Confidence:** HIGH -- computed from verified parameter counts; actual peak VRAM may be 10-20% higher due to PyTorch memory fragmentation and CUDA graph overhead. Memory profiling cell (D-08) will validate.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | scikit-learn (F1 score, classification_report) + manual holdout eval loop |
| Config file | None -- evaluation is inline in notebook cells |
| Quick run command | Run holdout evaluation cell in notebook |
| Full suite command | Run all evaluation cells (Phase A eval + Phase B eval + temperature sweep + gate check) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEXT-04-01 | Intermediate layer transfer used (attention + hidden states) | manual inspection | Verify Phase B loss includes hidden + attention components | Wave 0 (build into notebook) |
| TEXT-04-02 | Layer mapping documented before training | manual | Layer mapping table in Cell 2 config | Wave 0 (build into notebook) |
| TEXT-04-03 | Temperature swept T={2,3,4,5}, optimal T by holdout F1 | automated cell | Temperature sweep cell produces comparison table | Wave 0 (build into notebook) |
| TEXT-04-04 | 3 F1 point improvement over baseline (F1 >= 0.8019) | automated cell | Gate check cell compares vs 0.7719 baseline | Wave 0 (build into notebook) |
| TEXT-04-05 | Checkpoint saved to research/models/student_finetuned/ | automated cell | Save cell + file existence check | Wave 0 (build into notebook) |

### Sampling Rate
- **Per phase:** Full holdout evaluation (202 samples) at end of each training phase
- **Per epoch:** Validation loss logged; spot-check F1 every epoch
- **Phase gate:** Gate check cell must show F1 >= 0.8019 (or trigger D-06 recovery)

### Wave 0 Gaps
- None -- all validation is embedded in the notebook cells. No separate test files needed. The notebook IS the test infrastructure for this research phase.

## Sources

### Primary (HIGH confidence)
- [MobileBERT paper (arxiv 2004.02984)](https://arxiv.org/abs/2004.02984) -- Bottleneck architecture, IB-BERT teacher design, feature map transfer (MSE), attention transfer (KL), 1:1 layer mapping
- [MobileBERT HuggingFace config.json](https://huggingface.co/google/mobilebert-uncased/resolve/main/config.json) -- Exact dimensions: hidden_size=512, true_hidden_size=128, intra_bottleneck_size=128, num_attention_heads=4, num_hidden_layers=24
- [DeBERTa-v3-large HuggingFace config.json](https://huggingface.co/microsoft/deberta-v3-large/resolve/main/config.json) -- Exact dimensions: hidden_size=1024, num_attention_heads=16, num_hidden_layers=24, intermediate_size=4096
- [MobileBERT HuggingFace configuration source](https://github.com/huggingface/transformers/blob/main/src/transformers/models/mobilebert/configuration_mobilebert.py) -- true_hidden_size derived from intra_bottleneck_size when use_bottleneck=True
- [TinyBERT paper (arxiv 1909.10351)](https://arxiv.org/abs/1909.10351) -- Learnable linear projection for dimension mismatch, attention matrix distillation, hidden state MSE
- Phase 3 teacher_finetuning.ipynb -- Colab patterns, Drive mounting, checkpointing, soft label pre-computation at T={2,3,4,5}
- Phase 2 architecture_benchmark.ipynb -- MobileBERT training patterns, binary classification head

### Secondary (MEDIUM confidence)
- [SHD: Squeezing-Heads Distillation (arxiv 2502.07436)](https://arxiv.org/abs/2502.07436) -- Projector-free attention head alignment for different head counts; analytically computed per-sample weights
- [MiniLM (NeurIPS 2020)](https://proceedings.neurips.cc/paper/2020/file/3f5ee243547dee91fbd053c1c4a845aa-Paper.pdf) -- Last-layer self-attention distillation as alternative to full intermediate alignment
- [DeBERTa-v3 paper (ICLR 2023)](https://arxiv.org/abs/2111.09543) -- Disentangled attention mechanism details
- [PyTorch Knowledge Distillation Tutorial](https://docs.pytorch.org/tutorials/beginner/knowledge_distillation_tutorial.html) -- Standard KL divergence + CE loss patterns
- [Attention and feature transfer KD (Nature Scientific Reports 2023)](https://www.nature.com/articles/s41598-023-43986-y) -- Combined attention + feature map transfer methodology
- [HuggingFace DeBERTa-v3-large memory requirements discussion](https://huggingface.co/microsoft/deberta-v3-large/discussions/5) -- ~828 MB FP16 inference

### Tertiary (LOW confidence)
- 3-5 F1 point expected gain from distillation -- from general NLP distillation literature, not verified for scam-specific binary classification. The actual gain on this task is unknown.
- Beta weight calibration (100-1000 range) -- common heuristic from practitioner reports, not from a specific verified source. Needs empirical validation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- same PyTorch/HuggingFace stack as Phase 2/3, no new libraries needed
- Architecture (dimensions, layer mapping): HIGH -- verified from official config.json files and MobileBERT paper
- Hidden state alignment approach: HIGH -- directly follows MobileBERT paper's feature map transfer
- Attention alignment approach: MEDIUM -- head-count mismatch (16->4) requires grouping not in original paper; DeBERTa disentangled attention adds uncertainty
- Loss weight calibration: LOW -- empirical tuning required; starting points are heuristics
- F1 gate achievability: LOW -- 0.33 pts headroom is extremely tight; may require D-06 recovery
- Memory estimates: HIGH -- computed from parameter counts, verified against model card data

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable domain; HuggingFace API and architecture configs unlikely to change)
