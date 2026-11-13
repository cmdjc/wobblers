import { bootLegacy, bootNew } from "./boot.js";
import { diff, hash, snapshot } from "./trace.js";

const STOP = Symbol("stop");

async function runBuild(boot, build, scenario, { seed, audio, every, captureAt = null }) {
  const game = await boot({ seed, audio });
  const hashes = [];
  let frame = 0;
  let captured = null;
  const observe = () => {
    if (frame % every !== 0 && frame !== captureAt) return;
    const snap = snapshot(game.debug, game.harness);
    hashes.push([frame, hash(snap)]);
    if (frame === captureAt) {
      captured = snap;
      throw STOP;
    }
  };
  const view = {
    build,
    debug: game.debug,
    harness: game.harness,
    step(frames, dtMs) {
      for (let i = 0; i < frames; i++) {
        game.step(1, dtMs);
        frame += 1;
        observe();
      }
    },
  };
  try {
    observe();
    await scenario(view);
    if (frame % every !== 0) observe();
  } catch (error) {
    if (error !== STOP) throw error;
  } finally {
    game.dispose();
  }
  return { hashes, captured };
}

export async function runParity(scenario, { seed, seedNext = seed, audio = false, every = 10 } = {}) {
  const legacy = await runBuild(bootLegacy, "legacy", scenario, { seed, audio, every });
  const next = await runBuild(bootNew, "new", scenario, { seed: seedNext, audio, every });
  const length = Math.max(legacy.hashes.length, next.hashes.length);
  for (let i = 0; i < length; i++) {
    const a = legacy.hashes[i], b = next.hashes[i];
    if (a && b && a[0] === b[0] && a[1] === b[1]) continue;
    const frame = (a ?? b)[0];
    if (!a || !b || a[0] !== b[0]) return { ok: false, frame, path: "(snapshot schedule)", legacy: a?.[0], next: b?.[0] };
    const options = { audio, every, captureAt: frame };
    const [legacyRun, nextRun] = [
      await runBuild(bootLegacy, "legacy", scenario, { seed, ...options }),
      await runBuild(bootNew, "new", scenario, { seed: seedNext, ...options }),
    ];
    const found = diff(legacyRun.captured, nextRun.captured);
    return { ok: false, frame, path: found?.path || "(snapshot hash, rerun matched)", legacy: found?.a, next: found?.b };
  }
  return { ok: true };
}
