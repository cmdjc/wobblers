import * as THREE from "three";
import { createContext } from "./context.js";
import { createAudio } from "./audio/audio.js";
import { createTextures } from "./gfx/textures.js";
import { CAM_Z, createBackground } from "./gfx/background.js";
import { createFx } from "./gfx/fx.js";
import { createHud } from "./ui/hud.js";
import { createToolbar } from "./ui/toolbar.js";
import { createEditor } from "./ui/editor.js";
import { createFluidPanel } from "./ui/fluidPanel.js";
import { createPointer } from "./input/pointer.js";
import { createLegs } from "./limbs/legs.js";
import { createArms } from "./limbs/arms.js";
import { createFluidRender } from "./fluid/render.js";
import { createFluidCoupling } from "./fluid/coupling.js";
import { createShapes } from "./shapes/shapes.js";
import { createColliders } from "./shapes/colliders.js";
import { createEye } from "./eye/eye.js";
import { createVerdicts } from "./eye/verdicts.js";
import { createEyes } from "./world/eyes.js";
import { createObjects } from "./world/objects.js";
import { createPhysics } from "./world/physics.js";
import { createBlocks } from "./world/blocks.js";
import { createTower } from "./story/tower.js";
import { createGenius } from "./story/genius.js";
import { createCannon } from "./story/cannon.js";
import { createAwakening } from "./story/awakening.js";
import { createVillain } from "./story/villain.js";
import { createVisuals } from "./world/visuals.js";

export function createGame({ renderer, env }) {
  const { window, document, performance, requestAnimationFrame } = env;
  const ctx = createContext();
  ctx.env = env;
  ctx.renderer = renderer;
  createAudio(ctx);
  createTextures(ctx);
  const canvas = document.getElementById('c');
  ctx.canvas = canvas;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  ctx.scene = scene;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  ctx.camera = camera;
  camera.position.set(0, 0, CAM_Z);
  const timeU = { value: 0 };
  ctx.timeU = timeU;
  ctx.tmpG = new THREE.Vector3(); ctx.tmpV = new THREE.Vector3(); ctx.tmpV2 = new THREE.Vector3(); ctx.qInv = new THREE.Quaternion();

  const { updateMotes } = createBackground(ctx);

  createShapes(ctx);
  createColliders(ctx);
  createEyes(ctx);
  const { objs, addObj, removeObj } = createObjects(ctx);
  const { step } = createPhysics(ctx);
  const { look } = createPointer(ctx);
  const { say } = createHud(ctx);
  createToolbar(ctx);
  createEditor(ctx);
  const { fluid, FL, renderFluidField } = createFluidRender(ctx);
  const { fluidFrame } = createFluidCoupling(ctx);
  createFluidPanel(ctx);
  ctx.pointerW = new THREE.Vector3();
  const { legBrain } = createLegs(ctx);
  const { rings, updateRings } = createFx(ctx);
  const { ey, summonEye, eyeFrame } = createEye(ctx);
  const { applyPunish, applyPrize } = createVerdicts(ctx);
  const { blocks } = createBlocks(ctx);
  const { reb, rebelFrame, abortRebellion, defeatEye } = createTower(ctx);
  const { spawnGenius } = createGenius(ctx);
  createCannon(ctx);
  const { startAwakening, startBoss, peaceEnding, abortAwakening, awakeFrame } = createAwakening(ctx);
  createVillain(ctx);
  const { aw } = ctx;
  createArms(ctx);
  const { updateVisuals, updateSelectionRing } = createVisuals(ctx);

  const start = [0, 1, 0, 2, 3, 1, 4];
  start.forEach((s, i) => {
    addObj(s, (Math.random() - 0.5) * ctx.hx * 1.3, ctx.yMax - 0.9 - i * 0.65);
    ctx.nextShape = (ctx.nextShape + 1);
  });
  ctx.nextShape = 5;
  say('Press to squish, flick to throw, long-press to edit. Tap empty space to blast.', 7000);

  ctx.last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - ctx.last) / 1000, 0.05);
    ctx.last = now; ctx.time += dt; ctx.clockNow = ctx.time;
    timeU.value = ctx.time;
    for (const o of objs) if (o.legs > 0) legBrain(o, dt, ctx.time);
    step(dt / 2, ctx.time); step(dt / 2, ctx.time);
    fluidFrame(dt, ctx.time);
    rebelFrame(dt);
    awakeFrame(dt, ctx.time);
    eyeFrame(dt, ctx.time);
    updateVisuals(dt, ctx.time);
    updateRings(dt);
    updateMotes(dt);
    renderFluidField();
    updateSelectionRing(ctx.time);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  const debug = {
    objs, ey, reb, aw, FL, fluid, blocks, scene, camera, rings, look,
    addObj, removeObj, summonEye, spawnGenius, startAwakening, startBoss, peaceEnding, abortRebellion, abortAwakening, defeatEye,
    applyPunish, applyPrize,
    get W() { return ctx.W; },
    get H() { return ctx.H; },
    get hx() { return ctx.hx; },
    get hy() { return ctx.hy; },
    get hz() { return ctx.hz; },
    get yMin() { return ctx.yMin; },
    get yMax() { return ctx.yMax; },
    get uid() { return ctx.uid; },
    get nextShape() { return ctx.nextShape; },
    get actx() { return ctx.actx; },
    get soundOn() { return ctx.soundOn; },
    get lastSnd() { return ctx.lastSnd; },
    get gMode() { return ctx.gMode; },
    get clockNow() { return ctx.clockNow; },
    get sayTimer() { return ctx.sayTimer; },
    get hintDone() { return ctx.hintDone; },
    get tool() { return ctx.tool; },
    get sel() { return ctx.sel; },
    get fluidOpen() { return ctx.fluidOpen; },
    get fluidAcc() { return ctx.fluidAcc; },
    get fluidMs() { return ctx.fluidMs; },
    get stirHinted() { return ctx.stirHinted; },
    get pointerT() { return ctx.pointerT; },
    get spHead() { return ctx.spHead; },
    get pileBlocks() { return ctx.pileBlocks; },
    get outfitTex() { return ctx.outfitTex; },
    get last() { return ctx.last; },
    get time() { return ctx.time; },
  };
  return { debug };
}
