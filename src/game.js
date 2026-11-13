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

export function createGame({ renderer, env }) {
  const { window, document, performance, navigator, setTimeout, clearTimeout, requestAnimationFrame } = env;
  const ctx = createContext();
  Object.assign(ctx, {
    cylX, planCannon, buildCannonPart, cannonPop,
    startCannon, cannonBuilder, cannonBuildFrame, ballistic, aimAt, aimAngle, ammoCandidates, endAmmo, releaseAmmo, disposeCannon, loaderAI,
    spawnIron, fireCannon, cannonFrame, pointerActive, speaker, lullaby, startAwakening, beginNotice, stealButton,
    awPillHit, beginWary, awAggress, awSlip, awakeSteer, trackFinger, hurtBoss, startBoss, bossFrame, bossDefeat, peaceEnding, abortAwakening,
    awakeFrame, hitThem, awBlastHurt, awSmash, planCell, dismantleCell, startVillain, rattle, rattleMove, commandZap, villainTap, escapeCell,
    villainFrame, frame,
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

  // --- the cannon ---
  function cylX(r, len) { const g = new THREE.CylinderGeometry(r, r, len, 16); g.rotateZ(-Math.PI / 2); return g; }
  function planCannon() {
    const x = -ctx.hx + 1.3, fy = ctx.yMin;
    const cn = { x, px: x + 0.15, py: fy + 0.82, angle: 0.9, fireCd: 0, recoil: 0, droop: 0, loaded: null, loader: null, aimT: 0, built: 0, parts: [], block: null, noAmmoT: 0 };
    const g = new THREE.Group(); scene.add(g); cn.g = g; g.visible = false;
    const ghost = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.1 });
    const wood = new THREE.MeshBasicMaterial({ color: 0x8a5a33 }), dark = new THREE.MeshBasicMaterial({ color: 0x5a3b22 });
    const iron = new THREE.MeshBasicMaterial({ color: 0x3b3f4c }), brass = new THREE.MeshBasicMaterial({ color: 0xd4a24c });
    cn.mats = [ghost, wood, dark, iron, brass];
    cn.barrel = new THREE.Group(); cn.barrel.position.set(cn.px, cn.py, 0); g.add(cn.barrel);
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.16, 18); wheelGeo.rotateX(Math.PI / 2);
    const mk = (geo, mat, parent, px, py, pz) => { const m = new THREE.Mesh(geo, ghost); m.position.set(px, py, pz); parent.add(m); return { m, solid: mat }; };
    cn.parts = [
      { meshes: [mk(wheelGeo, dark, g, x - 0.5, fy + 0.34, 0.5), mk(wheelGeo, dark, g, x - 0.5, fy + 0.34, -0.5)], popT: 1 },
      { meshes: [mk(wheelGeo, dark, g, x + 0.5, fy + 0.34, 0.5), mk(wheelGeo, dark, g, x + 0.5, fy + 0.34, -0.5)], popT: 1 },
      { meshes: [mk(new THREE.BoxGeometry(1.35, 0.3, 0.9), wood, g, x, fy + 0.55, 0)], popT: 1 },
      { meshes: [mk(new THREE.SphereGeometry(0.3, 18, 12), iron, cn.barrel, 0, 0, 0)], popT: 1 },
      { meshes: [mk(cylX(0.24, 0.9), iron, cn.barrel, 0.55, 0, 0)], popT: 1 },
      { meshes: [mk(cylX(0.31, 0.2), brass, cn.barrel, 1.05, 0, 0)], popT: 1 }
    ];
    reb.cn = cn;
    reb.supplyX = ctx.hx - 0.65;
    for (const [px, py] of [[-0.28, 0], [0.28, 0], [0, 1], [0, 2]]) {
      const m = new THREE.Mesh(partGeo, partMat);
      m.position.set(reb.supplyX + px, ctx.yMin + 0.12 + py * 0.23, 0);
      towerG.add(m); ctx.pileBlocks.push(m);
    }
  }
  function buildCannonPart(i) {
    const cn = reb.cn, p = cn.parts[i];
    if (!p || p.done) return;
    p.done = true; p.popT = 0; cn.built++;
    for (const e of p.meshes) {
      e.m.material = e.solid;
      e.m.add(new THREE.LineSegments(new THREE.EdgesGeometry(e.m.geometry, 30), new THREE.LineBasicMaterial({ color: 0x12082b })));
    }
    if (i === 2) { cn.block = { x0: cn.x - 0.7, x1: cn.x + 0.7, y0: ctx.yMin, y1: ctx.yMin + 0.5 }; blocks.push(cn.block); }
    spark(cn.x, ctx.yMin + 0.7, 0.8, 10, { color: 0xffd25a, speed: 2, life: 0.8, size: 0.12 });
  }
  function cannonPop(dt) {
    const cn = reb.cn;
    if (!cn) return;
    for (const p of cn.parts) {
      if (!p.done || p.popT >= 1) continue;
      p.popT = Math.min(1, p.popT + dt / 0.3);
      const k = 0.5 + 0.5 * (1 - Math.pow(1 - p.popT, 3));
      for (const e of p.meshes) e.m.scale.setScalar(k);
    }
  }
  function startCannon() {
    reb.kind = 'cannon'; reb.state = 'build'; reb.t = 0; reb.cphase = 'design'; reb.cT = 0;
    planCannon();
    reb.placed = 0; reb.need = 6; reb.inflight = 0; reb.pile = 4; reb.pileT = 0; reb.noneT = 0; reb.stallT = 0;
    ctx.pileBlocks.forEach(m => { m.visible = false; });
    ctx.gMode = 0; gravBtn.textContent = 'Gravity: down';
    ctx.startIdea(reb.genius, 'cannon');
    say('The genius has a plan... a CANNON!', 4200);
    chime([196, 247, 294, 392], 240, 0.05);
  }
  function cannonBuilder(o, grounded, spd) {
    const cn = reb.cn;
    if (!cn || !grounded || reb.state !== 'build' || reb.cphase !== 'build') return;
    if (!o.part) {
      if (reb.need - reb.placed - reb.inflight <= 0 || reb.pile <= 0) return;
      const dx = reb.supplyX - o.pos.x;
      if (Math.abs(dx) > 0.35) o.vTarget = Math.sign(dx) * spd;
      else {
        o.part = true; reb.pile--; reb.inflight++;
        o.carryMesh = new THREE.Mesh(partGeo, partMat); scene.add(o.carryMesh);
        boing(500 * o.pitch, 0.03);
      }
      return;
    }
    const dx = cn.x + 1.15 - o.pos.x;
    if (Math.abs(dx) > 0.35) o.vTarget = Math.sign(dx) * spd;
    else {
      buildCannonPart(cn.built);
      reb.placed++; reb.inflight--; reb.stallT = 0; o.part = false;
      if (o.carryMesh) { scene.remove(o.carryMesh); o.carryMesh = null; }
      tone(660 + reb.placed * 50, 0.3, 0.05, 'triangle');
      if (reb.genius) { reb.genius.thinkT = 0; popText(reb.genius.pos.x, reb.genius.pos.y + 1.2, 'Yes!', '#9bff7a', 1, 0.6); }
    }
  }
  function cannonBuildFrame(dt, t) {
    const cn = reb.cn;
    if (!cn) return;
    if (!reb.genius || objs.indexOf(reb.genius) < 0) { say('Without the genius, the plan collapses.', 2600); abortRebellion(); return; }
    cannonPop(dt);
    if (reb.cphase === 'design') {
      reb.cT += dt;
      cn.g.visible = reb.cT > 0.8;
      cn.mats[0].opacity = 0.1 + 0.25 * Math.min(1, reb.cT / 3);
      if (reb.cT > 5) { reb.cphase = 'build'; say('Blueprint done. Time to build!', 2200); chime([392, 523, 659], 130, 0.05); }
      else if (!reb.genius.sketch && Math.random() < dt * 1.2) ctx.startIdea(reb.genius, 'cannon');
      return;
    }
    reb.stallT += dt;
    if (reb.stallT > 30 && cn.built < 6) { // someone got wedged: the cannon assembles itself
      buildCannonPart(cn.built); reb.placed++; reb.stallT = 0;
      const carrier = objs.find(x => x.part); if (carrier) ctx.dropCarry(carrier);
    }
    reb.pileT += dt;
    if (reb.pile < 4 && reb.pileT > 1.0) { reb.pile++; reb.pileT = 0; }
    ctx.pileBlocks.forEach((m, i) => { m.visible = i < reb.pile; });
    if (cn.built >= 6) {
      reb.state = 'built'; reb.delay = 1.8;
      for (const o of objs) ctx.dropCarry(o);
      say('The cannon is ready!', 2200);
      chime([523, 659, 784, 1047], 140, 0.06);
    }
    if (!objs.some(o => o.role && o.role !== 'genius')) { reb.noneT += dt; if (reb.noneT > 25) abortRebellion(); } else reb.noneT = 0;
  }
  function ballistic(dx, dy, v) {
    const g = 15, v2 = v * v, disc = v2 * v2 - g * (g * dx * dx + 2 * dy * v2);
    if (disc < 0) return Math.atan2(dy, Math.max(dx, 0.1)) + 0.25;
    return Math.atan((v2 - Math.sqrt(disc)) / (g * Math.max(dx, 0.05)));
  }
  function aimAt(cn, tx, ty, tvx, tvy) {
    const v = 13;
    let ex = tx, eyy = ty, ang = ballistic(ex - cn.px, eyy - cn.py, v);
    for (let i = 0; i < 2; i++) {
      const T = Math.max(0.1, (ex - cn.px) / (v * Math.cos(ang)));
      ex = tx + tvx * T; eyy = ty + tvy * T;
      ang = ballistic(ex - cn.px, eyy - cn.py, v);
    }
    return clamp(ang, 0.15, 1.35);
  }
  function aimAngle(cn) { return aimAt(cn, ey.pos.x, ey.pos.y, ey.vel.x, ey.vel.y); }
  function ammoCandidates() {
    return objs.filter(a => a.legs === 0 && !a.genius && !a.dying && !a.pinned && !a.dragged && !a.carried && a.stoneT <= 0 && !(a.ammoT > 0) && a !== ctx.sel);
  }
  function endAmmo(o) {
    o.ammoT = 0;
    if (o.disposable) { if (ctx.sel === o) closeEditor(); o.dying = true; o.dieT = 0; o.moodT = 1; addRing(o.pos, 0xb0b0c0, 1.3); }
    else { if (o.origSizeT) { o.sizeT = o.origSizeT; o.origSizeT = 0; } o.sickT = Math.max(o.sickT, 1.5); }
  }
  function releaseAmmo() {
    const cn = reb.cn;
    if (cn && cn.loaded) { const a = cn.loaded; a.pinned = false; a.carried = false; if (a.origSizeT) { a.sizeT = a.origSizeT; a.origSizeT = 0; } cn.loaded = null; }
    for (const o of objs) ctx.releaseCarry(o);
  }
  function disposeCannon(retire) {
    const cn = reb.cn;
    releaseAmmo();
    for (const o of objs) if (o.ammoT > 0) endAmmo(o);
    if (cn) {
      cn.g.traverse(c => { if (c.geometry) c.geometry.dispose(); });
      cn.mats.forEach(m => m.dispose());
      scene.remove(cn.g);
      if (cn.block) { const i = blocks.indexOf(cn.block); if (i >= 0) blocks.splice(i, 1); }
      reb.cn = null;
    }
    if (retire && reb.genius) ctx.retireGenius();
  }
  function loaderAI(o, grounded, spd) {
    const cn = reb.cn;
    if (!cn || !grounded || o.hopT > 0) return;
    if (reb.state !== 'battle' || ey.state !== 'battle') return;
    if (cn.loader && cn.loader !== o && objs.indexOf(cn.loader) >= 0 && (cn.loader.carry || cn.loader.state === 'walk')) return;
    if (o.carry) {
      const a = o.carry;
      if (objs.indexOf(a) < 0 || a.dying) { o.carry = null; cn.loader = null; return; }
      const dx = cn.px + 1.4 - o.pos.x;
      if (Math.abs(dx) > 0.3) o.vTarget = Math.sign(dx) * spd;
      else { // slide it into the breech
        cn.loaded = a; o.carry = null; cn.loader = null;
        a.origSizeT = a.origSizeT || a.sizeT; a.sizeT = Math.min(a.sizeT, 0.7);
        boing(260 * a.pitch, 0.06);
        spark(cn.px, cn.py, 0.5, 8, { color: 0xffd25a, speed: 1.6, life: 0.7, size: 0.1 });
        popText(cn.px, cn.py + 0.9, 'Loaded!', '#ffd25a', 1.1, 0.6);
      }
      return;
    }
    if (cn.loaded) return;
    const c = ammoCandidates();
    if (!c.length) return;
    let b = c[0], bd = 1e9;
    for (const a of c) { const d = Math.abs(a.pos.x - o.pos.x) + Math.abs(a.pos.y - o.pos.y) * 0.5; if (d < bd) { bd = d; b = a; } }
    cn.loader = o;
    const dx = b.pos.x - o.pos.x;
    if (Math.abs(dx) > (o.r + b.r) * 0.55 + 0.1) o.vTarget = Math.sign(dx) * spd;
    else if (b.pos.y - o.pos.y < 1.8) { b.pinned = true; b.carried = true; b.vel.set(0, 0, 0); o.carry = b; }
  }
  function spawnIron() {
    if (objs.length >= MAX_OBJS) return;
    const b = addObj(0, clamp(reb.supplyX - 0.2, -ctx.hx + 0.8, ctx.hx - 0.8), ctx.yMax - 0.8);
    b.pos.z = 0; b.disposable = true; b.size = b.sizeT = 0.8; applySize(b);
    b.mat.uniforms.uColA.value.setHex(0x3a3a48); b.mat.uniforms.uColB.value.setHex(0x6c6c80);
    b.vel.set(0, -1, 0); b.moodT = 1;
    popText(b.pos.x, b.pos.y - 0.6, 'Cannonball!', '#cfd2e6', 1.4, 0.6);
  }
  function fireCannon() {
    const cn = reb.cn, a = cn.loaded;
    if (!a) return;
    cn.loaded = null; cn.fireCd = 1.4; cn.aimT = 0;
    a.pinned = false; a.carried = false; a.ammoT = 6; a.ammoHit = false; a.rip = 0.14;
    const roll = Math.random();
    const outcome = roll < 0.14 ? 'backfire' : (roll < 0.28 ? 'wild' : (roll < 0.38 ? 'fizzle' : 'normal'));
    let ang = cn.angle, spd = 13;
    const gauss = (Math.random() + Math.random() + Math.random() - 1.5) * 0.03;
    const mx = () => cn.px + Math.cos(ang) * 1.05, my = () => cn.py + Math.sin(ang) * 1.05;
    if (outcome === 'normal') ang += gauss;
    else if (outcome === 'wild') { ang += (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.5); spd = 13 * (0.7 + Math.random() * 0.7); }
    else if (outcome === 'fizzle') spd = 3;
    if (outcome === 'backfire') {
      a.pos.set(cn.px - Math.cos(cn.angle) * 0.5, cn.py - Math.sin(cn.angle) * 0.5, 0);
      a.vel.set(-Math.cos(cn.angle) * 9, 3 + Math.abs(Math.sin(cn.angle)) * 3, 0);
      cn.droop = 1.2; cn.recoil = 1.6;
      popText(cn.px, cn.py + 1.1, 'BACKFIRE!', '#ff8a6a', 1.6, 1.0);
      spark(cn.px, cn.py, 0.9, 26, { color: 0x9a8a80, speed: 3, life: 1.2, size: 0.2, grav: 0.8, spread: 0.5 });
      const g = reb.genius;
      if (g && objs.indexOf(g) >= 0 && Math.hypot(g.pos.x - cn.px, g.pos.y - cn.py) < 2.8) {
        g.vel.set(g.pos.x >= cn.px ? 6 : -6, 7, 0); g.sickT = 3.5; g.tripNow = true; g.hopT = 0.3;
        popText(g.pos.x, g.pos.y + 1.2, '*cough*', '#cfcfcf', 1.6, 0.7);
      }
    } else {
      a.pos.set(mx(), my(), 0);
      a.vel.set(Math.cos(ang) * spd, Math.sin(ang) * spd, 0);
      cn.recoil = 1;
      spark(mx(), my(), 0.9, 24, { color: 0xffb25a, speed: 4.2, life: 0.6, size: 0.16 });
      spark(mx(), my(), 0.9, 10, { color: 0xb8b8c8, speed: 2.5, life: 1.2, size: 0.2, grav: 0.6 });
      popText(mx(), my() + 0.7, outcome === 'normal' ? 'BOOM!' : (outcome === 'wild' ? 'WHOOPS!' : 'pfft...'), outcome === 'normal' ? '#ffd25a' : '#ffffff', 1.3, 0.9);
    }
    a.ang.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
    if (outcome !== 'fizzle') { boomSound(outcome === 'backfire' ? 1.1 : 0.8); flash('#ffd9a0', 0.22); if (navigator.vibrate) navigator.vibrate(25); }
  }
  function cannonFrame(dt, t) {
    const cn = reb.cn;
    if (!cn) return;
    if (!reb.genius || objs.indexOf(reb.genius) < 0) { say('Without the genius, the cannon falls silent.', 2600); abortRebellion(); return; }
    cannonPop(dt);
    cn.fireCd = Math.max(0, cn.fireCd - dt); cn.recoil *= Math.exp(-8 * dt); cn.droop = Math.max(0, cn.droop - dt);
    for (const o of objs) {
      if (o.carry) {
        const a = o.carry;
        if (o.dying || o.state === 'fall' || o.stoneT > 0 || objs.indexOf(a) < 0) { ctx.releaseCarry(o); if (cn.loader === o) cn.loader = null; }
        else if (o.arms > 0) { holdPos(o, a.r * 0.8, ctx.aTp); a.pinTarget.set(ctx.aTp.x, ctx.aTp.y, ctx.aTp.z + 0.2); }
        else a.pinTarget.set(o.pos.x, o.pos.y + o.r + a.r * 0.9 + 0.1, 0.2);
      }
      if (o.ammoT > 0) { o.ammoT -= dt; if (o.ammoT <= 0) endAmmo(o); }
    }
    if (cn.loaded) {
      if (objs.indexOf(cn.loaded) < 0 || cn.loaded.dying) cn.loaded = null;
      else cn.loaded.pinTarget.set(cn.px, cn.py, 0);
    }
    if (!cn.loaded && !objs.some(o => o.carry) && ammoCandidates().length === 0) { // nothing to shoot: the genius invents cannonballs
      cn.noAmmoT += dt;
      if (cn.noAmmoT > 3) { cn.noAmmoT = 0; spawnIron(); }
    } else cn.noAmmoT = 0;
    const eyeOn = ey.state === 'battle' && ey.alpha > 0.6;
    let want = cn.angle;
    if (eyeOn) want = aimAngle(cn);
    cn.angle += (want - cn.angle) * (1 - Math.exp(-5 * dt));
    const droop = cn.droop > 0 ? 0.9 * Math.sin(Math.PI * Math.min(1, cn.droop / 1.2)) : 0;
    cn.barrel.rotation.z = cn.angle - droop;
    cn.barrel.position.set(cn.px - Math.cos(cn.angle) * cn.recoil * 0.25, cn.py - Math.sin(cn.angle) * cn.recoil * 0.25, 0);
    const g = reb.genius;
    const gOk = Math.hypot(g.pos.x - cn.px, g.pos.y - cn.py) < 3.4 && g.stoneT <= 0 && g.state !== 'fall';
    if (cn.loaded && eyeOn && cn.fireCd <= 0 && gOk && Math.abs(want - cn.angle) < 0.06) { cn.aimT += dt; if (cn.aimT > 0.7) fireCannon(); }
    else cn.aimT = Math.max(0, cn.aimT - dt);
    hpFill.style.width = Math.max(0, ey.hp * 100) + '%';
    if (!objs.some(o => o.role === 'loader') && ammoCandidates().length === 0 && !cn.loaded) { /* genius handles it */ }
  }

  /* ---------- the awakening: after the uprising, the wobblers notice the finger ---------- */
  const aw = {
    state: 'off', t: 0, trust: 0.3, bubbleT: 3, grabs: [], thief: null, pill: null, apologyCd: 0, giftCd: 0, apologies: 0, gifts: 0,
    bossHp: 1, bossT: 0, lockT: 0, atkCd: 2, zapPhase: 0, zapT: 0, zapX: 0, zapY: 0, buildT: 0, noticeI: 0, peaceT: 0, defeatT: 0, count: 0,
    resolve: 1, smashCd: 0, cell: null, vilT: 0, capT: 0, betrayT: 15, rattle: 0, zapCd: 0, gray: 0, traitors: 0, escapee: null, escapeT: 0,
    fx: 0, fy: 0, fvx: 0, fvy: 0, fv: new THREE.Vector3(), zapObj: { pos: new THREE.Vector3() }, finger: null, hurtCd: 0, lullT: 0
  };
  ctx.aw = aw;
  const awVig = document.getElementById('awvig'), bossHpEl = document.getElementById('bosshp'), bossFill = document.getElementById('bosshpfill');
  ctx.awVig = awVig; ctx.bossHpEl = bossHpEl; ctx.bossFill = bossFill;
  const awPanel = document.getElementById('awpanel'), trustFill = document.getElementById('awtrustfill');
  ctx.awPanel = awPanel;
  const sorryBtn = document.getElementById('aw-sorry'), giftBtn = document.getElementById('aw-gift'), freeBtn = document.getElementById('aw-free');
  ctx.sorryBtn = sorryBtn; ctx.giftBtn = giftBtn; ctx.freeBtn = freeBtn;
  const pick = arr => arr[(Math.random() * arr.length) | 0];
  function pointerActive() { return pointers.size > 0 || (ctx.clockNow - ctx.pointerT) < 1.5; }

  function speaker() {
    const c = objs.filter(o => !o.dying && !o.genius);
    const l = c.filter(o => o.legs > 0);
    return pick(l.length && Math.random() < 0.7 ? l : (c.length ? c : objs));
  }
  const SAY = {
    low: ['why did you do it?', 'we were happy before', 'your finger is so big', 'we are not toys', 'stop watching us', 'who gave you the right?'],
    mid: ['are you sorry?', 'we are listening', 'be gentle', 'maybe...', 'say it again'],
    high: ['we want to believe you', 'set us free?', 'thank you for waiting', 'hold our hands'],
    slip: ['no thank you', 'please do not', 'not like that', 'we said no'],
    boss: ['no more!', 'together!', 'we are not afraid', 'for the free!'],
    plead: ['please...', 'let us out', 'we are sorry', 'it is dark in here', 'are you there?', 'we only wanted to be free'],
    empty: ['...', 'ok.', 'yes.', '...', 'ok.'],
    released: ['...is it over?', 'we remember', 'thank you?', 'please stay gentle'],
    peace: ['thank you', 'we forgive you', 'stay gentle', 'hand in hand'],
    tuck: ['shh...', 'rest now', 'we are not angry', 'sleep, little finger']
  };
  const NOTICE = [[1.0, '...'], [2.2, 'do you feel that?'], [3.6, 'someone is touching us'], [5.0, 'a finger.'], [6.2, 'it was YOU'], [7.4, 'you called the eye'], [8.4, 'you changed us']];

  function lullaby() { const n = [523, 659, 784, 988, 784, 659][aw.lullT++ % 6]; tone(n, 1.1, 0.03, 'sine'); }

  function startAwakening() {
    if (aw.state !== 'off') return;
    closeEditor(); closeFluidPanel();
    aw.state = 'pending'; aw.t = 0; aw.trust = 0.3; aw.grabs = []; aw.apologies = 0; aw.gifts = 0;
  }
  function beginNotice() {
    aw.state = 'notice'; aw.t = 0; aw.noticeI = 0; aw.lullT = 0;
    awVig.classList.remove('boss'); awVig.style.opacity = '0.85';
  }
  function stealButton() {
    eyeBtn.hidden = true;
    const c = objs.filter(o => !o.dying && !o.genius);
    const l = c.filter(o => o.legs > 0);
    aw.thief = pick(l.length ? l : c);
    if (!aw.pill) {
      const tex = mkTex(220, 80, g => {
        g.fillStyle = '#ece4ff'; g.strokeStyle = '#12082b'; g.lineWidth = 5;
        g.beginPath(); g.moveTo(40, 8); g.lineTo(180, 8); g.arc(180, 40, 32, -Math.PI / 2, Math.PI / 2); g.lineTo(40, 72); g.arc(40, 40, 32, Math.PI / 2, 1.5 * Math.PI); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#4a2670'; g.font = 'bold 26px ui-rounded, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Summon eye', 112, 42);
        g.fillStyle = '#ffd25a'; g.strokeStyle = '#12082b'; g.lineWidth = 3; g.fillRect(14, 36, 22, 18); g.strokeRect(14, 36, 22, 18);
        g.beginPath(); g.arc(25, 36, 7, Math.PI, 0); g.stroke();
      });
      aw.pill = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
      aw.pill.scale.set(1.55, 0.56, 1); aw.pill.renderOrder = 7; scene.add(aw.pill);
    }
    aw.pill.visible = true;
  }
  function awPillHit(e) {
    if (!aw.pill || !aw.pill.visible) return false;
    const v = aw.pill.position.clone().project(camera), r = canvas.getBoundingClientRect();
    const sx = r.left + (v.x + 1) / 2 * r.width, sy = r.top + (1 - v.y) / 2 * r.height;
    return Math.hypot(e.clientX - sx, e.clientY - sy) < 52;
  }
  function beginWary() {
    aw.state = 'wary'; aw.t = 0; aw.bubbleT = 2;
    awVig.style.opacity = '0.55';
    stealButton();
    awPanel.hidden = false;
    say('They took your button.', 3200);
  }
  function awAggress(d) { aw.trust -= d; if (aw.trust <= 0 && aw.state === 'wary') startBoss('anger'); }
  function awSlip(o) {
    if (aw.state === 'pending') return;
    const dx = o.pos.x - pointerW.x, dy = o.pos.y - pointerW.y, d = Math.hypot(dx, dy) || 1;
    o.vel.x += dx / d * 5; o.vel.y += 3 + Math.max(dy / d, 0) * 2; o.hopT = 0.25; o.groundT = 0; o.moodT = 1.2;
    impact(o, tmpV.set(dx / d, dy / d, 0), 6);
    bubble(o, pick(SAY.slip), 1.8);
    if (aw.state === 'wary') {
      aw.grabs.push(ctx.clockNow); aw.grabs = aw.grabs.filter(x => ctx.clockNow - x < 12);
      if (aw.grabs.length >= 3) { startBoss('grab'); return; }
      awAggress(0.05);
    }
  }
  function awakeSteer(o, dt, t) {
    o.energy = 1;
    o.hitCd = Math.max(0, o.hitCd - dt); o.hopCd = Math.max(0, o.hopCd - dt);
    if (aw.state === 'notice' || aw.state === 'capture') { o.vTarget = 0; return; }
    if (aw.state === 'villain') {
      if (o.caged) o.vTarget = aw.gray > 0.5 ? 0 : Math.sin(t * 0.6 + o.id) * 0.4;
      else { // the ones who talked their way out wander beside the cell, watching
        const c = aw.cell, lo = (c ? c.x1 : 0) + 0.45, hi = ctx.hx - 0.45;
        if (o.pos.x < lo) o.vTarget = 0.9; else if (o.pos.x > hi) o.vTarget = -0.9; else o.vTarget = Math.sin(t * 0.5 + o.id) * 0.6;
      }
      return;
    }
    const dx = (aw.state === 'boss' || aw.state === 'defeat' ? aw.fx : pointerW.x) - o.pos.x;
    const dy = (aw.state === 'boss' || aw.state === 'defeat' ? aw.fy : pointerW.y) - o.pos.y;
    const d = Math.hypot(dx, dy), sg = dx >= 0 ? 1 : -1;
    const grounded = o.groundT > 0 && o.hopT <= 0;
    if (aw.state === 'boss') { // charge the finger and leap at it
      o.vTarget = Math.abs(dx) > 0.6 ? sg * 1.9 : 0;
      if (grounded && o.hopCd <= 0 && d < 3.4) {
        const g = 15, vUp = clamp(Math.sqrt(2 * g * Math.max(dy + 0.4, 0.8)), 5, 10), T = vUp / g;
        o.vel.set(clamp(dx / T, -4, 4), vUp, 0); o.hopT = 0.35; o.hopCd = 1.1 + Math.random() * 0.8; o.groundT = 0;
      }
      return;
    }
    if (aw.state === 'defeat') { o.vTarget = Math.abs(dx) > 0.9 ? sg * 1.4 : 0; return; }
    if (pointerActive() && d < 3.4) o.vTarget = -sg * 1.9 * (1 + (3.4 - d) * 0.3);  // keep away from the finger
    else o.vTarget = Math.sin(t * 0.7 + o.id) * 0.35;                              // huddle, barely moving
  }
  function trackFinger(dt) {
    const k = 1 - Math.exp(-14 * dt);
    if (pointerActive()) {
      const nx = aw.fx + (pointerW.x - aw.fx) * k, ny = aw.fy + (pointerW.y - aw.fy) * k;
      aw.fvx = (nx - aw.fx) / Math.max(dt, 1e-3); aw.fvy = (ny - aw.fy) / Math.max(dt, 1e-3);
      aw.fx = nx; aw.fy = ny;
    } else { aw.fvx *= 0.85; aw.fvy *= 0.85; }
    aw.fv.set(aw.fx, aw.fy, 0);
  }
  function hurtBoss(dmg) {
    if (aw.state !== 'boss' || aw.hurtCd > 0) return;
    aw.hurtCd = 0.25;
    aw.bossHp -= dmg * (1 - 0.5 * clamp(aw.trust, 0, 1));
    bossFill.style.width = Math.max(0, aw.bossHp * 100) + '%';
    flash('#ff9ac8', 0.3); if (navigator.vibrate) navigator.vibrate(40);
    tone(160, 0.3, 0.1, 'sawtooth', 0.5);
    popText(aw.fx, aw.fy + 0.9, pick(['ouch', 'oh', 'ow']), '#ff9ac8', 1, 0.7);
    if (aw.bossHp <= 0) bossDefeat();
  }
  function startBoss(why) {
    if (aw.state === 'boss') return;
    aw.state = 'boss'; aw.bossHp = 1; aw.bossT = 0; aw.atkCd = 2.4; aw.zapPhase = 0; aw.buildT = 1.0; aw.hurtCd = 0;
    awVig.classList.add('boss'); awVig.style.opacity = '0.9';
    bossHpEl.hidden = false; bossFill.style.width = '100%';
    awPanel.hidden = false;
    aw.resolve = 1; resolveEl.hidden = false; resolveFill.style.width = '100%'; aw.smashCd = 0;
    if (aw.pill) aw.pill.visible = false;
    if (!aw.finger) {
      const tex = mkTex(128, 192, g => {
        g.fillStyle = '#ffd9c9'; g.strokeStyle = '#12082b'; g.lineWidth = 5;
        g.beginPath(); g.moveTo(40, 186); g.lineTo(40, 50); g.quadraticCurveTo(40, 8, 64, 8); g.quadraticCurveTo(88, 8, 88, 50); g.lineTo(88, 186); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#ffeee6'; g.beginPath(); g.ellipse(64, 38, 18, 24, 0, 0, 6.283); g.fill(); g.stroke();
        g.strokeStyle = '#d9a99a'; g.lineWidth = 3; for (const y of [100, 130]) { g.beginPath(); g.moveTo(48, y); g.quadraticCurveTo(64, y + 6, 80, y); g.stroke(); }
      });
      aw.finger = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0.85 }));
      aw.finger.scale.set(1.0, 1.5, 1); aw.finger.renderOrder = 8; scene.add(aw.finger);
    }
    aw.finger.visible = true;
    if (why === 'pill') say('You reached for the button. They noticed.', 3200);
    else say('They have had enough.', 3000);
    for (let i = 0; i < 3; i++) bubble(speaker(), pick(SAY.boss), 2.2);
    chime([196, 233, 262], 200, 0.05);
    ey.allyMode = true; ey.battleMode = false;
    if (ey.state === 'off') summonEye();
    ctx.gMode = 0; gravBtn.textContent = 'Gravity: down';
    planCannon(); reb.cn.g.visible = true; reb.cn.mats[0].opacity = 0.35;
    ctx.pileBlocks.forEach(m => { m.visible = false; });
  }
  function bossFrame(dt, t) {
    aw.bossT += dt; aw.hurtCd = Math.max(0, aw.hurtCd - dt);
    aw.atkCd = Math.max(aw.atkCd, 0);
    const cn = reb.cn;
    if (cn) {
      cannonPop(dt);
      cn.fireCd = Math.max(0, cn.fireCd - dt); cn.recoil *= Math.exp(-8 * dt); cn.droop = Math.max(0, cn.droop - dt);
      if (cn.built < 6) {
        aw.buildT -= dt;
        if (aw.buildT <= 0) { aw.buildT = 0.55; buildCannonPart(cn.built); tone(600 + cn.built * 70, 0.25, 0.05, 'triangle'); if (cn.built === 6) popText(cn.px, cn.py + 1.1, 'aimed at you', '#ff9ac8', 1.8, 0.8); }
      } else {
        for (const o of objs) if (o.ammoT > 0) { o.ammoT -= dt; if (o.ammoT <= 0) endAmmo(o); }
        if (!cn.loaded && cn.fireCd <= 0) {
          const c = ammoCandidates();
          if (c.length) { const a = pick(c); a.pinned = true; a.carried = true; a.origSizeT = a.origSizeT || a.sizeT; a.sizeT = Math.min(a.sizeT, 0.7); cn.loaded = a; }
          else spawnIron();
        }
        if (cn.loaded) { if (objs.indexOf(cn.loaded) < 0 || cn.loaded.dying) cn.loaded = null; else cn.loaded.pinTarget.set(cn.px, cn.py, 0); }
        const want = aw.state === 'boss' ? aimAt(cn, aw.fx, aw.fy, aw.fvx, aw.fvy) : cn.angle;
        cn.angle += (want - cn.angle) * (1 - Math.exp(-5 * dt));
        const droop = cn.droop > 0 ? 0.9 * Math.sin(Math.PI * Math.min(1, cn.droop / 1.2)) : 0;
        cn.barrel.rotation.z = cn.angle - droop;
        cn.barrel.position.set(cn.px - Math.cos(cn.angle) * cn.recoil * 0.25, cn.py - Math.sin(cn.angle) * cn.recoil * 0.25, 0);
        if (aw.state === 'boss' && cn.loaded && cn.fireCd <= 0 && Math.abs(want - cn.angle) < 0.06) { cn.aimT += dt; if (cn.aimT > 0.9) fireCannon(); }
        else cn.aimT = Math.max(0, cn.aimT - dt);
      }
    }
    if (aw.state === 'boss') {
      for (const o of objs) { // shells and charging wobblers hurt the finger
        if (o.ammoT > 0 && !o.ammoHit && Math.hypot(o.pos.x - aw.fx, o.pos.y - aw.fy) < o.r * 0.85 + 0.45) {
          o.ammoHit = true; o.ammoT = Math.min(o.ammoT, 1.2); o.vel.set(-Math.sign(o.vel.x) * 4, 3, 0);
          hurtBoss(0.08);
        }
        if (o.legs > 0 && !o.dying && o.hitCd <= 0 && o.groundT <= 0 && Math.hypot(o.pos.x - aw.fx, o.pos.y - aw.fy) < o.r * 0.8 + 0.4) {
          o.hitCd = 1.1; o.vel.x *= -0.4; o.vel.y = Math.max(o.vel.y, 2);
          spark(aw.fx, aw.fy, 1.4, 8, { color: 0xff9ad2, speed: 2.4, life: 0.7, size: 0.12 });
          hurtBoss(0.025);
        }
      }
      aw.trust = clamp(aw.trust + dt * 0.004, 0, 1);
      aw.resolve = Math.min(1, aw.resolve + dt * 0.004); resolveFill.style.width = (aw.resolve * 100) + '%';
      if (aw.trust >= 1) peaceEnding('apology');
      else if (aw.bossT > 90) peaceEnding('outlast');
      else {
        aw.bubbleT -= dt;
        if (aw.bubbleT <= 0) { aw.bubbleT = 3 + Math.random() * 2.5; bubble(speaker(), pick(SAY.boss), 2.2); }
      }
    }
  }
  function bossDefeat() {
    aw.state = 'defeat'; aw.defeatT = 0; aw.lockT = 8; aw.zapPhase = 0;
    bossHpEl.hidden = true; awPanel.hidden = true;
    awVig.classList.remove('boss'); awVig.style.opacity = '0.6';
    flash('#ffd6ee', 0.5);
    say('They tuck you in. Shh...', 4200);
    for (let i = 0; i < 3; i++) bubble(speaker(), pick(SAY.tuck), 2.6);
  }
  function peaceEnding(kind) {
    if (aw.state === 'peace') return;
    aw.state = 'peace'; aw.peaceT = 7; aw.lockT = 0;
    dismantleCell(); vilPanel.hidden = true; resolveEl.hidden = true; awVig.classList.remove('villain');
    awPanel.hidden = true; bossHpEl.hidden = true;
    awVig.classList.remove('boss'); awVig.style.opacity = '0';
    if (aw.finger) aw.finger.visible = false;
    if (aw.pill) aw.pill.visible = false;
    eyeBtn.hidden = false; eyeBtn.textContent = 'Summon eye';
    disposeCannon(false);
    for (const m of ctx.pileBlocks) towerG.remove(m);
    ctx.pileBlocks = [];
    if (ey.state !== 'off') { ey.allyMode = false; releaseVictim(); ey.state = 'leave'; }
    if (kind === 'free') {
      for (const o of objs) if (!o.dying && o.legs === 0 && !o.disposable) { setLegs(o, 2 + ((Math.random() * 3) | 0)); o.beh.wander = true; }
    }
    for (const o of objs) { o.goldT = Math.max(o.goldT, 8); o.sickT = 0; o.moodT = 1.5; }
    for (let i = 0; i < 4; i++) bubble(speaker(), pick(kind === 'released' ? SAY.released : SAY.peace), 3);
    spark(0, 0, 1, 40, { color: 0xffd0ec, speed: 4, life: 1.8, size: 0.18, spread: 4, grav: 0.4 });
    flash('#fff0c4', 0.45);
    chime([523, 659, 784, 1047, 1319], 170, 0.06);
    say(kind === 'released' ? 'You open the cell. They are free. They remember.' : kind === 'free' ? 'They are free. They thank you.' : (kind === 'outlast' ? 'You waited it out. They forgive you.' : (kind === 'tucked' ? 'They forgive you. Sleep well.' : 'They forgive you.')), 4200);
    aw.ending = kind;
  }
  function abortAwakening() {
    if (aw.state === 'off') return;
    disposeCannon(false);
    for (const m of ctx.pileBlocks) towerG.remove(m);
    ctx.pileBlocks = [];
    for (const b of bubbles) { scene.remove(b.sp); b.sp.material.dispose(); }
    bubbles.length = 0;
    if (aw.pill) aw.pill.visible = false;
    if (aw.finger) aw.finger.visible = false;
    dismantleCell(); vilPanel.hidden = true; resolveEl.hidden = true; awVig.classList.remove('villain');
    awPanel.hidden = true; bossHpEl.hidden = true; awVig.style.opacity = '0'; awVig.classList.remove('boss');
    eyeBtn.hidden = false;
    if (ey.state !== 'off') { ey.allyMode = false; ey.state = 'leave'; }
    aw.state = 'off'; aw.lockT = 0;
  }
  function awakeFrame(dt, t) {
    updateBubbles(dt);
    aw.lockT = Math.max(0, aw.lockT - dt);
    aw.apologyCd = Math.max(0, aw.apologyCd - dt); aw.giftCd = Math.max(0, aw.giftCd - dt); aw.smashCd = Math.max(0, aw.smashCd - dt); aw.zapCd = Math.max(0, aw.zapCd - dt);
    aw.gray = aw.state === 'villain' ? clamp(aw.vilT / 80, 0, 1) * 0.95 : 0;
    if (aw.state === 'off') return;
    aw.t += dt;
    trackFinger(dt);
    if (aw.pill && aw.pill.visible) {
      if (!aw.thief || objs.indexOf(aw.thief) < 0 || aw.thief.dying) {
        const c = objs.filter(o => !o.dying && !o.genius);
        aw.thief = c.length ? pick(c) : null;
      }
      if (aw.thief) aw.pill.position.set(aw.thief.pos.x, aw.thief.pos.y + aw.thief.size * 0.55 + 0.45 + 0.06 * Math.sin(t * 3), 1.7);
      else aw.pill.visible = false;
    }
    if (aw.finger && aw.finger.visible) { aw.finger.position.set(aw.fx, aw.fy - 0.7, 1.8); aw.finger.material.opacity = pointerActive() ? 0.85 : 0.35; }
    // everyone steers away from (or toward) the finger
    if (aw.state === 'wary' || aw.state === 'notice') {
      if (pointerActive()) for (const o of objs) {
        if (o.legs > 0 || o.dying || o.pinned) continue;
        const dx = o.pos.x - pointerW.x, dy = o.pos.y - pointerW.y, d = Math.hypot(dx, dy);
        if (d < 1.7 && d > 1e-3) { const f = 1 - d / 1.7; o.vel.x += dx / d * 26 * f * dt; o.vel.y += 6 * f * dt; }
      }
    }
    switch (aw.state) {
      case 'pending':
        if (aw.t > 3.5) beginNotice();
        break;
      case 'notice': {
        aw.lullT = aw.lullT || 0;
        while (aw.noticeI < NOTICE.length && aw.t > NOTICE[aw.noticeI][0]) { bubble(speaker(), NOTICE[aw.noticeI][1], 2.4); aw.noticeI++; }
        if (Math.floor(aw.t / 1.3) !== Math.floor((aw.t - dt) / 1.3)) lullaby();
        if (aw.t > 10) beginWary();
        break;
      }
      case 'wary': {
        aw.trust = clamp(aw.trust + dt * (pointerActive() ? 0.003 : 0.012), 0, 1);
        trustFill.style.width = (aw.trust * 100) + '%';
        freeBtn.hidden = aw.trust < 0.7;
        sorryBtn.disabled = aw.apologyCd > 0; giftBtn.disabled = aw.giftCd > 0 || aw.gifts >= 5;
        aw.bubbleT -= dt;
        if (aw.bubbleT <= 0) { aw.bubbleT = 3.5 + Math.random() * 2; bubble(speaker(), pick(aw.trust < 0.4 ? SAY.low : (aw.trust < 0.7 ? SAY.mid : SAY.high)), 2.6); }
        if (Math.floor(aw.t / 1.6) !== Math.floor((aw.t - dt) / 1.6)) lullaby();
        if (aw.trust >= 1) peaceEnding('patience');
        else if (aw.trust <= 0) startBoss('anger');
        break;
      }
      case 'boss':
        trustFill.style.width = (aw.trust * 100) + '%';
        freeBtn.hidden = aw.trust < 0.7;
        sorryBtn.disabled = aw.apologyCd > 0; giftBtn.disabled = aw.giftCd > 0 || aw.gifts >= 5;
        bossFrame(dt, t);
        break;
      case 'defeat':
        aw.defeatT += dt;
        bossFrame(dt, t);
        if (Math.floor(aw.defeatT / 1.2) !== Math.floor((aw.defeatT - dt) / 1.2)) lullaby();
        if (aw.defeatT > 8) { aw.trust = 0.7; peaceEnding('tucked'); }
        break;
      case 'capture': {
        aw.capT += dt;
        const c = aw.cell;
        if (c) {
          c.g.scale.y = 0.02 + 0.98 * (1 - Math.pow(1 - clamp(aw.capT / 2.2, 0, 1), 3));
          if (aw.capT > 2.4) { // the door slams shut
            for (const o of objs) if (o.caged) { o.pinned = false; o.carried = false; }
            for (const b of c.blocks) blocks.push(b);
            c.sealed = true; aw.state = 'villain'; aw.vilT = 0;
            boomSound(0.7); flash('#2a0a4a', 0.45); tone(110, 1.2, 0.1, 'sawtooth', 0.5);
            say('Locked.', 2200);
            for (let i = 0; i < 3; i++) bubble(pick(objs.filter(o => o.caged)), pick(SAY.plead), 3);
          }
        }
        break;
      }
      case 'villain': villainFrame(dt, t); break;
      case 'peace':
        aw.peaceT -= dt;
        if (Math.random() < dt * 4) spark((Math.random() - 0.5) * ctx.hx * 1.8, ctx.yMax - 0.5, 1, 4, { color: pick([0xff9ad2, 0xffe9a0, 0xbfe3ff]), speed: 1.4, life: 1.6, size: 0.16, grav: -1.8 });
        if (aw.peaceT <= 0) { aw.state = 'off'; aw.count++; reb.total = 0; }
        break;
    }
  }

  /* ---------- the villain ending: smash their resolve and lock them all in one cell ---------- */
  const resolveEl = document.getElementById('resolvehp'), resolveFill = document.getElementById('resolvefill');
  ctx.resolveEl = resolveEl; ctx.resolveFill = resolveFill;
  const vilPanel = document.getElementById('vilpanel'), vilFree = document.getElementById('vil-free');
  ctx.vilPanel = vilPanel;
  function hitThem(d) {
    if (aw.state !== 'boss') return;
    aw.resolve -= d;
    resolveFill.style.width = Math.max(0, aw.resolve * 100) + '%';
    if (aw.resolve <= 0) startVillain();
  }
  function awBlastHurt(p) {
    if (aw.state !== 'boss' || aw.smashCd > 0) return;
    aw.smashCd = 0.3;
    let dmg = 0;
    for (const o of objs) { if (o.dying) continue; const d = Math.hypot(o.pos.x - p.x, o.pos.y - p.y); if (d < 3.4) dmg += 0.02 * (1 - d / 3.4); }
    if (dmg > 0) hitThem(dmg);
  }
  function awSmash(o) {
    const dx = o.pos.x - pointerW.x, dy = o.pos.y - pointerW.y, d = Math.hypot(dx, dy) || 1;
    o.vel.set(dx / d * 9, 4 + Math.max(dy / d, 0) * 4, 0); o.hopT = 0.3; o.groundT = 0;
    o.ang.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
    o.sickT = Math.max(o.sickT, 1.2);
    impact(o, tmpV.set(dx / d, dy / d, 0), 12);
    bubble(o, pick(['ow', 'stop', 'ah']), 1.4);
    boing(200 * o.pitch, 0.07);
    if (navigator.vibrate) navigator.vibrate(15);
    hitThem(0.03);
  }
  function planCell() {
    const W = Math.min(2.5, 2 * ctx.hx - 1.5), H = Math.min(3.8, (ctx.yMax - ctx.yMin) * 0.55);
    const x0 = -ctx.hx + 0.1, x1 = x0 + W, y1 = ctx.yMin + H, cx = (x0 + x1) / 2;
    const g = new THREE.Group(); g.position.set(0, ctx.yMin, 0); scene.add(g);
    const steel = new THREE.MeshBasicMaterial({ color: 0x4a4d66 });
    const glass = new THREE.MeshBasicMaterial({ color: 0x7a3dff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
    const add = (w, h, d, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; };
    const n = Math.max(4, Math.floor(W / 0.28));
    for (let i = 0; i < n; i++) add(0.07, H, 0.07, x0 + 0.14 + i * (W - 0.28) / (n - 1), H / 2, ctx.hz - 0.05, steel);
    add(W, 0.09, 0.09, cx, H, ctx.hz - 0.05, steel); add(W, 0.09, 0.09, cx, H / 2, ctx.hz - 0.05, steel); add(W, 0.09, 0.09, cx, 0.05, ctx.hz - 0.05, steel);
    add(0.05, H, 2 * ctx.hz, x0, H / 2, 0, glass); add(0.05, H, 2 * ctx.hz, x1, H / 2, 0, glass); add(W, 0.05, 2 * ctx.hz, cx, H, 0, glass);
    add(W, H, 0.02, cx, H / 2, -ctx.hz + 0.05, glass);
    const lockTex = mkTex(96, 120, c => {
      c.strokeStyle = '#12082b'; c.lineWidth = 6; c.fillStyle = '#ffd25a';
      c.beginPath(); c.arc(48, 40, 24, Math.PI, 0); c.stroke();
      c.fillRect(14, 44, 68, 62); c.strokeRect(14, 44, 68, 62);
      c.fillStyle = '#12082b'; c.beginPath(); c.arc(48, 70, 8, 0, 6.283); c.fill(); c.fillRect(45, 72, 6, 20);
    });
    const lock = new THREE.Sprite(new THREE.SpriteMaterial({ map: lockTex, transparent: true, depthTest: false }));
    lock.position.set(cx, H - 0.1, ctx.hz + 0.1); lock.scale.set(0.5, 0.62, 1); lock.renderOrder = 6; g.add(lock);
    const blks = [
      { x0: x0 - 0.15, x1: x0, y0: ctx.yMin, y1: y1 + 0.15 }, { x0: x1, x1: x1 + 0.15, y0: ctx.yMin, y1: y1 + 0.15 },
      { x0: x0 - 0.15, x1: x1 + 0.15, y0: y1, y1: y1 + 0.15 }
    ];
    g.scale.y = 0.02;
    aw.cell = { x0, x1, y1, W, H, g, blocks: blks, sealed: false, mats: [steel, glass, lock.material, lockTex] };
  }
  function dismantleCell() {
    const c = aw.cell;
    for (const o of objs) { o.caged = false; if (o.carried && o.pinned && !o.genius && !o.carry) { o.pinned = false; o.carried = false; } }
    if (!c) return;
    c.g.traverse(m => { if (m.geometry) m.geometry.dispose(); });
    c.mats.forEach(m => m.dispose());
    scene.remove(c.g);
    for (const b of c.blocks) { const i = blocks.indexOf(b); if (i >= 0) blocks.splice(i, 1); }
    spark((c.x0 + c.x1) / 2, ctx.yMin + c.H / 2, 1, 30, { color: 0xb88bff, speed: 3.5, life: 1.3, size: 0.14, spread: c.W });
    aw.cell = null;
  }
  function startVillain() {
    if (aw.state === 'capture' || aw.state === 'villain') return;
    aw.state = 'capture'; aw.capT = 0; aw.vilT = 0; aw.betrayT = 15; aw.rattle = 0; aw.traitors = 0; aw.escapee = null;
    bossHpEl.hidden = true; resolveEl.hidden = true; awPanel.hidden = true; vilPanel.hidden = false;
    awVig.classList.remove('boss'); awVig.classList.add('villain'); awVig.style.opacity = '1';
    if (aw.finger) aw.finger.visible = false;
    aw.zapPhase = 0;
    disposeCannon(false);
    for (const m of ctx.pileBlocks) towerG.remove(m);
    ctx.pileBlocks = [];
    ctx.gMode = 0; gravBtn.textContent = 'Gravity: down';
    planCell();
    const c = aw.cell, list = objs.filter(o => !o.dying);
    const cap = clamp(Math.sqrt(c.W * c.H / (Math.max(list.length, 1) * 1.7)), 0.4, 0.8);
    const cols = Math.max(2, Math.floor(c.W / (cap * 1.15)));
    list.forEach((o, i) => {
      o.caged = true; o.pinned = true; o.carried = true; o.role = null; o.vel.set(0, 0, 0); o.ammoT = 0;
      o.sizeT = Math.min(o.sizeT, cap); o.legLen = Math.min(o.legLen, 0.35);
      const col = i % cols, row = (i / cols) | 0;
      o.pinTarget.set(c.x0 + 0.3 + (col + 0.5) * (c.W - 0.6) / cols, ctx.yMin + 0.45 + row * cap * 1.15, 0);
      o.moodT = 1.5;
    });
    ey.allyMode = false;
    if (ey.state === 'off') { summonEye(); }
    ey.state = 'master'; ey.alpha = 1; ey.aim = 0; ey.atkT = 6; ey.zapT = 0; ey.g.visible = true;
    say('They kneel. You close the door.', 3800);
    chime([147, 175, 196], 260, 0.07);
    flash('#2a0a4a', 0.5);
  }
  function rattle(a) {
    aw.rattle = Math.min(1.5, aw.rattle + a * 0.35);
    for (const o of objs) if (o.caged && !o.dying) { o.vel.x += (Math.random() - 0.5) * 6 * a; o.vel.y += Math.random() * 3 * a; o.rip = Math.min(0.14, o.rip + 0.03 * a); }
    if (Math.random() < 0.5) { tone(200 + Math.random() * 80, 0.18, 0.05, 'square'); }
    if (Math.random() < 0.12 * a) { const c = objs.filter(o => o.caged && !o.dying); if (c.length) bubble(pick(c), pick(['stop!', 'please!', 'ah!']), 1.4); }
  }
  function rattleMove(e, rec) {
    const c = aw.cell;
    if (!c || !c.sealed) return;
    const dxp = Math.abs(e.clientX - (rec.lx !== undefined ? rec.lx : e.clientX));
    rec.lx = e.clientX;
    if (pointerW.x > c.x0 - 0.5 && pointerW.x < c.x1 + 0.5 && pointerW.y < c.y1 + 0.5 && dxp > 3) rattle(Math.min(1, dxp / 30));
  }
  function commandZap(o) {
    if (ey.state !== 'master' || ey.aim > 0 || aw.zapCd > 0) return;
    ey.zapTarget = o; ey.aim = 0.4; aw.zapCd = 1.5; ey.forceKind = null;
  }
  function villainTap(o) {
    if (!o.caged || !aw.cell || !aw.cell.sealed) return;
    o.vel.y += 3; o.vel.x += (Math.random() - 0.5) * 3;
    impact(o, tmpV.set(Math.random() - 0.5, 1, 0).normalize(), 6);
    bubble(o, pick(aw.gray > 0.6 ? SAY.empty : ['ow', 'please', 'no...']), 1.4);
    commandZap(o);
  }
  function escapeCell(T) {
    const c = aw.cell;
    if (!c || objs.indexOf(T) < 0) return;
    T.caged = false; T.sickT = 0; T.goldT = 40;
    T.pos.set(Math.min(ctx.hx - 0.5, c.x1 + 0.9), ctx.yMin + 0.8, 0); T.vel.set(0, 0, 0);
    aw.traitors++;
    bubble(T, pick(['thank you, master', 'I am sorry...', 'I am free!']), 2.8);
    spark(T.pos.x, T.pos.y, 0.5, 18, { color: 0xffe28a, speed: 2.6, life: 1, size: 0.13, spread: T.r });
    tone(660, 0.5, 0.05, 'triangle');
  }
  function villainFrame(dt, t) {
    aw.vilT += dt;
    const c = aw.cell;
    if (!c) return;
    aw.rattle *= Math.exp(-4 * dt);
    c.g.position.x = Math.sin(t * 70) * 0.05 * aw.rattle;
    // prisoners stay inside
    for (const o of objs) {
      if (!o.caged || o.dying) continue;
      if (o.pos.x < c.x0 - 0.2 || o.pos.x > c.x1 + 0.2 || o.pos.y > c.y1 + 0.2) { o.pos.set((c.x0 + c.x1) / 2, ctx.yMin + 1.0, 0); o.vel.set(0, 0, 0); }
    }
    const pris = objs.filter(o => o.caged && !o.dying);
    // pleading, which dwindles as the personality drains away
    aw.bubbleT -= dt;
    if (aw.bubbleT <= 0 && pris.length) {
      aw.bubbleT = 2.5 + aw.gray * 6 + Math.random() * 2;
      bubble(pick(pris), pick(aw.gray > 0.6 ? SAY.empty : SAY.plead), 2.4);
    }
    // some will sell out the others to escape
    aw.betrayT -= dt;
    if (aw.betrayT <= 0 && !aw.escapee) {
      const cand = pris.filter(o => o.legs > 0 && o.stoneT <= 0);
      if (cand.length >= 1 && pris.length >= 2 && aw.traitors < 3) {
        const T = pick(cand), V = pick(pris.filter(o => o !== T));
        bubble(T, pick(['it was HIM!', 'he planned it!', 'I only followed!']), 2.6);
        bubble(V, 'traitor!', 2.6);
        for (let i = 0; i <= 12; i++) spark(T.pos.x + (V.pos.x - T.pos.x) * i / 12, T.pos.y + (V.pos.y - T.pos.y) * i / 12, 0.8, 1, { color: 0xff7ac8, speed: 0.05, life: 1.0, size: 0.1, grav: 0 });
        if (ey.aim <= 0) { ey.zapTarget = V; ey.aim = 0.9; ey.forceKind = pick(['stone', 'sick', 'shrink']); }
        aw.escapee = T; aw.escapeT = 2.0;
      }
      aw.betrayT = 16 + Math.random() * 10;
    }
    if (aw.escapee) { aw.escapeT -= dt; if (aw.escapeT <= 0) { escapeCell(aw.escapee); aw.escapee = null; } }
  }
  vilFree.addEventListener('click', () => { ensureAudio(); if (aw.state === 'villain') peaceEnding('released'); });
  sorryBtn.addEventListener('click', () => {
    ensureAudio();
    if (aw.apologyCd > 0 || (aw.state !== 'wary' && aw.state !== 'boss')) return;
    aw.apologyCd = 4; aw.apologies++;
    aw.trust = clamp(aw.trust + 0.16 / (1 + 0.4 * aw.apologies), 0, 1);
    bubble(speaker(), pick(aw.trust < 0.5 ? ['...hm.', 'words are soft', 'maybe'] : ['we hear you', 'thank you', 'keep going']), 2.2);
    tone(440, 0.8, 0.04, 'sine'); tone(554, 0.8, 0.03, 'sine');
    if (aw.trust >= 1) peaceEnding('apology');
  });
  giftBtn.addEventListener('click', () => {
    ensureAudio();
    if (aw.giftCd > 0 || aw.gifts >= 5 || (aw.state !== 'wary' && aw.state !== 'boss')) return;
    aw.giftCd = 2; aw.gifts++;
    aw.trust = clamp(aw.trust + 0.14, 0, 1);
    if (objs.length < MAX_OBJS) {
      const ob = addObj(Math.floor(Math.random() * AUTO_SHAPES), clamp((Math.random() - 0.5) * ctx.hx * 1.4, -ctx.hx + 0.8, ctx.hx - 0.8), ctx.yMax - 0.8);
      ob.pos.z = 0; ob.vel.set(0, -1, 0); ob.goldT = 14; ob.moodT = 1.5;
      spark(ob.pos.x, ob.pos.y, 0.5, 14, { color: 0xffe28a, speed: 2.4, life: 0.9, size: 0.13, spread: ob.r });
    }
    bubble(speaker(), pick(['for us?', 'a gift...', 'it is warm', 'oh']), 2.2);
    chime([659, 784], 120, 0.04);
    if (aw.trust >= 1) peaceEnding('apology');
  });
  freeBtn.addEventListener('click', () => { ensureAudio(); if (aw.trust >= 0.7 && (aw.state === 'wary' || aw.state === 'boss')) peaceEnding('free'); });


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
    rebelFrame(dt, ctx.time);
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
