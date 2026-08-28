# Wipeout Visual Upgrade Design

## Goal

Transform the functional prototype into a polished, TV-readable, stylized
obstacle-show arena without changing the five-action control model, course
layout, scoring, checkpoints, or input integrations.

The visual target is a sunny, playful broadcast set: saturated red, yellow,
blue, and green inflatables; chunky proportions; glossy padded surfaces; clear
hazard silhouettes; a visible ocean horizon; and an energetic television
presentation. The contestant remains the generated cartoon 3D character based
on a real person.

## Visual principles

- Readable from a couch at 1080p: strong silhouettes, large graphics, and no
  gameplay-critical fine detail.
- Obstacles look soft, oversized, and amusing rather than industrial or
  dangerous.
- One coherent style family across generated assets. Every model reference is
  derived from a shared Gemini style sheet before Tripo3D conversion.
- Original fictional arena branding and graphics. Do not reproduce a real
  television network logo or exact production artwork.
- Gameplay always wins over decoration: visual meshes may change, but collision
  bounds and action timing remain stable.

## Arena composition

The existing blue void becomes a complete outdoor game-show arena:

- A reflective animated ocean extends to a distinct sunny horizon.
- Floating course modules use rounded inflatable shells over the existing tile
  positions.
- Spectator stands, camera towers, buoys, flags, safety barriers, and distant
  set structures frame the course without obstructing the chase camera.
- Repeated decorations use instances and simplified distant meshes.
- The finish zone receives a prominent arch, podium, lights, flags, and
  celebratory effects.

## Generated asset set

Use **$10 as the initial planning budget**, not a hard ceiling. Review each
generated reference image before paying for its GLB conversion. Use
normal-quality Tripo3D unless a reference review shows that a hero asset needs
HD. If quality or coverage warrants additional spend, report the assets, cost,
and reason before exceeding the current estimate.

1. Arena style sheet (Gemini): shared palette, material language, and shapes.
2. Inflatable platform module kit: straight tile, checkpoint tile, edge bumper.
3. Big Ball assembly: padded ball plus floating mount.
4. Sweeper assembly: soft hub, padded rotating arm, oversized end caps.
5. Punching-wall assembly: colorful wall tower and padded piston.
6. Moving platform: floating inflatable raft with grip surface.
7. Finish gate: arch, checkered panel, podium, and light housings.
8. Spectator stand: modular low-poly crowd stand.
9. Broadcast camera tower: camera, platform, and support.
10. Arena prop kit: buoys, flags, warning markers, and fictional signage.
11. Decal sheet: warning stripes, checkpoint marks, lane numbers, and original
    arena graphics.

Generated outputs live under `game/src/assets/` and every paid generation is
recorded in the README asset table with source, in-game size, path, and cost.
Source references and rig/conversion sidecars remain available so jobs can be
resumed without double charging.

## Engine integration

`game/src/game/builder.ts` continues to own course construction. Visual assets
attach to the existing row/lane transforms while the existing logical course
grid remains authoritative.

`game/src/game/hazards.ts` keeps hazard timing and hit detection. Each hazard
class gains a visual root containing the imported model; moving/rotating parts
follow the same transforms currently driving the primitive meshes.

Loading is centralized in a small asset catalog module. It:

- Imports GLB URLs through Vite.
- Loads each unique model once.
- Creates instances or clones for repeated props.
- Falls back to the current primitive visual if an asset cannot load.
- Exposes a readiness promise so proof capture waits for hero assets.

Materials use Babylon PBR where practical. The water and sky remain
engine-generated because procedural animation and lighting are more coherent
and cheaper than static generated backgrounds.

## Motion and effects

- Player actions receive subtle squash, lean, and landing recovery layered over
  existing animation clips.
- Hazard hits add a short camera impulse, impact flash, and stronger directional
  tumble.
- Water impacts use a larger multi-stage splash with foam rings.
- Checkpoints trigger a brief banner and particle burst.
- The finish triggers confetti, flashing gate lights, and a short camera push.
- Effects must not delay input, obscure the player, or alter collision timing.
  Camera motion includes a reduced-motion toggle.

## Broadcast UI

The current screen flow remains unchanged. UI receives a broadcast package:

- Framed timer, score, and heart/life panels with safe TV margins.
- A short checkpoint lower-third and final-run presentation.
- Voice and camera indicators retain clear text plus simple icons.
- Menu focus becomes more prominent for remote navigation.
- UI must remain legible at both 1280×720 and 1920×1080.

## Real-human gesture contract

Camera control is driven by an actual person moving in front of the webcam, not
by simulated gestures. The foundational mapping is literal and in place:

- A person physically jumping in place emits one `jump` action and produces one
  on-screen jump.
- The action is edge-triggered so remaining airborne, landing bounce, or noisy
  pose frames do not emit repeated jumps.
- Calibration, confidence thresholds, cooldowns, and accessibility alternatives
  are tuned using real-human play sessions on the target camera and mini-PC.
- Additional mappings for forward, back, left, and right will be finalized
  after real-world play testing. Their implementation remains isolated behind
  the existing normalized action bus, so later decisions do not alter gameplay.

## Performance and resilience

- Target 60 FPS at 1080p on the intended mini-PC; minimum acceptable is a stable
  30 FPS.
- Repeated geometry uses instances, textures are compressed/resized for their
  display size, and distant set dressing has lower detail.
- Generated GLBs are inspected for unnecessary animation, oversized textures,
  and excessive mesh counts before integration.
- Missing or failed assets fall back to existing primitives so the game always
  remains playable.

## Verification

1. Production build completes without TypeScript errors.
2. Automated playthrough reaches the finish and exercises one intentional
   wipeout.
3. Visual review covers title, menu, early course, Big Balls, sweeper, moving
   platform, and finish at 720p and 1080p.
4. Remote, voice, and camera sources still emit the same normalized actions.
5. A real person jumping in place produces exactly one on-screen jump during a
   target-hardware calibration session.
6. WebGL runtime has no uncaught errors or failed required asset requests.
7. A new 15–20 second proof video is watched back before delivery.
8. README status and asset-cost table match the files actually shipped.

## Out of scope

- New course layouts, multiplayer, or additional game modes.
- Final forward/back/left/right body gestures beyond the current provisional
  mappings; those will be decided after real-human play testing.
- Offline speech recognition.
- Exact reproduction of a real television set, logo, or branded graphics.
