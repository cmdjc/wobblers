import * as THREE from "three";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAM_Z, TAN } from "../../../src/gfx/background.js";
import { createFx } from "../../../src/gfx/fx.js";
import { createTextures } from "../../../src/gfx/textures.js";
import { makeWorld } from "../world/world.js";

let ctx;
let fx;
let dom;
let vibrate;

beforeEach(() => {
  vi.useFakeTimers();
  ({ ctx } = makeWorld());
  dom = new JSDOM('<div id="flash"></div>');
  const { window } = dom;
  window.innerHeight = 844;
  window.devicePixelRatio = 3;
  vibrate = vi.fn();
  const stubDoc = ctx.env.document;
  ctx.env = {
    window,
    document: { createElement: stubDoc.createElement, getElementById: (id) => window.document.getElementById(id) },
    navigator: { vibrate },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
  };
  createTextures(ctx);
  ctx.aw = { state: "idle" };
  ctx.fluid = { blast: vi.fn() };
  ctx.impact = vi.fn();
  ctx.boing = vi.fn();
  ctx.awBlastHurt = vi.fn();
  fx = createFx(ctx);
});

afterEach(() => vi.useRealTimers());

describe("rings", () => {
  it("adds an additive ring mesh at the point with the legacy start scale", () => {
    const before = ctx.scene.children.length;
    fx.addRing(new THREE.Vector3(1, 2, 3), 0xff0000, 2);
    expect(ctx.scene.children).toHaveLength(before + 1);
    const { m, max } = fx.rings[0];
    expect(m.position.toArray()).toEqual([1, 2, 3]);
    expect(m.scale.x).toBe(0.2);
    expect(m.material.blending).toBe(THREE.AdditiveBlending);
    expect(max).toBe(2);
  });

  it("defaults to a 3.6 radius ring", () => {
    fx.addRing(new THREE.Vector3());
    expect(fx.rings[0].max).toBe(3.6);
  });

  it("grows and fades, then is removed after 0.55 s", () => {
    fx.addRing(new THREE.Vector3(), undefined, 3.6);
    const { m } = fx.rings[0];
    fx.updateRings(0.275);
    expect(m.scale.x).toBeCloseTo(0.2 + 0.5 * 3.4, 10);
    expect(m.material.opacity).toBeCloseTo(0.45, 10);
    fx.updateRings(0.27);
    expect(fx.rings).toHaveLength(1);
    fx.updateRings(0.01);
    expect(fx.rings).toHaveLength(0);
    expect(ctx.scene.children).not.toContain(m);
  });
});

describe("blast", () => {
  const shapeAt = (x, y) => {
    const o = ctx.addObj(0, x, y);
    o.pos.z = 0;
    o.vel.set(0, 0, 0);
    return o;
  };

  it("pushes a nearby shape away from the point and leaves a far one alone", () => {
    const near = shapeAt(1, 0);
    const far = shapeAt(4, 0);
    fx.blast(new THREE.Vector3(0, 0, 0));
    const f = 1 - 1 / 3.4;
    expect(near.vel.x).toBeCloseTo((15 * f) / Math.sqrt(near.density), 10);
    expect(near.vel.y).toBeCloseTo(3 * f, 10);
    expect(near.moodT).toBe(1.1);
    expect(ctx.impact).toHaveBeenCalledTimes(1);
    expect(far.vel.toArray()).toEqual([0, 0, 0]);
    expect(far.moodT).toBe(0);
  });

  it("skips shapes that are dragged or pinned", () => {
    const held = shapeAt(1, 0);
    held.dragged = true;
    const pinned = shapeAt(-1, 0);
    pinned.pinned = true;
    fx.blast(new THREE.Vector3());
    expect(held.vel.length()).toBe(0);
    expect(pinned.vel.length()).toBe(0);
  });

  it("rings, thumps, stirs the fluid and vibrates", () => {
    fx.blast(new THREE.Vector3(0.5, 0.25, 0));
    expect(fx.rings).toHaveLength(1);
    expect(ctx.boing).toHaveBeenCalledWith(150, 0.1);
    expect(ctx.fluid.blast).toHaveBeenCalledWith(0.5, 0.25, 3.2, 9);
    expect(vibrate).toHaveBeenCalledWith(18);
  });

  it("hits harder in the villain ending and flashes violet", () => {
    ctx.aw.state = "villain";
    const near = shapeAt(1, 0);
    fx.blast(new THREE.Vector3());
    const f = 1 - 1 / 3.4;
    expect(near.vel.x).toBeCloseTo((25 * f) / Math.sqrt(near.density), 10);
    expect(fx.rings[0].max).toBe(5);
    expect(dom.window.document.getElementById("flash").style.opacity).toBe("0.3");
  });

  it("damages the boss when the awakening boss fight is on", () => {
    ctx.aw.state = "boss";
    const p = new THREE.Vector3(1, 1, 0);
    fx.blast(p);
    expect(ctx.awBlastHurt).toHaveBeenCalledWith(p);
  });
});

describe("sparks", () => {
  it("writes each spark into the next slot of the pool", () => {
    fx.spark(1, 2, 3, 2, { color: 0xff0000 });
    expect(ctx.spHead).toBe(2);
    const pos = fx.spGeo.attributes.position.array;
    const col = fx.spGeo.attributes.aColor.array;
    expect(pos.slice(0, 3)).toEqual(new Float32Array([1, 2, 3]));
    expect(pos.slice(3, 6)).toEqual(new Float32Array([1, 2, 3]));
    expect(Array.from(col.slice(0, 3))).toEqual([1, 0, 0]);
  });

  it("reuses slots in a ring of 280", () => {
    fx.spark(1, 1, 1, 1);
    fx.spark(0, 0, 0, 279);
    expect(ctx.spHead).toBe(0);
    fx.spark(9, 8, 7, 1);
    expect(ctx.spHead).toBe(1);
    expect(Array.from(fx.spGeo.attributes.position.array.slice(0, 3))).toEqual([9, 8, 7]);
  });

  it("ages sparks, moves them, and fades them out", () => {
    fx.spark(0, 0, 0, 1, { speed: 1, grav: 0, life: 1 });
    const age = fx.spAge[0], max = fx.spMax[0];
    expect(age).toBe(0);
    fx.updateSparks(max / 2);
    expect(fx.spAge[0]).toBeCloseTo(max / 2, 6);
    expect(fx.spGeo.attributes.aAlpha.array[0]).toBeCloseTo(0.5, 6);
    expect(fx.spGeo.attributes.position.array[0]).not.toBe(0);
    fx.updateSparks(max);
    expect(fx.spGeo.attributes.aAlpha.array[0]).toBe(0);
    fx.updateSparks(0.1);
    expect(fx.spGeo.attributes.aAlpha.array[0]).toBe(0);
  });

  it("adds one additive points object to the scene", () => {
    const pts = ctx.scene.children.filter((c) => c.type === "Points");
    expect(pts).toHaveLength(1);
    expect(pts[0].renderOrder).toBe(6);
    expect(pts[0].material.blending).toBe(THREE.AdditiveBlending);
  });

  it("scales the point size to the window and follows resize and load", () => {
    const px = () => fx.spMat.uniforms.uPx.value;
    expect(px()).toBeCloseTo((844 * 2) / (2 * TAN * CAM_Z), 8);
    dom.window.innerHeight = 400;
    dom.window.dispatchEvent(new dom.window.Event("resize"));
    expect(px()).toBeCloseTo((400 * 2) / (2 * TAN * CAM_Z), 8);
    dom.window.innerHeight = 500;
    dom.window.dispatchEvent(new dom.window.Event("load"));
    expect(px()).toBeCloseTo((500 * 2) / (2 * TAN * CAM_Z), 8);
  });
});

describe("flash", () => {
  it("shows the color at once and fades it out after 40 ms", () => {
    const el = dom.window.document.getElementById("flash");
    fx.flash("#ff0000", 0.6);
    expect(el.style.transition).toBe("none");
    expect(el.style.opacity).toBe("0.6");
    vi.advanceTimersByTime(40);
    expect(el.style.transition).toBe("opacity .45s");
    expect(el.style.opacity).toBe("0");
  });
});

describe("popText", () => {
  it("adds a sprite and removes it after its life", () => {
    const before = ctx.scene.children.length;
    fx.popText(1, 2, "Boing", "#fff", 1, 2);
    expect(ctx.scene.children).toHaveLength(before + 1);
    const { sp } = fx.popTexts[0];
    expect(sp.type).toBe("Sprite");
    expect(sp.position.toArray()).toEqual([1, 2, 1.6]);
    expect(sp.scale.toArray()).toEqual([4.4, 1.64, 1]);
    fx.updatePopTexts(0.5);
    expect(sp.material.opacity).toBeCloseTo(0.5, 10);
    expect(sp.position.y).toBeGreaterThan(2.2);
    fx.updatePopTexts(0.49);
    expect(fx.popTexts).toHaveLength(1);
    fx.updatePopTexts(0.02);
    expect(fx.popTexts).toHaveLength(0);
    expect(ctx.scene.children).toHaveLength(before);
  });

  it("defaults to a 1.6 s life", () => {
    fx.popText(0, 0, "x");
    expect(fx.popTexts[0].life).toBe(1.6);
  });
});

describe("bubble", () => {
  it("adds a sprite above the speaker and removes it after its life", () => {
    const o = ctx.addObj(0, 0, 0);
    fx.bubble(o, "hello there", 1);
    expect(fx.bubbles).toHaveLength(1);
    fx.updateBubbles(0.5);
    const { sp } = fx.bubbles[0];
    expect(sp.position.x).toBe(o.pos.x);
    expect(sp.position.y).toBeCloseTo(o.pos.y + o.size * 0.55 + 0.7 + 0.04, 10);
    expect(sp.material.opacity).toBe(1);
    fx.updateBubbles(0.6);
    expect(fx.bubbles).toHaveLength(0);
    expect(ctx.scene.children).not.toContain(sp);
  });

  it("drops the bubble when its speaker is gone", () => {
    const o = ctx.addObj(0, 0, 0);
    fx.bubble(o, "bye", 5);
    ctx.objs.splice(ctx.objs.indexOf(o), 1);
    fx.updateBubbles(0.1);
    expect(fx.bubbles).toHaveLength(0);
  });

  it("allows at most seven at once and ignores a missing speaker", () => {
    const o = ctx.addObj(0, 0, 0);
    for (let i = 0; i < 10; i++) fx.bubble(o, "hi");
    fx.bubble(null, "nobody");
    expect(fx.bubbles).toHaveLength(7);
  });
});

describe("createFx", () => {
  it("registers its public functions on ctx", () => {
    for (const name of ["addRing", "blast", "spark", "updateSparks", "updateSparkPx", "flash", "popText", "updatePopTexts", "bubble", "updateBubbles", "updateRings"]) {
      expect(ctx[name], name).toBe(fx[name]);
    }
  });
});
