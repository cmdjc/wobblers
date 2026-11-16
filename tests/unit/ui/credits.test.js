import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { createCredits } from "../../../src/ui/credits.js";

const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");

const open = () => {
  const { window } = new JSDOM(html);
  createCredits(window.document);
  return window.document;
};

describe("credits", () => {
  it("starts hidden", () => {
    const document = open();
    expect(document.getElementById("credits").hidden).toBe(true);
  });

  it("opens from the Credits button and names the creator and Claude", () => {
    const document = open();
    document.getElementById("info").click();
    const panel = document.getElementById("credits");
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain("Created by M K");
    expect(panel.textContent).toContain("Claude");
  });

  it("closes with Done", () => {
    const document = open();
    document.getElementById("info").click();
    document.getElementById("cr-done").click();
    expect(document.getElementById("credits").hidden).toBe(true);
  });
});
