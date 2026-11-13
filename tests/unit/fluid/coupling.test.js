import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootNew } from "../../helpers/boot.js";
import { click } from "../../helpers/input.js";
import { GEAR } from "../../../src/shapes/shapes.js";
import { createFluidCoupling } from "../../../src/fluid/coupling.js";

let game;

beforeEach(async () => {
  game = await bootNew({ seed: 11 });
  game.step(10);
});

afterEach(() => game.dispose());

const clearRoom = () => [...game.debug.objs].forEach((o) => game.debug.removeObj(o));
const fillTank = () => {
  clearRoom();
  click(game, "#fl-fill");
  game.step(200);
};
const poolMiddle = () => {
  const { fluid } = game.debug;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < fluid.n; i++) { lo = Math.min(lo, fluid.py[i]); hi = Math.max(hi, fluid.py[i]); }
  return (lo + hi) / 2;
};
const dropIn = (shape, density) => {
  const o = game.debug.addObj(shape, 0, poolMiddle());
  o.pos.z = 0; o.vel.set(0, 0, 0); o.ang.set(0, 0, 0); o.density = density;
  return o;
};

describe("createFluidCoupling", () => {
  it("is a factory", () => {
    expect(typeof createFluidCoupling).toBe("function");
  });
});

describe("buoyancy", () => {
  it("a light shape rises in filled fluid and a heavy one sinks", () => {
    fillTank();
    const light = dropIn(0, 0.2);
    const heavy = dropIn(0, 5);
    heavy.pos.x = 1;
    const y0 = light.pos.y;
    game.step(6);
    expect(light.vel.y).toBeGreaterThan(0);
    expect(heavy.vel.y).toBeLessThan(0);
    expect(light.pos.y).toBeGreaterThan(y0);
    expect(heavy.pos.y).toBeLessThan(y0);
  });

  it("does not act outside the liquid", () => {
    clearRoom();
    click(game, "#fl-fill");
    game.step(200);
    const o = game.debug.addObj(0, 0, game.debug.yMax - 0.5);
    o.density = 0.2;
    const falling = o.vel.y;
    game.step(2);
    expect(o.vel.y).toBeLessThanOrEqual(falling);
  });
});

describe("gear paddle wheel", () => {
  it("swirls the flow around a gear", () => {
    fillTank();
    const swirl = vi.spyOn(game.debug.fluid, "swirl");
    const gear = dropIn(GEAR, 1);
    gear.ang.z = 3;
    game.step(1);
    expect(swirl).toHaveBeenCalled();
    const strength = swirl.mock.calls[0][3];
    expect(strength).toBeGreaterThan(0);
    expect(swirl.mock.calls[0][2]).toBeGreaterThan(0);
  });

  it("does not swirl for other shapes", () => {
    fillTank();
    const swirl = vi.spyOn(game.debug.fluid, "swirl");
    const ball = dropIn(0, 1);
    ball.ang.z = 3;
    game.step(3);
    expect(swirl).not.toHaveBeenCalled();
  });
});

describe("obstacles", () => {
  it("hands every live shape's spheres to the solver in tower space", () => {
    fillTank();
    const o = dropIn(0, 1);
    const spy = vi.spyOn(game.debug.fluid, "setObstacles");
    game.step(1);
    const [B, S, start, m] = spy.mock.calls[0];
    expect(m).toBe(game.debug.objs.filter((x) => !x.dying).length);
    expect(m).toBe(1);
    const camZ = 14;
    const kc = camZ / (camZ - o.pos.z);
    expect(start[0]).toBe(0);
    expect(start[1]).toBe(o.cn);
    expect(B[2]).toBeGreaterThan(0);
    const kk = camZ / (camZ - (o.pos.z + o.wo[2]));
    expect(S[0]).toBeCloseTo((o.pos.x + o.wo[0]) * kk, 1);
    expect(S[2]).toBeCloseTo(o.cRad[0] * kk, 1);
    expect(B[0]).toBeCloseTo(o.pos.x * kc, 1);
  });

  it("adds one group per tower block", () => {
    fillTank();
    game.debug.blocks.push({ x0: -1, x1: 1, y0: -1, y1: 0 });
    const spy = vi.spyOn(game.debug.fluid, "setObstacles");
    game.step(1);
    const [B, S, start, m] = spy.mock.calls[0];
    expect(m).toBe(1);
    expect(B[2]).toBeCloseTo(1.5, 5);
    expect(S[2]).toBeCloseTo(0.5, 5);
    expect(start[1]).toBe(start[0] + 3);
    game.debug.blocks.length = 0;
  });

  it("keeps particles out of a resting shape", () => {
    clearRoom();
    const o = game.debug.addObj(0, 0, game.debug.yMin + 1);
    o.density = 5; o.size = o.sizeT = 1.2;
    game.debug.applySize?.(o);
    click(game, "#fl-fill");
    game.step(300);
    const { fluid } = game.debug;
    const camZ = 14;
    let inside = 0;
    for (let k = 0; k < o.cn; k++) {
      const kk = camZ / (camZ - (o.pos.z + o.wo[3 * k + 2]));
      const sx = (o.pos.x + o.wo[3 * k]) * kk, sy = (o.pos.y + o.wo[3 * k + 1]) * kk, sr = o.cRad[k] * kk;
      for (let i = 0; i < fluid.n; i++) if (Math.hypot(fluid.px[i] - sx, fluid.py[i] - sy) < sr * 0.5) inside++;
    }
    expect(fluid.n).toBe(750);
    expect(inside).toBe(0);
  });
});

describe("wetness", () => {
  it("raises a splash ring when a fast shape enters the liquid", () => {
    fillTank();
    const o = game.debug.addObj(0, poolMiddle(), 0);
    o.pos.set(0, poolMiddle(), 0);
    o.vel.set(0, -9, 0);
    const rip = o.rip;
    game.step(2);
    expect(o.rip).toBeGreaterThan(rip);
  });
});

describe("fluidFrame", () => {
  const withClock = (msPerCall) => {
    let t = 0;
    game.harness.env.performance.now = () => (t += msPerCall);
  };

  it("lowers solver iterations when steps are slow and restores them when fast", () => {
    fillTank();
    const { fluid } = game.debug;
    expect(fluid.F.iters).toBe(4);
    withClock(20);
    game.step(30);
    expect(game.debug.fluidMs).toBeGreaterThan(9);
    expect(fluid.F.iters).toBe(3);
    withClock(0);
    game.step(60);
    expect(game.debug.fluidMs).toBeLessThan(9);
    expect(fluid.F.iters).toBe(4);
  });

  it("copies gravity mode and viscosity into the solver and spawns toward the target", () => {
    clearRoom();
    game.debug.FL.visc = 0.5;
    game.debug.FL.amount = 0.01;
    game.step(2);
    expect(game.debug.fluid.F.visc).toBe(0.5);
    expect(game.debug.fluid.F.mode).toBe(game.debug.gMode);
    expect(game.debug.fluid.n).toBe(10);
  });

  it("clears the draw range when the tank empties", () => {
    fillTank();
    expect(game.debug.fluid.n).toBe(750);
    click(game, "#fl-drain");
    game.step(120);
    expect(game.debug.fluid.n).toBe(0);
  });
});

describe("stirFluid", () => {
  it("pushes particles along a finger drag across the tank", () => {
    fillTank();
    const { fluid } = game.debug;
    const spy = vi.spyOn(fluid, "stir");
    const mid = poolMiddle();
    const w = game.harness.window;
    const canvas = game.harness.document.getElementById("c");
    const at = (type, x, y) => canvas.dispatchEvent(new w.PointerEvent(type, { pointerId: 1, clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true }));
    at("pointerdown", 100, 500);
    game.step(1);
    for (let i = 1; i <= 8; i++) { at("pointermove", 100 + i * 20, 500); game.step(1); }
    at("pointerup", 260, 500);
    expect(mid).toBeDefined();
    expect(spy).toHaveBeenCalled();
    const [, , vx] = spy.mock.calls[spy.mock.calls.length - 1];
    expect(vx).toBeGreaterThan(0);
    expect(vx).toBeLessThanOrEqual(14);
  });
});
