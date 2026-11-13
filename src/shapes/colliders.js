import { COL, DIRS, SHAPES } from "./shapes.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createColliders(ctx) {
  function updateWO(o) {
    const q = o.mesh.quaternion, qx = q.x, qy = q.y, qz = q.z, qw = q.w, off = o.cOff, wo = o.wo;
    for (let k = 0; k < o.cn; k++) {
      const x = off[3 * k], y = off[3 * k + 1], z = off[3 * k + 2];
      const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x;
      const iw = -qx * x - qy * y - qz * z;
      wo[3 * k]     = ix * qw - iw * qx - iy * qz + iz * qy;
      wo[3 * k + 1] = iy * qw - iw * qy - iz * qx + ix * qz;
      wo[3 * k + 2] = iz * qw - iw * qz - ix * qy + iy * qx;
    }
  }
  function fillShape(out, type, a0, b0, c0, sx, sy, sz, cap) {
    if (type === 'ring') {
      const A = a0 * sx, B = b0 * sy;
      const tube = c0 * Math.min(sx, sy, sz) * 1.1;
      const circ = 6.283 * Math.sqrt((A * A + B * B) / 2);
      const n = clamp(Math.ceil(circ / (1.3 * tube)), 8, 28);
      for (let k = 0; k < n; k++) {
        const t = 6.2832 * k / n;
        out.push(A * Math.cos(t), B * Math.sin(t), 0, tube);
      }
      return;
    }
    const A = a0 * sx, B = b0 * sy, C = c0 * sz;
    let rr = Math.min(A, B, C) * (type === 'box' ? 0.62 : 1);
    const fillK = type === 'box' ? 1 : 0.8;
    let cx = 0, cy = 0, cz = 0;
    for (let it = 0; it < 18; it++) {
      cx = A - rr > 1e-4 ? Math.ceil((A - rr) / (1.7 * rr)) : 0;
      cy = B - rr > 1e-4 ? Math.ceil((B - rr) / (1.7 * rr)) : 0;
      cz = C - rr > 1e-4 ? Math.ceil((C - rr) / (1.7 * rr)) : 0;
      if ((2 * cx + 1) * (2 * cy + 1) * (2 * cz + 1) * fillK <= cap || rr >= Math.max(A, B, C)) break;
      rr *= 1.12;
    }
    const ax = Math.max(A - rr, 0), ay = Math.max(B - rr, 0), az = Math.max(C - rr, 0);
    let any = false;
    for (let ix = -cx; ix <= cx; ix++) for (let iy = -cy; iy <= cy; iy++) for (let iz = -cz; iz <= cz; iz++) {
      const x = cx ? ix / cx * ax : 0, y = cy ? iy / cy * ay : 0, z = cz ? iz / cz * az : 0;
      if (type !== 'box') {
        let t = 0;
        if (type === 'cylz') { if (cx) t += (x / ax) * (x / ax); if (cy) t += (y / ay) * (y / ay); }
        else {
          if (cx) t += (x / ax) * (x / ax);
          if (cz) t += (z / az) * (z / az);
          if (type === 'ell' && cy) t += (y / ay) * (y / ay);
        }
        if (t > 1.0001) continue;
      }
      out.push(x, y, z, rr); any = true;
    }
    if (!any) out.push(0, 0, 0, rr);
  }
  function buildCollider(o) {
    const c = COL[o.shape], S = o.size, sx = o.sx * S, sy = o.sy * S, sz = o.sz * S;
    const out = [];
    fillShape(out, c[0], c[1], c[2], c[3], sx, sy, sz, o.level ? 28 : 64);
    if (o.level > 0) {
      const sh = SHAPES[o.shape], minS = Math.min(sx, sy, sz), lv = Math.min(o.level, 2);
      (function grow(cx, cy, cz, sc, from, depth) {
        if (depth > lv) return;
        const cs = sc * 0.5;
        for (let d = 0; d < 6; d++) {
          if (from >= 0 && d === (from ^ 1)) continue;
          const dist = sc * sh.e + cs * sh.e * 0.8;
          const x = cx + DIRS[d][0] * dist, y = cy + DIRS[d][1] * dist, z = cz + DIRS[d][2] * dist;
          const boost = (o.level > 2 && depth === 2) ? 1.45 : 1;
          out.push(x * sx, y * sy, z * sz, sh.e * cs * minS * 1.1 * boost);
          grow(x, y, z, cs, d, depth + 1);
        }
      })(0, 0, 0, 1, -1, 1);
    }
    let minY = 1e9, maxW = 0, maxD = 0;
    for (let k = 0; k < out.length; k += 4) {
      minY = Math.min(minY, out[k + 1] - out[k + 3]);
      maxW = Math.max(maxW, Math.abs(out[k]) + out[k + 3]);
      maxD = Math.max(maxD, Math.abs(out[k + 2]) + out[k + 3]);
    }
    let rb = 0;
    for (let k = 0; k < out.length; k += 4) rb = Math.max(rb, Math.sqrt(out[k] * out[k] + out[k + 1] * out[k + 1] + out[k + 2] * out[k + 2]) + out[k + 3]);
    o.rBody = Math.max(rb, 0.12);
    o.bottomLocal = minY; o.halfW = maxW; o.halfD = maxD;
    if (o.legs > 0) { // feet are real colliders, so a legged shape stands up off the floor and on top of others
      const fr = ctx.footR(o), fy = minY - o.legCur + fr;
      for (let i = 0; i < o.legs; i++) { const h = ctx.hipXZ(o, i); out.push(h[0], fy, h[1], fr); }
    }
    const n = out.length / 4;
    o.cn = n; o.cOff = new Float32Array(3 * n); o.cRad = new Float32Array(n); o.wo = new Float32Array(3 * n);
    let R = 0;
    for (let k = 0; k < n; k++) {
      const x = out[4 * k], y = out[4 * k + 1], z = out[4 * k + 2], r = out[4 * k + 3];
      o.cOff[3 * k] = x; o.cOff[3 * k + 1] = y; o.cOff[3 * k + 2] = z; o.cRad[k] = r;
      R = Math.max(R, Math.sqrt(x * x + y * y + z * z) + r);
    }
    o.r = Math.max(R, 0.12);
    updateWO(o);
  }
  const api = { updateWO, fillShape, buildCollider };
  Object.assign(ctx, api);
  return api;
}
