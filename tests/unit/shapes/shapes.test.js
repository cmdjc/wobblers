import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { AUTO_SHAPES, COL, GEAR, SHAPES, createShapes } from "../../../src/shapes/shapes.js";

describe("shape tables", () => {
  it("lists eight shapes with the fields the physics reads", () => {
    expect(SHAPES.map((s) => s.name)).toEqual(["Sphere", "Cube", "Torus", "Knot", "Cone", "Cylinder", "Pyramid", "Gear"]);
    for (const sh of SHAPES) {
      for (const field of ["e", "r", "front", "pitch"]) expect(typeof sh[field], `${sh.name}.${field}`).toBe("number");
      expect(typeof sh.geo).toBe("function");
      expect(typeof sh.low).toBe("function");
    }
    expect(COL).toHaveLength(SHAPES.length);
  });

  it("makes the gear index 7 and keeps gears out of the auto cycle", () => {
    expect(GEAR).toBe(7);
    expect(SHAPES[GEAR].name).toBe("Gear");
    expect(AUTO_SHAPES).toBe(7);
  });

  it("builds a toothed gear thinner than it is wide", () => {
    const geo = SHAPES[GEAR].geo();
    geo.computeBoundingBox();
    const size = geo.boundingBox.getSize(new THREE.Vector3());
    expect(size.z).toBeCloseTo(0.28, 5);
    expect(size.x).toBeCloseTo(1, 1);
  });
});

describe("createShapes", () => {
  it("assigns the geometry getters onto ctx", () => {
    const ctx = {};
    const api = createShapes(ctx);
    for (const name of ["getGeo", "getLow", "getFracGeo"]) expect(ctx[name]).toBe(api[name]);
  });

  it("caches the base geometry per factory", () => {
    const a = createShapes({});
    const b = createShapes({});
    expect(a.getGeo(0)).toBe(a.getGeo(0));
    expect(a.getFracGeo(0, 0)).toBe(a.getGeo(0));
    expect(a.getGeo(0)).not.toBe(b.getGeo(0));
  });

  it("grows the vertex count with the complexity level and returns the cached geometry", () => {
    const { getGeo, getLow, getFracGeo } = createShapes({});
    const counts = [0, 1, 2, 3].map((lv) => getFracGeo(0, lv).attributes.position.count);
    expect(counts[0]).toBe(getGeo(0).attributes.position.count);
    expect(counts[1]).toBe(counts[0] + 6 * getLow(0).attributes.position.count);
    expect(counts[2]).toBe(counts[1] + 30 * getLow(0).attributes.position.count);
    expect(counts[3]).toBeGreaterThan(counts[2]);
    expect(getFracGeo(0, 2)).toBe(getFracGeo(0, 2));
    expect(getFracGeo(0, 1)).not.toBe(getFracGeo(0, 2));
  });
});
