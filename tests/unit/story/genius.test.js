import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { createContext } from "../../../src/context.js";
import { createGenius, sketchPath } from "../../../src/story/genius.js";
import { bootNew } from "../../helpers/boot.js";
import { prepareUprising, until } from "./uprising.js";

let game;

afterEach(() => game?.dispose());
afterEach(() => { game = undefined; });

const rigParts = (rig) => rig.children.filter((c) => c.geometry);
const ofType = (rig, type) => rigParts(rig).filter((c) => c.geometry.type === type);

describe("outfitTextures", () => {
  it("builds only the clip, brain and bulb textures, once", () => {
    const ctx = createContext();
    const made = [];
    ctx.env = {};
    ctx.scene = new THREE.Scene();
    ctx.objs = [];
    ctx.reb = {};
    ctx.mkTex = (w, h) => { const tex = { w, h }; made.push(tex); return tex; };
    const { outfitTextures } = createGenius(ctx);
    const textures = outfitTextures();
    expect(Object.keys(textures)).toEqual(["clip", "brain", "bulb"]);
    expect(made.map(({ w, h }) => [w, h])).toEqual([[64, 80], [128, 96], [64, 96]]);
    expect(outfitTextures()).toBe(textures);
    expect(ctx.outfitTex).toBe(textures);
    expect(made).toHaveLength(3);
  });
});

describe("sketchPath", () => {
  it("traces each idea with a fixed number of points", () => {
    expect(sketchPath("gear")).toHaveLength(63);
    expect(sketchPath("spiral")).toHaveLength(52);
    expect(sketchPath("cannon")).toHaveLength(28 + 13);
    expect(sketchPath("zigzag")).toHaveLength(32);
    expect(sketchPath("star")).toHaveLength(35);
  });

  it("closes the cannon sketch where it starts", () => {
    const pts = sketchPath("cannon");
    expect(pts[0]).toEqual([-0.55, -0.12]);
    expect(pts[27][0]).toBeCloseTo(-0.45 - 0.1 * (6 / 7), 6);
    expect(pts[27][1]).toBeCloseTo(-0.3 + 0.18 * (6 / 7), 6);
    expect(pts[28]).toEqual([-0.15 + 0.17, -0.38]);
  });
});

describe("spawnGenius", () => {
  beforeEach(async () => {
    game = await bootNew({ seed: 5 });
    game.step(30);
  });

  it("adds one genius with legs, an outfit and a 3D rig", () => {
    const { objs, reb, scene } = game.debug;
    const before = objs.length;
    game.debug.spawnGenius();
    const genius = objs.filter((o) => o.genius);
    expect(genius).toHaveLength(1);
    expect(objs).toHaveLength(before + 1);
    const g = genius[0];
    expect(reb.genius).toBe(g);
    expect(g.role).toBe("genius");
    expect(g.legs).toBe(2);
    expect(g.size).toBe(1.1);
    expect(g.mat.uniforms.uColA.value.getHex()).toBe(0xfff2a8);
    expect(g.rig).toBeInstanceOf(THREE.Group);
    expect(scene.children).toContain(g.rig);
    expect(ofType(g.rig, "ConeGeometry")).toHaveLength(16);
    expect(ofType(g.rig, "TorusGeometry").filter((m) => m.geometry.parameters.radius === 0.165)).toHaveLength(2);
    const goggleRings = ofType(g.rig, "TorusGeometry").filter((m) => m.geometry.parameters.radius === 0.1);
    expect(goggleRings).toHaveLength(2);
    expect(goggleRings.every((m) => m.material.color.getHex() === 0xd4a24c)).toBe(true);
    expect(g.rigMats).toHaveLength(7);
  });

  it("gives the outfit clip, brain and bulb sprites and no flat coat, glasses, goggles or hair", () => {
    game.debug.spawnGenius();
    const g = game.debug.objs.find((o) => o.genius);
    expect(Object.keys(g.outfit)).toEqual(["clip", "brain", "bulb"]);
    for (const sprite of Object.values(g.outfit)) {
      expect(sprite).toBeInstanceOf(THREE.Sprite);
      expect(game.debug.scene.children).toContain(sprite);
    }
    expect(Object.keys(game.debug.outfitTex)).toEqual(["clip", "brain", "bulb"]);
  });

  it("removes the genius's gear with clearOutfit", () => {
    game.debug.spawnGenius();
    const g = game.debug.objs.find((o) => o.genius);
    const { rig, outfit } = g;
    game.debug.removeObj(g);
    expect(game.debug.scene.children).not.toContain(rig);
    for (const sprite of Object.values(outfit)) expect(game.debug.scene.children).not.toContain(sprite);
    expect(game.debug.reb.genius).toBeNull();
  });

  it("makes room by removing an idle shape when the room is full", () => {
    const { objs } = game.debug;
    while (objs.length < 16) game.debug.addObj(0, 0, 2);
    game.debug.spawnGenius();
    game.step(20);
    expect(objs.filter((o) => o.genius)).toHaveLength(1);
    expect(objs.filter((o) => !o.dying).length).toBeLessThanOrEqual(16);
  });
});

describe("updateOutfit", () => {
  beforeEach(async () => {
    game = await bootNew({ seed: 5 });
    game.step(30);
    game.debug.spawnGenius();
  });

  it("keeps the rig on the body and the sprites at fixed offsets from it", () => {
    const g = game.debug.objs.find((o) => o.genius);
    game.step(90);
    const S = g.size, cs = Math.cos(g.tilt), sn = Math.sin(g.tilt);
    expect(g.rig.position.toArray()).toEqual(g.pos.toArray());
    expect(g.rig.scale.x).toBe(S);
    expect(g.rig.visible).toBe(true);
    const { brain, clip, bulb } = g.outfit;
    expect(brain.position.x).toBeCloseTo(g.pos.x - 1.22 * sn * S, 6);
    expect(brain.position.y).toBeCloseTo(g.pos.y + 1.22 * cs * S, 6);
    expect(brain.position.z).toBeCloseTo(g.pos.z + g.front, 6);
    expect(brain.scale.y).toBeCloseTo(0.72 * S * (1 + 0.08 * Math.sin(game.debug.time * 3)), 6);
    expect(clip.position.x).toBeCloseTo(g.pos.x + (0.62 * g.faceDir * cs + 0.12 * sn) * S, 6);
    expect(clip.position.z).toBeCloseTo(g.pos.z + g.front + 0.05, 6);
    expect(clip.scale.x).toBeCloseTo(0.5 * S, 6);
    expect(bulb.position.x).toBeCloseTo(g.pos.x + (-0.62 * g.faceDir * cs - 1.35 * sn) * S, 6);
  });

  it("follows the shape as it moves", () => {
    const g = game.debug.objs.find((o) => o.genius);
    game.step(30);
    const before = g.rig.position.clone();
    g.vel.set(4, 6, 0);
    game.step(10);
    expect(g.pos.distanceTo(before)).toBeGreaterThan(0.3);
    expect(g.rig.position.toArray()).toEqual(g.pos.toArray());
    expect(g.outfit.brain.position.y).toBeCloseTo(g.pos.y + 1.22 * Math.cos(g.tilt) * g.size, 6);
  });

  it("shows the bulb only while the idea lights up", () => {
    const g = game.debug.objs.find((o) => o.genius);
    game.step(1);
    expect(g.outfit.bulb.visible).toBe(false);
    g.bulbT = 1;
    game.step(1);
    expect(g.outfit.bulb.visible).toBe(true);
  });
});

describe("genius behaviour", () => {
  it("paces near its home and sketches ideas in the air", async () => {
    game = await bootNew({ seed: 5 });
    game.step(30);
    game.debug.spawnGenius();
    const g = game.debug.objs.find((o) => o.genius);
    expect(g.sketch).toBeNull();
    until(game, "the genius starts a sketch", () => g.sketch, 20);
    expect(g.sketch.pts.length).toBeGreaterThan(20);
    expect(g.thinkT).toBeGreaterThan(0);
    until(game, "the sketch ends", () => !g.sketch, 10);
    expect(Math.abs(g.pos.x - g.homeX)).toBeLessThan(2.7);
  });
});

describe("the genius uprising", () => {
  it("appears after the eye's 2nd judgment with seed 1", async () => {
    game = await bootNew({ seed: 1 });
    prepareUprising(game);
    const { reb } = game.debug;
    expect(reb.geniusRolled).toBe(false);
    until(game, "the genius appears", () => reb.genius !== null, 120);
    expect(reb.total).toBe(2);
    expect(reb.geniusRolled).toBe(true);
    expect(reb.genius.genius).toBe(true);
    expect(game.debug.objs.filter((o) => o.genius)).toHaveLength(1);
    until(game, "a cannon uprising starts", () => reb.state !== "off", 60);
    expect(reb.kind).toBe("cannon");
    expect(reb.total).toBe(3);
  });
});
