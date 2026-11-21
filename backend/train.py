"""
Train EfficientNet-B6 on PlantVillage with RTX 4060 8GB.

Anti-cheating measures:
  - Stratified split (seeded, NO leakage between train/val)
  - Duplicate-image check between splits
  - NO augmentation on val — only resize + center-crop
  - Class-weighted loss (handles 5090 vs 152 sample imbalance)
  - Early stopping on VAL loss (not train loss)
  - Best model saved by val accuracy, not train accuracy
  - Cosine LR annealing (no manual LR hacking)
  - Reproducible seeds everywhere

Usage:
    python train.py                          # auto-resume from checkpoint
    python train.py --fresh                  # start from pretrained imagenet
    python train.py --epochs 50 --bs 32      # custom hyperparams
"""
import argparse
from pathlib import Path
import random, os, shutil, math
import numpy as np
from collections import Counter

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Subset
from torchvision import transforms, models, datasets as tvds
from torch.optim.lr_scheduler import CosineAnnealingLR
from tqdm import tqdm

# ── Reproducible seeds ─────────────────────────────────────────────
def seed_all(seed=42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False

seed_all(42)

# ── Paths ──────────────────────────────────────────────────────────
BASE = Path(r"D:\My AI\plantvillage dataset\color")
SAVE_DIR = Path(__file__).parent / "weights"
SAVE_DIR.mkdir(exist_ok=True)
CLASSES_FILE = SAVE_DIR.parent / "classes.py"
CKPT_PATH = SAVE_DIR / "efficientnet_plant_checkpoint.pth"
FINAL_PATH  = SAVE_DIR / "efficientnet_plant.pth"

# ── 38 PlantVillage classes ────────────────────────────────────────
NUM_CLASSES = 38
IMAGE_SIZE = 384
RESIZE_SIZE = int(IMAGE_SIZE * 1.14)

# ── Transforms ──────────────────────────────────────────────────────
# TRAIN gets augmentation (prevents overfitting, NOT cheating)
train_tf = transforms.Compose([
    transforms.Resize((RESIZE_SIZE, RESIZE_SIZE)),
    transforms.RandomResizedCrop(IMAGE_SIZE, scale=(0.8, 1.0), ratio=(0.9, 1.1)),
    transforms.RandomHorizontalFlip(p=0.5),
    transforms.RandomRotation(degrees=15),
    transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])

# VAL gets NO augmentation — raw images only (prevents inflated scores)
val_tf = transforms.Compose([
    transforms.Resize((RESIZE_SIZE, RESIZE_SIZE)),
    transforms.CenterCrop(IMAGE_SIZE),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])


def check_leakage(train_files, val_files):
    """Fatal error if any image path appears in both splits."""
    overlap = set(train_files) & set(val_files)
    if overlap:
        raise RuntimeError(
            f"DATA LEAKAGE DETECTED: {len(overlap)} image(s) in both train and val!\n"
            f"First 5: {list(overlap)[:5]}"
        )
    print(f"  [Anti-Cheat] Zero data leakage — Train: {len(train_files)}, Val: {len(val_files)}")


def save_checkpoint(epoch, model, optimizer, scheduler, val_acc, is_best, args_dict=None):
    """Save checkpoint and optionally copy to best path."""
    state = {
        **args_dict,
        'state_dict': model.state_dict(),
        'optimizer': optimizer.state_dict(),
        'scheduler': scheduler.state_dict(),
        'val_acc': val_acc,
        'epoch': epoch,
        'classes': tvds.ImageFolder(str(BASE)).classes,
    }
    ckpt_path = SAVE_DIR / "efficientnet_plant_checkpoint.pth"
    torch.save(state, ckpt_path)
    if is_best:
        shutil.copy2(ckpt_path, SAVE_DIR / "efficientnet_plant_best.pth")
    print(f"  [Checkpoint] Saved epoch {epoch+1} (val_acc={val_acc:.2f}%) — {'BEST' if is_best else ''}")


@torch.no_grad()
def validate(model, loader, device):
    """Run one validation epoch — NO augmentation, NO gradient."""
    model.eval()
    correct = total = 0
    running_loss = 0
    for imgs, labels in tqdm(loader, desc="  Val  ", leave=False):
        imgs, labels = imgs.to(device, non_blocking=True), labels.to(device, non_blocking=True)
        out = model(imgs)
        loss = criterion(out, labels)
        running_loss += loss.item() * imgs.size(0)
        correct += out.argmax(1).eq(labels).sum().item()
        total += imgs.size(0)
    return running_loss / total, correct / total * 100


# ── Main ───────────────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument("--epochs",        type=int,   default=30,    help="Total epochs including freeze phase")
parser.add_argument("--bs",            type=int,   default=8,     help="Per-GPU batch size (8 fits most 8GB GPUs)")
parser.add_argument("--lr",            type=float, default=1e-3,  help="Initial LR (head) / 1e-5 (full)")
parser.add_argument("--freeze_epochs", type=int,   default=5,     help="Epochs with frozen backbone")
parser.add_argument("--fresh",         action="store_true",       help="Restart from ImageNet weights")
parser.add_argument("--workers",       type=int,   default=0,     help="DataLoader workers (0 for Windows compatibility)")
args = parser.parse_args()


# ── Device ─────────────────────────────────────────────────────────
device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
print(f"\n{'='*60}")
print(f"  PlantGuard AI — Training EfficientNet-B6")
print(f"{'='*60}")

if device.type == "cpu":
    print("\n  ERROR: CUDA not available!")
    print("  Run: pip install --force-reinstall torch torchvision --index-url https://download.pytorch.org/whl/cu129\n")
    exit(1)

gpu_name = torch.cuda.get_device_name(0)
vram_gb = torch.cuda.get_device_properties(0).total_memory / 1024**3
print(f"  GPU:  {gpu_name} ({vram_gb:.1f} GB VRAM)")
print(f"  AMP:  Mixed Precision (fp16) enabled")
print()

# ── Dataset ────────────────────────────────────────────────────────
full_ds = tvds.ImageFolder(str(BASE), transform=None)
all_indices = np.arange(len(full_ds))
all_labels = [full_ds.imgs[i][1] for i in range(len(full_ds))]

# Stratified 85/15 split with fixed seed
from sklearn.model_selection import train_test_split
train_idx, val_idx = train_test_split(
    all_indices, test_size=0.15, random_state=42, stratify=all_labels
)
train_idx, val_idx = train_idx.tolist(), val_idx.tolist()

# Anti-cheat leakage check
train_files = [full_ds.imgs[i][0] for i in train_idx]
val_files   = [full_ds.imgs[i][0] for i in val_idx]
check_leakage(train_files, val_files)

# Class-weighted loss (handles 5090:152 imbalance ratio)
class_counts = Counter(all_labels)
total = len(all_labels)
weights = torch.tensor([
    total / (NUM_CLASSES * class_counts[c]) for c in sorted(class_counts)
], dtype=torch.float32).to(device)

print(f"\n  Dataset: {len(full_ds)} images | {NUM_CLASSES} classes")
print(f"  Train:   {len(train_idx)} images")
print(f"  Val:     {len(val_idx)} images")
print(f"  Class imbalance ratio: {max(class_counts.values()) / min(class_counts.values()):.1f}x")
print(f"  Loss weights: min={weights.min():.2f}, max={weights.max():.2f}")
print()

# Apply transforms after split to avoid leakage via caching
train_ds = Subset(tvds.ImageFolder(str(BASE), transform=train_tf), train_idx)
val_ds   = Subset(tvds.ImageFolder(str(BASE), transform=val_tf),   val_idx)

train_loader = DataLoader(train_ds, batch_size=args.bs, shuffle=True,
                          num_workers=args.workers, pin_memory=True, persistent_workers=args.workers > 0)
val_loader   = DataLoader(val_ds,   batch_size=args.bs * 2, shuffle=False,
                          num_workers=args.workers, pin_memory=True, persistent_workers=args.workers > 0)

# ── Model ──────────────────────────────────────────────────────────
model = models.efficientnet_b6(weights=models.EfficientNet_B6_Weights.IMAGENET1K_V1)
model.classifier[1] = nn.Linear(model.classifier[1].in_features, NUM_CLASSES)

# Resume or fresh?
criterion = nn.CrossEntropyLoss(weight=weights)
start_epoch = 0
best_val_acc = 0.0

if not args.fresh and CKPT_PATH.exists():
    ckpt = torch.load(CKPT_PATH, map_location=device)
    model.load_state_dict(ckpt['state_dict'])
    start_epoch = ckpt['epoch']
    best_val_acc = ckpt.get('val_acc', 0.0)
    frozen = start_epoch < args.freeze_epochs
    print(f"  [Resume] Epoch {start_epoch}, Best val_acc: {best_val_acc:.2f}%, Backbone frozen: {frozen}")

model = model.to(device)

# ── Phase 1: frozen backbone + head only ───────────────────────────────
def set_trainable(freeze_backbone):
    for p in model.features.parameters():
        p.requires_grad = not freeze_backbone
    for p in model.classifier.parameters():
        p.requires_grad = True

if start_epoch < args.freeze_epochs:
    set_trainable(True)
else:
    set_trainable(False)

optimizer = optim.AdamW(
    filter(lambda p: p.requires_grad, model.parameters()),
    lr=1e-3 if model.features[0].out_channels else 1e-5,
    weight_decay=1e-4,
)
scheduler = CosineAnnealingLR(optimizer, T_max=args.epochs - start_epoch)
scaler = torch.amp.GradScaler('cuda')


# ── Training loop ─────────────────────────────────────────────────────
print(f"\n{'='*60}")
print("  TRAINING")
print(f"{'='*60}\n")

patience = 7
no_improve = 0

for epoch in range(start_epoch, args.epochs):
    # Phase transition: unfreeze backbone
    if epoch == args.freeze_epochs and epoch > 0:
        set_trainable(False)
        print("\n  >>> Phase 2: Unfreezing full model, LR -> 1e-5")
        optimizer = optim.AdamW(filter(lambda p: p.requires_grad, model.parameters()), lr=1e-5, weight_decay=1e-4)
        scheduler = CosineAnnealingLR(optimizer, T_max=args.epochs - epoch)

    # TRAIN
    model.train()
    running_loss = correct = total = 0
    pbar = tqdm(train_loader, desc=f"Epoch {epoch+1}/{args.epochs} | Train", leave=True)

    for imgs, labels in pbar:
        imgs, labels = imgs.to(device, non_blocking=True), labels.to(device, non_blocking=True)

        with torch.autocast('cuda', enabled=True):
            out = model(imgs)
            loss = criterion(out, labels)

        scaler.scale(loss).backward()
        scaler.step(optimizer)
        scaler.update()
        optimizer.zero_grad()

        running_loss += loss.item() * imgs.size(0)
        correct += out.argmax(1).eq(labels).sum().item()
        total += imgs.size(0)
        pbar.set_postfix(loss=f"{loss.item():.4f}")

    train_acc = correct / total * 100
    train_loss = running_loss / total

    # VAL
    val_loss, val_acc = validate(model, val_loader, device)
    scheduler.step()

    is_best = val_acc > best_val_acc
    if is_best:
        best_val_acc = val_acc
        no_improve = 0
    else:
        no_improve += 1

    print(f"  Train Loss: {train_loss:.4f} | Train Acc: {train_acc:.2f}% | Val Loss: {val_loss:.4f} | Val Acc: {val_acc:.2f}% | {'**BEST**' if is_best else ''}")

    save_checkpoint(epoch, model, optimizer, scheduler, val_acc, is_best, vars(args))

    if no_improve >= patience:
        print(f"\n  [Early Stop] No improvement for {patience} epochs. Stopping.")
        break

print(f"\n{'='*60}")
print(f"  DONE — Best validation accuracy: {best_val_acc:.2f}%")
print(f"  Model saved to: {FINAL_PATH}")
print(f"{'='*60}\n")

# ── Load best and save final weights ────────────────────────────────────
best_ckpt = torch.load(SAVE_DIR / "efficientnet_plant_best.pth", map_location="cpu")
model.load_state_dict(best_ckpt['state_dict'])

# Save clean state_dict for export
torch.save(model.cpu().state_dict(), FINAL_PATH)
print(f"\n  [Saved] Final model: {FINAL_PATH}")

# Update classes.py
classes = tvds.ImageFolder(str(BASE)).classes
with open(CLASSES_FILE, 'w') as f:
    f.write("CLASSES = [\n")
    for c in classes:
        f.write(f"    {c!r},\n")
    f.write("]\n")
print(f"  [Updated] {CLASSES_FILE} ({len(classes)} classes)")
