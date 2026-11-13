import { describe, expect, it } from "vitest";
import { bootLegacy, bootNew } from "../../helpers/boot.js";

describe("debug handles", () => {
  it("have identical key sets in legacy and new", async () => {
    const legacy = await bootLegacy({ seed: 1 });
    const legacyKeys = Object.keys(legacy.debug).sort();
    legacy.dispose();
    const next = await bootNew({ seed: 1 });
    const nextKeys = Object.keys(next.debug).sort();
    next.dispose();
    expect(nextKeys).toEqual(legacyKeys);
    expect(legacyKeys.length).toBeGreaterThan(40);
  }, 60000);
});
