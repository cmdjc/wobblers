import * as THREE from "three";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootNew } from "../../helpers/boot.js";
import { click, pointer, tapShape, toClient } from "../../helpers/input.js";
import { isPickable } from "../../helpers/input.js";
import { createContext } from "../../../src/context.js";
import { createVillain } from "../../../src/story/villain.js";
import { giveLegs, until } from "./uprising.js";

const FRAME = 1 / 30;
let game;
let aw;

const element = (id) => game.harness.document.getElementById(id);

beforeAll(async () => {
  game = await bootNew({ seed: 7 });
  game.step(60);
  const used = new Set();
  for (let i = 0; i < 3; i++) {
    const o = game.debug.objs.find((x) => !used.has(x) && !x.dying && isPickable(game, x));
    used.add(o);
    giveLegs(game, o);
  }
  aw = game.debug.aw;
  game.debug.startAwakening();
  until(game, "wary", () => aw.state === "wary", 25);
  const pill = toClient(game, aw.pill.position);
  pointer(game, "pointerdown", pill);
  pointer(game, "pointerup", pill);
  expect(aw.state).toBe("boss");
  until(game, "their resolve breaks", () => aw.state === "capture", 90, () => {
    const target = game.debug.objs.find((o) => !o.dying && isPickable(game, o));
    if (target) tapShape(game, target);
  });
}, 120000);

afterAll(() => game?.dispose());

function stubVillainContext() {
  const ctx = createContext();
  const elements = {};
  const element = (id) => elements[id] ??= { id, hidden: true, style: {}, classList: { add() {}, remove() {} }, addEventListener() {} };
  ctx.env = { document: { getElementById: element }, navigator: {} };
  ctx.scene = new THREE.Scene();
  ctx.objs = [];
  ctx.blocks = [];
  ctx.aw = { state: "boss", resolve: 1, cell: null };
  ctx.mkTex = () => ({ dispose() {} });
  ctx.spark = () => {};
  ctx.ey = {};
  return { ctx, elements };
}

describe("createVillain", () => {
  it("registers the ending on ctx and lowers the resolve bar only during the boss fight", () => {
    const { ctx, elements } = stubVillainContext();
    createVillain(ctx);
    for (const name of ["hitThem", "awBlastHurt", "planCell", "dismantleCell", "startVillain", "rattle", "rattleMove", "villainTap", "villainFrame"]) {
      expect(typeof ctx[name], name).toBe("function");
    }
    expect(ctx.resolveEl).toBe(elements.resolvehp);
    expect(ctx.vilPanel).toBe(elements.vilpanel);
    ctx.hitThem(0.25);
    expect(ctx.aw.resolve).toBe(0.75);
    expect(elements.resolvefill.style.width).toBe("75%");
    ctx.aw.state = "wary";
    ctx.hitThem(0.25);
    expect(ctx.aw.resolve).toBe(0.75);
  });

  it("plans a cell sized to the room, collapsed until the capture grows it", () => {
    const { ctx } = stubVillainContext();
    createVillain(ctx);
    ctx.planCell();
    const { cell } = ctx.aw;
    expect(cell.W).toBe(2.5);
    expect(cell.H).toBeCloseTo(Math.min(3.8, (ctx.yMax - ctx.yMin) * 0.55), 10);
    expect(cell.x0).toBeCloseTo(-ctx.hx + 0.1, 10);
    expect(cell.g.scale.y).toBe(0.02);
    expect(cell.sealed).toBe(false);
    expect(cell.blocks).toEqual([
      { x0: cell.x0 - 0.15, x1: cell.x0, y0: ctx.yMin, y1: cell.y1 + 0.15 },
      { x0: cell.x1, x1: cell.x1 + 0.15, y0: ctx.yMin, y1: cell.y1 + 0.15 },
      { x0: cell.x0 - 0.15, x1: cell.x1 + 0.15, y0: cell.y1, y1: cell.y1 + 0.15 },
    ]);
    expect(ctx.scene.children).toContain(cell.g);
    ctx.dismantleCell();
    expect(ctx.aw.cell).toBeNull();
    expect(ctx.scene.children).not.toContain(cell.g);
  });
});

describe("the capture", () => {
  it("builds a cell in the left corner with three solid blocks and grows it over 2.2 s", () => {
    const { debug } = game;
    const cell = aw.cell;
    expect(cell.x0).toBeCloseTo(-debug.hx + 0.1, 10);
    expect(cell.W).toBe(Math.min(2.5, 2 * debug.hx - 1.5));
    expect(cell.H).toBe(Math.min(3.8, (debug.yMax - debug.yMin) * 0.55));
    expect(cell.x1).toBeCloseTo(cell.x0 + cell.W, 10);
    expect(cell.y1).toBeCloseTo(debug.yMin + cell.H, 10);
    expect(cell.blocks).toHaveLength(3);
    expect(cell.sealed).toBe(false);
    expect(cell.g.scale.y).toBeLessThan(1);
    expect(debug.blocks).not.toContain(cell.blocks[0]);
    expect(element("vilpanel").hidden).toBe(false);
    expect(element("resolvehp").hidden).toBe(true);
    expect(element("bosshp").hidden).toBe(true);
    expect(element("awvig").classList.contains("villain")).toBe(true);
  });

  it("cages every shape and parks it on a grid inside the cell", () => {
    const { debug } = game;
    const live = debug.objs.filter((o) => !o.dying);
    expect(live.length).toBeGreaterThan(0);
    for (const o of live) {
      expect(o.caged).toBe(true);
      expect(o.pinned).toBe(true);
      expect(o.role).toBeNull();
      expect(o.pinTarget.x).toBeGreaterThan(aw.cell.x0);
      expect(o.pinTarget.x).toBeLessThan(aw.cell.x1);
    }
    expect(debug.ey.state).toBe("master");
    expect(debug.reb.cn).toBeNull();
  });

  it("slams the door after 2.4 s: the blocks join the world and the villain phase starts", () => {
    until(game, "the door slams", () => aw.state === "villain", 5);
    expect(aw.cell.sealed).toBe(true);
    expect(aw.cell.g.scale.y).toBe(1);
    for (const b of aw.cell.blocks) expect(game.debug.blocks).toContain(b);
    for (const o of game.debug.objs.filter((x) => x.caged)) expect(o.pinned).toBe(false);
    expect(aw.vilT).toBeLessThan(FRAME * 2);
  });
});

describe("the cell", () => {
  it("rattles when the finger sweeps along the bars and the rattle fades", () => {
    const { debug } = game;
    const at = toClient(game, { x: (aw.cell.x0 + aw.cell.x1) / 2, y: aw.cell.y1 - 0.5, z: 0 });
    pointer(game, "pointerdown", at);
    game.step(1);
    expect(aw.rattle).toBe(0);
    for (let i = 1; i <= 4; i++) {
      pointer(game, "pointermove", { x: at.x + (i % 2 ? 20 : -20), y: at.y });
      game.step(1);
    }
    pointer(game, "pointerup", at);
    expect(aw.rattle).toBeGreaterThan(0);
    expect(aw.rattle).toBeLessThanOrEqual(1.5);
    const peak = aw.rattle;
    game.step(30);
    expect(aw.rattle).toBeLessThan(peak * 0.1);
    expect(debug.objs.some((o) => o.caged && o.rip > 0)).toBe(true);
  });

  it("keeps prisoners inside even if one is pushed out", () => {
    const prisoner = game.debug.objs.find((o) => o.caged && !o.dying);
    prisoner.pos.set(aw.cell.x1 + 3, 2, 0);
    game.step(1);
    expect(prisoner.pos.x).toBe((aw.cell.x0 + aw.cell.x1) / 2);
    expect(prisoner.pos.y).toBe(game.debug.yMin + 1.0);
  });

  it("makes a tapped prisoner jump and orders the eye to zap it", () => {
    const prisoner = game.debug.objs.find((o) => o.caged && !o.dying);
    const eye = game.debug.ey;
    eye.aim = 0;
    aw.zapCd = 0;
    tapShape(game, prisoner);
    expect(eye.zapTarget).toBe(prisoner);
    expect(aw.zapCd).toBeGreaterThan(1);
  });

  it("fades them to gray: 95 % at 80 s", () => {
    const { debug } = game;
    until(game, "40 s in", () => aw.vilT >= 40, 60);
    expect(aw.gray).toBeCloseTo(Math.min(1, aw.vilT / 80) * 0.95, 2);
    expect(aw.gray).toBeGreaterThan(0.45);
    until(game, "80 s in", () => aw.vilT >= 80, 60);
    expect(aw.gray).toBeCloseTo(0.95, 3);
    game.step(60);
    expect(aw.gray).toBeCloseTo(0.95, 10);
    const gray = debug.objs.find((o) => o.caged && !o.dying);
    if (gray) expect(gray.mat.uniforms.uGray.value).toBeGreaterThan(0.8);
  }, 60000);

  it("lets traitors talk their way out, at most three", () => {
    expect(aw.traitors).toBeGreaterThanOrEqual(1);
    expect(aw.traitors).toBeLessThanOrEqual(3);
    const freed = game.debug.objs.filter((o) => !o.caged && !o.dying);
    expect(freed.length).toBe(aw.traitors);
    for (const o of freed) expect(o.pos.x).toBeGreaterThan(aw.cell.x1);
  });

  it("Free them releases everyone, removes the cell and resets the count", () => {
    const { debug } = game;
    debug.reb.total = 3;
    click(game, "#vil-free");
    expect(aw.state).toBe("peace");
    expect(aw.ending).toBe("released");
    expect(aw.cell).toBeNull();
    expect(debug.objs.some((o) => o.caged)).toBe(false);
    expect(debug.blocks).toHaveLength(0);
    expect(element("vilpanel").hidden).toBe(true);
    expect(element("awvig").classList.contains("villain")).toBe(false);
    expect(debug.reb.total).toBe(3);
    until(game, "peace settles", () => aw.state === "off", 10);
    expect(debug.reb.total).toBe(0);
  });
});
