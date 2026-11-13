import { beforeEach, describe, expect, it } from "vitest";
import { DRAG_K, G, createPhysics } from "../../../src/world/physics.js";
import { makeWorld } from "./world.js";

let ctx;
let physics;

beforeEach(() => {
  ({ ctx } = makeWorld());
  ctx.orientLegged = () => {};
  ctx.collideBlocks = () => {};
  physics = createPhysics(ctx);
});

const ball = (x, y, vx = 0, vy = 0) => {
  const o = ctx.addObj(0, x, y);
  o.size = o.sizeT = 1;
  ctx.applySize(o);
  o.pos.z = 0;
  o.ang.set(0, 0, 0);
  o.vel.set(vx, vy, 0);
  return o;
};

describe("createPhysics", () => {
  it("assigns its functions onto ctx and exports the constants", () => {
    for (const name of ["impact", "gravityAt", "wallHit", "walls", "collide", "jelly", "spin", "step"]) {
      expect(ctx[name], name).toBe(physics[name]);
    }
    expect(G).toBe(15);
    expect(DRAG_K).toEqual([0.08, 0.08, 0.5, 0.7, 0.1]);
  });
});

describe("gravityAt", () => {
  const sample = (mode) => {
    ctx.gMode = mode;
    const o = ball(1, 2);
    o.id = 3;
    ctx.gravityAt(o, 2);
    return ctx.tmpG.toArray();
  };

  it("pulls down, up, drifts, falls toward the center, and spins", () => {
    expect(sample(0)).toEqual([0, -15, 0]);
    expect(sample(1)).toEqual([0, 12, 0]);
    const drift = sample(2);
    expect(drift[0]).toBeCloseTo(Math.sin(2 * 0.6 + 3) * 1.4, 10);
    expect(drift[1]).toBeCloseTo(Math.cos(2 * 0.5 + 6) * 1.4, 10);
    expect(drift[2]).toBe(0);
    const center = sample(3);
    expect(center[0]).toBeCloseTo(-7, 10);
    expect(center[1]).toBeCloseTo(-14, 10);
    expect(center[2]).toBeCloseTo(0, 10);
    const spinning = sample(4);
    expect(spinning[0]).toBeCloseTo(Math.sin(1.8) * 10.5, 10);
    expect(spinning[1]).toBeCloseTo(-Math.cos(1.8) * 10.5, 10);
  });
});

describe("step", () => {
  it("lets a sphere dropped on the floor settle above yMin without NaN", () => {
    const o = ball(0, 2);
    for (let k = 0; k < 600; k++) ctx.step(1 / 120, k / 120);
    for (const v of [o.pos.x, o.pos.y, o.pos.z, o.vel.x, o.vel.y, o.q, o.p]) expect(Number.isFinite(v)).toBe(true);
    expect(o.pos.y - o.r).toBeGreaterThanOrEqual(ctx.yMin - 1e-9);
    expect(o.pos.y - o.r).toBeLessThan(ctx.yMin + 0.05);
    expect(Math.abs(o.vel.y)).toBeLessThan(0.5);
  });

  it("keeps a sphere between the side walls", () => {
    const o = ball(0, 0, 40, 0);
    for (let k = 0; k < 120; k++) ctx.step(1 / 120, k / 120);
    expect(o.pos.x + o.r).toBeLessThanOrEqual(ctx.hx + 1e-9);
    expect(o.vel.x).toBeLessThan(0);
  });
});

describe("collide", () => {
  it("pushes two overlapping spheres apart and swaps their impulses", () => {
    const a = ball(0, 0, 1, 0), b = ball(0.6, 0, -1, 0);
    ctx.updateWO(a); ctx.updateWO(b);
    ctx.collide();
    expect(b.pos.x - a.pos.x).toBeCloseTo(1, 10);
    expect(a.vel.x).toBeCloseTo(-0.8475, 4);
    expect(b.vel.x).toBeCloseTo(0.8475, 4);
    expect(a.mass * a.vel.x + b.mass * b.vel.x).toBeCloseTo(0, 10);
  });

  it("leaves separated spheres alone", () => {
    const a = ball(-1, 0, 1, 0), b = ball(1, 0, -1, 0);
    ctx.updateWO(a); ctx.updateWO(b);
    ctx.collide();
    expect([a.pos.x, b.pos.x, a.vel.x, b.vel.x]).toEqual([-1, 1, 1, -1]);
  });
});

describe("jelly", () => {
  const up = { x: 0, y: 1, z: 0 };
  const hit = (o) => {
    ctx.impact(o, ctx.tmpV.set(up.x, up.y, up.z), 10);
    for (let k = 0; k < 30; k++) ctx.jelly(o, 1 / 60);
  };

  it("keeps a rigid shape (wob -1) undeformed", () => {
    const o = ball(0, 0);
    o.wob = -1;
    hit(o);
    expect(Math.abs(o.q)).toBe(0);
    expect(Math.abs(o.rip)).toBe(0);
    expect(Math.abs(o.p)).toBe(0);
  });

  it("deforms a floppy shape (wob 4) on impact", () => {
    const o = ball(0, 0);
    o.wob = 4;
    hit(o);
    expect(Math.abs(o.q)).toBeGreaterThan(0.01);
    expect(o.rip).toBeGreaterThan(0);
    expect(o.rip).toBeLessThanOrEqual(0.22);
  });

  it("presses the dent in while a shape is dragged", () => {
    const o = ball(0, 0);
    o.dragged = true;
    for (let k = 0; k < 60; k++) ctx.jelly(o, 1 / 60);
    expect(o.p).toBeGreaterThan(0.9);
    expect(o.holdT).toBeCloseTo(1, 6);
  });
});

describe("spin", () => {
  it("turns the mesh by ang * dt and decays the ripple", () => {
    const o = ball(0, 0);
    o.ang.set(0, 2, 0);
    o.rip = 0.1;
    o.moodT = 1;
    const before = o.mesh.quaternion.clone();
    ctx.spin(o, 0.1);
    expect(o.mesh.quaternion.angleTo(before)).toBeCloseTo(2 * Math.exp(-0.035) * 0.1, 3);
    expect(o.rip).toBeCloseTo(0.1 * Math.exp(-0.4), 10);
    expect(o.moodT).toBeCloseTo(0.9, 10);
  });

  it("hands legged shapes to orientLegged", () => {
    const o = ball(0, 0);
    o.legs = 2;
    const calls = [];
    ctx.orientLegged = (...args) => calls.push(args);
    const before = o.mesh.quaternion.clone();
    ctx.spin(o, 0.1);
    expect(calls).toEqual([[o, 0.1]]);
    expect(o.mesh.quaternion.equals(before)).toBe(true);
  });
});
