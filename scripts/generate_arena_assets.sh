#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="$ROOT/.venv-assets/bin/python"
TOOL="$ROOT/.claude/skills/asset-gen/tools/asset_gen.py"
ARENA_DIR="$ROOT/game/src/assets/arena"
REFS_DIR="$ARENA_DIR/refs"
STYLE_SHEET="$REFS_DIR/arena_style_sheet.png"
DECALS="$ARENA_DIR/arena_decals.png"
REFERENCES_ONLY=false
RUN_COST_CENTS=0

if [[ "${1:-}" == "--references-only" ]]; then
  REFERENCES_ONLY=true
  shift
fi
if [[ "$#" -ne 0 ]]; then
  echo "Usage: $0 [--references-only]" >&2
  exit 2
fi

mkdir -p "$REFS_DIR"
if [[ ! -x "$PYTHON" ]]; then
  echo "Asset environment not found: $PYTHON" >&2
  exit 1
fi

print_run_cost() {
  printf 'Accumulated cost reported by tools this run: $%d.%02d\n' \
    "$((RUN_COST_CENTS / 100))" "$((RUN_COST_CENTS % 100))"
}
trap print_run_cost EXIT

run_tool() {
  local label="$1"
  shift
  local result
  local status
  local cost

  set +e
  result="$("$PYTHON" "$TOOL" "$@")"
  status=$?
  set -e

  printf '%s: %s\n' "$label" "$result"
  cost="$(
    RESULT="$result" "$PYTHON" -c \
      'import json, os
try:
    print(int(json.loads(os.environ["RESULT"]).get("cost_cents", 0)))
except (json.JSONDecodeError, TypeError, ValueError):
    print(0)'
  )"
  RUN_COST_CENTS=$((RUN_COST_CENTS + cost))
  return "$status"
}

generate_image_if_missing() {
  local output="$1"
  local label="$2"
  shift 2

  if [[ -s "$output" ]]; then
    echo "$label: existing output found; skipping paid generation"
    return
  fi
  run_tool "$label" image "$@" -o "$output"
}

STYLE_PROMPT="Create a single 16:9 visual style sheet for an original sunny ocean obstacle-show arena. Show one coherent arena scene with chunky oversized inflatable forms in saturated red, yellow, blue, and green; glossy and matte padded vinyl; rounded seams; soft playful hazards; floating course modules; spectator structures; camera towers; flags and buoys; and a clear bright ocean horizon. Strong TV-readable silhouettes for 1080p, clean stylized low-poly proportions, cheerful broadcast-set energy. Original fictional visual identity only: no real network logos, no copyrighted production artwork, no words, no labels, no split panels, no multiple views."

generate_image_if_missing \
  "$STYLE_SHEET" \
  "arena style sheet" \
  --model gemini \
  --size 1K \
  --aspect-ratio 16:9 \
  --prompt "$STYLE_PROMPT"

while IFS='|' read -r id filename subject; do
  prompt="Using the supplied arena style sheet only as the visual-language reference, create one single centered ${subject}. Three-quarter elevated view, complete uncropped silhouette, isolated on a uniform solid light-gray studio background. Match the saturated red, yellow, blue, and green palette and chunky playful proportions. Matte and glossy padded vinyl with rounded seams, soft oversized forms, opaque parts, simplified TV-readable details, clean stylized low-poly game-asset design. Exactly one object and one view; no scene, no floor clutter, no extra loose parts, no text, no letters, no numbers, no logos, no watermark, no checkerboard, no transparent background."
  generate_image_if_missing \
    "$REFS_DIR/$filename.png" \
    "$id reference" \
    --model gemini \
    --size 1K \
    --aspect-ratio 1:1 \
    --image "$STYLE_SHEET" \
    --prompt "$prompt"
done <<'ASSETS'
platform|platform|modular square inflatable course platform with an integrated grip-top checkpoint panel and thick edge bumpers, built as one connected object
ballMount|ball_mount|Big Ball obstacle assembly: one oversized padded red inflatable sphere securely seated in one compact floating blue-and-yellow ring mount, all connected as one object
sweeperHub|sweeper_hub|freestanding cylindrical inflatable sweeper hub tower with a clearly defined side axle socket but no arm attached
sweeperArm|sweeper_arm|long horizontal padded sweeper arm with oversized rounded end caps and a central attachment collar, shown without a hub
pistonWall|piston_wall|tall colorful inflatable punching-wall tower with one clean circular piston opening, shown without a piston pad
pistonPad|piston_pad|short isolated padded piston ram with a wide rounded striking cushion and compact rear shaft, shown without a wall
movingPlatform|moving_platform|floating rectangular inflatable moving-platform raft with a broad grip surface and thick rounded perimeter tubes
finishGate|finish_gate|wide celebratory inflatable finish-gate assembly combining an arch, three plain unmarked podium blocks with completely blank faces, checkered icon panel, and chunky light housings as one connected object
spectatorStand|spectator_stand|modular low-poly spectator grandstand with colorful canopy, simplified seated crowd shapes, safety rails, and one connected base
cameraTower|camera_tower|compact unoccupied broadcast camera tower with padded support column, empty raised platform, safety rail, and oversized stylized camera with completely blank unmarked body panels as one connected object; no operator, no person, no control console
arenaProps|arena_props|one connected floating arena-prop cluster combining buoys, safety marker, two flags, warning paddle, and original icon sign on a shared padded base
ASSETS

DECAL_PROMPT="Using the supplied arena style sheet only as the visual-language reference, create one clean square decal atlas for a stylized obstacle-course video game. Arrange large isolated flat graphic tiles on a uniform solid light-gray background: bold diagonal warning stripes, a checkered finish pattern, lane arrows, checkpoint rings, splash icons, stars, hearts, and original abstract arena emblems. Use saturated red, yellow, blue, green, black, and white with thick outlines and high contrast so every symbol remains legible when the sheet is reduced to 256 pixels. Crisp front-facing 2D vector-like graphics only. No perspective, no mockup, no object, no tiny detail, no words, no letters, no numbers, no real logos, no malformed characters, no watermark, no checkerboard, no transparent background."
generate_image_if_missing \
  "$DECALS" \
  "arena decal sheet" \
  --model gemini \
  --size 1K \
  --aspect-ratio 1:1 \
  --image "$STYLE_SHEET" \
  --prompt "$DECAL_PROMPT"

if [[ "$REFERENCES_ONLY" == true ]]; then
  echo "References are ready for visual review; no Tripo conversions were submitted."
  exit 0
fi

convert_reference() {
  local id="$1"
  local filename="$2"
  local reference="$REFS_DIR/$filename.png"
  local output="$ARENA_DIR/$filename.glb"
  local sidecar="$output.tripo.json"

  # This ordering is the paid-submit guard: an output or resumable task always wins.
  if [[ -s "$output" ]]; then
    echo "$id GLB: existing output found; skipping Tripo submission"
    return
  fi
  if [[ -s "$sidecar" ]]; then
    run_tool "$id GLB resume" resume -o "$output"
    return
  fi
  if ! run_tool "$id GLB submit" glb \
      --image "$reference" \
      --quality default \
      -o "$output"; then
    if [[ -s "$sidecar" && ! -s "$output" ]]; then
      echo "$id GLB: submitted task is resumable; resuming without a new charge"
      run_tool "$id GLB resume" resume -o "$output"
    else
      return 1
    fi
  fi
}

while IFS='|' read -r id filename; do
  convert_reference "$id" "$filename"
done <<'ASSETS'
platform|platform
ballMount|ball_mount
sweeperHub|sweeper_hub
sweeperArm|sweeper_arm
pistonWall|piston_wall
pistonPad|piston_pad
movingPlatform|moving_platform
finishGate|finish_gate
spectatorStand|spectator_stand
cameraTower|camera_tower
arenaProps|arena_props
ASSETS
