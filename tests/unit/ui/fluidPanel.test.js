import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootNew } from "../../helpers/boot.js";
import { click, longPress, isPickable, setSlider, sliderFor } from "../../helpers/input.js";
import { createFluidPanel } from "../../../src/ui/fluidPanel.js";

let game;

beforeEach(async () => {
  game = await bootNew({ seed: 11 });
  game.step(30);
});

afterEach(() => game.dispose());

const doc = () => game.harness.document;
const preset = (name) => [...doc().querySelectorAll("#fl-presets button")].find((b) => b.textContent === name);

describe("createFluidPanel", () => {
  it("is a factory", () => {
    expect(typeof createFluidPanel).toBe("function");
  });
});

describe("panel", () => {
  it("opens from the Fluid button and closes on Done", () => {
    expect(doc().getElementById("fluidpanel").hidden).toBe(true);
    click(game, "#fluid");
    expect(doc().getElementById("fluidpanel").hidden).toBe(false);
    expect(game.debug.fluidOpen).toBe(true);
    expect(doc().body.classList.contains("editing")).toBe(true);
    click(game, "#fl-done");
    expect(doc().getElementById("fluidpanel").hidden).toBe(true);
    expect(game.debug.fluidOpen).toBe(false);
    expect(doc().body.classList.contains("editing")).toBe(false);
  });

  it("opening it closes the shape editor", () => {
    const o = game.debug.objs.find((s) => isPickable(game, s));
    longPress(game, o);
    expect(game.debug.sel).toBe(o);
    click(game, "#fluid");
    expect(game.debug.sel).toBe(null);
    expect(doc().getElementById("editor").hidden).toBe(true);
  });

  it("starts with Water marked and the sliders showing the FL values", () => {
    expect([...doc().querySelectorAll("#fl-presets button.on")].map((b) => b.textContent)).toEqual(["Water"]);
    expect(Number(sliderFor(game, "Color").value)).toBe(205);
    expect(sliderFor(game, "Color").nextSibling.textContent).toBe("205");
    expect(sliderFor(game, "Thickness").nextSibling.textContent).toBe("0.05");
  });
});

describe("presets", () => {
  const TABLE = {
    Water: { hue: 205, visc: 0.05, dens: 1.0, opacity: 0.78, glow: 0 },
    Slime: { hue: 110, visc: 0.35, dens: 1.25, opacity: 0.9, glow: 0.1 },
    Lava: { hue: 18, visc: 0.92, dens: 6.0, opacity: 0.95, glow: 0.9 },
    Ink: { hue: 275, visc: 0.12, dens: 1.1, opacity: 0.95, glow: 0.15 },
  };
  for (const [name, values] of Object.entries(TABLE)) {
    it(`${name} sets the FL values and marks its chip`, () => {
      preset(name).click();
      const { FL } = game.debug;
      for (const [key, value] of Object.entries(values)) expect(FL[key]).toBe(value);
      expect([...doc().querySelectorAll("#fl-presets button.on")].map((b) => b.textContent)).toEqual([name]);
      expect(Number(sliderFor(game, "Color").value)).toBe(values.hue);
    });
  }

  it("Lava is very dense and thick", () => {
    preset("Lava").click();
    expect(game.debug.FL.dens).toBeGreaterThanOrEqual(6);
    expect(game.debug.FL.visc).toBeGreaterThan(0.9);
  });

  it("moving a look slider clears the preset mark, moving Amount keeps it", () => {
    setSlider(game, sliderFor(game, "Amount"), 0.4);
    expect(game.debug.FL.amount).toBeCloseTo(0.4, 5);
    expect(doc().querySelectorAll("#fl-presets button.on")).toHaveLength(1);
    setSlider(game, sliderFor(game, "Murk"), 0.5);
    expect(game.debug.FL.opacity).toBeCloseTo(0.5, 5);
    expect(doc().querySelectorAll("#fl-presets button.on")).toHaveLength(0);
  });
});

describe("Fill and Drain", () => {
  it("Fill sets the amount to 0.75, spawns particles over frames and hints once", () => {
    click(game, "#fl-fill");
    expect(game.debug.FL.amount).toBe(0.75);
    expect(game.debug.stirHinted).toBe(true);
    expect(doc().getElementById("say").textContent).toBe("Drag a finger through the liquid to stir it");
    expect(game.debug.fluid.n).toBe(0);
    game.step(10);
    expect(game.debug.fluid.n).toBeGreaterThan(0);
    game.step(120);
    expect(game.debug.fluid.n).toBe(750);
  });

  it("Drain empties the fluid", () => {
    click(game, "#fl-fill");
    game.step(150);
    click(game, "#fl-drain");
    expect(game.debug.FL.amount).toBe(0);
    game.step(150);
    expect(game.debug.fluid.n).toBe(0);
  });
});
