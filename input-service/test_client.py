#!/usr/bin/env python3
"""Connects to the input service and prints every message for N seconds."""

import asyncio
import json
import sys

import websockets


async def main(duration: float) -> None:
    actions = []
    statuses = set()
    async with websockets.connect("ws://localhost:8765") as ws:
        loop = asyncio.get_running_loop()
        end = loop.time() + duration
        while loop.time() < end:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=end - loop.time())
            except asyncio.TimeoutError:
                break
            msg = json.loads(raw)
            if msg.get("type") == "action":
                actions.append(msg["action"])
                print("ACTION:", msg["action"], flush=True)
            else:
                statuses.add(msg.get("status"))
    print("ACTIONS:", actions)
    print("STATUSES:", sorted(statuses))


if __name__ == "__main__":
    asyncio.run(main(float(sys.argv[1]) if len(sys.argv) > 1 else 20))
