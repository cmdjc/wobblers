import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAudio } from "../../../src/audio/audio.js";
import { createFakeAudioContext } from "../../helpers/fakeAudio.js";

let nowMs;
let log;
let timers;
let ctx;
let api;

beforeEach(() => {
  nowMs = 2000;
  log = [];
  timers = [];
  ctx = {
    actx: null,
    soundOn: true,
    lastSnd: 0,
    env: {
      window: { AudioContext: createFakeAudioContext(() => nowMs, log) },
      setTimeout: (fn, ms) => timers.push({ fn, ms }),
    },
  };
  api = createAudio(ctx);
});

const calls = (node, method) => log.filter((entry) => entry.node === node && entry.method === method);

describe("createAudio", () => {
  it("adds its functions to ctx and returns them", () => {
    for (const name of ["ensureAudio", "boing", "tone", "chime", "zapSound", "boomSound"]) {
      expect(ctx[name]).toBe(api[name]);
    }
  });

  it("plays nothing before ensureAudio", () => {
    api.tone(440, 0.2, 0.1);
    api.boing(300, 0.1);
    api.zapSound();
    api.boomSound(1);
    expect(log).toEqual([]);
    expect(ctx.actx).toBeNull();
  });

  it("ensureAudio creates the context once", () => {
    api.ensureAudio();
    const first = ctx.actx;
    expect(first.sampleRate).toBe(8000);
    api.ensureAudio();
    expect(ctx.actx).toBe(first);
  });

  it("ensureAudio resumes a suspended context", () => {
    api.ensureAudio();
    ctx.actx.state = "suspended";
    api.ensureAudio();
    expect(ctx.actx.state).toBe("running");
  });

  it("ensureAudio falls back to webkitAudioContext and survives a missing one", () => {
    ctx.env.window = { webkitAudioContext: createFakeAudioContext(() => nowMs, log) };
    createAudio(ctx).ensureAudio();
    expect(ctx.actx.sampleRate).toBe(8000);
    ctx.actx = null;
    ctx.env.window = {};
    createAudio(ctx).ensureAudio();
    expect(ctx.actx).toBeNull();
  });
});

describe("tone", () => {
  it("starts an oscillator at the given frequency and type and ramps the gain", () => {
    api.ensureAudio();
    api.tone(440, 0.5, 0.2, "square");
    expect(calls("oscillator", "start")).toEqual([{ node: "oscillator", method: "start", args: [1] }]);
    expect(calls("oscillator", "stop")[0].args).toEqual([1.55]);
    const freq = log.filter((entry) => entry.param === "frequency");
    expect(freq).toEqual([{ node: "oscillator", param: "frequency", method: "setValueAtTime", args: [440, 1] }]);
    const gain = log.filter((entry) => entry.param === "gain");
    expect(gain.map((entry) => [entry.method, ...entry.args])).toEqual([
      ["setValueAtTime", 0.0001, 1],
      ["exponentialRampToValueAtTime", 0.2, 1.03],
      ["exponentialRampToValueAtTime", 0.0001, 1.5],
    ]);
  });

  it("slides the frequency but never below 20 Hz", () => {
    api.ensureAudio();
    api.tone(90, 0.5, 0.12, "sawtooth", 0.1);
    const ramp = log.find((entry) => entry.param === "frequency" && entry.method === "exponentialRampToValueAtTime");
    expect(ramp.args).toEqual([20, 1.5]);
    log.length = 0;
    api.tone(1000, 0.5, 0.12, "sine", 0.4);
    const ramp2 = log.find((entry) => entry.param === "frequency" && entry.method === "exponentialRampToValueAtTime");
    expect(ramp2.args).toEqual([400, 1.5]);
  });

  it("is silent when sound is off", () => {
    api.ensureAudio();
    ctx.soundOn = false;
    api.tone(440, 0.2, 0.1);
    expect(log).toEqual([]);
  });
});

describe("boing", () => {
  it("is throttled to 35 ms of audio time", () => {
    api.ensureAudio();
    api.boing(300, 0.1);
    expect(calls("oscillator", "start")).toHaveLength(2);
    expect(ctx.lastSnd).toBe(1);
    nowMs = 2000 + 20;
    api.boing(300, 0.1);
    expect(calls("oscillator", "start")).toHaveLength(2);
    nowMs = 2000 + 40;
    api.boing(300, 0.1);
    expect(calls("oscillator", "start")).toHaveLength(4);
    expect(ctx.lastSnd).toBeCloseTo(1.04, 10);
  });

  it("sweeps from 1.5x to 0.55x the base pitch and clamps the volume", () => {
    api.ensureAudio();
    api.boing(200, 5);
    const freq = log.filter((entry) => entry.param === "frequency" && entry.node === "oscillator" && entry.method !== "connect");
    expect(freq[0].args).toEqual([300, 1]);
    expect(freq[1].args[0]).toBeCloseTo(110, 10);
    const peak = log.filter((entry) => entry.param === "gain" && entry.method === "exponentialRampToValueAtTime")[0];
    expect(peak.args[0]).toBe(0.12);
  });

  it("is silent when sound is off", () => {
    api.ensureAudio();
    ctx.soundOn = false;
    api.boing(300, 0.1);
    expect(log).toEqual([]);
    expect(ctx.lastSnd).toBe(0);
  });
});

describe("chime", () => {
  it("schedules one tone per note through env.setTimeout", () => {
    api.ensureAudio();
    api.chime([440, 550, 660], 120, 0.05);
    expect(timers.map((timer) => timer.ms)).toEqual([0, 120, 240]);
    expect(log).toEqual([]);
    timers.forEach((timer) => timer.fn());
    const starts = log.filter((entry) => entry.param === "frequency" && entry.method === "setValueAtTime");
    expect(starts.map((entry) => entry.args[0])).toEqual([440, 550, 660]);
  });
});

describe("noise sounds", () => {
  const spyBuffer = () => {
    const sizes = [];
    const original = ctx.actx.createBuffer.bind(ctx.actx);
    ctx.actx.createBuffer = (channels, length, rate) => {
      sizes.push([channels, length, rate]);
      return original(channels, length, rate);
    };
    return sizes;
  };

  it("zapSound fills 0.35 s of decaying noise, then starts a sawtooth tone", () => {
    api.ensureAudio();
    const sizes = spyBuffer();
    const random = vi.spyOn(Math, "random").mockReturnValue(1);
    api.zapSound();
    random.mockRestore();
    expect(sizes).toEqual([[1, 2800, 8000]]);
    expect(calls("bufferSource", "start")).toHaveLength(1);
    expect(calls("oscillator", "start")).toHaveLength(1);
    const gains = log.filter((entry) => entry.param === "frequency" && entry.method === "setValueAtTime");
    expect(gains[0].args[0]).toBe(90);
  });

  it("boomSound fills 0.5 s of noise and scales by volume", () => {
    api.ensureAudio();
    const sizes = spyBuffer();
    api.boomSound(2);
    expect(sizes).toEqual([[1, 4000, 8000]]);
    const peak = log.filter((entry) => entry.param === "gain" && entry.method === "exponentialRampToValueAtTime")[0];
    expect(peak.args[0]).toBeCloseTo(0.36, 10);
  });

  it("noise decays to silence along the buffer", () => {
    api.ensureAudio();
    let captured;
    const original = ctx.actx.createBuffer.bind(ctx.actx);
    ctx.actx.createBuffer = (...args) => (captured = original(...args));
    const random = vi.spyOn(Math, "random").mockReturnValue(1);
    api.boomSound();
    random.mockRestore();
    const data = captured.getChannelData(0);
    expect(data[0]).toBe(1);
    expect(data[2000]).toBeCloseTo(Math.pow(0.5, 2.5), 6);
    expect(data[3999]).toBeLessThan(1e-6);
  });

  it("are silent when sound is off", () => {
    api.ensureAudio();
    ctx.soundOn = false;
    api.zapSound();
    api.boomSound(1);
    expect(log).toEqual([]);
  });
});
