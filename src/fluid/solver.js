export function createFluid(N_MAX) {
  const px = new Float32Array(N_MAX), py = new Float32Array(N_MAX), vx = new Float32Array(N_MAX), vy = new Float32Array(N_MAX);
  const qx = new Float32Array(N_MAX), qy = new Float32Array(N_MAX), lam = new Float32Array(N_MAX), rho = new Float32Array(N_MAX);
  const gsx = new Float32Array(N_MAX), gsy = new Float32Array(N_MAX), gs2 = new Float32Array(N_MAX);
  const dpx = new Float32Array(N_MAX), dpy = new Float32Array(N_MAX);
  const hvx = new Float32Array(N_MAX), hvy = new Float32Array(N_MAX), hnx = new Float32Array(N_MAX), hny = new Float32Array(N_MAX);
  const hit = new Uint8Array(N_MAX), spd = new Float32Array(N_MAX);
  const avx = new Float32Array(N_MAX), avy = new Float32Array(N_MAX), asw = new Float32Array(N_MAX);
  const MAXP = N_MAX * 30;
  const pI = new Int32Array(MAXP), pJ = new Int32Array(MAXP), pGx = new Float32Array(MAXP), pGy = new Float32Array(MAXP);
  let np = 0, n = 0;
  let bx = 2, y0 = -3, y1 = 3, h = 0.4, h2 = 0.16, s = 0.18, rho0 = 1, ox = 0, oy = 0, gw = 1, gh = 1, pr = 0.08;
  let cellStart = new Int32Array(2), cursor = new Int32Array(2);
  const cellItems = new Int32Array(N_MAX), cellOf = new Int32Array(N_MAX);
  const F = { visc: 0.05, mode: 0, t: 0, G: 13, eps: 0.5, iters: 4, damp: 0.15 };
  let oB = new Float32Array(0), oS = new Float32Array(0), oStart = new Int32Array(1), oN = 0;

  function configure(_bx, _y0, _y1, N_FILL) {
    bx = _bx; y0 = _y0; y1 = _y1;
    const area = 2 * bx * (y1 - y0);
    s = Math.sqrt(0.9 * area / (N_FILL || N_MAX)); h = 2.2 * s; h2 = h * h; pr = 0.45 * s;
    let sum = 0;
    for (let i = -8; i <= 8; i++) for (let j = -8; j <= 8; j++) {
      const r = Math.sqrt(i * i + j * j) * s;
      if (r < h) { const t = 1 - r / h; sum += t * t * t; }
    }
    rho0 = sum;
    ox = -bx - h; oy = y0 - h;
    gw = Math.ceil((2 * bx + 2 * h) / h) + 2; gh = Math.ceil((y1 - y0 + 2 * h) / h) + 2;
    cellStart = new Int32Array(gw * gh + 2); cursor = new Int32Array(gw * gh + 2);
    n = 0; np = 0;
  }
  function cellIdx(x, y) {
    let cx = ((x - ox) / h) | 0, cy = ((y - oy) / h) | 0;
    if (cx < 0) cx = 0; else if (cx >= gw) cx = gw - 1;
    if (cy < 0) cy = 0; else if (cy >= gh) cy = gh - 1;
    return cy * gw + cx;
  }
  function buildGrid(X, Y) {
    cellStart.fill(0);
    for (let i = 0; i < n; i++) { const c = cellIdx(X[i], Y[i]); cellOf[i] = c; cellStart[c + 1]++; }
    for (let c = 0; c < gw * gh; c++) cellStart[c + 1] += cellStart[c];
    for (let c = 0; c < gw * gh; c++) cursor[c] = cellStart[c];
    for (let i = 0; i < n; i++) cellItems[cursor[cellOf[i]]++] = i;
  }
  function buildPairs() {
    np = 0;
    for (let i = 0; i < n; i++) {
      const c = cellOf[i], cx = c % gw, cy = (c / gw) | 0;
      for (let ay = cy - 1; ay <= cy + 1; ay++) {
        if (ay < 0 || ay >= gh) continue;
        for (let ax = cx - 1; ax <= cx + 1; ax++) {
          if (ax < 0 || ax >= gw) continue;
          const c2 = ay * gw + ax;
          for (let k = cellStart[c2], e = cellStart[c2 + 1]; k < e; k++) {
            const j = cellItems[k];
            if (j <= i) continue;
            const dx = qx[i] - qx[j], dy = qy[i] - qy[j];
            if (dx * dx + dy * dy < h2 && np < MAXP) { pI[np] = i; pJ[np] = j; np++; }
          }
        }
      }
    }
  }
  function gravity(x, y, out) {
    const G = F.G;
    switch (F.mode) {
      case 0: out[0] = 0; out[1] = -G; break;
      case 1: out[0] = 0; out[1] = G * 0.8; break;
      case 2: out[0] = Math.sin(F.t * 0.6) * 1.4; out[1] = Math.cos(F.t * 0.5) * 1.4; break;
      case 3: out[0] = -x * 7; out[1] = -y * 7; break;
      default: { const a = F.t * 0.9; out[0] = Math.sin(a) * G * 0.7; out[1] = -Math.cos(a) * G * 0.7; }
    }
  }
  const gtmp = [0, 0];
  function collideBounds(i) {
    const m = 0.3 * s;
    if (qx[i] < -bx + m) qx[i] = -bx + m; else if (qx[i] > bx - m) qx[i] = bx - m;
    if (qy[i] < y0 + m) qy[i] = y0 + m; else if (qy[i] > y1 - m) qy[i] = y1 - m;
  }
  function collideObs(i) {
    for (let o = 0; o < oN; o++) {
      const cx = oB[5 * o], cy = oB[5 * o + 1], R = oB[5 * o + 2] + pr;
      let dx = qx[i] - cx, dy = qy[i] - cy;
      if (dx * dx + dy * dy >= R * R) continue;
      for (let k = oStart[o], e = oStart[o + 1]; k < e; k++) {
        const sx = oS[3 * k], sy = oS[3 * k + 1], rr = oS[3 * k + 2] + pr;
        dx = qx[i] - sx; dy = qy[i] - sy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        let d = Math.sqrt(d2), nx, ny;
        // eslint-disable-next-line no-useless-assignment
        if (d < 1e-6) { nx = 0; ny = 1; d = 0; } else { nx = dx / d; ny = dy / d; }
        qx[i] = sx + nx * rr; qy[i] = sy + ny * rr;
        hit[i] = 1; hnx[i] = nx; hny[i] = ny; hvx[i] = oB[5 * o + 3]; hvy[i] = oB[5 * o + 4];
      }
    }
  }
  function solveIter() {
    for (let i = 0; i < n; i++) { rho[i] = 1; gsx[i] = 0; gsy[i] = 0; gs2[i] = 0; dpx[i] = 0; dpy[i] = 0; }
    for (let p = 0; p < np; p++) {
      const i = pI[p], j = pJ[p];
      let dx = qx[i] - qx[j], dy = qy[i] - qy[j];
      const r2 = dx * dx + dy * dy;
      if (r2 >= h2) { pGx[p] = 0; pGy[p] = 0; continue; }
      let r = Math.sqrt(r2);
      if (r < 1e-5) { dx = 1e-5; dy = 0; r = 1e-5; }
      const t = 1 - r / h, t2 = t * t, w = t2 * t, dw = -3 * t2 / h;
      const gx = dw * dx / r, gy = dw * dy / r;
      pGx[p] = gx; pGy[p] = gy;
      rho[i] += w; rho[j] += w;
      gsx[i] += gx; gsy[i] += gy; gsx[j] -= gx; gsy[j] -= gy;
      const g2 = gx * gx + gy * gy; gs2[i] += g2; gs2[j] += g2;
    }
    // mirrored wall particles keep density up near the boundary
    const hh = 0.5 * h;
    for (let i = 0; i < n; i++) {
      let d;
      d = qx[i] + bx; if (d < hh) wallTerm(i, d, 1, 0);
      d = bx - qx[i]; if (d < hh) wallTerm(i, d, -1, 0);
      d = qy[i] - y0; if (d < hh) wallTerm(i, d, 0, 1);
      d = y1 - qy[i]; if (d < hh) wallTerm(i, d, 0, -1);
    }
    const inv2 = 1 / (rho0 * rho0);
    for (let i = 0; i < n; i++) {
      const C = rho[i] / rho0 - 1;
      lam[i] = C > 0 ? -C / ((gsx[i] * gsx[i] + gsy[i] * gsy[i] + gs2[i]) * inv2 + F.eps) : 0;
    }
    for (let p = 0; p < np; p++) {
      const i = pI[p], j = pJ[p], c = lam[i] + lam[j];
      if (c === 0) continue;
      dpx[i] += c * pGx[p]; dpy[i] += c * pGy[p]; dpx[j] -= c * pGx[p]; dpy[j] -= c * pGy[p];
    }
    for (let i = 0; i < n; i++) {
      const d0 = Math.min(qx[i] + bx, bx - qx[i], qy[i] - y0, y1 - qy[i]);
      if (d0 < hh) wallPush(i);
    }
    const inv = 1 / rho0, mx = 0.3 * h;
    for (let i = 0; i < n; i++) {
      let ddx = dpx[i] * inv, ddy = dpy[i] * inv;
      const m = Math.sqrt(ddx * ddx + ddy * ddy);
      if (m > mx) { ddx *= mx / m; ddy *= mx / m; }
      qx[i] += ddx; qy[i] += ddy;
      collideBounds(i);
      if (oN) collideObs(i);
    }
  }
  function wallTerm(i, d, nx, ny) {
    const t = 1 - 2 * d / h;
    rho[i] += t * t * t;
    const dw = -3 * t * t / h;
    gsx[i] += dw * nx; gsy[i] += dw * ny; gs2[i] += dw * dw;
  }
  function wallPush(i) {
    const hh = 0.5 * h;
    let d;
    d = qx[i] + bx; if (d < hh) pushW(i, d, 1, 0);
    d = bx - qx[i]; if (d < hh) pushW(i, d, -1, 0);
    d = qy[i] - y0; if (d < hh) pushW(i, d, 0, 1);
    d = y1 - qy[i]; if (d < hh) pushW(i, d, 0, -1);
  }
  function pushW(i, d, nx, ny) {
    const t = 1 - 2 * d / h, dw = -3 * t * t / h;
    const c = 2 * lam[i] * dw;
    dpx[i] += c * nx; dpy[i] += c * ny;
  }

  function step(dt) {
    for (let i = 0; i < n; i++) {
      gravity(px[i], py[i], gtmp);
      vx[i] += gtmp[0] * dt; vy[i] += gtmp[1] * dt;
      qx[i] = px[i] + vx[i] * dt; qy[i] = py[i] + vy[i] * dt;
      hit[i] = 0;
      collideBounds(i);
    }
    buildGrid(qx, qy);
    buildPairs();
    for (let it = 0; it < F.iters; it++) solveIter();
    const idt = 1 / dt, vmax = 14;
    for (let i = 0; i < n; i++) {
      let ux = (qx[i] - px[i]) * idt, uy = (qy[i] - py[i]) * idt;
      if (hit[i]) {
        const rel = (ux - hvx[i]) * hnx[i] + (uy - hvy[i]) * hny[i];
        if (rel < 0) { ux -= rel * hnx[i]; uy -= rel * hny[i]; }
      }
      const sp = Math.sqrt(ux * ux + uy * uy);
      if (sp > vmax) { ux *= vmax / sp; uy *= vmax / sp; }
      vx[i] = ux; vy[i] = uy; px[i] = qx[i]; py[i] = qy[i];
      asw[i] = 0; avx[i] = 0; avy[i] = 0;
    }
    // viscosity: blend each particle's velocity toward its neighbours' average
    for (let p = 0; p < np; p++) {
      const i = pI[p], j = pJ[p];
      const dx = px[i] - px[j], dy = py[i] - py[j], r2 = dx * dx + dy * dy;
      if (r2 >= h2) continue;
      const t = 1 - Math.sqrt(r2) / h, w = t * t;
      asw[i] += w; asw[j] += w;
      avx[i] += w * vx[j]; avy[i] += w * vy[j]; avx[j] += w * vx[i]; avy[j] += w * vy[i];
    }
    const vis = F.visc, dk = Math.exp(-F.damp * dt);
    for (let i = 0; i < n; i++) {
      if (asw[i] > 1e-6) {
        vx[i] += vis * (avx[i] / asw[i] - vx[i]);
        vy[i] += vis * (avy[i] / asw[i] - vy[i]);
      }
      vx[i] *= dk; vy[i] *= dk;
      const sp = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
      spd[i] += (Math.min(sp / 8, 1) - spd[i]) * 0.3;
    }
  }
  // grid for sampling reflects positions at the start of the last step
  function prepSample() { buildGrid(px, py); }
  function sample(x, y, r, out) {
    let cnt = 0, svx = 0, svy = 0;
    const r2 = r * r;
    const cx0 = Math.floor((x - r - ox) / h), cx1 = Math.floor((x + r - ox) / h);
    const cy0 = Math.floor((y - r - oy) / h), cy1 = Math.floor((y + r - oy) / h);
    for (let cy = Math.max(cy0, 0); cy <= Math.min(cy1, gh - 1); cy++) {
      for (let cx = Math.max(cx0, 0); cx <= Math.min(cx1, gw - 1); cx++) {
        const c = cy * gw + cx;
        for (let k = cellStart[c], e = cellStart[c + 1]; k < e; k++) {
          const j = cellItems[k], dx = px[j] - x, dy = py[j] - y;
          if (dx * dx + dy * dy < r2) { cnt++; svx += vx[j]; svy += vy[j]; }
        }
      }
    }
    out[0] = cnt; out[1] = svx; out[2] = svy;
  }
  function spawn(cnt, rain) {
    for (let k = 0; k < cnt && n < N_MAX; k++) {
      const i = n++;
      px[i] = (Math.random() * 2 - 1) * (bx - s);
      py[i] = y1 - s * (1 + Math.random() * 3);
      vx[i] = (Math.random() - 0.5) * 0.5; vy[i] = rain ? -3 : 0; spd[i] = 0;
    }
  }
  function spawnAt(cx, cy, cnt, rad, svx, svy) {
    for (let k = 0; k < cnt && n < N_MAX; k++) {
      const i = n++, a = Math.random() * 6.2832, r = Math.sqrt(Math.random()) * rad;
      px[i] = Math.max(-bx + s, Math.min(bx - s, cx + Math.cos(a) * r));
      py[i] = Math.max(y0 + s, Math.min(y1 - s, cy + Math.sin(a) * r));
      vx[i] = svx + (Math.random() - 0.5) * 1.5; vy[i] = svy + (Math.random() - 0.5) * 1.5; spd[i] = 0;
    }
  }
  function swirl(cx, cy, rad, omega) {
    const r2 = rad * rad;
    for (let i = 0; i < n; i++) {
      const dx = px[i] - cx, dy = py[i] - cy, d2 = dx * dx + dy * dy;
      if (d2 >= r2) continue;
      const w = 1 - Math.sqrt(d2) / rad;
      vx[i] += (-dy * omega - vx[i]) * w * 0.3; vy[i] += (dx * omega - vy[i]) * w * 0.3;
    }
  }
  function removeAt(i) {
    n--;
    if (i !== n) { px[i] = px[n]; py[i] = py[n]; vx[i] = vx[n]; vy[i] = vy[n]; spd[i] = spd[n]; }
  }
  function drain(cnt) {
    let removed = 0;
    for (let i = n - 1; i >= 0 && removed < cnt; i--) {
      if (py[i] < y0 + 0.5) { removeAt(i); removed++; }
    }
    while (removed < cnt && n > 0) { removeAt((Math.random() * n) | 0); removed++; }
  }
  function stir(x, y, fvx, fvy, rad) {
    const r2 = rad * rad;
    for (let i = 0; i < n; i++) {
      const dx = px[i] - x, dy = py[i] - y, d2 = dx * dx + dy * dy;
      if (d2 >= r2) continue;
      const w = 1 - Math.sqrt(d2) / rad;
      vx[i] += (fvx - vx[i]) * w * 0.5; vy[i] += (fvy - vy[i]) * w * 0.5;
    }
  }
  function blast(x, y, rad, power) {
    for (let i = 0; i < n; i++) {
      const dx = px[i] - x, dy = py[i] - y, d = Math.sqrt(dx * dx + dy * dy);
      if (d >= rad) continue;
      const w = (1 - d / rad) * power / Math.max(d, 0.05);
      vx[i] += dx * w; vy[i] += dy * w;
    }
  }
  function setObstacles(B, S, start, count) { oB = B; oS = S; oStart = start; oN = count; }
  return { px, py, vx, vy, spd, F, configure, step, spawn, spawnAt, drain, stir, swirl, blast, setObstacles, prepSample, sample,
           get n() { return n; }, get s() { return s; }, get h() { return h; }, get rho0() { return rho0; },
           get bounds() { return [bx, y0, y1]; }, clear() { n = 0; np = 0; },
           stats() { let r = 0; for (let i = 0; i < n; i++) r += rho[i]; return { avgRho: n ? r / n / rho0 : 0, np }; } };
}
