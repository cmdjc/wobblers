import * as THREE from "three";
import { SPARK_VS, SPARK_FS } from "./shaders.js";
import { CAM_Z, TAN } from "./background.js";

const SP_N = 280;

export function createFx(ctx) {
  const { window, document, navigator, setTimeout } = ctx.env;
  const { scene } = ctx;

  /* ---------- shockwave rings ---------- */
  const rings = [];
  const ringGeo = new THREE.RingGeometry(0.9, 1, 48);
  function addRing(p, color, max) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: color || 0xffa6e8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(p); m.scale.setScalar(0.2);
    scene.add(m); rings.push({ m, age: 0, max: max || 3.6 });
  }
  function updateRings(dt) {
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.age += dt;
      const k = r.age / 0.55;
      if (k >= 1) { scene.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); continue; }
      r.m.scale.setScalar(0.2 + k * (r.max - 0.2));
      r.m.material.opacity = 0.9 * (1 - k);
    }
  }
  function blast(p) {
    const { aw, tmpV } = ctx;
    const vil = aw.state === 'villain';
    addRing(p, vil ? 0xa04bff : undefined, vil ? 5 : undefined);
    if (vil) flash('#2a0a4a', 0.3);
    if (aw.state === 'boss') ctx.awBlastHurt(p);
    for (const o of ctx.objs) {
      if (o.dragged || o.pinned) continue;
      tmpV.copy(o.pos).sub(p);
      const dist = tmpV.length();
      if (dist > 3.4) continue;
      const f = 1 - dist / 3.4;
      if (dist < 1e-4) tmpV.set(0, 1, 0); else tmpV.multiplyScalar(1 / dist);
      o.vel.addScaledVector(tmpV, (vil ? 25 : 15) * f / Math.sqrt(o.density));
      o.vel.y += 3 * f;
      o.ang.x += (Math.random() - 0.5) * 8 * f; o.ang.y += (Math.random() - 0.5) * 8 * f;
      ctx.impact(o, tmpV, 10 * f + 2);
      o.moodT = 1.1;
    }
    ctx.boing(150, 0.1);
    ctx.fluid.blast(p.x, p.y, 3.2, 9);
    if (navigator.vibrate) navigator.vibrate(18);
  }

  /* ---------- sparks ---------- */
  const spPos = new Float32Array(SP_N * 3), spCol = new Float32Array(SP_N * 3), spAlpha = new Float32Array(SP_N), spSize = new Float32Array(SP_N);
  const spVel = new Float32Array(SP_N * 3), spAge = new Float32Array(SP_N).fill(99), spMax = new Float32Array(SP_N).fill(1), spGrav = new Float32Array(SP_N);
  const spGeo = new THREE.BufferGeometry();
  spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
  spGeo.setAttribute('aColor', new THREE.BufferAttribute(spCol, 3));
  spGeo.setAttribute('aAlpha', new THREE.BufferAttribute(spAlpha, 1));
  spGeo.setAttribute('aSize', new THREE.BufferAttribute(spSize, 1));
  const spMat = new THREE.ShaderMaterial({
    uniforms: { uPx: { value: 200 } },
    vertexShader: SPARK_VS,
    fragmentShader: SPARK_FS,
    blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false
  });
  const spPts = new THREE.Points(spGeo, spMat);
  spPts.frustumCulled = false; spPts.renderOrder = 6; scene.add(spPts);
  function updateSparkPx() { spMat.uniforms.uPx.value = window.innerHeight * Math.min(window.devicePixelRatio || 1, 2) / (2 * TAN * CAM_Z); }
  window.addEventListener('resize', updateSparkPx); window.addEventListener('load', updateSparkPx); updateSparkPx();
  const spC = new THREE.Color();
  function spark(x, y, z, n, o) {
    o = o || {};
    for (let k = 0; k < n; k++) {
      const i = ctx.spHead; ctx.spHead = (ctx.spHead + 1) % SP_N;
      const a = Math.random() * 6.2832, sp = (o.speed || 1.5) * (0.4 + Math.random() * 0.8), sr = o.spread || 0;
      spPos[3 * i] = x + (Math.random() - 0.5) * sr; spPos[3 * i + 1] = y + (Math.random() - 0.5) * sr; spPos[3 * i + 2] = z;
      spVel[3 * i] = Math.cos(a) * sp; spVel[3 * i + 1] = Math.sin(a) * sp + (o.up || 0);
      spC.setHex(o.color !== undefined ? o.color : 0xffd25a);
      spCol[3 * i] = spC.r; spCol[3 * i + 1] = spC.g; spCol[3 * i + 2] = spC.b;
      spAge[i] = 0; spMax[i] = (o.life || 1) * (0.6 + Math.random() * 0.7);
      spSize[i] = (o.size || 0.12) * (0.6 + Math.random() * 0.8);
      spGrav[i] = o.grav !== undefined ? o.grav : -2;
    }
  }
  function updateSparks(dt) {
    for (let i = 0; i < SP_N; i++) {
      if (spAge[i] >= spMax[i]) { spAlpha[i] = 0; continue; }
      spAge[i] += dt;
      spPos[3 * i] += spVel[3 * i] * dt; spPos[3 * i + 1] += spVel[3 * i + 1] * dt; spVel[3 * i + 1] += spGrav[i] * dt;
      const k = spAge[i] / spMax[i];
      spAlpha[i] = k >= 1 ? 0 : Math.min(1, k * 8) * (1 - k);
    }
    spGeo.attributes.position.needsUpdate = true; spGeo.attributes.aAlpha.needsUpdate = true;
    spGeo.attributes.aColor.needsUpdate = true; spGeo.attributes.aSize.needsUpdate = true;
  }

  /* ---------- screen flash ---------- */
  const flashEl = document.getElementById('flash');
  function flash(color, a) {
    flashEl.style.transition = 'none'; flashEl.style.background = color; flashEl.style.opacity = String(a);
    setTimeout(() => { flashEl.style.transition = 'opacity .45s'; flashEl.style.opacity = '0'; }, 40);
  }

  /* ---------- floating comic text ---------- */
  const popTexts = [];
  function popText(x, y, txt, color, life, size) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.textTex(txt, color || '#ffffff'), transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
    const w = size || 1.0;
    sp.position.set(x, y, 1.6); sp.scale.set(w * 2.2, w * 0.82, 1); sp.renderOrder = 7;
    scene.add(sp);
    popTexts.push({ sp, age: 0, life: life || 1.6, vy: 0.5 + Math.random() * 0.3 });
  }
  function updatePopTexts(dt) {
    for (let i = popTexts.length - 1; i >= 0; i--) {
      const p = popTexts[i];
      p.age += dt; p.sp.position.y += p.vy * dt;
      p.sp.material.opacity = Math.min(1, p.age * 6) * Math.max(0, 1 - p.age / p.life);
      if (p.age >= p.life) { scene.remove(p.sp); p.sp.material.dispose(); popTexts.splice(i, 1); }
    }
  }

  /* ---------- speech bubbles ---------- */
  const bubbles = [];
  function bubble(o, text, life) {
    if (!o || bubbles.length > 6) return;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.bubbleTex(text), transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
    sp.scale.set(1.9, 0.84, 1); sp.renderOrder = 7; scene.add(sp);
    bubbles.push({ sp, o, age: 0, life: life || 2.6 });
  }
  function updateBubbles(dt) {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.age += dt;
      if (b.age >= b.life || ctx.objs.indexOf(b.o) < 0) { scene.remove(b.sp); b.sp.material.dispose(); bubbles.splice(i, 1); continue; }
      b.sp.position.set(b.o.pos.x, b.o.pos.y + b.o.size * 0.55 + 0.7 + b.age * 0.08, 1.7);
      b.sp.material.opacity = Math.min(1, b.age * 5) * Math.min(1, (b.life - b.age) * 3);
    }
  }

  const api = {
    rings, popTexts, bubbles, spGeo, spMat, spAge, spMax,
    addRing, updateRings, blast, updateSparkPx, spark, updateSparks, flash, popText, updatePopTexts, bubble, updateBubbles,
  };
  Object.assign(ctx, {
    addRing, updateRings, blast, updateSparkPx, spark, updateSparks, flash, popText, updatePopTexts, bubble, updateBubbles,
  });
  return api;
}
