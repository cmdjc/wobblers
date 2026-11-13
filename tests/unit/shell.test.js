import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const legacy = read("legacy/wobblers.html");
const legacyLines = legacy.split("\n");

const bodyMarkup = (html) => {
  const start = html.indexOf('<canvas id="c">');
  const endMarker = html.indexOf('<div id="fluidpanel"');
  const end = html.indexOf("\n</div>\n", endMarker) + "\n</div>\n".length;
  return html.slice(start, end);
};
const headTop = (html) => html.slice(0, html.indexOf("<title>") + "<title>Wobblers</title>".length).split("\n").slice(0, 6);

describe("index.html", () => {
  const html = read("index.html");

  it("keeps the legacy body markup character for character", () => {
    const expected = bodyMarkup(legacy);
    expect(expected.length).toBeGreaterThan(1000);
    expect(bodyMarkup(html)).toBe(expected);
  });

  it("keeps the legacy doctype, meta tags, and title", () => {
    expect(headTop(html)).toEqual(legacyLines.slice(0, 6));
  });

  it("loads the module entry and no CDN script", () => {
    expect(html).toContain('<script type="module" src="/src/main.js"></script>');
    expect(html).not.toContain("cdnjs");
    expect(html).not.toContain("<style");
  });
});

describe("style.css", () => {
  it("equals the legacy style block", () => {
    const start = legacy.indexOf("<style>") + "<style>".length;
    const end = legacy.indexOf("</style>");
    expect(read("src/ui/style.css").trim()).toBe(legacy.slice(start, end).trim());
  });
});

describe("game.js", () => {
  it("exports createGame", async () => {
    const mod = await import("../../src/game.js");
    expect(typeof mod.createGame).toBe("function");
  });

  it("keeps every legacy script line, trimmed, in order", () => {
    const scriptStart = legacyLines.findIndex((line) => line === "(function () {") + 1;
    const scriptEnd = legacyLines.lastIndexOf("})();");
    const expected = legacyLines
      .slice(scriptStart, scriptEnd)
      .filter((line) => !line.includes("new THREE.WebGLRenderer("))
      .map((line) => line.trim())
      .filter(Boolean);
    const actual = read("src/game.js").split("\n").map((line) => line.trim()).filter(Boolean);
    let at = 0;
    for (const line of expected) {
      while (at < actual.length && actual[at] !== line) at += 1;
      if (at === actual.length) throw new Error(`legacy line missing or out of order: ${line}`);
      at += 1;
    }
  });
});
