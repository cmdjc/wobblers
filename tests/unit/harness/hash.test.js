import { describe, expect, it } from "vitest";
import { diff, hash } from "../../helpers/trace.js";

describe("hash", () => {
  it("ignores key order", () => {
    expect(hash({ a: 1, b: [1, 2] })).toBe(hash({ b: [1, 2], a: 1 }));
  });

  it("tells NaN, -0, 0, and Infinity apart", () => {
    const hashes = [NaN, -0, 0, Infinity, -Infinity].map((v) => hash({ v }));
    expect(new Set(hashes).size).toBe(5);
  });

  it("returns 8 hex digits", () => {
    expect(hash({ a: 1 })).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("diff", () => {
  it("returns null for equal values", () => {
    expect(diff({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBeNull();
  });

  it("returns the first differing path and both values", () => {
    expect(diff({ a: [1, { b: 2 }], z: 1 }, { a: [1, { b: 3 }], z: 2 })).toEqual({ path: "a[1].b", a: 2, b: 3 });
  });

  it("uses Object.is", () => {
    expect(diff({ v: NaN }, { v: NaN })).toBeNull();
    expect(diff({ v: 0 }, { v: -0 })).toEqual({ path: "v", a: 0, b: -0 });
  });

  it("reports a missing key and a length change", () => {
    expect(diff({ a: 1 }, {}).path).toBe("a");
    expect(diff([1, 2], [1]).path).toBe("[1]");
  });
});
