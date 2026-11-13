import * as THREE from "three";
import { CAM_Z } from "../gfx/background.js";
import { GEAR } from "../shapes/shapes.js";
import { N_FL } from "./render.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createFluidCoupling(ctx) {
  const { performance } = ctx.env;
  const { objs, tmpG, fluid, FL, blobGeo, blobPos, blobSpd, fluidQuad, ray } = ctx;
  const { boing, gravityAt } = ctx;

  const OB_MAX = 40, OB_SPH = 140;
  const obB = new Float32Array(5 * OB_MAX), obS = new Float32Array(3 * OB_MAX * OB_SPH), obStart = new Int32Array(OB_MAX + 1);
  function buildObstacles() {
    let m = 0, kS = 0;
    for (const o of objs) {
      if (o.dying) continue;
      if (m >= OB_MAX || kS + o.cn > OB_MAX * OB_SPH) break;
      const kc = CAM_Z / (CAM_Z - o.pos.z);
      const ccx = o.pos.x * kc, ccy = o.pos.y * kc;
      obStart[m] = kS;
      let R = 0;
      for (let k = 0; k < o.cn; k++) {
        const kk = CAM_Z / (CAM_Z - (o.pos.z + o.wo[3 * k + 2]));
        const sx = (o.pos.x + o.wo[3 * k]) * kk, sy = (o.pos.y + o.wo[3 * k + 1]) * kk, sr = o.cRad[k] * kk;
        obS[3 * kS] = sx; obS[3 * kS + 1] = sy; obS[3 * kS + 2] = sr; kS++;
        R = Math.max(R, Math.hypot(sx - ccx, sy - ccy) + sr);
      }
      obB[5 * m] = ccx; obB[5 * m + 1] = ccy; obB[5 * m + 2] = R;
      obB[5 * m + 3] = o.vel.x * kc; obB[5 * m + 4] = o.vel.y * kc;
      m++;
    }
    for (const b of ctx.blocks) { // the tower is solid to the liquid too
      const rr = (b.y1 - b.y0) / 2, cnt = Math.max(1, Math.ceil((b.x1 - b.x0) / (rr * 1.6)));
      if (m >= OB_MAX || kS + cnt > OB_MAX * OB_SPH) break;
      obStart[m] = kS;
      const cy = (b.y0 + b.y1) / 2, cx = (b.x0 + b.x1) / 2;
      for (let i = 0; i < cnt; i++) {
        obS[3 * kS] = b.x0 + rr + (b.x1 - b.x0 - 2 * rr) * (cnt > 1 ? i / (cnt - 1) : 0.5); obS[3 * kS + 1] = cy; obS[3 * kS + 2] = rr; kS++;
      }
      obB[5 * m] = cx; obB[5 * m + 1] = cy; obB[5 * m + 2] = (b.x1 - b.x0) / 2 + rr; obB[5 * m + 3] = 0; obB[5 * m + 4] = 0;
      m++;
    }
    obStart[m] = kS;
    fluid.setObstacles(obB, obS, obStart, m);
  }
  const smp = [0, 0, 0];
  const flow = { x: 0, y: 0 };
  // How much of the shape is under the surface? Probe points just outside its spheres and see if liquid is there.
  function wetness(o) {
    const s = fluid.s, rc = 1.6 * s, need = 0.55 * Math.PI * 1.6 * 1.6;
    const kc = CAM_Z / (CAM_Z - o.pos.z);
    fluid.sample(o.pos.x * kc, o.pos.y * kc, (o.r + 1.5 * s) * kc, smp);
    if (smp[0] === 0) return 0;
    let wetW = 0, totW = 0, fvx = 0, fvy = 0, fc = 0;
    const stride = o.cn > 16 ? 2 : 1;
    for (let k = 0; k < o.cn; k += stride) {
      const kk = CAM_Z / (CAM_Z - (o.pos.z + o.wo[3 * k + 2]));
      const cx = (o.pos.x + o.wo[3 * k]) * kk, cy = (o.pos.y + o.wo[3 * k + 1]) * kk, sr = o.cRad[k] * kk;
      const wgt = sr * sr;
      for (let a = 0; a < 6; a++) {
        const ang = a * 1.0472 + k * 0.7;
        const qx = cx + (sr + 0.75 * s) * Math.cos(ang), qy = cy + (sr + 0.75 * s) * Math.sin(ang);
        let inside = false;
        for (let j = 0; j < o.cn && !inside; j++) {
          if (j === k) continue;
          const jk = CAM_Z / (CAM_Z - (o.pos.z + o.wo[3 * j + 2]));
          const dx = qx - (o.pos.x + o.wo[3 * j]) * jk, dy = qy - (o.pos.y + o.wo[3 * j + 1]) * jk, rr = o.cRad[j] * jk;
          if (dx * dx + dy * dy < rr * rr) inside = true;
        }
        if (inside) continue;
        fluid.sample(qx, qy, rc, smp);
        wetW += Math.min(smp[0] / (need / (s * s) * s * s), 1) * wgt; totW += wgt;
        fvx += smp[1]; fvy += smp[2]; fc += smp[0];
      }
    }
    if (fc > 0) { flow.x = fvx / fc / kc; flow.y = fvy / fc / kc; } else { flow.x = 0; flow.y = 0; }
    return totW > 0 ? wetW / totW : 0;
  }
  function coupleObjects(dt, t) {
    for (const o of objs) {
      if (o.dying) continue;
      const f = (o.dragged || o.pinned) ? 0 : wetness(o);
      if (f > 0.35 && !o.wasWet && o.vel.length() > 4) { boing(150 * o.pitch, 0.06); o.rip = Math.min(0.14, o.rip + 0.08); }
      o.wasWet = f > 0.2;
      if (o.shape === GEAR && o.legs === 0 && f > 0.05) gearFluid(o, f, dt);
      if (f < 0.03) continue;
      gravityAt(o, t);
      o.vel.addScaledVector(tmpG, -dt * o.gScale * f * Math.min(FL.dens / o.density, 12));
      const dragK = f * (1.2 + 7 * FL.visc) / Math.sqrt(o.density);
      const k = 1 - Math.exp(-dragK * dt);
      o.vel.x += (flow.x - o.vel.x) * k; o.vel.y += (flow.y - o.vel.y) * k;
      o.vel.z *= Math.exp(-dragK * 0.5 * dt);
      o.ang.multiplyScalar(Math.exp(-f * 1.5 * dt));
    }
  }
  // a gear in the water is a paddle wheel: the flow turns it, and its teeth drag the water around
  function gearFluid(o, f, dt) {
    const kc = CAM_Z / (CAM_Z - o.pos.z), R = 0.5 * o.size * Math.max(o.sx, o.sy) * kc;
    let vt = 0;
    for (let a = 0; a < 4; a++) {
      const ang = a * Math.PI / 2 + 0.4;
      fluid.sample(o.pos.x * kc + Math.cos(ang) * R * 1.35, o.pos.y * kc + Math.sin(ang) * R * 1.35, R * 0.8, smp);
      if (smp[0] > 0) vt += (-Math.sin(ang) * smp[1] + Math.cos(ang) * smp[2]) / smp[0];
    }
    vt /= 4;
    const w = clamp(vt / Math.max(R, 0.2), -10, 10);
    o.ang.z += (w - o.ang.z) * (1 - Math.exp(-2.5 * f * dt));
    fluid.swirl(o.pos.x * kc, o.pos.y * kc, R * 1.45, o.ang.z * 0.3 * f);
  }
  function fluidFrame(dt, t) {
    fluid.F.mode = ctx.gMode; fluid.F.t = t; fluid.F.visc = FL.visc;
    const target = Math.round(FL.amount * N_FL);
    if (fluid.n < target) fluid.spawn(Math.min(9, target - fluid.n), true);
    else if (fluid.n > target) fluid.drain(Math.min(14, fluid.n - target));
    fluidQuad.visible = fluid.n > 0;
    if (fluid.n === 0) { blobGeo.setDrawRange(0, 0); return; }
    ctx.fluidAcc += dt;
    let steps = 0;
    buildObstacles();
    while (ctx.fluidAcc >= 1 / 60 && steps < 2) {
      const t0 = performance.now();
      fluid.step(1 / 60);
      ctx.fluidMs += (performance.now() - t0 - ctx.fluidMs) * 0.1;
      ctx.fluidAcc -= 1 / 60; steps++;
    }
    if (ctx.fluidAcc > 1 / 30) ctx.fluidAcc = 0;
    fluid.F.iters = ctx.fluidMs > 9 ? 3 : 4;
    fluid.prepSample();
    coupleObjects(dt, t);
    const n = fluid.n, px = fluid.px, py = fluid.py, sp = fluid.spd;
    for (let i = 0; i < n; i++) { blobPos[3 * i] = px[i]; blobPos[3 * i + 1] = py[i]; blobSpd[i] = sp[i]; }
    blobGeo.attributes.position.needsUpdate = true;
    blobGeo.attributes.aSpeed.needsUpdate = true;
    blobGeo.setDrawRange(0, n);
  }
  const plane0 = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  ctx.plane0 = plane0;
  const stirHit = new THREE.Vector3();
  function stirFluid(rec) {
    if (!ray.ray.intersectPlane(plane0, stirHit)) return;
    const now = performance.now();
    if (rec.sx !== undefined) {
      const dts = (now - rec.st) / 1000;
      if (dts > 0.004) {
        const fvx = clamp((stirHit.x - rec.sx) / dts, -14, 14), fvy = clamp((stirHit.y - rec.sy) / dts, -14, 14);
        fluid.stir(stirHit.x, stirHit.y, fvx, fvy, 0.9);
      }
    }
    rec.sx = stirHit.x; rec.sy = stirHit.y; rec.st = now;
  }

  const api = { smp, buildObstacles, wetness, coupleObjects, gearFluid, fluidFrame, stirFluid };
  Object.assign(ctx, api);
  return api;
}
