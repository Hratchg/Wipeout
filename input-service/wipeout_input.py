#!/usr/bin/env python3
"""Wipeout camera input service.

Watches the player through a webcam with YOLO26-pose and converts body
movement into game actions, streamed as JSON over a WebSocket:

    {"type": "action", "action": "left|right|forward|back|jump"}
    {"type": "status", "status": "tracking|no-person|calibrating"}

Gestures (relative to a calibrated neutral stance):
    step/lean left/right  -> left / right   (re-arms when you return to center)
    jump (hips rise fast) -> jump
    step toward camera    -> forward        (you appear bigger)
    step away from camera -> back           (you appear smaller)

Usage:
    python3 wipeout_input.py [--camera 0] [--port 8765] [--preview]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import threading
import time
from dataclasses import dataclass, field

import cv2
import numpy as np
from ultralytics import YOLO

# COCO keypoint indices
L_SHOULDER, R_SHOULDER = 5, 6
L_HIP, R_HIP = 11, 12

CALIBRATION_FRAMES = 40
KEYPOINT_CONF = 0.35

# Gesture thresholds (fractions of calibrated torso height unless noted)
SIDE_ENTER = 0.85  # hips off-center by this much -> lane action
SIDE_EXIT = 0.45  # back within this -> re-armed
JUMP_RISE = 0.32  # hips above baseline by this much -> jump
JUMP_COOLDOWN_S = 0.9
DEPTH_FWD_ENTER = 1.18  # torso apparent size ratio -> forward
DEPTH_BACK_ENTER = 0.85  # -> back
DEPTH_EXIT_LOW, DEPTH_EXIT_HIGH = 0.93, 1.09  # neutral band to re-arm
BASELINE_EMA = 0.01  # slow drift adaptation while neutral


@dataclass
class Baseline:
    center_x: float = 0.0
    hip_y: float = 0.0
    torso_h: float = 1.0
    samples: list = field(default_factory=list)

    @property
    def ready(self) -> bool:
        return len(self.samples) >= CALIBRATION_FRAMES

    def add_sample(self, center_x: float, hip_y: float, torso_h: float) -> None:
        self.samples.append((center_x, hip_y, torso_h))
        if self.ready:
            arr = np.array(self.samples[-CALIBRATION_FRAMES:])
            self.center_x = float(np.median(arr[:, 0]))
            self.hip_y = float(np.median(arr[:, 1]))
            self.torso_h = max(float(np.median(arr[:, 2])), 1e-3)

    def drift(self, center_x: float, torso_h: float) -> None:
        self.center_x += BASELINE_EMA * (center_x - self.center_x)
        self.torso_h += BASELINE_EMA * (torso_h - self.torso_h)


class GestureMapper:
    """Edge-triggered gesture detection against the calibrated neutral pose."""

    def __init__(self) -> None:
        self.baseline = Baseline()
        self.side_state = "center"  # center | left | right
        self.depth_state = "neutral"  # neutral | forward | back
        self.jump_armed = True
        self.last_jump = 0.0
        self.missing_since: float | None = None

    def reset(self) -> None:
        self.__init__()

    def process(self, kpts: np.ndarray | None, now: float) -> list[str]:
        """kpts: (17, 3) array of x, y, confidence in mirrored image coords."""
        if kpts is None:
            if self.missing_since is None:
                self.missing_since = now
            elif now - self.missing_since > 3.0:
                self.reset()  # person left: recalibrate on return
            return []
        self.missing_since = None

        needed = kpts[[L_SHOULDER, R_SHOULDER, L_HIP, R_HIP]]
        if (needed[:, 2] < KEYPOINT_CONF).any():
            return []

        shoulder_mid = (kpts[L_SHOULDER][:2] + kpts[R_SHOULDER][:2]) / 2
        hip_mid = (kpts[L_HIP][:2] + kpts[R_HIP][:2]) / 2
        torso_h = float(np.linalg.norm(shoulder_mid - hip_mid))
        center_x, hip_y = float(hip_mid[0]), float(hip_mid[1])

        b = self.baseline
        if not b.ready:
            b.add_sample(center_x, hip_y, torso_h)
            return []

        actions: list[str] = []
        dx = (center_x - b.center_x) / b.torso_h
        dy = (b.hip_y - hip_y) / b.torso_h  # positive = hips rose
        depth_ratio = torso_h / b.torso_h

        # Lane changes
        if self.side_state == "center":
            if dx < -SIDE_ENTER:
                self.side_state = "left"
                actions.append("left")
            elif dx > SIDE_ENTER:
                self.side_state = "right"
                actions.append("right")
        elif abs(dx) < SIDE_EXIT:
            self.side_state = "center"

        # Jump. Gate on a near-neutral torso size: when you step toward the
        # camera your hips also rise in the image, which is not a jump.
        depth_neutral = 0.9 < depth_ratio < 1.12
        if self.jump_armed:
            if (
                dy > JUMP_RISE
                and depth_neutral
                and now - self.last_jump > JUMP_COOLDOWN_S
            ):
                self.jump_armed = False
                self.last_jump = now
                actions.append("jump")
        elif dy < JUMP_RISE * 0.4:
            self.jump_armed = True

        # Depth (forward/back). Suppress during a jump so the flailing
        # silhouette doesn't fake a depth change.
        if now - self.last_jump > 0.7:
            if self.depth_state == "neutral":
                if depth_ratio > DEPTH_FWD_ENTER:
                    self.depth_state = "forward"
                    actions.append("forward")
                elif depth_ratio < DEPTH_BACK_ENTER:
                    self.depth_state = "back"
                    actions.append("back")
            elif DEPTH_EXIT_LOW < depth_ratio < DEPTH_EXIT_HIGH:
                self.depth_state = "neutral"

        # Adapt slowly to drift only when fully neutral.
        if (
            self.side_state == "center"
            and self.depth_state == "neutral"
            and abs(dy) < 0.1
        ):
            b.drift(center_x, torso_h)

        return actions


class Broadcaster:
    """Thread-safe fanout from the inference thread to websocket clients."""

    def __init__(self) -> None:
        self.clients: set = set()
        self.loop: asyncio.AbstractEventLoop | None = None

    def send(self, payload: dict) -> None:
        if self.loop is None or not self.clients:
            return
        data = json.dumps(payload)
        for ws in list(self.clients):
            self.loop.call_soon_threadsafe(
                lambda w=ws: asyncio.ensure_future(self._safe_send(w, data))
            )

    @staticmethod
    async def _safe_send(ws, data: str) -> None:
        try:
            await ws.send(data)
        except Exception:
            pass


def pick_person(result) -> np.ndarray | None:
    """Largest detected person's keypoints as (17, 3), or None."""
    kp = result.keypoints
    if kp is None or kp.data is None or len(kp.data) == 0:
        return None
    boxes = result.boxes
    if boxes is None or len(boxes) == 0:
        return None
    areas = (boxes.xyxy[:, 2] - boxes.xyxy[:, 0]) * (
        boxes.xyxy[:, 3] - boxes.xyxy[:, 1]
    )
    idx = int(areas.argmax())
    return kp.data[idx].cpu().numpy()


def draw_preview(frame, kpts, mapper: GestureMapper, fps: float) -> None:
    h, w = frame.shape[:2]
    b = mapper.baseline
    if kpts is not None:
        for x, y, c in kpts:
            if c > KEYPOINT_CONF:
                cv2.circle(frame, (int(x), int(y)), 4, (0, 255, 120), -1)
    if b.ready:
        cx = int(b.center_x)
        span = int(SIDE_ENTER * b.torso_h)
        cv2.line(frame, (cx, 0), (cx, h), (255, 255, 0), 1)
        for sx in (cx - span, cx + span):
            cv2.line(frame, (sx, 0), (sx, h), (0, 140, 255), 1)
        label = f"side:{mapper.side_state} depth:{mapper.depth_state} fps:{fps:.0f}"
    else:
        label = f"CALIBRATING {len(b.samples)}/{CALIBRATION_FRAMES} - stand still"
    cv2.putText(
        frame, label, (12, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2
    )


def inference_loop(args, broadcaster: Broadcaster, stop: threading.Event) -> None:
    model = YOLO(args.model)
    source = int(args.camera) if str(args.camera).isdigit() else args.camera
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        raise SystemExit(f"Cannot open camera source {args.camera}")

    mapper = GestureMapper()
    last_status = 0.0
    frame_times: list[float] = []

    while not stop.is_set():
        ok, frame = cap.read()
        if not ok:
            time.sleep(0.05)
            continue
        if args.mirror:
            frame = cv2.flip(frame, 1)

        now = time.monotonic()
        results = model(frame, imgsz=args.imgsz, verbose=False)
        kpts = pick_person(results[0])
        actions = mapper.process(kpts, now)

        for action in actions:
            broadcaster.send({"type": "action", "action": action})
            print(f"[action] {action}", flush=True)

        if now - last_status > 1.0:
            last_status = now
            if kpts is None:
                status = "no-person"
            elif not mapper.baseline.ready:
                status = "calibrating"
            else:
                status = "tracking"
            broadcaster.send({"type": "status", "status": status})

        frame_times.append(now)
        frame_times[:] = [t for t in frame_times if now - t < 2.0]
        if args.preview:
            fps = len(frame_times) / 2.0
            draw_preview(frame, kpts, mapper, fps)
            cv2.imshow("Wipeout input service", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                stop.set()

    cap.release()
    if args.preview:
        cv2.destroyAllWindows()


async def run_server(args, broadcaster: Broadcaster, stop: threading.Event) -> None:
    import websockets

    broadcaster.loop = asyncio.get_running_loop()

    async def handler(ws):
        broadcaster.clients.add(ws)
        print(f"[ws] client connected ({len(broadcaster.clients)} total)", flush=True)
        try:
            await ws.wait_closed()
        finally:
            broadcaster.clients.discard(ws)

    async with websockets.serve(handler, "0.0.0.0", args.port):
        print(f"[ws] listening on :{args.port}", flush=True)
        while not stop.is_set():
            await asyncio.sleep(0.2)


def main() -> None:
    parser = argparse.ArgumentParser(description="Wipeout camera input service")
    parser.add_argument(
        "--camera", default="0", help="camera index or a video file path (for testing)"
    )
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--model", default="yolo26n-pose.pt")
    parser.add_argument("--imgsz", type=int, default=416)
    parser.add_argument("--preview", action="store_true", help="show debug window")
    parser.add_argument(
        "--no-mirror",
        dest="mirror",
        action="store_false",
        help="disable horizontal flip (mirror is on by default so your left = game left)",
    )
    args = parser.parse_args()

    stop = threading.Event()
    broadcaster = Broadcaster()
    thread = threading.Thread(
        target=inference_loop, args=(args, broadcaster, stop), daemon=True
    )
    thread.start()

    try:
        asyncio.run(run_server(args, broadcaster, stop))
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        thread.join(timeout=3)


if __name__ == "__main__":
    main()
