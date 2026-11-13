import * as THREE from "three";
import { CAM_Z } from "../gfx/background.js";
import { jointLimit, solveChain } from "./chain.js";

export const Y_AXIS = new THREE.Vector3(0, 1, 0), Z_AXIS = new THREE.Vector3(0, 0, 1);
const lgH = new THREE.Vector3(), lgF = new THREE.Vector3(), lgD = new THREE.Vector3(),
      lgB = new THREE.Vector3(), lgZ = new THREE.Vector3();
const lgQt = new THREE.Quaternion(), qA = new THREE.Quaternion(), qB = new THREE.Quaternion(),
      qC = new THREE.Quaternion(), qT = new THREE.Quaternion();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function defaultBeh() { return { wander: true, follow: false, flee: false, chase: false, seek: false, avoid: false }; }
export function footR(o) { return 0.09 * o.size * o.footScale; }
export function hipXZ(o, i) {
  const n = o.legs;
  if (n === 1) return [0, 0];
  if (n === 2) return [(i ? 1 : -1) * 0.55 * o.halfW, 0];
  const a = 6.2832 * i / n + 0.785;
  return [Math.cos(a) * 0.6 * o.halfW, Math.sin(a) * 0.55 * o.halfD];
}

export function createLegs(ctx) {
  const { scene, objs, tmpG, tmpV, pointerW, pointers, fluid, smp } = ctx;
  const { applySize, impact, boing, gravityAt, buildCollider } = ctx;
  const legCyl = new THREE.CylinderGeometry(1, 1, 1, 8, 1), legBall = new THREE.SphereGeometry(1, 14, 10);
  ctx.legCyl = legCyl; ctx.legBall = legBall;

  const chainPool = [];
  function chainPts(n) { while (chainPool.length < n + 1) chainPool.push(new THREE.Vector3()); return chainPool; }
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

    if (ctx.aw.state !== 'off' && ctx.aw.state !== 'pending' && ctx.aw.state !== 'peace' && !o.role) { ctx.awakeSteer(o, dt, t); return; }
    if (o.role) { ctx.rebelSteer(o, dt, t); return; }
    if (o.arms > 0 && ctx.armSteer(o)) return;

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

  const api = { chainPts, defaultBeh, footR, hipXZ, clearLegs, buildLegs, setLegs, startFall, legBrain, orientLegged, stick, updateLegs };
  Object.assign(ctx, api);
  return api;
}
