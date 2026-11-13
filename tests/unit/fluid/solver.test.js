import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFluid } from "../../../src/fluid/solver.js";
import { mulberry32 } from "../../helpers/rng.js";

const N_MAX = 1000;
const BX = 7, Y0 = -3.5, Y1 = 4;
const DT = 1 / 60;

let originalRandom;
beforeEach(() => { originalRandom = Math.random; Math.random = mulberry32(12345); });
afterEach(() => { Math.random = originalRandom; });

function makeBox(count = 600) {
  const fluid = createFluid(N_MAX);
  fluid.configure(BX, Y0, Y1, N_MAX);
  fluid.spawn(count, false);
  return fluid;
}
function run(fluid, seconds) {
  for (let k = 0; k < Math.round(seconds / DT); k++) fluid.step(DT);
}
function kinetic(fluid) {
  let e = 0;
  for (let i = 0; i < fluid.n; i++) {
    const vx = fluid.vx[i], vy = fluid.vy[i];
    e += 0.5 * (vx * vx + vy * vy);
  }
  return e;
}
function meanSpeed(fluid) {
  let sum = 0;
  for (let i = 0; i < fluid.n; i++) sum += Math.hypot(fluid.vx[i], fluid.vy[i]);
  return sum / fluid.n;
}

describe("settling", () => {
  it("settles a spawned block of liquid inside the box at rest density", () => {
    const fluid = makeBox();
    expect(fluid.n).toBe(600);
    let peakEnergy = 0;
    for (let k = 0; k < 600; k++) { fluid.step(DT); peakEnergy = Math.max(peakEnergy, kinetic(fluid)); }
    const m = 0.3 * fluid.s;
    for (let i = 0; i < fluid.n; i++) {
      for (const v of [fluid.px[i], fluid.py[i], fluid.vx[i], fluid.vy[i]]) expect(Number.isFinite(v)).toBe(true);
      expect(fluid.px[i]).toBeGreaterThanOrEqual(-BX + m - 1e-5);
      expect(fluid.px[i]).toBeLessThanOrEqual(BX - m + 1e-5);
      expect(fluid.py[i]).toBeGreaterThanOrEqual(Y0 + m - 1e-5);
      expect(fluid.py[i]).toBeLessThanOrEqual(Y1 - m + 1e-5);
    }
    const density = fluid.stats().avgRho;
    expect(density).toBeGreaterThan(1.007 * 0.95);
    expect(density).toBeLessThan(1.007 * 1.05);
    expect(peakEnergy).toBeGreaterThan(10000);
    expect(kinetic(fluid)).toBeLessThan(peakEnergy * 0.001);
  });
});

describe("drain", () => {
  it("removes k particles and keeps the survivors' data", () => {
    const fluid = makeBox(300);
    run(fluid, 1);
    const before = new Set();
    for (let i = 0; i < fluid.n; i++) before.add(`${fluid.px[i]},${fluid.py[i]},${fluid.vx[i]},${fluid.vy[i]}`);
    fluid.drain(50);
    expect(fluid.n).toBe(250);
    for (let i = 0; i < fluid.n; i++) expect(before.has(`${fluid.px[i]},${fluid.py[i]},${fluid.vx[i]},${fluid.vy[i]}`)).toBe(true);
  });
  it("stops at zero when asked for more than exists", () => {
    const fluid = makeBox(30);
    fluid.drain(100);
    expect(fluid.n).toBe(0);
  });
});

describe("obstacles", () => {
  it("keeps particles out of a sphere in the middle of the box", () => {
    const fluid = makeBox();
    const radius = 1.2, cx = 0, cy = 0;
    fluid.setObstacles(new Float32Array([cx, cy, radius, 0, 0]), new Float32Array([cx, cy, radius]), new Int32Array([0, 1]), 1);
    run(fluid, 10);
    let deepest = -Infinity;
    for (let i = 0; i < fluid.n; i++) deepest = Math.max(deepest, radius - Math.hypot(fluid.px[i] - cx, fluid.py[i] - cy));
    expect(deepest).toBeLessThan(-0.13);
  });
});

describe("viscosity", () => {
  function decayedSpeed(visc) {
    const fluid = makeBox();
    run(fluid, 5);
    fluid.F.visc = visc;
    fluid.stir(0, 0, 8, 0, 3);
    run(fluid, 1);
    return meanSpeed(fluid);
  }
  it("slows a disturbed fluid faster when thick", () => {
    const thick = decayedSpeed(0.9), thin = decayedSpeed(0.05);
    expect(thick).toBeLessThan(thin);
  });
});

describe("determinism", () => {
  it("gives identical arrays for the same seed", () => {
    const runOnce = () => {
      Math.random = mulberry32(777);
      const fluid = makeBox(400);
      run(fluid, 3);
      return [fluid.px.slice(0, fluid.n), fluid.py.slice(0, fluid.n), fluid.vx.slice(0, fluid.n), fluid.vy.slice(0, fluid.n)];
    };
    const a = runOnce(), b = runOnce();
    for (let k = 0; k < 4; k++) expect(Array.from(a[k])).toEqual(Array.from(b[k]));
  });
});
