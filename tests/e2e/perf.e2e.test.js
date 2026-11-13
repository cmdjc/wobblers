import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectBrowser } from "./cdp.js";
import { startServer } from "./server.js";

const OUT = "tests/e2e/out";
const MEASURE_MS = 5000;
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

const measureFrames = `new Promise((done) => {
  const intervals = [];
  let last = performance.now();
  const start = last;
  const tick = (now) => {
    intervals.push(now - last);
    last = now;
    if (now - start < ${MEASURE_MS}) requestAnimationFrame(tick);
    else {
      const gl = document.createElement("canvas").getContext("webgl");
      const info = gl && gl.getExtension("WEBGL_debug_renderer_info");
      done({
        intervals,
        elapsed: now - start,
        webglRenderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null,
      });
    }
  };
  requestAnimationFrame(tick);
})`;

const percentile = (sorted, fraction) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];

describe("frame time", () => {
  it("reports median and p95 frame time with the fluid filled", async () => {
    const page = await browser.openPage(`${server.url}/?debug`);
    try {
      await page.waitFor("!!window.__wob");
      await page.click("#fluid");
      await page.click("#fl-fill");
      await page.waitFor("window.__wob.fluid.n > 0", 8000);
      await sleep(2000);
      const { intervals, elapsed, webglRenderer } = await page.evaluate(measureFrames);
      const sorted = [...intervals].sort((a, b) => a - b);
      const result = {
        frames: intervals.length,
        fps: (intervals.length / elapsed) * 1000,
        medianFrameMs: percentile(sorted, 0.5),
        p95FrameMs: percentile(sorted, 0.95),
        fluidParticles: await page.evaluate("window.__wob.fluid.n"),
        webglRenderer,
      };
      mkdirSync(OUT, { recursive: true });
      writeFileSync(`${OUT}/perf.json`, JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result));
      expect(result.frames).toBeGreaterThan(1);
      expect(page.errors).toEqual([]);
    } finally {
      await page.close();
    }
  });
});
