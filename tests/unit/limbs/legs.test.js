import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { bootNew } from "../../helpers/boot.js";
import { click, isPickable, longPress, setSlider, sliderFor } from "../../helpers/input.js";
import { createLegs, defaultBeh, footR, hipXZ } from "../../../src/limbs/legs.js";

let game;

beforeEach(async () => {
  game = await bootNew({ seed: 11 });
  game.step(60);
});

afterEach(() => game.dispose());

const legged = (legs, extra = () => {}) => {
  const o = game.debug.objs.find((c) => isPickable(game, c));
  longPress(game, o);
  setSlider(game, sliderFor(game, "Legs"), legs);
  extra(o);
  click(game, "#ed-done");
  return o;
};
const inScene = (mesh) => game.debug.scene.children.includes(mesh);
const lerpOffLine = (a, b, p) => {
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  const v = new THREE.Vector3().subVectors(p, a);
  return v.sub(dir.multiplyScalar(v.dot(dir)));
};

describe("pure helpers", () => {
  it("sizes the foot from size and foot scale", () => {
    expect(footR({ size: 2, footScale: 1.5 })).toBeCloseTo(0.27, 12);
  });

  it("places hips by leg count", () => {
    expect(hipXZ({ legs: 1, halfW: 1, halfD: 1 }, 0)).toEqual([0, 0]);
    expect(hipXZ({ legs: 2, halfW: 2, halfD: 1 }, 0)).toEqual([-1.1, 0]);
    expect(hipXZ({ legs: 2, halfW: 2, halfD: 1 }, 1)).toEqual([1.1, 0]);
    const [x, z] = hipXZ({ legs: 4, halfW: 1, halfD: 2 }, 1);
    expect(x).toBeCloseTo(Math.cos(6.2832 / 4 + 0.785) * 0.6, 12);
    expect(z).toBeCloseTo(Math.sin(6.2832 / 4 + 0.785) * 1.1, 12);
  });

  it("starts with wander only", () => {
    expect(defaultBeh()).toEqual({ wander: true, follow: false, flee: false, chase: false, seek: false, avoid: false });
  });

  it("is a factory", () => {
    expect(typeof createLegs).toBe("function");
  });
});

describe("buildLegs", () => {
  it("adds a group of bones, ball joints and a foot per leg", () => {
    const o = legged(4);
    expect(o.legMeshes).toHaveLength(4);
    for (const lg of o.legMeshes) {
      expect(lg.sticks).toHaveLength(o.legSegs);
      expect(lg.joints).toHaveLength(o.legSegs);
      for (const m of [...lg.sticks, ...lg.joints, lg.foot]) expect(inScene(m)).toBe(true);
    }
    game.step(2);
    for (const lg of o.legMeshes) {
      for (const j of lg.joints) expect(j.visible).toBe(true);
      expect(lg.foot.visible).toBe(true);
    }
  });

  it("rebuilds with more bones when the segment count rises and removes the old ones", () => {
    const o = legged(2);
    const old = o.legMeshes[0].sticks[0];
    longPress(game, o);
    setSlider(game, sliderFor(game, "Leg segments"), 4);
    expect(o.legMeshes).toHaveLength(2);
    expect(o.legMeshes[0].sticks).toHaveLength(4);
    expect(inScene(old)).toBe(false);
  });

  it("clears every leg mesh when legs go to zero", () => {
    const o = legged(3);
    const all = o.legMeshes.flatMap((lg) => [...lg.sticks, ...lg.joints, lg.foot]);
    longPress(game, o);
    setSlider(game, sliderFor(game, "Legs"), 0);
    expect(o.legMeshes).toHaveLength(0);
    for (const m of all) expect(inScene(m)).toBe(false);
  });

  it("adds one foot collider sphere per leg", () => {
    const o = game.debug.objs.find((c) => isPickable(game, c));
    const before = o.cn;
    longPress(game, o);
    setSlider(game, sliderFor(game, "Legs"), 4);
    expect(o.cn).toBe(before + 4);
    expect(o.cRad[o.cn - 1]).toBeCloseTo(footR(o), 6);
  });
});

describe("updateLegs", () => {
  it("keeps every bone of a leg at legLen-derived length divided by the segment count", () => {
    const o = legged(4, () => setSlider(game, sliderFor(game, "Leg segments"), 3));
    game.step(30);
    const L = Math.min(o.legLen * o.size, Math.max(0.05 * o.size, (game.debug.yMax - game.debug.yMin) * 0.95 - 2 * o.rBody));
    const total = (L + 0.15 * Math.abs(o.bottomLocal)) * 1.1 + 0.04;
    for (const lg of o.legMeshes) {
      for (const bone of lg.sticks) expect(bone.scale.y).toBeCloseTo(total / 3, 4);
    }
  });

  it("bends knees forward in the facing direction", () => {
    const o = legged(2);
    game.step(150);
    o.tripNow = false; o.vTarget = 0;
    game.step(1);
    expect(o.state).toBe("walk");
    for (const lg of o.legMeshes) {
      const hip = lg.joints[0].position, knee = lg.joints[1].position, foot = lg.foot.position;
      const off = lerpOffLine(hip, foot, knee);
      expect(off.length()).toBeGreaterThan(1e-3);
      expect(off.dot(o.side) * o.fdir).toBeGreaterThan(0);
    }
  });
});

describe("legBrain", () => {
  it("walks a wandering legged shape sideways over 5 s", () => {
    const o = legged(4);
    game.step(150);
    o.beh.wander = true;
    o.wanderDir = o.pos.x > 0 ? -1 : 1; o.wanderT = 100;
    const x0 = o.pos.x;
    game.step(150);
    expect(Math.abs(o.pos.x - x0)).toBeGreaterThan(0.5);
    expect(o.state).toBe("walk");
  });

  it("sits down to rest when the energy runs out", () => {
    const o = legged(4);
    game.step(30);
    o.state = "walk"; o.energy = 0.01;
    game.step(2);
    expect(o.state).toBe("rest");
    game.step(120);
    expect(o.energy).toBeGreaterThan(0.01);
  });

  it("steps up out of a fall into a dizzy walk", () => {
    const o = legged(4);
    game.step(30);
    o.tripNow = true; o.groundT = 1;
    game.step(1);
    expect(o.state).toBe("fall");
    game.step(75);
    expect(o.state).toBe("walk");
  });
});
