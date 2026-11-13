import * as THREE from "three";
import { VS, EYE_FS } from "../gfx/shaders.js";
import { CAM_Z } from "../gfx/background.js";
import { N_FL } from "../fluid/render.js";
import { AUTO_SHAPES, GEAR } from "../shapes/shapes.js";
import { MAX_OBJS } from "../world/objects.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = arr => arr[(Math.random() * arr.length) | 0];
const spC = new THREE.Color();

export function createEye(ctx) {
  const { document, navigator } = ctx.env;
  const { scene, objs, tmpV, tmpV2, timeU, fluid, FL, pointerW } = ctx;
  const { say, hideHint, ensureAudio, chime, tone, zapSound, boomSound, boing, haloTexture, applySize, impact, fitRoom, maxSizeFor } = ctx;
  const { setLegs, addObj, removeObj, showFl, closeEditor, spark, addRing, flash, popText, bubble, updateSparks } = ctx;

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
  omenRing.visible = false; omenRing.renderOrder = 5; scene.add(omenRing);


  // the eye itself
  const ey = {
    state: 'off', t: 0, built: false, g: null, pos: new THREE.Vector3(), vel: new THREE.Vector3(), target: new THREE.Vector3(),
    gaze: new THREE.Vector3(0, 0, 1), axis: new THREE.Vector3(0, 1, 0), lag: new THREE.Vector3(), lagv: new THREE.Vector3(),
    q: 0, qv: 0, flap: 0, alpha: 0, s: 1.0, left: 0, nextT: 0, omenT: 0, vT: 0, vTot: 1, hugT: 0, boltT: 0, heartT: 0,
    victim: null, verdict: '', kind: '', scanT: 0, scanObj: null, glowK: 0, hint: 0,
    hp: 1, battleMode: false, allyMode: false, atkT: 0, aim: 0, zapT: 0, zapTarget: null, defT: 0, dead: false
  };
  ctx.ey = ey;
  function buildEye() {
    const g = new THREE.Group();
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
  function summonEye() {
    if (!ey.built) buildEye();
    ey.state = 'arrive'; ey.t = 0; ey.alpha = 0; ey.dead = false; ey.hp = 1; ey.aim = 0; ey.zapT = 0;
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
  function divineStatus(o, dt) {
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
    const { reb } = ctx;
    releaseVictim();
    reb.total++;
    ey.left--;
    if (ey.left <= 0) { ey.state = 'leave'; eyeBtn.textContent = 'Summon eye'; chime([784, 659, 523], 200, 0.04); }
    else { ey.state = 'roam'; ey.nextT = 3 + Math.random() * 2.5; }
  }
  function eyeFrame(dt, t) {
    const { reb, aw } = ctx;
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
            if (reb.state === 'off' && reb.total >= ctx.REBEL_AT - 1 && ctx.countLegged() < 2 && Math.random() < 0.7) { // nudge: the uprising needs legs
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
              applyPunish(tv, ctx.BATTLE_PUNISH[(Math.random() * ctx.BATTLE_PUNISH.length) | 0]);
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
              if (ey.hp <= 0) { ctx.defeatEye(); break; }
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
              if (ey.hp <= 0) { ctx.defeatEye(); break; }
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
            if (Math.hypot(aw.fx - aw.zapX, aw.fy - aw.zapY) < 0.8) ctx.hurtBoss(0.09);
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
          ctx.startCelebration();
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

    // --- flying (a floaty spring toward the target) ---
    ey.target.set(tx, ty, tz);
    tmpV.copy(ey.target).sub(ey.pos).multiplyScalar(ey.state === 'arrive' ? 3 : 7).addScaledVector(ey.vel, -4.4);
    ey.vel.addScaledVector(tmpV, dt);
    ey.pos.addScaledVector(ey.vel, dt);

    // --- bob and squash kick ---
    const prevCycle = Math.floor((ey.flap + Math.PI / 2) / (2 * Math.PI));
    ey.flap += dt * (ey.state === 'roam' ? 6.5 : (ey.state === 'hug' ? 3.5 : 9));
    if (Math.floor((ey.flap + Math.PI / 2) / (2 * Math.PI)) !== prevCycle) ey.qv -= 0.9;

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

  const api = {
    makeRibbon, setRibbon, buildEye, summonEye, releaseVictim, dismissEye, dirFromEye, startStone, endStone, meltAway,
    popAway, applyPunish, giftShapes, startHug, applyPrize, gearJam, gearOverclock, divineStatus, pickVictim, eyeFinish, eyeFrame,
  };
  Object.assign(ctx, api);
  return { ...api, ey, eyeBtn };
}
