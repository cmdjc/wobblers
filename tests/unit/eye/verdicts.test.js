import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRIZE, PUNISH } from "../../../src/eye/verdicts.js";
import { bootNew } from "../../helpers/boot.js";

let game;
let target;

beforeEach(async () => {
  game = await bootNew({ seed: 31 });
  game.step(30);
  game.debug.summonEye();
  game.step(70);
  target = game.debug.addObj(0, 0, 0);
  game.step(2);
});

afterEach(() => {
  vi.restoreAllMocks();
  game.dispose();
});

const punish = (kind) => game.debug.applyPunish(target, kind);
const prize = (kind) => game.debug.applyPrize(target, kind);
const stillThere = () => game.debug.objs.includes(target);

describe("verdict lists", () => {
  it("lists the seven punishments", () => {
    expect(PUNISH).toEqual(["shrink", "squash", "fling", "stone", "melt", "pop", "sick"]);
  });

  it("lists nine prizes with gift four times", () => {
    expect(PRIZE).toHaveLength(9);
    expect(PRIZE.filter((kind) => kind === "gift")).toHaveLength(4);
    expect([...new Set(PRIZE)]).toEqual(["grow", "legs", "gold", "gift", "heal", "hug"]);
  });
});

describe("the 60/40 choice", () => {
  const omenWith = (random) => {
    const { ey } = game.debug;
    ey.state = "roam"; ey.nextT = 0;
    vi.spyOn(Math, "random").mockReturnValue(random);
    game.step(1);
    vi.restoreAllMocks();
    return ey;
  };

  it("punishes below 0.4 and picks the kind by the next draw", () => {
    const ey = omenWith(0.39);
    expect(ey.state).toBe("omen");
    expect(ey.verdict).toBe("punish");
    expect(ey.kind).toBe(PUNISH[Math.floor(0.39 * PUNISH.length)]);
  });

  it("gives a prize from 0.4 up", () => {
    const ey = omenWith(0.4);
    expect(ey.state).toBe("omen");
    expect(ey.verdict).toBe("prize");
    expect(ey.kind).toBe(PRIZE[Math.floor(0.4 * PRIZE.length)]);
  });
});

describe("punishments", () => {
  it("shrinks the target size by 0.55 down to 0.35", () => {
    target.sizeT = 1;
    punish("shrink");
    expect(target.sizeT).toBeCloseTo(0.55, 12);
    punish("shrink"); punish("shrink");
    expect(target.sizeT).toBe(0.35);
  });

  it("squashes it flat and wide", () => {
    target.sy = 1; target.sx = 1; target.sz = 1;
    punish("squash");
    expect(target.sy).toBe(0.5);
    expect(target.sx).toBeCloseTo(1.35, 12);
    expect(target.sz).toBeCloseTo(1.35, 12);
  });

  it("flings it up and away from the eye", () => {
    target.vel.set(0, 0, 0);
    game.debug.ey.pos.set(-2, 0, 1);
    punish("fling");
    expect(target.vel.y).toBeGreaterThanOrEqual(12);
    expect(target.vel.y).toBeLessThanOrEqual(15);
    expect(target.vel.x).toBeGreaterThan(0);
    expect(target.vel.z).toBe(0);
  });

  it("turns it to stone for 9 s: rigid and triple density, then wears off", () => {
    const density = target.density;
    target.wob = 0.5;
    punish("stone");
    expect(target.stoneT).toBe(9);
    expect(target.wob).toBe(-1);
    expect(target.density).toBeCloseTo(density * 3, 12);
    game.step(260);
    expect(target.stoneT).toBeGreaterThan(0);
    game.step(15);
    expect(target.stoneT).toBe(0);
    expect(target.wob).toBe(0.5);
    expect(target.density).toBeCloseTo(density, 12);
  });

  it("melts it into fluid particles and removes it", () => {
    const before = game.debug.fluid.n;
    punish("melt");
    expect(target.dying).toBe(true);
    expect(game.debug.fluid.n).toBeGreaterThan(before);
    game.step(15);
    expect(stillThere()).toBe(false);
  });

  it("pops it with a ring and removes it", () => {
    const rings = game.debug.rings.length;
    punish("pop");
    expect(target.dying).toBe(true);
    expect(game.debug.rings.length).toBeGreaterThan(rings);
    game.step(15);
    expect(stillThere()).toBe(false);
  });

  it("makes it sick for 12 s, then it recovers", () => {
    punish("sick");
    expect(target.sickT).toBe(12);
    game.step(350);
    expect(target.sickT).toBeGreaterThan(0);
    game.step(15);
    expect(target.sickT).toBeLessThanOrEqual(0);
  });

  it("jams a bare gear instead of the named effect when the draw is under 0.6", () => {
    const gear = game.debug.addObj(7, 1, 0);
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    game.debug.applyPunish(gear, "melt");
    expect(gear.stoneT).toBe(9);
    expect(gear.dying).toBe(false);
  });
});

describe("prizes", () => {
  it("grows the target by 1.4 and tints it gold", () => {
    target.sizeT = 0.5;
    prize("grow");
    expect(target.sizeT).toBeCloseTo(0.7, 12);
    expect(target.goldT).toBeGreaterThanOrEqual(10);
  });

  it("gives 2 to 4 legs to a legless shape and 2 more to a legged one", () => {
    expect(target.legs).toBe(0);
    prize("legs");
    expect(target.legs).toBeGreaterThanOrEqual(2);
    expect(target.legs).toBeLessThanOrEqual(4);
    expect(target.beh.wander).toBe(true);
    const had = target.legs;
    prize("legs");
    expect(target.legs).toBe(had + 2);
  });

  it("gilds it for 30 s", () => {
    prize("gold");
    expect(target.goldT).toBe(30);
  });

  it("gifts one or two new golden shapes, never a gear", () => {
    for (let i = 0; i < 12; i++) {
      const before = new Set(game.debug.objs);
      prize("gift");
      const added = game.debug.objs.filter((o) => !before.has(o));
      expect(added.length).toBeGreaterThanOrEqual(1);
      expect(added.length).toBeLessThanOrEqual(2);
      for (const o of added) {
        expect(o.shape).toBeGreaterThanOrEqual(0);
        expect(o.shape).toBeLessThan(7);
        expect(o.goldT).toBe(12);
      }
    }
  });

  it("heals: clears stone and sickness and restores energy", () => {
    punish("stone");
    target.sickT = 5; target.energy = 0.1;
    prize("heal");
    expect(target.stoneT).toBe(0);
    expect(target.sickT).toBe(0);
    expect(target.energy).toBe(1);
    expect(target.goldT).toBe(14);
  });

  it("hugs: the eye holds the target pinned for 3.2 s", () => {
    prize("hug");
    expect(game.debug.ey.state).toBe("hug");
    expect(game.debug.ey.hugT).toBe(3.2);
    expect(target.pinned).toBe(true);
    expect(target.carried).toBe(true);
  });
});

describe("statuses", () => {
  it("lets gold expire after its timer", () => {
    prize("gold");
    game.step(31 * 30);
    expect(target.goldT).toBeLessThanOrEqual(0);
  });
});
