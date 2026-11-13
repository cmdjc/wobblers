import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootNew } from "../../helpers/boot.js";
import { drag, flick, isPickable, longPress, pointer, tap, tapShape, toClient } from "../../helpers/input.js";

let game;

beforeEach(async () => {
  game = await bootNew({ seed: 11 });
  game.step(60);
});

afterEach(() => game.dispose());

const pickable = () => game.debug.objs.find((o) => isPickable(game, o));

describe("long press", () => {
  it("opens the editor after 480 ms", () => {
    const o = pickable();
    longPress(game, o);
    expect(game.debug.sel).toBe(o);
    expect(o.dragged).toBe(false);
  });

  it("does not open it after a 200 ms press, which throws the shape instead", () => {
    const o = pickable();
    const { x, y } = toClient(game, { x: o.pos.x + o.wo[0], y: o.pos.y + o.wo[1], z: o.pos.z + o.wo[2] });
    pointer(game, "pointerdown", { x, y });
    game.harness.advance(200);
    pointer(game, "pointerup", { x, y });
    game.step(1);
    expect(game.debug.sel).toBe(null);
  });

  it("is cancelled when the finger moves more than 10 px", () => {
    const o = pickable();
    const { x, y } = toClient(game, { x: o.pos.x + o.wo[0], y: o.pos.y + o.wo[1], z: o.pos.z + o.wo[2] });
    pointer(game, "pointerdown", { x, y });
    pointer(game, "pointermove", { x: x + 20, y });
    game.harness.advance(600);
    pointer(game, "pointerup", { x: x + 20, y });
    expect(game.debug.sel).toBe(null);
  });
});

describe("drag", () => {
  it("pulls the held shape toward the pointer", () => {
    const o = pickable();
    const start = o.pos.clone();
    const target = { x: start.x < 0 ? start.x + 1.2 : start.x - 1.2, y: start.y, z: o.pos.z };
    const from = toClient(game, { x: o.pos.x + o.wo[0], y: o.pos.y + o.wo[1], z: o.pos.z + o.wo[2] });
    const to = toClient(game, target);
    pointer(game, "pointerdown", { x: from.x, y: from.y });
    game.step(1);
    expect(o.dragged).toBe(true);
    for (let i = 1; i <= 12; i++) {
      pointer(game, "pointermove", { x: from.x + ((to.x - from.x) * i) / 12, y: from.y + ((to.y - from.y) * i) / 12 });
      game.step(1);
    }
    game.step(10);
    expect(Math.abs(o.pos.x - target.x)).toBeLessThan(Math.abs(start.x - target.x) * 0.5);
    pointer(game, "pointerup", { x: to.x, y: to.y });
    expect(o.dragged).toBe(false);
  });

  it("releases with the shape still and moves it", () => {
    const o = pickable();
    const here = o.pos.clone();
    drag(game, o, { x: -1, y: 1.5, z: o.pos.z }, 15);
    expect(o.pos.distanceTo(here)).toBeGreaterThan(0.5);
  });
});

describe("flick", () => {
  it("throws the shape at speed on release", () => {
    const o = pickable();
    flick(game, o, { x: o.pos.x - 1.6, y: o.pos.y + 1.4, z: o.pos.z });
    expect(o.vel.length()).toBeGreaterThan(3);
  });
});

describe("tap", () => {
  it("on empty space in Play mode blasts a ring", () => {
    const rings = game.debug.rings.length;
    tap(game, 195, 700);
    expect(game.debug.rings.length).toBeGreaterThan(rings);
  });

  it("on a shape in Play mode pokes it away from the touch point", () => {
    const o = pickable();
    tapShape(game, o);
    expect(o.moodT).toBeGreaterThan(0);
    expect(o.vel.length()).toBeGreaterThan(2);
  });

  it("records the pointer time for the finger tracking", () => {
    const before = game.debug.clockNow;
    expect(game.debug.pointerT).toBe(-99);
    tap(game, 195, 400);
    expect(game.debug.pointerT).toBe(before);
  });

  it("aims the eyes at the touch through look", () => {
    pointer(game, "pointermove", { x: 0, y: 0 });
    expect(game.debug.look.x).toBe(-1);
    expect(game.debug.look.y).toBe(1);
    expect(game.debug.look.last).toBe(game.debug.clockNow);
  });
});

describe("awakening overrides", () => {
  it("do not grab a shape while the notice state slips it away", () => {
    game.debug.startAwakening();
    game.debug.aw.state = "notice";
    const o = pickable();
    tapShape(game, o);
    expect(o.dragged).toBe(false);
  });
});
