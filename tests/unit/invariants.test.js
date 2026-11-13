import { describe, expect, it } from "vitest";
import { findViolation } from "../helpers/invariants.js";

const vec = (x = 0, y = 0, z = 0) => ({ x, y, z });
const shape = (over = {}) => ({
  id: 1, pos: vec(0, 0, 0), vel: vec(), ang: vec(), size: 1, sizeT: 1, sx: 1, sy: 1, sz: 1, r: 1, rBody: 1,
  cn: 1, wo: new Float32Array([0, 0, 0]), cRad: new Float32Array([0.5]), dying: false, pinned: false, dragged: false,
  ...over,
});
const world = (over = {}) => ({
  objs: [shape()], ey: { pos: vec(), vel: vec() }, fluid: { n: 2, px: new Float32Array([0, 1]), py: new Float32Array([0, 1]) },
  yMin: -3, yMax: 4, ...over,
});

describe("findViolation", () => {
  it("accepts a sane world", () => {
    expect(findViolation(world())).toBeNull();
  });

  it("reports NaN and Infinity in shape vectors and size fields", () => {
    expect(findViolation(world({ objs: [shape({ pos: vec(NaN) })] }))).toMatch(/shape 1 pos\.x/);
    expect(findViolation(world({ objs: [shape({ vel: vec(0, Infinity) })] }))).toMatch(/shape 1 vel\.y/);
    expect(findViolation(world({ objs: [shape({ ang: vec(0, 0, -Infinity) })] }))).toMatch(/shape 1 ang\.z/);
    expect(findViolation(world({ objs: [shape({ sizeT: NaN })] }))).toMatch(/shape 1 sizeT/);
    expect(findViolation(world({ objs: [shape({ sy: Infinity })] }))).toMatch(/shape 1 sy/);
  });

  it("reports NaN in the eye and in fluid positions", () => {
    expect(findViolation(world({ ey: { pos: vec(0, NaN), vel: vec() } }))).toMatch(/eye pos\.y/);
    expect(findViolation(world({ fluid: { n: 2, px: new Float32Array([0, NaN]), py: new Float32Array(2) } }))).toMatch(/fluid px\[1\]/);
  });

  it("ignores fluid particles beyond n", () => {
    expect(findViolation(world({ fluid: { n: 1, px: new Float32Array([0, NaN]), py: new Float32Array(2) } }))).toBeNull();
  });

  it("reports a shape whose collider leaves the room", () => {
    const low = shape({ pos: vec(0, -3.5, 0) });
    expect(findViolation(world({ objs: [low] }))).toMatch(/shape 1 below floor/);
    const high = shape({ pos: vec(0, 4.6, 0) });
    expect(findViolation(world({ objs: [high] }))).toMatch(/shape 1 above ceiling/);
  });

  it("skips the room check for dying, pinned, and dragged shapes", () => {
    for (const flag of ["dying", "pinned", "dragged"]) {
      expect(findViolation(world({ objs: [shape({ pos: vec(0, -9, 0), [flag]: true })] }))).toBeNull();
    }
  });
});
