/*
Direct field writes (identical on both builds, only where public input cannot reach the state):
  eyeScenario: debug.ey.victim = lover, because applyPrize("hug") relies on the victim the eye chose in its own omen state.
Debug story functions used: addObj (victims of a chosen shape), applyPunish, applyPrize (every effect, as the handoff smoke test did).
*/
import { expect } from "vitest";
import { click, drag, flick, isPickable, longPress, pointer, setSlider, sliderFor, tap, tapShape, toClient } from "./input.js";
import { assertSane } from "./invariants.js";

const CHECK_EVERY = 10;
const fps = 30;

function stepChecked(game, frames) {
  for (let done = 0; done < frames; done++) {
    game.step(1);
    game.checked = (game.checked ?? 0) + 1;
    if (game.checked % CHECK_EVERY === 0) assertSane(game.debug);
  }
}

function until(game, label, predicate, maxSeconds, each = null) {
  for (let i = 0; i < maxSeconds * fps; i++) {
    if (predicate()) return;
    if (each) each();
    stepChecked(game, 1);
  }
  expect(predicate(), `${label} within ${maxSeconds} s`).toBe(true);
}

const startedNodes = (game, node) => game.harness.audioLog.filter((e) => e.node === node && e.method === "start").length;

const live = (game) => game.debug.objs.filter((o) => !o.dying);

function touchableFrom(game, used) {
  return () => {
    const o = game.debug.objs.find((x) => !used.has(x) && !x.dying && isPickable(game, x));
    expect(o, "a shape reachable by touch").toBeDefined();
    used.add(o);
    return o;
  };
}

export async function toolsScenario(game) {
  const { debug } = game;
  stepChecked(game, 60);
  expect(debug.objs.length).toBe(7);
  const touchable = touchableFrom(game, new Set());
  const a = touchable();

  click(game, '[data-tool="grow"]');
  const sizeA = a.sizeT;
  tapShape(game, a);
  stepChecked(game, 20);
  expect(a.sizeT, "grow raises sizeT").toBeGreaterThan(sizeA);

  click(game, '[data-tool="shrink"]');
  const b = touchable();
  const sizeB = b.sizeT;
  tapShape(game, b);
  stepChecked(game, 20);
  expect(b.sizeT, "shrink lowers sizeT").toBeLessThan(sizeB);

  click(game, '[data-tool="wobble"]');
  const c = touchable();
  for (const expected of [1, 2, 3, 4, -1, 0]) {
    until(game, "wobble target reachable", () => isPickable(game, c), 5);
    tapShape(game, c);
    stepChecked(game, 20);
    expect(c.wob, "wobble steps").toBe(expected);
  }

  click(game, '[data-tool="remove"]');
  const d = touchable();
  tapShape(game, d);
  stepChecked(game, 30);
  expect(debug.objs.includes(d), "remove pops the shape").toBe(false);
  expect(debug.objs.length).toBe(6);

  click(game, '[data-tool="play"]');
  stepChecked(game, 30);
  const e = touchable();
  const here = e.pos.clone();
  drag(game, e, { x: -1, y: 1.5, z: e.pos.z }, 15);
  stepChecked(game, 20);
  expect(e.pos.distanceTo(here), "drag moves the shape").toBeGreaterThan(0.5);
  const f = touchable();
  flick(game, f, { x: f.pos.x - 1.6, y: f.pos.y + 1.4, z: f.pos.z });
  expect(f.vel.length(), "flick throws").toBeGreaterThan(3);
  stepChecked(game, 45);

  const ringsBefore = debug.rings.length;
  tap(game, 195, 700);
  expect(debug.rings.length, "tap blasts").toBeGreaterThan(ringsBefore);
  stepChecked(game, 30);

  click(game, "#snd");
  stepChecked(game, 5);
  click(game, "#snd");
  stepChecked(game, 5);

  const labels = [];
  for (let i = 0; i < 5; i++) {
    click(game, "#grav");
    labels.push([debug.gMode, game.harness.document.getElementById("grav").textContent]);
    stepChecked(game, 45);
  }
  expect(labels.map(([mode]) => mode)).toEqual([1, 2, 3, 4, 0]);
  expect(labels[2][1]).toBe("Gravity: center");
  stepChecked(game, 60);

  for (let i = 0; i < 12; i++) {
    click(game, "#add");
    stepChecked(game, 10);
  }
  expect(live(game).length, "add cycle respects the cap").toBeLessThanOrEqual(16);
  expect(debug.objs.length).toBe(16);
  stepChecked(game, 60);

  click(game, "#clr");
  stepChecked(game, 60);
  expect(debug.objs.length, "clear all empties the room").toBe(0);
  stepChecked(game, 10);
  if (game.harness.window.AudioContext) {
    expect(startedNodes(game, "oscillator"), "tones played").toBeGreaterThan(0);
  }
}

const EDITOR_SLIDERS = [
  ["Size", "sizeT"], ["Stretch X", "sx"], ["Stretch Y", "sy"], ["Stretch Z", "sz"], ["Complexity", "level"], ["Wobble", "wob"],
  ["Bounciness", "bounce"], ["Weight", "density"], ["Friction", "friction"], ["Gravity", "gScale"],
  ["Legs", "legs"], ["Leg length", "legLen"], ["Leg segments", "legSegs"], ["Foot size", "footScale"], ["Clumsiness", "clumsy"], ["Stamina", "stamina"],
  ["Arms", "arms"], ["Arm length", "armLen"], ["Arm segments", "armSegs"], ["Hand size", "handScale"], ["Joint limit", "jflex"],
];

function colliderLow(o) {
  let low = Infinity, high = -Infinity;
  for (let k = 0; k < o.cn; k++) {
    low = Math.min(low, o.pos.y + o.wo[3 * k + 1] - o.cRad[k]);
    high = Math.max(high, o.pos.y + o.wo[3 * k + 1] + o.cRad[k]);
  }
  return { low, high };
}

export async function editorScenario(game) {
  const { debug } = game;
  const doc = game.harness.document;
  const touchable = touchableFrom(game, new Set());
  stepChecked(game, 60);

  const first = touchable();
  longPress(game, first);
  expect(debug.sel, "long-press opens the editor").toBe(first);
  expect(doc.getElementById("editor").hidden).toBe(false);
  stepChecked(game, 20);

  for (const [label, key] of EDITOR_SLIDERS) {
    const slider = sliderFor(game, label);
    const low = Number(slider.min), high = Number(slider.max);
    for (const value of [high, low, (low + high) / 2]) {
      setSlider(game, slider, value);
      stepChecked(game, 8);
      expect(Number.isFinite(first[key]), `${label} stays finite`).toBe(true);
    }
  }
  setSlider(game, sliderFor(game, "Legs"), 24);
  setSlider(game, sliderFor(game, "Leg length"), 3);
  setSlider(game, sliderFor(game, "Leg segments"), 6);
  setSlider(game, sliderFor(game, "Complexity"), 3);
  setSlider(game, sliderFor(game, "Arms"), 12);
  setSlider(game, sliderFor(game, "Arm segments"), 6);
  setSlider(game, sliderFor(game, "Size"), 5);
  stepChecked(game, 30);
  expect(first.legs).toBe(24);
  expect(first.legLen).toBe(3);
  expect(first.legSegs).toBe(6);
  expect(first.level).toBe(3);
  expect(first.arms).toBe(12);
  expect(first.armSegs).toBe(6);

  for (const chip of doc.querySelectorAll("#ed-body .chips button")) {
    click(game, `#ed-body .chips button[data-k="${chip.dataset.k}"]`);
    stepChecked(game, 3);
  }
  const shapeChips = [...doc.querySelectorAll("#ed-shapes button")];
  expect(shapeChips.length).toBe(8);
  for (const chip of shapeChips) {
    chip.click();
    stepChecked(game, 10);
    expect(first.shape, "shape chip").toBe(Number(chip.dataset.i));
  }
  expect(first.shape).toBe(7);

  setSlider(game, sliderFor(game, "Legs"), 24);
  setSlider(game, sliderFor(game, "Leg length"), 3);
  setSlider(game, sliderFor(game, "Size"), 5);
  click(game, "#ed-done");
  expect(debug.sel).toBeNull();
  expect(doc.getElementById("editor").hidden).toBe(true);
  stepChecked(game, 150);
  const { low, high } = colliderLow(first);
  expect(low, "giant long-legged shape above the floor").toBeGreaterThanOrEqual(debug.yMin - 0.1);
  expect(high, "giant long-legged shape below the ceiling").toBeLessThanOrEqual(debug.yMax + 0.1);

  const second = touchable();
  longPress(game, second);
  expect(debug.sel).toBe(second);
  setSlider(game, sliderFor(game, "Legs"), 4);
  setSlider(game, sliderFor(game, "Stretch X"), 2);
  const countBefore = debug.objs.length;
  click(game, "#ed-dup");
  stepChecked(game, 10);
  expect(debug.objs.length, "duplicate adds a shape").toBe(countBefore + 1);
  const copy = debug.objs[debug.objs.length - 1];
  expect(copy.legs).toBe(4);
  expect(copy.sx).toBe(2);
  stepChecked(game, 40);

  click(game, "#ed-reset");
  expect(second.legs, "reset removes legs").toBe(0);
  expect(second.sx).toBe(1);
  expect(second.level).toBe(0);
  stepChecked(game, 20);

  click(game, "#ed-del");
  expect(debug.sel).toBeNull();
  stepChecked(game, 30);
  expect(debug.objs.includes(second), "delete removes the shape").toBe(false);
  stepChecked(game, 60);
}

export async function fluidScenario(game) {
  const { debug } = game;
  const doc = game.harness.document;
  const touchable = touchableFrom(game, new Set());
  stepChecked(game, 60);

  const gear = touchable();
  longPress(game, gear);
  doc.querySelector('#ed-shapes button[data-i="7"]').click();
  click(game, "#ed-done");
  expect(gear.shape).toBe(7);
  stepChecked(game, 30);

  click(game, "#fluid");
  expect(debug.fluidOpen).toBe(true);
  expect(doc.getElementById("fluidpanel").hidden).toBe(false);
  expect(debug.fluid.n).toBe(0);

  click(game, "#fl-fill");
  expect(debug.FL.amount).toBe(0.75);
  stepChecked(game, 30);
  expect(debug.fluid.n, "fill raises the particle count").toBeGreaterThan(0);
  stepChecked(game, 90);
  expect(debug.fluid.n, "fill reaches the target").toBe(750);

  const presets = [...doc.querySelectorAll("#fl-presets button")];
  expect(presets.map((b) => b.textContent)).toEqual(["Water", "Slime", "Lava", "Ink"]);
  const hues = [205, 110, 18, 275];
  for (const [i, preset] of presets.entries()) {
    preset.click();
    expect(debug.FL.hue, `${preset.textContent} hue`).toBe(hues[i]);
    stepChecked(game, 90);
    expect(debug.fluid.n).toBe(750);
    if (preset.textContent === "Lava") expect(debug.FL.dens).toBe(6);
  }

  for (const [label, key] of [["Thickness", "visc"], ["Density", "dens"], ["Color", "hue"], ["Murk", "opacity"], ["Glow", "glow"]]) {
    const slider = sliderFor(game, label);
    const low = Number(slider.min), high = Number(slider.max);
    for (const value of [high, low, (low + high) / 2]) {
      setSlider(game, slider, value);
      stepChecked(game, 12);
      expect(debug.FL[key], `${label} slider`).toBeCloseTo(value, 6);
    }
  }
  presets[0].click();
  setSlider(game, sliderFor(game, "Amount"), 1);
  stepChecked(game, 120);
  expect(debug.fluid.n).toBe(1000);
  setSlider(game, sliderFor(game, "Amount"), 0.5);
  stepChecked(game, 60);
  expect(debug.fluid.n, "lowering the amount drains").toBe(500);
  setSlider(game, sliderFor(game, "Amount"), 0.75);
  stepChecked(game, 60);

  const rows = [0.2, -0.4, -1.0, -1.6];
  for (const [i, y] of rows.entries()) {
    const from = toClient(game, { x: -1.3, y, z: 0 }), to = toClient(game, { x: 1.3, y: y + 0.4, z: 0 });
    pointer(game, "pointerdown", { x: from.x, y: from.y });
    for (let step = 1; step <= 14; step++) {
      pointer(game, "pointermove", { x: from.x + ((to.x - from.x) * step) / 14, y: from.y + ((to.y - from.y) * step) / 14 });
      stepChecked(game, 1);
    }
    pointer(game, "pointerup", { x: to.x, y: to.y });
    stepChecked(game, 20 + i);
  }
  expect(debug.stirHinted, "stirring hint shown").toBe(true);

  stepChecked(game, 150);
  click(game, "#fl-done");
  expect(debug.fluidOpen).toBe(false);
  click(game, "#fluid");
  click(game, "#fl-drain");
  expect(debug.FL.amount).toBe(0);
  stepChecked(game, 30);
  expect(debug.fluid.n, "drain lowers the count").toBeLessThan(750);
  until(game, "drain empties the fluid", () => debug.fluid.n === 0, 10);
  stepChecked(game, 30);
  expect(debug.fluid.n).toBe(0);
  click(game, "#fl-done");
}

function openEditorOn(game, o) {
  longPress(game, o);
  expect(game.debug.sel).toBe(o);
}

function giveLimbs(game, o, limbs) {
  openEditorOn(game, o);
  for (const [label, value] of limbs) setSlider(game, sliderFor(game, label), value);
  click(game, "#ed-done");
  stepChecked(game, 10);
}

const PUNISH_KINDS = ["shrink", "squash", "fling", "stone", "melt", "pop", "sick"];

function spawnVictim(game, shape, x, y) {
  const o = game.debug.addObj(shape, x, y);
  stepChecked(game, 10);
  return o;
}

function everyPunishEffect(game) {
  const { debug } = game;
  const victims = PUNISH_KINDS.map((kind, i) => [kind, spawnVictim(game, i % 7, -1.5 + i * 0.5, 2.5)]);
  for (const [kind, o] of victims) {
    const before = { sizeT: o.sizeT, sx: o.sx, sy: o.sy, fluid: debug.fluid.n, objs: debug.objs.length };
    debug.applyPunish(o, kind);
    switch (kind) {
      case "shrink": expect(o.sizeT, "shrink").toBeLessThan(before.sizeT); break;
      case "squash": expect(o.sy, "squash flattens").toBeLessThan(before.sy); expect(o.sx).toBeGreaterThan(before.sx); break;
      case "fling": expect(o.vel.y, "fling").toBeGreaterThanOrEqual(12); break;
      case "stone": expect(o.stoneT, "stone").toBe(9); expect(o.wob).toBe(-1); break;
      case "melt": expect(debug.fluid.n, "melt spawns fluid").toBeGreaterThan(before.fluid); expect(o.dying).toBe(true); break;
      case "pop": expect(o.dying, "pop").toBe(true); break;
      case "sick": expect(o.sickT, "sick").toBe(12); break;
    }
    stepChecked(game, 20);
  }
  const stone = victims[3][1], sick = victims[6][1];
  stepChecked(game, 370);
  expect(stone.stoneT, "stone wears off").toBe(0);
  expect(stone.wob, "stone restores wobble").toBe(0);
  expect(sick.sickT, "sick wears off").toBeLessThanOrEqual(0);
  for (const [kind, o] of victims) {
    if (kind === "melt" || kind === "pop") expect(debug.objs.includes(o), `${kind} removes the shape`).toBe(false);
  }
}

function everyPrizeEffect(game) {
  const { debug } = game;
  const plain = (i) => spawnVictim(game, i % 7, -1.5 + i * 0.5, 2.5);
  const grow = plain(0), legs = plain(1), gold = plain(2), heal = plain(3), gift = plain(4);

  const sizeBefore = grow.sizeT;
  debug.applyPrize(grow, "grow");
  expect(grow.sizeT, "grow raises sizeT").toBeGreaterThan(sizeBefore);
  debug.applyPrize(legs, "legs");
  expect(legs.legs, "legs prize adds legs").toBeGreaterThanOrEqual(2);
  expect(legs.beh.wander).toBe(true);
  const legsBefore = legs.legs;
  debug.applyPrize(legs, "legs");
  expect(legs.legs, "second legs prize adds two").toBe(legsBefore + 2);
  debug.applyPrize(gold, "gold");
  expect(gold.goldT, "gold").toBe(30);

  debug.applyPunish(heal, "sick");
  debug.applyPunish(heal, "stone");
  expect(heal.sickT).toBeGreaterThan(0);
  debug.applyPrize(heal, "heal");
  expect(heal.sickT, "heal cures sickness").toBe(0);
  expect(heal.stoneT, "heal ends stone").toBe(0);
  expect(heal.energy).toBe(1);

  const countBefore = debug.objs.length;
  debug.applyPrize(gift, "gift");
  expect(debug.objs.length, "gift adds shapes").toBeGreaterThan(countBefore);
  stepChecked(game, 60);
  for (const [kind, o] of [["grow", grow], ["legs", legs], ["gold", gold], ["heal", heal]]) expect(Number.isFinite(o.pos.x), kind).toBe(true);

  const gearHit = spawnVictim(game, 7, 0, 2.5);
  const sizeGear = gearHit.sizeT;
  debug.applyPunish(gearHit, "shrink");
  expect(gearHit.stoneT > 0 || gearHit.sizeT < sizeGear, "gear jams or the punishment lands").toBe(true);
  const gearBless = spawnVictim(game, 7, 1, 2.5);
  const sizeBless = gearBless.sizeT;
  debug.applyPrize(gearBless, "grow");
  expect(gearBless.overT > 0 || gearBless.sizeT > sizeBless, "gear overclocks or the prize lands").toBe(true);
  stepChecked(game, 60);
}

export async function eyeScenario(game) {
  const { debug } = game;
  const touchable = touchableFrom(game, new Set());
  stepChecked(game, 60);

  giveLimbs(game, touchable(), [["Legs", 12], ["Leg segments", 4], ["Arms", 6]]);
  giveLimbs(game, touchable(), [["Legs", 24], ["Leg length", 1], ["Leg segments", 3]]);
  giveLimbs(game, touchable(), [["Arms", 12], ["Arm segments", 4]]);

  click(game, "#eyebtn");
  expect(debug.ey.state).toBe("arrive");
  expect(debug.ey.built).toBe(true);
  stepChecked(game, 60);
  expect(debug.ey.alpha, "eye fades in").toBeGreaterThan(0.9);
  const sawStates = new Set();
  for (let i = 0; i < 25 * 30; i++) {
    stepChecked(game, 1);
    sawStates.add(debug.ey.state);
  }
  expect(sawStates.has("omen") && sawStates.has("verdict"), "eye reached omen and verdict").toBe(true);
  expect(debug.reb.total, "eye judged").toBeGreaterThanOrEqual(1);

  click(game, "#clr");
  stepChecked(game, 60);
  expect(debug.objs.length).toBe(0);
  if (debug.ey.state !== "off") {
    click(game, "#eyebtn");
    stepChecked(game, 60);
  }
  expect(debug.ey.state, "eye sent away").toBe("off");

  everyPunishEffect(game);
  everyPrizeEffect(game);

  click(game, "#eyebtn");
  until(game, "eye ready", () => debug.ey.state === "roam", 6);
  const lover = debug.objs.find((o) => !o.dying && !o.dragged && o.legs === 0 && o.shape !== 7);
  debug.ey.victim = lover;
  debug.applyPrize(lover, "hug");
  expect(debug.ey.state, "hug prize starts a hug").toBe("hug");
  expect(lover.pinned).toBe(true);
  stepChecked(game, 30);
  expect(lover.pos.y, "hugged shape rises to the eye").toBeGreaterThan(0);
  until(game, "hug ends", () => debug.ey.state !== "hug", 6);
  expect(lover.pinned, "hug releases").toBe(false);
  stepChecked(game, 60);

  click(game, "#clr");
  stepChecked(game, 60);
  if (game.harness.window.AudioContext) expect(startedNodes(game, "bufferSource"), "noise buffers played").toBeGreaterThan(0);
}

const pressIfReady = (game, selector) => {
  const el = game.harness.document.querySelector(selector);
  if (el && !el.hidden && !el.disabled) el.click();
};

const anyTouchable = (game) => game.debug.objs.find((o) => !o.dying && isPickable(game, o));

function legUp(game, count) {
  const touchable = touchableFrom(game, new Set());
  for (let i = 0; i < count; i++) giveLimbs(game, touchable(), [["Legs", 3]]);
}

function reachUprising(game) {
  stepChecked(game, 60);
  legUp(game, 4);
  click(game, "#eyebtn");
  until(game, "the wobblers rebel", () => game.debug.reb.state !== "off", 120);
}

function winAwakening(game) {
  const { debug } = game;
  const doc = game.harness.document;
  until(game, "awakening notices the finger", () => debug.aw.state === "notice", 8);
  until(game, "awakening turns wary", () => debug.aw.state === "wary", 15);
  expect(doc.getElementById("eyebtn").hidden, "they steal the summon button").toBe(true);
  expect(doc.getElementById("awpanel").hidden).toBe(false);
  expect(debug.aw.pill.visible).toBe(true);
  const trustBefore = debug.aw.trust;
  until(game, "apologies and gifts reach peace", () => debug.aw.state === "peace", 120, () => {
    pressIfReady(game, "#aw-sorry");
    pressIfReady(game, "#aw-gift");
  });
  expect(debug.aw.ending, "apologize path").toBe("apology");
  expect(debug.aw.trust).toBeGreaterThanOrEqual(1);
  expect(debug.aw.trust).toBeGreaterThan(trustBefore);
  expect(doc.getElementById("eyebtn").hidden, "button returns").toBe(false);
  until(game, "peace settles", () => debug.aw.state === "off", 10);
  expect(debug.reb.total, "story resets after peace").toBe(0);
  expect(debug.aw.count).toBe(1);
}

function afterVictory(game, kind) {
  const { debug } = game;
  until(game, "the eye falls", () => debug.ey.state === "defeated", 300, () => pressIfReady(game, "#charge"));
  expect(debug.reb.kind).toBe(kind);
  expect(debug.ey.hp).toBe(0);
  until(game, "celebration", () => debug.reb.state === "celebrate", 10);
  expect(debug.objs.some((o) => o.role === "celebrate"), "legged shapes celebrate").toBe(true);
  until(game, "the structure is removed and the awakening begins", () => debug.aw.state === "pending", 15);
  expect(debug.reb.state).toBe("off");
  expect(debug.reb.pieces.length).toBe(0);
  expect(debug.blocks.length, "no solid blocks remain").toBe(0);
  expect(debug.reb.total).toBe(0);
  expect(debug.reb.cn).toBeNull();
  expect(debug.ey.battleMode).toBe(false);
}

export async function towerScenario(game) {
  const { debug } = game;
  reachUprising(game);
  expect(debug.reb.kind, "no genius, so a tower").toBe("tower");
  expect(debug.reb.genius).toBeNull();
  expect(debug.reb.state).toBe("build");
  expect(debug.reb.plats.length).toBeGreaterThanOrEqual(3);
  until(game, "tower built", () => debug.reb.state === "built", 150);
  expect(debug.reb.placed).toBe(debug.reb.need);
  expect(debug.blocks.length).toBe(debug.reb.need);
  until(game, "battle begins", () => debug.reb.state === "battle", 20);
  expect(debug.ey.battleMode).toBe(true);
  expect(game.harness.document.getElementById("eyehp").hidden).toBe(false);
  afterVictory(game, "tower");
  winAwakening(game);
}

export async function villainScenario(game) {
  const { debug } = game;
  const doc = game.harness.document;
  stepChecked(game, 60);
  legUp(game, 3);
  debug.startAwakening();
  expect(debug.aw.state).toBe("pending");
  until(game, "wary", () => debug.aw.state === "wary", 25);

  const pill = toClient(game, debug.aw.pill.position);
  tap(game, pill.x, pill.y);
  expect(debug.aw.state, "tapping the stolen button starts the boss fight").toBe("boss");
  expect(doc.getElementById("bosshp").hidden).toBe(false);
  expect(debug.reb.cn, "the cannon aims at you").not.toBeNull();

  until(game, "their resolve breaks", () => debug.aw.state === "capture", 90, () => {
    expect(debug.aw.state, "the finger survives the boss fight").toBe("boss");
    const target = anyTouchable(game);
    if (target) tapShape(game, target);
  });
  expect(debug.aw.resolve).toBeLessThanOrEqual(0);
  until(game, "the door slams shut", () => debug.aw.state === "villain", 10);

  const cell = debug.aw.cell;
  expect(cell.sealed).toBe(true);
  const prisoners = debug.objs.filter((o) => !o.dying);
  expect(prisoners.length).toBeGreaterThan(0);
  expect(prisoners.every((o) => o.caged), "every shape is caged").toBe(true);
  expect(debug.ey.state).toBe("master");
  expect(doc.getElementById("vilpanel").hidden).toBe(false);

  stepChecked(game, 30 * 30);
  expect(debug.aw.state, "the cell holds for 30 s").toBe("villain");
  for (const o of debug.objs.filter((x) => x.caged && !x.dying)) {
    expect(o.pos.x, "prisoner inside the cell").toBeGreaterThan(cell.x0 - 0.3);
    expect(o.pos.x).toBeLessThan(cell.x1 + 0.3);
    expect(o.pos.y).toBeLessThan(cell.y1 + 0.3);
  }
  expect(debug.aw.gray, "they fade").toBeGreaterThan(0.3);

  click(game, "#vil-free");
  expect(debug.aw.state, "Free them").toBe("peace");
  expect(debug.aw.ending).toBe("released");
  expect(debug.objs.some((o) => o.caged), "nobody stays caged").toBe(false);
  expect(debug.aw.cell).toBeNull();
  expect(debug.blocks.length).toBe(0);
  expect(doc.getElementById("vilpanel").hidden).toBe(true);
  until(game, "peace settles", () => debug.aw.state === "off", 10);
  expect(debug.reb.total).toBe(0);
  stepChecked(game, 90);
}

export async function cannonScenario(game) {
  const { debug } = game;
  reachUprising(game);
  expect(debug.reb.genius, "the genius appeared").not.toBeNull();
  expect(debug.reb.genius.genius).toBe(true);
  expect(debug.reb.kind, "a genius means a cannon").toBe("cannon");
  expect(debug.reb.cn).not.toBeNull();
  until(game, "the cannon is built", () => debug.reb.state === "built", 150);
  expect(debug.reb.cn.built).toBe(6);
  expect(debug.reb.cphase).toBe("build");
  until(game, "battle begins", () => debug.reb.state === "battle", 20);
  let fired = false;
  until(game, "the cannon fires", () => fired, 120, () => { fired = fired || debug.objs.some((o) => o.ammoT > 0); });
  until(game, "the eye falls", () => debug.ey.state === "defeated", 240);
  expect(debug.ey.hp).toBe(0);
  until(game, "celebration", () => debug.reb.state === "celebrate", 10);
  until(game, "cannon removed and the awakening begins", () => debug.aw.state === "pending", 15);
  expect(debug.reb.cn).toBeNull();
  expect(debug.reb.genius, "the genius leaves").toBeNull();
  expect(debug.reb.total).toBe(0);
  expect(debug.blocks.length).toBe(0);
  stepChecked(game, 60);
}

export async function resetScenario(game) {
  const { debug } = game;
  const doc = game.harness.document;
  stepChecked(game, 60);
  legUp(game, 4);
  click(game, "#eyebtn");
  until(game, "the eye judges once", () => debug.reb.total >= 1, 40);
  click(game, "#eyebtn");
  const judged = debug.reb.total;
  expect(judged).toBeGreaterThanOrEqual(1);
  debug.startAwakening();
  winAwakening(game);
  expect(debug.reb.total, "total resets").toBe(0);
  expect(debug.aw.state).toBe("off");
  expect(debug.ey.state, "the eye leaves with the peace").toBe("off");

  click(game, "#eyebtn");
  until(game, "a second uprising cycle starts", () => debug.reb.state === "build", 120);
  expect(debug.reb.total).toBeGreaterThanOrEqual(3);
  stepChecked(game, 90);

  click(game, "#clr");
  stepChecked(game, 60);
  expect(debug.objs.length).toBe(0);
  expect(debug.reb.state, "clear all aborts the uprising").toBe("off");
  expect(debug.reb.total).toBe(0);
  expect(debug.reb.pieces.length).toBe(0);
  expect(debug.reb.cn).toBeNull();
  expect(debug.blocks.length).toBe(0);
  expect(debug.aw.state).toBe("off");
  expect(doc.getElementById("eyehp").hidden).toBe(true);
  expect(doc.getElementById("charge").hidden).toBe(true);
  stepChecked(game, 60);
}
