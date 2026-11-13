import { describe, expect, it } from "vitest";
import { bootLegacy, bootNew } from "../../helpers/boot.js";

const capture = (debug) => debug.objs.map((o) => ({ pos: o.pos.toArray(), vel: o.vel.toArray(), q: o.q, size: o.size }));
const flat = (entries) => entries.flatMap((e) => [...e.pos, ...e.vel, e.q, e.size]);

describe("legacy build", () => {
  it("is deterministic for the same seed over 300 frames", async () => {
    const runs = [];
    for (let i = 0; i < 2; i++) {
      const game = await bootLegacy({ seed: 1 });
      expect(game.debug.objs.length).toBe(7);
      game.step(300);
      runs.push(capture(game.debug));
      game.dispose();
    }
    const [a, b] = runs.map(flat);
    expect(a.length).toBe(b.length);
    expect(a.some(Number.isNaN)).toBe(false);
    a.forEach((v, i) => expect(Object.is(v, b[i]), `value ${i}`).toBe(true));
  }, 120000);
});

describe("new build", () => {
  it("boots with 7 shapes and renders once per frame", async () => {
    const game = await bootNew({ seed: 1 });
    expect(game.debug.objs.length).toBe(7);
    const before = game.harness.renderer.calls.filter((c) => c.name === "render").length;
    game.step(30);
    const after = game.harness.renderer.calls.filter((c) => c.name === "render").length;
    expect(after - before).toBe(30);
    game.dispose();
  }, 60000);
});
