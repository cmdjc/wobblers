const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createBlocks(ctx) {
  const blocks = [];
  ctx.blocks = blocks;

  function collideBlocks(o) {
    if (o.dying) return;
    for (let it = 0; it < 2; it++) {
      let best = 0, bnx = 0, bny = 0, bqx = 0, bqy = 0;
      for (const b of ctx.blocks) {
        for (let k = 0; k < o.cn; k++) {
          const cx = o.pos.x + o.wo[3 * k], cy = o.pos.y + o.wo[3 * k + 1], rad = o.cRad[k];
          const qx = clamp(cx, b.x0, b.x1), qy = clamp(cy, b.y0, b.y1);
          const dx = cx - qx, dy = cy - qy, d2 = dx * dx + dy * dy;
          if (d2 >= rad * rad) continue;
          let nx, ny, pen;
          if (d2 > 1e-10) { const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; pen = rad - d; }
          else {
            const dl = cx - b.x0, dr = b.x1 - cx, dd = cy - b.y0, du = b.y1 - cy, m = Math.min(dl, dr, dd, du);
            if (m === du) { nx = 0; ny = 1; pen = du + rad; } else if (m === dd) { nx = 0; ny = -1; pen = dd + rad; }
            else if (m === dl) { nx = -1; ny = 0; pen = dl + rad; } else { nx = 1; ny = 0; pen = dr + rad; }
          }
          if (pen > best) { best = pen; bnx = nx; bny = ny; bqx = qx; bqy = qy; }
        }
      }
      if (best <= 0) break;
      o.pos.x += bnx * best; o.pos.y += bny * best;
      ctx.wallHit(o, bnx, bny, 0, bqx - o.pos.x, bqy - o.pos.y, 0);
    }
  }

  ctx.collideBlocks = collideBlocks;
  return { blocks, collideBlocks };
}
