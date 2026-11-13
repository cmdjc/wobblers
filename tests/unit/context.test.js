import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createContext } from "../../src/context.js";
import { bootNew } from "../helpers/boot.js";
import { hash, snapshot } from "../helpers/trace.js";

const gameLines = readFileSync(new URL("../../src/game.js", import.meta.url), "utf8").split("\n");

const MOVED = {
  W: 1, H: 1, hx: 2, hy: 4, hz: 1.8, yMin: -3, yMax: 4,
  uid: 0, nextShape: 0,
  actx: null, soundOn: true, lastSnd: 0,
  gMode: 0,
  clockNow: 0,
  sayTimer: 0, hintDone: false,
  tool: "play",
  sel: null,
  fluidOpen: false,
  fluidAcc: 0, fluidMs: 0,
  stirHinted: false,
  pointerT: -99,
  spHead: 0,
  outfitTex: null,
  time: 0,
};

const declaredFunctionNames = () => gameLines.flatMap((line) => {
  const match = line.match(/^\s*(?:export )?(?:async )?function (\w+)\(/);
  return match ? [match[1]] : [];
});

describe("createContext", () => {
  it("returns the legacy initial values", () => {
    const ctx = createContext();
    for (const [name, value] of Object.entries(MOVED)) expect(ctx[name], name).toBe(value);
    expect(ctx.pileBlocks).toEqual([]);
  });

  it("leaves last to the frame loop, which reads performance.now()", () => {
    expect("last" in createContext()).toBe(false);
  });

  it("returns a new object per call", () => {
    expect(createContext()).not.toBe(createContext());
  });

  it("does not share arrays between contexts", () => {
    const a = createContext();
    const b = createContext();
    expect(a.pileBlocks).not.toBe(b.pileBlocks);
    a.pileBlocks.push({});
    expect(b.pileBlocks).toHaveLength(0);
  });
});

describe("src/game.js", () => {
  it("declares none of the moved names with a top-level let", () => {
    const moved = [...Object.keys(MOVED), "pileBlocks", "last"];
    const declared = gameLines
      .filter((line) => /^ {2}let /.test(line))
      .flatMap((line) => [...line.matchAll(/(?:^ {2}let |, )(\w+)\s*=/g)].map((match) => match[1]));
    const clash = declared.filter((name) => moved.includes(name));
    expect(clash).toEqual([]);
  });

  it("declares no function besides createGame and the frame loop", () => {
    expect(declaredFunctionNames()).toEqual(["createGame", "frame"]);
  });

  it("registers nothing on ctx by hand", () => {
    expect(gameLines.filter((line) => line.includes("Object.assign(ctx"))).toEqual([]);
  });

  it("runs twice in one process with identical results", async () => {
    const run = async () => {
      const game = await bootNew({ seed: 7 });
      try {
        game.step(60);
        return hash(snapshot(game.debug, game.harness));
      } finally {
        game.dispose();
      }
    };
    const first = await run();
    const second = await run();
    expect(second).toBe(first);
  }, 120000);
});
