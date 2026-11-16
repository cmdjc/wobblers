# Wobblers

A surreal, phone-first 3D toy of jiggly shapes in a box. You squish, drag, and throw them. Later you can add fluid, legs, arms, and a floating eye that judges them. If the eye judges often enough, the wobblers rise up against it, and then they notice you.

Play it at https://cmdjc.github.io/wobblers/

## Controls

Press a shape to squish it, flick it to throw it, and long-press it to open the shape editor. Tap empty space to make a blast. The buttons at the bottom pick tools, gravity, fluid, and new shapes. The Credits button at the top right shows who made the game.

## Commands

Install the dependencies from the lock file with `npm ci`.

| Command | What it does |
|---|---|
| `npm run dev` | Starts the Vite dev server. Add `-- --host` to open it on a phone. |
| `npm run build` | Writes a static build to `dist/`. |
| `npm run check` | Runs lint, the unit and parity tests, and the build. |
| `npm run e2e` | Builds the game and runs the browser tests in Brave. |

## Tests

The original game is kept in `legacy/wobblers.html`. The parity tests run the original and the new code in the same fake browser, with the same random seed and input. Every 10 frames, the tests compare the shapes, the story state, the fluid, the scene, the changed geometry buffers, the page, the sounds, and the vibrations. The two runs must match exactly.

The e2e tests drive Brave over the Chrome DevTools Protocol and compare screenshots of both versions. They start their own headless Brave on port 9233, so they do not share a browser with other projects.

## Debug flag

Add `?debug` to the game URL to expose `window.__wob`, the internal state that the e2e tests read. Without it, the game exposes no globals.

## Credits

Created by M K. Built with Claude, by Anthropic. 3D rendering by three.js.

See `docs/PLAN.md` for the rebuild plan.
