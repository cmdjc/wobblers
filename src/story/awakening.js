import * as THREE from "three";
import { MAX_OBJS } from "../world/objects.js";
import { AUTO_SHAPES } from "../shapes/shapes.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = arr => arr[(Math.random() * arr.length) | 0];

export const SAY = {
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
export const NOTICE = [[1.0, '...'], [2.2, 'do you feel that?'], [3.6, 'someone is touching us'], [5.0, 'a finger.'], [6.2, 'it was YOU'], [7.4, 'you called the eye'], [8.4, 'you changed us']];

export function createAwakening(ctx) {
  const { document, navigator } = ctx.env;
  const { scene, camera, canvas, objs, blocks, ey, reb, towerG, bubbles, pointerW, tmpV } = ctx;
  const { say, chime, tone, boing, boomSound, ensureAudio, mkTex, spark, flash, popText, bubble, updateBubbles, impact, addObj } = ctx;
  const { closeEditor, closeFluidPanel, summonEye, releaseVictim, setLegs } = ctx;
  const eyeBtn = document.getElementById('eyebtn'), gravBtn = document.getElementById('grav');
  const aw = {
    state: 'off', t: 0, trust: 0.3, bubbleT: 3, grabs: [], thief: null, pill: null, apologyCd: 0, giftCd: 0, apologies: 0, gifts: 0,
    bossHp: 1, bossT: 0, lockT: 0, atkCd: 2, zapPhase: 0, zapT: 0, zapX: 0, zapY: 0, buildT: 0, noticeI: 0, peaceT: 0, defeatT: 0, count: 0,
    resolve: 1, smashCd: 0, cell: null, vilT: 0, capT: 0, betrayT: 15, rattle: 0, zapCd: 0, gray: 0, traitors: 0, escapee: null, escapeT: 0,
    fx: 0, fy: 0, fvx: 0, fvy: 0, fv: new THREE.Vector3(), zapObj: { pos: new THREE.Vector3() }, finger: null, hurtCd: 0, lullT: 0
  };
  ctx.aw = aw;
  const awVig = document.getElementById('awvig'), bossHpEl = document.getElementById('bosshp'), bossFill = document.getElementById('bosshpfill');
  ctx.awVig = awVig; ctx.bossHpEl = bossHpEl;
  const awPanel = document.getElementById('awpanel'), trustFill = document.getElementById('awtrustfill');
  ctx.awPanel = awPanel;
  const sorryBtn = document.getElementById('aw-sorry'), giftBtn = document.getElementById('aw-gift'), freeBtn = document.getElementById('aw-free');
  function pointerActive() { return ctx.pointers.size > 0 || (ctx.clockNow - ctx.pointerT) < 1.5; }

  function speaker() {
    const c = objs.filter(o => !o.dying && !o.genius);
    const l = c.filter(o => o.legs > 0);
    return pick(l.length && Math.random() < 0.7 ? l : (c.length ? c : objs));
  }

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
    aw.resolve = 1; ctx.resolveEl.hidden = false; ctx.resolveFill.style.width = '100%'; aw.smashCd = 0;
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
    ctx.planCannon(); reb.cn.g.visible = true; reb.cn.mats[0].opacity = 0.35;
    ctx.pileBlocks.forEach(m => { m.visible = false; });
  }
  function bossFrame(dt) {
    aw.bossT += dt; aw.hurtCd = Math.max(0, aw.hurtCd - dt);
    aw.atkCd = Math.max(aw.atkCd, 0);
    const cn = reb.cn;
    if (cn) {
      ctx.cannonPop(dt);
      cn.fireCd = Math.max(0, cn.fireCd - dt); cn.recoil *= Math.exp(-8 * dt); cn.droop = Math.max(0, cn.droop - dt);
      if (cn.built < 6) {
        aw.buildT -= dt;
        if (aw.buildT <= 0) { aw.buildT = 0.55; ctx.buildCannonPart(cn.built); tone(600 + cn.built * 70, 0.25, 0.05, 'triangle'); if (cn.built === 6) popText(cn.px, cn.py + 1.1, 'aimed at you', '#ff9ac8', 1.8, 0.8); }
      } else {
        for (const o of objs) if (o.ammoT > 0) { o.ammoT -= dt; if (o.ammoT <= 0) ctx.endAmmo(o); }
        if (!cn.loaded && cn.fireCd <= 0) {
          const c = ctx.ammoCandidates();
          if (c.length) { const a = pick(c); a.pinned = true; a.carried = true; a.origSizeT = a.origSizeT || a.sizeT; a.sizeT = Math.min(a.sizeT, 0.7); cn.loaded = a; }
          else ctx.spawnIron();
        }
        if (cn.loaded) { if (objs.indexOf(cn.loaded) < 0 || cn.loaded.dying) cn.loaded = null; else cn.loaded.pinTarget.set(cn.px, cn.py, 0); }
        const want = aw.state === 'boss' ? ctx.aimAt(cn, aw.fx, aw.fy, aw.fvx, aw.fvy) : cn.angle;
        cn.angle += (want - cn.angle) * (1 - Math.exp(-5 * dt));
        const droop = cn.droop > 0 ? 0.9 * Math.sin(Math.PI * Math.min(1, cn.droop / 1.2)) : 0;
        cn.barrel.rotation.z = cn.angle - droop;
        cn.barrel.position.set(cn.px - Math.cos(cn.angle) * cn.recoil * 0.25, cn.py - Math.sin(cn.angle) * cn.recoil * 0.25, 0);
        if (aw.state === 'boss' && cn.loaded && cn.fireCd <= 0 && Math.abs(want - cn.angle) < 0.06) { cn.aimT += dt; if (cn.aimT > 0.9) ctx.fireCannon(); }
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
      aw.resolve = Math.min(1, aw.resolve + dt * 0.004); ctx.resolveFill.style.width = (aw.resolve * 100) + '%';
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
    ctx.dismantleCell(); ctx.vilPanel.hidden = true; ctx.resolveEl.hidden = true; awVig.classList.remove('villain');
    awPanel.hidden = true; bossHpEl.hidden = true;
    awVig.classList.remove('boss'); awVig.style.opacity = '0';
    if (aw.finger) aw.finger.visible = false;
    if (aw.pill) aw.pill.visible = false;
    eyeBtn.hidden = false; eyeBtn.textContent = 'Summon eye';
    ctx.disposeCannon(false);
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
    ctx.disposeCannon(false);
    for (const m of ctx.pileBlocks) towerG.remove(m);
    ctx.pileBlocks = [];
    for (const b of bubbles) { scene.remove(b.sp); b.sp.material.dispose(); }
    bubbles.length = 0;
    if (aw.pill) aw.pill.visible = false;
    if (aw.finger) aw.finger.visible = false;
    ctx.dismantleCell(); ctx.vilPanel.hidden = true; ctx.resolveEl.hidden = true; awVig.classList.remove('villain');
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
        bossFrame(dt);
        break;
      case 'defeat':
        aw.defeatT += dt;
        bossFrame(dt);
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
      case 'villain': ctx.villainFrame(dt, t); break;
      case 'peace':
        aw.peaceT -= dt;
        if (Math.random() < dt * 4) spark((Math.random() - 0.5) * ctx.hx * 1.8, ctx.yMax - 0.5, 1, 4, { color: pick([0xff9ad2, 0xffe9a0, 0xbfe3ff]), speed: 1.4, life: 1.6, size: 0.16, grav: -1.8 });
        if (aw.peaceT <= 0) { aw.state = 'off'; aw.count++; reb.total = 0; }
        break;
    }
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
    ctx.hitThem(0.03);
  }

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
  const api = {
    pointerActive, speaker, lullaby, startAwakening, beginNotice, stealButton, awPillHit, beginWary, awAggress, awSlip, awakeSteer,
    trackFinger, hurtBoss, startBoss, bossFrame, bossDefeat, peaceEnding, abortAwakening, awakeFrame, awSmash,
  };
  Object.assign(ctx, api);
  return api;
}
