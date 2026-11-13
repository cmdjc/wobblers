import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createContext } from "../../../src/context.js";
import { createHud } from "../../../src/ui/hud.js";

let ctx;
let sayEl;
let hud;

beforeEach(() => {
  vi.useFakeTimers();
  const { window } = new JSDOM('<div id="say"></div>');
  ctx = createContext();
  ctx.env = {
    document: window.document,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
  };
  sayEl = window.document.getElementById("say");
  hud = createHud(ctx);
});

afterEach(() => vi.useRealTimers());

describe("say", () => {
  it("shows the text and hides it after the given time", () => {
    hud.say("Hello", 500);
    expect(sayEl.textContent).toBe("Hello");
    expect(sayEl.classList.contains("on")).toBe(true);
    vi.advanceTimersByTime(499);
    expect(sayEl.classList.contains("on")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(sayEl.classList.contains("on")).toBe(false);
  });

  it("hides after 1400 ms by default", () => {
    hud.say("Hi");
    vi.advanceTimersByTime(1399);
    expect(sayEl.classList.contains("on")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(sayEl.classList.contains("on")).toBe(false);
  });

  it("restarts the timer when a new message replaces the old one", () => {
    hud.say("One", 1000);
    vi.advanceTimersByTime(800);
    hud.say("Two", 1000);
    vi.advanceTimersByTime(800);
    expect(sayEl.textContent).toBe("Two");
    expect(sayEl.classList.contains("on")).toBe(true);
    vi.advanceTimersByTime(200);
    expect(sayEl.classList.contains("on")).toBe(false);
  });

  it("is registered on ctx", () => {
    expect(ctx.say).toBe(hud.say);
    expect(ctx.hideHint).toBe(hud.hideHint);
  });
});

describe("hideHint", () => {
  it("hides the toast at once, cancels its timer, and only acts once", () => {
    hud.say("Hint", 5000);
    hud.hideHint();
    expect(sayEl.classList.contains("on")).toBe(false);
    expect(ctx.hintDone).toBe(true);
    hud.say("Later", 5000);
    hud.hideHint();
    expect(sayEl.classList.contains("on")).toBe(true);
  });
});
