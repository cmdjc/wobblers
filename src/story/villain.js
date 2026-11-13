import * as THREE from "three";
import { SAY } from "./awakening.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = arr => arr[(Math.random() * arr.length) | 0];

export function createVillain(ctx) {
  const { document } = ctx.env;
  const { scene, objs, blocks, aw, ey, towerG, pointerW, tmpV } = ctx;
  const { chime, tone, ensureAudio, mkTex, spark, flash, say, bubble, impact, summonEye } = ctx;
  const gravBtn = document.getElementById('grav');
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
    ctx.bossHpEl.hidden = true; resolveEl.hidden = true; ctx.awPanel.hidden = true; vilPanel.hidden = false;
    ctx.awVig.classList.remove('boss'); ctx.awVig.classList.add('villain'); ctx.awVig.style.opacity = '1';
    if (aw.finger) aw.finger.visible = false;
    aw.zapPhase = 0;
    ctx.disposeCannon(false);
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
  vilFree.addEventListener('click', () => { ensureAudio(); if (aw.state === 'villain') ctx.peaceEnding('released'); });
  const api = {
    hitThem, awBlastHurt, planCell, dismantleCell, startVillain, rattle, rattleMove, commandZap, villainTap, escapeCell, villainFrame,
  };
  Object.assign(ctx, api);
  return api;
}
