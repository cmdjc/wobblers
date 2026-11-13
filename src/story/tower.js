import * as THREE from "three";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const PP = 3, REBEL_AT = 3;
export const BATTLE_PUNISH = ['fling', 'fling', 'fling', 'sick', 'stone', 'shrink'];

export function createTower(ctx) {
  const { document, navigator, setTimeout } = ctx.env;
  const { scene, objs, blocks, ey } = ctx;
  const { say, chime, tone, boing, ensureAudio, summonEye, releaseVictim, spark, flash, updatePopTexts } = ctx;
  const eyeBtn = document.getElementById('eyebtn'), gravBtn = document.getElementById('grav');
  ctx.REBEL_AT = REBEL_AT; ctx.BATTLE_PUNISH = BATTLE_PUNISH;
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
    ctx.disposeCannon(retire);
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
    if (reb.genius && objs.indexOf(reb.genius) >= 0) { ctx.startCannon(); return; }
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
      if (o.legs > 0 && !o.dying) { o.role = o.genius ? 'genius' : 'celebrate'; dropCarry(o); o.goldT = 9; o.moodT = 3; o.energy = 1; o.state = 'walk'; o.tiltT = 0; o.sickT = 0; if (o.stoneT > 0) ctx.endStone(o); }
    }
    say('The wobblers are free!', 4500);
    chime([523, 659, 784, 1047, 1319], 150, 0.06);
  }
  function defeatEye() {
    reb.state = 'victory';
    ey.state = 'defeated'; ey.defT = 0; ey.dead = true; ey.aim = 0; ey.zapT = 0;
    ey.hp = 0; hpFill.style.width = '0%';
    for (const o of objs) { if (o.role && o.role !== 'genius') o.role = 'celebrate'; }
    ctx.releaseAmmo();
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
    if (o.role === 'genius') { ctx.geniusAI(o, dt, t, grounded); }
    else if (reb.kind === 'cannon' && (o.role === 'builder' || o.role === 'loader')) {
      if (o.role === 'builder') ctx.cannonBuilder(o, grounded, spd); else ctx.loaderAI(o, grounded, spd);
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
  function rebelFrame(dt) {
    updatePopTexts(dt);
    if (reb.genius && objs.indexOf(reb.genius) < 0) reb.genius = null;
    if (reb.state === 'off') {
      if (!reb.genius && !reb.geniusRolled && reb.total >= 2) { reb.geniusRolled = true; if (Math.random() < 0.6) ctx.spawnGenius(); }
      if (reb.total >= REBEL_AT && ey.state !== 'omen' && ey.state !== 'verdict') {
        if (countLegged() >= 2) startBuild();
        else if (!reb.hinted) { reb.hinted = true; say('The wobblers whisper of rebellion. Give a few of them legs...', 4200); }
      }
      return;
    }
    reb.t += dt;
    for (const o of objs) {
      if (o.carryMesh) {
        if (o.arms > 0) { ctx.holdPos(o, 0.2, ctx.aTp); o.carryMesh.position.copy(ctx.aTp); } else o.carryMesh.position.set(o.pos.x, o.pos.y + o.r + 0.18, o.pos.z);
        o.carryMesh.rotation.y += dt * 2;
      }
    }
    for (const p of reb.pieces) {
      if (p.mesh && p.popT < 1) { p.popT = Math.min(1, p.popT + dt / 0.3); p.mesh.scale.y = 0.2 + 0.8 * (1 - Math.pow(1 - p.popT, 3)); }
    }
    switch (reb.state) {
      case 'build':
        refreshRoles('builder');
        if (reb.kind === 'cannon') { ctx.cannonBuildFrame(dt); break; }
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
        if (reb.kind === 'cannon') ctx.cannonFrame(dt);
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
          ctx.startAwakening();
          say(wasCannon ? 'The cannon falls silent. The genius vanishes in a flash of ideas.' : 'The tower crumbles into stardust.', 3200);
        }
        break;
    }
  }

  const api = { countLegged, dropCarry, abortRebellion, defeatEye, startCelebration, rebelSteer, rebelFrame };
  Object.assign(ctx, api);
  return { ...api, reb, towerG, hpFill, chargeBtn, partGeo, partMat };
}
