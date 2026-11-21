import io
from pathlib import Path

import torch
import torchvision.transforms as transforms
from PIL import Image
from torchvision import models

from classes import CLASSES

MODEL_NAME = "EfficientNet-B6"
IMAGE_SIZE = 384
MODEL_PATH = Path(__file__).resolve().parent / "weights" / "efficientnet_plant.pth"
MIN_CONFIDENCE = 55.0
HARD_MIN_CONFIDENCE = 45.0
MIN_MARGIN = 10.0
MIN_LEAF_COLOR_RATIO = 0.08
MIN_NATURAL_LEAF_RATIO = 0.35
MAX_DOCUMENT_BACKGROUND_RATIO = 0.32

_device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
_model = None
_transform = transforms.Compose(
    [
        transforms.Resize(int(IMAGE_SIZE * 1.14)),
        transforms.CenterCrop(IMAGE_SIZE),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ]
)


def _build_model() -> torch.nn.Module:
    model = models.efficientnet_b6(weights=None)
    classifier_in_features = model.classifier[1].in_features
    model.classifier[1] = torch.nn.Linear(classifier_in_features, len(CLASSES))
    return model


def load_model() -> None:
    global _model

    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Model weights not found: {MODEL_PATH}")

    model = _build_model()
    state_dict = torch.load(MODEL_PATH, map_location=_device)
    model.load_state_dict(state_dict)
    model = model.to(_device, memory_format=torch.channels_last)
    model.eval()
    _model = model

    print(
        f"[Model] Loaded {MODEL_NAME} from {MODEL_PATH.name} "
        f"on {_device.type.upper()} with input size {IMAGE_SIZE}x{IMAGE_SIZE}"
    )


def _ensure_model_loaded() -> torch.nn.Module:
    if _model is None:
        raise RuntimeError("Model not loaded. Call load_model() before predict().")
    return _model


def _image_scope_metrics(image: Image.Image) -> dict[str, float]:
    rgb_image = image.convert("RGB").resize((160, 160))
    hsv_image = rgb_image.convert("HSV")

    rgb_pixels = list(rgb_image.getdata())
    hsv_pixels = list(hsv_image.getdata())
    leaf_like_pixels = 0
    document_background_pixels = 0

    for (r, g, b), (h, s, v) in zip(rgb_pixels, hsv_pixels):
        is_green = 35 <= h <= 110 and s >= 35 and v >= 25 and g >= r * 0.9 and g >= b * 0.9
        is_yellow_or_brown = 10 <= h < 35 and s >= 30 and v >= 20 and (r >= g or g >= b)
        if is_green or is_yellow_or_brown:
            leaf_like_pixels += 1

        is_white_or_gray_layout = s <= 45 and v >= 150
        if is_white_or_gray_layout:
            document_background_pixels += 1

    total_pixels = max(len(rgb_pixels), 1)
    return {
        "leaf_ratio": leaf_like_pixels / total_pixels,
        "document_background_ratio": document_background_pixels / total_pixels,
    }


def _leaf_color_ratio(image: Image.Image) -> float:
    return _image_scope_metrics(image)["leaf_ratio"]


def predict(image_bytes: bytes) -> dict:
    model = _ensure_model_loaded()

    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    scope_metrics = _image_scope_metrics(image)
    leaf_ratio = scope_metrics["leaf_ratio"]
    document_background_ratio = scope_metrics["document_background_ratio"]
    tensor = _transform(image).unsqueeze(0).to(_device, memory_format=torch.channels_last)

    with torch.no_grad():
        with torch.amp.autocast(device_type=_device.type, enabled=_device.type == "cuda"):
            logits = model(tensor)
        probabilities = torch.softmax(logits, dim=1)[0]

    confidence, predicted = torch.max(probabilities, dim=0)
    top_probs, top_indices = torch.topk(probabilities, k=min(3, len(CLASSES)))
    confidence_pct = confidence.item() * 100
    second_confidence_pct = top_probs[1].item() * 100 if len(top_probs) > 1 else 0.0
    confidence_margin = confidence_pct - second_confidence_pct

    if (
        confidence_pct < MIN_CONFIDENCE
        and document_background_ratio > MAX_DOCUMENT_BACKGROUND_RATIO
        and leaf_ratio < MIN_NATURAL_LEAF_RATIO
    ):
        raise ValueError(
            "This looks like a poster, document, screenshot, or mixed scene rather than a real leaf photo. "
            "Upload a clear close-up photo of a single plant leaf."
        )

    if confidence_pct < HARD_MIN_CONFIDENCE:
        raise ValueError(
            "The model is not confident this is a supported plant leaf disease image. "
            "Upload a clear close-up photo of a single real plant leaf."
        )

    if confidence_pct < MIN_CONFIDENCE and leaf_ratio < MIN_LEAF_COLOR_RATIO:
        raise ValueError(
            "This does not look like a supported plant leaf image. "
            "Upload a real leaf photo with the leaf filling most of the frame."
        )

    if confidence_margin < MIN_MARGIN and leaf_ratio < MIN_LEAF_COLOR_RATIO * 1.5:
        raise ValueError(
            "The image is too ambiguous for reliable diagnosis. "
            "Upload a clearer photo of one plant leaf on a simple background."
        )

    disease = CLASSES[predicted.item()]
    readable = disease.split("___")[-1].replace("_", " ")
    plant = disease.split("___")[0].replace("_", " ")

    return {
        "raw_class": disease,
        "disease": readable,
        "plant": plant,
        "confidence": round(confidence_pct, 2),
        "is_healthy": "healthy" in disease.lower(),
        "model_name": MODEL_NAME,
        "top_predictions": [
            {
                "raw_class": CLASSES[index.item()],
                "label": CLASSES[index.item()].split("___")[-1].replace("_", " "),
                "confidence": round(prob.item() * 100, 2),
            }
            for prob, index in zip(top_probs, top_indices)
        ],
    }
