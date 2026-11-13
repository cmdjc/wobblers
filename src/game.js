import * as THREE from "three";
import { createContext } from "./context.js";
import { createAudio } from "./audio/audio.js";
import { VS, FS } from "./gfx/shaders.js";
import { createTextures } from "./gfx/textures.js";
import { CAM_Z, TAN, createBackground } from "./gfx/background.js";
import { createFx } from "./gfx/fx.js";
import { createHud } from "./ui/hud.js";
import { createToolbar } from "./ui/toolbar.js";
import { createEditor } from "./ui/editor.js";
import { createFluidPanel } from "./ui/fluidPanel.js";
import { createPointer } from "./input/pointer.js";
import { chainBeta, dirichlet, jointLimit, solveChain } from "./limbs/chain.js";
import { createLegs } from "./limbs/legs.js";
import { createArms } from "./limbs/arms.js";
import { N_FL, createFluidRender } from "./fluid/render.js";
import { createFluidCoupling } from "./fluid/coupling.js";
import { AUTO_SHAPES, GEAR, SHAPES, createShapes } from "./shapes/shapes.js";
import { createColliders } from "./shapes/colliders.js";
import { createEye } from "./eye/eye.js";
import { createVerdicts } from "./eye/verdicts.js";
import { createEyes } from "./world/eyes.js";
import { MAX_OBJS, createObjects } from "./world/objects.js";
import { createPhysics } from "./world/physics.js";
import { createBlocks } from "./world/blocks.js";
import { createTower } from "./story/tower.js";
import { createGenius } from "./story/genius.js";
import { createCannon } from "./story/cannon.js";
import { createAwakening } from "./story/awakening.js";
import { createVillain } from "./story/villain.js";

export function createGame({ renderer, env }) {
  const { window, document, performance, navigator, setTimeout, clearTimeout, requestAnimationFrame } = env;
  const ctx = createContext();
  Object.assign(ctx, {
    frame,
  });
  ctx.env = env;
  ctx.renderer = renderer;
  const { ensureAudio, boing, tone, chime, zapSound, boomSound } = createAudio(ctx);
  const { mkTex, textTex, bubbleTex, haloTexture } = createTextures(ctx);
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

  /* ---------- scratch ---------- */
  const tmpG = new THREE.Vector3(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(),
        qInv = new THREE.Quaternion();
  ctx.tmpG = tmpG; ctx.tmpV = tmpV; ctx.tmpV2 = tmpV2; ctx.qInv = qInv;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const { resize, updateMotes } = createBackground(ctx);

  /* ---------- jelly shader ---------- */
  
  

  /* ---------- shapes, colliders, eyes, objects ---------- */
  const { getFracGeo } = createShapes(ctx);
  const { buildCollider } = createColliders(ctx);
  const { drawEyes } = createEyes(ctx);
  const { objs, addObj, removeObj, applySize } = createObjects(ctx);
  const { impact, gravityAt, step } = createPhysics(ctx);

  /* ---------- pointer input ---------- */
  const { pointers, look } = createPointer(ctx);

  /* ---------- UI ---------- */
  const { say, hideHint } = createHud(ctx);
  const { maxSizeFor, gravBtn } = createToolbar(ctx);

  /* ---------- editor ---------- */
  const { selRing, closeEditor, fitRoom } = createEditor(ctx);

  /* ---------- fluid: rendering (particles -> density field -> blobby surface) ---------- */
  const { fluid, FL, renderFluidField } = createFluidRender(ctx);

  /* ---------- fluid: coupling with the shapes ---------- */
  const { smp, fluidFrame } = createFluidCoupling(ctx);

  /* ---------- fluid: panel ---------- */
  const { showFl, closeFluidPanel } = createFluidPanel(ctx);


  /* ---------- legs: walking, moods, stumbling ---------- */
  const pointerW = new THREE.Vector3();
  ctx.pointerW = pointerW;
  const { setLegs, legBrain, updateLegs } = createLegs(ctx);

  /* ---------- the Eye: a divine floating eye ---------- */
  const { rings, addRing, updateRings, blast, updateSparkPx, spark, updateSparks, flash, popText, updatePopTexts, bubble, updateBubbles, bubbles } = createFx(ctx);
  const { ey, eyeBtn, summonEye, releaseVictim, eyeFrame } = createEye(ctx);
  const { endStone, applyPunish, applyPrize, divineStatus } = createVerdicts(ctx);

  /* ---------- the uprising: legged wobblers build a tower, climb it, and fight the eye ---------- */
  const { blocks } = createBlocks(ctx);
  const { reb, towerG, partGeo, partMat, hpFill, rebelFrame, abortRebellion, defeatEye } = createTower(ctx);
  const { updateOutfit, spawnGenius } = createGenius(ctx);
  createCannon(ctx);

  /* ---------- the awakening: after the uprising, the wobblers notice the finger ---------- */
  const { startAwakening, startBoss, peaceEnding, abortAwakening, awakeFrame } = createAwakening(ctx);
  createVillain(ctx);
  const { aw } = ctx;


  /* ---------- arms: jointed arms that wave, point, carry, punch, throw and hug ---------- */
  const { holdPos, updateArms } = createArms(ctx);

  /* ---------- start ---------- */
  const start = [0, 1, 0, 2, 3, 1, 4];
  start.forEach((s, i) => {
    addObj(s, (Math.random() - 0.5) * ctx.hx * 1.3, ctx.yMax - 0.9 - i * 0.65);
    ctx.nextShape = (ctx.nextShape + 1);
  });
  ctx.nextShape = 5;
  say('Press to squish, flick to throw, long-press to edit. Tap empty space to blast.', 7000);

  /* ---------- render loop ---------- */
  ctx.last = performance.now();
  const pv = new THREE.Vector3();
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

    for (const o of objs.slice()) {
      o.mesh.position.copy(o.pos);
      let sc = 1;
      if (o.dying) {
        o.dieT += dt;
        const kd = Math.max(0, o.dieT) / 0.3;
        if (kd >= 1) { removeObj(o); continue; }
        sc = kd < 0.2 ? 1 + 0.3 * (kd / 0.2) : Math.max(0.001, 1.3 * (1 - (kd - 0.2) / 0.8));
      }
      if (Math.abs(o.sizeT - o.size) > 0.002) {
        o.size += (o.sizeT - o.size) * (1 - Math.exp(-12 * dt));
        applySize(o);
      }
      o.mesh.scale.set(o.size * o.sx * sc, o.size * o.sy * sc, o.size * o.sz * sc);
      const ek = 1 + 0.12 * o.level;
      o.eyes.s.scale.set(o.size * 0.9 * sc * ek, o.size * 0.45 * sc * ek, 1);
      updateLegs(o, dt, ctx.time, sc);
      if (o.arms > 0) updateArms(o, dt, ctx.time, sc);
      if (o.outfit) updateOutfit(o, ctx.time, sc);
      const u = o.mat.uniforms;
      u.uQ.value = o.q; u.uRip.value = o.rip * (o.wob < 0 ? 1 + o.wob : 1); u.uPress.value = o.p;
      divineStatus(o, dt);
      { const kk = 1 - Math.exp(-6 * dt);
        u.uStone.value += ((o.stoneT > 0 ? 1 : 0) - u.uStone.value) * kk;
        u.uSick.value += ((o.sickT > 0 ? 1 : 0) - u.uSick.value) * kk;
        u.uGold.value += ((o.goldT > 0 ? 1 : 0) - u.uGold.value) * kk;
        u.uGray.value += ((aw.state === 'villain' && o.caged ? aw.gray : 0) - u.uGray.value) * kk; }

      pv.copy(o.pos).project(camera);
      let tx, ty;
      if (ctx.time - look.last < 3) { tx = look.x; ty = look.y; }
      else { tx = Math.sin(ctx.time * 0.6 + o.id) * 0.6; ty = Math.cos(ctx.time * 0.45 + o.id * 1.7) * 0.6; }
      const dx = (tx - pv.x) * camera.aspect, dy = ty - pv.y;
      const len = Math.hypot(dx, dy) || 1;
      const m = Math.min(len * 2, 1);
      const mood = o.dragged ? 2 : (o.moodT > 0 ? 1 : ((aw.state === 'villain' && o.caged && aw.gray > 0.55) ? 3 : (o.stoneT > 0 ? 2 : (o.sickT > 0 ? 4 : (o.legs > 0 ? ((o.state === 'fall' || o.dizzyT > 0) ? 4 : ((o.state === 'rest' || o.energy < 0.3) ? 3 : 0)) : 0)))));
      const blink = ((ctx.time + o.id * 1.7) % (3.5 + (o.id % 3))) < 0.13;
      let ex = dx / len * m, ey = dy / len * m;
      if (aw.state === 'notice' || aw.state === 'villain' || (aw.state === 'wary' && !(ctx.clockNow - ctx.pointerT < 1.5))) { ex = 0; ey = 0; } // staring right at you
      if (mood === 4) { ex = Math.cos(ctx.time * 9 + o.id) * 0.8; ey = Math.sin(ctx.time * 9 + o.id) * 0.8; }
      drawEyes(o.eyes, ex, ey, mood, blink);
      o.eyes.s.position.set(o.pos.x, o.pos.y + o.size * 0.08, o.pos.z + o.front);
      o.eyes.s.material.rotation = clamp(-o.vel.x * 0.03, -0.5, 0.5);
    }

    updateRings(dt);

    updateMotes(dt);

    renderFluidField();

    if (ctx.sel && objs.indexOf(ctx.sel) >= 0) {
      selRing.visible = true;
      selRing.position.set(ctx.sel.pos.x, ctx.sel.pos.y, ctx.sel.pos.z + ctx.sel.front * 0.5);
      selRing.scale.setScalar(ctx.sel.r * (1.25 + 0.05 * Math.sin(ctx.time * 6)));
    } else selRing.visible = false;

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
