export function createAudio(ctx) {
  const { window, setTimeout } = ctx.env;

  function ensureAudio() {
    if (!ctx.actx) { try { ctx.actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx.actx = null; } }
    if (ctx.actx && ctx.actx.state === 'suspended') ctx.actx.resume();
  }
  function boing(base, vol) {
    if (!ctx.actx || !ctx.soundOn) return;
    const now = ctx.actx.currentTime;
    if (now - ctx.lastSnd < 0.035) return;
    ctx.lastSnd = now;
    const o = ctx.actx.createOscillator(), g = ctx.actx.createGain(), lfo = ctx.actx.createOscillator(), lg = ctx.actx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(base * 1.5, now);
    o.frequency.exponentialRampToValueAtTime(base * 0.55, now + 0.35);
    lfo.frequency.value = 28; lg.gain.value = base * 0.18;
    lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.002, Math.min(vol, 0.12)), now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
    o.connect(g); g.connect(ctx.actx.destination);
    o.start(now); lfo.start(now); o.stop(now + 0.4); lfo.stop(now + 0.4);
  }
  function tone(freq, dur, vol, type, slide) {
    if (!ctx.actx || !ctx.soundOn) return;
    const now = ctx.actx.currentTime, o = ctx.actx.createOscillator(), g = ctx.actx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, now);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), now + dur);
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(vol, now + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(ctx.actx.destination); o.start(now); o.stop(now + dur + 0.05);
  }
  function chime(notes, gap, vol) { notes.forEach((fq, i) => setTimeout(() => tone(fq, 1.0, vol, 'sine'), i * gap)); }
  function zapSound() {
    if (!ctx.actx || !ctx.soundOn) return;
    const dur = 0.35, len = Math.floor(ctx.actx.sampleRate * dur), buf = ctx.actx.createBuffer(1, len, ctx.actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ctx.actx.createBufferSource(), hp = ctx.actx.createBiquadFilter(), g = ctx.actx.createGain();
    src.buffer = buf; hp.type = 'highpass'; hp.frequency.value = 1200; g.gain.value = 0.12;
    src.connect(hp); hp.connect(g); g.connect(ctx.actx.destination); src.start();
    tone(90, 0.5, 0.12, 'sawtooth', 0.4);
  }
  function boomSound(v) {
    if (!ctx.actx || !ctx.soundOn) return;
    const dur = 0.5, len = Math.floor(ctx.actx.sampleRate * dur), buf = ctx.actx.createBuffer(1, len, ctx.actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    const src = ctx.actx.createBufferSource(), lp = ctx.actx.createBiquadFilter(), g = ctx.actx.createGain();
    src.buffer = buf; lp.type = 'lowpass'; lp.frequency.value = 700; g.gain.value = 0.35 * (v || 1);
    src.connect(lp); lp.connect(g); g.connect(ctx.actx.destination); src.start();
    tone(70, 0.5, 0.18 * (v || 1), 'sawtooth', 0.35);
  }

  const api = { ensureAudio, boing, tone, chime, zapSound, boomSound };
  Object.assign(ctx, api);
  return api;
}
