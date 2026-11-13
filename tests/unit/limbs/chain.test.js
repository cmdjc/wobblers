import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { chainBeta, dirichlet, jointLimit, solveChain } from "../../../src/limbs/chain.js";

const makePts = (n) => Array.from({ length: n + 1 }, () => new THREE.Vector3());
const S = new THREE.Vector3(0, 0, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

const solve = (n, reach, { thetaMax = 2, bias = FORWARD, total = 1.2, dir = DOWN } = {}) => {
  const pts = makePts(n);
  const E = dir.clone().multiplyScalar(reach);
  solveChain(S, E, n, total, thetaMax, bias, pts);
  return { pts, E };
};

const jointAngles = (pts) => {
  const angles = [];
  for (let k = 1; k < pts.length - 1; k++) {
    const a = pts[k].clone().sub(pts[k - 1]).normalize();
    const b = pts[k + 1].clone().sub(pts[k]).normalize();
    angles.push(Math.acos(Math.min(1, Math.max(-1, a.dot(b)))));
  }
  return angles;
};

describe("dirichlet and chainBeta", () => {
  it("dirichlet is n at zero bend limit and sin ratio otherwise", () => {
    expect(dirichlet(4, 1e-9)).toBeCloseTo(4, 6);
    expect(dirichlet(2, Math.PI / 2)).toBeCloseTo(Math.sin(Math.PI / 2) / Math.sin(Math.PI / 4), 12);
  });

  it("chainBeta is zero when fully stretched and inverts dirichlet otherwise", () => {
    expect(chainBeta(4, 4)).toBe(0);
    for (const n of [2, 3, 5, 6]) {
      const r = n * 0.6;
      expect(dirichlet(n, chainBeta(r, n))).toBeCloseTo(r, 4);
    }
  });
});

describe("jointLimit", () => {
  it("grows with flexibility and never reaches a full turn per chain", () => {
    expect(jointLimit({ jflex: 0 }, 3)).toBeCloseTo(0.2, 12);
    expect(jointLimit({ jflex: 0.5 }, 3)).toBeCloseTo(1.5, 12);
    expect(jointLimit({ jflex: 1 }, 6)).toBeCloseTo((2 * Math.PI / 6) * 0.97, 12);
  });
});

describe("solveChain", () => {
  it("keeps every segment at total / n from the minimum reach beyond full length", () => {
    const total = 1.2;
    for (let n = 2; n <= 6; n++) {
      const thetaMax = jointLimit({ jflex: 0.6 }, n);
      const dmin = (total / n) * dirichlet(n, thetaMax);
      for (let i = 0; i <= 10; i++) {
        const reach = dmin + ((total * 1.3 - dmin) * i) / 10;
        const { pts } = solve(n, reach, { thetaMax, total });
        for (let k = 1; k <= n; k++) {
          expect(pts[k].distanceTo(pts[k - 1]), `n=${n} reach=${reach} k=${k}`).toBeCloseTo(total / n, 6);
        }
      }
    }
  });

  it("starts at S", () => {
    const { pts } = solve(3, 0.8);
    expect(pts[0].toArray()).toEqual([0, 0, 0]);
  });

  it("reaches E when E is reachable", () => {
    for (let n = 2; n <= 6; n++) {
      const { pts, E } = solve(n, 0.9, { thetaMax: 2.5 });
      expect(pts[n].distanceTo(E)).toBeLessThan(1e-6);
    }
  });

  it("goes straight, to just under full length, when the target is out of reach", () => {
    const { pts } = solve(4, 5);
    expect(pts[4].distanceTo(S)).toBeCloseTo(1.2 * 0.9999, 9);
    expect(pts[4].x).toBeCloseTo(0, 12);
    expect(pts[4].z).toBeCloseTo(0, 12);
    expect(pts[4].y).toBeLessThan(0);
  });

  it("bends toward the bias direction", () => {
    for (const bias of [FORWARD, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1)]) {
      const { pts } = solve(3, 0.7, { bias });
      const mid = pts[1].clone().add(pts[2]).multiplyScalar(0.5);
      expect(mid.dot(bias)).toBeGreaterThan(0.01);
    }
  });

  it("never bends a joint past thetaMax", () => {
    for (let n = 2; n <= 6; n++) {
      const thetaMax = jointLimit({ jflex: 0.3 }, n);
      for (const reach of [0, 0.05, 0.2, 0.5, 0.9, 1.1]) {
        const { pts } = solve(n, reach, { thetaMax });
        for (const angle of jointAngles(pts)) expect(angle, `n=${n} reach=${reach}`).toBeLessThanOrEqual(thetaMax + 1e-6);
      }
    }
  });

  it("pushes a target closer than the minimum reach out to the minimum reach", () => {
    const n = 4;
    const thetaMax = 0.8;
    const dmin = (1.2 / n) * dirichlet(n, thetaMax);
    const { pts } = solve(n, 0.01, { thetaMax });
    expect(pts[n].distanceTo(S)).toBeCloseTo(dmin, 6);
    expect(pts[n].distanceTo(S)).toBeGreaterThan(0.01);
  });

  it("points down when the target sits on S", () => {
    const pts = makePts(3);
    solveChain(S, S, 3, 1.2, 1, FORWARD, pts);
    expect(pts[3].y).toBeLessThan(0);
  });

  it("picks a fallback bend plane when the bias is parallel to the reach", () => {
    const { pts } = solve(3, 0.6, { bias: DOWN });
    for (const p of pts) expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
    expect(pts[1].distanceTo(pts[0])).toBeCloseTo(0.4, 6);
  });
});
