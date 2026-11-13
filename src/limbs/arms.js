import * as THREE from "three";
import { jointLimit, solveChain } from "./chain.js";
import { Z_AXIS } from "./legs.js";

const aQt = new THREE.Quaternion(), aZ = new THREE.Vector3(), aS = new THREE.Vector3(), aH = new THREE.Vector3(),
      aB = new THREE.Vector3(), aOff = new THREE.Vector3();

export function defaultAbeh() { return { gesture: true, punch: true, grab: true, hug: true }; }

export function createArms(ctx) {
  const { scene, objs, tmpV, ey, reb, aw, pointerW, legCyl, legBall } = ctx;
  const { impact, boing, spark, popText, hurtBoss, pointerActive, chainPts, stick } = ctx;
  const aTp = new THREE.Vector3();
  ctx.aTp = aTp;
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
    const ai = o.ai;
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
  function armSteer(o) {
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

  const api = {
    defaultAbeh, clearArms, buildArms, setArms, holdPos, armFor, armReach, armSetMode, armCancel, armCalm, armItemOk, armPickItem,
    holdItem, startPunch, punchLand, endHeld, armHug, armTick, armIdle, armSteer, armHandTarget, updateArms,
  };
  Object.assign(ctx, api);
  return api;
}
