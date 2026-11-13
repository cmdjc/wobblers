import { beforeEach, describe, expect, it } from "vitest";
import { createBlocks } from "../../../src/world/blocks.js";
import { createPhysics } from "../../../src/world/physics.js";
import { makeWorld } from "./world.js";

let ctx;
let blocks;

beforeEach(() => {
  ({ ctx } = makeWorld());
  ctx.orientLegged = () => {};
  ({ blocks } = createBlocks(ctx));
  createPhysics(ctx);
});

const ball = (x, y) => {
  const o = ctx.addObj(0, x, y);
  o.size = o.sizeT = 1;
  ctx.applySize(o);
  o.pos.z = 0;
  return o;
};

describe("createBlocks", () => {
  it("starts empty and shares its array and collideBlocks through ctx", () => {
    expect(blocks).toEqual([]);
    expect(ctx.blocks).toBe(blocks);
    expect(typeof ctx.collideBlocks).toBe("function");
  });
});

describe("collideBlocks", () => {
  it("pushes a sphere out of the top of a box along y", () => {
    blocks.push({ x0: -1, x1: 1, y0: -1, y1: 0 });
    const o = ball(0.5, 0.3);
    ctx.collideBlocks(o);
    expect(o.pos.y).toBeCloseTo(0.5, 10);
    expect(o.pos.x).toBe(0.5);
  });

  it("pushes a sphere out of the side of a box along x", () => {
    blocks.push({ x0: -1, x1: 1, y0: -1, y1: 0 });
    const o = ball(1.3, -0.5);
    ctx.collideBlocks(o);
    expect(o.pos.x).toBeCloseTo(1.5, 10);
    expect(o.pos.y).toBe(-0.5);
  });

  it("takes the shortest way out when the center is inside the box", () => {
    blocks.push({ x0: -2, x1: 2, y0: -1, y1: 1 });
    const o = ball(1.8, 0);
    ctx.collideBlocks(o);
    expect(o.pos.x).toBeCloseTo(2.5, 10);
  });

  it("bounces the velocity off the face it hits", () => {
    blocks.push({ x0: -1, x1: 1, y0: -1, y1: 0 });
    const o = ball(0.5, 0.3);
    o.vel.set(0, -3, 0);
    ctx.collideBlocks(o);
    expect(o.vel.y).toBeGreaterThan(0);
  });

  it("ignores a sphere that clears the box and a dying one", () => {
    blocks.push({ x0: -1, x1: 1, y0: -1, y1: 0 });
    const clear = ball(0, 1);
    ctx.collideBlocks(clear);
    expect(clear.pos.y).toBe(1);
    const dying = ball(0, 0.1);
    dying.dying = true;
    ctx.collideBlocks(dying);
    expect(dying.pos.y).toBe(0.1);
  });
});
