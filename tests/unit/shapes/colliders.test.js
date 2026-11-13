import * as THREE from "three";
import { beforeEach, describe, expect, it } from "vitest";
import { createColliders } from "../../../src/shapes/colliders.js";

let api;
let ctx;

beforeEach(() => {
  ctx = { footR: () => 0.1, hipXZ: (o, i) => [i * 0.2, 0] };
  api = createColliders(ctx);
});

const shape = (over = {}) => ({
  shape: 0, size: 1, sx: 1, sy: 1, sz: 1, level: 0, legs: 0, legCur: 0.3,
  mesh: { quaternion: new THREE.Quaternion() }, ...over,
});

describe("buildCollider", () => {
  it("assigns itself, updateWO and fillShape onto ctx", () => {
    for (const name of ["buildCollider", "updateWO", "fillShape"]) expect(ctx[name]).toBe(api[name]);
  });

  it("fills a unit sphere with one sphere of radius 0.5", () => {
    const o = shape();
    api.buildCollider(o);
    expect(o.cn).toBe(1);
    expect(o.cRad[0]).toBeCloseTo(0.5, 6);
    expect(o.r).toBeCloseTo(0.5, 6);
    expect(o.bottomLocal).toBeCloseTo(-0.5, 6);
    expect(o.halfW).toBeCloseTo(0.5, 6);
  });

  it("scales the radius with size", () => {
    const o = shape({ size: 1.5 });
    api.buildCollider(o);
    expect(o.r).toBeCloseTo(0.75, 6);
  });

  it("makes a stretched pancake flat", () => {
    const o = shape({ sx: 2, sy: 0.2, sz: 2 });
    api.buildCollider(o);
    const vertical = -2 * o.bottomLocal;
    expect(o.halfW * 2).toBeGreaterThan(5 * vertical);
    expect(o.cn).toBeGreaterThan(1);
  });

  it("builds a torus as a ring of spheres with none at the center", () => {
    const o = shape({ shape: 2 });
    api.buildCollider(o);
    expect(o.cn).toBeGreaterThanOrEqual(8);
    for (let k = 0; k < o.cn; k++) {
      const dist = Math.hypot(o.cOff[3 * k], o.cOff[3 * k + 1], o.cOff[3 * k + 2]);
      expect(dist).toBeCloseTo(0.36, 5);
    }
  });

  it("adds one foot sphere per leg below the body", () => {
    const bare = shape();
    api.buildCollider(bare);
    for (const legs of [2, 4]) {
      const o = shape({ legs });
      api.buildCollider(o);
      expect(o.cn).toBe(bare.cn + legs);
      for (let i = 0; i < legs; i++) {
        const k = bare.cn + i;
        expect(o.cRad[k]).toBeCloseTo(0.1, 6);
        expect(o.cOff[3 * k + 1]).toBeCloseTo(-0.5 - 0.3 + 0.1, 6);
        expect(o.cOff[3 * k]).toBeCloseTo(i * 0.2, 6);
      }
    }
  });

  it("adds six child spheres at level 1 and thirty more at level 2", () => {
    const counts = [0, 1, 2].map((level) => {
      const o = shape({ level });
      api.buildCollider(o);
      return o.cn;
    });
    expect(counts).toEqual([1, 7, 37]);
  });
});

describe("updateWO", () => {
  it("rotates the collider offsets with the mesh quaternion", () => {
    const o = shape({ shape: 2 });
    api.buildCollider(o);
    o.mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    api.updateWO(o);
    for (let k = 0; k < o.cn; k++) {
      expect(o.wo[3 * k]).toBeCloseTo(-o.cOff[3 * k + 1], 5);
      expect(o.wo[3 * k + 1]).toBeCloseTo(o.cOff[3 * k], 5);
    }
  });
});
