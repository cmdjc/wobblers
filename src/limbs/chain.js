import * as THREE from "three";

const cD = new THREE.Vector3(), cB = new THREE.Vector3();

export function dirichlet(n, b) { return Math.sin(n * b / 2) / Math.sin(b / 2); }
export function chainBeta(r, n) { // bend per joint so that n equal segments span r segment-lengths
  if (r >= n - 1e-4) return 0;
  let lo = 1e-4, hi = 2 * Math.PI / n * 0.999;
  for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (dirichlet(n, mid) > r) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
export function jointLimit(o, n) { return Math.min(0.2 + o.jflex * 2.6, (2 * Math.PI / n) * 0.97); }
// n equal rigid segments from S toward E. The chain bends toward `bias` (knees forward, elbows back),
// never more than thetaMax per joint, so a too-close target is pushed out to the shortest allowed reach.
export function solveChain(S, E, n, total, thetaMax, bias, pts) {
  const c = total / n;
  cD.copy(E).sub(S);
  let d = cD.length();
  if (d < 1e-6) cD.set(0, -1, 0); else cD.multiplyScalar(1 / d);
  const dmin = c * dirichlet(n, thetaMax), dmax = total * 0.9999;
  d = Math.min(Math.max(d, dmin), dmax);
  cB.copy(bias).addScaledVector(cD, -bias.dot(cD));
  if (cB.lengthSq() < 1e-6) cB.set(0, 0, 1).addScaledVector(cD, -cD.z);
  if (cB.lengthSq() < 1e-6) cB.set(1, 0, 0);
  cB.normalize();
  const beta = chainBeta(d / c, n);
  pts[0].copy(S);
  if (beta < 1e-4) { for (let k = 1; k <= n; k++) pts[k].copy(S).addScaledVector(cD, c * k); pts[n].copy(S).addScaledVector(cD, d); return pts; }
  const R = c / (2 * Math.sin(beta / 2)), half = n * beta / 2, ch = Math.cos(half);
  for (let k = 1; k <= n; k++) {
    const a = -half + k * beta;
    pts[k].copy(S).addScaledVector(cD, R * Math.sin(a) + d / 2).addScaledVector(cB, R * (Math.cos(a) - ch));
  }
  return pts;
}
