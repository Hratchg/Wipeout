# WIPEOUT — The Living Room Obstacle Course

A TV-show-style Wipeout obstacle course game built with Babylon.js, designed
for a TV driven by a mini-PC. Three ways to play, all interchangeable:

- **Remote / 4 buttons** — the mini-PC's remote (any HID/keyboard device)
- **Voice** — say "jump", "left", "right", "straight"/"forward", "back"
- **Camera** — a webcam + YOLO26 pose tracking: step left/right, step
  toward/away from the camera, and physically jump

## What is built

- Full 3-lane, 23-row obstacle course over water: gaps, holes, the Big Balls
  (bounce timing), a rotating sweeper arm around a hub pillar, punching-wall
  pistons, and a side-to-side moving platform.
- Discrete grid movement (step/leap) so all three input methods feel the same:
  `forward`, `back`, `left`, `right` step one tile; `jump` leaps a water gap
  immediately ahead (and only then).
- 3 lives, checkpoints with respawn, timer, score with time bonus, comedic
  physics tumble into the water on hazard hits.
- 10-foot broadcast UI with a `SPLASH ARENA` ribbon, remote-navigable control
  cards, safe-margin HUD panels, input-status icons, animated checkpoint/final
  lower-thirds, and framed result screens that leave finish confetti readable.
- Remote button remapping: press **F2** for the keycode-discovery overlay
  (press any remote button, then 1–5 to bind it).
- Rigged, animated 3D contestant generated from a stylized reference image
  (Tripo3D rig + retargeted idle/run/jump clips).
- Resume-safe generated arena asset contract with a shared visual style sheet,
  eleven optimized GLBs, reviewed references, decals, exact costs, dimensions,
  primitive fallback descriptions, and a resilient runtime catalog that loads
  each model once without letting individual failures block startup.
- Sunny broadcast arena integration: animated ocean and gradient sky, warm/cool
  show lighting, generated platform tiles and finish gate, spectator stands,
  camera towers, course-edge buoy/flag clusters, and shared checkpoint/warning
  decals. Generated visuals preserve the logical course and only disable their
  matching procedural fallback after successful instantiation.
- Generated hero hazard visuals: Big Ball mounts, sweeper hub/arm, piston
  walls/pads, and moving platform. Primitive gameplay surfaces and fallback
  meshes remain authoritative for timing and collision behavior.
- Reusable impact, foam-ring splash, checkpoint-burst, and three-color finish
  effects; bounded camera feedback; character lean/squash response; and a
  persisted reduced-motion mode that removes the finish push-in.
- Python input service: YOLO26n-pose on the webcam, neutral-stance
  calibration, edge-triggered gestures, WebSocket action stream.

## What is left

- Play-test gesture thresholds with a real person in front of a real webcam
  (`input-service/wipeout_input.py --preview` shows the calibration/skeleton
  debug view) and tune `SIDE_ENTER`, `JUMP_RISE`, `DEPTH_*` constants.
- Voice mode needs internet (Chrome Web Speech API). If the living room is
  noisy or offline, add offline Vosk recognition to the input service.

## Repo layout

- `game/` — Babylon.js + Vite + TypeScript game
- `input-service/` — Python YOLO26 pose → WebSocket action service
- `scripts/` — `start_tv.sh` (kiosk launcher), `generate_character.sh`
- `deploy/` — systemd units for a Linux mini-PC
- `CLAUDE.md`, `babylon.md`, `.claude/skills/asset-gen/` — godogen scaffold

## Running it

```bash
# Game (dev)
cd game && npm install && npm run dev        # http://localhost:5173

# Production web build (static files in game/dist)
cd game && npm run build && npm run preview  # http://localhost:4173

# Input service (camera mode)
cd input-service
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python wipeout_input.py --preview  # --camera N to pick a webcam

# Everything at once, fullscreen kiosk (the TV setup)
./scripts/start_tv.sh          # production build + kiosk Chrome
./scripts/start_tv.sh --dev    # dev server instead
```

On a Linux mini-PC, install the systemd units in `deploy/` and add
`start_tv.sh` (or just the Chrome kiosk line) to the desktop autostart.

Controls: arrows = move, double-tap up = jump,
Space = jump, F2 = remote button setup. Enter still confirms menus.
In the menu, toggle VOICE and CAMERA on, then START GAME. Voice needs mic
permission the first time; camera mode needs the input service running.

## Measured latency (Apple M5 Pro reference machine)

- Remote/keyboard: same-frame (< 16 ms)
- Camera: YOLO26n-pose at 416 px = ~20 ms/frame inference (50 FPS), total
  camera-to-action ≈ 50–100 ms including capture — under the 150 ms target
- Voice: Web Speech interim results, typically 200–500 ms per keyword

## Asset table

| Name | Description | Size | Path | Cost |
|------|-------------|------|------|------|
| contestant_ref | Stylized (Subway-Surfers-like) Wipeout contestant reference, Grok | 1024 px source | `game/src/assets/img/contestant_ref.png` | 4¢ (2 gens) |
| char_rigged | Tripo3D rigged contestant (rig source, not shipped) | 1.6 m tall in game | `game/assets-src/char_rigged.glb` | 55¢ |
| char_idle / char_run / char_jump | Retargeted animation clips (per-clip GLBs) | 1.6 m tall in game | `game/src/assets/glb/char_*.glb` | 10¢ each |
| arena_style_sheet | Shared sunny inflatable-arena style reference, Gemini 1K | 1376×768 px source | `game/src/assets/arena/refs/arena_style_sheet.png` | 7¢ |
| platform | Inflatable course platform, Gemini reference → Tripo normal GLB | 2.25m × 0.55m × 2.25m | `game/src/assets/arena/platform.glb` | 37¢ |
| ballMount | Big Ball and floating mount, Gemini reference → Tripo normal GLB | 2.2m diameter footprint | `game/src/assets/arena/ball_mount.glb` | 37¢ |
| sweeperHub | Inflatable sweeper hub, Gemini reference → Tripo normal GLB | 1.1m diameter × 2.4m high | `game/src/assets/arena/sweeper_hub.glb` | 37¢ |
| sweeperArm | Padded sweeper arm, Gemini reference → Tripo normal GLB | 7.2m × 0.5m × 0.7m | `game/src/assets/arena/sweeper_arm.glb` | 37¢ |
| pistonWall | Inflatable punching-wall tower, Gemini reference → Tripo normal GLB | 0.8m × 2.8m × 2m | `game/src/assets/arena/piston_wall.glb` | 37¢ |
| pistonPad | Padded piston ram, Gemini reference → Tripo normal GLB | 1.2m × 1.4m × 1.5m | `game/src/assets/arena/piston_pad.glb` | 37¢ |
| movingPlatform | Inflatable moving raft, Gemini reference → Tripo normal GLB | 2.3m × 0.5m × 2m | `game/src/assets/arena/moving_platform.glb` | 37¢ |
| finishGate | Finish arch and podium, Gemini references → Tripo normal GLB | 9m × 4m × 1m | `game/src/assets/arena/finish_gate.glb` | 44¢ (1 rejected ref) |
| spectatorStand | Modular crowd stand, Gemini reference → Tripo normal GLB | 12m × 5m × 4m | `game/src/assets/arena/spectator_stand.glb` | 37¢ |
| cameraTower | Unoccupied broadcast tower, Gemini references → Tripo normal GLB | 2m × 5m × 2m | `game/src/assets/arena/camera_tower.glb` | 51¢ (2 rejected refs) |
| arenaProps | Connected buoy, flag, and marker cluster, Gemini reference → Tripo normal GLB | 3m cluster footprint | `game/src/assets/arena/arena_props.glb` | 37¢ |
| arena_decals | TV-readable warning, lane, checkpoint, and arena icon atlas, Gemini 1K | 1024×1024 px source; reviewed at 256 px | `game/src/assets/arena/arena_decals.png` | 7¢ |

Total project spend: ≈ $5.31, including $4.42 for the arena contract. Notes:

- Gemini image generation is now billed and working (verified with a 5¢ test).
  The contestant reference was generated with Grok before billing was enabled.
- The loader (`game/src/game/character.ts`) also supports a single-file
  fallback at `game/src/assets/glb/char_main.glb` (any rigged GLB with
  idle/walk/jump-like animation names) if the per-clip GLBs are absent.
- To regenerate the character end-to-end (resume-safe, no double-charging):
  `./scripts/generate_character.sh`
- Arena generation is resume-safe and stops before Tripo conversion with
  `./scripts/generate_arena_assets.sh --references-only`. The arena cost
  includes rejected references: one finish gate with podium numerals and two
  camera towers with baked-in text or an unwanted operator.

## Architecture

The game only consumes normalized actions (`jump/left/right/forward/back`)
from an action bus; each input method is a plug-in source:

- Keyboard/remote → `game/src/input/keyboard.ts` (remappable, localStorage)
- Voice → `game/src/input/voice.ts` (Web Speech API keyword grammar)
- Camera → `input-service/wipeout_input.py` → WebSocket :8765 →
  `game/src/input/cvSocket.ts`
