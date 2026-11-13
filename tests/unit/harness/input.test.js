import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import { bootLegacy, bootNew } from "../../helpers/boot.js";
import { click, drag, flick, longPress, pointer, setSlider, sliderFor, tap, tapShape, toClient } from "../../helpers/input.js";

const builds = [["legacy", bootLegacy], ["new", bootNew]];

describe.each(builds)("input helpers on %s", (build, boot) => {
  let game;
  const start = async () => {
    game = await boot({ seed: 1 });
    game.build = build;
    game.step(5);
    return game;
  };
  afterEach(() => game?.dispose());

  it("toClient maps world points to client pixels and back", async () => {
    await start();
    const ray = new THREE.Raycaster();
    for (const world of [{ x: 0, y: 0, z: 0 }, { x: 1.2, y: -1.5, z: 0 }, { x: -0.7, y: 2.4, z: 0 }]) {
      const { x, y } = toClient(game, world);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(390);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(844);
      ray.setFromCamera(new THREE.Vector2((x / 390) * 2 - 1, -((y / 844) * 2 - 1)), game.debug.camera);
      const back = new THREE.Vector3();
      ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), back);
      expect(back.x).toBeCloseTo(world.x, 6);
      expect(back.y).toBeCloseTo(world.y, 6);
    }
    expect(toClient(game, { x: 0, y: 0, z: 0 })).toEqual({ x: 195, y: 422 });
  });

  it("pointer dispatches pointer events on the canvas with id and position", async () => {
    await start();
    const seen = [];
    const canvas = game.harness.document.getElementById("c");
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
      canvas.addEventListener(type, (e) => seen.push([e.type, e.pointerId, e.clientX, e.clientY, e.cancelable, e.isPrimary]));
    }
    pointer(game, "pointerdown", { id: 7, x: 10, y: 20 });
    pointer(game, "pointermove", { x: 11, y: 21 });
    pointer(game, "pointerup", { x: 11, y: 21 });
    pointer(game, "pointercancel", { id: 9, x: 1, y: 2 });
    expect(seen).toEqual([
      ["pointerdown", 7, 10, 20, true, true],
      ["pointermove", 1, 11, 21, true, true],
      ["pointerup", 1, 11, 21, true, true],
      ["pointercancel", 9, 1, 2, true, true],
    ]);
  });

  it("click reaches the button handlers", async () => {
    await start();
    click(game, "#grav");
    expect(game.debug.gMode).toBe(1);
    click(game, '[data-tool="remove"]');
    expect(game.debug.tool).toBe("remove");
  });

  it("tapShape with the remove tool pops the shape", async () => {
    await start();
    click(game, '[data-tool="remove"]');
    const target = game.debug.objs[0];
    tapShape(game, target);
    expect(target.dying).toBe(true);
  });

  it("tapShape reaches the intended shape even when shapes overlap on screen", async () => {
    await start();
    click(game, '[data-tool="remove"]');
    const doomed = [game.debug.objs[0], game.debug.objs[5], game.debug.objs[1]];
    for (const target of doomed) {
      tapShape(game, target);
      expect(target.dying).toBe(true);
    }
    expect(game.debug.objs.filter((o) => o.dying)).toHaveLength(3);
  });

  it("tap on empty space with the play tool blasts and consumes the click", async () => {
    await start();
    const before = game.debug.rings.length;
    tap(game, 195, 780);
    expect(game.debug.rings.length).toBeGreaterThan(before);
  });

  it("drag carries a shape to the target and holds until release", async () => {
    await start();
    const target = game.debug.objs[0];
    drag(game, target, { x: 1.0, y: 1.0, z: target.pos.z }, 20);
    expect(Math.abs(target.pos.x - 1.0)).toBeLessThan(0.8);
    expect(target.dragged).toBe(false);
  });

  it("flick throws a shape with speed", async () => {
    await start();
    const target = game.debug.objs[1];
    flick(game, target, { x: target.pos.x + 1.4, y: target.pos.y + 1.2, z: target.pos.z });
    expect(target.dragged).toBe(false);
    expect(target.vel.length()).toBeGreaterThan(3);
  });

  it("longPress opens the editor on the shape", async () => {
    await start();
    const target = game.debug.objs[2];
    longPress(game, target);
    expect(game.debug.sel).toBe(target);
    expect(game.harness.document.getElementById("editor").hidden).toBe(false);
  });

  it("setSlider drives an editor slider and a fluid slider", async () => {
    await start();
    const target = game.debug.objs[2];
    longPress(game, target);
    setSlider(game, sliderFor(game, "Legs"), 4);
    expect(target.legs).toBe(4);
    click(game, "#fluid");
    setSlider(game, sliderFor(game, "Thickness"), 0.5);
    expect(game.debug.FL.visc).toBe(0.5);
  });
});
