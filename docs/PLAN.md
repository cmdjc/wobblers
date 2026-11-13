# Rebuild plan for Wobblers

## Context

Wobblers is one HTML file of 4822 lines (`reference/wobblers.html`, moved to `legacy/wobblers.html` in task 1), built in Claude Chat. All code is in one closure. It works, but it has no modules, no build, and no tests in this folder. The handoff names `tests/smoke.cjs`, but that file is not on disk, so the project starts with zero tests.

The owner wants a proper JS/HTML project in the style of the sister folders (`../it-has-been-years`, `../gooey-germ`): lean ES modules, full tests, no generated files in git, published on GitHub Pages under the `cmdjc` account. The player must see and feel the same game. Only the internals change.

Decisions (from the owner's request and the handoff):

- Template: `../it-has-been-years` (Vite, Vitest, jsdom, ESLint, CDP e2e tests with Brave, Pages workflow, Apache 2.0 license, `docs/PLAN.md` with a task table).
- Source of truth: the original file, moved to `legacy/wobblers.html`. If a brief and the legacy file disagree, the legacy file is correct.
- Fidelity: no behavior change. Allowed internal changes: modules, a shared context object instead of closure variables, renames of shadowed names (`ex`/`ey` in the render loop, `GN`), and removal of dead code (eye wings: `featherTexture` (legacy 2326, never called), `EY_ROWS`, `ey.wings` and its loop (2802-2805), `ey.featherMat`, `ey.fold` and `flapA` (only the wing loop reads them); the unused `coat`, `glasses`, `goggles`, `hair` outfit textures). `ey.flap` is live: it drives the eye bob (2820) and a squash kick (2800), so it stays.
- Out of scope: the "ideas not built" list and the known design issues in handoff section 9 (for example, shapes added after the cell closes stay uncaged). three.js stays at 0.128.0.
- Git: `git init` in this folder, repo-level identity `Commander <cmdjc@jcent.com>` as in the sister repos, remote `https://github.com/cmdjc/wobblers.git` (public). Push with the `cmdjc` gh token.

## Key technique: bit-exact parity with the legacy file

The safety net for every refactor step is a headless parity test. It runs the legacy script and the new game in the same deterministic fake environment, drives both with the same scripted input, and requires identical traces.

Fake environment (`tests/helpers/env.js`), made fresh for each run. Both builds get every browser global from one `env` object and never from `globalThis`, because Node 22 has its own real `performance`, `navigator`, and `setTimeout`:

- a new JSDOM document with the legacy `<body>` markup. The harness waits for the JSDOM `load` event, injects the build, and then dispatches a synthetic `load` at a fixed point (legacy listens for `load` at 236, 1709, 2238). It sets `innerWidth` 390, `innerHeight` 844, `devicePixelRatio` 2, and stubs the canvas `getBoundingClientRect` to `{left:0, top:0, width:390, height:844}` (jsdom returns zeros, which makes pointer math NaN at 891 and 3925);
- a fake clock: `performance.now`, `setTimeout`, `clearTimeout`, `requestAnimationFrame`, all driven by `advance(ms)`. The fluid solver reads `performance.now()` to adapt its iteration count (1824-1849), and one sound calls `Math.random()` inside a `setTimeout` (3510), so both must be fake;
- a seeded `Math.random` (mulberry32) with two streams. A call whose stack contains `generateUUID` goes to the UUID stream (`Error.stackTraceLimit` kept small for speed). All other calls go to the game stream. three r128 calls `Math.random()` four times per object UUID (`three.module.js:307-312`) through an internal function, so without this split any change in object-creation order would shift the game stream. The game uses no other three random helper (it only calls `MathUtils.degToRad`, 167);
- a 2D canvas stub that records calls per canvas (adapted from `../it-has-been-years/tests/unit/helpers/stubCanvas.js`, extended so `createRadialGradient` also returns a gradient), and a fake `WebGLRenderer` that records `setSize`, `setPixelRatio`, `setRenderTarget`, `render`. Its `getContext()` returns a stub GL with a fixed `ALIASED_POINT_SIZE_RANGE` (1691-1693);
- `navigator.vibrate` as a spy, and by default no `AudioContext` (616 handles its absence). One scenario runs with a fake `AudioContext` (fixed `sampleRate` 8000, `currentTime` from the fake clock), because the noise buffers at 2304 and 3268 consume random numbers only when audio exists.

Loading:

- Legacy: read `legacy/wobblers.html`, take the inline script, append one expose line before the last `})();` (`window.__legacy = { objs, ey, reb, aw, FL, blocks, scene, camera, ...story functions }`, with getters for every reassigned `let`: 222, 435, 614, 653, 888, 1006, 1060, 1114, 1610, 1812, 1920, 1932, 2213, 2914, 3307, 4733), and run it with `new Function('THREE', 'window', 'document', 'performance', 'navigator', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', src)`. `THREE` is the npm module with `WebGLRenderer` replaced by the fake. The file on disk never changes.
- New: `createGame({ renderer, env })` from `src/game.js` returns a `debug` handle with the same shape as `__legacy`. `main.js` passes the real `window` globals as `env`.

Trace (a snapshot every 10 frames, compared by FNV hash; on a mismatch both runs repeat to that frame and print the first differing path; numbers compared with `Object.is`, so NaN is never equal to itself by accident): per shape the physics, jelly, limb, and story fields; `ey`, `reb`, `aw` primitive fields; fluid particle positions; the full scene graph by tree position (type, visible, position, quaternion, scale, material color, opacity, uniform values, shader source hash), never three `id` or `uuid`, because three keeps module-level id counters shared by both runs; the DOM state of the HUD (say text, `hidden`, inline widths, button labels); the 2D canvas call log of each canvas that a scene material uses (so drawing an unused texture does not count); the renderer call log. On a mismatch the test prints the first differing frame and path.

Scenarios (`tests/helpers/scenarios.js`) drive both builds through the same steps, with public input where possible (button clicks, pointer events at projected shape positions) and the exposed story functions where the handoff smoke test called internals (each punish and prize effect):

1. boot, idle, tools (grow, shrink, wobbly, remove), drag, flick, tap blast, gravity cycle, add cycle, clear all;
2. editor: long-press opens it, every slider and chip (legs 24, length 3, arms, segments 6, complexity 3, stretch, gear), duplicate, reset, delete;
3. fluid: each preset, fill, gear paddle wheel, stir, drain;
4. eye: summon, judgments for 25 s with many-limb shapes, every punish and prize effect;
5. tower uprising to victory, awakening, apologize to peace;
6. awakening to boss to villain: cell closes, 30 s stable, Free them, peace;
7. cannon uprising with a genius (a fixed seed where the genius spawns), victory;
8. story reset and a second cycle.

Each scenario also runs the 18 handoff invariants against the new build: no NaN or Infinity, shapes stay between floor and ceiling, each story path reaches its end state.

Sanity tests prove the harness is not blind and not flaky: legacy against legacy with the same seed must match; a different seed and a changed constant must both fail.

## Target layout

```
wobblers/
  index.html               DOM shell (legacy lines 1-161 body markup), loads /src/main.js
  package.json             dev, build, preview, test, lint, e2e, check
  vite.config.js           base "./", Vitest unit config
  eslint.config.js  .gitignore  LICENSE  README.md
  docs/PLAN.md             this plan with the task table kept current
  .github/workflows/pages.yml
  src/
    main.js                creates the WebGLRenderer, calls createGame, ?debug hook
    game.js                createGame: builds the context in legacy order, frame loop (handoff 4.2 order)
    context.js             the shared context: room bounds, objs, time, gMode, sel, look, and story objects
    ui/style.css  ui/hud.js  ui/toolbar.js  ui/editor.js  ui/fluidPanel.js
    input/pointer.js
    audio/audio.js
    gfx/shaders.js  gfx/textures.js  gfx/background.js  gfx/fx.js (rings, sparks, ribbons, flash, popText, bubbles)
    shapes/shapes.js  shapes/colliders.js
    world/objects.js  world/physics.js  world/blocks.js
    fluid/solver.js  fluid/render.js  fluid/coupling.js
    limbs/chain.js  limbs/legs.js  limbs/arms.js
    eye/eye.js  eye/verdicts.js
    story/tower.js  story/genius.js  story/cannon.js  story/awakening.js  story/villain.js
  tests/
    helpers/  env.js  legacy.js  trace.js  scenarios.js  stubCanvas.js
    unit/     one test file per module, plus parity.test.js and invariants.test.js
    e2e/      cdp.js  server.js  boot, touch, story, parity, perf tests; out/ ignored
  legacy/  wobblers.html  HANDOFF.md
```

## Architecture rules

1. Module scope holds only constants and pure functions. `createGame` builds all mutable state, so it can run twice in one process.
2. One context object `ctx` replaces the closure. Each system is `createX(ctx)` and adds its API to `ctx`. Systems read other systems through `ctx` at call time, which keeps the legacy late binding (the TDZ issue in handoff section 9). While code still lives in `game.js`, hoisted function declarations are registered on `ctx` at the top of `createGame`, so extracted modules can call them. Watch the local shadows: `W`/`H` at 3845, 4234, 4646, `box` at 1160/1172, `G` at 1382, `ey` at 4784. `pileBlocks` is reassigned (2993, 4093, 4110, 4280).
3. Keep the legacy order of every `Math.random()` call, every scene `add`, and every frame step. The parity test enforces this.
4. Copy expressions verbatim. Do not reorder floating-point math, change a constant, string, timing, color, or GLSL.
5. three.js 0.128.0, `import * as THREE from "three"`. The renderer is injected so Node tests can pass a fake.
6. No comments except where the math is not obvious.
7. Browser globals come from the injected `env`, never from `globalThis`. Listeners register in legacy order (resize and load at 235-236, 1268, 1708-1709, 2238).

## E2E (Brave over CDP, adapted from `../it-has-been-years/tests/e2e`)

- Built preview: boot with zero console errors and zero shader compile errors, a non-blank canvas, touch flows through `Input.dispatchTouchEvent` (squish, flick, long-press opens the editor, summon), a frame-time report.
- Device: `Emulation.setDeviceMetricsOverride` 390x844, dpr 2, `mobile: true`.
- Visual parity: the Vite dev server serves the new game (unminified, so the stack-based UUID split works). The sister's static `server.js` serves `legacy/wobblers.html` (Vite would inject its client into it), and CDP `Fetch` answers the cdnjs request with the unminified `node_modules/three/build/three.js`. `Page.addScriptToEvaluateOnNewDocument` installs, in both pages, a seeded `Math.random` and a manual clock covering `performance.now`, rAF, and `setTimeout`, plus a style that turns off CSS transitions. After fixed frame counts (boot, fluid filled, eye summoned) the test compares screenshots on an 8x8 mean-color grid and saves both to `tests/e2e/out/`.

## Tasks

A Sonnet implementer subagent does each task, TDD, on branch `rebuild`, one commit per task. The planner (Opus) runs the gates, reads the diff, and commits the plan row update. Tasks 1 to 3 must pass before any code moves, because they are the safety net.

| # | Task | Legacy lines | State |
|---|---|---|---|
| 0 | Planner: `git init`, identity, commit the original files, then this plan; branch `rebuild` | n/a | done |
| 1 | Scaffold: move files to `legacy/`, package.json (pinned like the sister), Vite, ESLint, `.gitignore`, `index.html`, `style.css`, `main.js`, and `game.js` holding the IIFE body nearly verbatim inside `createGame({ renderer, env })` | 1-165, all | done (9cdb75b) |
| 2a | Harness env and legacy loader; legacy-vs-legacy same-seed test | n/a | done (f0ed583) |
| 2b | Trace, boot parity of the new build, sanity tests that must fail | n/a | done (abdd288) |
| 3a | Scenarios 1-4 (incl. the fake-audio run) and their invariants | n/a | done (52b143e) |
| 3b | Scenarios 5-8 (seed search for the genius), the rest of the 18 invariants | n/a | done (5305daa) |
| 4 | E2E tools and tests (boot, touch, visual parity) | n/a | done (fbad88c) |
| 5 | `context.js`: move reassigned closure variables onto `ctx`, register forwarders | 222, 435, 614, 653, 888, 1006, 1060, 1114, 1610, 1812, 1920, 1932, 2213, 2914, 3307, 4733 | done (d31cb44) |
| 6 | Leaf modules with unit tests: `audio.js` (613-636, 2294-2311, 3267-3277), `shaders.js` (239-294 and the other GLSL), `textures.js` (one canvas-texture helper), `chain.js` (equal segment lengths for n=2..6) | listed | done (6263837) |
| 7 | `fluid/solver.js` with unit tests (rest density, no NaN, drain, obstacles keep particles out) | 1316-1606 | done (dc4907e) |
| 8 | `shapes.js`, `colliders.js`, `objects.js`, eyes canvas | 295-612 | done (1a3826c) |
| 9 | `physics.js`, `blocks.js` | 637-851 | done (1104fa7) |
| 10 | `fx.js` (rings, `blast`, `spark` 2213-2240, `flash` 2313, `textTex`/`popText` 3278-3302, `bubble` 3840-3860), `background.js`, `hud.js` | 170-238, 851-882 + listed | done (b6cad5a) |
| 11 | `pointer.js`, `toolbar.js` | 882-1110 | done (ab433b3) |
| 12 | `editor.js`, `fluidPanel.js` | 1110-1316, 1860-1930 | |
| 13 | `fluid/render.js`, `fluid/coupling.js` | 1606-1860 | |
| 14 | `legs.js`, `arms.js` | 1930-2209, 4394-4723 | |
| 15a | `eye.js`: model, shader, state machine, render; remove wing dead code | 2209-2903 | |
| 15b | `verdicts.js`: punish and prize effects | in 2526-2700 | |
| 16a | `tower.js` | 2903-3266 | |
| 16b | `genius.js`: genius, outfit, 3D rig; drop the unused outfit textures | 3266-3540 | |
| 16c | `cannon.js` | 3540-3825 | |
| 17 | `awakening.js`, `villain.js` | 3825-4394 | |
| 18 | `game.js` cleanup: only setup and the frame loop (handoff 4.2 order), rename shadowed names, remove leftovers | 4723-4822 | |
| 19 | Pages workflow, LICENSE, README; final independent review, fixes, merge to `main`, push, enable Pages | n/a | |

Each extraction task (5-18): write the unit tests for the new module first and see them fail, move the code, see unit, parity, and invariant tests pass, run `npm run check` and `npm run e2e`, commit.

## Verification

- Per task: the planner runs `npm run check` (lint, unit and parity tests, build) and, from task 4, `npm run e2e`, then reads `git diff --stat`.
- End: both gates pass. The planner examines the e2e screenshots next to the legacy ones. The Pages URL `https://cmdjc.github.io/wobblers/` loads with zero console errors (checked over CDP).
- The owner plays it on a phone, because the handoff says the visuals were never checked systematically.

## Risks

- Headless Brave uses software WebGL, so e2e checks correctness, not phone performance.
- The parity trace is strict. A port step that reorders object creation or random calls fails, and the implementer must restore the legacy order.
- jsdom has no layout (`offsetHeight` is 0, so the bar height falls back to 120 at 230). Parity still holds, but only e2e sees the real layout.
- Long scenarios are slow because the fluid solver runs on the CPU. The harness steps at 30 frames per second (inside the legacy 0.05 s clamp) to keep the unit suite fast.

## Plan review

An independent Plan agent reviewed this plan on 2026-11-13 and found 3 blockers, 6 important, and 6 minor issues. This version includes all of them: injected globals, the canvas rect and window size, the `load` timing, the live `ey.flap`, per-canvas logs, the radial gradient stub, no three ids in the trace, the fake-audio scenario, the corrected line ranges, and the task splits.
