"""
Export EfficientNet-B6 -> ONNX FP32 -> ONNX INT8 quantized.

Usage:  python export_onnx.py

Produces: weights/efficientnet_plant.onnx
"""
import os, sys
os.environ["PYTHONIOENCODING"] = "utf-8"

import warnings
warnings.filterwarnings("ignore")

import torch
import torchvision.models as models
from pathlib import Path

WD  = Path(__file__).parent / "weights"
PTH = WD / "efficientnet_plant.pth"


def main():
    # ── build model ──
    m = models.efficientnet_b6(weights=None)
    m.classifier[1] = torch.nn.Linear(m.classifier[1].in_features, 38)
    m.load_state_dict(torch.load(PTH, map_location="cpu"))
    m.eval()

    # ── FP32 ONNX (use external data to keep file size small) ──
    onnx_fp32 = WD / "efficientnet_plant_fp32.onnx"
    torch.onnx.export(
        m, torch.randn(1, 3, 384, 384), str(onnx_fp32),
        opset_version=18, input_names=["input"], output_names=["logits"],
    )
    mb = onnx_fp32.stat().st_size / 1024 / 1024
    print(f"[OK] FP32 export: {mb:.2f} MB")

    # ── clean shape annotations ──
    import onnx
    model = onnx.load(str(onnx_fp32))

    # Strip value_info — intermediate shape annotations that cause
    # the quantizer's internal shape inference to fail
    model.graph.ClearField("value_info")

    # Clean shape inference with the stripped graph
    model = onnx.shape_inference.infer_shapes(model)
    onnx_fp32_clean = WD / "efficientnet_plant_clean.onnx"
    onnx.save(model, str(onnx_fp32_clean))
    mb = onnx_fp32_clean.stat().st_size / 1024 / 1024
    print(f"[OK] Clean model: {mb:.2f} MB")

    # ── INT8 quantisation ──
    from onnxruntime.quantization import quantize_dynamic, QuantType
    onnx_int8 = WD / "efficientnet_plant.onnx"
    quantize_dynamic(
        str(onnx_fp32_clean), str(onnx_int8),
        weight_type=QuantType.QUInt8,
    )
    mb = onnx_int8.stat().st_size / 1024 / 1024
    print(f"[OK] INT8 quantized: {mb:.2f} MB")
    print("Done!")


if __name__ == "__main__":
    main()
