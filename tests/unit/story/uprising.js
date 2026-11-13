import { expect } from "vitest";
import { click, isPickable, longPress, setSlider, sliderFor } from "../../helpers/input.js";
import { assertSane } from "../../helpers/invariants.js";

const FPS = 30;

export function until(game, label, predicate, maxSeconds, each = null) {
  for (let i = 0; i < maxSeconds * FPS; i++) {
    if (predicate()) return;
    if (each) each();
    game.step(1);
    if (i % 10 === 0) assertSane(game.debug);
  }
  expect(predicate(), `${label} within ${maxSeconds} s`).toBe(true);
}

function giveLegs(game, o) {
  longPress(game, o);
  expect(game.debug.sel).toBe(o);
  setSlider(game, sliderFor(game, "Legs"), 3);
  click(game, "#ed-done");
  game.step(10);
}

export function prepareUprising(game) {
  game.step(60);
  const used = new Set();
  for (let i = 0; i < 4; i++) {
    const o = game.debug.objs.find((x) => !used.has(x) && !x.dying && isPickable(game, x));
    expect(o, "a shape reachable by touch").toBeDefined();
    used.add(o);
    giveLegs(game, o);
  }
  click(game, "#eyebtn");
}

export function reachUprising(game) {
  prepareUprising(game);
  until(game, "the wobblers rebel", () => game.debug.reb.state !== "off", 120);
}

export const pressIfReady = (game, selector) => {
  const el = game.harness.document.querySelector(selector);
  if (el && !el.hidden && !el.disabled) el.click();
};
