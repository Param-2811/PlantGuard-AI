from pathlib import Path

import matplotlib.pyplot as plt
import seaborn as sns
import torch
import torch.nn as nn
from sklearn.metrics import accuracy_score, confusion_matrix
from torchvision import models

from dataset import DatasetConfig, create_dataloaders

DATASET_PATH = r"D:\My AI\plantvillage dataset\color"
IMAGE_SIZE = 384
BATCH_SIZE = 12


def main():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    config = DatasetConfig(dataset_path=DATASET_PATH, image_size=IMAGE_SIZE, batch_size=BATCH_SIZE)
    _, val_loader, class_names, _, _ = create_dataloaders(config)

    model = models.efficientnet_b6(weights=None)
    classifier_in_features = model.classifier[1].in_features
    model.classifier[1] = nn.Linear(classifier_in_features, 38)

    weights_path = Path(__file__).resolve().parent.parent / "backend" / "weights" / "efficientnet_plant.pth"
    if not weights_path.exists():
        raise FileNotFoundError(f"Model weights not found: {weights_path}")

    model.load_state_dict(torch.load(weights_path, map_location=device))
    model.to(device)
    model.eval()

    y_true = []
    y_pred = []

    with torch.no_grad():
        for images, labels in val_loader:
            images = images.to(device, non_blocking=True).to(memory_format=torch.channels_last)
            outputs = model(images)
            preds = torch.argmax(outputs, dim=1).cpu().tolist()
            y_pred.extend(preds)
            y_true.extend(labels.tolist())

    acc = accuracy_score(y_true, y_pred)
    print(f"Validation Accuracy: {acc * 100:.2f}%")

    cm = confusion_matrix(y_true, y_pred, labels=list(range(len(class_names))))
    plt.figure(figsize=(16, 14))
    sns.heatmap(
        cm,
        cmap="Greens",
        cbar=True,
        xticklabels=class_names,
        yticklabels=class_names,
    )
    plt.title("Confusion Matrix")
    plt.xlabel("Predicted")
    plt.ylabel("True")
    plt.xticks(rotation=90, fontsize=7)
    plt.yticks(rotation=0, fontsize=7)

    output_path = Path(__file__).resolve().parent / "confusion_matrix.png"
    plt.tight_layout()
    plt.savefig(output_path, dpi=200)
    print(f"Saved confusion matrix to: {output_path}")


if __name__ == "__main__":
    main()
