import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootNew } from "../../helpers/boot.js";
import { click, isPickable, longPress, setSlider, sliderFor } from "../../helpers/input.js";
import { SHAPES } from "../../../src/shapes/shapes.js";
import { createEditor } from "../../../src/ui/editor.js";

let game;

beforeEach(async () => {
  game = await bootNew({ seed: 11 });
  game.step(60);
});

afterEach(() => game.dispose());

const doc = () => game.harness.document;
const pickable = () => game.debug.objs.find((o) => isPickable(game, o));
const edit = () => {
  const o = pickable();
  longPress(game, o);
  return o;
};
const extent = (o, axis) => {
  let top = -Infinity;
  for (let k = 0; k < o.cn; k++) top = Math.max(top, Math.abs(o.cOff[3 * k + axis]) + o.cRad[k]);
  return top;
};

describe("createEditor", () => {
  it("is a factory", () => {
    expect(typeof createEditor).toBe("function");
  });
});

describe("opening", () => {
  it("shows the panel, pins the shape and fills the sliders from it", () => {
    const o = edit();
    expect(game.debug.sel).toBe(o);
    expect(doc().getElementById("editor").hidden).toBe(false);
    expect(doc().body.classList.contains("editing")).toBe(true);
    expect(o.pinned).toBe(true);
    expect(Number(sliderFor(game, "Size").value)).toBeCloseTo(o.sizeT, 1);
    expect(Number(sliderFor(game, "Weight").value)).toBeCloseTo(o.density, 1);
    expect(sliderFor(game, "Legs").max).toBe("24");
    expect(doc().querySelector("#ed-body .sl output").textContent).toBe(o.sizeT.toFixed(2));
  });

  it("marks the current shape chip and the default behavior chip", () => {
    const o = edit();
    const chips = [...doc().querySelectorAll("#ed-shapes button")];
    expect(chips).toHaveLength(SHAPES.length);
    expect(chips.filter((b) => b.classList.contains("on")).map((b) => +b.dataset.i)).toEqual([o.shape]);
    const on = [...doc().querySelectorAll("#ed-body .chips button.on")].map((b) => b.dataset.k);
    expect(on).toEqual(Object.keys(o.beh).filter((k) => o.beh[k]).concat(Object.keys(o.abeh).filter((k) => o.abeh[k])));
  });

  it("closes on Done and unpins", () => {
    const o = edit();
    click(game, "#ed-done");
    expect(game.debug.sel).toBe(null);
    expect(o.pinned).toBe(false);
    expect(doc().getElementById("editor").hidden).toBe(true);
    expect(doc().body.classList.contains("editing")).toBe(false);
  });
});

describe("sliders", () => {
  it("legs 24 and length 3 keep body plus legs between floor and ceiling", () => {
    const o = edit();
    setSlider(game, sliderFor(game, "Size"), 5);
    const sizeBefore = o.sizeT;
    setSlider(game, sliderFor(game, "Legs"), 24);
    setSlider(game, sliderFor(game, "Leg length"), 3);
    expect(o.legs).toBe(24);
    expect(o.legLen).toBe(3);
    const bodyRadius = (o.rBody || o.r) / o.size;
    expect(o.size * (2 * bodyRadius + o.legLen)).toBeLessThanOrEqual(game.debug.yMax - game.debug.yMin);
    expect(o.sizeT).toBe(o.size);
    expect(Number(sliderFor(game, "Size").value)).toBeCloseTo(o.sizeT, 1);
    expect(o.sizeT).toBeLessThan(sizeBefore);
    expect(doc().getElementById("say").textContent).toBe("Shrunk to fit the room");
    game.step(120);
    expect(Number.isFinite(o.pos.y)).toBe(true);
    expect(o.pos.y).toBeGreaterThan(game.debug.yMin - 1);
    expect(o.pos.y).toBeLessThan(game.debug.yMax + 1);
  });

  it("raising legs from zero says so", () => {
    edit();
    setSlider(game, sliderFor(game, "Legs"), 4);
    expect(doc().getElementById("say").textContent).toBe("Legs on. Pick how it moves below");
  });

  it("small stretch Y flattens the collider", () => {
    const o = edit();
    const before = extent(o, 1);
    setSlider(game, sliderFor(game, "Stretch Y"), 0.4);
    expect(o.sy).toBeCloseTo(0.4, 5);
    expect(extent(o, 1)).toBeLessThan(before * 0.7);
    expect(extent(o, 1)).toBeLessThan(extent(o, 0));
  });

  it("a behavior chip toggles its flag", () => {
    const o = edit();
    const chip = doc().querySelector('#ed-body .chips button[data-k="chase"]');
    const was = !!o.beh.chase;
    chip.click();
    expect(o.beh.chase).toBe(!was);
    expect(chip.classList.contains("on")).toBe(!was);
  });
});

describe("shape chips", () => {
  it("switch the shape and the collider radius", () => {
    const o = edit();
    const next = (o.shape + 1) % SHAPES.length;
    doc().querySelector(`#ed-shapes button[data-i="${next}"]`).click();
    expect(o.shape).toBe(next);
    expect(o.baseR).toBe(SHAPES[next].r);
    expect(doc().querySelector("#ed-shapes button.on").dataset.i).toBe(String(next));
  });
});

describe("actions", () => {
  it("Duplicate adds a copy with the same settings", () => {
    const o = edit();
    setSlider(game, sliderFor(game, "Weight"), 3);
    setSlider(game, sliderFor(game, "Bounciness"), 0.5);
    setSlider(game, sliderFor(game, "Stretch X"), 1.5);
    const count = game.debug.objs.length;
    click(game, "#ed-dup");
    expect(game.debug.objs).toHaveLength(count + 1);
    const copy = game.debug.objs[game.debug.objs.length - 1];
    expect(copy).not.toBe(o);
    expect(copy.shape).toBe(o.shape);
    expect(copy.density).toBe(3);
    expect(copy.bounce).toBeCloseTo(0.5, 5);
    expect(copy.sx).toBeCloseTo(1.5, 5);
    expect(copy.sizeT).toBe(o.sizeT);
    expect(copy.beh).toEqual(o.beh);
    expect(copy.beh).not.toBe(o.beh);
    expect(copy.mat.uniforms.uHue.value).toBe(o.mat.uniforms.uHue.value);
    expect(doc().getElementById("say").textContent).toBe("Duplicated");
  });

  it("Reset restores the defaults", () => {
    const o = edit();
    setSlider(game, sliderFor(game, "Weight"), 3);
    setSlider(game, sliderFor(game, "Wobble"), 2);
    setSlider(game, sliderFor(game, "Legs"), 5);
    setSlider(game, sliderFor(game, "Stretch Z"), 2);
    click(game, "#ed-reset");
    expect([o.sx, o.sy, o.sz, o.wob, o.bounce, o.density, o.friction, o.gScale, o.level, o.legs]).toEqual([1, 1, 1, 0, 0.75, 1, 0.3, 1, 0, 0]);
    expect([o.legLen, o.clumsy, o.stamina, o.armLen, o.legSegs, o.armSegs, o.jflex]).toEqual([0.35, 0.3, 0.5, 0.5, 2, 2, 0.8]);
    expect(Number(sliderFor(game, "Weight").value)).toBe(1);
    expect(doc().getElementById("say").textContent).toBe("Reset");
  });

  it("Delete removes the shape and closes the editor", () => {
    const o = edit();
    click(game, "#ed-del");
    expect(game.debug.sel).toBe(null);
    expect(doc().getElementById("editor").hidden).toBe(true);
    expect(o.dying).toBe(true);
    game.step(90);
    expect(game.debug.objs).not.toContain(o);
  });
});

describe("pin target", () => {
  it("recomputes when the window resizes", () => {
    const o = edit();
    const before = o.pinTarget.y;
    const panel = doc().getElementById("editor");
    Object.defineProperty(panel, "offsetHeight", { value: 600, configurable: true });
    game.harness.window.dispatchEvent(new game.harness.window.Event("resize"));
    expect(o.pinTarget.y).not.toBe(before);
  });
});
