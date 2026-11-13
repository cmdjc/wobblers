import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootNew } from "../../helpers/boot.js";
import { click } from "../../helpers/input.js";
import { N_FL, createFluidRender } from "../../../src/fluid/render.js";

let game;

beforeEach(async () => {
  game = await bootNew({ seed: 11 });
  game.step(10);
});

afterEach(() => game.dispose());

const surface = () => game.debug.scene.children.find((c) => c.material?.uniforms?.uField).material.uniforms;
const preset = (name) => [...game.harness.document.querySelectorAll("#fl-presets button")].find((b) => b.textContent === name).click();
const rtHeight = () => Math.round(1 / surface().uTexel.value.y);
const resizeTo = (width, height) => {
  const { window } = game.harness;
  window.innerWidth = width;
  window.innerHeight = height;
  window.dispatchEvent(new window.Event("resize"));
};

describe("createFluidRender", () => {
  it("is a factory over 1000 particles", () => {
    expect(typeof createFluidRender).toBe("function");
    expect(N_FL).toBe(1000);
  });

  it("adds a hidden full-screen quad to the scene and keeps it hidden while empty", () => {
    const quad = game.debug.scene.children.find((c) => c.material?.uniforms?.uField);
    expect(quad.geometry.parameters).toMatchObject({ width: 2, height: 2 });
    expect(quad.renderOrder).toBe(3);
    expect(quad.visible).toBe(false);
  });
});

describe("uniforms from FL", () => {
  it("Lava sets color, murk and glow", () => {
    preset("Lava");
    const u = surface();
    expect(u.uOpacity.value).toBe(0.95);
    expect(u.uGlow.value).toBe(0.9);
    expect(u.uDeep.value.getHex()).toBe(new THREE.Color().setHSL(18 / 360, 0.8, 0.27).getHex());
    expect(u.uLight.value.getHex()).toBe(new THREE.Color().setHSL(18 / 360, 0.85, 0.62).getHex());
  });

  it("Water restores them", () => {
    preset("Lava");
    preset("Water");
    const u = surface();
    expect(u.uOpacity.value).toBe(0.78);
    expect(u.uGlow.value).toBe(0);
    expect(u.uDeep.value.getHex()).toBe(new THREE.Color().setHSL(205 / 360, 0.8, 0.27).getHex());
  });
});

describe("fluidInit", () => {
  it("sizes the target from the window and keeps the aspect", () => {
    const aspect = 390 / 844;
    const h = rtHeight();
    expect(h).toBeGreaterThanOrEqual(160);
    expect(h).toBeLessThanOrEqual(640);
    expect(Math.round(1 / surface().uTexel.value.x)).toBe(Math.round(h * aspect));
  });

  it("follows a resize", () => {
    resizeTo(800, 600);
    const h = rtHeight();
    expect(Math.round(1 / surface().uTexel.value.x)).toBe(Math.round(h * (800 / 600)));
  });

  it("places the box uniform inside the screen", () => {
    const box = surface().uBox.value;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.z).toBeLessThanOrEqual(1);
    expect(box.x).toBeLessThan(box.z);
    expect(box.y).toBeLessThan(box.w);
  });

  it("shrinks the target when the GPU point size limit is small", () => {
    const full = rtHeight();
    const gl = game.harness.renderer.getContext();
    gl.getParameter = () => [1, 40];
    resizeTo(390, 844);
    expect(rtHeight()).toBeLessThan(full);
    expect(rtHeight()).toBeGreaterThanOrEqual(160);
  });
});

describe("renderFluidField", () => {
  const frameCalls = () => game.harness.renderer.calls.map((c) => c.name).filter((n) => n.startsWith("setRender") || n === "render");

  it("draws nothing into the target while the tank is empty", () => {
    game.harness.renderer.calls.length = 0;
    game.step(3);
    expect(game.harness.renderer.calls.filter((c) => c.name === "setRenderTarget")).toHaveLength(0);
  });

  it("renders the particle scene into the target, then restores the screen", () => {
    click(game, "#fl-fill");
    game.step(20);
    game.harness.renderer.calls.length = 0;
    game.step(1);
    expect(frameCalls()).toEqual(["setRenderTarget", "render", "setRenderTarget", "render"]);
    const targets = game.harness.renderer.calls.filter((c) => c.name === "setRenderTarget").map((c) => c.args[0]);
    expect(targets).toEqual(["target", null]);
  });
});
