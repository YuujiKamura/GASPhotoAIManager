#!/usr/bin/env python3
"""
YOLO detection script for construction photos.
Called from Node.js via subprocess.

Usage:
  python yolo_detect.py <image_path> [--model <model_path>] [--conf <threshold>]

Output: JSON with detection results
"""

import argparse
import json
import sys
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description='YOLO detection for construction photos')
    parser.add_argument('image', help='Path to image file')
    parser.add_argument('--model', default=None, help='Path to YOLO model (.pt file)')
    parser.add_argument('--conf', type=float, default=0.25, help='Confidence threshold')
    parser.add_argument('--device', default='cpu', help='Device (cpu or cuda)')
    args = parser.parse_args()

    # Find model
    script_dir = Path(__file__).parent
    model_path = args.model or script_dir / 'yolo-construction.pt'

    if not Path(model_path).exists():
        print(json.dumps({'error': f'Model not found: {model_path}'}))
        sys.exit(1)

    if not Path(args.image).exists():
        print(json.dumps({'error': f'Image not found: {args.image}'}))
        sys.exit(1)

    try:
        from ultralytics import YOLO
    except ImportError:
        print(json.dumps({'error': 'ultralytics not installed. Run: pip install ultralytics'}))
        sys.exit(1)

    # Load model and run inference
    model = YOLO(str(model_path))
    results = model(args.image, conf=args.conf, device=args.device, verbose=False)

    # Extract detections
    detections = []
    for result in results:
        boxes = result.boxes
        for i in range(len(boxes)):
            box = boxes[i]
            detections.append({
                'class_id': int(box.cls[0]),
                'class_name': result.names[int(box.cls[0])],
                'confidence': float(box.conf[0]),
                'bbox': box.xyxy[0].tolist()  # [x1, y1, x2, y2]
            })

    # Sort by confidence
    detections.sort(key=lambda x: x['confidence'], reverse=True)

    output = {
        'image': args.image,
        'model': str(model_path),
        'detections': detections,
        'count': len(detections)
    }

    print(json.dumps(output, ensure_ascii=False))

if __name__ == '__main__':
    main()
