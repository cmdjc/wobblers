import * as THREE from "three";
import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it } from "vitest";
import { CAM_Z, TAN, createBackground } from "../../../src/gfx/background.js";
import { createContext } from "../../../src/context.js";
import { createFakeRenderer } from "../../helpers/fakeRenderer.js";

let ctx;
let dom;
let renderer;
let background;

beforeEach(() => {
  dom = new JSDOM('<div id="bar"></div>');
  const { window } = dom;
  window.innerWidth = 390;
  window.innerHeight = 844;
  renderer = createFakeRenderer();
  ctx = createContext();
  ctx.env = { window, document: window.document };
  ctx.renderer = renderer;
  ctx.scene = new THREE.Scene();
  ctx.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  ctx.timeU = { value: 0 };
  background = createBackground(ctx);
});

describe("createBackground", () => {
  it("adds the swirl sphere, the room edges and the motes to the scene in that order", () => {
    const [bg, box, motes] = ctx.scene.children;
    expect(ctx.scene.children).toHaveLength(3);
    expect(bg.geometry.type).toBe("SphereGeometry");
    expect(bg.material.side).toBe(THREE.BackSide);
    expect(box.type).toBe("LineSegments");
    expect(motes.type).toBe("Points");
    expect(motes.geometry.attributes.position.count).toBe(140);
  });

  it("scatters the motes inside the legacy ranges", () => {
    const arr = ctx.scene.children[2].geometry.attributes.position.array;
    for (let i = 0; i < 140; i++) {
      expect(Math.abs(arr[i * 3])).toBeLessThanOrEqual(4);
      expect(Math.abs(arr[i * 3 + 1])).toBeLessThanOrEqual(8);
      expect(arr[i * 3 + 2]).toBeGreaterThanOrEqual(-3);
      expect(arr[i * 3 + 2]).toBeLessThanOrEqual(1);
    }
  });

  it("exports the camera distance and the half-fov tangent", () => {
    expect(CAM_Z).toBe(10);
    expect(TAN).toBeCloseTo(Math.tan((25 * Math.PI) / 180), 12);
  });
});

describe("resize", () => {
  it("sets the room bounds from a 390x844 window with the fallback bar height", () => {
    const tan = Math.tan((50 / 2) * Math.PI / 180);
    const d = CAM_Z - 1.8;
    const hy = tan * d * 0.98;
    const hx = tan * d * (390 / 844) * 0.98;
    const wpp = (2 * hy) / 844;
    const yMin = -hy + (120 + 6) * wpp;
    expect([ctx.W, ctx.H]).toEqual([390, 844]);
    expect(ctx.hy).toBeCloseTo(hy, 10);
    expect(ctx.hx).toBeCloseTo(hx, 10);
    expect(ctx.yMax).toBeCloseTo(hy, 10);
    expect(ctx.yMin).toBeCloseTo(yMin, 10);
  });

  it("sizes the renderer and camera and fits the room box", () => {
    const [, box] = ctx.scene.children;
    expect(renderer.calls).toContainEqual({ name: "setSize", args: [390, 844, false] });
    expect(ctx.camera.aspect).toBeCloseTo(390 / 844, 12);
    expect(box.scale.x).toBeCloseTo(ctx.hx * 2, 10);
    expect(box.scale.y).toBeCloseTo(ctx.yMax - ctx.yMin, 10);
    expect(box.scale.z).toBeCloseTo(3.6, 10);
    expect(box.position.y).toBeCloseTo((ctx.yMax + ctx.yMin) / 2, 10);
  });

  it("runs again on window resize and load events", () => {
    const { window } = dom;
    const before = renderer.calls.filter((c) => c.name === "setSize").length;
    window.innerWidth = 800;
    window.innerHeight = 600;
    window.dispatchEvent(new window.Event("resize"));
    expect([ctx.W, ctx.H]).toEqual([800, 600]);
    window.dispatchEvent(new window.Event("load"));
    expect(renderer.calls.filter((c) => c.name === "setSize")).toHaveLength(before + 2);
  });

  it("uses the measured bar height when there is one", () => {
    Object.defineProperty(dom.window.document.getElementById("bar"), "offsetHeight", { value: 200 });
    background.resize();
    const wpp = (2 * ctx.hy) / 844;
    expect(ctx.yMin).toBeCloseTo(-ctx.hy + 206 * wpp, 10);
  });

  it("is registered on ctx", () => {
    expect(ctx.resize).toBe(background.resize);
  });
});

describe("updateMotes", () => {
  it("lifts each mote and wraps it from the ceiling to the floor", () => {
    const arr = ctx.scene.children[2].geometry.attributes.position.array;
    arr[1] = 7.95;
    arr[4] = 0;
    ctx.time = 0;
    background.updateMotes(0.4);
    expect(arr[1]).toBe(-8);
    expect(arr[4]).toBeCloseTo(0.1, 6);
  });

  it("flags the position attribute for upload", () => {
    const geo = ctx.scene.children[2].geometry;
    const version = geo.attributes.position.version;
    background.updateMotes(0.016);
    expect(geo.attributes.position.version).toBe(version + 1);
  });
});
