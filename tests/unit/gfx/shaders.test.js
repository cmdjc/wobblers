import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as shaders from "../../../src/gfx/shaders.js";

const legacy = readFileSync(new URL("../../../legacy/wobblers.html", import.meta.url), "utf8");
const sha = (text) => createHash("sha256").update(text).digest("hex");

const legacyLiterals = () => {
  const pattern = /(?:vertexShader:|fragmentShader:|const (?:VS|FS|EYE_FS) =)\s*`([^`]*)`/g;
  return [...legacy.matchAll(pattern)].map((match) => match[1]);
};

describe("shaders", () => {
  it("exports non-empty GLSL strings", () => {
    const entries = Object.entries(shaders);
    expect(entries.length).toBe(11);
    for (const [name, source] of entries) {
      expect(typeof source, name).toBe("string");
      expect(source.length, name).toBeGreaterThan(0);
      expect(source, name).toContain("void main()");
    }
  });

  it("matches the legacy literals, in legacy order", () => {
    const literals = legacyLiterals();
    expect(literals).toHaveLength(11);
    const exported = Object.values(shaders);
    expect(sha(exported.join("\u0000"))).toBe(sha(literals.join("\u0000")));
  });
});
