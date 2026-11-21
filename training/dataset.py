import os
import hashlib
import random
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import torch
from torch.utils.data import DataLoader, Dataset, Subset, WeightedRandomSampler
from torchvision import datasets, transforms


@dataclass
class DatasetConfig:
    dataset_path: str = "./dataset"
    image_size: int = 384
    batch_size: int = 10
    train_split: float = 0.8
    num_workers: int = min(4, os.cpu_count() or 4)
    seed: int = 42
    split_file: str = "split_indices.pt"
    split_version: int = 2
    use_weighted_sampler: bool = True
    group_exact_duplicates: bool = True


class TransformSubset(Dataset):
    def __init__(self, subset: Subset, transform):
        self.subset = subset
        self.transform = transform

    def __len__(self):
        return len(self.subset)

    def __getitem__(self, idx):
        image, label = self.subset[idx]
        if self.transform:
            image = self.transform(image)
        return image, label


def build_transforms(image_size: int = 224):
    resize_size = int(image_size * 1.14)
    train_transform = transforms.Compose(
        [
            transforms.RandomHorizontalFlip(),
            transforms.RandomVerticalFlip(),
            transforms.RandomRotation(15),
            transforms.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.2),
            transforms.RandomResizedCrop(image_size, scale=(0.8, 1.0)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )

    val_transform = transforms.Compose(
        [
            transforms.Resize(resize_size),
            transforms.CenterCrop(image_size),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )

    return train_transform, val_transform


def _file_fingerprint(path: Path) -> str:
    hasher = hashlib.sha1()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def _source_token(path: Path) -> str | None:
    stem = path.stem
    if "___" not in stem:
        return None

    token = stem.split("___")[-1].strip().lower()
    return token or None


def _build_group_keys(base_dataset, group_exact_duplicates: bool):
    if not group_exact_duplicates:
        return {idx: f"sample:{idx}" for idx in range(len(base_dataset.samples))}

    hash_to_group = {}
    sample_to_group = {}

    for idx, (sample_path, label) in enumerate(base_dataset.samples):
        path = Path(sample_path)
        token = _source_token(path)
        if token is not None:
            group_key = f"class:{label}:source:{token}"
        else:
            digest = _file_fingerprint(path)
            group_key = hash_to_group.setdefault(digest, f"class:{label}:fp:{digest}")
        sample_to_group[idx] = group_key

    return sample_to_group


def create_dataloaders(config: DatasetConfig):
    dataset_root = Path(config.dataset_path)
    if not dataset_root.is_absolute():
        dataset_root = (Path(__file__).resolve().parent / dataset_root).resolve()
    if not dataset_root.exists():
        raise FileNotFoundError(f"Dataset path does not exist: {dataset_root}")

    base_dataset = datasets.ImageFolder(dataset_root)
    num_classes = len(base_dataset.classes)

    split_path = Path(__file__).resolve().parent / config.split_file
    train_indices = []
    val_indices = []

    split_metadata = {
        "split_version": config.split_version,
        "dataset_path": str(dataset_root),
        "dataset_size": len(base_dataset),
        "train_split": config.train_split,
        "seed": config.seed,
        "group_exact_duplicates": config.group_exact_duplicates,
    }

    if split_path.exists():
        saved_split = torch.load(split_path, map_location="cpu")
        if saved_split.get("metadata") == split_metadata:
            train_indices = saved_split["train_indices"]
            val_indices = saved_split["val_indices"]

    if not train_indices or not val_indices:
        indices_by_class = defaultdict(lambda: defaultdict(list))
        sample_to_group = _build_group_keys(base_dataset, config.group_exact_duplicates)

        for idx, (_, label) in enumerate(base_dataset.samples):
            indices_by_class[label][sample_to_group[idx]].append(idx)

        rng = random.Random(config.seed)
        for label in sorted(indices_by_class.keys()):
            grouped_indices = list(indices_by_class[label].values())
            rng.shuffle(grouped_indices)

            group_sizes = [len(group) for group in grouped_indices]
            target_train_count = int(sum(group_sizes) * config.train_split)

            running_train_count = 0
            train_groups = []
            val_groups = []

            for group in grouped_indices:
                if running_train_count < target_train_count:
                    train_groups.append(group)
                    running_train_count += len(group)
                else:
                    val_groups.append(group)

            if not train_groups and val_groups:
                train_groups.append(val_groups.pop())
            if not val_groups and len(train_groups) > 1:
                val_groups.append(train_groups.pop())

            class_train_indices = [idx for group in train_groups for idx in group]
            class_val_indices = [idx for group in val_groups for idx in group]

            if not class_val_indices and class_train_indices:
                class_val_indices.append(class_train_indices.pop())
            if not class_train_indices and class_val_indices:
                class_train_indices.append(class_val_indices.pop())

            train_indices.extend(class_train_indices)
            val_indices.extend(class_val_indices)

        torch.save(
            {
                "metadata": split_metadata,
                "train_indices": train_indices,
                "val_indices": val_indices,
            },
            split_path,
        )

    train_subset = Subset(base_dataset, train_indices)
    val_subset = Subset(base_dataset, val_indices)

    class_counts = [0] * num_classes
    for idx in train_indices:
        label = base_dataset.samples[idx][1]
        class_counts[label] += 1

    sampler = None
    if config.use_weighted_sampler:
        sample_weights = []
        for idx in train_indices:
            label = base_dataset.samples[idx][1]
            count = max(class_counts[label], 1)
            sample_weights.append(1.0 / count)
        sampler = WeightedRandomSampler(
            weights=torch.DoubleTensor(sample_weights),
            num_samples=len(sample_weights),
            replacement=True,
        )

    train_transform, val_transform = build_transforms(config.image_size)
    train_dataset = TransformSubset(train_subset, train_transform)
    val_dataset = TransformSubset(val_subset, val_transform)

    train_loader = DataLoader(
        train_dataset,
        batch_size=config.batch_size,
        shuffle=sampler is None,
        sampler=sampler,
        num_workers=config.num_workers,
        pin_memory=torch.cuda.is_available(),
        persistent_workers=config.num_workers > 0,
        prefetch_factor=2 if config.num_workers > 0 else None,
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=config.batch_size,
        shuffle=False,
        num_workers=config.num_workers,
        pin_memory=torch.cuda.is_available(),
        persistent_workers=config.num_workers > 0,
        prefetch_factor=2 if config.num_workers > 0 else None,
    )

    return train_loader, val_loader, base_dataset.classes, num_classes, class_counts
