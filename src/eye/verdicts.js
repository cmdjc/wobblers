import { CAM_Z } from "../gfx/background.js";
import { N_FL } from "../fluid/render.js";
import { AUTO_SHAPES, GEAR } from "../shapes/shapes.js";
import { MAX_OBJS } from "../world/objects.js";

export const PUNISH = ['shrink', 'squash', 'fling', 'stone', 'melt', 'pop', 'sick'];
export const PRIZE = ['grow', 'legs', 'gold', 'gift', 'gift', 'gift', 'gift', 'heal', 'hug'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createVerdicts(ctx) {
  const { ey, objs, tmpV, fluid, FL } = ctx;
  const { boing, tone, impact, applySize, fitRoom, maxSizeFor, setLegs, addObj, removeObj, showFl, closeEditor } = ctx;
  const { spark, addRing, popText } = ctx;

  function chooseVerdict() {
    ey.verdict = Math.random() < 0.4 ? 'punish' : 'prize';
    ey.kind = ey.verdict === 'punish' ? PUNISH[(Math.random() * PUNISH.length) | 0] : PRIZE[(Math.random() * PRIZE.length) | 0];
  }

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

  const api = {
    chooseVerdict, dirFromEye, startStone, endStone, meltAway, popAway, applyPunish, giftShapes, startHug, applyPrize, gearJam, gearOverclock, divineStatus,
  };
  Object.assign(ctx, api);
  return api;
}
