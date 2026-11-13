import { MAX_OBJS } from "../world/objects.js";
import { SHAPES } from "../shapes/shapes.js";

export const TOOL_HINT = {
  play: 'Poke and blast',
  grow: 'Tap a shape to grow it',
  shrink: 'Tap a shape to shrink it',
  wobble: 'Tap a shape to change its wobble, down to rigid',
  remove: 'Tap a shape to pop it'
};

export function createToolbar(ctx) {
  const { document, navigator, setTimeout } = ctx.env;
  const { objs, tmpV } = ctx;
  const { ensureAudio, hideHint, say, boing } = ctx;

  const GN = ['down', 'up', 'drifting', 'pulled to the middle', 'spinning'];
  const gravBtn = document.getElementById('grav');
  gravBtn.addEventListener('click', () => {
    ensureAudio(); hideHint();
    ctx.gMode = (ctx.gMode + 1) % GN.length;
    gravBtn.textContent = 'Gravity: ' + ['down', 'up', 'drift', 'center', 'spin'][ctx.gMode];
    say('Gravity is ' + GN[ctx.gMode], 1300);
    for (const o of objs) { o.vel.x += (Math.random() - 0.5) * 2; ctx.impact(o, tmpV.set(0, 1, 0), 4); }
  });
  document.getElementById('add').addEventListener('click', () => {
    ensureAudio(); hideHint();
    if (objs.length >= MAX_OBJS) {
      const old = objs.find(o => !o.dragged && !o.dying);
      if (old) ctx.removeObj(old);
    }
    const o = ctx.addObj(ctx.nextShape++ % SHAPES.length, (Math.random() - 0.5) * ctx.hx, ctx.yMax - 1);
    o.vel.set((Math.random() - 0.5) * 5, -2, 0);
    o.moodT = 0.9;
    boing(330 * o.pitch, 0.08);
  });
  const sndBtn = document.getElementById('snd');
  sndBtn.addEventListener('click', () => {
    ensureAudio();
    ctx.soundOn = !ctx.soundOn;
    sndBtn.textContent = ctx.soundOn ? 'Sound on' : 'Sound off';
    if (ctx.soundOn) boing(300, 0.08);
  });

  document.getElementById('clr').addEventListener('click', () => {
    ensureAudio(); hideHint(); ctx.closeEditor(); ctx.abortRebellion(); ctx.abortAwakening();
    const live = objs.filter(o => !o.dying);
    if (!live.length) { say('Nothing to clear', 1000); return; }
    ctx.pointers.forEach(r => { r.o = null; r.moved = 999; });
    live.forEach((o, i) => {
      o.dragged = false; o.drag = null;
      o.dying = true; o.dieT = -i * 0.05; o.moodT = 1;
      ctx.addRing(o.pos, 0xffe14d, 1.8);
      setTimeout(() => boing(420 + i * 55, 0.07), i * 55);
    });
    if (navigator.vibrate) navigator.vibrate(25);
    say('All gone', 1100);
  });

  const toolBtns = document.querySelectorAll('.tools button');
  toolBtns.forEach(b => b.addEventListener('click', () => {
    ensureAudio(); hideHint();
    ctx.tool = b.dataset.tool;
    toolBtns.forEach(x => x.classList.toggle('on', x === b));
    say(TOOL_HINT[ctx.tool], 1500);
  }));
  function maxSizeFor(o) {
    const rb = (o.rBody || o.r) / o.size;                       // body radius at size 1
    const lateral = 0.95 * Math.min(ctx.hx, ctx.hz) / rb;
    const vertical = 0.95 * (ctx.yMax - ctx.yMin) / (2 * rb + (o.legs > 0 ? o.legLen : 0)); // body plus legs must fit floor to ceiling
    return Math.min(5.0, lateral, vertical);
  }
  function applyTool(o) {
    const dir = tmpV.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    if (ctx.tool === 'grow' || ctx.tool === 'shrink') {
      const grow = ctx.tool === 'grow';
      const nt = grow ? Math.min(maxSizeFor(o), o.sizeT * 1.3) : Math.max(0.35, o.sizeT / 1.3);
      if (Math.abs(nt - o.sizeT) < 0.01) {
        say(grow ? 'Biggest it can get' : 'Smallest it can get', 900);
        ctx.impact(o, dir, 3);
        return;
      }
      o.sizeT = nt;
      o.qv += grow ? 16 : -16;
      o.rip = 0.1; o.moodT = 0.8;
      boing((grow ? 200 : 520) * o.shapePitch / nt, 0.09);
    } else if (ctx.tool === 'wobble') {
      o.wob = o.wob >= 4 ? -1 : Math.floor(o.wob) + 1;
      ctx.impact(o, dir, 10 + o.wob * 2);
      o.moodT = 0.9;
      say(o.wob < 0 ? 'Rigid' : (o.wob ? 'Wobble ' + o.wob + ' of 4' : 'Wobble off'), 900);
      boing(260 * o.pitch, 0.09);
    } else if (ctx.tool === 'remove') {
      if (ctx.sel === o) ctx.closeEditor();
      o.dying = true; o.dieT = 0; o.moodT = 1;
      ctx.addRing(o.pos, 0xffe14d, 1.8);
      boing(700, 0.1);
      if (navigator.vibrate) navigator.vibrate(15);
    }
  }

  const api = { gravBtn, maxSizeFor, applyTool };
  Object.assign(ctx, { maxSizeFor, applyTool });
  return api;
}
