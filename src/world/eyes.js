import * as THREE from "three";

export function createEyes(ctx) {
  const { document } = ctx.env;
  function makeEyes() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const tex = new THREE.CanvasTexture(c);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    return { c, ctx: c.getContext('2d'), tex, s, key: '' };
  }
  function drawEyes(e, lx, ly, mood, blink) {
    const key = Math.round(lx * 4) + ',' + Math.round(ly * 4) + ',' + mood + ',' + blink;
    if (key === e.key) return;
    e.key = key;
    const g = e.ctx;
    g.clearRect(0, 0, 128, 64);
    const R = mood === 1 ? 24 : 20;
    const pr = mood === 1 ? 5 : (mood === 2 ? 12 : (mood === 4 ? 7 : 9));
    for (const x of [40, 88]) {
      if (blink) {
        g.strokeStyle = '#12082b'; g.lineWidth = 5; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x - 16, 34); g.quadraticCurveTo(x, 44, x + 16, 34); g.stroke();
        continue;
      }
      g.fillStyle = '#ffffff';
      g.beginPath(); g.ellipse(x, 32, R, R * 1.1, 0, 0, 6.283); g.fill();
      g.lineWidth = 3; g.strokeStyle = '#12082b'; g.stroke();
      g.fillStyle = '#12082b';
      g.beginPath();
      g.arc(x + lx * (R - pr - 3), 32 - ly * (R * 1.1 - pr - 3), pr, 0, 6.283);
      g.fill();
      if (mood === 3) { // sleepy: heavy lids
        g.beginPath(); g.ellipse(x, 33, R + 1, R * 1.1 + 1, 0, Math.PI, 6.283); g.closePath(); g.fillStyle = '#12082b'; g.fill();
      } else if (mood === 4) { // dizzy: swirly pupils
        g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath();
        g.arc(x + lx * (R - pr - 3), 32 - ly * (R * 1.1 - pr - 3), pr - 2.5, 0, 4.7); g.stroke();
      }
    }
    e.tex.needsUpdate = true;
  }
  const api = { makeEyes, drawEyes };
  Object.assign(ctx, api);
  return api;
}
