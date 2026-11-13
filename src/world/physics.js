import * as THREE from "three";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const G = 15;
export const DRAG_K = [0.08, 0.08, 0.5, 0.7, 0.1];
const pinSpin = new THREE.Vector3(0, 0.7, 0);
const tmpA = new THREE.Vector3();
const dq = new THREE.Quaternion();

export function createPhysics(ctx) {
  const { tmpG, tmpV, tmpV2, qInv } = ctx;
  function impact(o, n, speed) {
    const s = Math.min(speed, 14);
    qInv.copy(o.mesh.quaternion).invert();
    tmpV2.copy(n).applyQuaternion(qInv).normalize();
    if (o.axis.dot(tmpV2) < 0) tmpV2.negate();
    o.axis.lerp(tmpV2, 0.8);
    if (o.axis.lengthSq() < 1e-6) o.axis.copy(tmpV2);
    o.axis.normalize();
    const wp = Math.max(o.wob, 0), gn = o.wob < 0 ? 1 + o.wob : 1;
    o.qv -= s * 0.7 * (1 + 0.6 * wp) * gn;
    o.rip = Math.min(0.14 + 0.02 * wp, o.rip + s * 0.008 * (1 + 0.4 * wp) * gn);
    if (speed > 2.2) ctx.boing(240 * o.pitch, s * 0.009);
  }

  /* ---------- physics ---------- */
  function gravityAt(o, t) {
    switch (ctx.gMode) {
      case 0: tmpG.set(0, -G, 0); break;
      case 1: tmpG.set(0, G * 0.8, 0); break;
      case 2: tmpG.set(Math.sin(t * 0.6 + o.id) * 1.4, Math.cos(t * 0.5 + o.id * 2) * 1.4, 0); break;
      case 3: tmpG.copy(o.pos).multiplyScalar(-7); tmpG.z *= 0.3; break;
      default: { const a = t * 0.9; tmpG.set(Math.sin(a) * G * 0.7, -Math.cos(a) * G * 0.7, 0); }
    }
  }

  function wallHit(o, nx, ny, nz, rx, ry, rz) {
    tmpA.set(nx, ny, nz);
    if (o.legs > 0 && tmpA.dot(o.up) > 0.6) o.groundT = 0.12;
    const vn = o.vel.dot(tmpA);
    const free = !o.dragged && !o.pinned;
    if (vn < 0) {
      const sp = -vn;
      const thr = o.bounce > 0.95 ? 0.4 : 1.5;
      const e = (sp > thr && free) ? o.bounce * 0.96 * (o.legs > 0 ? 0.25 : 1) : 0;
      o.vel.addScaledVector(tmpA, -(1 + e) * vn);
      if (sp > 1.5) impact(o, tmpA, sp);
      if (o.legs > 0 && sp > 6 && Math.random() < 0.5 * (0.3 + o.clumsy)) o.tripNow = true;
      if (free) { // off-center contact tips the shape (a tilted pancake settles flat)
        const k = (1 + e) * sp * 0.5 / (0.4 * o.r * o.r);
        o.ang.x += (ry * nz - rz * ny) * k;
        o.ang.y += (rz * nx - rx * nz) * k;
        o.ang.z += (rx * ny - ry * nx) * k;
      }
    }
    if (free) {
      tmpV.copy(o.vel).addScaledVector(tmpA, -o.vel.dot(tmpA));
      o.vel.addScaledVector(tmpV, -o.friction * 0.05);
      tmpV2.crossVectors(tmpA, tmpV).multiplyScalar(1 / o.r);
      o.ang.lerp(tmpV2, tmpV.length() > 0.3 ? 0.267 * o.friction : 0.02);
    }
  }
  function walls(o) {
    const p = o.pos, n = o.cn, wo = o.wo, rad = o.cRad;
    for (let a = 0; a < 3; a++) {
      const U = a === 0 ? ctx.hx : (a === 1 ? ctx.yMax : ctx.hz);
      const Lw = a === 0 ? -ctx.hx : (a === 1 ? ctx.yMin : -ctx.hz);
      for (let s = 1; s >= -1; s -= 2) {
        let ext = -1e9;
        for (let k = 0; k < n; k++) { const v = s * wo[3 * k + a] + rad[k]; if (v > ext) ext = v; }
        const cur = a === 0 ? p.x : (a === 1 ? p.y : p.z);
        if (!(s > 0 ? cur + ext > U : cur - ext < Lw)) continue;
        const np = s > 0 ? U - ext : Lw + ext;
        if (a === 0) p.x = np; else if (a === 1) p.y = np; else p.z = np;
        let rx = 0, ry = 0, rz = 0, c = 0;
        for (let k = 0; k < n; k++) {
          if (s * wo[3 * k + a] + rad[k] > ext - 0.015) { rx += wo[3 * k]; ry += wo[3 * k + 1]; rz += wo[3 * k + 2]; c++; }
        }
        rx /= c; ry /= c; rz /= c;
        if (a === 0) rx = s * ext; else if (a === 1) ry = s * ext; else rz = s * ext;
        wallHit(o, a === 0 ? -s : 0, a === 1 ? -s : 0, a === 2 ? -s : 0, rx, ry, rz);
      }
    }
  }
  function collide() {
    for (let i = 0; i < ctx.objs.length; i++) {
      const a = ctx.objs[i];
      if (a.dying) continue;
      for (let j = i + 1; j < ctx.objs.length; j++) {
        const b = ctx.objs[j];
        if (b.dying) continue;
        const bx = b.pos.x - a.pos.x, by = b.pos.y - a.pos.y, bz = b.pos.z - a.pos.z;
        const bound = a.r + b.r;
        if (bx * bx + by * by + bz * bz >= bound * bound) continue;
        let best = 0, bi = -1, bj = -1, nx = 0, ny = 1, nz = 0;
        for (let u = 0; u < a.cn; u++) {
          const ax = bx - a.wo[3 * u], ay = by - a.wo[3 * u + 1], az = bz - a.wo[3 * u + 2];
          for (let w = 0; w < b.cn; w++) {
            const dx = ax + b.wo[3 * w], dy = ay + b.wo[3 * w + 1], dz = az + b.wo[3 * w + 2];
            const rs = a.cRad[u] + b.cRad[w];
            const dd = dx * dx + dy * dy + dz * dz;
            if (dd < rs * rs) {
              const dist = Math.sqrt(dd), pen = rs - dist;
              if (pen > best) {
                best = pen; bi = u; bj = w;
                if (dist > 1e-6) { nx = dx / dist; ny = dy / dist; nz = dz / dist; } else { nx = 0; ny = 1; nz = 0; }
              }
            }
          }
        }
        if (bi < 0) continue;
        tmpV.set(nx, ny, nz);
        if (b.legs > 0 && tmpV.dot(b.up) > 0.6) b.groundT = 0.12;
        if (a.legs > 0 && -tmpV.dot(a.up) > 0.6) a.groundT = 0.12;
        const aFree = !(a.dragged || a.pinned), bFree = !(b.dragged || b.pinned);
        const invA = 1 / (aFree ? a.mass : a.mass * 10);
        const invB = 1 / (bFree ? b.mass : b.mass * 10);
        const corr = best / (invA + invB);
        a.pos.addScaledVector(tmpV, -corr * invA);
        b.pos.addScaledVector(tmpV, corr * invB);
        tmpV2.copy(b.vel).sub(a.vel);
        const vn = tmpV2.dot(tmpV);
        if (vn < 0) {
          const jn = -(1 + Math.min(1.15, (a.bounce + b.bounce) * 0.565)) * vn / (invA + invB);
          a.vel.addScaledVector(tmpV, -jn * invA);
          b.vel.addScaledVector(tmpV, jn * invB);
          const sp = -vn;
          if (sp > 0.8) { impact(a, tmpV, sp); impact(b, tmpV, sp); }
          if (sp > 3) {
            if (a.legs > 0 && Math.random() < 0.25 + 0.5 * a.clumsy) a.tripNow = true;
            if (b.legs > 0 && Math.random() < 0.25 + 0.5 * b.clumsy) b.tripNow = true;
          }
          if (aFree) {
            const rx = a.wo[3 * bi] + nx * a.cRad[bi], ry = a.wo[3 * bi + 1] + ny * a.cRad[bi], rz = a.wo[3 * bi + 2] + nz * a.cRad[bi];
            const k = -jn * invA * 0.5 / (0.4 * a.r * a.r);
            a.ang.x += (ry * nz - rz * ny) * k; a.ang.y += (rz * nx - rx * nz) * k; a.ang.z += (rx * ny - ry * nx) * k;
          }
          if (bFree) {
            const rx = b.wo[3 * bj] - nx * b.cRad[bj], ry = b.wo[3 * bj + 1] - ny * b.cRad[bj], rz = b.wo[3 * bj + 2] - nz * b.cRad[bj];
            const k = jn * invB * 0.5 / (0.4 * b.r * b.r);
            b.ang.x += (ry * nz - rz * ny) * k; b.ang.y += (rz * nx - rx * nz) * k; b.ang.z += (rx * ny - ry * nx) * k;
          }
        }
      }
    }
  }
  function jelly(o, dt) {
    // wob > 0 = floppier, wob < 0 = stiffer, wob = -1 = fully rigid (g = 0 kills every deformation)
    const w = o.wob, neg = w < 0, g = neg ? 1 + w : 1, wp = neg ? 0 : w, st = neg ? 1 - 3 * w : 1;
    const K = 230 / (1 + 0.45 * wp) * st, C = 5.5 / (1 + 0.6 * wp) * st;
    if (wp > 0 && Math.abs(o.q) < 0.08 && Math.random() < dt * 1.2 * wp) {
      o.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      o.qv += (Math.random() - 0.5) * (6 + 3 * wp);
    }
    o.qv += (-K * o.q - C * o.qv) * dt;
    o.q = clamp(o.q + o.qv * dt, -(0.5 + 0.09 * wp) * g, (0.55 + 0.15 * wp) * g);

    const pt = (o.dragged ? 1 + Math.min(o.holdT, 1) * 0.4 : 0) * g;
    o.holdT = o.dragged ? o.holdT + dt : 0;
    o.pv += (-260 * (o.p - pt) - 6.5 * o.pv) * dt;
    o.p = clamp(o.p + o.pv * dt, -0.7 * g, 1.5 * g);

    qInv.copy(o.mesh.quaternion).invert();
    o.pressLocal.copy(o.pressWorld).applyQuaternion(qInv);

    tmpV.copy(o.vel).applyQuaternion(qInv).multiplyScalar(-0.028 * (1 + 0.5 * wp) * g);
    const lm = 0.34 * (1 + 0.3 * wp) * g;
    if (tmpV.length() > lm) tmpV.setLength(lm);
    tmpV.sub(o.lag).multiplyScalar(170);
    o.lagv.addScaledVector(tmpV, dt);
    o.lagv.multiplyScalar(Math.max(0, 1 - (7 / (1 + 0.5 * wp)) * dt));
    o.lag.addScaledVector(o.lagv, dt);
  }
  function spin(o, dt) {
    if (o.legs > 0) { // legged shapes keep themselves upright instead of tumbling
      ctx.orientLegged(o, dt);
      o.rip *= Math.exp(-4 * dt);
      o.moodT = Math.max(0, o.moodT - dt);
      return;
    }
    o.ang.multiplyScalar(Math.exp(-0.35 * dt));
    if (o.pinned) o.ang.lerp(pinSpin, 0.04);
    let w = o.ang.length();
    if (w > 14) { o.ang.multiplyScalar(14 / w); w = 14; }
    if (w > 1e-4) {
      tmpV.copy(o.ang).multiplyScalar(1 / w);
      dq.setFromAxisAngle(tmpV, w * dt);
      o.mesh.quaternion.premultiply(dq).normalize();
    }
    o.rip *= Math.exp(-4 * dt);
    o.moodT = Math.max(0, o.moodT - dt);
  }
  function step(dt, t) {
    for (const o of ctx.objs) {
      if (o.dragged) {
        tmpV.copy(o.drag.target).sub(o.pos).multiplyScalar(26);
        const sp = tmpV.length();
        if (sp > 45) tmpV.multiplyScalar(45 / sp);
        o.vel.lerp(tmpV, 1 - Math.exp(-28 * dt));
      } else if (o.pinned) {
        tmpV.copy(o.pinTarget).sub(o.pos).multiplyScalar(8);
        o.vel.lerp(tmpV, 1 - Math.exp(-10 * dt));
      } else {
        gravityAt(o, t);
        o.vel.addScaledVector(tmpG, dt * o.gScale);
        o.vel.multiplyScalar(Math.exp(-DRAG_K[ctx.gMode] * dt / Math.sqrt(o.density)));
        o.vel.z -= o.pos.z * 3 * dt;
        if (o.legs > 0 && o.groundT > 0 && o.hopT <= 0) { // feet on the ground: walk toward the target speed (or skid if fallen)
          const vs = o.vel.dot(o.side);
          if (o.state === 'fall') o.vel.addScaledVector(o.side, -vs * (1 - Math.exp(-2.5 * dt)));
          else o.vel.addScaledVector(o.side, (o.vTarget - vs) * (1 - Math.exp(-9 * dt)));
        }
      }
      o.pos.addScaledVector(o.vel, dt);
    }
    for (const o of ctx.objs) ctx.updateWO(o);
    collide();
    for (const o of ctx.objs) { if (ctx.blocks.length) ctx.collideBlocks(o); walls(o); jelly(o, dt); spin(o, dt); }
  }
  const api = { impact, gravityAt, wallHit, walls, collide, jelly, spin, step };
  Object.assign(ctx, api);
  return api;
}
