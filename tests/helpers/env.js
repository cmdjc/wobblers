import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { createFakeAudioContext } from "./fakeAudio.js";
import { createFakeRenderer } from "./fakeRenderer.js";
import { installCanvasStub } from "./stubCanvas.js";

const legacyHtml = readFileSync(new URL("../../legacy/wobblers.html", import.meta.url), "utf8");
const bodyMarkup = legacyHtml.slice(legacyHtml.indexOf("<body>"), legacyHtml.indexOf("<script"));

export const START_TIME = 1000;

function createClock() {
  let now = START_TIME;
  let nextId = 1;
  let timers = [];
  let frameQueue = [];

  const setTimeout = (fn, delay = 0) => {
    const id = nextId++;
    timers.push({ id, due: now + Math.max(0, delay), fn });
    return id;
  };
  const clearTimeout = (id) => { timers = timers.filter((t) => t.id !== id); };
  const requestAnimationFrame = (fn) => {
    const id = nextId++;
    frameQueue.push({ id, fn });
    return id;
  };
  const nextDue = (limit) => {
    let best = null;
    for (const t of timers) if (t.due <= limit && (!best || t.due < best.due || (t.due === best.due && t.id < best.id))) best = t;
    return best;
  };
  const advance = (ms) => {
    const target = now + ms;
    for (let timer = nextDue(target); timer; timer = nextDue(target)) {
      timers = timers.filter((t) => t !== timer);
      now = Math.max(now, timer.due);
      timer.fn();
    }
    now = target;
    const frames = frameQueue;
    frameQueue = [];
    for (const frame of frames) frame.fn(now);
  };
  return { setTimeout, clearTimeout, requestAnimationFrame, advance, performance: { now: () => now }, now: () => now };
}

export async function createEnv({ audio = false } = {}) {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head>${bodyMarkup}</html>`, { pretendToBeVisual: false });
  const { window } = dom;
  const { document } = window;
  if (document.readyState !== "complete") await new Promise((resolve) => window.addEventListener("load", resolve, { once: true }));

  for (const [name, value] of [["innerWidth", 390], ["innerHeight", 844], ["devicePixelRatio", 2]]) {
    Object.defineProperty(window, name, { value, configurable: true, writable: true });
  }
  const rect = { left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844, x: 0, y: 0 };
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ ...rect });
  installCanvasStub(window);

  const clock = createClock();
  const { setTimeout, clearTimeout, requestAnimationFrame, performance } = clock;
  Object.assign(window, { setTimeout, clearTimeout, requestAnimationFrame });
  Object.defineProperty(window, "performance", { value: performance, configurable: true });

  const vibrateCalls = [];
  const navigator = { userAgent: "wobblers-harness", vibrate: (pattern) => { vibrateCalls.push(pattern); return true; } };
  const audioLog = [];
  window.AudioContext = audio ? createFakeAudioContext(clock.now, audioLog) : undefined;
  window.webkitAudioContext = undefined;

  return {
    window,
    document,
    env: { window, document, performance, navigator, setTimeout, clearTimeout, requestAnimationFrame },
    advance: clock.advance,
    now: clock.now,
    renderer: createFakeRenderer(document.getElementById("c")),
    vibrateCalls,
    audioLog,
    traceCursor: 0,
  };
}
