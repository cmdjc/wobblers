import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectBrowser } from "./cdp.js";
import { installDeterminism } from "./injected.js";
import { decodePng, meanGrid } from "./png.js";
import { startServer, THREE_FILE } from "./server.js";

const OUT = "tests/e2e/out";
const THREE_CDN = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
const SEED = 20260513;
const FRAME_MS = 1000 / 30;
const STEP_CHUNK = 30;
const GRID = 8;
const MEAN_LIMIT = 2;
const CELL_LIMIT = 8;

const CASES = {
  boot: { frames: 60, actions: [] },
  fluid: { frames: 150, actions: ["#fluid", "#fl-fill"] },
  eye: { frames: 120, actions: ["#eyebtn"] },
};

let staticServer;
let viteServer;
let newUrl;
let browser;
const report = {};

beforeAll(async () => {
  staticServer = await startServer();
  viteServer = await createServer({
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0, watch: null },
    optimizeDeps: { include: ["three"] },
  });
  await viteServer.listen();
  newUrl = `http://127.0.0.1:${viteServer.httpServer.address().port}/?debug`;
  browser = await connectBrowser();
});

afterAll(async () => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/parity.json`, JSON.stringify(report, null, 2));
  await browser?.close();
  await viteServer?.close();
  await staticServer?.close();
});

const capture = async ({ url, build, name, frames, actions }) => {
  const page = await browser.openPage(url, {
    before: async (p) => {
      await p.send("Page.addScriptToEvaluateOnNewDocument", { source: `(${installDeterminism})(${SEED})` });
      if (build === "legacy") await p.serveFile(THREE_CDN, THREE_FILE, "text/javascript");
    },
  });
  try {
    await page.waitFor('typeof window.__step === "function" && !!document.getElementById("eyebtn")');
    for (const selector of actions) await page.click(selector);
    for (let done = 0; done < frames; done += STEP_CHUNK) {
      await page.evaluate(`window.__step(${Math.min(STEP_CHUNK, frames - done)}, ${FRAME_MS})`);
    }
    const file = `${OUT}/parity-${name}-${build}.png`;
    await page.screenshot(file);
    const draws = await page.evaluate("window.__draws");
    expect(page.errors).toEqual([]);
    return { file, draws };
  } finally {
    await page.close();
  }
};

const compare = (legacyFile, newFile) => {
  const legacy = meanGrid(decodePng(readFileSync(legacyFile)), GRID);
  const current = meanGrid(decodePng(readFileSync(newFile)), GRID);
  const cellDiffs = legacy.map((cell, i) => cell.reduce((sum, value, c) => sum + Math.abs(value - current[i][c]), 0) / 3);
  return {
    meanDiff: cellDiffs.reduce((sum, value) => sum + value, 0) / cellDiffs.length,
    maxCellDiff: Math.max(...cellDiffs),
  };
};

const runCase = async (name, { frames, actions }, legacyFrames = frames) => {
  const legacy = await capture({ url: `${staticServer.url}/legacy/wobblers.html`, build: "legacy", name, frames: legacyFrames, actions });
  const current = await capture({ url: newUrl, build: "new", name, frames, actions });
  const numbers = compare(legacy.file, current.file);
  report[name] = { frames, legacyFrames, ...numbers, legacyDraws: legacy.draws, newDraws: current.draws };
  return { numbers, legacy, current };
};

describe("visual parity with the legacy page", () => {
  it.each(Object.entries(CASES))("case %s matches the legacy color grid", async (name, spec) => {
    const { numbers, legacy, current } = await runCase(name, spec);
    expect(legacy.draws.uuid).toBeGreaterThan(0);
    expect(current.draws.uuid).toBeGreaterThan(0);
    expect(numbers.meanDiff).toBeLessThanOrEqual(MEAN_LIMIT);
    expect(numbers.maxCellDiff).toBeLessThanOrEqual(CELL_LIMIT);
  });

  it("detects pages stepped to different frame counts", async () => {
    const { numbers } = await runCase("mismatch", { ...CASES.fluid }, 20);
    expect(numbers.meanDiff > MEAN_LIMIT || numbers.maxCellDiff > CELL_LIMIT).toBe(true);
  });
});
