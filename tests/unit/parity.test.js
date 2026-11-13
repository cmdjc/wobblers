import { describe, expect, it } from "vitest";
import { runParity } from "../helpers/parity.js";

const bootIdle = async (game) => { game.step(600); };

describe("boot parity, new against legacy", () => {
  for (const seed of [1, 2]) {
    it(`boot idle, 600 frames, seed ${seed}`, async () => {
      const result = await runParity(bootIdle, { seed, every: 10 });
      expect(result).toEqual({ ok: true });
    }, 120000);
  }
});
