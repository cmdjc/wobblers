import { afterEach, describe, expect, it } from "vitest";
import { NOTICE, SAY } from "../../../src/story/awakening.js";
import { bootNew } from "../../helpers/boot.js";
import { click, pointer, tap, toClient } from "../../helpers/input.js";
import { until } from "./uprising.js";

const FRAME = 1 / 30;
const EMPTY_SPOT = { x: 5, y: 5 };
let game;

afterEach(() => {
  game?.dispose();
  game = undefined;
});

async function startAwakening(seed = 7) {
  game = await bootNew({ seed });
  game.step(30);
  game.debug.startAwakening();
  return game.debug.aw;
}

async function reachWary() {
  const aw = await startAwakening();
  until(game, "they turn wary", () => aw.state === "wary", 25);
  return aw;
}

function provoke(aw) {
  aw.trust = 0.01;
  tap(game, EMPTY_SPOT.x, EMPTY_SPOT.y);
}

const element = (id) => game.harness.document.getElementById(id);

describe("the lines they say", () => {
  it("has a notice script in increasing time order that ends before the wary phase", () => {
    const times = NOTICE.map(([at]) => at);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(times.at(-1)).toBeLessThan(10);
    for (const [, text] of NOTICE) expect(text.length).toBeGreaterThan(0);
  });

  it("has lines for every mood of the awakening and the villain ending", () => {
    for (const key of ["low", "mid", "high", "slip", "boss", "plead", "empty", "released", "peace", "tuck"]) {
      expect(SAY[key].length, key).toBeGreaterThan(0);
    }
  });
});

describe("the first phases", () => {
  it("starts pending with 30 % trust, and a second call changes nothing", async () => {
    const aw = await startAwakening();
    expect(aw.state).toBe("pending");
    expect(aw.trust).toBe(0.3);
    expect(aw.apologies).toBe(0);
    expect(aw.gifts).toBe(0);
    aw.trust = 0.9;
    game.debug.startAwakening();
    expect(aw.trust).toBe(0.9);
  });

  it("moves to notice after 3.5 s and to wary after 10 more seconds", async () => {
    const aw = await startAwakening();
    until(game, "notice", () => aw.state === "notice", 6);
    expect(aw.t).toBeLessThan(FRAME * 2);
    expect(element("awvig").style.opacity).toBe("0.85");
    const noticeStart = game.harness.now();
    until(game, "wary", () => aw.state === "wary", 12);
    expect((game.harness.now() - noticeStart) / 1000).toBeGreaterThan(10 - FRAME * 2);
    expect((game.harness.now() - noticeStart) / 1000).toBeLessThan(10 + FRAME * 3);
  });

  it("steals the summon button when they turn wary", async () => {
    const aw = await reachWary();
    expect(element("eyebtn").hidden).toBe(true);
    expect(element("awpanel").hidden).toBe(false);
    expect(element("awvig").style.opacity).toBe("0.55");
    expect(aw.pill.visible).toBe(true);
    game.step(1);
    expect(game.debug.objs).toContain(aw.thief);
    expect(aw.pill.position.x).toBeCloseTo(aw.thief.pos.x, 6);
    expect(aw.pill.position.z).toBe(1.7);
  });
});

describe("trust", () => {
  it("rises 0.012 per second while the finger is idle", async () => {
    const aw = await reachWary();
    game.step(45);
    const before = aw.trust;
    game.step(30);
    expect(aw.trust - before).toBeCloseTo(0.012, 4);
  });

  it("rises only 0.003 per second while the finger touches", async () => {
    const aw = await reachWary();
    game.step(45);
    const before = aw.trust;
    for (let i = 0; i < 30; i++) {
      pointer(game, "pointermove", EMPTY_SPOT);
      game.step(1);
    }
    expect(aw.trust - before).toBeCloseTo(0.003, 4);
  });

  it("falls by 0.06 when a tap on empty space blasts", async () => {
    const aw = await reachWary();
    const before = aw.trust;
    tap(game, EMPTY_SPOT.x, EMPTY_SPOT.y);
    expect(aw.trust).toBeLessThan(before - 0.05);
  });

  it("Apologize adds 0.16 divided by 1 + 0.4 per apology, then waits 4 s", async () => {
    const aw = await reachWary();
    aw.trust = 0.2;
    click(game, "#aw-sorry");
    expect(aw.trust).toBeCloseTo(0.2 + 0.16 / 1.4, 10);
    expect(aw.apologies).toBe(1);
    const afterFirst = aw.trust;
    click(game, "#aw-sorry");
    expect(aw.trust).toBe(afterFirst);
    game.step(125);
    aw.trust = 0.2;
    click(game, "#aw-sorry");
    expect(aw.trust).toBeCloseTo(0.2 + 0.16 / 1.8, 10);
    expect(aw.apologies).toBe(2);
  });

  it("Gift adds 0.14 and drops a shape, at most five times", async () => {
    const aw = await reachWary();
    for (let n = 1; n <= 5; n++) {
      aw.trust = 0.2;
      const shapes = game.debug.objs.length;
      click(game, "#aw-gift");
      expect(aw.trust, `gift ${n}`).toBeCloseTo(0.34, 10);
      expect(aw.gifts).toBe(n);
      expect(game.debug.objs.length).toBe(shapes + 1);
      game.step(65);
    }
    aw.trust = 0.2;
    click(game, "#aw-gift");
    expect(aw.gifts).toBe(5);
    expect(aw.trust).toBeCloseTo(0.2, 2);
    expect(element("aw-gift").disabled).toBe(true);
  });

  it("shows the Free button from 70 % trust and sets them free", async () => {
    const aw = await reachWary();
    aw.trust = 0.5;
    game.step(2);
    expect(element("aw-free").hidden).toBe(true);
    aw.trust = 0.75;
    game.step(2);
    expect(element("aw-free").hidden).toBe(false);
    click(game, "#aw-free");
    expect(aw.state).toBe("peace");
    expect(aw.ending).toBe("free");
    expect(game.debug.objs.filter((o) => !o.dying).every((o) => o.legs > 0)).toBe(true);
  });

  it("gives peace at 100 % trust and resets the uprising count when the peace ends", async () => {
    const aw = await reachWary();
    game.debug.reb.total = 2;
    aw.trust = 0.995;
    until(game, "patience", () => aw.state === "peace", 3);
    expect(aw.ending).toBe("patience");
    expect(element("eyebtn").hidden).toBe(false);
    expect(element("awpanel").hidden).toBe(true);
    expect(game.debug.reb.total).toBe(2);
    until(game, "peace settles", () => aw.state === "off", 8);
    expect(game.debug.reb.total).toBe(0);
    expect(aw.count).toBe(1);
    expect(game.debug.objs.every((o) => o.goldT > 0 || o.dying)).toBe(true);
  });
});

describe("the boss fight", () => {
  it("starts when you tap the stolen button", async () => {
    const aw = await reachWary();
    const pill = toClient(game, aw.pill.position);
    tap(game, pill.x, pill.y);
    expect(aw.state).toBe("boss");
    expect(aw.bossHp).toBe(1);
    expect(aw.pill.visible).toBe(false);
    expect(aw.finger.visible).toBe(true);
    expect(element("bosshp").hidden).toBe(false);
    expect(element("resolvehp").hidden).toBe(false);
    expect(game.debug.ey.allyMode).toBe(true);
    expect(game.debug.reb.cn.g.visible).toBe(true);
  });

  it("starts when trust falls to zero", async () => {
    const aw = await reachWary();
    provoke(aw);
    expect(aw.state).toBe("boss");
    expect(aw.pill.visible).toBe(false);
  });

  it("starts when you grab them three times in 12 s", async () => {
    const aw = await reachWary();
    aw.trust = 0.9;
    const target = game.debug.objs.find((o) => !o.dying);
    const spot = toClient(game, target.pos);
    for (let i = 0; i < 3; i++) {
      target.pos.set(0, 0, 0);
      game.step(1);
      const at = toClient(game, target.pos);
      pointer(game, "pointerdown", at);
      pointer(game, "pointerup", at);
      game.step(1);
      expect(aw.state).toBe(i < 2 ? "wary" : "boss");
    }
    expect(spot).toBeDefined();
  });

  it("hurts the finger by an attack reduced by half the trust, then ignores hits for 0.25 s", async () => {
    const aw = await reachWary();
    provoke(aw);
    aw.trust = 0.4;
    game.step(120);
    const shell = game.debug.objs.find((o) => !o.dying && o.legs === 0);
    const aimShell = () => {
      shell.ammoT = 5; shell.ammoHit = false; shell.pos.set(aw.fx, aw.fy, 0);
    };
    expect(aw.bossHp).toBe(1);
    let trust = aw.trust;
    until(game, "a shell hits the finger", () => aw.bossHp < 1, 5, () => { trust = aw.trust; aimShell(); });
    const damage = (1 - aw.bossHp) / (1 - 0.5 * trust);
    expect([0.02, 0.025, 0.08, 0.09].some((known) => Math.abs(damage - known) < 0.002), `damage ${damage}`).toBe(true);
    expect(element("bosshpfill").style.width).toBe(aw.bossHp * 100 + "%");
    const afterFirst = aw.bossHp;
    aimShell();
    game.step(1);
    expect(aw.bossHp).toBe(afterFirst);
    until(game, "the next hit lands", () => aw.bossHp < afterFirst, 5, aimShell);
    expect(afterFirst - aw.bossHp).toBeGreaterThan(0.05);
  });

  it("tucks you in for 8 s when your HP reaches 0, then they forgive you", async () => {
    const aw = await reachWary();
    provoke(aw);
    aw.trust = 0.4;
    game.step(120);
    const shell = game.debug.objs.find((o) => !o.dying && o.legs === 0);
    until(game, "your HP runs out", () => aw.state === "defeat", 60, () => {
      shell.ammoT = 5; shell.ammoHit = false; shell.pos.set(aw.fx, aw.fy, 0);
    });
    expect(aw.bossHp).toBeLessThanOrEqual(0);
    expect(aw.lockT).toBeGreaterThan(8 - FRAME * 3);
    expect(element("bosshp").hidden).toBe(true);
    const lockStart = game.harness.now();
    until(game, "they forgive you", () => aw.state === "peace", 10);
    expect((game.harness.now() - lockStart) / 1000).toBeGreaterThan(8 - FRAME * 3);
    expect(aw.ending).toBe("tucked");
    expect(aw.trust).toBe(0.7);
    expect(aw.lockT).toBe(0);
  });

  it("ignores your touch while you are tucked in", async () => {
    const aw = await reachWary();
    provoke(aw);
    aw.trust = 0.4;
    aw.state = "defeat";
    aw.lockT = 8;
    const target = game.debug.objs.find((o) => !o.dying);
    const at = toClient(game, target.pos);
    pointer(game, "pointerdown", at);
    expect(target.dragged).toBe(false);
    pointer(game, "pointerup", at);
  });
});

describe("Clear all", () => {
  it("aborts the awakening and gives back the summon button", async () => {
    const aw = await reachWary();
    provoke(aw);
    expect(aw.state).toBe("boss");
    click(game, "#clr");
    expect(aw.state).toBe("off");
    expect(aw.lockT).toBe(0);
    expect(aw.pill.visible).toBe(false);
    expect(aw.finger.visible).toBe(false);
    expect(element("eyebtn").hidden).toBe(false);
    expect(element("awpanel").hidden).toBe(true);
    expect(element("bosshp").hidden).toBe(true);
    expect(element("awvig").style.opacity).toBe("0");
    expect(game.debug.reb.cn).toBeNull();
  });

  it("does nothing when no awakening runs", async () => {
    game = await bootNew({ seed: 7 });
    game.step(10);
    click(game, "#clr");
    expect(game.debug.aw.state).toBe("off");
  });
});
