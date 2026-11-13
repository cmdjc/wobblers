import * as THREE from "three";
import { beforeEach, describe, expect, it } from "vitest";
import { createTextures } from "../../../src/gfx/textures.js";
import { makeContext } from "../../helpers/stubCanvas.js";

let created;
let ctx;
let api;

beforeEach(() => {
  created = [];
  ctx = {
    env: {
      document: {
        createElement: (tag) => {
          expect(tag).toBe("canvas");
          const canvas = { width: 300, height: 150, getContext: () => canvas.__ctx };
          canvas.__ctx = makeContext(canvas);
          created.push(canvas);
          return canvas;
        },
      },
    },
  };
  api = createTextures(ctx);
});

describe("createTextures", () => {
  it("adds its functions to ctx and drops featherTexture", () => {
    for (const name of ["mkTex", "textTex", "bubbleTex", "haloTexture"]) expect(ctx[name]).toBe(api[name]);
    expect(api.featherTexture).toBeUndefined();
    expect(ctx.featherTexture).toBeUndefined();
  });

  it("mkTex sizes the canvas, passes the 2d context to the painter, and wraps it in a CanvasTexture", () => {
    let painted;
    const tex = api.mkTex(64, 32, (g) => { painted = g; g.fillRect(0, 0, 1, 1); });
    expect(tex).toBeInstanceOf(THREE.CanvasTexture);
    expect(tex.image).toBe(created[0]);
    expect([created[0].width, created[0].height]).toEqual([64, 32]);
    expect(painted).toBe(created[0].__ctx);
    expect(created[0].__calls).toBe(1);
  });

  it("haloTexture paints a 128 square radial gradient with three stops", () => {
    const tex = api.haloTexture();
    expect(tex).toBeInstanceOf(THREE.CanvasTexture);
    const canvas = created[0];
    expect([canvas.width, canvas.height]).toEqual([128, 128]);
    expect(canvas.__calls).toBe(6);
  });

  it("haloTexture is not cached", () => {
    expect(api.haloTexture()).not.toBe(api.haloTexture());
    expect(created).toHaveLength(2);
  });

  it("textTex paints stroked and filled text on a 256x96 canvas", () => {
    api.textTex("POW", "#fff");
    const canvas = created[0];
    expect([canvas.width, canvas.height]).toEqual([256, 96]);
    expect(canvas.__calls).toBe(9);
  });

  it("textTex caches per text and color", () => {
    const a = api.textTex("POW", "#fff");
    expect(api.textTex("POW", "#fff")).toBe(a);
    expect(api.textTex("POW", "#000")).not.toBe(a);
    expect(api.textTex("BAM", "#fff")).not.toBe(a);
    expect(created).toHaveLength(3);
  });

  it("textTex caches live in the factory, not at module scope", () => {
    const other = createTextures({ env: ctx.env });
    expect(other.textTex("POW", "#fff")).not.toBe(api.textTex("POW", "#fff"));
  });

  it("bubbleTex paints on a 340x150 canvas and caches per text", () => {
    const a = api.bubbleTex("hello there");
    const canvas = created[0];
    expect([canvas.width, canvas.height]).toEqual([340, 150]);
    expect(api.bubbleTex("hello there")).toBe(a);
    expect(created).toHaveLength(1);
    expect(api.bubbleTex("bye")).not.toBe(a);
  });

  it("bubbleTex wraps at 15 characters: more lines mean more fillText calls", () => {
    api.bubbleTex("hi");
    const short = created[0].__calls;
    api.bubbleTex("this is a much longer sentence that wraps");
    expect(created[1].__calls).toBeGreaterThan(short);
  });
});
