from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
from torchvision import datasets

DATASET_PATH = "../../plantvillage dataset/color"
OUTPUT_DIR = Path(__file__).resolve().parent


def main():
    dataset_root = Path(DATASET_PATH)
    if not dataset_root.is_absolute():
        dataset_root = (Path(__file__).resolve().parent / dataset_root).resolve()
    if not dataset_root.exists():
        raise FileNotFoundError(f"Dataset path does not exist: {dataset_root}")

    dataset = datasets.ImageFolder(dataset_root)

    class_counts = {name: 0 for name in dataset.classes}
    for _, label in dataset.samples:
        class_counts[dataset.classes[label]] += 1

    df = pd.DataFrame(
        {
            "class_name": list(class_counts.keys()),
            "count": list(class_counts.values()),
        }
    ).sort_values("count", ascending=False)

    min_count = int(df["count"].min())
    max_count = int(df["count"].max())
    ratio = max_count / max(min_count, 1)

    print(f"Classes: {len(df)}")
    print(f"Total images: {int(df['count'].sum())}")
    print(f"Min count: {min_count}")
    print(f"Max count: {max_count}")
    print(f"Imbalance ratio (max/min): {ratio:.2f}x")

    csv_path = OUTPUT_DIR / "class_distribution.csv"
    df.to_csv(csv_path, index=False)

    plt.figure(figsize=(14, 8))
    plt.bar(df["class_name"], df["count"], color="#16a34a")
    plt.title("PlantVillage Class Distribution")
    plt.xlabel("Class")
    plt.ylabel("Image Count")
    plt.xticks(rotation=90, fontsize=7)
    plt.tight_layout()
    plot_path = OUTPUT_DIR / "class_distribution.png"
    plt.savefig(plot_path, dpi=220)

    print(f"Saved class count CSV to: {csv_path}")
    print(f"Saved class distribution plot to: {plot_path}")


if __name__ == "__main__":
    main()
