import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootNew } from "../../helpers/boot.js";
import { click, isPickable, tapShape } from "../../helpers/input.js";
import { MAX_OBJS } from "../../../src/world/objects.js";
import { SHAPES } from "../../../src/shapes/shapes.js";
import { TOOL_HINT, createToolbar } from "../../../src/ui/toolbar.js";

let game;

beforeEach(async () => {
  game = await bootNew({ seed: 11 });
  game.step(60);
});

afterEach(() => game.dispose());

const label = (selector) => game.harness.document.querySelector(selector).textContent;
const pickable = () => game.debug.objs.find((o) => isPickable(game, o));

describe("createToolbar", () => {
  it("exports the five tool hints", () => {
    expect(Object.keys(TOOL_HINT)).toEqual(["play", "grow", "shrink", "wobble", "remove"]);
    expect(typeof createToolbar).toBe("function");
  });
});

describe("tool buttons", () => {
  it("select the tool, mark the button and show its hint", () => {
    click(game, '[data-tool="shrink"]');
    expect(game.debug.tool).toBe("shrink");
    const on = [...game.harness.document.querySelectorAll(".tools button.on")];
    expect(on.map((b) => b.dataset.tool)).toEqual(["shrink"]);
    const say = game.harness.document.getElementById("say");
    expect(say.textContent).toBe(TOOL_HINT.shrink);
    expect(say.classList.contains("on")).toBe(true);
  });

  it("grow raises sizeT by 30 percent on a quick tap", () => {
    click(game, '[data-tool="grow"]');
    const o = pickable();
    const before = o.sizeT;
    tapShape(game, o);
    expect(o.sizeT).toBeCloseTo(before * 1.3, 10);
  });

  it("shrink lowers sizeT by 30 percent on a quick tap", () => {
    click(game, '[data-tool="shrink"]');
    const o = pickable();
    const before = o.sizeT;
    tapShape(game, o);
    expect(o.sizeT).toBeCloseTo(before / 1.3, 10);
  });

  it("wobbly steps 1, 2, 3, 4, rigid, off", () => {
    click(game, '[data-tool="wobble"]');
    const o = pickable();
    const seen = [];
    for (let i = 0; i < 6; i++) {
      while (!isPickable(game, o)) game.step(1);
      tapShape(game, o);
      seen.push(o.wob);
    }
    expect(seen).toEqual([1, 2, 3, 4, -1, 0]);
  });

  it("remove pops the shape", () => {
    click(game, '[data-tool="remove"]');
    const o = pickable();
    const count = game.debug.objs.length;
    tapShape(game, o);
    expect(o.dying).toBe(true);
    game.step(15);
    expect(game.debug.objs).not.toContain(o);
    expect(game.debug.objs).toHaveLength(count - 1);
  });
});

describe("gravity button", () => {
  it("cycles through the five modes and their labels in order", () => {
    expect(label("#grav")).toBe("Gravity: down");
    const labels = [];
    for (let i = 0; i < 5; i++) {
      click(game, "#grav");
      labels.push([game.debug.gMode, label("#grav")]);
    }
    expect(labels).toEqual([
      [1, "Gravity: up"], [2, "Gravity: drift"], [3, "Gravity: center"], [4, "Gravity: spin"], [0, "Gravity: down"],
    ]);
  });

  it("announces the mode", () => {
    click(game, "#grav");
    expect(label("#say")).toBe("Gravity is up");
    click(game, "#grav");
    expect(label("#say")).toBe("Gravity is drifting");
  });
});

describe("add button", () => {
  it("adds the next shape in order, wrapping over all eight including the gear", () => {
    expect(game.debug.nextShape).toBe(5);
    const added = [];
    for (let i = 0; i < 10; i++) {
      click(game, "#add");
      added.push(game.debug.objs.at(-1).shape);
    }
    expect(added).toEqual([5, 6, 7, 0, 1, 2, 3, 4, 5, 6]);
    expect(SHAPES).toHaveLength(8);
  });

  it("drops the oldest free shape at the cap and keeps the count", () => {
    while (game.debug.objs.length < MAX_OBJS) click(game, "#add");
    const oldest = game.debug.objs[0];
    click(game, "#add");
    expect(game.debug.objs).toHaveLength(MAX_OBJS);
    expect(game.debug.objs).not.toContain(oldest);
  });
});

describe("sound button", () => {
  it("toggles the label and the flag", () => {
    click(game, "#snd");
    expect([game.debug.soundOn, label("#snd")]).toEqual([false, "Sound off"]);
    click(game, "#snd");
    expect([game.debug.soundOn, label("#snd")]).toEqual([true, "Sound on"]);
  });
});

describe("clear all button", () => {
  it("empties the room and says so", () => {
    click(game, "#clr");
    expect(label("#say")).toBe("All gone");
    game.step(60);
    expect(game.debug.objs).toHaveLength(0);
  });

  it("says there is nothing to clear on an empty room", () => {
    click(game, "#clr");
    game.step(60);
    click(game, "#clr");
    expect(label("#say")).toBe("Nothing to clear");
  });

  it("aborts the awakening story", () => {
    game.debug.startAwakening();
    expect(game.debug.aw.state).not.toBe("off");
    click(game, "#clr");
    expect(game.debug.aw.state).toBe("off");
  });
});
