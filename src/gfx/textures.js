import * as THREE from "three";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createTextures(ctx) {
  const { document } = ctx.env;

  function mkTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'));
    return new THREE.CanvasTexture(c);
  }
  function haloTexture() {
    return mkTex(128, 128, g => {
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, 'rgba(255,246,220,0.9)'); grad.addColorStop(0.35, 'rgba(255,232,175,0.35)'); grad.addColorStop(1, 'rgba(255,222,150,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    });
  }
  const textTexCache = {};
  function textTex(txt, color) {
    const key = txt + color;
    if (textTexCache[key]) return textTexCache[key];
    return (textTexCache[key] = mkTex(256, 96, g => {
      g.font = 'bold 54px ui-rounded, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 10; g.lineJoin = 'round'; g.strokeStyle = '#12082b'; g.strokeText(txt, 128, 50);
      g.fillStyle = color; g.fillText(txt, 128, 50);
    }));
  }
  const bubTexCache = {};
  function bubbleTex(text) {
    if (bubTexCache[text]) return bubTexCache[text];
    const words = text.split(' '), lines = []; let cur = '';
    for (const w of words) { if ((cur + ' ' + w).trim().length > 15) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
    if (cur) lines.push(cur);
    const longest = Math.max(...lines.map(l => l.length)), W = clamp(longest * 17 + 44, 120, 330), H = 36 + lines.length * 34 + 22;
    return (bubTexCache[text] = mkTex(340, 150, g => {
      const x0 = (340 - W) / 2, y0 = 6, bh = H - 22;
      g.fillStyle = '#fff0fa'; g.strokeStyle = '#12082b'; g.lineWidth = 5; g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(x0 + 16, y0); g.lineTo(x0 + W - 16, y0); g.quadraticCurveTo(x0 + W, y0, x0 + W, y0 + 16);
      g.lineTo(x0 + W, y0 + bh - 16); g.quadraticCurveTo(x0 + W, y0 + bh, x0 + W - 16, y0 + bh);
      g.lineTo(190, y0 + bh); g.lineTo(170, y0 + bh + 20); g.lineTo(150, y0 + bh);
      g.lineTo(x0 + 16, y0 + bh); g.quadraticCurveTo(x0, y0 + bh, x0, y0 + bh - 16);
      g.lineTo(x0, y0 + 16); g.quadraticCurveTo(x0, y0, x0 + 16, y0); g.closePath(); g.fill(); g.stroke();
      g.font = 'bold 28px ui-rounded, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#4a2670';
      lines.forEach((l, i) => g.fillText(l, 170, y0 + 28 + i * 32));
    }));
  }

  const api = { mkTex, haloTexture, textTex, bubbleTex };
  Object.assign(ctx, api);
  return api;
}
