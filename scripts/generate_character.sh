#!/usr/bin/env bash
# Full Tripo3D character pipeline: rig from the contestant reference, then
# retarget idle/run/jump clips. Safe to re-run: uses `resume` when a
# .tripo.json sidecar exists so nothing is double-charged.
set -uo pipefail
cd "$(dirname "$0")/.."

PY=.venv-assets/bin/python
TOOL=.claude/skills/asset-gen/tools/asset_gen.py
REF=game/src/assets/img/contestant_ref.png
RIGGED=game/assets-src/char_rigged.glb
GLB_DIR=game/src/assets/glb

mkdir -p game/assets-src

run_or_resume() {
  local out=$1; shift
  if [ -f "$out.tripo.json" ] && [ ! -f "$out" ]; then
    echo "== resuming $out"
    $PY "$TOOL" resume -o "$out"
  elif [ -f "$out" ]; then
    echo "== $out already exists, skipping"
  else
    echo "== generating $out"
    "$@"
    # A timeout still saves the sidecar; resume instead of resubmitting.
    if [ ! -f "$out" ] && [ -f "$out.tripo.json" ]; then
      echo "== timed out, resuming $out"
      $PY "$TOOL" resume -o "$out"
    fi
  fi
  [ -f "$out" ] || { echo "FAILED: $out"; exit 1; }
}

run_or_resume "$RIGGED" $PY "$TOOL" rig --image "$REF" -o "$RIGGED"

for clip in idle run jump; do
  run_or_resume "$GLB_DIR/char_$clip.glb" \
    $PY "$TOOL" retarget --rigged "$RIGGED" \
    --animation "preset:biped:$clip" -o "$GLB_DIR/char_$clip.glb"
done

echo "CHARACTER_PIPELINE_DONE"
