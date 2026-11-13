import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectBrowser } from "./cdp.js";
import { startServer } from "./server.js";

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const SETTLE_MS = 4000;
const TAP_MS = 60;
const LONG_PRESS_MS = 700;

let server;
let browser;

beforeAll(async () => {
  server = await startServer();
  browser = await connectBrowser();
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

const openGame = async () => {
  const page = await browser.openPage(`${server.url}/?debug`);
  await page.waitFor("!!window.__wob");
  await sleep(SETTLE_MS);
  return page;
};

const tapCenter = async (page, selector) => {
  const { x, y } = await page.evaluate(`(() => {
    const box = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  })()`);
  await page.touch("touchStart", [{ x, y }]);
  await sleep(TAP_MS);
  await page.touch("touchEnd", []);
};

const keepOneShape = async (page) => {
  await page.evaluate(`(() => {
    const wob = window.__wob;
    for (const o of wob.objs.slice(1)) wob.removeObj(o);
  })()`);
  await sleep(SETTLE_MS / 2);
  return page.evaluate(`(() => {
    const wob = window.__wob;
    const p = wob.objs[0].pos.clone().project(wob.camera);
    return { index: 0, x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight };
  })()`);
};

const shapeState = (page, index) => page.evaluate(`(() => {
  const o = window.__wob.objs[${index}];
  return { q: o.q, qv: o.qv, speed: o.vel.length() };
})()`);

describe("touch input on the built game", () => {
  it("squishes a tapped shape", async () => {
    const page = await openGame();
    try {
      const { index, x, y } = await keepOneShape(page);
      const before = await shapeState(page, index);
      await page.touch("touchStart", [{ x, y }]);
      await sleep(TAP_MS);
      await page.touch("touchEnd", []);
      const after = await shapeState(page, index);
      expect(after.speed - before.speed).toBeGreaterThan(1);
      expect(after.q !== before.q || after.qv !== before.qv).toBe(true);
      expect(page.errors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("throws a flicked shape", async () => {
    const page = await openGame();
    try {
      const { index, x, y } = await keepOneShape(page);
      const before = await shapeState(page, index);
      await page.touch("touchStart", [{ x, y }]);
      for (let step = 1; step <= 12; step++) {
        await page.touch("touchMove", [{ x: x + step * 10, y: y - step * 22 }]);
        await sleep(30);
      }
      await page.touch("touchEnd", []);
      const after = await shapeState(page, index);
      expect(after.speed).toBeGreaterThan(before.speed + 1);
      expect(page.errors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("opens the editor on a long press", async () => {
    const page = await openGame();
    try {
      const { x, y } = await keepOneShape(page);
      expect(await page.evaluate('document.getElementById("editor").hidden')).toBe(true);
      await page.touch("touchStart", [{ x, y }]);
      await sleep(LONG_PRESS_MS);
      await page.touch("touchEnd", []);
      expect(await page.evaluate('document.getElementById("editor").hidden')).toBe(false);
      expect(page.errors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("summons the eye from the button", async () => {
    const page = await openGame();
    try {
      expect(await page.evaluate("window.__wob.ey.state")).toBe("off");
      await tapCenter(page, "#eyebtn");
      await sleep(500);
      expect(await page.evaluate("window.__wob.ey.state")).not.toBe("off");
      expect(page.errors).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("fills the fluid from the panel", async () => {
    const page = await openGame();
    try {
      expect(await page.evaluate("window.__wob.fluid.n")).toBe(0);
      await tapCenter(page, "#fluid");
      expect(await page.evaluate('document.getElementById("fluidpanel").hidden')).toBe(false);
      await tapCenter(page, "#fl-fill");
      await page.waitFor("window.__wob.fluid.n > 0", 8000);
      expect(page.errors).toEqual([]);
    } finally {
      await page.close();
    }
  });
});
