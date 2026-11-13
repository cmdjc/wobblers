import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { createContext } from "../../../src/context.js";
import { createEye } from "../../../src/eye/eye.js";
import { bootNew } from "../../helpers/boot.js";
import { click } from "../../helpers/input.js";

let game;

beforeEach(async () => {
  game = await bootNew({ seed: 21 });
  game.step(60);
});

afterEach(() => game.dispose());

const button = () => game.harness.document.getElementById("eyebtn");

function watchJudgments(until) {
  const { ey, reb } = game.debug;
  const events = [];
  let state = ey.state;
  let finished = 0;
  for (let i = 0; i < 3000 && !until(); i++) {
    const total = reb.total;
    game.step(1);
    if (ey.state !== state) {
      events.push({ from: state, to: ey.state, time: game.debug.time });
      state = ey.state;
    }
    if (reb.total !== total) {
      finished++;
      expect(reb.total).toBe(total + 1);
    }
  }
  return { events, finished };
}

describe("createEye", () => {
  it("adds the hidden beams and omen ring and waits for a summons", () => {
    const ctx = createContext();
    ctx.scene = new THREE.Scene();
    ctx.timeU = { value: 0 };
    ctx.env = { document: { getElementById: () => ({ addEventListener() {}, textContent: "" }) } };
    createEye(ctx);
    expect(ctx.ey.state).toBe("off");
    expect(ctx.ey.built).toBe(false);
    expect(ctx.ey.g).toBeNull();
    expect(ctx.scene.children).toHaveLength(3);
    expect(ctx.scene.children.every((child) => child.visible === false)).toBe(true);
  });
});

describe("summonEye", () => {
  it("builds the eye, adds it to the scene and arrives", () => {
    const { ey, scene } = game.debug;
    expect(ey.built).toBe(false);
    game.debug.summonEye();
    expect(ey.state).toBe("arrive");
    expect(scene.children).toContain(ey.g);
    expect(ey.g.visible).toBe(true);
    expect(ey.g.children).toEqual([ey.ball, ey.halo]);
    expect(ey.left).toBeGreaterThanOrEqual(3);
    expect(ey.left).toBeLessThanOrEqual(5);
    expect(ey.nextT).toBe(4.5);
    expect(button().textContent).toBe("Send eye away");
  });

  it("starts above the room and fades in", () => {
    const { ey, yMax } = game.debug;
    game.debug.summonEye();
    expect(ey.pos.y).toBe(yMax + 3.2);
    expect(ey.alpha).toBe(0);
    game.step(15);
    expect(ey.alpha).toBeCloseTo(0.5 / 0.9, 6);
    expect(ey.u.uOpacity.value).toBe(ey.alpha);
  });

  it("roams once the arrival time has passed", () => {
    const { ey } = game.debug;
    game.debug.summonEye();
    game.step(50);
    expect(ey.state).toBe("arrive");
    game.step(10);
    expect(ey.state).toBe("roam");
    expect(ey.alpha).toBe(1);
  });

  it("has no wing state", () => {
    const { ey } = game.debug;
    game.debug.summonEye();
    for (const name of ["wings", "featherMat", "fold"]) expect(name in ey, name).toBe(false);
  });
});

describe("judgments", () => {
  it("first omens 4.5 s after roaming starts, later ones 3 to 5.5 s after a verdict", () => {
    const { reb } = game.debug;
    game.debug.summonEye();
    const { events } = watchJudgments(() => reb.total >= 2);
    const frame = 1 / 30;
    const roams = events.filter((e) => e.to === "roam");
    const omens = events.filter((e) => e.to === "omen");
    expect(omens.length).toBeGreaterThanOrEqual(2);
    expect(omens[0].time - roams[0].time).toBeGreaterThan(4.5 - 1e-9);
    expect(omens[0].time - roams[0].time).toBeLessThan(4.5 + 2 * frame);
    for (let i = 1; i < omens.length; i++) {
      const wait = omens[i].time - roams[i].time;
      expect(wait).toBeGreaterThan(3 - 1e-9);
      expect(wait).toBeLessThan(5.5 + 2 * frame);
    }
  });

  it("shows an omen of 2.6 s before every verdict or hug", () => {
    const { reb } = game.debug;
    game.debug.summonEye();
    const { events } = watchJudgments(() => reb.total >= 2);
    const judged = events.filter((e) => e.to === "verdict" || e.to === "hug");
    expect(judged.length).toBeGreaterThanOrEqual(2);
    for (const e of judged) {
      expect(e.from).toBe("omen");
      const omen = events.filter((o) => o.to === "omen" && o.time < e.time).pop();
      expect(e.time - omen.time).toBeGreaterThan(2.6 - 1e-9);
      expect(e.time - omen.time).toBeLessThan(2.6 + 2 / 30);
    }
  });

  it("counts reb.total once per completed judgment", () => {
    const { reb } = game.debug;
    expect(reb.total).toBe(0);
    game.debug.summonEye();
    const { events, finished } = watchJudgments(() => reb.total >= 2);
    expect(finished).toBe(2);
    expect(reb.total).toBe(2);
    const returns = events.filter((e) => (e.from === "verdict" || e.from === "hug") && e.to === "roam");
    expect(returns).toHaveLength(2);
  });
});

describe("leaving", () => {
  it("leaves and hides when sent away", () => {
    const { ey } = game.debug;
    game.debug.summonEye();
    game.step(60);
    click(game, "#eyebtn");
    expect(ey.state).toBe("leave");
    expect(button().textContent).toBe("Summon eye");
    game.step(60);
    expect(ey.state).toBe("off");
    expect(ey.g.visible).toBe(false);
  });

  it("summons again from the button when off", () => {
    const { ey } = game.debug;
    click(game, "#eyebtn");
    expect(ey.state).toBe("arrive");
    expect(button().textContent).toBe("Send eye away");
  });
});

describe("bob and squash kick", () => {
  it("bobs the group by sin(flap) * 0.05", () => {
    const { ey } = game.debug;
    game.debug.summonEye();
    game.step(80);
    for (let i = 0; i < 8; i++) {
      game.step(3);
      expect(ey.g.position.y - ey.pos.y).toBeCloseTo(Math.sin(ey.flap) * 0.05, 12);
    }
  });

  it("advances flap at 6.5 per second while roaming", () => {
    const { ey } = game.debug;
    game.debug.summonEye();
    game.step(70);
    expect(ey.state).toBe("roam");
    const before = ey.flap;
    const t0 = game.debug.time;
    game.step(1);
    expect(ey.flap - before).toBeCloseTo((game.debug.time - t0) * 6.5, 12);
  });

  it("kicks the squash spring when the flap cycle wraps", () => {
    const { ey } = game.debug;
    game.debug.summonEye();
    game.step(70);
    ey.q = 0; ey.qv = 0;
    ey.flap = 1.5 * Math.PI - 0.001;
    const t0 = game.debug.time;
    game.step(1);
    const dt = game.debug.time - t0;
    expect(ey.qv).toBeCloseTo(-0.9 * (1 - 3.5 * dt), 9);
  });
});
