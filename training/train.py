import csv
import time
from pathlib import Path

import torch
import torch.nn as nn
import torch.optim as optim
from tqdm.auto import tqdm
from torchvision import models

from dataset import DatasetConfig, create_dataloaders

DATASET_PATH = r"D:\My AI\plantvillage dataset\color"
EPOCHS = 10
BATCH_SIZE = 10
IMAGE_SIZE = 384
HEAD_LR = 2e-3
BACKBONE_LR = 2e-4
WEIGHT_DECAY = 1e-4
LABEL_SMOOTHING = 0.05
EARLY_STOPPING_PATIENCE = 3
FREEZE_EPOCHS = 2
UNFREEZE_LAST_BLOCKS = 2


def format_duration(seconds: float) -> str:
    minutes, seconds = divmod(int(seconds), 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    return f"{minutes:02d}:{seconds:02d}"


def configure_trainable_layers(model, unfreeze_last_blocks: int) -> None:
    for param in model.features.parameters():
        param.requires_grad = False

    if unfreeze_last_blocks <= 0:
        return

    feature_blocks = list(model.features.children())
    for block in feature_blocks[-unfreeze_last_blocks:]:
        for param in block.parameters():
            param.requires_grad = True


def build_optimizer(model):
    head_params = []
    backbone_params = []

    for name, param in model.named_parameters():
        if not param.requires_grad:
            continue
        if name.startswith("classifier"):
            head_params.append(param)
        else:
            backbone_params.append(param)

    param_groups = [{"params": head_params, "lr": HEAD_LR}]
    if backbone_params:
        param_groups.append({"params": backbone_params, "lr": BACKBONE_LR})

    return optim.AdamW(param_groups, weight_decay=WEIGHT_DECAY)


def build_class_weights(class_counts, device):
    counts = torch.tensor(class_counts, dtype=torch.float32)
    counts = torch.clamp(counts, min=1.0)
    weights = 1.0 / counts.sqrt()
    weights = weights / weights.mean()
    return weights.to(device)


def train_one_epoch(model, dataloader, criterion, optimizer, device, scaler, use_amp, epoch, epochs):
    model.train()
    total_loss = 0.0
    correct = 0
    total = 0
    start_time = time.perf_counter()
    progress_bar = tqdm(
        enumerate(dataloader, start=1),
        total=len(dataloader),
        desc=f"Epoch {epoch}/{epochs} [train]",
        unit="batch",
        dynamic_ncols=True,
        leave=True,
    )

    for step, (images, labels) in progress_bar:
        images = images.to(device, non_blocking=True).to(memory_format=torch.channels_last)
        labels = labels.to(device, non_blocking=True)

        optimizer.zero_grad(set_to_none=True)
        with torch.amp.autocast(device_type=device.type, enabled=use_amp):
            outputs = model(images)
            loss = criterion(outputs, labels)

        scaler.scale(loss).backward()
        scaler.step(optimizer)
        scaler.update()

        total_loss += loss.item() * images.size(0)
        preds = outputs.argmax(dim=1)
        correct += (preds == labels).sum().item()
        total += labels.size(0)

        running_loss = total_loss / total
        running_acc = (correct / total) * 100 if total else 0.0
        elapsed = time.perf_counter() - start_time
        progress_bar.set_postfix(
            loss=f"{running_loss:.4f}",
            acc=f"{running_acc:.2f}%",
            seen=f"{min(step * dataloader.batch_size, len(dataloader.dataset))}/{len(dataloader.dataset)}",
            elapsed=format_duration(elapsed),
        )

    epoch_loss = total_loss / len(dataloader.dataset)
    epoch_acc = (correct / total) * 100 if total else 0.0
    return epoch_loss, epoch_acc


def evaluate(model, dataloader, criterion, device, epoch, epochs):
    model.eval()
    total_loss = 0.0
    correct = 0
    total = 0

    progress_bar = tqdm(
        dataloader,
        total=len(dataloader),
        desc=f"Epoch {epoch}/{epochs} [val]",
        unit="batch",
        dynamic_ncols=True,
        leave=False,
    )

    with torch.no_grad():
        for images, labels in progress_bar:
            images = images.to(device, non_blocking=True).to(memory_format=torch.channels_last)
            labels = labels.to(device, non_blocking=True)
            with torch.amp.autocast(device_type=device.type, enabled=device.type == "cuda"):
                outputs = model(images)
                loss = criterion(outputs, labels)
            preds = outputs.argmax(dim=1)
            total_loss += loss.item() * images.size(0)
            correct += (preds == labels).sum().item()
            total += labels.size(0)
            running_loss = total_loss / total
            running_acc = (correct / total) * 100 if total else 0.0
            progress_bar.set_postfix(loss=f"{running_loss:.4f}", acc=f"{running_acc:.2f}%")

    val_loss = total_loss / len(dataloader.dataset)
    val_acc = (correct / total) * 100 if total else 0.0
    return val_loss, val_acc


def append_history_row(history_path: Path, row: dict) -> None:
    write_header = not history_path.exists()
    with history_path.open("a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(row.keys()))
        if write_header:
            writer.writeheader()
        writer.writerow(row)


def main():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    use_amp = device.type == "cuda"
    if device.type == "cuda":
        torch.backends.cudnn.benchmark = True
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
    torch.set_float32_matmul_precision("high")

    print(f"Using device: {device}", flush=True)

    config = DatasetConfig(dataset_path=DATASET_PATH, image_size=IMAGE_SIZE, batch_size=BATCH_SIZE)
    train_loader, val_loader, classes, num_classes, class_counts = create_dataloaders(config)

    if num_classes != 38:
        print(f"Warning: detected {num_classes} classes in dataset (expected 38).", flush=True)

    min_count = min(class_counts)
    max_count = max(class_counts)
    imbalance_ratio = max_count / max(min_count, 1)
    print(f"Train split class imbalance ratio (max/min): {imbalance_ratio:.2f}x", flush=True)
    print(f"Training samples: {len(train_loader.dataset)}", flush=True)
    print(f"Validation samples: {len(val_loader.dataset)}", flush=True)
    print(f"Image size: {IMAGE_SIZE} | Batch size: {BATCH_SIZE}", flush=True)
    print("Performance mode: TF32 + mixed precision + channels_last + larger GPU batch.", flush=True)
    print(
        "Fine-tuning plan: train classifier first, then unfreeze the last EfficientNet blocks only.",
        flush=True,
    )
    print("Split policy: stratified by class with exact-duplicate groups kept on the same side.", flush=True)

    model = models.efficientnet_b6(weights=models.EfficientNet_B6_Weights.IMAGENET1K_V1)
    classifier_in_features = model.classifier[1].in_features
    model.classifier[1] = nn.Linear(classifier_in_features, 38)
    model.classifier[0].p = 0.3
    model = model.to(device, memory_format=torch.channels_last)

    configure_trainable_layers(model, unfreeze_last_blocks=0)
    for param in model.classifier.parameters():
        param.requires_grad = True

    class_weights = build_class_weights(class_counts, device)
    criterion = nn.CrossEntropyLoss(weight=class_weights, label_smoothing=LABEL_SMOOTHING)
    optimizer = build_optimizer(model)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=EPOCHS)
    scaler = torch.amp.GradScaler(device.type, enabled=use_amp)

    output_dir = Path(__file__).resolve().parent.parent / "backend" / "weights"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "efficientnet_plant.pth"
    history_path = Path(__file__).resolve().parent / "training_history_b6.csv"
    if history_path.exists():
        history_path.unlink()

    best_val_acc = 0.0
    best_val_loss = float("inf")
    patience_counter = 0
    training_start = time.perf_counter()

    for epoch in range(1, EPOCHS + 1):
        epoch_start = time.perf_counter()

        if epoch == FREEZE_EPOCHS + 1:
            configure_trainable_layers(model, unfreeze_last_blocks=UNFREEZE_LAST_BLOCKS)
            for param in model.classifier.parameters():
                param.requires_grad = True
            optimizer = build_optimizer(model)
            scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(EPOCHS - FREEZE_EPOCHS, 1))
            print(
                f"Unfroze the last {UNFREEZE_LAST_BLOCKS} EfficientNet feature blocks after epoch {FREEZE_EPOCHS}.",
                flush=True,
            )

        train_loss, train_acc = train_one_epoch(
            model, train_loader, criterion, optimizer, device, scaler, use_amp, epoch, EPOCHS
        )
        val_loss, val_acc = evaluate(model, val_loader, criterion, device, epoch, EPOCHS)
        scheduler.step()

        epoch_seconds = time.perf_counter() - epoch_start
        elapsed_total = time.perf_counter() - training_start
        current_lrs = ", ".join(f"{group['lr']:.2e}" for group in optimizer.param_groups)

        tqdm.write(
            f"Epoch [{epoch}/{EPOCHS}] complete - "
            f"Train Loss: {train_loss:.4f} - Train Acc: {train_acc:.2f}% - "
            f"Val Loss: {val_loss:.4f} - Val Acc: {val_acc:.2f}% - "
            f"LRs: {current_lrs} - Epoch Time: {format_duration(epoch_seconds)} - "
            f"Total Time: {format_duration(elapsed_total)}"
        )

        append_history_row(
            history_path,
            {
                "epoch": epoch,
                "train_loss": f"{train_loss:.6f}",
                "train_acc": f"{train_acc:.4f}",
                "val_loss": f"{val_loss:.6f}",
                "val_acc": f"{val_acc:.4f}",
                "epoch_seconds": f"{epoch_seconds:.2f}",
            },
        )

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save(model.state_dict(), output_path)
            tqdm.write(f"Saved new best model to: {output_path}")

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            patience_counter = 0
        else:
            patience_counter += 1
            tqdm.write(f"Val loss did not improve. Patience: {patience_counter}/{EARLY_STOPPING_PATIENCE}")

        if patience_counter >= EARLY_STOPPING_PATIENCE:
            tqdm.write("Early stopping triggered to reduce overfitting.")
            break

    total_seconds = time.perf_counter() - training_start
    tqdm.write(f"Training complete. Best validation accuracy: {best_val_acc:.2f}%")
    tqdm.write(f"History saved to: {history_path}")
    tqdm.write(f"Total training time: {format_duration(total_seconds)}")
    tqdm.write("Classes loaded:")
    for class_name in classes:
        tqdm.write(f"- {class_name}")


if __name__ == "__main__":
    main()
