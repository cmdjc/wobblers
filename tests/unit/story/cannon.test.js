import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { createContext } from "../../../src/context.js";
import { aimAt, ballistic, createCannon, fireOutcome } from "../../../src/story/cannon.js";
import { bootNew } from "../../helpers/boot.js";
import { mulberry32 } from "../../helpers/rng.js";
import { prepareUprising, until } from "./uprising.js";

let game;

afterEach(() => {
  game?.dispose();
  game = undefined;
});

const G = 15;

function stubCannonContext(objs = []) {
  const ctx = createContext();
  const element = { textContent: "", style: {}, addEventListener() {} };
  ctx.env = { document: { getElementById: () => element }, navigator: {} };
  ctx.scene = new THREE.Scene();
  ctx.objs = objs;
  ctx.blocks = [];
  ctx.towerG = new THREE.Group();
  ctx.partGeo = new THREE.BoxGeometry(0.4, 0.22, 0.4);
  ctx.partMat = new THREE.MeshBasicMaterial();
  ctx.hpFill = { style: {} };
  ctx.ey = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), hp: 1 };
  ctx.reb = { cn: null, genius: null, supplyX: 0, state: "build", kind: "cannon" };
  ctx.addRing = () => {};
  return ctx;
}

const fakeShape = (overrides = {}) => ({
  legs: 0, genius: false, dying: false, pinned: false, dragged: false, carried: false, stoneT: 0, ammoT: 0, ...overrides,
});

async function reachCannon(seed = 1) {
  game = await bootNew({ seed });
  prepareUprising(game);
  const { reb } = game.debug;
  until(game, "the cannon uprising starts", () => reb.state === "build" && reb.kind === "cannon", 120);
  return reb;
}

function toBattle(reb) {
  until(game, "the cannon is built", () => reb.state === "built", 150);
  until(game, "battle begins", () => reb.state === "battle" && game.debug.ey.state === "battle", 40);
}

describe("fireOutcome", () => {
  it("splits the roll into 14 % backfire, 14 % wild, 10 % fizzle and the rest normal", () => {
    expect(fireOutcome(0)).toBe("backfire");
    expect(fireOutcome(0.1399)).toBe("backfire");
    expect(fireOutcome(0.14)).toBe("wild");
    expect(fireOutcome(0.2799)).toBe("wild");
    expect(fireOutcome(0.28)).toBe("fizzle");
    expect(fireOutcome(0.3799)).toBe("fizzle");
    expect(fireOutcome(0.38)).toBe("normal");
    expect(fireOutcome(0.9999)).toBe("normal");
  });

  it("gives those shares over many seeded rolls", () => {
    const random = mulberry32(42);
    const counts = { backfire: 0, wild: 0, fizzle: 0, normal: 0 };
    const samples = 40000;
    for (let i = 0; i < samples; i++) counts[fireOutcome(random())]++;
    expect(counts.backfire / samples).toBeCloseTo(0.14, 2);
    expect(counts.wild / samples).toBeCloseTo(0.14, 2);
    expect(counts.fizzle / samples).toBeCloseTo(0.10, 2);
    expect(counts.normal / samples).toBeCloseTo(0.62, 2);
  });
});

describe("ballistic and aimAt", () => {
  const flightHeightAt = (angle, v, dx) => {
    const t = dx / (v * Math.cos(angle));
    return v * Math.sin(angle) * t - 0.5 * G * t * t;
  };

  it("finds the low angle that lands a shell on the target", () => {
    for (const [dx, dy] of [[5, 0], [6, 2], [3, -1], [7, 1]]) {
      const angle = ballistic(dx, dy, 13);
      expect(flightHeightAt(angle, 13, dx), `${dx},${dy}`).toBeCloseTo(dy, 6);
    }
  });

  it("falls back to a steep guess when the target is out of range", () => {
    expect(ballistic(30, 0, 13)).toBeCloseTo(Math.atan2(0, 30) + 0.25, 10);
    expect(ballistic(-1, 12, 13)).toBeCloseTo(Math.atan2(12, 0.1) + 0.25, 10);
  });

  it("leads a moving target and keeps the barrel between 0.15 and 1.35 rad", () => {
    const cn = { px: 0, py: 0 };
    const still = aimAt(cn, 6, 3, 0, 0);
    const rising = aimAt(cn, 6, 3, 0, 2);
    const retreating = aimAt(cn, 6, 3, 2, 0);
    expect(rising).toBeGreaterThan(still);
    expect(retreating).not.toBeCloseTo(still, 2);
    expect(aimAt(cn, 30, -20, 0, 0)).toBe(0.15);
    expect(aimAt(cn, 0.2, 9, 0, 0)).toBe(1.35);
  });
});

describe("createCannon", () => {
  it("plans six ghost parts, a barrel group and four supply blocks", () => {
    const ctx = stubCannonContext();
    const { planCannon } = createCannon(ctx);
    planCannon();
    const cn = ctx.reb.cn;
    expect(cn.parts).toHaveLength(6);
    expect(cn.parts.map((p) => p.meshes.length)).toEqual([2, 2, 1, 1, 1, 1]);
    expect(cn.g.visible).toBe(false);
    expect(ctx.scene.children).toContain(cn.g);
    expect(cn.x).toBe(-ctx.hx + 1.3);
    expect(cn.px).toBe(cn.x + 0.15);
    expect(cn.mats[0].wireframe).toBe(true);
    expect(ctx.pileBlocks).toHaveLength(4);
    expect(ctx.reb.supplyX).toBe(ctx.hx - 0.65);
  });

  it("solidifies a part when built and adds the carriage block for the third", () => {
    const ctx = stubCannonContext();
    ctx.spark = () => {};
    const { planCannon, buildCannonPart } = createCannon(ctx);
    planCannon();
    const cn = ctx.reb.cn;
    buildCannonPart(0);
    expect(cn.built).toBe(1);
    expect(cn.parts[0].meshes[0].m.material).toBe(cn.parts[0].meshes[0].solid);
    expect(ctx.blocks).toHaveLength(0);
    buildCannonPart(0);
    expect(cn.built).toBe(1);
    buildCannonPart(1);
    buildCannonPart(2);
    expect(ctx.blocks).toEqual([{ x0: cn.x - 0.7, x1: cn.x + 0.7, y0: ctx.yMin, y1: ctx.yMin + 0.5 }]);
  });

  it("offers legless idle shapes as ammunition", () => {
    const keep = fakeShape();
    const objs = [
      keep, fakeShape({ legs: 2 }), fakeShape({ genius: true }), fakeShape({ dying: true }), fakeShape({ pinned: true }),
      fakeShape({ dragged: true }), fakeShape({ carried: true }), fakeShape({ stoneT: 1 }), fakeShape({ ammoT: 2 }),
    ];
    const selected = fakeShape();
    objs.push(selected);
    const ctx = stubCannonContext(objs);
    ctx.sel = selected;
    const { ammoCandidates } = createCannon(ctx);
    expect(ammoCandidates()).toEqual([keep]);
  });

  it("frees spent ammunition: iron balls vanish, shapes regrow and get sick", () => {
    const ctx = stubCannonContext();
    const { endAmmo } = createCannon(ctx);
    const iron = fakeShape({ disposable: true, ammoT: 1, pos: new THREE.Vector3() });
    endAmmo(iron);
    expect(iron.dying).toBe(true);
    expect(iron.ammoT).toBe(0);
    const shape = fakeShape({ ammoT: 1, origSizeT: 1.2, sizeT: 0.7, sickT: 0 });
    endAmmo(shape);
    expect(shape.sizeT).toBe(1.2);
    expect(shape.origSizeT).toBe(0);
    expect(shape.sickT).toBe(1.5);
  });
});

describe("the design phase", () => {
  it("lasts 5 s: the blueprint fades in, nobody carries, then building starts", async () => {
    const reb = await reachCannon();
    const { objs } = game.debug;
    expect(reb.cphase).toBe("design");
    expect(reb.need).toBe(6);
    expect(reb.cn.g.visible).toBe(false);
    expect(reb.genius.sketch).not.toBeNull();
    until(game, "the blueprint appears", () => reb.cn.g.visible, 2);
    expect(reb.cT).toBeGreaterThan(0.8);
    expect(reb.cT).toBeLessThan(0.8 + 2 / 30);
    until(game, "the blueprint finishes", () => reb.cphase === "build", 7, () => {
      expect(objs.some((o) => o.part)).toBe(false);
      expect(reb.cn.built).toBe(0);
    });
    expect(reb.cT).toBeGreaterThan(5);
    expect(reb.cT).toBeLessThan(5 + 1 / 30 + 1e-9);
    expect(reb.cn.mats[0].opacity).toBeCloseTo(0.1 + 0.25 * Math.min(1, (reb.cT - 1 / 30) / 3), 6);
  });
});

describe("assembly", () => {
  it("carries six parts to the carriage one by one and builds the cannon", async () => {
    const reb = await reachCannon();
    const { objs, blocks, scene } = game.debug;
    const cn = reb.cn;
    until(game, "building starts", () => reb.cphase === "build", 8);
    until(game, "a helper carries a part", () => objs.some((o) => o.part && o.carryMesh), 60);
    expect(reb.inflight).toBeGreaterThanOrEqual(1);
    let lastBuilt = 0;
    until(game, "the cannon is built", () => reb.state === "built", 150, () => {
      expect(cn.built - lastBuilt).toBeLessThanOrEqual(1);
      lastBuilt = cn.built;
      expect(reb.placed).toBe(cn.built);
    });
    expect(cn.built).toBe(6);
    expect(reb.placed).toBe(6);
    expect(cn.parts.every((p) => p.done)).toBe(true);
    expect(cn.parts.every((p) => p.meshes.every((e) => e.m.material === e.solid))).toBe(true);
    expect(blocks).toContain(cn.block);
    expect(scene.children).toContain(cn.g);
    expect(objs.every((o) => !o.part)).toBe(true);
  });

  it("assembles a part itself after 30 s without progress", async () => {
    const reb = await reachCannon();
    until(game, "building starts", () => reb.cphase === "build", 8);
    const cn = reb.cn;
    const started = reb.t;
    game.harness.document.getElementById("grav").click();
    until(game, "the failsafe builds a part", () => cn.built === 1, 40);
    expect(reb.t - started).toBeGreaterThanOrEqual(30 - 1 / 30);
    expect(reb.placed).toBe(1);
  });
});

describe("the battle", () => {
  it("loads a legless shape or an iron ball, aims and fires", async () => {
    const reb = await reachCannon();
    toBattle(reb);
    const { objs, ey } = game.debug;
    const cn = reb.cn;
    until(game, "the cannon is loaded", () => cn.loaded !== null, 60);
    const shell = cn.loaded;
    expect(shell.legs === 0 || shell.disposable).toBe(true);
    expect(shell.pinned).toBe(true);
    expect(shell.sizeT).toBeLessThanOrEqual(0.7);
    until(game, "the cannon fires", () => shell.ammoT > 0, 120);
    expect(cn.loaded).toBeNull();
    expect(cn.fireCd).toBeGreaterThan(0);
    expect(cn.fireCd).toBeLessThanOrEqual(1.4);
    expect(shell.pinned).toBe(false);
    expect(shell.ammoT).toBeLessThanOrEqual(6);
    expect(shell.rip).toBe(0.14);
    expect(Math.abs(cn.angle - aimAt(cn, ey.pos.x, ey.pos.y, ey.vel.x, ey.vel.y))).toBeLessThan(0.5);
    expect(objs).toContain(shell);
  });

  it("lowers the eye by 0.085 for each shell that reaches it", async () => {
    const reb = await reachCannon();
    toBattle(reb);
    const { objs, ey } = game.debug;
    const shell = objs.find((o) => o.legs === 0 && !o.dying && !o.genius);
    for (const o of objs) o.ammoT = o === shell ? 6 : 0;
    shell.ammoHit = false;
    shell.pos.set(ey.pos.x, ey.pos.y, ey.pos.z);
    shell.vel.set(0, 0, 0);
    const before = ey.hp;
    game.step(1);
    expect(before - ey.hp).toBeCloseTo(0.085, 10);
    expect(shell.ammoHit).toBe(true);
    expect(shell.ammoT).toBeLessThanOrEqual(1.2);
  });

  it("wins the fight: the eye falls, the cannon is removed and the genius leaves", async () => {
    const reb = await reachCannon();
    toBattle(reb);
    until(game, "the eye falls", () => game.debug.ey.state === "defeated", 240);
    expect(game.debug.ey.hp).toBeLessThanOrEqual(0);
    until(game, "celebration", () => reb.state === "celebrate", 10);
    until(game, "the cannon is removed", () => reb.state === "off", 15);
    expect(reb.cn).toBeNull();
    expect(reb.genius).toBeNull();
    expect(game.debug.blocks).toHaveLength(0);
    expect(game.debug.pileBlocks).toHaveLength(0);
  });
});

describe("without the genius", () => {
  it("aborts the uprising during the design", async () => {
    const reb = await reachCannon();
    const { scene } = game.debug;
    const { g } = reb.cn;
    game.debug.removeObj(reb.genius);
    expect(reb.genius).toBeNull();
    game.step(1);
    expect(reb.state).toBe("off");
    expect(reb.cn).toBeNull();
    expect(reb.kind).toBe("");
    expect(scene.children).not.toContain(g);
    expect(game.debug.blocks).toHaveLength(0);
    expect(game.debug.pileBlocks).toHaveLength(0);
  });

  it("aborts the uprising during the battle and sends the eye away", async () => {
    const reb = await reachCannon();
    toBattle(reb);
    game.debug.removeObj(reb.genius);
    game.step(1);
    expect(reb.state).toBe("off");
    expect(reb.cn).toBeNull();
    expect(game.debug.ey.battleMode).toBe(false);
    expect(game.debug.blocks).toHaveLength(0);
  });
});
