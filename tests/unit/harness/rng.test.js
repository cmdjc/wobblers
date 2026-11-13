import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import { installRandom, mulberry32 } from "../../helpers/rng.js";

let handle;
afterEach(() => handle?.restore());

describe("mulberry32", () => {
  it("repeats the same sequence for the same seed", () => {
    const a = mulberry32(7), b = mulberry32(7);
    const seqA = Array.from({ length: 50 }, a), seqB = Array.from({ length: 50 }, b);
    expect(seqA).toEqual(seqB);
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it("differs between seeds", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe("installRandom", () => {
  it("routes three uuid calls to the uuid stream only", () => {
    handle = installRandom(5);
    const before = { ...handle.counts };
    new THREE.Mesh();
    expect(handle.counts.game).toBe(before.game);
    expect(handle.counts.uuid).toBeGreaterThan(before.uuid);
    Math.random();
    expect(handle.counts.game).toBe(before.game + 1);
  });

  it("gives the game stream the same values whatever objects three creates", () => {
    handle = installRandom(9);
    const first = [Math.random(), Math.random()];
    handle.restore();
    handle = installRandom(9);
    const a = Math.random();
    new THREE.Group();
    new THREE.Mesh();
    expect([a, Math.random()]).toEqual(first);
  });

  it("restores Math.random", () => {
    const original = Math.random;
    handle = installRandom(1);
    expect(Math.random).not.toBe(original);
    handle.restore();
    expect(Math.random).toBe(original);
  });
});
