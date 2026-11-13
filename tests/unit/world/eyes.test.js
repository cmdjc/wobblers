import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createEyes } from "../../../src/world/eyes.js";
import { stubDocument } from "./world.js";

const make = () => {
  const ctx = { env: { document: stubDocument() } };
  const api = createEyes(ctx);
  return { ctx, api, eyes: api.makeEyes() };
};

describe("makeEyes", () => {
  it("assigns makeEyes and drawEyes onto ctx", () => {
    const { ctx, api } = make();
    expect(ctx.makeEyes).toBe(api.makeEyes);
    expect(ctx.drawEyes).toBe(api.drawEyes);
  });

  it("returns a 128x64 canvas sprite with an empty key", () => {
    const { eyes } = make();
    expect([eyes.c.width, eyes.c.height]).toEqual([128, 64]);
    expect(eyes.s).toBeInstanceOf(THREE.Sprite);
    expect(eyes.tex).toBeInstanceOf(THREE.CanvasTexture);
    expect(eyes.key).toBe("");
  });
});

describe("drawEyes", () => {
  const hashAfter = (...args) => {
    const { api, eyes } = make();
    api.drawEyes(eyes, ...args);
    return eyes.c.__hash;
  };

  it("paints the same canvas for the same inputs", () => {
    expect(hashAfter(0.5, -0.25, 0, false)).toBe(hashAfter(0.5, -0.25, 0, false));
  });

  it("paints differently for each mood, for blink, and for look direction", () => {
    const hashes = [
      hashAfter(0, 0, 0, false), hashAfter(0, 0, 1, false), hashAfter(0, 0, 2, false), hashAfter(0, 0, 3, false),
      hashAfter(0, 0, 4, false), hashAfter(0, 0, 0, true), hashAfter(1, 0, 0, false), hashAfter(0, 1, 0, false),
    ];
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it("skips repainting when the rounded key is unchanged and flags the texture otherwise", () => {
    const { api, eyes } = make();
    api.drawEyes(eyes, 0.5, 0.5, 0, false);
    const painted = eyes.c.__calls;
    const version = eyes.tex.version;
    api.drawEyes(eyes, 0.51, 0.5, 0, false);
    expect(eyes.c.__calls).toBe(painted);
    expect(eyes.tex.version).toBe(version);
    api.drawEyes(eyes, 0.9, 0.5, 0, false);
    expect(eyes.c.__calls).toBeGreaterThan(painted);
    expect(eyes.tex.version).toBe(version + 1);
  });
});
