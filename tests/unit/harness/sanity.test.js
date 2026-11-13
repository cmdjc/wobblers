import { describe, expect, it } from "vitest";
import { runParity } from "../../helpers/parity.js";

const idle = (frames) => async (game) => { game.step(frames); };

describe("parity harness sanity", () => {
  it("reports a mismatch when the seeds differ", async () => {
    const lopsided = async (game) => {
      game.step(60);
    };
    const result = await runParity(lopsided, { seed: 1, seedNext: 2, every: 10 });
    expect(result.ok).toBe(false);
    expect(result.path.length).toBeGreaterThan(0);
  }, 120000);

  it("reports a 1e-9 velocity change on the new build at or after frame 30", async () => {
    const nudge = async (game) => {
      game.step(30);
      if (game.build === "new") game.debug.objs[0].vel.x += 1e-9;
      game.step(30);
    };
    const result = await runParity(nudge, { seed: 1, every: 10 });
    expect(result.ok).toBe(false);
    expect(result.frame).toBeGreaterThanOrEqual(30);
    expect(result.path).toMatch(/\S/);
  }, 120000);

  it("passes when both builds run the same idle scenario", async () => {
    const result = await runParity(idle(30), { seed: 3, every: 10 });
    expect(result).toEqual({ ok: true });
  }, 120000);
});
