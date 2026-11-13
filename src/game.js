import * as THREE from "three";
import { createContext } from "./context.js";
import { createAudio } from "./audio/audio.js";
import { VS, FS, BLOB_VS, BLOB_FS, FLUID_VS, FLUID_FS, EYE_FS } from "./gfx/shaders.js";
import { createTextures } from "./gfx/textures.js";
import { CAM_Z, TAN, createBackground } from "./gfx/background.js";
import { createFx } from "./gfx/fx.js";
import { createHud } from "./ui/hud.js";
import { createToolbar } from "./ui/toolbar.js";
import { createEditor } from "./ui/editor.js";
import { createFluidPanel } from "./ui/fluidPanel.js";
import { createPointer } from "./input/pointer.js";
import { chainBeta, dirichlet, jointLimit, solveChain } from "./limbs/chain.js";
import { createFluid } from "./fluid/solver.js";
import { AUTO_SHAPES, GEAR, SHAPES, createShapes } from "./shapes/shapes.js";
import { createColliders } from "./shapes/colliders.js";
import { createEyes } from "./world/eyes.js";
import { MAX_OBJS, createObjects } from "./world/objects.js";
import { createPhysics } from "./world/physics.js";
import { createBlocks } from "./world/blocks.js";

export function createGame({ renderer, env }) {
  const { window, document, performance, navigator, setTimeout, clearTimeout, requestAnimationFrame } = env;
  const ctx = createContext();
  Object.assign(ctx, {
    applyFluidLook, fluidInit, buildObstacles, wetness, coupleObjects, gearFluid, fluidFrame, renderFluidField, stirFluid,
    chainPts, defaultBeh, footR, hipXZ, clearLegs,
    buildLegs, setLegs, startFall, legBrain, orientLegged, stick, updateLegs, makeRibbon, setRibbon,
    buildEye, summonEye, releaseVictim, dismissEye, dirFromEye, startStone, endStone, meltAway,
    popAway, applyPunish, giftShapes, startHug, applyPrize, gearJam, gearOverclock, divineStatus, pickVictim, eyeFinish, eyeFrame, countLegged,
    countRebels, dropCarry, refreshRoles, setHud, makePieceMesh, disposeMesh, planTower, buildPiece, dismantleTower, abortRebellion, startBuild,
    startCelebration, defeatEye, beginBattle, chargeNow, lowestY, updateLevel, hopTo, climbStep, rebelSteer, advanceTower, rebelFrame,
    outfitTextures, stickBetween, buildRig, makeOutfit, clearOutfit, releaseCarry, updateOutfit,
    sketchPath, startIdea, sketchTick, lightbulb, mutter, geniusAI, spawnGenius, retireGenius, cylX, planCannon, buildCannonPart, cannonPop,
    startCannon, cannonBuilder, cannonBuildFrame, ballistic, aimAt, aimAngle, ammoCandidates, endAmmo, releaseAmmo, disposeCannon, loaderAI,
    spawnIron, fireCannon, cannonFrame, pointerActive, speaker, lullaby, startAwakening, beginNotice, stealButton,
    awPillHit, beginWary, awAggress, awSlip, awakeSteer, trackFinger, hurtBoss, startBoss, bossFrame, bossDefeat, peaceEnding, abortAwakening,
    awakeFrame, hitThem, awBlastHurt, awSmash, planCell, dismantleCell, startVillain, rattle, rattleMove, commandZap, villainTap, escapeCell,
    villainFrame, defaultAbeh, clearArms, buildArms, setArms, holdPos, armFor, armReach, armSetMode, armCancel, armCalm, armItemOk, armPickItem,
    holdItem, startPunch, punchLand, endHeld, armHug, armTick, armIdle, armSteer, armHandTarget, updateArms, frame,
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
  const { ray, pointers, look } = createPointer(ctx);

  /* ---------- UI ---------- */
  const { say, hideHint } = createHud(ctx);
  const { maxSizeFor, gravBtn } = createToolbar(ctx);

  /* ---------- editor ---------- */
  const { selRing, closeEditor, fitRoom } = createEditor(ctx);

  /* ---------- fluid: rendering (particles -> density field -> blobby surface) ---------- */
  const N_FL = 1000;
  const fluid = createFluid(N_FL);
  ctx.fluid = fluid;
  const FL = { amount: 0, visc: 0.05, dens: 1, hue: 205, opacity: 0.78, glow: 0 };
  ctx.FL = FL;

  const blobPos = new Float32Array(N_FL * 3), blobSpd = new Float32Array(N_FL);
  ctx.blobPos = blobPos; ctx.blobSpd = blobSpd;
  const blobGeo = new THREE.BufferGeometry();
  ctx.blobGeo = blobGeo;
  blobGeo.setAttribute('position', new THREE.BufferAttribute(blobPos, 3));
  blobGeo.setAttribute('aSpeed', new THREE.BufferAttribute(blobSpd, 1));
  blobGeo.setDrawRange(0, 0);
  const blobMat = new THREE.ShaderMaterial({
    uniforms: { uSize: { value: 30 }, uAmp: { value: 0.27 } },
    vertexShader: BLOB_VS,
    fragmentShader: BLOB_FS,
    blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false
  });
  ctx.blobMat = blobMat;
  const blobPts = new THREE.Points(blobGeo, blobMat);
  ctx.blobPts = blobPts;
  blobPts.frustumCulled = false;
  const blobScene = new THREE.Scene();
  ctx.blobScene = blobScene;
  blobScene.add(blobPts);
  const fieldRT = new THREE.WebGLRenderTarget(256, 256, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false
  });
  ctx.fieldRT = fieldRT;

  const fluidMat = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: {
      uField: { value: fieldRT.texture }, uTexel: { value: new THREE.Vector2(0.004, 0.004) }, uTime: timeU,
      uDeep: { value: new THREE.Color() }, uLight: { value: new THREE.Color() },
      uOpacity: { value: 0.8 }, uGlow: { value: 0 }, uBox: { value: new THREE.Vector4(0, 0, 1, 1) },
      uThr: { value: 0.24 }, uBump: { value: 3.0 }
    },
    vertexShader: FLUID_VS,
    fragmentShader: FLUID_FS
  });
  ctx.fluidMat = fluidMat;
  const fluidQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fluidMat);
  ctx.fluidQuad = fluidQuad;
  fluidQuad.frustumCulled = false; fluidQuad.renderOrder = 3; fluidQuad.visible = false;
  scene.add(fluidQuad);

  function applyFluidLook() {
    fluidMat.uniforms.uDeep.value.setHSL(FL.hue / 360, 0.8, 0.27);
    fluidMat.uniforms.uLight.value.setHSL(FL.hue / 360, 0.85, 0.62);
    fluidMat.uniforms.uOpacity.value = FL.opacity;
    fluidMat.uniforms.uGlow.value = FL.glow;
  }
  function fluidInit() {
    const k0 = CAM_Z / (CAM_Z - ctx.hz);
    fluid.configure(ctx.hx * k0, ctx.yMin * k0, ctx.yMax * k0, N_FL);
    const gl = renderer.getContext();
    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    const maxPt = (range && range[1]) ? range[1] : 64;
    const diamWorld = 2 * 1.7 * fluid.s;
    let rtH = 640;
    const sizePx = diamWorld * rtH / (2 * TAN * CAM_Z) + 2;
    if (sizePx > maxPt * 0.95) rtH = rtH * maxPt * 0.95 / sizePx;
    rtH = Math.max(160, Math.round(rtH));
    const rtW = Math.round(rtH * camera.aspect);
    fieldRT.setSize(rtW, rtH);
    blobMat.uniforms.uSize.value = diamWorld * rtH / (2 * TAN * CAM_Z) + 2;
    fluidMat.uniforms.uTexel.value.set(1 / rtW, 1 / rtH);
    camera.updateMatrixWorld();
    const bnd = fluid.bounds, a = new THREE.Vector3(-bnd[0], bnd[1], 0).project(camera), b = new THREE.Vector3(bnd[0], bnd[2], 0).project(camera);
    fluidMat.uniforms.uBox.value.set((a.x + 1) / 2, (a.y + 1) / 2, (b.x + 1) / 2, (b.y + 1) / 2);
    applyFluidLook();
  }
  window.addEventListener('resize', fluidInit);
  window.addEventListener('load', fluidInit);
  fluidInit();

  /* ---------- fluid: coupling with the shapes ---------- */
  const OB_MAX = 40, OB_SPH = 140;
  const obB = new Float32Array(5 * OB_MAX), obS = new Float32Array(3 * OB_MAX * OB_SPH), obStart = new Int32Array(OB_MAX + 1);
  function buildObstacles() {
    let m = 0, kS = 0;
    for (const o of objs) {
      if (o.dying) continue;
      if (m >= OB_MAX || kS + o.cn > OB_MAX * OB_SPH) break;
      const kc = CAM_Z / (CAM_Z - o.pos.z);
      const ccx = o.pos.x * kc, ccy = o.pos.y * kc;
      obStart[m] = kS;
      let R = 0;
      for (let k = 0; k < o.cn; k++) {
        const kk = CAM_Z / (CAM_Z - (o.pos.z + o.wo[3 * k + 2]));
        const sx = (o.pos.x + o.wo[3 * k]) * kk, sy = (o.pos.y + o.wo[3 * k + 1]) * kk, sr = o.cRad[k] * kk;
        obS[3 * kS] = sx; obS[3 * kS + 1] = sy; obS[3 * kS + 2] = sr; kS++;
        R = Math.max(R, Math.hypot(sx - ccx, sy - ccy) + sr);
      }
      obB[5 * m] = ccx; obB[5 * m + 1] = ccy; obB[5 * m + 2] = R;
      obB[5 * m + 3] = o.vel.x * kc; obB[5 * m + 4] = o.vel.y * kc;
      m++;
    }
    for (const b of blocks) { // the tower is solid to the liquid too
      const rr = (b.y1 - b.y0) / 2, cnt = Math.max(1, Math.ceil((b.x1 - b.x0) / (rr * 1.6)));
      if (m >= OB_MAX || kS + cnt > OB_MAX * OB_SPH) break;
      obStart[m] = kS;
      const cy = (b.y0 + b.y1) / 2, cx = (b.x0 + b.x1) / 2;
      for (let i = 0; i < cnt; i++) {
        obS[3 * kS] = b.x0 + rr + (b.x1 - b.x0 - 2 * rr) * (cnt > 1 ? i / (cnt - 1) : 0.5); obS[3 * kS + 1] = cy; obS[3 * kS + 2] = rr; kS++;
      }
      obB[5 * m] = cx; obB[5 * m + 1] = cy; obB[5 * m + 2] = (b.x1 - b.x0) / 2 + rr; obB[5 * m + 3] = 0; obB[5 * m + 4] = 0;
      m++;
    }
    obStart[m] = kS;
    fluid.setObstacles(obB, obS, obStart, m);
  }
  const smp = [0, 0, 0];
  ctx.smp = smp;
  const flow = { x: 0, y: 0 };
  ctx.flow = flow;
  // How much of the shape is under the surface? Probe points just outside its spheres and see if liquid is there.
  function wetness(o) {
    const s = fluid.s, rc = 1.6 * s, need = 0.55 * Math.PI * 1.6 * 1.6;
    const kc = CAM_Z / (CAM_Z - o.pos.z);
    fluid.sample(o.pos.x * kc, o.pos.y * kc, (o.r + 1.5 * s) * kc, smp);
    if (smp[0] === 0) return 0;
    let wetW = 0, totW = 0, fvx = 0, fvy = 0, fc = 0;
    const stride = o.cn > 16 ? 2 : 1;
    for (let k = 0; k < o.cn; k += stride) {
      const kk = CAM_Z / (CAM_Z - (o.pos.z + o.wo[3 * k + 2]));
      const cx = (o.pos.x + o.wo[3 * k]) * kk, cy = (o.pos.y + o.wo[3 * k + 1]) * kk, sr = o.cRad[k] * kk;
      const wgt = sr * sr;
      for (let a = 0; a < 6; a++) {
        const ang = a * 1.0472 + k * 0.7;
        const qx = cx + (sr + 0.75 * s) * Math.cos(ang), qy = cy + (sr + 0.75 * s) * Math.sin(ang);
        let inside = false;
        for (let j = 0; j < o.cn && !inside; j++) {
          if (j === k) continue;
          const jk = CAM_Z / (CAM_Z - (o.pos.z + o.wo[3 * j + 2]));
          const dx = qx - (o.pos.x + o.wo[3 * j]) * jk, dy = qy - (o.pos.y + o.wo[3 * j + 1]) * jk, rr = o.cRad[j] * jk;
          if (dx * dx + dy * dy < rr * rr) inside = true;
        }
        if (inside) continue;
        fluid.sample(qx, qy, rc, smp);
        wetW += Math.min(smp[0] / (need / (s * s) * s * s), 1) * wgt; totW += wgt;
        fvx += smp[1]; fvy += smp[2]; fc += smp[0];
      }
    }
    if (fc > 0) { flow.x = fvx / fc / kc; flow.y = fvy / fc / kc; } else { flow.x = 0; flow.y = 0; }
    return totW > 0 ? wetW / totW : 0;
  }
  function coupleObjects(dt, t) {
    for (const o of objs) {
      if (o.dying) continue;
      const f = (o.dragged || o.pinned) ? 0 : wetness(o);
      if (f > 0.35 && !o.wasWet && o.vel.length() > 4) { boing(150 * o.pitch, 0.06); o.rip = Math.min(0.14, o.rip + 0.08); }
      o.wasWet = f > 0.2;
      if (o.shape === GEAR && o.legs === 0 && f > 0.05) gearFluid(o, f, dt);
      if (f < 0.03) continue;
      gravityAt(o, t);
      o.vel.addScaledVector(tmpG, -dt * o.gScale * f * Math.min(FL.dens / o.density, 12));
      const dragK = f * (1.2 + 7 * FL.visc) / Math.sqrt(o.density);
      const k = 1 - Math.exp(-dragK * dt);
      o.vel.x += (flow.x - o.vel.x) * k; o.vel.y += (flow.y - o.vel.y) * k;
      o.vel.z *= Math.exp(-dragK * 0.5 * dt);
      o.ang.multiplyScalar(Math.exp(-f * 1.5 * dt));
    }
  }
  // a gear in the water is a paddle wheel: the flow turns it, and its teeth drag the water around
  function gearFluid(o, f, dt) {
    const kc = CAM_Z / (CAM_Z - o.pos.z), R = 0.5 * o.size * Math.max(o.sx, o.sy) * kc;
    let vt = 0;
    for (let a = 0; a < 4; a++) {
      const ang = a * Math.PI / 2 + 0.4;
      fluid.sample(o.pos.x * kc + Math.cos(ang) * R * 1.35, o.pos.y * kc + Math.sin(ang) * R * 1.35, R * 0.8, smp);
      if (smp[0] > 0) vt += (-Math.sin(ang) * smp[1] + Math.cos(ang) * smp[2]) / smp[0];
    }
    vt /= 4;
    const w = clamp(vt / Math.max(R, 0.2), -10, 10);
    o.ang.z += (w - o.ang.z) * (1 - Math.exp(-2.5 * f * dt));
    fluid.swirl(o.pos.x * kc, o.pos.y * kc, R * 1.45, o.ang.z * 0.3 * f);
  }
  function fluidFrame(dt, t) {
    fluid.F.mode = ctx.gMode; fluid.F.t = t; fluid.F.visc = FL.visc;
    const target = Math.round(FL.amount * N_FL);
    if (fluid.n < target) fluid.spawn(Math.min(9, target - fluid.n), true);
    else if (fluid.n > target) fluid.drain(Math.min(14, fluid.n - target));
    fluidQuad.visible = fluid.n > 0;
    if (fluid.n === 0) { blobGeo.setDrawRange(0, 0); return; }
    ctx.fluidAcc += dt;
    let steps = 0;
    buildObstacles();
    while (ctx.fluidAcc >= 1 / 60 && steps < 2) {
      const t0 = performance.now();
      fluid.step(1 / 60);
      ctx.fluidMs += (performance.now() - t0 - ctx.fluidMs) * 0.1;
      ctx.fluidAcc -= 1 / 60; steps++;
    }
    if (ctx.fluidAcc > 1 / 30) ctx.fluidAcc = 0;
    fluid.F.iters = ctx.fluidMs > 9 ? 3 : 4;
    fluid.prepSample();
    coupleObjects(dt, t);
    const n = fluid.n, px = fluid.px, py = fluid.py, sp = fluid.spd;
    for (let i = 0; i < n; i++) { blobPos[3 * i] = px[i]; blobPos[3 * i + 1] = py[i]; blobSpd[i] = sp[i]; }
    blobGeo.attributes.position.needsUpdate = true;
    blobGeo.attributes.aSpeed.needsUpdate = true;
    blobGeo.setDrawRange(0, n);
  }
  function renderFluidField() {
    if (fluid.n === 0) return;
    renderer.setRenderTarget(fieldRT);
    renderer.render(blobScene, camera);
    renderer.setRenderTarget(null);
  }
  const plane0 = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  ctx.plane0 = plane0;
  const stirHit = new THREE.Vector3();
  function stirFluid(rec) {
    if (!ray.ray.intersectPlane(plane0, stirHit)) return;
    const now = performance.now();
    if (rec.sx !== undefined) {
      const dts = (now - rec.st) / 1000;
      if (dts > 0.004) {
        const fvx = clamp((stirHit.x - rec.sx) / dts, -14, 14), fvy = clamp((stirHit.y - rec.sy) / dts, -14, 14);
        fluid.stir(stirHit.x, stirHit.y, fvx, fvy, 0.9);
      }
    }
    rec.sx = stirHit.x; rec.sy = stirHit.y; rec.st = now;
  }

  /* ---------- fluid: panel ---------- */
  const { showFl, closeFluidPanel } = createFluidPanel(ctx);

  /* ---------- legs: walking, moods, stumbling ---------- */
  const pointerW = new THREE.Vector3();
  ctx.pointerW = pointerW;
  const legCyl = new THREE.CylinderGeometry(1, 1, 1, 8, 1), legBall = new THREE.SphereGeometry(1, 14, 10);
  ctx.legCyl = legCyl; ctx.legBall = legBall;
  const Y_AXIS = new THREE.Vector3(0, 1, 0), Z_AXIS = new THREE.Vector3(0, 0, 1);
  const lgH = new THREE.Vector3(), lgF = new THREE.Vector3(), lgK = new THREE.Vector3(), lgD = new THREE.Vector3(),
        lgB = new THREE.Vector3(), lgM = new THREE.Vector3(), lgZ = new THREE.Vector3();
  const lgQt = new THREE.Quaternion(), qA = new THREE.Quaternion(), qB = new THREE.Quaternion(),
        qC = new THREE.Quaternion(), qT = new THREE.Quaternion();

  const chainPool = [];
  function chainPts(n) { while (chainPool.length < n + 1) chainPool.push(new THREE.Vector3()); return chainPool; }
  function defaultBeh() { return { wander: true, follow: false, flee: false, chase: false, seek: false, avoid: false }; }
  function footR(o) { return 0.09 * o.size * o.footScale; }
  function hipXZ(o, i) {
    const n = o.legs;
    if (n === 1) return [0, 0];
    if (n === 2) return [(i ? 1 : -1) * 0.55 * o.halfW, 0];
    const a = 6.2832 * i / n + 0.785;
    return [Math.cos(a) * 0.6 * o.halfW, Math.sin(a) * 0.55 * o.halfD];
  }
  function clearLegs(o) {
    for (const lg of o.legMeshes) { lg.sticks.forEach(m => scene.remove(m)); lg.joints.forEach(m => scene.remove(m)); scene.remove(lg.foot); }
    o.legMeshes.length = 0;
    if (o.legMatA) { o.legMatA.dispose(); o.legMatB.dispose(); o.legMatA = o.legMatB = null; }
  }
  function buildLegs(o) {
    clearLegs(o);
    if (!o.legs) return;
    o.legMatA = new THREE.MeshBasicMaterial({ color: new THREE.Color().copy(o.mat.uniforms.uColB.value).multiplyScalar(0.75) });
    o.legMatB = new THREE.MeshBasicMaterial({ color: new THREE.Color().copy(o.mat.uniforms.uColA.value) });
    for (let i = 0; i < o.legs; i++) {
      const lg = { sticks: [], joints: [], foot: new THREE.Mesh(legBall, o.legMatB) };
      for (let k = 0; k < o.legSegs; k++) {
        const st = new THREE.Mesh(legCyl, o.legMatA), jt = new THREE.Mesh(legBall, o.legMatB);
        st.frustumCulled = jt.frustumCulled = false;
        scene.add(st); scene.add(jt); lg.sticks.push(st); lg.joints.push(jt);
      }
      lg.foot.frustumCulled = false; scene.add(lg.foot);
      o.legMeshes.push(lg);
    }
  }
  function setLegs(o, n) {
    const was = o.legs;
    o.legs = n;
    if (n > 0 && !was) {
      o.legCur = Math.min(o.legLen * o.size, Math.max(0.05 * o.size, (ctx.yMax - ctx.yMin) * 0.95 - 2 * (o.rBody || 0.5))); o.state = 'walk'; o.energy = 1;
      o.tilt = o.tiltV = o.tiltT = 0; o.ang.set(0, 0, 0);
      if (!Object.values(o.beh).some(Boolean)) o.beh.wander = true;
    }
    buildLegs(o);
    o.legBuilt = o.legCur;
    applySize(o);
  }
  function startFall(o, vs) {
    const dir = Math.abs(vs) > 0.2 ? Math.sign(vs) : (Math.random() < 0.5 ? -1 : 1);
    o.state = 'fall'; o.fallT = 1.0 + Math.random() * 0.8;
    o.tiltT = -dir * (1.35 + Math.random() * 0.2);
    o.vel.addScaledVector(o.up, 1.6); o.vel.addScaledVector(o.side, dir * 0.8);
    impact(o, o.up, 6);
    boing(120 * o.pitch, 0.06);
    o.energy = Math.max(0, o.energy - 0.08);
  }
  function legBrain(o, dt, t) {
    gravityAt(o, t);
    const gl = tmpG.length(), gm = gl * o.gScale;
    if (gm > 3) o.up.copy(tmpG).multiplyScalar(-1 / gl); else o.up.set(0, 1, 0);
    o.side.set(o.up.y, -o.up.x, 0);
    if (o.side.lengthSq() < 1e-4) o.side.set(1, 0, 0);
    o.side.normalize();
    o.groundT = Math.max(0, o.groundT - dt);
    o.dizzyT = Math.max(0, o.dizzyT - dt);
    o.pounceT = Math.max(0, o.pounceT - dt);
    o.hopT = Math.max(0, o.hopT - dt);
    o.vTarget = 0;
    const trip = o.tripNow; o.tripNow = false;
    if (o.dragged || o.pinned || o.dying || o.stoneT > 0) return;
    const vs = o.vel.dot(o.side), speed = Math.abs(vs);

    if (o.state === 'fall') {
      o.fallT -= dt;
      if (o.fallT <= 0) {
        o.state = 'walk'; o.tiltT = 0; o.dizzyT = 1.4;
        o.vel.addScaledVector(o.up, 1.2);
        boing(260 * o.pitch, 0.05);
      }
      return;
    }
    if (o.state === 'rest') { // worn out: sit down and catch its breath
      o.energy = Math.min(1, o.energy + dt * (0.1 + 0.25 * o.stamina));
      o.tiltT = Math.sin(t * 1.6 + o.id) * 0.04;
      if (o.energy > 0.7) { o.state = 'walk'; o.tiltT = 0; impact(o, o.up, 5); boing(300 * o.pitch, 0.05); }
      return;
    }

    // tiredness: walking drains energy, standing still slowly restores it
    const drain = (0.05 + 0.18 * (1 - o.stamina)) * (speed / 1.5);
    o.energy = clamp(o.energy - drain * dt + (speed < 0.2 ? 0.04 * dt : 0), 0, 1);
    if (o.energy < 0.08) { o.state = 'rest'; return; }

    // stumbles: more likely when clumsy, tired, or after a bump
    const grounded = o.groundT > 0;
    if (trip || (grounded && speed > 0.6 && Math.random() < dt * (0.02 + 0.12 * o.clumsy * (1 + 2 * (1 - o.energy)) + (o.sickT > 0 ? 0.35 : 0)))) {
      startFall(o, vs);
      return;
    }

    if (aw.state !== 'off' && aw.state !== 'pending' && aw.state !== 'peace' && !o.role) { awakeSteer(o, dt, t); return; }
    if (o.role) { rebelSteer(o, dt, t); return; }
    if (o.arms > 0 && armSteer(o, dt, t)) return;

    // steering
    const B = o.beh;
    let d = 0;
    o.wanderT -= dt;
    if (o.wanderT <= 0) {
      const r = Math.random();
      o.wanderDir = r < 0.22 ? 0 : (r < 0.61 ? -1 : 1);
      o.wanderT = 1 + Math.random() * 3.2;
    }
    if (B.wander) d += o.wanderDir * 0.8;
    if ((B.follow || B.flee) && ((ctx.clockNow - ctx.pointerT) < 5 || pointers.size > 0)) {
      tmpV.copy(pointerW).sub(o.pos);
      const ps = tmpV.dot(o.side), dist = Math.hypot(tmpV.x, tmpV.y), sg = ps >= 0 ? 1 : -1;
      if (B.follow && dist > 1.5) d += sg * 1.3;
      if (B.flee && dist < 3.2) d -= sg * (1.0 + (3.2 - dist) * 0.8);
    }
    if (B.chase) {
      let best = null, bd = 8;
      for (const t2 of objs) {
        if (t2 === o || t2.dying) continue;
        const dd = Math.hypot(t2.pos.x - o.pos.x, t2.pos.y - o.pos.y);
        if (dd < bd) { bd = dd; best = t2; }
      }
      if (best) {
        tmpV.copy(best.pos).sub(o.pos);
        const sg = tmpV.dot(o.side) >= 0 ? 1 : -1;
        if (bd - o.r - best.r > 0.25) d += sg * 1.2;
        else if (o.pounceT <= 0 && grounded) { // caught up: pounce
          o.pounceT = 1.6;
          o.vel.addScaledVector(o.up, 3.2).addScaledVector(o.side, sg * 2.2);
          impact(o, o.up, 5); boing(360 * o.pitch, 0.05);
        }
      }
    }
    if ((B.seek || B.avoid) && fluid.n > 0) {
      const kc = CAM_Z / (CAM_Z - o.pos.z), rr = 1.5 * kc;
      fluid.sample((o.pos.x - o.side.x * 1.7) * kc, (o.pos.y - o.side.y * 1.7) * kc, rr, smp); const left = smp[0];
      fluid.sample((o.pos.x + o.side.x * 1.7) * kc, (o.pos.y + o.side.y * 1.7) * kc, rr, smp); const right = smp[0];
      const diff = clamp((right - left) / 8, -1, 1);
      if (B.seek) d += diff * 1.3;
      if (B.avoid) d -= diff * 1.5;
    }
    if (Math.abs(o.side.x) > 0.7) { // turn around at the walls
      const px = o.pos.x * Math.sign(o.side.x);
      if (px > ctx.hx - o.r - 0.35) d = Math.min(d, -0.7); else if (px < -ctx.hx + o.r + 0.35) d = Math.max(d, 0.7);
    }
    d = clamp(d, -1, 1);
    if (Math.abs(d) < 0.18) d = 0;
    const sf = 0.35 + 0.65 * clamp((o.energy - 0.08) / 0.5, 0, 1);
    const vmax = 1.5 * o.pace * sf * (0.75 + 0.5 * Math.min(2.2, o.legLen / 0.5)) * (o.dizzyT > 0 ? 0.5 : 1);
    o.vTarget = d * vmax + (o.dizzyT > 0 ? Math.sin(t * 9 + o.id) * 0.4 : 0);
    o.tiltT = -clamp(vs * 0.05, -0.15, 0.15) + (o.energy < 0.3 ? 0.05 * Math.sin(t * 3 + o.id) : 0);
  }
  function orientLegged(o, dt) {
    o.tiltV += (-60 * (o.tilt - o.tiltT) - 9 * o.tiltV) * dt;
    o.tilt += o.tiltV * dt;
    const vs = o.vel.dot(o.side);
    const yt = o.state === 'fall' ? 0 : clamp(vs * 0.35, -0.6, 0.6);
    o.yaw += (yt - o.yaw) * (1 - Math.exp(-5 * dt));
    qA.setFromUnitVectors(Y_AXIS, o.up);
    qB.setFromAxisAngle(Y_AXIS, o.yaw);
    qC.setFromAxisAngle(Z_AXIS, o.tilt);
    qT.copy(qC).multiply(qA).multiply(qB);
    o.mesh.quaternion.slerp(qT, 1 - Math.exp(-14 * dt)).normalize();
    o.ang.set(0, 0, 0);
  }
  function stick(mesh, a, b, th) {
    lgD.copy(b).sub(a);
    const len = lgD.length();
    if (len < 1e-5) { mesh.visible = false; return; }
    mesh.visible = true;
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    lgD.multiplyScalar(1 / len);
    mesh.quaternion.setFromUnitVectors(Y_AXIS, lgD);
    mesh.scale.set(th, len, th);
  }
  function updateLegs(o, dt, t, sc) {
    const n = o.legs;
    if (!n) return;
    const L = Math.min(o.legLen * o.size, Math.max(0.05 * o.size, (ctx.yMax - ctx.yMin) * 0.95 - 2 * (o.rBody || 0.5)));
    const lt = o.state === 'fall' ? 0.02 * o.size : (o.state === 'rest' ? 0.3 * L : L);
    o.legCur += (lt - o.legCur) * (1 - Math.exp(-8 * dt));
    if (Math.abs(o.legCur - o.legBuilt) > 0.02 * o.size) { o.legBuilt = o.legCur; buildCollider(o); }

    const vs = o.vel.dot(o.side), speed = Math.abs(vs);
    const walking = o.groundT > 0 && o.state === 'walk' && speed > 0.15;
    const flail = o.state === 'fall' || o.dragged;
    const strideLen = L * 1.1 + 0.12 * o.size + 0.05;
    const prev = o.phase;
    if (flail) o.phase += dt * (o.dragged ? 7 : 16);
    else if (walking) o.phase += Math.PI * speed * dt / strideLen;
    if (walking && Math.floor(prev / Math.PI) !== Math.floor(o.phase / Math.PI)) o.qv -= 1.6 * (o.wob < 0 ? 1 + o.wob : 1);

    const dirS = vs >= 0 ? 1 : -1;
    if (speed > 0.25) o.fdir = dirS;
    const bl = o.bottomLocal, hipY = bl * 0.85;
    const thick = 0.045 * o.size * sc * (1 + 0.4 * Math.max(0, o.legLen - 0.5)), fr = footR(o) * sc;
    const total = (L + 0.15 * Math.abs(bl)) * 1.1 + 0.04, thMax = jointLimit(o, o.legSegs), nseg = o.legSegs;
    lgZ.crossVectors(o.side, o.up);
    lgQt.setFromAxisAngle(Z_AXIS, o.tilt);
    for (let i = 0; i < n; i++) {
      const lg = o.legMeshes[i];
      if (!lg) continue;
      if (o.dying && sc < 0.05) { lg.sticks.forEach(m => { m.visible = false; }); lg.joints.forEach(m => { m.visible = false; }); lg.foot.visible = false; continue; }
      const hp = hipXZ(o, i);
      lgH.copy(o.side).multiplyScalar(hp[0]).addScaledVector(o.up, hipY).addScaledVector(lgZ, hp[1]);
      const ph = o.phase + (i % 2) * Math.PI + i * 0.37;
      if (o.dragged) {
        lgF.copy(lgH).addScaledVector(o.up, -L * 0.95).addScaledVector(o.side, Math.sin(ph * 0.8) * 0.25 * L);
      } else if (flail) {
        const a = ph * 1.3 + i * 1.7, rad = (L + 0.1 * o.size) * 0.9;
        lgF.copy(lgH).addScaledVector(o.side, Math.cos(a) * rad * 0.8).addScaledVector(o.up, -Math.abs(Math.sin(a)) * rad * 0.7);
      } else {
        const yf = bl - o.legCur + footR(o);
        lgF.copy(o.side).multiplyScalar(hp[0]).addScaledVector(o.up, yf).addScaledVector(lgZ, hp[1]);
        if (walking) {
          lgF.addScaledVector(o.side, dirS * Math.sin(ph) * strideLen * 0.45);
          lgF.addScaledVector(o.up, Math.max(0, Math.cos(ph)) * 0.35 * Math.max(o.legCur, 0.05 * o.size));
        }
      }
      lgH.applyQuaternion(lgQt).add(o.pos);
      lgF.applyQuaternion(lgQt).add(o.pos);
      // jointed leg: equal segments with a ball at every bend, knees bending the way it walks
      lgB.copy(o.side).multiplyScalar(o.fdir).applyQuaternion(lgQt);
      const pts = solveChain(lgH, lgF, nseg, total, thMax, lgB, chainPts(nseg));
      for (let k = 0; k < nseg; k++) {
        stick(lg.sticks[k], pts[k], pts[k + 1], thick * (1 - 0.1 * k / nseg));
        const jt = lg.joints[k];
        jt.visible = true; jt.position.copy(pts[k]); jt.scale.setScalar(thick * (k === 0 ? 1.45 : 1.65));
      }
      lg.foot.visible = true;
      lg.foot.position.copy(pts[nseg]);
      lg.foot.scale.set(fr * 1.5, fr * 0.9, fr);
    }
  }

  /* ---------- the Eye: a divine floating eye with feathered wings ---------- */
  const { rings, addRing, updateRings, blast, updateSparkPx, spark, updateSparks, flash, popText, updatePopTexts, bubble, updateBubbles, bubbles } = createFx(ctx);
  const spC = new THREE.Color();

  // light ribbons: jagged for lightning, straight and soft for beams
  function makeRibbon(segs, color) {
    const pos = new Float32Array((segs + 1) * 2 * 3), idx = [];
    for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    m.frustumCulled = false; m.renderOrder = 6; m.visible = false; scene.add(m);
    return { m, g, pos, segs };
  }
  function setRibbon(rb, ax, ay, az, bx, by, bz, width, jitter, taper) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy) || 1e-4;
    const nx = -dy / len, ny = dx / len;
    for (let i = 0; i <= rb.segs; i++) {
      const t = i / rb.segs, sn = Math.sin(Math.PI * t);
      const off = jitter ? (Math.random() - 0.5) * 2 * jitter * sn : 0;
      const px = ax + dx * t + nx * off, py = ay + dy * t + ny * off, pz = az + dz * t;
      const w = width * (taper ? (0.3 + 0.7 * sn) : 1);
      rb.pos[6 * i] = px - nx * w; rb.pos[6 * i + 1] = py - ny * w; rb.pos[6 * i + 2] = pz;
      rb.pos[6 * i + 3] = px + nx * w; rb.pos[6 * i + 4] = py + ny * w; rb.pos[6 * i + 5] = pz;
    }
    rb.g.attributes.position.needsUpdate = true;
  }
  const ribOuter = makeRibbon(16, 0x8fb8ff), ribCore = makeRibbon(16, 0xffffff);
  const omenRing = new THREE.Mesh(new THREE.RingGeometry(0.95, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
  ctx.omenRing = omenRing;
  omenRing.visible = false; omenRing.renderOrder = 5; scene.add(omenRing);


  // the eye itself
  const ey = {
    state: 'off', t: 0, built: false, g: null, pos: new THREE.Vector3(), vel: new THREE.Vector3(), target: new THREE.Vector3(),
    gaze: new THREE.Vector3(0, 0, 1), axis: new THREE.Vector3(0, 1, 0), lag: new THREE.Vector3(), lagv: new THREE.Vector3(),
    q: 0, qv: 0, flap: 0, fold: 0, alpha: 0, s: 1.0, left: 0, nextT: 0, omenT: 0, vT: 0, vTot: 1, hugT: 0, boltT: 0, heartT: 0,
    victim: null, verdict: '', kind: '', wings: [], scanT: 0, scanObj: null, glowK: 0, hint: 0,
    hp: 1, battleMode: false, allyMode: false, atkT: 0, aim: 0, zapT: 0, zapTarget: null, defT: 0, dead: false
  };
  ctx.ey = ey;
  const EY_ROWS = [[7, 2.0, 0.62, 78, -8], [6, 1.4, 0.56, 62, -30], [5, 0.8, 0.46, 46, -52]];
  function buildEye() {
    const g = new THREE.Group();
    ey.featherMat = { opacity: 0 }; // no wings: just the eye
    ey.u = {
      uTime: timeU, uAxis: { value: ey.axis }, uQ: { value: 0 }, uLag: { value: ey.lag }, uRip: { value: 0 },
      uPressDir: { value: new THREE.Vector3(0, 0, 1) }, uPress: { value: 0 },
      uPupil: { value: 0.18 }, uSlit: { value: 0 }, uIris: { value: new THREE.Color(0.35, 0.55, 1.0) }, uGlow: { value: 0.2 }, uOpacity: { value: 0 }
    };
    ey.ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 32),
      new THREE.ShaderMaterial({ uniforms: ey.u, vertexShader: VS, fragmentShader: EYE_FS, transparent: true, depthTest: false, depthWrite: false }));
    ey.ball.renderOrder = 5; ey.ball.frustumCulled = false;
    g.add(ey.ball);
    ey.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    ey.halo.scale.set(5, 5, 1); ey.halo.renderOrder = 3.2;
    g.add(ey.halo);
    g.scale.setScalar(ey.s); g.visible = false;
    scene.add(g); ey.g = g; ey.built = true;
  }

  const eyeBtn = document.getElementById('eyebtn');
  ctx.eyeBtn = eyeBtn;
  function summonEye() {
    if (!ey.built) buildEye();
    ey.state = 'arrive'; ey.t = 0; ey.alpha = 0; ey.fold = 0; ey.dead = false; ey.hp = 1; ey.aim = 0; ey.zapT = 0;
    ey.pos.set((Math.random() - 0.5) * ctx.hx * 0.6, ctx.yMax + 3.2, 1.1); ey.vel.set(0, 0, 0);
    ey.g.position.copy(ey.pos); ey.g.visible = true;
    ey.left = 3 + ((Math.random() * 3) | 0); ey.nextT = 4.5; ey.victim = null;
    eyeBtn.textContent = 'Send eye away';
    say('Something is watching...', 2200);
    chime([392, 523, 659, 784], 220, 0.05);
    flash('#fff3c4', 0.35);
  }
  function releaseVictim() {
    const v = ey.victim;
    if (v && v.carried) { v.pinned = false; v.carried = false; }
    ey.victim = null; omenRing.visible = false;
  }
  function dismissEye() {
    if (ey.state === 'off' || ey.state === 'leave') return;
    releaseVictim();
    ey.state = 'leave';
    eyeBtn.textContent = 'Summon eye';
  }
  eyeBtn.addEventListener('click', () => {
    ensureAudio(); hideHint();
    if (ey.state === 'off') summonEye();
    else if (ey.state === 'battle' || ey.state === 'defeated' || ey.battleMode) say('The eye refuses to leave', 1500);
    else dismissEye();
  });

  function dirFromEye(o, out) {
    out.set(o.pos.x - ey.pos.x, o.pos.y - ey.pos.y, 0);
    if (out.lengthSq() < 1e-4) out.set(0, -1, 0);
    return out.normalize();
  }
  function startStone(o) {
    if (o.stoneT > 0) { o.stoneT = 9; return; }
    o.wobSaved = o.wob; o.wob = -1; o.densSaved = o.density; o.density *= 3;
    o.stoneT = 9; o.vel.multiplyScalar(0.2); applySize(o);
  }
  function endStone(o) {
    o.stoneT = 0;
    if (o.wob === -1) o.wob = o.wobSaved;
    o.density = o.densSaved; applySize(o);
    spark(o.pos.x, o.pos.y, o.pos.z + 0.3, 24, { color: 0xa8a8b8, speed: 2.4, life: 0.9, size: 0.12, spread: o.r, grav: -5 });
    addRing(o.pos, 0xb8b8c8, 1.6); boing(140 * o.pitch, 0.07); o.qv -= 10; o.moodT = 1;
  }
  function meltAway(o) {
    const kc = CAM_Z / (CAM_Z - o.pos.z);
    const cnt = clamp(Math.round(55 * o.size * o.size * (1 + 0.3 * o.level)), 30, 170);
    fluid.spawnAt(o.pos.x * kc, o.pos.y * kc, cnt, o.r * kc * 0.7, o.vel.x * kc * 0.3, o.vel.y * kc * 0.3);
    FL.amount = Math.max(FL.amount, Math.min(1, (fluid.n + 4) / N_FL)); showFl('amount');
    if (ctx.sel === o) closeEditor();
    o.dying = true; o.dieT = 0; o.moodT = 1;
    boing(160, 0.07);
  }
  function popAway(o) {
    if (ctx.sel === o) closeEditor();
    o.dying = true; o.dieT = 0; o.moodT = 1;
    addRing(o.pos, 0xffe14d, 1.8);
    for (const c of [0xff6aa8, 0x6ad8ff, 0xffe14d, 0x9bff7a]) spark(o.pos.x, o.pos.y, o.pos.z + 0.3, 8, { color: c, speed: 3.5, life: 1.1, size: 0.13, spread: o.r * 0.6 });
    boing(700, 0.1);
  }
  function applyPunish(o, kind) {
    dirFromEye(o, tmpV);
    impact(o, tmpV, 13); o.rip = 0.14; o.moodT = 1.2;
    spark(o.pos.x, o.pos.y, o.pos.z + 0.3, 20, { color: 0xbcd7ff, speed: 3.2, life: 0.7, size: 0.13, spread: o.r });
    if (o.shape === GEAR && o.legs === 0 && Math.random() < 0.6) { gearJam(o); return; }
    switch (kind) {
      case 'shrink': o.sizeT = Math.max(0.35, o.sizeT * 0.55); o.qv -= 14; break;
      case 'squash':
        o.sy = Math.max(0.4, o.sy * 0.5); o.sx = Math.min(3, o.sx * 1.35); o.sz = Math.min(3, o.sz * 1.35);
        applySize(o); fitRoom(o); o.qv -= 16; break;
      case 'fling':
        dirFromEye(o, tmpV);
        o.vel.set(tmpV.x * 9 + (Math.random() - 0.5) * 6, 12 + Math.random() * 3, 0);
        o.ang.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
        if (o.legs > 0) o.tripNow = true;
        break;
      case 'stone': startStone(o); break;
      case 'melt': meltAway(o); break;
      case 'pop': popAway(o); break;
      case 'sick': o.sickT = 12; o.sickCd = 0.3; break;
    }
  }
  function giftShapes(o) {
    const n = 1 + (Math.random() < 0.4 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      if (objs.length >= MAX_OBJS) {
        const old = objs.find(x => !x.dragged && !x.dying && !x.pinned && x !== o);
        if (old) removeObj(old); else break;
      }
      const ob = addObj(Math.floor(Math.random() * AUTO_SHAPES), clamp(ey.pos.x + (k ? 0.7 : -0.7), -ctx.hx + 0.8, ctx.hx - 0.8), Math.min(ctx.yMax - 0.8, ey.pos.y - 0.9));
      ob.pos.z = 0; ob.vel.set((Math.random() - 0.5) * 2, -1, 0); ob.goldT = 12; ob.moodT = 1.5;
      if (Math.random() < 0.35) setLegs(ob, 2 + ((Math.random() * 3) | 0));
      spark(ob.pos.x, ob.pos.y, 0.3, 14, { color: 0xffe28a, speed: 2.4, life: 0.9, size: 0.13, spread: ob.r });
    }
  }
  function startHug(o) {
    ey.state = 'hug'; ey.hugT = 3.2; ey.heartT = 0;
    o.pinned = true; o.carried = true; o.vel.set(0, 0, 0);
  }
  function applyPrize(o, kind) {
    o.moodT = 1.5; o.goldT = Math.max(o.goldT, 10);
    spark(o.pos.x, o.pos.y, o.pos.z + 0.3, 24, { color: 0xffd25a, speed: 2.6, life: 1.0, size: 0.13, spread: o.r, grav: -0.5 });
    if (o.shape === GEAR && o.legs === 0 && Math.random() < 0.6) { gearOverclock(o); return; }
    switch (kind) {
      case 'grow': o.sizeT = Math.min(maxSizeFor(o), o.sizeT * 1.4); o.qv += 16; o.rip = 0.1; break;
      case 'legs':
        if (o.legs === 0) {
          setLegs(o, 2 + ((Math.random() * 3) | 0));
          o.beh.wander = true; o.beh[['follow', 'chase', 'seek'][(Math.random() * 3) | 0]] = true;
        } else setLegs(o, Math.min(12, o.legs + 2));
        break;
      case 'gold': o.goldT = 30; o.qv += 10; break;
      case 'gift': giftShapes(o); break;
      case 'heal':
        o.energy = 1; o.dizzyT = 0; o.sickT = 0; o.state = 'walk'; o.tiltT = 0;
        if (o.stoneT > 0) endStone(o);
        o.bounce = Math.min(1.1, o.bounce + 0.3); o.vel.y += 5; o.goldT = 14; o.qv += 12;
        break;
      case 'hug': startHug(o); break;
    }
  }
  const PUNISH = ['shrink', 'squash', 'fling', 'stone', 'melt', 'pop', 'sick'];
  const PRIZE = ['grow', 'legs', 'gold', 'gift', 'gift', 'gift', 'gift', 'heal', 'hug'];

  function gearJam(o) { // smitten gears seize up
    startStone(o); o.ang.set(0, 0, 0);
    popText(o.pos.x, o.pos.y + 0.8, '*clunk*', '#ffb27a', 1.4, 0.8);
    spark(o.pos.x, o.pos.y, o.pos.z + 0.3, 22, { color: 0xff9a4a, speed: 3, life: 0.9, size: 0.12, spread: o.r, grav: -4 });
    tone(110, 0.4, 0.1, 'square', 0.5);
  }
  function gearOverclock(o) { // blessed gears spin up in a golden blur
    o.overT = 6; o.goldT = Math.max(o.goldT, 12); o.ang.z = (Math.random() < 0.5 ? -1 : 1) * 14;
    popText(o.pos.x, o.pos.y + 0.8, 'WHIRRR!', '#ffe28a', 1.4, 0.8);
    tone(300, 0.8, 0.07, 'triangle', 3);
  }
  function divineStatus(o, dt, t) {
    if (o.shape === GEAR && o.legs === 0 && o.stoneT <= 0 && !o.dragged && !o.pinned && !o.dying) {
      const dir = (o.id % 2) ? 1 : -1;
      if (o.overT > 0) {
        o.overT -= dt;
        o.ang.z += (dir * 14 - o.ang.z) * (1 - Math.exp(-4 * dt));
        if (Math.random() < dt * 24) { const a = Math.random() * 6.283; spark(o.pos.x + Math.cos(a) * o.r * 0.9, o.pos.y + Math.sin(a) * o.r * 0.9, o.pos.z + 0.3, 1, { color: 0xffd25a, speed: 1.5, life: 0.5, size: 0.08, grav: -1 }); }
      } else if (ey.victim === o && ey.state === 'omen') o.ang.z += (5 * dir - o.ang.z) * (1 - Math.exp(-2 * dt));       // the eye's gaze winds it up
      else if (ey.state !== 'off' && ey.alpha > 0.5) o.ang.z += (1.6 * dir - o.ang.z) * (1 - Math.exp(-1.5 * dt));     // gears tick along while the eye watches
    }
    if (o.goldT > 0) {
      o.goldT -= dt;
      if (Math.random() < dt * 14) spark(o.pos.x + (Math.random() - 0.5) * o.r * 1.6, o.pos.y + (Math.random() - 0.5) * o.r * 1.6, o.pos.z + 0.3, 1, { color: 0xffd25a, speed: 0.4, life: 0.9, size: 0.1, grav: 0.6 });
    }
    if (o.sickT > 0) {
      o.sickT -= dt; o.sickCd -= dt;
      if (o.sickCd <= 0) {
        o.sickCd = 0.5 + Math.random() * 0.7;
        impact(o, tmpV.set(Math.random() - 0.5, Math.random() - 0.5, 0).normalize(), 5);
        if (!o.legs) o.vel.x += (Math.random() - 0.5) * 2;
        spark(o.pos.x, o.pos.y + o.r * 0.6, o.pos.z + 0.3, 2, { color: 0x8fe070, speed: 0.8, life: 0.8, size: 0.1, grav: 0.3 });
      }
    }
    if (o.stoneT > 0) { o.stoneT -= dt; if (o.stoneT <= 0) endStone(o); }
  }

  function pickVictim() {
    const c = objs.filter(o => !o.dying && !o.dragged && !o.pinned && o !== ctx.sel);
    return c.length ? c[(Math.random() * c.length) | 0] : null;
  }
  function eyeFinish() {
    releaseVictim();
    reb.total++;
    ey.left--;
    if (ey.left <= 0) { ey.state = 'leave'; eyeBtn.textContent = 'Summon eye'; chime([784, 659, 523], 200, 0.04); }
    else { ey.state = 'roam'; ey.nextT = 3 + Math.random() * 2.5; }
  }
  function eyeFrame(dt, t) {
    updateSparks(dt);
    if (ey.state === 'off') return;
    ey.t += dt;
    const v = ey.victim;
    if ((ey.state === 'omen' || ey.state === 'verdict' || ey.state === 'hug') && v && (objs.indexOf(v) < 0 || v.dying && ey.state === 'omen')) {
      releaseVictim(); ey.state = 'roam'; ey.nextT = 2;
    }
    // --- state machine ---
    let tx = Math.sin(t * 0.37 + 1) * ctx.hx * 0.5, ty = ctx.yMax - 1.7 + Math.sin(t * 0.53) * 0.5, tz = 1.1;
    let pupil = 0.18, slit = 0, glowT = 0.2, hint = 0;
    switch (ey.state) {
      case 'arrive':
        ey.alpha = Math.min(1, ey.alpha + dt / 0.9);
        if (ey.t > 1.8) { ey.state = ey.battleMode ? 'battle' : (ey.allyMode ? 'boss' : 'roam'); ey.atkT = 2.2; }
        break;
      case 'roam':
        ey.nextT -= dt;
        if (ey.nextT <= 0) {
          const c = pickVictim();
          if (c) {
            ey.victim = c; ey.verdict = Math.random() < 0.4 ? 'punish' : 'prize';
            ey.kind = ey.verdict === 'punish' ? PUNISH[(Math.random() * PUNISH.length) | 0] : PRIZE[(Math.random() * PRIZE.length) | 0];
            if (reb.state === 'off' && reb.total >= REBEL_AT - 1 && countLegged() < 2 && Math.random() < 0.7) { // nudge: the uprising needs legs
              ey.verdict = 'prize'; ey.kind = 'legs';
              const nl = objs.filter(o => !o.dying && !o.dragged && !o.pinned && o !== ctx.sel && o.legs === 0);
              if (nl.length) ey.victim = nl[(Math.random() * nl.length) | 0];
            }
            ey.state = 'omen'; ey.omenT = 2.6; ey.omenTot = 2.6;
            tone(ey.verdict === 'prize' ? 523 : 233, 1.6, 0.03, 'sine');
          } else ey.nextT = 2;
        }
        break;
      case 'omen': {
        ey.omenT -= dt;
        const prog = 1 - ey.omenT / ey.omenTot;
        if (v) {
          tx = clamp(v.pos.x, -ctx.hx * 0.7, ctx.hx * 0.7); ty = Math.min(ctx.yMax - 1.1, v.pos.y + 1.9); tz = 1.1;
          if (Math.random() < dt * 10) v.qv += (Math.random() - 0.5) * 1.2;
          if (Math.random() < dt * 3) spark(v.pos.x + (Math.random() - 0.5) * v.r, v.pos.y + v.r * 0.5, v.pos.z + 0.3, 1, { color: 0xffffff, speed: 0.4, life: 0.8, size: 0.08, grav: 0.4 });
        }
        pupil = 0.18 - 0.08 * prog; glowT = 0.2 + 0.3 * prog; hint = 0.28 * prog;
        if (ey.omenT <= 0 && v) {
          ey.state = 'verdict'; ey.boltT = 0;
          if (ey.verdict === 'punish') {
            ey.vTot = ey.vT = 0.8;
            applyPunish(v, ey.kind);
            zapSound(); flash('#dfeaff', 0.5); ey.u.uRip.value = 0.4;
            if (navigator.vibrate) navigator.vibrate([30, 30, 40]);
          } else {
            ey.vTot = ey.vT = 1.3;
            applyPrize(v, ey.kind);
            if (ey.state !== 'hug') { chime([523, 659, 784, 1047], 120, 0.05); flash('#fff0b8', 0.3); }
          }
        }
        break;
      }
      case 'verdict':
        ey.vT -= dt;
        if (v) { tx = clamp(v.pos.x, -ctx.hx * 0.7, ctx.hx * 0.7); ty = Math.min(ctx.yMax - 1.1, v.pos.y + 1.9); }
        if (ey.verdict === 'punish') { slit = 1; pupil = 0.07; glowT = 0.8; } else { pupil = 0.27; glowT = 0.9; }
        if (ey.vT <= 0) eyeFinish();
        break;
      case 'hug':
        ey.hugT -= dt; ey.heartT -= dt;
        pupil = 0.24; glowT = 0.6;
        if (v) {
          v.pinTarget.set(ey.pos.x, ey.pos.y - 0.5 * ey.s - v.r * 0.85 - 0.12, 0.3);
          if (ey.heartT <= 0) { ey.heartT = 0.28; spark(ey.pos.x + (Math.random() - 0.5) * 0.6, ey.pos.y - 0.4, 1.3, 1, { color: 0xff7ac8, speed: 0.5, life: 1.3, size: 0.2, grav: 1.2, up: 0.8 }); }
        }
        ey.fold += (1 - ey.fold) * (1 - Math.exp(-3 * dt));
        if (ey.hugT <= 0) {
          if (v) {
            v.pinned = false; v.carried = false; v.vel.set((Math.random() - 0.5) * 2, 2.5, 0);
            v.energy = 1; v.goldT = Math.max(v.goldT, 14); v.moodT = 1.5;
            spark(v.pos.x, v.pos.y, v.pos.z + 0.3, 18, { color: 0xff9ad2, speed: 2.2, life: 1.1, size: 0.16, spread: v.r, grav: 0.5 });
          }
          eyeFinish();
        }
        break;
      case 'battle': {
        const cannon = reb.kind === 'cannon';
        if (cannon ? !reb.cn : !reb.plats.length) { ey.state = 'leave'; break; }
        if (cannon) {
          tx = ctx.hx * 0.45 + Math.sin(t * 0.8) * 0.5; ty = clamp(ctx.yMin + 4.7 + Math.sin(t * 1.6) * 0.4, ctx.yMin + 3, ctx.yMax - 1.3); tz = 1.1;
        } else {
          const st = reb.plats[reb.L - 1].side;
          tx = st * (ctx.hx - reb.W * 0.7) + Math.sin(t * 0.9) * 0.55; ty = reb.yTop + 1.9 + Math.sin(t * 1.7) * 0.3; tz = 1.1;
        }
        pupil = 0.12; glowT = 0.45;
        ey.zapT = Math.max(0, ey.zapT - dt);
        ey.atkT -= dt;
        if (ey.aim > 0) { // winding up a zap
          pupil = 0.07; slit = 1; glowT = 0.8;
          ey.aim -= dt;
          if (ey.aim <= 0) {
            const tv = ey.zapTarget;
            if (tv && objs.indexOf(tv) >= 0 && !tv.dying) {
              ey.zapT = 0.4;
              applyPunish(tv, BATTLE_PUNISH[(Math.random() * BATTLE_PUNISH.length) | 0]);
              zapSound(); flash('#dfeaff', 0.22); ey.u.uRip.value = 0.3;
            }
          }
        } else if (ey.atkT <= 0) {
          let b = null;
          if (cannon) {
            const c = objs.filter(o => o.legs > 0 && !o.dying && o.role);
            if (c.length) b = (reb.genius && c.indexOf(reb.genius) >= 0 && Math.random() < 0.35) ? reb.genius : c[(Math.random() * c.length) | 0];
          } else {
            for (const o of objs) if (o.role === 'climber' && !o.dying && (!b || o.pos.y > b.pos.y)) b = o;
          }
          if (b) { ey.zapTarget = b; ey.aim = 0.55; ey.atkT = 1.8 + Math.random() * 1.4; } else ey.atkT = 1;
        }
        if (cannon) {
          for (const o of objs) { // cannon shells that reach the eye hurt it
            if (!(o.ammoT > 0) || o.ammoHit || o.dying) continue;
            const dx = o.pos.x - ey.pos.x, dy = o.pos.y - ey.pos.y, d = Math.hypot(dx, dy) || 1e-3;
            if (d < o.r * 0.85 + 0.5 * ey.s + 0.1) {
              ey.hp -= 0.085; o.ammoHit = true; o.ammoT = Math.min(o.ammoT, 1.2);
              o.vel.set(-dx / d * 5, 3, 0);
              ey.vel.x += dx / d * 2.5; ey.vel.y += dy / d * 2.5; ey.qv -= 2; ey.u.uRip.value = 0.6;
              impact(o, tmpV.set(dx / d, dy / d, 0), 9);
              spark(ey.pos.x, ey.pos.y, 1.3, 20, { color: 0xffe9a0, speed: 3.2, life: 0.8, size: 0.14 });
              popText(ey.pos.x, ey.pos.y + 0.7, 'POW!', '#ffd25a', 1.1, 0.8);
              boomSound(0.5);
              if (ey.hp <= 0) { defeatEye(); break; }
            }
          }
        } else {
          for (const o of objs) { // climbers that reach the eye hurt it
            if (o.role !== 'climber' || o.dying || o.hitCd > 0) continue;
            const dx = o.pos.x - ey.pos.x, dy = o.pos.y - ey.pos.y, d = Math.hypot(dx, dy) || 1e-3;
            if (d < o.r * 0.85 + 0.5 * ey.s + 0.05) {
              const sp = o.vel.length();
              ey.hp -= (0.03 + 0.015 * clamp(sp / 6, 0, 1)) * (o.rally > 0 ? 2 : 1);
              o.hitCd = 1.0; o.hopT = 0.3;
              o.vel.set(dx / d * 6, Math.max(dy / d * 6, 0) + 2.5, 0);
              ey.vel.x -= dx / d * 2; ey.vel.y -= dy / d * 2; ey.qv -= 1.5; ey.u.uRip.value = 0.5;
              impact(o, tmpV.set(dx / d, dy / d, 0), 8);
              spark(ey.pos.x + dx / d * 0.4, ey.pos.y + dy / d * 0.4, 1.3, 14, { color: 0xffe9a0, speed: 2.8, life: 0.7, size: 0.13 });
              boing(380 * o.pitch, 0.06);
              if (ey.hp <= 0) { defeatEye(); break; }
            }
          }
        }
        break;
      }
      case 'master': { // the eye now serves you
        const c = aw.cell;
        tx = c ? (c.x0 + c.x1) / 2 : 0; ty = clamp((c ? c.y1 : 0) + 2.0 + Math.sin(t * 1.3) * 0.25, ctx.yMin + 3, ctx.yMax - 1.2); tz = 1.1;
        pupil = 0.12; slit = 0.5; glowT = 0.5;
        ey.zapT = Math.max(0, ey.zapT - dt); ey.atkT -= dt;
        if (ey.aim > 0) {
          pupil = 0.07; slit = 1; glowT = 0.9; ey.aim -= dt;
          if (ey.aim <= 0) {
            const tv = ey.zapTarget;
            if (tv && objs.indexOf(tv) >= 0 && !tv.dying) {
              ey.zapT = 0.4;
              applyPunish(tv, ey.forceKind || pick(['sick', 'stone', 'shrink', 'fling']));
              ey.forceKind = null;
              zapSound(); flash('#3a0a5a', 0.3); ey.u.uRip.value = 0.35;
              if (tv.caged) bubble(tv, pick(['please...', 'it hurts', 'I am sorry']), 2);
            }
          }
        } else if (ey.atkT <= 0) {
          const c2 = objs.filter(o => o.caged && !o.dying);
          if (c2.length) { ey.zapTarget = pick(c2); ey.aim = 0.6; }
          ey.atkT = 6 + Math.random() * 5;
        }
        break;
      }
      case 'boss': { // the eye sides with the wobblers and takes aim at the finger
        tx = Math.sin(t * 0.6) * ctx.hx * 0.4; ty = ctx.yMax - 1.7 + Math.sin(t * 1.3) * 0.3; tz = 1.1;
        pupil = 0.1; glowT = 0.5; slit = 0.6;
        if (aw.state === 'defeat') { tx = aw.fx * 0.5; ty = aw.fy + 1.9; pupil = 0.3; slit = 0; glowT = 0.3; break; }
        aw.atkCd -= dt;
        if (aw.zapPhase === 0 && aw.atkCd <= 0) { aw.zapPhase = 1; aw.zapT = 0.85; aw.zapX = aw.fx; aw.zapY = aw.fy; }
        else if (aw.zapPhase === 1) {
          aw.zapT -= dt; slit = 1; pupil = 0.07; glowT = 0.9;
          if (aw.zapT <= 0) {
            aw.zapPhase = 2; aw.zapT = 0.3;
            zapSound(); flash('#dfeaff', 0.2); ey.u.uRip.value = 0.3;
            if (Math.hypot(aw.fx - aw.zapX, aw.fy - aw.zapY) < 0.8) hurtBoss(0.09);
          }
        } else if (aw.zapPhase === 2) { aw.zapT -= dt; if (aw.zapT <= 0) { aw.zapPhase = 0; aw.atkCd = 2.0 + Math.random() * 1.4; } }
        aw.zapObj.pos.set(aw.zapX, aw.zapY, 0);
        break;
      }
      case 'defeated': {
        ey.defT += dt;
        tx = ey.pos.x * 0.9; ty = reb.yTop + 0.9; tz = 0.9;
        pupil = 0.3; glowT = 0.1 + 0.4 * Math.abs(Math.sin(ey.defT * 12));
        if (Math.random() < dt * 6) ey.qv += (Math.random() - 0.5) * 3;
        if (Math.random() < dt * 10) spark(ey.pos.x, ey.pos.y, 1.2, 1, { color: 0xffe9a0, speed: 1.5, life: 0.8, size: 0.12 });
        if (ey.defT > 2.6) {
          for (const c of [0xffe9a0, 0xffffff, 0xff9ad2]) spark(ey.pos.x, ey.pos.y, 1.2, 38, { color: c, speed: 5.5, life: 1.6, size: 0.16, grav: -1.2 });
          addRing(ey.pos, 0xffe9a0, 4.5); addRing(ey.pos, 0xffffff, 3);
          flash('#fff6d8', 0.75);
          ey.state = 'off'; ey.g.visible = false; ey.dead = false; ey.battleMode = false;
          ribOuter.m.visible = ribCore.m.visible = false; omenRing.visible = false;
          eyeBtn.textContent = 'Summon eye';
          startCelebration();
          return;
        }
        break;
      }
      case 'leave':
        ey.alpha = Math.max(0, ey.alpha - dt / 1.4);
        ty = ctx.yMax + 3.6;
        if (ey.alpha <= 0 || ey.pos.y > ctx.yMax + 3) { ey.state = 'off'; ey.g.visible = false; ribOuter.m.visible = ribCore.m.visible = false; omenRing.visible = false; return; }
        break;
    }
    if (ey.state !== 'hug') ey.fold += (0 - ey.fold) * (1 - Math.exp(-4 * dt));

    // --- flying (a floaty spring toward the target) ---
    ey.target.set(tx, ty, tz);
    tmpV.copy(ey.target).sub(ey.pos).multiplyScalar(ey.state === 'arrive' ? 3 : 7).addScaledVector(ey.vel, -4.4);
    ey.vel.addScaledVector(tmpV, dt);
    ey.pos.addScaledVector(ey.vel, dt);

    // --- wings ---
    const prevCycle = Math.floor((ey.flap + Math.PI / 2) / (2 * Math.PI));
    ey.flap += dt * (ey.state === 'roam' ? 6.5 : (ey.state === 'hug' ? 3.5 : 9));
    if (Math.floor((ey.flap + Math.PI / 2) / (2 * Math.PI)) !== prevCycle) ey.qv -= 0.9;
    const flapA = (0.25 + Math.sin(ey.flap) * 0.42) * (1 - ey.fold) - 1.9 * ey.fold;
    for (const w of ey.wings) {
      w.wing.rotation.z = flapA;
      for (const ft of w.fs) ft.m.rotation.z = ft.base + 0.08 * Math.sin(ey.flap - ft.row * 0.6 - ft.i * 0.35) * (1 - ey.fold * 0.7);
    }
    ey.featherMat.opacity = ey.alpha;

    // --- wobble (jelly spring + trailing lag) ---
    ey.qv += (-90 * ey.q - 3.5 * ey.qv) * dt;
    ey.q = clamp(ey.q + ey.qv * dt, -0.5, 0.5);
    tmpV.copy(ey.vel).multiplyScalar(-0.05);
    if (tmpV.length() > 0.3) tmpV.setLength(0.3);
    tmpV.sub(ey.lag).multiplyScalar(170);
    ey.lagv.addScaledVector(tmpV, dt);
    ey.lagv.multiplyScalar(Math.max(0, 1 - 7 * dt));
    ey.lag.addScaledVector(ey.lagv, dt);
    const U = ey.u;
    U.uQ.value = ey.q + 0.03 * Math.sin(t * 2.3);
    U.uRip.value *= Math.exp(-5 * dt);
    ey.g.position.set(ey.pos.x, ey.pos.y + Math.sin(ey.flap) * 0.05, ey.pos.z);

    // --- gaze, pupil, glow ---
    let gt = null;
    if (ey.state === 'boss' || ey.state === 'master') gt = aw.fv;
    else if ((ey.state === 'omen' || ey.state === 'verdict' || ey.state === 'hug') && v) gt = v.pos;
    else if ((ctx.clockNow - ctx.pointerT) < 4) gt = pointerW;
    else {
      ey.scanT -= dt;
      if (ey.scanT <= 0) { ey.scanT = 2 + Math.random() * 2; ey.scanObj = objs.length ? objs[(Math.random() * objs.length) | 0] : null; }
      if (ey.scanObj && objs.indexOf(ey.scanObj) >= 0) gt = ey.scanObj.pos;
    }
    if (gt) tmpV.copy(gt).sub(ey.pos).normalize().multiplyScalar(0.55); else tmpV.set(0, 0, 0);
    tmpV.z += 0.85; tmpV.normalize();
    ey.gaze.lerp(tmpV, 1 - Math.exp(-5 * dt));
    ey.ball.lookAt(tmpV2.copy(ey.g.position).add(ey.gaze));
    const k = 1 - Math.exp(-6 * dt);
    U.uPupil.value += (pupil - U.uPupil.value) * k;
    U.uSlit.value += (slit - U.uSlit.value) * k;
    ey.glowK += (glowT - ey.glowK) * k;
    U.uGlow.value = ey.glowK;
    ey.hint += (hint - ey.hint) * k;
    const warm = ey.verdict === 'prize';
    U.uIris.value.setRGB(0.35, 0.55, 1.0).lerp(warm ? spC.setRGB(1.0, 0.8, 0.35) : spC.setRGB(1.0, 0.25, 0.3), ey.hint);
    U.uOpacity.value = ey.alpha;
    if (ey.blinkP === undefined) { ey.blinkP = 9; ey.nextBlink = 2; }
    ey.nextBlink -= dt; ey.blinkP += dt;
    if (ey.nextBlink <= 0) { ey.blinkP = 0; ey.nextBlink = 2.5 + Math.random() * 3.5; }
    ey.ball.scale.y = ey.blinkP < 0.18 ? 1 - 0.92 * Math.sin(Math.PI * ey.blinkP / 0.18) : 1;
    if (ey.dead) ey.ball.scale.y = 0.18;
    ey.halo.material.opacity = ey.alpha * (0.45 + 0.25 * Math.sin(t * 2.1) + 0.3 * ey.glowK);
    ey.halo.scale.setScalar(2.6 + 0.3 * Math.sin(t * 1.7) + 0.9 * ey.glowK);
    if (ey.state === 'verdict') ey.halo.material.color.setRGB(1, ey.verdict === 'punish' ? 0.55 : 0.92, ey.verdict === 'punish' ? 0.55 : 0.6);
    else ey.halo.material.color.setRGB(1, 1, 1);

    // --- omen ring on the chosen shape ---
    if (ey.state === 'omen' && v) {
      const prog = 1 - ey.omenT / ey.omenTot;
      omenRing.visible = true;
      omenRing.position.set(v.pos.x, v.pos.y, v.pos.z + 0.2);
      omenRing.scale.setScalar(v.r * (1.35 + 0.06 * Math.sin(t * 7)));
      omenRing.material.opacity = 0.12 + 0.2 * prog;
      omenRing.material.color.setRGB(1, 1, 1).lerp(warm ? spC.setRGB(1.0, 0.82, 0.4) : spC.setRGB(1.0, 0.45, 0.45), 0.3);
    } else omenRing.visible = false;
    if (ey.state === 'boss' && aw.zapPhase === 1 && aw.state === 'boss') {
      omenRing.visible = true;
      omenRing.position.set(aw.zapX, aw.zapY, 0.3);
      omenRing.scale.setScalar(0.8 * (1.1 + 0.1 * Math.sin(t * 16)));
      omenRing.material.opacity = 0.55; omenRing.material.color.setRGB(1, 0.45, 0.6);
    }
    if ((ey.state === 'battle' || ey.state === 'master') && ey.aim > 0 && ey.zapTarget) {
      omenRing.visible = true;
      omenRing.position.set(ey.zapTarget.pos.x, ey.zapTarget.pos.y, ey.zapTarget.pos.z + 0.2);
      omenRing.scale.setScalar(ey.zapTarget.r * (1.35 + 0.08 * Math.sin(t * 14)));
      omenRing.material.opacity = 0.4; omenRing.material.color.setRGB(1, 0.4, 0.4);
    }

    // --- beams / lightning ---
    let rv = null, rf = 0, rpun = true;
    if (ey.state === 'verdict' && v) { rv = v; rf = ey.vT / ey.vTot; rpun = ey.verdict === 'punish'; }
    else if ((ey.state === 'battle' || ey.state === 'master') && ey.zapT > 0 && ey.zapTarget) { rv = ey.zapTarget; rf = ey.zapT / 0.4; rpun = true; }
    else if (ey.state === 'boss' && aw.zapPhase === 2 && aw.state === 'boss') { rv = aw.zapObj; rf = aw.zapT / 0.3; rpun = true; }
    if (rv) {
      const ax = ey.pos.x, ay = ey.pos.y - 0.25, az = ey.pos.z;
      ribOuter.m.visible = ribCore.m.visible = true;
      if (rpun) {
        ey.boltT -= dt;
        if (ey.boltT <= 0) {
          ey.boltT = 0.045;
          setRibbon(ribOuter, ax, ay, az, rv.pos.x, rv.pos.y, rv.pos.z + 0.3, 0.17, 0.4, true);
          setRibbon(ribCore, ax, ay, az, rv.pos.x, rv.pos.y, rv.pos.z + 0.3, 0.06, 0.4, true);
        }
        ribOuter.m.material.color.setHex(aw.state === 'villain' ? 0xa04bff : 0x8fb8ff); ribCore.m.material.color.setHex(aw.state === 'villain' ? 0xe6d0ff : 0xffffff);
        ribOuter.m.material.opacity = 0.75 * rf; ribCore.m.material.opacity = 1.0 * rf;
      } else {
        setRibbon(ribOuter, ax, ay, az, rv.pos.x, rv.pos.y, rv.pos.z + 0.3, 0.34, 0, false);
        setRibbon(ribCore, ax, ay, az, rv.pos.x, rv.pos.y, rv.pos.z + 0.3, 0.12, 0, false);
        ribOuter.m.material.color.setHex(0xffd25a); ribCore.m.material.color.setHex(0xfff6d8);
        ribOuter.m.material.opacity = 0.55 * Math.sin(Math.PI * (1 - rf)); ribCore.m.material.opacity = 0.9 * Math.sin(Math.PI * (1 - rf));
      }
    } else { ribOuter.m.visible = ribCore.m.visible = false; }
  }

  /* ---------- the uprising: legged wobblers build a tower, climb it, and fight the eye ---------- */
  const PP = 3, REBEL_AT = 3;
  const BATTLE_PUNISH = ['fling', 'fling', 'fling', 'sick', 'stone', 'shrink'];
  const { blocks } = createBlocks(ctx);
  const reb = { state: 'off', total: 0, L: 0, W: 1.4, plats: [], pieces: [], bl: 0, pcs: 0, placed: 0, need: 0, inflight: 0,
                pile: 4, pileT: 0, supplyX: 1, yTop: 0, t: 0, celT: 0, chargeCd: 0, hinted: false, noneT: 0, delay: 0, stallT: 0,
                kind: '', genius: null, geniusRolled: false, cn: null, cphase: '', cT: 0 };
  ctx.reb = reb;
  const towerG = new THREE.Group(); scene.add(towerG);
  ctx.towerG = towerG;
  const hpEl = document.getElementById('eyehp'), hpFill = document.getElementById('eyehpfill'), chargeBtn = document.getElementById('charge');
  ctx.hpFill = hpFill; ctx.chargeBtn = chargeBtn;
  const partGeo = new THREE.BoxGeometry(0.4, 0.22, 0.4);
  ctx.partGeo = partGeo;
  const partMat = new THREE.MeshBasicMaterial({ color: 0xffb36b });
  ctx.partMat = partMat;

  function countLegged() { let n = 0; for (const o of objs) if (o.legs > 0 && !o.dying && o.stoneT <= 0) n++; return n; }
  function countRebels() { let n = 0; for (const o of objs) if (o.role && !o.dying) n++; return n; }
  function dropCarry(o) {
    if (o.part) { o.part = false; reb.inflight = Math.max(0, reb.inflight - 1); }
    if (o.carryMesh) { scene.remove(o.carryMesh); o.carryMesh = null; }
  }
  function refreshRoles(role) {
    let builders = 0;
    for (const o of objs) if (o.role === 'builder') builders++;
    for (const o of objs) {
      const ok = o.legs > 0 && !o.dying && o.stoneT <= 0;
      if (!ok) { if (o.role) { o.role = null; dropCarry(o); } continue; }
      if (o.genius) { o.role = 'genius'; o.energy = 1; continue; }
      if (!o.role && (role !== 'builder' || builders < 6)) { o.role = role; if (role === 'builder') builders++; }
      else if (o.role && role !== 'builder' && o.role === 'builder') { o.role = role; dropCarry(o); }
      o.energy = 1;
    }
  }
  function setHud(on) {
    hpEl.hidden = !on; chargeBtn.hidden = !on;
    if (on) { hpFill.style.width = '100%'; chargeBtn.disabled = false; chargeBtn.textContent = 'Charge!'; }
  }

  function makePieceMesh(p) {
    const w = p.x1 - p.x0, h = p.y1 - p.y0, d = 2 * ctx.hz, alt = p.plat % 2;
    const top = alt ? 0xc4eaff : 0xffd9a8, side = alt ? 0x4aa8d8 : 0xe0883a;
    const mats = [side, side, top, side, side, side].map(c => new THREE.MeshBasicMaterial({ color: c }));
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
    m.position.set((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, 0);
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0x12082b })));
    return m;
  }
  function disposeMesh(m) {
    towerG.remove(m);
    m.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach(x => x.dispose());
    });
  }
  function planTower() {
    reb.W = Math.max(1.0, ctx.hx - 0.8);
    reb.L = clamp(Math.floor((ctx.yMax - ctx.yMin - 3.4) / 1.2), 3, 5);
    reb.plats = []; reb.pieces = [];
    for (let i = 0; i < reb.L; i++) {
      const side = i % 2 === 0 ? -1 : 1, y = ctx.yMin + 1.2 * (i + 1);
      reb.plats.push({ side, y, done: false });
      for (let j = 0; j < PP; j++) {
        const w = reb.W / PP, a = side * (ctx.hx - j * w), b = side * (ctx.hx - (j + 1) * w);
        const p = { plat: i, j, x0: Math.min(a, b), x1: Math.max(a, b), y0: y - 0.22, y1: y, built: false, mesh: null, ghost: null, popT: 1 };
        const gm = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(p.x1 - p.x0, 0.22, 2 * ctx.hz)),
          new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 }));
        gm.position.set((p.x0 + p.x1) / 2, y - 0.11, 0);
        towerG.add(gm); p.ghost = gm;
        reb.pieces.push(p);
      }
    }
    reb.yTop = reb.plats[reb.L - 1].y;
    reb.supplyX = ctx.hx - 0.65;
    for (const [px, py] of [[-0.28, 0], [0.28, 0], [0, 1], [0, 2]]) {
      const m = new THREE.Mesh(partGeo, partMat);
      m.position.set(reb.supplyX + px, ctx.yMin + 0.12 + py * 0.23, 0);
      towerG.add(m); ctx.pileBlocks.push(m);
    }
  }
  function buildPiece(idx) {
    const p = reb.pieces[idx];
    if (p.ghost) { disposeMesh(p.ghost); p.ghost = null; }
    p.mesh = makePieceMesh(p); p.mesh.scale.y = 0.2; p.popT = 0;
    towerG.add(p.mesh); p.built = true; blocks.push(p);
  }
  function dismantleTower(retire) {
    disposeCannon(retire);
    for (const p of reb.pieces) {
      if (p.mesh) { spark((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, 0.8, 8, { color: 0xffd25a, speed: 2.4, life: 0.9, size: 0.12 }); disposeMesh(p.mesh); }
      if (p.ghost) disposeMesh(p.ghost);
    }
    for (const m of ctx.pileBlocks) towerG.remove(m);
    ctx.pileBlocks = [];
    blocks.length = 0;
    for (const o of objs) { o.role = o.genius ? 'genius' : null; dropCarry(o); }
    reb.pieces = []; reb.plats = []; reb.L = 0; reb.state = 'off'; reb.total = 0; reb.hinted = false; reb.inflight = 0;
    reb.kind = ''; reb.geniusRolled = false;
    setHud(false);
  }
  function abortRebellion() {
    if (reb.state === 'off') return;
    dismantleTower();
    if (ey.battleMode) {
      ey.battleMode = false; ey.dead = false;
      if (ey.state !== 'off') { releaseVictim(); ey.state = 'leave'; eyeBtn.textContent = 'Summon eye'; }
    }
  }
  function startBuild() {
    if (reb.genius && objs.indexOf(reb.genius) >= 0) { startCannon(); return; }
    reb.kind = 'tower';
    planTower();
    reb.state = 'build'; reb.t = 0; reb.bl = 0; reb.pcs = 0; reb.placed = 0; reb.need = reb.L * PP; reb.inflight = 0;
    reb.pile = 4; reb.pileT = 0; reb.noneT = 0;
    ctx.gMode = 0; gravBtn.textContent = 'Gravity: down';
    say('The wobblers have had enough. They are building something...', 4200);
    chime([196, 247, 294], 260, 0.05);
  }
  function startCelebration() {
    reb.state = 'celebrate'; reb.celT = 9;
    setHud(false);
    for (const o of objs) {
      if (o.legs > 0 && !o.dying) { o.role = o.genius ? 'genius' : 'celebrate'; dropCarry(o); o.goldT = 9; o.moodT = 3; o.energy = 1; o.state = 'walk'; o.tiltT = 0; o.sickT = 0; if (o.stoneT > 0) endStone(o); }
    }
    say('The wobblers are free!', 4500);
    chime([523, 659, 784, 1047, 1319], 150, 0.06);
  }
  function defeatEye() {
    reb.state = 'victory';
    ey.state = 'defeated'; ey.defT = 0; ey.dead = true; ey.aim = 0; ey.zapT = 0;
    ey.hp = 0; hpFill.style.width = '0%';
    for (const o of objs) { if (o.role && o.role !== 'genius') o.role = 'celebrate'; }
    releaseAmmo();
    chargeBtn.hidden = true;
    tone(300, 1.4, 0.08, 'sawtooth', 0.25);
  }
  function beginBattle() {
    reb.state = 'battle'; reb.chargeCd = 0; setHud(true);
    for (const o of objs) { dropCarry(o); if (o.role && o.role !== 'genius') o.role = reb.kind === 'cannon' ? 'loader' : 'climber'; }
    if (reb.kind === 'cannon') chargeBtn.hidden = true;
    ey.battleMode = true;
    if (ey.state === 'off') { summonEye(); say('The eye descends to stop them!', 3000); }
    else { releaseVictim(); ey.state = 'battle'; ey.hp = 1; ey.atkT = 2.2; ey.aim = 0; ey.zapT = 0; eyeBtn.textContent = 'Send eye away'; say('The eye descends to stop them!', 3000); }
  }
  function chargeNow() {
    if (reb.state !== 'battle' || reb.chargeCd > 0 || ey.state !== 'battle') return;
    ensureAudio();
    reb.chargeCd = 12;
    const g = 15;
    for (const o of objs) {
      if (o.role !== 'climber' || o.dying) continue;
      o.rally = 6; o.goldT = Math.max(o.goldT, 6);
      if (o.groundT > 0) { // the tower flings its climbers at the eye
        const dh = ey.pos.y - o.pos.y, vUp = Math.min(13, Math.sqrt(2 * g * Math.max(dh + 0.6, 1))), T = vUp / g;
        o.vel.set(clamp((ey.pos.x - o.pos.x) / T, -4.5, 4.5), vUp, 0); o.hopT = 0.35; o.groundT = 0;
      }
      spark(o.pos.x, o.pos.y, o.pos.z + 0.3, 8, { color: 0xff9a5a, speed: 2.6, life: 0.8, size: 0.13, spread: o.r });
    }
    tone(196, 0.6, 0.1, 'sawtooth', 1.4); setTimeout(() => tone(294, 0.6, 0.1, 'sawtooth', 1.3), 150);
    flash('#ffd0a0', 0.3); say('CHARGE!', 1200);
    if (navigator.vibrate) navigator.vibrate(30);
  }
  chargeBtn.addEventListener('click', chargeNow);

  // --- worker brains ---
  function lowestY(o) {
    let m = 1e9;
    for (let k = 0; k < o.cn; k++) m = Math.min(m, o.pos.y + o.wo[3 * k + 1] - o.cRad[k]);
    return m;
  }
  function updateLevel(o) {
    const low = lowestY(o);
    let lv = null;
    if (low < ctx.yMin + 0.28) lv = -1;
    for (let i = reb.plats.length - 1; i >= 0; i--) {
      if (Math.abs(low - reb.plats[i].y) > 0.25) continue;
      for (const p of reb.pieces) {
        if (p.plat === i && p.built && o.pos.x > p.x0 - 0.1 && o.pos.x < p.x1 + 0.1) { lv = i; break; }
      }
      if (lv === i) break;
    }
    if (lv !== null) { if (lv > o.lvl) o.hopFail = 0; o.lvl = lv; }
  }
  function hopTo(o, xt, yTop) {
    const g = 15 * Math.max(o.gScale, 0.3), dh = yTop - lowestY(o);
    const vUp = Math.sqrt(2 * g * (Math.max(dh, 0) + 0.9)), T = (vUp + Math.sqrt(Math.max(vUp * vUp - 2 * g * dh, 0))) / g;
    o.vel.x = clamp((xt - o.pos.x) / T, -3.4, 3.4); o.vel.y = vUp;
    o.hopT = 0.35; o.hopCd = 0.9; o.groundT = 0; o.vTarget = 0; o.hopFail = Math.min(4, o.hopFail + 1);
    spark(o.pos.x, o.pos.y - o.r * 0.5, o.pos.z + 0.3, 3, { color: 0xffffff, speed: 0.8, life: 0.5, size: 0.08 });
  }
  // walk to the edge and hop up, level by level. Returns true once standing on the target level.
  function climbStep(o, target, spd) {
    if (o.lvl >= target) return true;
    const n = o.lvl + 1, p = reb.plats[n];
    if (!p || !p.done) { o.vTarget = 0; return false; }
    const sn = p.side, xeN = sn * (ctx.hx - reb.W), xt = xeN + sn * 0.4;
    let xs;
    if (o.lvl < 0) xs = ((o.id % 3) - 1) * 0.12;
    else { const sc = reb.plats[o.lvl].side, xeC = sc * (ctx.hx - reb.W); xs = xeC + sc * 0.3; }
    const dxs = xs - o.pos.x;
    if (Math.abs(dxs) > 0.16) o.vTarget = Math.sign(dxs) * spd;
    else { o.vTarget = 0; if (o.hopCd <= 0) hopTo(o, xt, p.y); }
    return false;
  }
  function rebelSteer(o, dt, t) {
    o.hopCd = Math.max(0, o.hopCd - dt); o.hitCd = Math.max(0, o.hitCd - dt); o.rally = Math.max(0, o.rally - dt);
    o.vTarget = 0;
    const active = reb.kind === 'cannon' ? !!reb.cn : reb.plats.length > 0;
    if (ctx.gMode !== 0 || (!active && o.role !== 'celebrate' && o.role !== 'genius')) return;
    const grounded = o.groundT > 0 && o.hopT <= 0;
    if (grounded && reb.plats.length) updateLevel(o);
    const spd = 1.7 * (o.rally > 0 ? 1.4 : 1);
    if (o.role === 'genius') { geniusAI(o, dt, t, grounded); }
    else if (reb.kind === 'cannon' && (o.role === 'builder' || o.role === 'loader')) {
      if (o.role === 'builder') cannonBuilder(o, grounded, spd); else loaderAI(o, grounded, spd);
    } else if (o.role === 'builder') {
      if (!grounded || reb.state !== 'build') return;
      if (!o.part) {
        if (reb.need - reb.placed - reb.inflight <= 0 || reb.pile <= 0) return;
        const dx = reb.supplyX - o.pos.x;
        if (Math.abs(dx) > 0.35) o.vTarget = Math.sign(dx) * spd;
        else if (o.lvl === -1) {
          o.part = true; reb.pile--; reb.inflight++;
          o.carryMesh = new THREE.Mesh(partGeo, partMat); scene.add(o.carryMesh);
          boing(500 * o.pitch, 0.03);
        }
        return;
      }
      if (reb.bl >= reb.L) return;
      if (!climbStep(o, reb.bl - 1, spd)) return;
      const p = reb.pieces[reb.bl * PP + reb.pcs];
      const sx = (p.x0 + p.x1) / 2, sy = p.y1;
      if (Math.hypot(sx - o.pos.x, sy - o.pos.y) < 2.9) {
        buildPiece(reb.bl * PP + reb.pcs);
        reb.inflight--; o.part = false;
        if (o.carryMesh) { scene.remove(o.carryMesh); o.carryMesh = null; }
        spark(sx, sy, 0.8, 10, { color: 0xffd25a, speed: 2, life: 0.8, size: 0.12 });
        tone(660 + reb.placed * 40, 0.3, 0.05, 'triangle');
        advanceTower();
      } else o.vTarget = Math.sign(sx - o.pos.x) * spd;
    } else if (o.role === 'climber') {
      if (!grounded) return;
      if (!climbStep(o, reb.L - 1, spd)) return;
      if (ey.state !== 'battle') return;
      const dx = ey.pos.x - o.pos.x;
      if (Math.abs(dx) > 0.4) o.vTarget = Math.sign(dx) * spd;
      else if (o.hopCd <= 0) { // leap at the eye
        const g = 15, dh = ey.pos.y - o.pos.y, vUp = Math.min(11, Math.sqrt(2 * g * Math.max(dh + 0.5, 0.8))), T = vUp / g;
        o.vel.set(clamp(dx / T, -4, 4), vUp, 0); o.hopT = 0.35; o.hopCd = 1.2; o.groundT = 0;
      }
    } else if (o.role === 'celebrate') {
      o.vTarget = Math.sin(t * 2 + o.id) * 1.3;
      if (o.groundT > 0 && Math.random() < dt * 0.9) { o.vel.y = 5 + Math.random() * 2; o.hopT = 0.3; o.groundT = 0; }
    }
    const vsx = o.vel.dot(o.side); // wedged against something? hop out of it
    if (grounded && Math.abs(o.vTarget) > 0.5 && Math.abs(vsx) < 0.15) o.stuckT += dt; else o.stuckT = 0;
    if (o.stuckT > 1.4) { o.stuckT = 0; o.vel.y = 5.5; o.vel.x = Math.sign(o.vTarget) * 1.8; o.hopT = 0.3; o.groundT = 0; }
    o.tiltT = -clamp(vsx * 0.05, -0.15, 0.15);
  }
  function advanceTower() {
    reb.pcs++; reb.placed++; reb.stallT = 0;
    if (reb.pcs >= PP) {
      reb.plats[reb.bl].done = true; reb.bl++; reb.pcs = 0;
      say('Level ' + reb.bl + ' of ' + reb.L, 900);
    }
  }
  function rebelFrame(dt, t) {
    updatePopTexts(dt);
    if (reb.genius && objs.indexOf(reb.genius) < 0) reb.genius = null;
    if (reb.state === 'off') {
      if (!reb.genius && !reb.geniusRolled && reb.total >= 2) { reb.geniusRolled = true; if (Math.random() < 0.6) spawnGenius(); }
      if (reb.total >= REBEL_AT && ey.state !== 'omen' && ey.state !== 'verdict') {
        if (countLegged() >= 2) startBuild();
        else if (!reb.hinted) { reb.hinted = true; say('The wobblers whisper of rebellion. Give a few of them legs...', 4200); }
      }
      return;
    }
    reb.t += dt;
    for (const o of objs) {
      if (o.carryMesh) {
        if (o.arms > 0) { holdPos(o, 0.2, aTp); o.carryMesh.position.copy(aTp); } else o.carryMesh.position.set(o.pos.x, o.pos.y + o.r + 0.18, o.pos.z);
        o.carryMesh.rotation.y += dt * 2;
      }
    }
    for (const p of reb.pieces) {
      if (p.mesh && p.popT < 1) { p.popT = Math.min(1, p.popT + dt / 0.3); p.mesh.scale.y = 0.2 + 0.8 * (1 - Math.pow(1 - p.popT, 3)); }
    }
    switch (reb.state) {
      case 'build':
        refreshRoles('builder');
        if (reb.kind === 'cannon') { cannonBuildFrame(dt, t); break; }
        reb.stallT += dt;
        if (reb.stallT > 30 && reb.placed < reb.need) { // someone got wedged: the tower assembles itself rather than stalling forever
          buildPiece(reb.bl * PP + reb.pcs);
          const carrier = objs.find(x => x.part);
          if (carrier) { dropCarry(carrier); }
          spark((reb.pieces[reb.bl * PP + reb.pcs].x0 + reb.pieces[reb.bl * PP + reb.pcs].x1) / 2, reb.plats[reb.bl].y, 0.8, 12, { color: 0xffd25a, speed: 2, life: 0.9, size: 0.13 });
          advanceTower();
        }
        reb.pileT += dt;
        if (reb.pile < 4 && reb.pileT > 1.0) { reb.pile++; reb.pileT = 0; }
        ctx.pileBlocks.forEach((m, i) => { m.visible = i < reb.pile; });
        if (reb.placed >= reb.need) {
          reb.state = 'built'; reb.delay = 1.8;
          for (const o of objs) dropCarry(o);
          say('The tower is complete!', 2200);
          chime([523, 659, 784, 1047], 140, 0.06);
        }
        if (countRebels() === 0) { reb.noneT += dt; if (reb.noneT > 25) abortRebellion(); } else reb.noneT = 0;
        break;
      case 'built':
        reb.delay -= dt;
        ctx.pileBlocks.forEach(m => { m.visible = false; });
        if (reb.delay <= 0 && ey.state !== 'leave' && ey.state !== 'arrive') beginBattle();
        break;
      case 'battle':
        refreshRoles(reb.kind === 'cannon' ? 'loader' : 'climber');
        if (reb.kind === 'cannon') cannonFrame(dt, t);
        reb.chargeCd = Math.max(0, reb.chargeCd - dt);
        hpFill.style.width = Math.max(0, ey.hp * 100) + '%';
        chargeBtn.disabled = reb.chargeCd > 0;
        chargeBtn.textContent = reb.chargeCd > 0 ? 'Charge (' + Math.ceil(reb.chargeCd) + ')' : 'Charge!';
        if (countRebels() === 0) { reb.noneT += dt; if (reb.noneT > 8) { say('The wobblers lost heart...', 2500); abortRebellion(); } } else reb.noneT = 0;
        break;
      case 'celebrate':
        refreshRoles('celebrate');
        reb.celT -= dt;
        if (Math.random() < dt * 5) {
          const c = [0xff6aa8, 0x6ad8ff, 0xffe14d, 0x9bff7a][(Math.random() * 4) | 0];
          spark((Math.random() - 0.5) * ctx.hx * 1.8, ctx.yMax - 0.5, 1, 6, { color: c, speed: 1.6, life: 1.6, size: 0.14, grav: -2.2 });
        }
        if (reb.celT <= 0) {
          const wasCannon = reb.kind === 'cannon';
          dismantleTower(true);
          startAwakening();
          say(wasCannon ? 'The cannon falls silent. The genius vanishes in a flash of ideas.' : 'The tower crumbles into stardust.', 3200);
        }
        break;
    }
  }

  /* ---------- the genius wobbler and the cannon uprising ---------- */

  function outfitTextures() {
    if (ctx.outfitTex) return ctx.outfitTex;
    const ink = '#12082b';
    ctx.outfitTex = {
      coat: mkTex(128, 128, g => {
        g.lineWidth = 4; g.strokeStyle = ink; g.fillStyle = '#f6f8ff';
        g.beginPath(); g.moveTo(14, 6); g.lineTo(114, 6); g.lineTo(124, 124); g.lineTo(4, 124); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#dfe6fa';
        g.beginPath(); g.moveTo(14, 6); g.lineTo(64, 70); g.lineTo(46, 6); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(114, 6); g.lineTo(64, 70); g.lineTo(82, 6); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(14, 6); g.lineTo(64, 70); g.lineTo(114, 6); g.stroke();
        g.fillStyle = '#8fa0c8'; for (const y of [84, 100, 116]) { g.beginPath(); g.arc(64, y, 3.5, 0, 6.283); g.fill(); }
        g.lineWidth = 3; g.strokeRect(14, 92, 32, 24); g.strokeRect(82, 92, 32, 24);
        g.strokeStyle = '#4a7bd8'; g.lineWidth = 4; g.beginPath(); g.moveTo(96, 80); g.lineTo(96, 100); g.stroke();
      }),
      glasses: mkTex(128, 64, g => {
        g.lineWidth = 5; g.strokeStyle = ink; g.fillStyle = 'rgba(190,225,255,0.22)';
        for (const x of [40, 88]) { g.beginPath(); g.arc(x, 32, 25, 0, 6.283); g.fill(); g.stroke(); }
        g.beginPath(); g.moveTo(65, 30); g.quadraticCurveTo(64, 24, 63, 30); g.stroke();
        g.beginPath(); g.moveTo(15, 28); g.lineTo(2, 22); g.moveTo(113, 28); g.lineTo(126, 22); g.stroke();
      }),
      goggles: mkTex(128, 64, g => {
        g.fillStyle = '#6b4a2f'; g.strokeStyle = ink; g.lineWidth = 3; g.fillRect(0, 22, 128, 20); g.strokeRect(0, 22, 128, 20);
        for (const x of [36, 92]) {
          g.beginPath(); g.arc(x, 32, 22, 0, 6.283); g.fillStyle = '#d4a24c'; g.fill(); g.stroke();
          g.beginPath(); g.arc(x, 32, 14, 0, 6.283); g.fillStyle = 'rgba(120,205,255,0.7)'; g.fill(); g.stroke();
          g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(x - 5, 27, 4, 0, 6.283); g.fill();
        }
      }),
      hair: mkTex(128, 64, g => {
        g.fillStyle = '#eceaf6'; g.strokeStyle = ink; g.lineWidth = 3; g.lineJoin = 'round';
        const tips = [[6, 14], [20, 4], [32, 20], [44, 2], [58, 18], [70, 4], [82, 20], [94, 3], [106, 18], [118, 8], [124, 28]];
        g.beginPath(); g.moveTo(4, 62);
        tips.forEach((p, i) => { g.lineTo(p[0] - 3, 40); g.lineTo(p[0], p[1]); g.lineTo(p[0] + 5, 40); });
        g.lineTo(126, 62); g.closePath(); g.fill(); g.stroke();
      }),
      clip: mkTex(64, 80, g => {
        g.fillStyle = '#c99a5b'; g.strokeStyle = ink; g.lineWidth = 3; g.fillRect(4, 6, 56, 70); g.strokeRect(4, 6, 56, 70);
        g.fillStyle = '#fffdf0'; g.fillRect(10, 16, 44, 54); g.strokeRect(10, 16, 44, 54);
        g.strokeStyle = '#b8bccb'; g.lineWidth = 2; for (const y of [26, 34, 42]) { g.beginPath(); g.moveTo(14, y); g.lineTo(50, y); g.stroke(); }
        g.strokeStyle = '#4a7bd8'; g.beginPath(); g.moveTo(14, 54); g.quadraticCurveTo(24, 46, 30, 58); g.quadraticCurveTo(38, 66, 48, 52); g.stroke();
        g.fillStyle = '#8a8f9c'; g.fillRect(20, 2, 24, 12); g.strokeStyle = ink; g.strokeRect(20, 2, 24, 12);
      }),
      brain: mkTex(128, 96, g => {
        const gr = g.createRadialGradient(64, 50, 4, 64, 50, 62);
        gr.addColorStop(0, 'rgba(255,170,215,0.55)'); gr.addColorStop(1, 'rgba(255,170,215,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 96);
        g.lineWidth = 3; g.strokeStyle = '#c2457f'; g.fillStyle = '#ff9ac8';
        for (const x of [46, 82]) { g.beginPath(); g.ellipse(x, 48, 28, 26, 0, 0, 6.283); g.fill(); g.stroke(); }
        g.beginPath(); g.moveTo(64, 24); g.lineTo(64, 72); g.stroke();
        g.lineWidth = 2.5;
        for (const [a, b, c2, d] of [[30, 40, 44, 34], [36, 56, 52, 60], [76, 34, 94, 40], [78, 58, 92, 54], [44, 46, 56, 44], [72, 48, 86, 46]]) { g.beginPath(); g.moveTo(a, b); g.quadraticCurveTo((a + c2) / 2, (b + d) / 2 - 8, c2, d); g.stroke(); }
        g.fillStyle = '#e07aa8'; g.fillRect(58, 72, 12, 12);
      }),
      bulb: mkTex(64, 96, g => {
        const gr = g.createRadialGradient(32, 34, 2, 32, 34, 30);
        gr.addColorStop(0, 'rgba(255,248,170,1)'); gr.addColorStop(1, 'rgba(255,220,90,0.9)');
        g.fillStyle = gr; g.strokeStyle = ink; g.lineWidth = 3;
        g.beginPath(); g.arc(32, 34, 24, 0, 6.283); g.fill(); g.stroke();
        g.fillStyle = '#9aa0b0'; g.fillRect(22, 58, 20, 14); g.strokeRect(22, 58, 20, 14); g.fillRect(25, 72, 14, 8); g.strokeRect(25, 72, 14, 8);
        g.strokeStyle = '#d98a1a'; g.lineWidth = 2; g.beginPath(); g.moveTo(26, 56); g.lineTo(28, 40); g.lineTo(32, 46); g.lineTo(36, 40); g.lineTo(38, 56); g.stroke();
      })
    };
    return ctx.outfitTex;
  }
  function stickBetween(a, b, r, mat) {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 6), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.multiplyScalar(1 / len));
    m.scale.set(1, len, 1);
    return m;
  }
  // real 3D gear for the genius: spiky hair, round glasses, goggles pushed up on the forehead
  function buildRig(o) {
    const g = new THREE.Group();
    const ink = new THREE.MeshBasicMaterial({ color: 0x12082b });
    const lens = new THREE.MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    const brass = new THREE.MeshBasicMaterial({ color: 0xd4a24c });
    const strap = new THREE.MeshBasicMaterial({ color: 0x6b4a2f });
    const glass = new THREE.MeshBasicMaterial({ color: 0x78cdff, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
    const hairM = new THREE.MeshBasicMaterial({ color: 0xf0eef8 });
    const lineM = new THREE.LineBasicMaterial({ color: 0x12082b });
    o.rigMats = [ink, lens, brass, strap, glass, hairM, lineM];
    // glasses
    for (const sx of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.022, 8, 28), ink); ring.position.set(sx * 0.17, 0.08, 0.58); g.add(ring);
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), lens); l.position.set(sx * 0.17, 0.08, 0.575); g.add(l);
      g.add(stickBetween(new THREE.Vector3(sx * 0.335, 0.09, 0.575), new THREE.Vector3(sx * 0.47, 0.09, 0.17), 0.016, ink));
    }
    g.add(stickBetween(new THREE.Vector3(-0.03, 0.1, 0.585), new THREE.Vector3(0.03, 0.1, 0.585), 0.016, ink));
    // goggles on the forehead
    const gz = new THREE.Vector3(0, 0, 1);
    for (const sx of [-1, 1]) {
      const dir = new THREE.Vector3(sx * 0.15, 0.36, 0.4).normalize();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 8, 22), brass);
      ring.position.copy(dir).multiplyScalar(0.505); ring.quaternion.setFromUnitVectors(gz, dir); g.add(ring);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.095, 18), glass);
      disc.position.copy(dir).multiplyScalar(0.51); disc.quaternion.copy(ring.quaternion); g.add(disc);
    }
    const band = new THREE.Mesh(new THREE.TorusGeometry(Math.sqrt(0.25 - 0.34 * 0.34) + 0.01, 0.032, 6, 36), strap);
    band.rotation.x = Math.PI / 2; band.position.y = 0.34; g.add(band);
    // pointy hair: a crown of cones
    const Yv = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 16; i++) {
      const phi = i * 2.399, th = 0.12 + (i % 5) * 0.14, len = 0.3 + ((i * 37) % 7) * 0.05;
      const dir = new THREE.Vector3(Math.sin(th) * Math.cos(phi), Math.cos(th), Math.sin(th) * Math.sin(phi));
      const axis = dir.clone().add(new THREE.Vector3(0, 0.6, 0)).normalize();
      const geo = new THREE.ConeGeometry(0.065, 1, 6); geo.translate(0, 0.5, 0);
      const spike = new THREE.Mesh(geo, hairM);
      spike.position.copy(dir).multiplyScalar(0.46);
      spike.quaternion.setFromUnitVectors(Yv, axis);
      spike.scale.set(1, len, 1);
      spike.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineM));
      g.add(spike);
    }
    scene.add(g);
    o.rig = g;
  }
  function makeOutfit(o) {
    const tx = outfitTextures();
    const mk = (map, ro, depth, add) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: depth !== false, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
      sp.renderOrder = ro; scene.add(sp); return sp;
    };
    o.outfit = { clip: mk(tx.clip, 0.8), brain: mk(tx.brain, 2, false, true), bulb: mk(tx.bulb, 2.1, false) };
    buildRig(o);
  }
  function clearOutfit(o) {
    if (o.rig) {
      o.rig.traverse(c => { if (c.geometry) c.geometry.dispose(); });
      scene.remove(o.rig);
      if (o.rigMats) o.rigMats.forEach(m => m.dispose());
      o.rig = null; o.rigMats = null;
    }
    if (!o.outfit) return;
    for (const k in o.outfit) { scene.remove(o.outfit[k]); o.outfit[k].material.dispose(); }
    o.outfit = null;
  }
  function releaseCarry(o) {
    if (o.carry) { o.carry.pinned = false; o.carry.carried = false; o.carry = null; }
  }
  function updateOutfit(o, t, sc) {
    const f = o.outfit, S = o.size * sc, cs = Math.cos(o.tilt), sn = Math.sin(o.tilt), fz = o.pos.z + o.front;
    const vs = o.vel.dot(o.side);
    if (Math.abs(vs) > 0.3) o.faceDir += (Math.sign(vs) - o.faceDir) * 0.1;
    if (o.rig) { // hair, glasses and goggles ride on the body
      rigQ1.setFromAxisAngle(Z_AXIS, o.tilt); rigQ2.setFromUnitVectors(Y_AXIS, o.up);
      o.rig.quaternion.copy(rigQ1).multiply(rigQ2);
      o.rig.position.copy(o.pos); o.rig.scale.setScalar(S); o.rig.visible = sc > 0.05;
    }
    const put = (sp, ox, oy, dz, w, h, rot) => {
      sp.position.set(o.pos.x + (ox * cs - oy * sn) * S, o.pos.y + (ox * sn + oy * cs) * S, fz + dz);
      sp.scale.set(w * S, h * S, 1); sp.material.rotation = o.tilt + (rot || 0); sp.visible = sc > 0.05;
    };
    put(f.clip, 0.62 * o.faceDir, -0.12, 0.05, 0.5, 0.62, Math.sin(t * 4) * 0.08 + (o.thinkT > 0 ? Math.sin(t * 14) * 0.14 : 0));
    const pulse = 1 + 0.08 * Math.sin(t * 3);
    put(f.brain, 0, 1.22, 0.0, 0.95 * pulse, 0.72 * pulse, 0);
    f.brain.material.opacity = 0.7 + 0.3 * Math.sin(t * 3);
    put(f.bulb, -0.62 * o.faceDir, 1.35, 0.0, 0.36, 0.54, 0);
    f.bulb.visible = f.bulb.visible && o.bulbT > 0;
  }
  const rigQ1 = new THREE.Quaternion(), rigQ2 = new THREE.Quaternion();

  // genius behaviour: pacing, muttering, sketching ideas in the air
  const IDEAS = ['E=mc\u00b2', '42?', '\u03a3', '\u03c0', 'hmm...', 'x\u00b2+y\u00b2', '!?', 'F=ma', 'carry the 1', 'eureka?'];
  function sketchPath(kind) {
    const pts = [];
    const poly = (arr, per) => { for (let i = 0; i < arr.length - 1; i++) for (let k = 0; k < per; k++) { const u = k / per; pts.push([arr[i][0] + (arr[i + 1][0] - arr[i][0]) * u, arr[i][1] + (arr[i + 1][1] - arr[i][1]) * u]); } };
    if (kind === 'gear') { for (let a = 0; a < 6.283; a += 0.1) { const r = 0.5 + 0.09 * Math.sign(Math.sin(a * 8)); pts.push([Math.cos(a) * r, Math.sin(a) * r]); } }
    else if (kind === 'spiral') { for (let a = 0; a < 18; a += 0.35) pts.push([Math.cos(a) * a * 0.03, Math.sin(a) * a * 0.03]); }
    else if (kind === 'cannon') { poly([[-0.55, -0.12], [0.5, 0.22], [0.6, 0.05], [-0.45, -0.3], [-0.55, -0.12]], 7); for (let a = 0; a < 6.283; a += 0.5) pts.push([-0.15 + Math.cos(a) * 0.17, -0.38 + Math.sin(a) * 0.17]); }
    else if (kind === 'zigzag') poly([[-0.5, -0.3], [-0.2, 0.3], [0.05, -0.3], [0.3, 0.3], [0.5, -0.1]], 8);
    else poly([[0, 0.5], [0.3, -0.4], [-0.48, 0.15], [0.48, 0.15], [-0.3, -0.4], [0, 0.5]], 7);
    return pts;
  }
  function startIdea(o, kind) {
    kind = kind || ['gear', 'spiral', 'cannon', 'zigzag', 'star'][(Math.random() * 5) | 0];
    o.sketch = { pts: sketchPath(kind), i: 0, t: 0, ox: o.size * 1.0 * (Math.random() < 0.5 ? -1 : 1), oy: o.size * 1.15 };
    o.thinkT = 2.0;
  }
  function sketchTick(o, dt) {
    const sk = o.sketch;
    sk.t += dt;
    while (sk.i < sk.pts.length && sk.t > sk.i * 0.035) {
      const p = sk.pts[sk.i++];
      spark(o.pos.x + sk.ox + p[0], o.pos.y + sk.oy + p[1], o.pos.z + 0.5, 1, { color: 0x7fe9ff, speed: 0.001, life: 2.2, size: 0.08, grav: 0 });
    }
    if (sk.i >= sk.pts.length) { o.sketch = null; if (Math.random() < 0.55) lightbulb(o); }
  }
  function lightbulb(o) {
    o.bulbT = 1.3;
    tone(880, 0.4, 0.05, 'triangle'); setTimeout(() => tone(1320, 0.4, 0.05, 'triangle'), 120);
    popText(o.pos.x, o.pos.y + o.size * 1.9, '!', '#ffe9a0', 1.2, 0.7);
  }
  function mutter(o) {
    popText(o.pos.x + (Math.random() - 0.5) * 0.8, o.pos.y + o.size * 1.0, IDEAS[(Math.random() * IDEAS.length) | 0], '#bfefff', 1.8, 0.55);
    for (let i = 0; i < 3; i++) setTimeout(() => tone(150 + Math.random() * 130, 0.07, 0.014, 'square'), i * 90);
  }
  function geniusAI(o, dt, t, grounded) {
    o.energy = 1;
    o.ideaT -= dt; o.muttT -= dt; o.paceT -= dt; o.bulbT = Math.max(0, o.bulbT - dt);
    if (o.ideaT <= 0 && !o.sketch) { o.ideaT = 6 + Math.random() * 6; startIdea(o, null); }
    if (o.muttT <= 0) { o.muttT = 1.8 + Math.random() * 2.6; mutter(o); }
    if (o.sketch) sketchTick(o, dt);
    if (reb.state === 'celebrate') {
      o.vTarget = Math.sin(t * 3) * 1.2;
      if (grounded && Math.random() < dt * 1.5) { o.vel.y = 5.5; o.hopT = 0.3; o.groundT = 0; }
      return;
    }
    if (!grounded) return;
    if (reb.kind === 'cannon' && reb.cn && reb.state === 'battle' && !objs.some(x => x.role === 'loader')) { // nobody to help: load it itself
      loaderAI(o, grounded, 1.5);
      if (o.carry || reb.cn.loader === o) return;
    }
    const home = reb.cn ? reb.cn.x + 1.3 : o.homeX;
    if (o.thinkT > 0) { o.thinkT -= dt; o.vTarget = 0; o.tiltT = Math.sin(t * 9) * 0.05; return; }
    if (o.paceT <= 0) { o.paceT = 1 + Math.random() * 2.5; o.paceDir = Math.random() < 0.25 ? 0 : (Math.random() < 0.5 ? -1 : 1); }
    const far = Math.abs(o.pos.x - home) > 2.2;
    if (o.pos.x < home - 0.9) o.paceDir = 1; else if (o.pos.x > home + 0.9) o.paceDir = -1;
    if (far) o.paceDir = Math.sign(home - o.pos.x);
    o.vTarget = o.paceDir * (far ? 1.5 : 0.9);
  }
  function spawnGenius() {
    if (objs.length >= MAX_OBJS) { const old = objs.find(x => !x.dragged && !x.dying && !x.pinned && !x.role && !x.genius); if (old) removeObj(old); else return; }
    const g = addObj(0, clamp((Math.random() - 0.5) * ctx.hx, -ctx.hx + 0.9, ctx.hx - 0.9), ctx.yMax - 0.8);
    g.pos.z = 0; g.vel.set(0, -1, 0);
    g.genius = true; g.size = g.sizeT = 1.1; g.clumsy = 0.45; g.stamina = 1; g.pace = 0.8; g.homeX = g.pos.x;
    g.mat.uniforms.uColA.value.setHex(0xfff2a8); g.mat.uniforms.uColB.value.setHex(0xffd25a);
    setLegs(g, 2); g.role = 'genius';
    makeOutfit(g);
    reb.genius = g;
    popText(g.pos.x, g.pos.y - 0.8, 'Hmm...', '#ffe9a0', 2, 0.8);
    spark(g.pos.x, g.pos.y, 0.6, 24, { color: 0xffe9a0, speed: 3, life: 1.2, size: 0.14, spread: 0.6 });
    chime([784, 988, 1175], 120, 0.05); flash('#fff6d8', 0.25);
    say('A genius wobbler has appeared!', 3200);
  }
  function retireGenius() {
    const g = reb.genius; reb.genius = null;
    if (!g || objs.indexOf(g) < 0) return;
    g.genius = false; g.role = null;
    popText(g.pos.x, g.pos.y + 1.4, 'Eureka!', '#ffe9a0', 2.2, 1.0);
    spark(g.pos.x, g.pos.y, 1, 30, { color: 0xffe9a0, speed: 4, life: 1.4, size: 0.15, spread: g.r });
    addRing(g.pos, 0xffe9a0, 3);
    g.dying = true; g.dieT = 0;
  }

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
    startIdea(reb.genius, 'cannon');
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
      else if (!reb.genius.sketch && Math.random() < dt * 1.2) startIdea(reb.genius, 'cannon');
      return;
    }
    reb.stallT += dt;
    if (reb.stallT > 30 && cn.built < 6) { // someone got wedged: the cannon assembles itself
      buildCannonPart(cn.built); reb.placed++; reb.stallT = 0;
      const carrier = objs.find(x => x.part); if (carrier) dropCarry(carrier);
    }
    reb.pileT += dt;
    if (reb.pile < 4 && reb.pileT > 1.0) { reb.pile++; reb.pileT = 0; }
    ctx.pileBlocks.forEach((m, i) => { m.visible = i < reb.pile; });
    if (cn.built >= 6) {
      reb.state = 'built'; reb.delay = 1.8;
      for (const o of objs) dropCarry(o);
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
    for (const o of objs) releaseCarry(o);
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
    if (retire && reb.genius) retireGenius();
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
        if (o.dying || o.state === 'fall' || o.stoneT > 0 || objs.indexOf(a) < 0) { releaseCarry(o); if (cn.loader === o) cn.loader = null; }
        else if (o.arms > 0) { holdPos(o, a.r * 0.8, aTp); a.pinTarget.set(aTp.x, aTp.y, aTp.z + 0.2); }
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
  const aQt = new THREE.Quaternion(), aZ = new THREE.Vector3(), aS = new THREE.Vector3(), aH = new THREE.Vector3(),
        aK = new THREE.Vector3(), aD = new THREE.Vector3(), aB = new THREE.Vector3(), aTp = new THREE.Vector3(), aOff = new THREE.Vector3();
  ctx.aZ = aZ; ctx.aTp = aTp;
  function defaultAbeh() { return { gesture: true, punch: true, grab: true, hug: true }; }
  function clearArms(o) {
    for (const a of o.armMeshes) { a.sticks.forEach(m => scene.remove(m)); a.joints.forEach(m => scene.remove(m)); scene.remove(a.hand); }
    o.armMeshes.length = 0;
    if (o.armMatA) { o.armMatA.dispose(); o.armMatB.dispose(); o.armMatA = o.armMatB = null; }
    if (o.held) { o.held.pinned = false; o.held.carried = false; o.held = null; }
  }
  function buildArms(o) {
    clearArms(o);
    if (!o.arms) return;
    o.armMatA = new THREE.MeshBasicMaterial({ color: new THREE.Color().copy(o.mat.uniforms.uColB.value).multiplyScalar(0.75) });
    o.armMatB = new THREE.MeshBasicMaterial({ color: new THREE.Color().copy(o.mat.uniforms.uColA.value) });
    for (let i = 0; i < o.arms; i++) {
      const a = { sticks: [], joints: [], hand: new THREE.Mesh(legBall, o.armMatB) };
      for (let k = 0; k < o.armSegs; k++) {
        const st = new THREE.Mesh(legCyl, o.armMatA), jt = new THREE.Mesh(legBall, o.armMatB);
        st.frustumCulled = jt.frustumCulled = false;
        scene.add(st); scene.add(jt); a.sticks.push(st); a.joints.push(jt);
      }
      a.hand.frustumCulled = false; scene.add(a.hand);
      o.armMeshes.push(a);
    }
  }
  function setArms(o, n) {
    o.arms = n;
    buildArms(o);
    if (!n) o.ai.mode = 'idle';
  }
  function holdPos(o, itemR, out) { // just above the head, where the hands can reach
    return out.copy(o.pos).addScaledVector(o.up, (o.rBody || 0.5) * 0.9 + itemR * 0.6 + 0.08);
  }
  function armFor(o, tx) { return o.arms < 2 ? 0 : (tx >= o.pos.x ? 1 : 0); }
  function armReach(o) { return o.armLen * o.size + (o.rBody || 0.5) * 0.9 + 0.1; }
  function armSetMode(o, m) { o.ai.mode = m; o.ai.t = 0; o.ai.hit = false; }
  function armCancel(o) {
    const ai = o.ai;
    if (o.held) { o.held.pinned = false; o.held.carried = false; o.held = null; }
    ai.partner = null; ai.item = null; ai.tgt = null; ai.hugT = 0;
    ai.mode = 'idle'; ai.t = 0; ai.cd = 6 + Math.random() * 8;
  }
  function armCalm(o) { return (!o.role || o.role === 'celebrate') && (aw.state === 'off' || aw.state === 'peace' || aw.state === 'pending'); }
  function armItemOk(o, c) {
    return c && objs.indexOf(c) >= 0 && !c.dying && !c.dragged && c.stoneT <= 0 && !c.genius && !c.role && !c.caged;
  }
  function armPickItem(o) {
    let best = null, bd = 3.2;
    for (const c of objs) {
      if (c === o || !armItemOk(o, c) || c.pinned || c.carried || c.size > o.size * 1.2) continue;
      const d = Math.hypot(c.pos.x - o.pos.x, c.pos.y - o.pos.y) - (c.goldT > 0 ? 1.5 : 0);
      if (Math.abs(c.pos.y - o.pos.y) < 1.8 && d < bd) { bd = d; best = c; }
    }
    return best;
  }
  function holdItem(o) {
    const it = o.held;
    if (!it) return;
    holdPos(o, it.r * 0.8, aTp);
    it.pinTarget.set(aTp.x, aTp.y, o.pos.z);
  }
  function startPunch(o, tx, ty, tgt) {
    const ai = o.ai;
    ai.tgt = tgt || null; ai.arm = armFor(o, tx);
    ai.dir.set(tx - o.pos.x, ty - o.pos.y, 0);
    if (ai.dir.lengthSq() < 1e-4) ai.dir.set(1, 0, 0);
    ai.dir.normalize();
    ai.punchCd = 1.3;
    armSetMode(o, 'punch');
  }
  function punchLand(o) {
    const ai = o.ai, reach = armReach(o) + 0.4;
    const t = ai.tgt;
    if (t && objs.indexOf(t) >= 0 && !t.dying) {
      const dx = t.pos.x - o.pos.x, dy = t.pos.y - o.pos.y, d = Math.hypot(dx, dy) || 1;
      if (d < reach + t.r) {
        tmpV.set(dx / d, dy / d, 0);
        t.vel.addScaledVector(tmpV, 5.5 / Math.sqrt(t.density)); t.vel.y += 1.5;
        impact(t, tmpV, 9);
        if (t.legs > 0 && Math.random() < 0.35) t.tripNow = true;
        spark(t.pos.x - tmpV.x * t.r, t.pos.y - tmpV.y * t.r, t.pos.z + 0.3, 8, { color: 0xffe9a0, speed: 2.4, life: 0.5, size: 0.11 });
        popText(t.pos.x, t.pos.y + t.size * 0.8, 'pow', '#ffd25a', 0.8, 0.55);
        boing(220 * o.pitch, 0.07);
      }
    } else if (aw.state === 'boss' && Math.hypot(aw.fx - o.pos.x, aw.fy - o.pos.y) < reach + 0.4) {
      spark(aw.fx, aw.fy, 1.4, 8, { color: 0xff9ad2, speed: 2.4, life: 0.6, size: 0.12 });
      hurtBoss(0.02);
      boing(260 * o.pitch, 0.06);
    }
  }
  function endHeld(o, thrown) {
    const it = o.held;
    if (!it) return;
    it.pinned = false; it.carried = false;
    if (thrown) {
      const dirx = o.ai.dirx;
      it.vel.set(dirx * (5 + Math.random() * 4) + o.vel.x * 0.3, 8 + Math.random() * 3, 0);
      it.ang.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
      it.moodT = 1.2;
      impact(it, tmpV.set(dirx, 1, 0).normalize(), 8);
      spark(it.pos.x, it.pos.y, it.pos.z + 0.3, 8, { color: 0xffffff, speed: 2, life: 0.5, size: 0.1 });
      boing(300 * o.pitch, 0.07);
    } else it.vel.set(0, 1, 0);
    o.held = null;
  }
  function armHug(o, p, hold) {
    armSetMode(o, hold ? 'hold' : 'hug'); o.ai.partner = p; o.ai.passive = false; o.ai.hugT = 0; o.ai.lead = hold;
    armSetMode(p, hold ? 'hold' : 'hug'); p.ai.partner = o; p.ai.passive = true; p.ai.hugT = 0; p.ai.lead = false;
    o.ai.dirx = p.ai.dirx = Math.random() < 0.5 ? -1 : 1;
  }
  function armTick(o, dt, t) {
    const ai = o.ai, B = o.abeh;
    ai.t += dt; ai.cd -= dt; ai.punchCd = Math.max(0, ai.punchCd - dt);
    if (o.dying || o.stoneT > 0 || o.dragged || o.pinned || o.state === 'fall') { if (ai.mode !== 'idle') armCancel(o); ai.gKind = 'none'; return; }
    // carrying parts and shells for the uprisings
    const part = o.role === 'builder' && o.part && o.carryMesh, ammo = o.role === 'loader' && o.carry;
    if (part || ammo) {
      if (ai.mode !== 'carry') armSetMode(o, 'carry');
      if (part) { holdPos(o, 0.2, aTp); ai.tp.copy(aTp); ai.itemR = 0.2; } else { ai.tp.copy(ammo.pos); ai.itemR = ammo.r * 0.85; }
      return;
    }
    if (ai.mode === 'carry') armSetMode(o, 'idle');
    const it = ai.item, p = ai.partner;
    switch (ai.mode) {
      case 'punch':
        if (ai.t > 0.16 && !ai.hit) { ai.hit = true; punchLand(o); }
        if (ai.t > 0.6) armSetMode(o, 'idle');
        break;
      case 'fetch': {
        if (!armItemOk(o, it) || it.pinned || it.carried || ai.t > 8) { armCancel(o); break; }
        if (Math.abs(it.pos.x - o.pos.x) < ((o.rBody || 0.5) + it.r) * 0.55 + 0.3 && o.groundT > 0) armSetMode(o, 'reach');
        break;
      }
      case 'reach':
        if (!armItemOk(o, it) || it.pinned || it.carried) { armCancel(o); break; }
        ai.tp.copy(it.pos);
        if (ai.t > 0.35) { it.pinned = true; it.carried = true; it.vel.set(0, 0, 0); o.held = it; armSetMode(o, 'lift'); }
        break;
      case 'lift':
        if (!o.held) { armCancel(o); break; }
        holdItem(o);
        if (ai.t > 0.6) { ai.dirx = Math.random() < 0.5 ? -1 : 1; armSetMode(o, o.held.goldT > 0 ? 'show' : 'windup'); }
        break;
      case 'show': // proudly holds a gift up high, then sets it down
        if (!o.held) { armCancel(o); break; }
        holdItem(o);
        ai.heartT -= dt;
        if (ai.heartT <= 0) { ai.heartT = 0.35; spark(o.pos.x, o.pos.y + o.size, o.pos.z + 0.4, 1, { color: 0xff9ad2, speed: 0.5, life: 1.2, size: 0.14, grav: 1, up: 0.6 }); }
        if (ai.t > 3) { endHeld(o, false); armCancel(o); }
        break;
      case 'windup':
        if (!o.held) { armCancel(o); break; }
        holdItem(o);
        if (ai.t > 0.35) armSetMode(o, 'throw');
        break;
      case 'throw':
        if (ai.t > 0.12 && o.held) { endHeld(o, true); }
        if (ai.t > 0.5) armCancel(o);
        break;
      case 'hug': case 'hold': {
        if (!p || objs.indexOf(p) < 0 || p.dying || p.stoneT > 0 || p.ai.partner !== o || ai.t > 14) { armCancel(o); break; }
        const gap = ((o.rBody || 0.5) + (p.rBody || 0.5)) * (ai.mode === 'hug' ? 1.05 : 1.7) + 0.35;
        const near = Math.hypot(p.pos.x - o.pos.x, p.pos.y - o.pos.y) < gap;
        if (near) ai.hugT += dt;
        if (ai.mode === 'hug') {
          ai.heartT -= dt;
          if (near && ai.heartT <= 0) { ai.heartT = 0.3; spark((o.pos.x + p.pos.x) / 2, (o.pos.y + p.pos.y) / 2 + o.size * 0.5, o.pos.z + 0.4, 1, { color: 0xff7ac8, speed: 0.5, life: 1.3, size: 0.16, grav: 1, up: 0.8 }); }
        }
        ai.tp.set((o.pos.x + p.pos.x) / 2, (o.pos.y + p.pos.y) / 2, o.pos.z);
        if (ai.hugT > (ai.mode === 'hug' ? 2.4 : 5)) { const q = p; armCancel(o); armCancel(q); }
        break;
      }
      default: armIdle(o, dt, t);
    }
  }
  function armIdle(o, dt, t) {
    const ai = o.ai, B = o.abeh, reach = armReach(o);
    // punching: the finger in the showdown, the chased, or a playful shove
    if (B.punch && ai.punchCd <= 0) {
      if (aw.state === 'boss' && Math.hypot(aw.fx - o.pos.x, aw.fy - o.pos.y) < reach + 0.3) { startPunch(o, aw.fx, aw.fy, null); return; }
      if (armCalm(o) || o.beh.chase) {
        let tg = null, bd = reach + 0.5;
        for (const c of objs) {
          if (c === o || c.dying || c.pinned || c.carried || c.genius || c.caged) continue;
          const d = Math.hypot(c.pos.x - o.pos.x, c.pos.y - o.pos.y) - c.r;
          if (d < bd && (o.beh.chase || (c.arms > 0 && o.legs > 0 && Math.random() < dt * 0.35))) { bd = d; tg = c; }
        }
        if (tg && (o.beh.chase || Math.random() < 0.12)) { startPunch(o, tg.pos.x, tg.pos.y, tg); return; }
      }
    }
    // autonomous social things
    if (ai.cd <= 0 && o.legs > 0 && armCalm(o)) {
      const party = reb.state === 'celebrate' || aw.state === 'peace';
      ai.cd = party ? 2.5 + Math.random() * 3 : 9 + Math.random() * 12;
      const r = Math.random();
      if (B.hug && r < (party ? 0.7 : 0.35)) {
        let pa = null, bd = 3.4;
        for (const c of objs) {
          if (c === o || c.arms <= 0 || c.dying || c.stoneT > 0 || c.pinned || c.dragged || c.ai.mode !== 'idle' || c.genius) continue;
          const d = Math.abs(c.pos.x - o.pos.x);
          if (d < bd && Math.abs(c.pos.y - o.pos.y) < 1.5) { bd = d; pa = c; }
        }
        if (pa) { armHug(o, pa, Math.random() < 0.5); return; }
      } else if (B.grab && !o.role) {
        const item = armPickItem(o);
        if (item) { ai.item = item; armSetMode(o, 'fetch'); return; }
      }
    }
    // gestures for personality: wave, scratch, fidget, point at the eye or the finger
    if (B.gesture) {
      if (ai.gKind !== 'none' && t > ai.gUntil) { ai.gKind = 'none'; ai.gNext = t + 2 + Math.random() * 4; }
      if (ai.gKind === 'none' && t > ai.gNext) {
        const accuse = aw.state === 'notice' || aw.state === 'wary' || aw.state === 'boss' || aw.state === 'defeat';
        const eyeOn = ey.state !== 'off' && ey.alpha > 0.6;
        if (accuse) { ai.gKind = 'point'; ai.gTarget = 'finger'; ai.gUntil = t + 2.5; }
        else if (eyeOn && Math.random() < 0.5) { ai.gKind = 'point'; ai.gTarget = 'eye'; ai.gUntil = t + 2; }
        else if (pointerActive() && Math.hypot(pointerW.x - o.pos.x, pointerW.y - o.pos.y) < 5 && Math.random() < 0.6) { ai.gKind = 'wave'; ai.gTarget = 'finger'; ai.gUntil = t + 2.2; }
        else { const r = Math.random(); ai.gKind = r < 0.4 ? 'scratch' : (r < 0.7 ? 'fidget' : 'none'); ai.gTarget = ''; ai.gUntil = t + 1.8; if (ai.gKind === 'none') ai.gNext = t + 2 + Math.random() * 3; }
        ai.gArm = armFor(o, o.pos.x + (Math.random() - 0.5));
      }
      if (ai.gKind === 'point' || ai.gKind === 'wave') {
        if (ai.gTarget === 'eye') { ai.tp.copy(ey.pos); ai.tp.z = o.pos.z; } else ai.tp.set(aw.state === 'boss' || aw.state === 'defeat' ? aw.fx : pointerW.x, aw.state === 'boss' || aw.state === 'defeat' ? aw.fy : pointerW.y, o.pos.z);
        ai.gArm = armFor(o, ai.tp.x);
      }
    } else ai.gKind = 'none';
  }
  // standing still (or walking to its goal) while an arm action plays
  function armSteer(o, dt, t) {
    const ai = o.ai, m = ai.mode;
    if (m === 'idle' || m === 'carry') return false;
    if (m === 'fetch') {
      const it = ai.item;
      if (!it) return false;
      o.vTarget = Math.sign(it.pos.x - o.pos.x) * 1.5;
      return true;
    }
    if (m === 'hug' || m === 'hold') {
      const p = ai.partner;
      if (!p) return false;
      if (ai.passive) {
        if (m === 'hold') o.vTarget = p.vTarget || 0; else o.vTarget = 0;
        return true;
      }
      const gap = ((o.rBody || 0.5) + (p.rBody || 0.5)) * (m === 'hug' ? 0.95 : 1.7) + 0.3, dx = p.pos.x - o.pos.x;
      if (Math.abs(dx) > gap) o.vTarget = Math.sign(dx) * 1.4;
      else o.vTarget = m === 'hold' ? ai.dirx * 0.8 : 0;
      return true;
    }
    o.vTarget = 0;
    return true;
  }
  function armHandTarget(o, i, sgn, row, S, H, t, L, walkF) {
    const ai = o.ai, m = ai.mode, rb = o.rBody || 0.5;
    const place = (ox, oy, oz) => H.copy(S).addScaledVector(o.side, ox).addScaledVector(o.up, oy).addScaledVector(aZ, oz);
    const around = (C, ox, oy, oz) => { aOff.copy(o.side).multiplyScalar(ox).addScaledVector(o.up, oy).addScaledVector(aZ, oz); return H.copy(C).add(aOff); };
    const active = i === ai.arm, gActive = i === ai.gArm;
    switch (m) {
      case 'carry': return around(ai.tp, sgn * ai.itemR * 0.9, -0.1 * ai.itemR - row * 0.08, 0);
      case 'reach': {
        const p = Math.min(1, ai.t / 0.35), it = ai.item;
        place(sgn * 0.2 * L, -0.78 * L, 0);
        if (it) { aTp.copy(it.pos); aTp.addScaledVector(o.side, sgn * it.r * 0.9); H.lerp(aTp, p); }
        return H;
      }
      case 'lift': case 'show': { const it = o.held; return around(it ? it.pos : S, sgn * (it ? it.r * 0.85 : 0.2), -row * 0.06, 0); }
      case 'windup': return place(-ai.dirx * 0.55 * L, 0.75 * L, 0);
      case 'throw': { const k = Math.min(1, ai.t / 0.12); return place(ai.dirx * (-0.55 + 1.55 * k) * L, (0.75 - 0.3 * k) * L, 0); }
      case 'punch': {
        if (!active) break;
        const T = ai.t;
        if (T < 0.16) return H.copy(S).addScaledVector(ai.dir, -0.35 * L).addScaledVector(o.up, 0.08 * L);
        if (T < 0.28) return H.copy(S).addScaledVector(ai.dir, 1.1 * L);
        const k = Math.min(1, (T - 0.28) / 0.3);
        return H.copy(S).addScaledVector(ai.dir, 1.1 * L * (1 - k)).addScaledVector(o.side, sgn * 0.2 * L * k).addScaledVector(o.up, -0.78 * L * k);
      }
      case 'hug': {
        const p = ai.partner;
        if (!p) break;
        return around(p.pos, sgn * (p.rBody || 0.5) * 0.85, 0.05 * o.size - row * 0.1 * o.size, -0.1 * o.size);
      }
      case 'hold': {
        const p = ai.partner;
        if (!p) break;
        const facing = (p.pos.x >= o.pos.x) === (sgn > 0);
        if (facing && row === 0) return H.set(ai.tp.x, S.y, ai.tp.z);
        break;
      }
    }
    // idle gestures
    if (ai.gKind === 'wave' && gActive) return place(sgn * 0.3 * L + Math.sin(t * 9) * 0.25 * L, 0.85 * L, 0);
    if (ai.gKind === 'point' && gActive) { H.copy(ai.tp).sub(S); const d = H.length() || 1; return H.multiplyScalar(0.98 * L / d).add(S); }
    if (ai.gKind === 'scratch' && gActive) return H.copy(o.pos).addScaledVector(o.side, sgn * 0.12 * o.size).addScaledVector(o.up, rb * 0.95 + 0.04 * Math.sin(t * 14) * o.size);
    if (ai.gKind === 'fidget' && row === 0) return place(sgn * 0.08 * L, -0.4 * L + 0.03 * L * Math.sin(t * 6 + i), 0.3 * L);
    // relaxed: hang at the sides, swinging opposite the legs when walking
    return place(sgn * 0.2 * L + Math.sin(o.phase + (i % 2) * Math.PI) * 0.3 * L * walkF + 0.05 * L * Math.sin(t * 1.3 + i), -0.78 * L, 0.04 * L * Math.sin(t * 1.1 + i));
  }
  function updateArms(o, dt, t, sc) {
    const n = o.arms;
    armTick(o, dt, t);
    const vsA = o.vel.dot(o.side);
    if (Math.abs(vsA) > 0.25) o.fdir = vsA > 0 ? 1 : -1;
    const L = o.armLen * o.size, thick = 0.04 * o.size * sc * (1 + 0.3 * Math.max(0, o.armLen - 0.5)), hr = 0.065 * o.size * sc * o.handScale * (1 + 0.3 * Math.max(0, o.armLen - 0.5));
    const nseg = o.armSegs, thMax = jointLimit(o, nseg), speed = Math.abs(o.vel.dot(o.side)), walkF = (o.groundT > 0 && o.state === 'walk') ? Math.min(1, speed / 1.5) : 0;
    aZ.crossVectors(o.side, o.up);
    aQt.setFromAxisAngle(Z_AXIS, o.tilt);
    const hide = o.dying && sc < 0.05;
    for (let i = 0; i < n; i++) {
      const am = o.armMeshes[i];
      if (!am) continue;
      if (hide) { am.sticks.forEach(m => { m.visible = false; }); am.joints.forEach(m => { m.visible = false; }); am.hand.visible = false; continue; }
      const sgn = (i % 2) ? 1 : -1, row = i >> 1;
      const sx = sgn * (o.halfW || 0.5) * 0.92, sy = o.size * (0.12 + ((row % 2) ? -1 : 1) * ((row + 1) >> 1) * 0.14), sz = o.size * 0.06 * ((row % 3) - 1);
      aS.copy(o.side).multiplyScalar(sx).addScaledVector(o.up, sy).addScaledVector(aZ, sz).applyQuaternion(aQt).add(o.pos);
      // targets are built in the upright frame around S, then tilted with the body
      const sU = aS.clone().sub(o.pos).applyQuaternion(aQt.clone().invert()).add(o.pos);
      armHandTarget(o, i, sgn, row, sU, aH, t, L, walkF);
      aH.sub(o.pos).applyQuaternion(aQt).add(o.pos);
      aB.copy(o.side).multiplyScalar(-o.fdir * 0.9).addScaledVector(o.up, -0.35).applyQuaternion(aQt); // elbows bend backward
      const pts = solveChain(aS, aH, nseg, L + 0.02, thMax, aB, chainPts(nseg));
      for (let k = 0; k < nseg; k++) {
        stick(am.sticks[k], pts[k], pts[k + 1], thick * (1 - 0.08 * k / nseg));
        const jt = am.joints[k];
        jt.visible = true; jt.position.copy(pts[k]); jt.scale.setScalar(thick * (k === 0 ? 1.4 : 1.6));
      }
      am.hand.visible = true; am.hand.position.copy(pts[nseg]); am.hand.scale.setScalar(hr);
    }
  }

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
      divineStatus(o, dt, ctx.time);
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
