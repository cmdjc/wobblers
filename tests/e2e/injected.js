export function installDeterminism(seed) {
  const mulberry32 = (start) => {
    let a = start >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const gameStream = mulberry32(seed);
  const uuidStream = mulberry32(seed ^ 0x9e3779b9);
  const draws = { game: 0, uuid: 0 };
  window.__draws = draws;
  Math.random = () => {
    if (new Error().stack.includes("generateUUID")) {
      draws.uuid += 1;
      return uuidStream();
    }
    draws.game += 1;
    return gameStream();
  };

  let now = 1000;
  let nextId = 0;
  let frameQueue = [];
  const timers = new Map();
  performance.now = () => now;
  window.requestAnimationFrame = (callback) => {
    frameQueue.push({ id: ++nextId, callback });
    return nextId;
  };
  window.cancelAnimationFrame = (id) => {
    frameQueue = frameQueue.filter((frame) => frame.id !== id);
  };
  window.setTimeout = (callback, delay = 0, ...args) => {
    const id = ++nextId;
    timers.set(id, { id, due: now + Math.max(0, delay), callback, args });
    return id;
  };
  window.clearTimeout = (id) => timers.delete(id);
  const nextDueTimer = () => {
    let best = null;
    for (const timer of timers.values()) {
      if (timer.due <= now && (!best || timer.due < best.due || (timer.due === best.due && timer.id < best.id))) best = timer;
    }
    return best;
  };
  window.__step = (frames, dtMs) => {
    for (let i = 0; i < frames; i++) {
      now += dtMs;
      for (let timer = nextDueTimer(); timer; timer = nextDueTimer()) {
        timers.delete(timer.id);
        timer.callback(...timer.args);
      }
      const due = frameQueue;
      frameQueue = [];
      for (const frame of due) frame.callback(now);
    }
    return now;
  };

  document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; } #info { visibility: hidden !important; }";
    document.head.appendChild(style);
  });
}
