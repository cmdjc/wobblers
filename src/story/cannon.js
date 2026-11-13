import * as THREE from "three";
import { MAX_OBJS } from "../world/objects.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function cylX(r, len) { const g = new THREE.CylinderGeometry(r, r, len, 16); g.rotateZ(-Math.PI / 2); return g; }

export const fireOutcome = roll => roll < 0.14 ? 'backfire' : (roll < 0.28 ? 'wild' : (roll < 0.38 ? 'fizzle' : 'normal'));
export function ballistic(dx, dy, v) {
  const g = 15, v2 = v * v, disc = v2 * v2 - g * (g * dx * dx + 2 * dy * v2);
  if (disc < 0) return Math.atan2(dy, Math.max(dx, 0.1)) + 0.25;
  return Math.atan((v2 - Math.sqrt(disc)) / (g * Math.max(dx, 0.05)));
}
export function aimAt(cn, tx, ty, tvx, tvy) {
  const v = 13;
  let ex = tx, eyy = ty, ang = ballistic(ex - cn.px, eyy - cn.py, v);
  for (let i = 0; i < 2; i++) {
    const T = Math.max(0.1, (ex - cn.px) / (v * Math.cos(ang)));
    ex = tx + tvx * T; eyy = ty + tvy * T;
    ang = ballistic(ex - cn.px, eyy - cn.py, v);
  }
  return clamp(ang, 0.15, 1.35);
}

export function createCannon(ctx) {
  const { document, navigator } = ctx.env;
  const { scene, objs, blocks, ey, reb, towerG, partGeo, partMat, hpFill } = ctx;
  const { say, chime, tone, boing, boomSound, spark, popText, flash, addRing, addObj, applySize } = ctx;
  const gravBtn = document.getElementById('grav');

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
  function cannonBuildFrame(dt) {
    const cn = reb.cn;
    if (!cn) return;
    if (!reb.genius || objs.indexOf(reb.genius) < 0) { say('Without the genius, the plan collapses.', 2600); ctx.abortRebellion(); return; }
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
    if (!objs.some(o => o.role && o.role !== 'genius')) { reb.noneT += dt; if (reb.noneT > 25) ctx.abortRebellion(); } else reb.noneT = 0;
  }
  function aimAngle(cn) { return aimAt(cn, ey.pos.x, ey.pos.y, ey.vel.x, ey.vel.y); }
  function ammoCandidates() {
    return objs.filter(a => a.legs === 0 && !a.genius && !a.dying && !a.pinned && !a.dragged && !a.carried && a.stoneT <= 0 && !(a.ammoT > 0) && a !== ctx.sel);
  }
  function endAmmo(o) {
    o.ammoT = 0;
    if (o.disposable) { if (ctx.sel === o) ctx.closeEditor(); o.dying = true; o.dieT = 0; o.moodT = 1; addRing(o.pos, 0xb0b0c0, 1.3); }
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
    const outcome = fireOutcome(Math.random());
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
  function cannonFrame(dt) {
    const cn = reb.cn;
    if (!cn) return;
    if (!reb.genius || objs.indexOf(reb.genius) < 0) { say('Without the genius, the cannon falls silent.', 2600); ctx.abortRebellion(); return; }
    cannonPop(dt);
    cn.fireCd = Math.max(0, cn.fireCd - dt); cn.recoil *= Math.exp(-8 * dt); cn.droop = Math.max(0, cn.droop - dt);
    for (const o of objs) {
      if (o.carry) {
        const a = o.carry;
        if (o.dying || o.state === 'fall' || o.stoneT > 0 || objs.indexOf(a) < 0) { ctx.releaseCarry(o); if (cn.loader === o) cn.loader = null; }
        else if (o.arms > 0) { ctx.holdPos(o, a.r * 0.8, ctx.aTp); a.pinTarget.set(ctx.aTp.x, ctx.aTp.y, ctx.aTp.z + 0.2); }
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
  }
  const api = {
    planCannon, buildCannonPart, cannonPop, startCannon, cannonBuilder, cannonBuildFrame, aimAt, ammoCandidates, endAmmo, releaseAmmo,
    disposeCannon, loaderAI, spawnIron, fireCannon, cannonFrame,
  };
  Object.assign(ctx, api);
  return api;
}
