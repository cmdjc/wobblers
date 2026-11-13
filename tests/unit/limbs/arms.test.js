import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { bootNew } from "../../helpers/boot.js";
import { click, isPickable, longPress, setSlider, sliderFor } from "../../helpers/input.js";
import { createArms, defaultAbeh } from "../../../src/limbs/arms.js";

let game;

beforeEach(async () => {
  game = await bootNew({ seed: 11 });
  game.step(60);
});

afterEach(() => game.dispose());

const armed = (arms, extra = () => {}) => {
  const o = game.debug.objs.find((c) => isPickable(game, c));
  longPress(game, o);
  setSlider(game, sliderFor(game, "Legs"), 2);
  setSlider(game, sliderFor(game, "Arms"), arms);
  extra(o);
  click(game, "#ed-done");
  game.step(150);
  return o;
};
const offLine = (a, b, p) => {
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  const v = new THREE.Vector3().subVectors(p, a);
  return v.sub(dir.multiplyScalar(v.dot(dir)));
};

describe("pure helpers", () => {
  it("enables every arm behavior by default", () => {
    expect(defaultAbeh()).toEqual({ gesture: true, punch: true, grab: true, hug: true });
  });

  it("is a factory", () => {
    expect(typeof createArms).toBe("function");
  });
});

describe("buildArms", () => {
  it("adds two arms with a hand sized by handScale", () => {
    const o = armed(2, () => setSlider(game, sliderFor(game, "Hand size"), 2));
    game.step(3);
    expect(o.armMeshes).toHaveLength(2);
    for (const a of o.armMeshes) {
      expect(a.sticks).toHaveLength(o.armSegs);
      expect(game.debug.scene.children).toContain(a.hand);
      expect(a.hand.visible).toBe(true);
      expect(a.hand.scale.x).toBeCloseTo(0.065 * o.size * 2, 6);
    }
  });

  it("removes the arms and drops a held item when arms go to zero", () => {
    const o = armed(2);
    const item = game.debug.objs.find((c) => c !== o);
    o.held = item; item.pinned = true; item.carried = true;
    const hand = o.armMeshes[0].hand;
    longPress(game, o);
    setSlider(game, sliderFor(game, "Arms"), 0);
    expect(o.armMeshes).toHaveLength(0);
    expect(game.debug.scene.children).not.toContain(hand);
    expect(o.held).toBe(null);
    expect(item.pinned).toBe(false);
    expect(item.carried).toBe(false);
    expect(o.ai.mode).toBe("idle");
  });
});

describe("armHandTarget", () => {
  it("keeps hands near the body while idle", () => {
    const o = armed(2);
    o.abeh.gesture = false; o.abeh.punch = false; o.abeh.grab = false; o.abeh.hug = false;
    game.step(45);
    expect(o.ai.mode).toBe("idle");
    const reach = o.armLen * o.size + o.rBody * 0.9 + 0.1;
    for (const a of o.armMeshes) expect(a.hand.position.distanceTo(o.pos)).toBeLessThan(reach);
  });

  it("bends elbows backward", () => {
    const o = armed(2);
    o.abeh.gesture = false; o.abeh.punch = false; o.abeh.grab = false; o.abeh.hug = false;
    game.step(45);
    expect(o.state).toBe("walk");
    for (const a of o.armMeshes) {
      const shoulder = a.joints[0].position, elbow = a.joints[1].position, hand = a.hand.position;
      const off = offLine(shoulder, hand, elbow);
      expect(off.length()).toBeGreaterThan(1e-3);
      expect(off.dot(o.side) * o.fdir).toBeLessThan(0);
    }
  });
});

describe("armTick", () => {
  it("fetches, lifts and throws a nearby light shape", () => {
    const o = armed(2);
    const item = game.debug.objs.find((c) => c !== o && c.arms === 0);
    for (const c of game.debug.objs.slice()) if (c !== o && c !== item) game.debug.removeObj(c);
    game.step(30);
    o.clumsy = 0;
    item.pos.set(o.pos.x + 0.6, o.pos.y, o.pos.z);
    item.vel.set(0, 0, 0);
    o.ai.item = item; o.ai.mode = "fetch"; o.ai.t = 0;
    const modes = new Set();
    let thrownAt = -1;
    for (let i = 0; i < 300 && thrownAt < 0; i++) {
      game.step(1);
      modes.add(o.ai.mode)
      if (o.held === item) {
        expect(item.pinned).toBe(true);
        expect(item.carried).toBe(true);
      }
      if (o.ai.mode === "throw" && o.held === null && modes.has("lift")) thrownAt = i;
    }
    expect(thrownAt).toBeGreaterThan(0);
    for (const m of ["fetch", "reach", "lift", "windup", "throw"]) expect(modes.has(m), m).toBe(true);
    expect(item.pinned).toBe(false);
    expect(item.carried).toBe(false);
    expect(item.vel.y).toBeGreaterThan(4);
    expect(Math.abs(item.vel.x)).toBeGreaterThan(1.5);
  });

  it("gives up a fetch when the item is gone", () => {
    const o = armed(2);
    const item = game.debug.objs.find((c) => c !== o);
    o.ai.item = item; o.ai.mode = "fetch"; o.ai.t = 0;
    item.dying = true;
    game.step(2);
    expect(o.ai.mode).toBe("idle");
    expect(o.ai.item).toBe(null);
  });
});
