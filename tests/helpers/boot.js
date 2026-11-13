import * as THREE from "three";
import { createEnv } from "./env.js";
import { loadLegacy } from "./legacy.js";
import { installRandom } from "./rng.js";

async function boot({ seed, audio = false }, load) {
  const random = installRandom(seed);
  const harness = await createEnv({ audio });
  const debug = await load(harness);
  harness.window.dispatchEvent(new harness.window.Event("load"));
  return {
    debug,
    harness,
    random,
    step(frames, dtMs = 1000 / 30) {
      for (let i = 0; i < frames; i++) harness.advance(dtMs);
    },
    dispose() {
      random.restore();
      harness.window.close();
    },
  };
}

export const bootLegacy = (options) => boot(options, (harness) => loadLegacy(harness, THREE));

export async function bootNew(options) {
  const { createGame } = await import("../../src/game.js");
  return boot(options, (harness) => createGame({ renderer: harness.renderer, env: harness.env }).debug);
}
