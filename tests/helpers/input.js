import * as THREE from "three";

const VIEW = { width: 390, height: 844 };
const LONG_PRESS_MS = 480;

export function toClient(game, world) {
  const ndc = new THREE.Vector3(world.x, world.y, world.z ?? 0).project(game.debug.camera);
  return { x: ((ndc.x + 1) / 2) * VIEW.width, y: ((1 - ndc.y) / 2) * VIEW.height };
}

export function pointer(game, type, { id = 1, x, y }) {
  const { window, document } = game.harness;
  document.getElementById("c").dispatchEvent(new window.PointerEvent(type, {
    pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true,
  }));
}

export function tap(game, x, y, id = 1) {
  pointer(game, "pointerdown", { id, x, y });
  game.step(2);
  pointer(game, "pointerup", { id, x, y });
  game.step(1);
}

const ray = new THREE.Raycaster();
const sphere = new THREE.Sphere();
const hit = new THREE.Vector3();

function nearestOwner(game, origin) {
  const ndc = new THREE.Vector2(origin.x / VIEW.width * 2 - 1, -(origin.y / VIEW.height * 2 - 1));
  ray.setFromCamera(ndc, game.debug.camera);
  let owner = null, best = Infinity;
  for (const o of game.debug.objs) {
    if (o.dragged || o.dying) continue;
    for (let k = 0; k < o.cn; k++) {
      sphere.center.set(o.pos.x + o.wo[3 * k], o.pos.y + o.wo[3 * k + 1], o.pos.z + o.wo[3 * k + 2]);
      sphere.radius = o.cRad[k] * 1.2 + 0.06;
      if (!ray.ray.intersectSphere(sphere, hit)) continue;
      const d = hit.distanceTo(ray.ray.origin);
      if (d < best) { best = d; owner = o; }
    }
  }
  return owner;
}

function visiblePoint(game, o) {
  for (let k = 0; k < o.cn; k++) {
    const world = { x: o.pos.x + o.wo[3 * k], y: o.pos.y + o.wo[3 * k + 1], z: o.pos.z + o.wo[3 * k + 2] };
    if (nearestOwner(game, toClient(game, world)) === o) return world;
  }
  return null;
}

export const isPickable = (game, o) => visiblePoint(game, o) !== null;

function grabPoint(game, o) {
  return visiblePoint(game, o) ?? { x: o.pos.x + o.wo[0], y: o.pos.y + o.wo[1], z: o.pos.z + o.wo[2] };
}

export function tapShape(game, o) {
  const { x, y } = toClient(game, grabPoint(game, o));
  tap(game, x, y);
}

function glide(game, o, toWorld, frames) {
  const from = toClient(game, grabPoint(game, o));
  const to = toClient(game, toWorld);
  pointer(game, "pointerdown", { x: from.x, y: from.y });
  game.step(1);
  for (let i = 1; i <= frames; i++) {
    pointer(game, "pointermove", { x: from.x + ((to.x - from.x) * i) / frames, y: from.y + ((to.y - from.y) * i) / frames });
    game.step(1);
  }
  return to;
}

export function drag(game, o, toWorld, frames = 12) {
  const to = glide(game, o, toWorld, frames);
  game.step(3);
  pointer(game, "pointerup", { x: to.x, y: to.y });
  game.step(1);
}

export function flick(game, o, toWorld, frames = 3) {
  const to = glide(game, o, toWorld, frames);
  pointer(game, "pointerup", { x: to.x, y: to.y });
  game.step(1);
}

export function longPress(game, o) {
  const { x, y } = toClient(game, grabPoint(game, o));
  pointer(game, "pointerdown", { x, y });
  const start = game.harness.now();
  while (game.harness.now() - start <= LONG_PRESS_MS) game.step(1);
  pointer(game, "pointerup", { x, y });
  game.step(1);
}

export function click(game, selector) {
  game.harness.document.querySelector(selector).click();
}

export function sliderFor(game, label) {
  const rows = game.harness.document.querySelectorAll("#ed-body .sl, #fl-body .sl");
  const row = [...rows].find((el) => el.children[0].textContent === label);
  if (!row) throw new Error(`no slider labeled ${label}`);
  return row.children[1];
}

export function setSlider(game, el, value) {
  const { Event } = game.harness.window;
  el.value = String(value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
