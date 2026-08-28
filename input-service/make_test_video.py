#!/usr/bin/env python3
"""Builds a synthetic webcam video for testing the gesture mapper.

Animates the contestant reference image through: neutral (calibration),
step right, neutral, step toward camera (bigger), neutral, jump (up), neutral.
Expected action sequence from the service: right, forward, jump.
"""

import cv2
import numpy as np

SRC = "../game/src/assets/img/contestant_ref.png"
OUT = "/tmp/wipeout_test_input.mp4"
W, H, FPS = 960, 720, 15

person = cv2.imread(SRC)
person = cv2.resize(person, (400, 400))


def frame(dx: int = 0, dy: int = 0, scale: float = 1.0) -> np.ndarray:
    canvas = np.full((H, W, 3), 190, dtype=np.uint8)
    p = cv2.resize(person, None, fx=scale, fy=scale)
    ph, pw = p.shape[:2]
    x = W // 2 - pw // 2 + dx
    y = H - ph - 40 + dy
    x = max(0, min(W - pw, x))
    y = max(0, min(H - ph, y))
    canvas[y : y + ph, x : x + pw] = p
    return canvas


writer = cv2.VideoWriter(OUT, cv2.VideoWriter_fourcc(*"mp4v"), FPS, (W, H))

segments = [
    (dict(), 5.0),  # calibration + settle
    (dict(dx=240), 1.5),  # step right -> "right"
    (dict(), 1.5),  # back to center (re-arm)
    (dict(scale=1.35), 1.5),  # toward camera -> "forward"
    (dict(), 1.5),  # neutral
    (dict(dy=-160), 0.6),  # jump -> "jump"
    (dict(), 2.0),  # settle
]

for params, seconds in segments:
    for _ in range(int(seconds * FPS)):
        writer.write(frame(**params))
writer.release()
print(f"wrote {OUT}")
