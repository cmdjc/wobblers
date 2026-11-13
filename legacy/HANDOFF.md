# Wobblers: handoff to Claude Code

**Goal of this handoff:** turn `reference/wobblers.html`, a single ~4,800-line HTML file, into a proper JS/HTML project (modules, bundler, tests) **without changing how the game plays or looks.** Treat the reference file as the source of truth for behavior. It was built incrementally through conversation, one feature at a time, so it works but is one giant closure.

---

## 1. What it is

A phone-first (touch) 3D toy that grew into a small surreal story game. You play with jiggly shapes in a box. Later layers add: fluid, legs, arms, a divine floating eye you can summon, a wobbler uprising against the eye (tower or cannon), a "genius" wobbler, and a fourth-wall-breaking awakening where the wobblers realize *you* have been controlling the eye, with three endings.

Tone the user asked for: **weird, surreal, dreamcore, "unsettling-sweet".** Not violent or gory. Peace endings are warm; the villain ending is quiet and sad, and can always be undone.

The player is one person on a phone. Everything is operated by touch (long-press, drag, flick, tap) plus on-screen buttons.

## 2. Package contents

```
handoff.md                 this file
package.json               devDependency: three@0.128.0; scripts: test, serve
reference/wobblers.html    the complete working game (single file, three.js r128 from cdnjs)
tests/smoke.cjs            headless smoke test (see section 11)
```

Run it: `npm run serve` then open `http://localhost:8080/wobblers.html` (ideally on a phone on the same network). Or open the file directly; it only needs internet for the three.js CDN script.

## 3. Honest status: what has and hasn't been verified

- **Behavior/simulation:** verified headlessly with the smoke test (no NaNs; each story path reaches its end state). 18/18 checks pass.
- **Rendering/feel:** **almost never seen by the assistant.** The headless harness stubs out WebGL, so nothing in the *visual* output (fluid look, shader colors, outfit/rig proportions, cell, eye, joints) has been verified by the assistant. The user played it on a phone at least once (they sent a screenshot of a bug, now fixed), but there was no systematic visual QA. **Expect visual rough edges** and tuning needs, especially: metaball fluid thresholds, genius 3D hair/glasses proportions, leg/arm joint proportions, eye shader, cell/bars look.
- **Balance/timing:** every duration, damage number and probability was set by guess and checked only in simulation. See section 8 for the knobs.
- **Performance on real phones:** unmeasured. The fluid solver is the main cost (CPU, ~1.3-2.6 ms/step on a desktop in node; it adapts iterations at runtime if a frame is slow). A midrange phone could be several times slower.

## 4. Architecture of the reference file

One `<script>` containing a single IIFE. Everything is a closure variable. There is no module boundary, no framework, no build step. three.js r128 comes from cdnjs as a global `THREE`.

### 4.1 Coordinate system and camera
- Perspective camera at `(0, 0, CAM_Z=10)`, fov 50, looking down -z.
- The "room" is a box: half-width `hx`, half-depth `hz=1.8`, floor `yMin`, ceiling `yMax`. These are **recomputed from the camera and window size in `resize()`**, so the room always fills the screen above the bottom button bar. (`yMin` accounts for the bar height.) Portrait phone ≈ `hx≈1.8`, `yMax≈3.75`, `yMin≈-2.3`.
- Shapes live in true 3D inside the box, but a weak spring pulls z back to 0 (so everything stays roughly in one plane and the 2D fluid/tower/cannon logic works). Collision is 3D against the six walls, but shape-vs-shape normals can have z.
- The **fluid is 2D** and lives in the z=0 plane. Its bounds are the room rectangle scaled by `k0 = CAM_Z/(CAM_Z-hz)`. Shapes are projected into that plane with `kc = CAM_Z/(CAM_Z - z)`. Look for `kc` in the coupling code.
- Gravity direction is a mode (`gMode`: down, up, drifting, center, spinning). Many systems (legged uprightness, fluid, tower/cannon) assume or force `gMode=0`.

### 4.2 Main loop order (`frame()`, bottom of file)
1. `legBrain` for each legged shape (decides walking, falling, resting; sets `vTarget`, `up`, `side`)
2. `step()` twice at `dt/2` (physics substeps: forces, integration, collisions, walls, jelly, spin)
3. `fluidFrame` (spawn/drain particles, 1-2 solver steps, couple shapes to fluid, upload particle buffer)
4. `rebelFrame` (tower/cannon uprising state machine)
5. `awakeFrame` (awakening: notice, wary, boss, villain, peace)
6. `eyeFrame` (the Eye state machine + sparks)
7. per-object visual update: position, scale, size animation, `updateLegs`, `updateArms`, `updateOutfit`, shader uniforms (`uQ, uRip, uPress, uStone, uSick, uGold, uGray`), `divineStatus`, googly-eye canvas
8. rings, motes, `renderFluidField()` (draws particles to a render target), selection ring, `renderer.render`

Landmine: inside step 7's loop there is `let ex = ..., ey = ...` which **shadows the global Eye object `ey`** for that block. It works because nothing in that block reads the Eye. Rename it when refactoring.

### 4.3 Core per-object record (`addObj`)
A "wobbler" is a plain object `o`. Groups of fields:
- **Identity/render:** `id, shape, mesh, mat (ShaderMaterial), eyes (sprite+canvas), size, sizeT, sx, sy, sz, level`
- **Physics:** `pos, vel, ang, mass, density, bounce, friction, gScale, r (bounding radius incl. legs), rBody, cn/cOff/cRad/wo (compound sphere collider)`
- **Jelly:** `q/qv (squash spring along axis), lag/lagv, rip, p/pv (press dent), wob (-1 rigid .. 4 floppy)`
- **Legs:** `legs, legLen, legSegs, footScale, legCur, legMeshes, state ('walk'|'fall'|'rest'), energy, clumsy, stamina, beh{wander,follow,flee,chase,seek,avoid}, groundT, up, side, vTarget, tilt/tiltV/tiltT`
- **Arms:** `arms, armLen, armSegs, handScale, abeh{gesture,punch,grab,hug}, held, ai{mode,...}`
- **Joints:** `jflex` (joint limit), `fdir` (facing direction for bend)
- **Story/status flags:** `role ('builder'|'climber'|'loader'|'genius'|'celebrate'|null), genius, caged, part, carry, ammoT, goldT, stoneT, sickT, dying, pinned/carried/dragged`

### 4.4 Shapes (`SHAPES[]`)
Sphere, Cube, Torus, Knot, Cone, Cylinder, Pyramid, **Gear** (index 7, `GEAR`). `AUTO_SHAPES=7`: the Add cycle and the eye's gifts only pick indices 0-6; the gear is editor-only (user choice). Each has a high- and low-poly geometry, a collider description in `COL[]`, and fields `e, r, front, pitch`.

**Complexity (fractal) shapes:** `getFracGeo(shape, level)` merges the base shape with scaled copies on 6 sides, recursively (level 0-3), into one cached BufferGeometry.

### 4.5 Colliders
Each shape is a **cluster of spheres** built by `buildCollider(o)` from `COL[]` + stretch + size + complexity + feet. Ellipsoids, boxes, rings (torus) and discs (`cylz`, gear) are filled with spheres; level 1-2 complexity adds spheres for child shapes; legged shapes add a foot sphere per leg. `collide()` tests sphere pairs and applies an impulse at the deepest pair, including torque. `walls()` tests every sphere against the 6 walls and tips shapes over off-center. `collideBlocks()` handles solid axis-aligned boxes (tower platforms, cannon base, villain cell). Picking uses the same spheres.

### 4.6 Jelly deformation
All in the vertex shader (`VS`). Uniforms: squash axis + amount, velocity lag, press dent (direction + depth), ripple. The JS side (`jelly()`) runs damped springs. Rigid (`wob=-1`) zeroes all of it. Note the shader deforms only the visual mesh; colliders are not deformed.

## 5. Section map of `reference/wobblers.html`

Line numbers refer to the file as delivered. Use `grep -n "/\* ----------"` to re-find them.

| Lines | Section |
|---|---|
| 1-165 | HTML/CSS, button bar, editor panel, fluid panel, HUD elements (hp bars, charge button, awakening panel, villain panel), THREE setup |
| 170-240 | scratch vectors, background shader sphere, room box, motes, `resize()` |
| 239 | jelly shader (`VS`, `FS`) |
| 295 | shapes, gear geometry, `COL`, fractal geometry |
| 395 | googly eyes |
| 433 | objects: `addObj`, `removeObj`, `applySize` |
| 515 | compound colliders |
| 613 | audio (tiny WebAudio synth; no assets) |
| 637-851 | jelly impact, physics (`gravityAt`, `wallHit`, `walls`, `collide`, `jelly`, `spin`, `step`) |
| 851 | shockwave rings, `blast()` |
| 882 | pointer input: drag, flick, long-press, tool taps, awakening input overrides |
| 1004-1110 | UI buttons, tools (Grow/Shrink/Wobbly/Remove), Clear all |
| 1110-1316 | object editor (long-press panel, sliders, behavior chips, Duplicate/Reset/Delete) |
| 1316-1606 | **fluid solver** (PBF-style position-based fluids, spatial grid, ~300 lines, self-contained; `createFluid(N)`) |
| 1606-1712 | fluid rendering: particles to a 256+px render target as additive blobs, then a full-screen quad shades the threshold surface |
| 1712-1860 | fluid coupling: obstacles from colliders, wetness, buoyancy, drag, gear paddle-wheel |
| 1860-1930 | fluid panel (presets Water/Slime/Lava/Ink, sliders) |
| 1930-2209 | **legs**: chain solver, `legBrain` (walk/fall/rest AI), `orientLegged`, `updateLegs` |
| 2209-2903 | **the Eye**: sparks, ribbons (lightning/beams), eye model + shader, punish/prize effects, state machine (`arrive, roam, omen, verdict, hug, battle, boss, master, defeated, leave`) |
| 2903-3266 | **tower uprising**: plan/build/climb/battle/celebrate |
| 3266-3825 | **genius + cannon uprising**, popText, genius outfit/3D rig, cannon build + fire + misfire |
| 3825-4206 | **awakening**: bubbles, notice, wary, boss fight, peace endings |
| 4206-4394 | **villain ending**: cell, capture, rule, betrayal, release |
| 4394-4723 | **arms**: gestures, punch, fetch/lift/throw, hug/hold hands, carrying |
| 4723-4822 | start roster, render loop |

## 6. Systems in more detail

### Fluid
- PBF-style solver on CPU: gravity prediction, spatial hash grid, neighbor pairs, `iters` (3-4) density-constraint passes using a poly6-ish kernel (`(1-r/h)^3`), mirrored boundary density, XSPH-like viscosity blend, global damping. `N_FL=1000` max particles, target amount slider 0-1.
- Obstacles = sphere clusters (shape colliders + tower/cell blocks as spheres), with obstacle velocity for pushing.
- Shapes sample the particle grid to get "wetness", then get buoyancy `∝ FL.dens / o.density` (capped 12), drag toward local flow, and spin damping. Gears act as paddle wheels (`gearFluid`, `fluid.swirl`).
- Rendering: points → additive field in a render target (R=density, G=density*speed) → full-screen quad does threshold, normal-from-gradient lighting, foam by speed, "glow" for lava.
- Presets set hue, thickness (viscosity 0-0.98), density (0.3-10), murk, glow.

### Legs, arms, joints
- `solveChain(S, E, n, total, thetaMax, bias, pts)`: n equal rigid segments from S toward E bend as a circular arc toward `bias` (knees forward, elbows back), limited to `thetaMax` per joint. If the target is closer than the minimum reach it is pushed out. Verified numerically: segment lengths are exact at all reaches for n=2..6.
- Legs: gait is an animated foot target (swing/lift) and hip anchor; `legBrain` runs steering + moods (tired, dizzy, falls, trips). Legged shapes keep themselves upright against `up` (gravity-opposite) with `orientLegged`.
- Arms: `armTick` is a small state machine (`idle, carry, fetch, reach, lift, show, windup, throw, punch, hug, hold`). `armHandTarget` gives the IK target per mode.
- **Feet are real colliders** so legged shapes stand above the floor. Leg length rebuilds the collider when it changes by >2% of size.
- Room-fit logic (`maxSizeFor`, `fitRoom`) shrinks a shape so body + legs fit between floor and ceiling. (This fixed a bug where huge long-legged shapes pushed their bodies through the ceiling.)

### The Eye
- Summon button (top-left). It floats, wobbles, blinks, has a halo, and judges a shape every few seconds: omen first (shape shivers, ring tints gold or red), then a verdict.
- Punish: shrink, squash, fling, stone (9s, shader gray + rigid), melt (becomes fluid), pop, sick (12s). Prize: grow, legs, gold, gift (4/9 of prizes), heal, hug.
- It has been simplified: it originally had feathered wings (user asked "just an eye"). See dead code in section 9.
- `reb.total` counts completed judgments; this is the trigger for the uprising.

### Uprising and endings (the story spine)
```
eye judges 3 times (reb.total >= REBEL_AT)
   ├─ genius exists ......... cannon uprising   (genius takes priority)
   └─ no genius ............. tower uprising
        both: build -> eye descends -> battle (HP bar) -> eye defeated -> celebrate -> structure disappears
                                              ↓
                              awakening (wobblers notice YOUR finger)
                                              ↓
   notice -> wary (button stolen, they dodge you, trust meter, Apologize/Gift/Free)
        ├─ trust reaches 100 / Set them free / outlast 90s ...... PEACE endings
        ├─ tap stolen pill / 3 grabs / trust 0 ................... BOSS fight (eye + cannon vs your finger)
        │       ├─ your HP hits 0 ................................ "tucked in" (8s touch lockout) then peace
        │       ├─ trust 100 / 90s .............................. peace
        │       └─ "them" resolve bar hits 0 (you smash them) ..... VILLAIN ending
        │                 VILLAIN: all shapes locked in one cell, eye serves you, they fade to gray,
        │                          betrayals, rattle the cell; "Free them" button -> peace('released')
   after any ending: reb.total reset to 0, whole story can repeat
```
- Genius: spawns on its own after the eye's 2nd judgment (60% chance, once per cycle), 3D spiky hair + glasses + goggles (a THREE.Group "rig" per genius) + flat sprites for clipboard/brain/lightbulb. It paces, mutters, sketches blueprints in the air.
- Cannon: design phase (5s) → legged helpers carry 6 parts from a pile → eye hovers right → helpers load non-legged shapes as ammo (or the genius makes iron cannonballs) → auto-aim with lead → fire outcomes: normal / wild / fizzle / backfire. Cannon needs the genius alive.
- Tower: 3-5 zigzag ledges of 3 blocks each (`PP=3`); builders carry blocks, hop up level by level (`climbStep`/`hopTo`), place them; there is a 30s stall failsafe that self-assembles a block; climbers leap at the eye; "Charge!" button launches all climbers.
- Every rebel behavior has failsafes (wedged workers hop out, stalls self-resolve, `abortRebellion()`/`abortAwakening()` on Clear all).

## 7. Design intent (the user's actual answers: preserve these)

The user was asked clarifying questions before each feature and chose as follows. These are requirements, not suggestions.

- **Base:** 3D, phone/touch, weird & surreal, throw + drag + poke jiggly spheres/cubes/etc.
- **Squish:** touching dents the shape at the press point; options to remove, shrink, enlarge, make wobblier; negative wobble = rigid.
- **Editor:** opens by **long-press**; Size/wobble, shape, stretch X/Y/Z ("extrusion"), complexity slider (mini copies recursively), physics sliders, duplicate/delete, live preview. Hitboxes must follow the real form (pancakes are flat).
- **Fluid:** liquid fills the room; shapes splash/displace; buoyancy; fill/drain button; water/slime/lava presets with thickness; touch stirs it; real particles + metaball look. Lava should be very dense/thick.
- **Legs:** count chosen per shape in the editor (off by default); behaviors wander/follow/flee/chase/seek/avoid liquid; personality: stumbles, gets tired, trips. Higher leg count (24) and long legs (3.0) requested.
- **Eye:** classic dreamcore floating eye, wobbly, flies by itself, summoned only by a button, random verdict with a subtle omen. Punishments: lightning, squash/shrink/fling, stone/melt, pop, sick/dizzy. Prizes: grow/legs, gold glow, spawn shapes, heal, lift-and-hug. Soft white look; **later simplified to just an eye (no wings)**. Gifts should be common.
- **Uprising:** after the eye has judged a few times, legged wobblers build a **tower** they climb to reach it; carry parts; auto fight with a button to charge; eye fights back; eye defeated then celebration.
- **Genius + cannon:** a genius wobbler **spawns on its own**; looks: glasses, big glowing brain/lightbulb, mad-scientist hair, goggles, lab coat, clipboard; behavior: pacing, muttering, sketching ideas. Genius designs cannon, legged shapes haul/assemble parts, non-legged shapes are ammo; fight is automatic; **shots can backfire/misfire comically**; **a genius takes priority over the tower**. (User later complained the coat/glasses/hair were flat SVG-like sprites and asked for **real 3D pointy hair and glasses**; done. The flat lab coat was dropped.)
- **Awakening:** triggered right after a successful uprising; wobblers stare at the screen/finger and talk in speech bubbles; flee/dodge your touch and refuse to be dragged; steal/sabotage the Summon button; fight your finger; team up with the eye; build something aimed at you. Tone: **dreamcore, unsettling-sweet**. Resolutions: apologize/make peace with gifts and freedom; outsmart/stop the eye summons; big showdown with you as the boss.
- **Villain ending:** reached by winning the boss fight by smashing them. One big locked cell around everyone. The eye serves you and punishes prisoners; they plead/whisper/cry in bubbles; you can rattle/poke/shake the cell; everything you do hits harder and darker; they slowly lose color and personality; some betray others to escape. **You can free them whenever you want.**
- **Gear shape:** special interaction with the eye and fluid (paddle wheel in fluid; jam/overclock from the eye); in the Add cycle and the editor only, never from gifts.
- **Arms:** count in editor (off by default), stiff jointed arms like legs; wave/gesture, carry, punch/push, grab/throw, point at the player/eye, hug/hold hands.
- **Joints:** segment-count slider (up to 6) for legs and arms, **visible ball joints**, natural bend direction (knees forward, elbows back), adjustable joint limits in the editor, equal-length segments, end piece (hand/foot) with its own size.

## 8. Tuning constants (the knobs)

| Name | Value | Meaning |
|---|---|---|
| `MAX_OBJS` | 16 | shape cap; adding past it removes the oldest unheld shape |
| `G` | 15 | gravity magnitude; `DRAG_K[]` per gravity mode |
| `N_FL` | 1000 | max fluid particles (Fill = 75% = 750) |
| `OB_MAX` / `OB_SPH` | 40 / 140 | fluid obstacle caps |
| `REBEL_AT` | 3 | eye judgments before uprising |
| `PP` | 3 | blocks per tower level |
| eye roam interval | `3 + rand*2.5` s | time between judgments (first: 4.5s) |
| eye verdict mix | 60% prize / 40% punish; `PRIZE` list weights gifts 4/9 | `PUNISH`, `PRIZE`, `BATTLE_PUNISH` arrays |
| eye battle zaps | every `1.8-3.2` s | `ey.atkT` |
| tower battle damage | `0.03 + 0.015*speed`, x2 when rallied | `defeatEye` at HP 0 |
| cannon shot damage | 0.085 | fire outcomes: 14% backfire, 14% wild, 10% fizzle |
| awakening trust | starts 0.3; +0.003/s while you touch, +0.012/s if idle; apology +0.16 diminishing; gift +0.14 (max 5) | `aw.trust` |
| boss: your damage | zap 0.09, shell 0.08, charging wobbler 0.025 | reduced up to 50% by trust |
| villain "them" bar | blast ≤0.02 each near shapes, smash 0.03 | regenerates 0.004/s |
| villain gray | reaches 95% over ~80s | `aw.gray` |
| leg limits | legs 0-24, length 0.1-3, segments 2-6 | editor sliders |
| arm limits | arms 0-12, length 0.1-2, segments 2-6 | editor sliders |

Typical full-story timing seen in simulation: tower ≈ 40s build + ≈30-50s fight; cannon ≈ 25s build + 60-80s fight. The user hasn't commented on pacing; shorten if it drags.

## 9. Known issues, risks and dead code

**Behavior/design risks**
- Visual QA gap (section 3). Several systems were never seen rendered by the assistant.
- Colliders are not deformed by jelly and are rounded approximations (cone and pyramid are rounded blobs, not sharp).
- `maxSizeFor` shrinks shapes so body+legs fit the room, so very long legs make the Size slider's real max smaller than it says (user was told; may want a different tradeoff).
- Shapes added **after** the villain cell closes are not caged.
- Many global timers use `setTimeout` for sound sequencing (`chime`, `boing`); they aren't cancelled on abort. Harmless but untidy.
- WebAudio is created lazily on first user gesture (`ensureAudio`); iOS needs that.
- Browser/OS stuff: `touch-action:none` on the canvas; `user-select:none`; `navigator.vibrate` calls (no-op on iOS).

**Cleanup candidates (dead or leftover code)**
- Eye wings were removed visually, but `featherTexture()`, `EY_ROWS`, `ey.wings`, `ey.featherMat`, `ey.flap`/`fold` wing logic still exist.
- `outfitTextures()` still builds `coat`, `glasses`, `goggles`, `hair` canvases that the genius no longer uses (replaced by the 3D rig). Only `clip`, `brain`, `bulb` sprites remain in use.
- `GN`, `ey` variable shadowing in the render loop (see 4.2), several `say()` strings.
- `FL.opacity` is called "Murk" in UI.
- A few helper names are duplicated in spirit (`mkTex`, `textTex`, `bubbleTex`, `outfit` textures) and could share one canvas-texture utility.

**Fragile spots to treat carefully when splitting**
- **Declaration order / TDZ:** code references things defined later in the closure (e.g. pointer handlers use `aw`, `fluid`, `blocks`; `blast()` uses `fluid`/`aw`). It works because they are only called after init. Modules need an explicit shared `state` object and an init order.
- The story code mutates shared objects across sections (`reb`, `aw`, `ey`, `blocks`, `pileBlocks`, `fluid`, `FL`, `gMode`). That coupling is the main thing to design around.
- `say()` toast, `popText`, `bubble`, `flash`, `spark`, `addRing`, `boing`, `tone`, `chime` are the shared effect helpers used everywhere.
- three.js **r128 is pinned on purpose.** Newer three changes color management (sRGB output, ColorManagement), `BufferGeometry`/`Geometry` removal is already done in r128, but ShaderMaterial output color and `MeshBasicMaterial` colors will look different from r152+. Upgrade only deliberately and re-check all colors.

## 10. Suggested refactor plan (for Claude Code)

Goal: same behavior, real project. Do it in small verified steps, running `npm test` after each.

1. **Scaffold:** Vite (vanilla JS), `index.html` + `src/main.js`, `three@0.128.0` as an npm dependency (import `* as THREE from 'three'`). Keep CSS in `src/styles.css`. Do not change the game yet; first make the monolith run from a single `src/game.js` (the existing IIFE body) and confirm it plays identically (compare against `reference/`).
2. **Extract leaf modules first** (almost no shared state):
   - `fluid/solver.js` (`createFluid`, pure JS, no THREE; already unit-testable. Add a node test: settled density near rest, no NaN, drain works, obstacles keep particles out).
   - `util/` (clamp, vectors), `audio.js` (boing/tone/chime/zap/boom), `fx.js` (sparks, rings, popText, flash, bubbles), `textures.js` (canvas textures).
   - `shapes.js` (geometries, `SHAPES`, `COL`, `getFracGeo`), `limbs/chain.js` (`solveChain` + math; add unit tests: equal segment lengths for n=2..6).
3. **Introduce shared state:** one `world` (camera/room bounds `hx,yMin,yMax,hz`, `objs`, `time`) and one `story` object (`reb`, `aw`, `ey` references). Pass them into system constructors rather than reading closure vars.
4. **Split systems:** `physics/` (colliders, step, walls, collide, jelly), `fluidSystem.js` (rendering + coupling), `legs.js`, `arms.js`, `eye.js`, `uprising/{tower,cannon,genius}.js`, `awakening.js`, `villain.js`, `editor.js`, `input.js`, `ui.js`.
5. **Keep the loop order** from section 4.2 (it matters: legBrain before physics, visuals after).
6. **Tests:** keep `tests/smoke.cjs` working against the built or source game (it currently evals the HTML's script). Once modules exist, replace the eval trick with imports and add unit tests per module.
7. **Then:** cleanup list in section 9, then performance profiling on a real phone (fluid first), then visual QA pass.

Don't rewrite behavior while refactoring. Where the reference is ugly but works, copy it and fix later.

## 11. Testing

`npm install && npm test` runs `tests/smoke.cjs`. It evals the game's script with a stubbed DOM/renderer and drives the loop headlessly (~5 s). It exposes internals by rewriting the end of the IIFE (see `EXPOSE` in the test), which will break if the wrapper changes; adjust or replace when modularizing.

It checks (18 checks): boot; fluid fill/drain; many-limb shapes + eye stable for 25 s; big long-legged shapes stay between floor and ceiling (regression for a real bug); every punish/prize effect; tower uprising to victory; awakening starts; boss to villain ending (cell closes, 30 s stable, release); cannon uprising with genius to victory; story fully resets. Every scenario also checks for NaN/Infinity.

It does **not** test visuals, touch input, audio, or real timing.

## 12. Ideas the user hasn't asked for (offered earlier, not built)

Tilt-to-steer gravity (device motion); a portal/score goal mode; colors/pattern/eye/sound options in the object editor; lab-coat-style outfits and 3D clipboard/brain/bulb for the genius; letting other shapes cheer or join the tower/cannon; making the eye give gears as gifts; pointier cone/pyramid colliders; capping legs instead of shrinking shapes when too tall; shapes added after the cell closes getting caged; a way to bless/smite a shape yourself.

## 13. Working with the user

- They design by **conversation and short feature asks**; they like being asked 2-4 multiple-choice questions before a big feature, then seeing it built. Keep that rhythm.
- They play on a phone and send screenshots when something looks wrong (the ceiling/legs bug came from one).
- They value comedic/surreal details (comic text like "BOOM!", "pfft...", dizzy eyes, muttering "E=mc²").
- Don't add features they didn't ask for; do mention honest limits when something is untested.
