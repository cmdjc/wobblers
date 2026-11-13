import { afterEach, describe, expect, it } from "vitest";
import { createEnv } from "../../helpers/env.js";

let harness;
afterEach(() => harness?.window.close());

describe("fake clock", () => {
  it("starts at 1000 and exposes performance.now", async () => {
    harness = await createEnv();
    expect(harness.now()).toBe(1000);
    expect(harness.env.performance.now()).toBe(1000);
  });

  it("fires timers in due order, then insertion order, with now set to the due time", async () => {
    harness = await createEnv();
    const fired = [];
    const { setTimeout, performance } = harness.env;
    setTimeout(() => fired.push(["c", performance.now()]), 30);
    setTimeout(() => fired.push(["a", performance.now()]), 10);
    setTimeout(() => fired.push(["b", performance.now()]), 10);
    harness.advance(50);
    expect(fired).toEqual([["a", 1010], ["b", 1010], ["c", 1030]]);
    expect(harness.now()).toBe(1050);
  });

  it("runs a timer set inside a timer after the timer that set it, and only when due", async () => {
    harness = await createEnv();
    const fired = [];
    const { setTimeout } = harness.env;
    setTimeout(() => {
      fired.push("outer");
      setTimeout(() => fired.push("inner"), 5);
    }, 10);
    harness.advance(12);
    expect(fired).toEqual(["outer"]);
    harness.advance(10);
    expect(fired).toEqual(["outer", "inner"]);
  });

  it("clears timers", async () => {
    harness = await createEnv();
    const fired = [];
    const id = harness.env.setTimeout(() => fired.push("x"), 5);
    harness.env.clearTimeout(id);
    harness.advance(20);
    expect(fired).toEqual([]);
  });

  it("runs rAF callbacks queued during a frame on the next advance, with the frame time", async () => {
    harness = await createEnv();
    const seen = [];
    const loop = (t) => { seen.push(t); harness.env.requestAnimationFrame(loop); };
    harness.env.requestAnimationFrame(loop);
    harness.advance(16);
    expect(seen).toEqual([1016]);
    harness.advance(16);
    expect(seen).toEqual([1016, 1032]);
  });

  it("gives the window the same fakes", async () => {
    harness = await createEnv();
    expect(harness.window.performance.now()).toBe(1000);
    expect(harness.window.innerWidth).toBe(390);
    expect(harness.window.innerHeight).toBe(844);
    expect(harness.window.devicePixelRatio).toBe(2);
    expect(harness.document.getElementById("c").getBoundingClientRect().width).toBe(390);
  });

  it("has no AudioContext by default and a fake one when asked", async () => {
    harness = await createEnv();
    expect(harness.window.AudioContext).toBeUndefined();
    expect(harness.window.webkitAudioContext).toBeUndefined();
    harness.window.close();
    harness = await createEnv({ audio: true });
    const actx = new harness.window.AudioContext();
    expect(actx.sampleRate).toBe(8000);
    harness.advance(500);
    expect(actx.currentTime).toBe(0.5);
    expect(actx.createBuffer(1, 10, 8000).getChannelData(0)).toBeInstanceOf(Float32Array);
  });
});
