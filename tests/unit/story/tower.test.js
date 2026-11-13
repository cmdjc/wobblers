import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { BATTLE_PUNISH, PP, REBEL_AT, createTower } from "../../../src/story/tower.js";
import { createContext } from "../../../src/context.js";
import { bootNew } from "../../helpers/boot.js";
import { click } from "../../helpers/input.js";
import { pressIfReady, reachUprising, until } from "./uprising.js";

let game;

beforeEach(async () => {
  game = await bootNew({ seed: 7 });
});

afterEach(() => game.dispose());

const byId = (id) => game.harness.document.getElementById(id);

function toBattle() {
  reachUprising(game);
  until(game, "tower built", () => game.debug.reb.state === "built", 150);
  until(game, "battle begins", () => game.debug.reb.state === "battle" && game.debug.ey.state === "battle", 40);
}

function hitFromClimber(climber, rally) {
  const { ey, objs } = game.debug;
  for (const o of objs) if (o !== climber) o.hitCd = 5;
  climber.hitCd = 0;
  climber.rally = rally;
  climber.pos.set(ey.pos.x, ey.pos.y, ey.pos.z);
  climber.vel.set(0, 0, 0);
  const before = ey.hp;
  game.step(1);
  return before - ey.hp;
}

describe("constants", () => {
  it("keeps the legacy tuning", () => {
    expect(PP).toBe(3);
    expect(REBEL_AT).toBe(3);
    expect(BATTLE_PUNISH).toEqual(["fling", "fling", "fling", "sick", "stone", "shrink"]);
  });
});

describe("createTower", () => {
  it("adds an empty tower group, an idle uprising state and the story constants to ctx", () => {
    const hud = { hidden: false, style: {}, addEventListener() {}, textContent: "" };
    const ctx = createContext();
    ctx.scene = new THREE.Scene();
    ctx.env = { document: { getElementById: () => hud }, navigator: {}, setTimeout() {} };
    ctx.blocks = [];
    ctx.objs = [];
    ctx.ey = {};
    const api = createTower(ctx);
    expect(ctx.reb.state).toBe("off");
    expect(ctx.reb.total).toBe(0);
    expect(ctx.REBEL_AT).toBe(3);
    expect(ctx.BATTLE_PUNISH).toBe(BATTLE_PUNISH);
    expect(ctx.scene.children).toEqual([ctx.towerG]);
    expect(ctx.towerG.children).toHaveLength(0);
    for (const name of ["countLegged", "dropCarry", "abortRebellion", "defeatEye", "startCelebration", "rebelSteer", "rebelFrame"]) {
      expect(ctx[name], name).toBe(api[name]);
    }
  });
});

describe("planning", () => {
  it("plans 3 to 5 levels of 3 blocks after the 3rd judgment, with a ghost per block", () => {
    reachUprising(game);
    const { reb } = game.debug;
    expect(reb.total).toBeGreaterThanOrEqual(3);
    expect(reb.kind).toBe("tower");
    expect(reb.state).toBe("build");
    expect(reb.L).toBeGreaterThanOrEqual(3);
    expect(reb.L).toBeLessThanOrEqual(5);
    expect(reb.plats).toHaveLength(reb.L);
    expect(reb.pieces).toHaveLength(reb.L * 3);
    expect(reb.need).toBe(reb.L * 3);
    reb.plats.forEach((plat, i) => {
      expect(plat.side).toBe(i % 2 === 0 ? -1 : 1);
      expect(reb.pieces.filter((p) => p.plat === i)).toHaveLength(3);
    });
    expect(reb.pieces.every((p) => p.ghost && !p.built)).toBe(true);
    expect(game.debug.pileBlocks).toHaveLength(4);
  });
});

describe("building", () => {
  it("has builders carry blocks until placed reaches need", () => {
    reachUprising(game);
    const { reb, objs, blocks } = game.debug;
    until(game, "a builder carries a block", () => objs.some((o) => o.part && o.carryMesh), 60);
    expect(reb.inflight).toBeGreaterThanOrEqual(1);
    until(game, "tower built", () => reb.state === "built", 150);
    expect(reb.placed).toBe(reb.need);
    expect(blocks).toHaveLength(reb.need);
    expect(reb.pieces.every((p) => p.built && p.mesh && !p.ghost)).toBe(true);
    expect(reb.plats.every((p) => p.done)).toBe(true);
    expect(objs.every((o) => !o.part)).toBe(true);
  });

  it("assembles one block by itself after 30 s without progress", () => {
    reachUprising(game);
    const { reb, blocks } = game.debug;
    expect(reb.placed).toBe(0);
    const started = reb.t;
    click(game, "#grav");
    expect(game.debug.gMode).toBe(1);
    until(game, "the failsafe places a block", () => reb.placed === 1, 40);
    expect(reb.t - started).toBeGreaterThanOrEqual(30 - 1 / 30);
    expect(reb.t - started).toBeLessThan(31);
    expect(blocks).toHaveLength(1);
    expect(reb.pieces[0].built).toBe(true);
    expect(reb.pcs).toBe(1);
    expect(reb.stallT).toBeLessThan(1);
  });
});

describe("battle", () => {
  it("shows the eye bar and the Charge button when the tower is done", () => {
    toBattle();
    expect(game.debug.ey.battleMode).toBe(true);
    expect(byId("eyehp").hidden).toBe(false);
    expect(byId("charge").hidden).toBe(false);
    expect(byId("charge").textContent).toBe("Charge!");
    expect(game.debug.objs.some((o) => o.role === "climber")).toBe(true);
  });

  it("launches every grounded climber when Charge is pressed", () => {
    toBattle();
    const { objs, reb } = game.debug;
    const climbers = objs.filter((o) => o.role === "climber" && !o.dying);
    expect(climbers.length).toBeGreaterThanOrEqual(2);
    const grounded = climbers.filter((o) => o.groundT > 0);
    pressIfReady(game, "#charge");
    expect(reb.chargeCd).toBe(12);
    for (const o of climbers) {
      expect(o.rally).toBe(6);
      expect(o.goldT).toBeGreaterThanOrEqual(6);
    }
    for (const o of grounded) {
      expect(o.vel.y).toBeGreaterThan(0);
      expect(o.hopT).toBe(0.35);
      expect(o.groundT).toBe(0);
    }
    game.step(1);
    expect(byId("charge").disabled).toBe(true);
    expect(byId("charge").textContent).toBe("Charge (12)");
  });

  it("hurts the eye by 0.03 plus 0.015 times speed per climber hit, doubled when rallied", () => {
    toBattle();
    const climber = game.debug.objs.find((o) => o.role === "climber" && !o.dying);
    const plain = hitFromClimber(climber, 0);
    expect(plain).toBeGreaterThanOrEqual(0.03 - 1e-9);
    expect(plain).toBeLessThanOrEqual(0.045 + 1e-9);
    const rallied = hitFromClimber(climber, 6);
    expect(rallied).toBeGreaterThanOrEqual(0.06 - 1e-9);
    expect(rallied).toBeLessThanOrEqual(0.09 + 1e-9);
    game.step(1);
    expect(byId("eyehpfill").style.width).toBe(`${game.debug.ey.hp * 100}%`);
  });

  it("defeats the eye at 0 HP, celebrates, then removes the structure", () => {
    toBattle();
    const { ey, reb, blocks, objs } = game.debug;
    ey.hp = 0.01;
    const climber = objs.find((o) => o.role === "climber" && !o.dying);
    hitFromClimber(climber, 0);
    expect(ey.hp).toBeLessThanOrEqual(0);
    expect(reb.state).toBe("victory");
    expect(ey.state).toBe("defeated");
    expect(ey.dead).toBe(true);
    expect(byId("eyehpfill").style.width).toBe("0%");
    expect(byId("charge").hidden).toBe(true);
    until(game, "celebration", () => reb.state === "celebrate", 15);
    expect(objs.some((o) => o.role === "celebrate")).toBe(true);
    expect(byId("eyehp").hidden).toBe(true);
    until(game, "the tower is removed", () => reb.state === "off", 15);
    expect(reb.pieces).toHaveLength(0);
    expect(reb.plats).toHaveLength(0);
    expect(blocks).toHaveLength(0);
    expect(game.debug.pileBlocks).toHaveLength(0);
    expect(game.debug.scene.children.some((c) => c.type === "Group" && c.children.some((m) => m.geometry?.type === "BoxGeometry"))).toBe(false);
    expect(objs.every((o) => !o.role)).toBe(true);
  });
});

describe("abortRebellion", () => {
  it("is a no-op while nothing happens", () => {
    game.step(30);
    game.debug.abortRebellion();
    expect(game.debug.reb.state).toBe("off");
  });

  it("Clear all resets a tower under construction", () => {
    reachUprising(game);
    const { reb, blocks, objs } = game.debug;
    until(game, "a block is placed", () => reb.placed >= 1, 100);
    click(game, "#clr");
    game.step(30);
    expect(reb.state).toBe("off");
    expect(reb.pieces).toHaveLength(0);
    expect(reb.plats).toHaveLength(0);
    expect(reb.L).toBe(0);
    expect(reb.kind).toBe("");
    expect(reb.inflight).toBe(0);
    expect(blocks).toHaveLength(0);
    expect(game.debug.pileBlocks).toHaveLength(0);
    expect(objs).toHaveLength(0);
    expect(byId("eyehp").hidden).toBe(true);
    expect(byId("charge").hidden).toBe(true);
  });

  it("Clear all during the battle ends battle mode and sends the eye away", () => {
    toBattle();
    click(game, "#clr");
    game.step(30);
    const { reb, ey } = game.debug;
    expect(reb.state).toBe("off");
    expect(ey.battleMode).toBe(false);
    expect(ey.dead).toBe(false);
    expect(byId("eyebtn").textContent).toBe("Summon eye");
  });
});
