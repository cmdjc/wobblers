import { describe, expect, it } from "vitest";
import { MAX_OBJS } from "../../../src/world/objects.js";
import { makeWorld } from "./world.js";

describe("addObj", () => {
  it("adds one object and its mesh and eye sprite to the scene with the legacy defaults", () => {
    const { ctx, objs } = makeWorld();
    const before = ctx.scene.children.length;
    const o = ctx.addObj(2, 1.5, -0.5);
    expect(objs).toEqual([o]);
    expect(ctx.objs).toBe(objs);
    expect(ctx.scene.children).toHaveLength(before + 2);
    expect(ctx.scene.children).toContain(o.mesh);
    expect(ctx.scene.children).toContain(o.eyes.s);
    expect(o.shape).toBe(2);
    expect(o.size).toBeGreaterThanOrEqual(0.72);
    expect(o.size).toBeLessThan(1.07);
    expect(o.sizeT).toBe(o.size);
    expect([o.wob, o.legs, o.arms, o.level, o.bounce, o.density, o.friction, o.gScale]).toEqual([0, 0, 0, 0, 0.75, 1, 0.3, 1]);
    expect([o.sx, o.sy, o.sz]).toEqual([1, 1, 1]);
    expect([o.pos.x, o.pos.y]).toEqual([1.5, -0.5]);
    expect(Math.abs(o.pos.z)).toBeLessThanOrEqual(0.6);
    expect(o.state).toBe("walk");
    expect(o.mesh.scale.x).toBe(o.size);
    expect(o.cn).toBeGreaterThan(0);
  });

  it("gives each object a fresh id from ctx.uid", () => {
    const { ctx } = makeWorld();
    const a = ctx.addObj(0, 0, 0), b = ctx.addObj(1, 0, 0);
    expect([a.id, b.id]).toEqual([0, 1]);
    expect(ctx.uid).toBe(2);
  });

  it("exports the object cap", () => {
    expect(MAX_OBJS).toBe(16);
  });
});

describe("removeObj", () => {
  it("removes the object, its mesh, and its eye sprite", () => {
    const { ctx, objs } = makeWorld();
    const before = ctx.scene.children.length;
    const keep = ctx.addObj(0, 0, 0);
    const gone = ctx.addObj(1, 1, 1);
    ctx.removeObj(gone);
    expect(objs).toEqual([keep]);
    expect(ctx.scene.children).toHaveLength(before + 2);
    expect(ctx.scene.children).not.toContain(gone.mesh);
    expect(ctx.scene.children).not.toContain(gone.eyes.s);
  });

  it("clears the genius slot when the genius goes", () => {
    const { ctx } = makeWorld();
    const o = ctx.addObj(0, 0, 0);
    ctx.reb.genius = o;
    ctx.removeObj(o);
    expect(ctx.reb.genius).toBe(null);
  });

  it("closes the editor when the selected object goes", () => {
    const { ctx } = makeWorld();
    let closed = 0;
    ctx.closeEditor = () => { closed++; };
    const o = ctx.addObj(0, 0, 0);
    ctx.sel = o;
    ctx.removeObj(o);
    expect(closed).toBe(1);
  });
});

describe("applySize", () => {
  it("updates mass, front, pitch, and the collider radius", () => {
    const { ctx } = makeWorld();
    const o = ctx.addObj(0, 0, 0);
    o.size = 1.5; o.sx = o.sy = o.sz = 1; o.density = 2; o.level = 0;
    ctx.applySize(o);
    expect(o.r).toBeCloseTo(0.75, 6);
    expect(o.mass).toBeCloseTo(1.5 ** 3 * 2, 6);
    expect(o.front).toBeCloseTo(0.54 * 1.5, 6);
    expect(o.pitch).toBeCloseTo(1 / 1.5, 6);
  });

  it("scales front by the stretch and the complexity level", () => {
    const { ctx } = makeWorld();
    const o = ctx.addObj(0, 0, 0);
    o.size = 1; o.sx = 2; o.level = 1;
    ctx.applySize(o);
    const sm = 1 + 0.6;
    expect(o.frontMul).toBeCloseTo(sm * 1.9, 6);
    expect(o.mass).toBeCloseTo(2 * 1.5, 6);
  });
});

describe("object cap", () => {
  it("is held by the Add button, which drops the oldest unheld shape", async () => {
    const { bootNew } = await import("../../helpers/boot.js");
    const game = await bootNew({ seed: 7 });
    try {
      const { debug, harness } = game;
      const add = harness.window.document.getElementById("add");
      const firstId = debug.objs[0].id;
      debug.objs[1].dragged = true;
      while (debug.objs.length < MAX_OBJS) add.click();
      expect(debug.objs).toHaveLength(MAX_OBJS);
      add.click();
      expect(debug.objs).toHaveLength(MAX_OBJS);
      expect(debug.objs.some((o) => o.id === firstId)).toBe(false);
      expect(debug.objs.some((o) => o.dragged)).toBe(true);
    } finally {
      game.dispose();
    }
  });
});
