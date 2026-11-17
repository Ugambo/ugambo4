#!/usr/bin/env python3
"""Turns a picture (the emailed ticket QR code) into a one-frame Y4M video, which Chromium can use as a
fake phone camera (--use-file-for-fake-video-capture). Used by tests/e2e/phase15-journeys.js.
Usage: python3 png-to-y4m.py in.png out.y4m
"""
import sys
from PIL import Image

W, H = 640, 480
src = Image.open(sys.argv[1]).convert('RGB')
side = int(H * 0.8)
src = src.resize((side, side), Image.NEAREST)
frame = Image.new('RGB', (W, H), (255, 255, 255))
frame.paste(src, ((W - side) // 2, (H - side) // 2))
y, u, v = frame.convert('YCbCr').split()
u = u.resize((W // 2, H // 2), Image.BILINEAR)
v = v.resize((W // 2, H // 2), Image.BILINEAR)
with open(sys.argv[2], 'wb') as f:
    f.write(b'YUV4MPEG2 W%d H%d F10:1 Ip A1:1 C420jpeg\n' % (W, H))
    for _ in range(2):
        f.write(b'FRAME\n' + y.tobytes() + u.tobytes() + v.tobytes())
