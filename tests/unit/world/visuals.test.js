import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createContext } from "../../../src/context.js";
import { createVisuals } from "../../../src/world/visuals.js";

function fakeShape(overrides = {}) {
  return {
    id: 1, mesh: new THREE.Object3D(), pos: new THREE.Vector3(1, 2, 0.5), vel: new THREE.Vector3(), front: 0.3,
    size: 1, sizeT: 1, sx: 1.2, sy: 0.8, sz: 1, level: 2, dying: false, dieT: 0,
    eyes: { s: new THREE.Sprite(new THREE.SpriteMaterial()) },
    arms: 0, outfit: null, legs: 0, state: "idle", energy: 1, dizzyT: 0, moodT: 0, dragged: false, caged: false,
    q: 0.5, rip: 0.2, wob: 0, p: 0.1, stoneT: 0, sickT: 0, goldT: 0,
    mat: { uniforms: { uQ: { value: 0 }, uRip: { value: 0 }, uPress: { value: 0 }, uStone: { value: 0 }, uSick: { value: 0 }, uGold: { value: 0 }, uGray: { value: 0 } } },
    ...overrides,
  };
}

function setup(shapes) {
  const ctx = createContext();
  const calls = {
    removeObj: vi.fn(), applySize: vi.fn(), updateLegs: vi.fn(), updateArms: vi.fn(), updateOutfit: vi.fn(), divineStatus: vi.fn(), drawEyes: vi.fn(),
  };
  ctx.objs = shapes;
  ctx.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  ctx.camera.position.set(0, 0, 10);
  ctx.camera.updateMatrixWorld();
  ctx.look = { last: -99, x: 0, y: 0 };
  ctx.aw = { state: "off", gray: 0 };
  ctx.selRing = new THREE.Object3D();
  Object.assign(ctx, calls);
  return { ctx, calls, visuals: createVisuals(ctx) };
}

const DT = 1 / 30;

describe("updateVisuals", () => {
  it("is registered on ctx together with the selection ring update", () => {
    const { ctx, visuals } = setup([]);
    expect(ctx.updateVisuals).toBe(visuals.updateVisuals);
    expect(ctx.updateSelectionRing).toBe(visuals.updateSelectionRing);
  });

  it("moves each mesh to its position and scales it by size times stretch", () => {
    const shape = fakeShape({ size: 1.5, sizeT: 1.5 });
    const { visuals } = setup([shape]);
    visuals.updateVisuals(DT, 1);
    expect(shape.mesh.position.toArray()).toEqual([1, 2, 0.5]);
    expect(shape.mesh.scale.toArray()).toEqual([1.5 * 1.2, 1.5 * 0.8, 1.5]);
    const ek = 1 + 0.12 * 2;
    expect(shape.eyes.s.scale.x).toBeCloseTo(1.5 * 0.9 * ek, 10);
    expect(shape.eyes.s.scale.y).toBeCloseTo(1.5 * 0.45 * ek, 10);
  });

  it("eases the size toward its target and refreshes the collider", () => {
    const shape = fakeShape({ size: 1, sizeT: 2 });
    const { calls, visuals } = setup([shape]);
    visuals.updateVisuals(DT, 1);
    expect(shape.size).toBeCloseTo(1 + (1 - Math.exp(-12 * DT)), 10);
    expect(calls.applySize).toHaveBeenCalledWith(shape);
    const settled = fakeShape({ size: 1, sizeT: 1.001 });
    const other = setup([settled]);
    other.visuals.updateVisuals(DT, 1);
    expect(settled.size).toBe(1);
    expect(other.calls.applySize).not.toHaveBeenCalled();
  });

  it("updates arms and the outfit only for shapes that have them", () => {
    const plain = fakeShape();
    const dressed = fakeShape({ arms: 2, outfit: {} });
    const { calls, visuals } = setup([plain, dressed]);
    visuals.updateVisuals(DT, 3);
    expect(calls.updateLegs).toHaveBeenCalledTimes(2);
    expect(calls.updateArms).toHaveBeenCalledTimes(1);
    expect(calls.updateArms).toHaveBeenCalledWith(dressed, DT, 3, 1);
    expect(calls.updateOutfit).toHaveBeenCalledWith(dressed, 3, 1);
    expect(calls.divineStatus).toHaveBeenCalledTimes(2);
  });

  it("eases the stone uniform toward 1 while stoneT is positive and back to 0 after", () => {
    const shape = fakeShape({ stoneT: 5 });
    const { visuals } = setup([shape]);
    const kk = 1 - Math.exp(-6 * DT);
    visuals.updateVisuals(DT, 1);
    expect(shape.mat.uniforms.uStone.value).toBeCloseTo(kk, 10);
    visuals.updateVisuals(DT, 1);
    expect(shape.mat.uniforms.uStone.value).toBeCloseTo(1 - (1 - kk) ** 2, 10);
    for (let i = 0; i < 60; i++) visuals.updateVisuals(DT, 1);
    expect(shape.mat.uniforms.uStone.value).toBeGreaterThan(0.99);
    shape.stoneT = 0;
    visuals.updateVisuals(DT, 1);
    expect(shape.mat.uniforms.uStone.value).toBeLessThan(0.99);
    for (let i = 0; i < 90; i++) visuals.updateVisuals(DT, 1);
    expect(shape.mat.uniforms.uStone.value).toBeLessThan(0.01);
  });

  it("passes the shape state to the other uniforms, and the gray fade only to caged shapes in the villain ending", () => {
    const free = fakeShape({ sickT: 2, goldT: 2, wob: -0.5 });
    const caged = fakeShape({ id: 2, caged: true });
    const { ctx, visuals } = setup([free, caged]);
    ctx.aw.state = "villain";
    ctx.aw.gray = 0.8;
    visuals.updateVisuals(DT, 1);
    const kk = 1 - Math.exp(-6 * DT);
    expect(free.mat.uniforms.uQ.value).toBe(0.5);
    expect(free.mat.uniforms.uPress.value).toBe(0.1);
    expect(free.mat.uniforms.uRip.value).toBeCloseTo(0.2 * 0.5, 10);
    expect(free.mat.uniforms.uSick.value).toBeCloseTo(kk, 10);
    expect(free.mat.uniforms.uGold.value).toBeCloseTo(kk, 10);
    expect(free.mat.uniforms.uGray.value).toBe(0);
    expect(caged.mat.uniforms.uGray.value).toBeCloseTo(0.8 * kk, 10);
  });

  it("puts the eyes on the front of the shape and tilts them with the sideways speed", () => {
    const shape = fakeShape({ vel: new THREE.Vector3(-4, 0, 0) });
    const { visuals } = setup([shape]);
    visuals.updateVisuals(DT, 1);
    expect(shape.eyes.s.position.toArray()).toEqual([1, 2 + 0.08, 0.5 + 0.3]);
    expect(shape.eyes.s.material.rotation).toBeCloseTo(0.12, 10);
    shape.vel.x = -40;
    visuals.updateVisuals(DT, 1);
    expect(shape.eyes.s.material.rotation).toBe(0.5);
  });

  it("picks the mood and keeps the pupils still while they stare at you", () => {
    const shape = fakeShape({ stoneT: 1 });
    const { ctx, calls, visuals } = setup([shape]);
    visuals.updateVisuals(DT, 1);
    expect(calls.drawEyes.mock.calls.at(-1).slice(3, 4)).toEqual([2]);
    shape.stoneT = 0;
    shape.sickT = 1;
    visuals.updateVisuals(DT, 1);
    const [, eyeX, eyeY, mood] = calls.drawEyes.mock.calls.at(-1);
    expect(mood).toBe(4);
    expect(eyeX).toBeCloseTo(Math.cos(9 + 1) * 0.8, 10);
    expect(eyeY).toBeCloseTo(Math.sin(9 + 1) * 0.8, 10);
    shape.sickT = 0;
    ctx.aw.state = "notice";
    visuals.updateVisuals(DT, 1);
    expect(calls.drawEyes.mock.calls.at(-1).slice(1, 3)).toEqual([0, 0]);
  });

  it("follows the finger with the pupils for 3 s after the last touch", () => {
    const shape = fakeShape({ pos: new THREE.Vector3(0, 0, 0) });
    const { ctx, calls, visuals } = setup([shape]);
    Object.assign(ctx.look, { last: 1, x: 0.9, y: 0.4 });
    visuals.updateVisuals(DT, 2);
    const [, eyeX, eyeY] = calls.drawEyes.mock.calls.at(-1);
    expect(eyeX).toBeGreaterThan(0.5);
    expect(eyeY).toBeGreaterThan(0.1);
    ctx.look.last = -99;
    visuals.updateVisuals(DT, 2);
    expect(calls.drawEyes.mock.calls.at(-1)[1]).not.toBeCloseTo(eyeX, 2);
  });

  it("pops a dying shape up to 1.3 times its size, then removes it after 0.3 s", () => {
    const shape = fakeShape({ dying: true, dieT: 0.03 - DT });
    const { calls, visuals } = setup([shape]);
    visuals.updateVisuals(DT, 1);
    expect(shape.mesh.scale.x).toBeCloseTo(1.2 * 1.15, 10);
    expect(calls.removeObj).not.toHaveBeenCalled();
    shape.dieT = 0.3 - DT;
    visuals.updateVisuals(DT, 1);
    expect(calls.removeObj).toHaveBeenCalledWith(shape);
  });

  it("does not skip shapes when removeObj shortens the list during the loop", () => {
    const first = fakeShape({ dying: true, dieT: 1 });
    const second = fakeShape({ id: 2 });
    const list = [first, second];
    const { ctx } = setup(list);
    ctx.removeObj = (o) => list.splice(list.indexOf(o), 1);
    createVisuals(ctx).updateVisuals(DT, 1);
    expect(second.mesh.position.toArray()).toEqual([1, 2, 0.5]);
  });
});

describe("updateSelectionRing", () => {
  it("rings the selected shape and breathes with the clock", () => {
    const shape = fakeShape({ r: 0.5 });
    const { ctx, visuals } = setup([shape]);
    ctx.sel = shape;
    visuals.updateSelectionRing(2);
    expect(ctx.selRing.visible).toBe(true);
    expect(ctx.selRing.position.toArray()).toEqual([1, 2, 0.5 + 0.3 * 0.5]);
    expect(ctx.selRing.scale.x).toBeCloseTo(0.5 * (1.25 + 0.05 * Math.sin(12)), 10);
  });

  it("hides the ring when nothing is selected or the selection left the scene", () => {
    const shape = fakeShape({ r: 0.5 });
    const { ctx, visuals } = setup([shape]);
    ctx.selRing.visible = true;
    visuals.updateSelectionRing(0);
    expect(ctx.selRing.visible).toBe(false);
    ctx.sel = fakeShape();
    ctx.selRing.visible = true;
    visuals.updateSelectionRing(0);
    expect(ctx.selRing.visible).toBe(false);
  });
});
