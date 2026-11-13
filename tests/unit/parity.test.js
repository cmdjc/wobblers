import { describe, expect, it } from "vitest";
import { runParity } from "../helpers/parity.js";
import * as scenarios from "../helpers/scenarios.js";

const bootIdle = async (game) => { game.step(600); };

describe("boot parity, new against legacy", () => {
  for (const seed of [1, 2]) {
    it(`boot idle, 600 frames, seed ${seed}`, async () => {
      const result = await runParity(bootIdle, { seed, every: 10 });
      expect(result).toEqual({ ok: true });
    }, 120000);
  }
});

describe("scenario parity, new against legacy", () => {
  it("1 tools: grow, shrink, wobble, remove, drag, flick, blast, gravity, add, clear", async () => {
    const result = await runParity(scenarios.toolsScenario, { seed: 1, every: 10 });
    expect(result).toEqual({ ok: true });
  }, 300000);

  it("1 tools with fake audio", async () => {
    const result = await runParity(scenarios.toolsScenario, { seed: 1, audio: true, every: 10 });
    expect(result).toEqual({ ok: true });
  }, 300000);

  it("2 editor: every slider and chip, giant legs, duplicate, reset, delete", async () => {
    const result = await runParity(scenarios.editorScenario, { seed: 2, every: 10 });
    expect(result).toEqual({ ok: true });
  }, 300000);

  it("3 fluid: presets, fill, sliders, stir, drain", async () => {
    const result = await runParity(scenarios.fluidScenario, { seed: 3, every: 10 });
    expect(result).toEqual({ ok: true });
  }, 600000);

  it("4 eye: summon, 25 s of judgments, every punish and prize, hug", async () => {
    const result = await runParity(scenarios.eyeScenario, { seed: 4, every: 10 });
    expect(result).toEqual({ ok: true });
  }, 600000);

  it("4 eye with fake audio (noise buffers in zap sounds)", async () => {
    const result = await runParity(scenarios.eyeScenario, { seed: 4, audio: true, every: 10 });
    expect(result).toEqual({ ok: true });
  }, 600000);
});
