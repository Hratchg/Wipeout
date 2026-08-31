#!/usr/bin/env python3
"""Listen to the camera service and score a 10-jump real-human session.

Requires wipeout_input.py on :8765 with a person in front of the webcam.
Stand still until status is tracking, then jump in place ten times.

Pass: exactly 10 jump actions and no other actions.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys

import websockets

TARGET_JUMPS = 10


async def run(duration: float, port: int) -> int:
    actions: list[tuple[float, str]] = []
    statuses: set[str] = set()
    print(
        f"Connecting to ws://localhost:{port} — stand still, then jump "
        f"{TARGET_JUMPS} times with a short pause between jumps.",
        flush=True,
    )
    async with websockets.connect(f"ws://localhost:{port}") as ws:
        loop = asyncio.get_running_loop()
        end = loop.time() + duration
        while loop.time() < end:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=end - loop.time())
            except asyncio.TimeoutError:
                break
            msg = json.loads(raw)
            if msg.get("type") == "action":
                action = msg["action"]
                actions.append((loop.time(), action))
                print(f"ACTION: {action}  ({len([a for _, a in actions if a == 'jump'])} jumps)", flush=True)
                jumps = [a for _, a in actions if a == "jump"]
                extras = [a for _, a in actions if a != "jump"]
                if len(jumps) >= TARGET_JUMPS and not extras:
                    break
            elif msg.get("type") == "status":
                status = msg.get("status")
                if status:
                    statuses.add(status)
                    print(f"STATUS: {status}", flush=True)

    jumps = [a for _, a in actions if a == "jump"]
    extras = [a for _, a in actions if a != "jump"]
    report = {
        "jumps": len(jumps),
        "extras": extras,
        "actions": [a for _, a in actions],
        "statuses": sorted(statuses),
    }
    print(json.dumps(report, indent=2), flush=True)
    if len(jumps) == TARGET_JUMPS and not extras:
        print("PASS: 10 jumps, no extra actions", flush=True)
        return 0
    print(
        f"FAIL: expected {TARGET_JUMPS} jumps and 0 extras; "
        f"got {len(jumps)} jumps and extras={extras}",
        flush=True,
    )
    return 1


def main() -> None:
    parser = argparse.ArgumentParser(description="Real-human jump UAT listener")
    parser.add_argument("--duration", type=float, default=90)
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    sys.exit(asyncio.run(run(args.duration, args.port)))


if __name__ == "__main__":
    main()
