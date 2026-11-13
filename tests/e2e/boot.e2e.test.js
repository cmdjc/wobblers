import { mkdirSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectBrowser } from "./cdp.js";
import { decodePng, stddev } from "./png.js";
import { startServer } from "./server.js";

const OUT = "tests/e2e/out";
const MIN_PIXEL_STDDEV = 3;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

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

describe("boot of the built game", () => {
  it("loads clean, draws shapes, and shows the hint", async () => {
    const page = await browser.openPage(`${server.url}/?debug`);
    try {
      await page.waitFor("!!window.__wob");
      await sleep(3000);
      expect(page.errors).toEqual([]);
      expect(await page.evaluate("window.__wob.objs.length")).toBe(7);
      expect(await page.evaluate('document.getElementById("say").textContent.length > 0')).toBe(true);
      expect(await page.evaluate('document.getElementById("say").classList.contains("on")')).toBe(true);

      mkdirSync(OUT, { recursive: true });
      await page.screenshot(`${OUT}/boot.png`);
      expect(stddev(decodePng(readFileSync(`${OUT}/boot.png`)))).toBeGreaterThan(MIN_PIXEL_STDDEV);
    } finally {
      await page.close();
    }
  });
});
