import { describe, expect, it } from "vitest";
import { createEnv } from "../../helpers/env.js";

const draw = (ctx, radius = 5) => {
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(10, 10, radius, 0, 6.28);
  ctx.fill();
  const gradient = ctx.createRadialGradient(0, 0, 1, 0, 0, 9);
  gradient.addColorStop(0, "red");
};

describe("canvas stub hash", () => {
  it("gives the same hash to the same call sequence", async () => {
    const { document } = await createEnv();
    const [x, y] = [0, 1].map(() => document.createElement("canvas"));
    draw(x.getContext("2d"));
    draw(y.getContext("2d"));
    expect(x.__hash).toBe(y.__hash);
    expect(x.__calls).toBe(y.__calls);
    expect(x.__calls).toBeGreaterThan(4);
  });

  it("changes the hash when one argument differs", async () => {
    const { document } = await createEnv();
    const [x, y] = [0, 1].map(() => document.createElement("canvas"));
    draw(x.getContext("2d"), 5);
    draw(y.getContext("2d"), 6);
    expect(x.__hash).not.toBe(y.__hash);
    expect(x.__calls).toBe(y.__calls);
  });

  it("tells an assignment from a call and a gradient stop change", async () => {
    const { document } = await createEnv();
    const [x, y, z] = [0, 1, 2].map(() => document.createElement("canvas"));
    const cx = x.getContext("2d"), cy = y.getContext("2d"), cz = z.getContext("2d");
    cx.fillStyle = "red";
    cy.strokeStyle = "red";
    cz.fillStyle = "blue";
    expect(new Set([x.__hash, y.__hash, z.__hash]).size).toBe(3);
  });

  it("keeps no call log", async () => {
    const { document } = await createEnv();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    for (let i = 0; i < 2000; i++) draw(ctx, i % 7);
    expect(canvas.__calls).toBeGreaterThan(10000);
    expect(canvas.__log).toBeUndefined();
    const arrays = Object.values(canvas).filter((v) => Array.isArray(v));
    expect(arrays).toEqual([]);
  });
});
