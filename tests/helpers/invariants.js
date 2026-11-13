import { expect } from "vitest";

const ROOM_TOLERANCE = 0.3;
const SIZE_FIELDS = ["size", "sizeT", "sx", "sy", "sz", "r", "rBody"];

const bad = (v) => !Number.isFinite(v);

function vectorProblem(label, v) {
  for (const axis of ["x", "y", "z"]) if (bad(v[axis])) return `${label}.${axis} is ${v[axis]}`;
  return null;
}

function colliderExtent(o) {
  let low = Infinity, high = -Infinity;
  for (let k = 0; k < o.cn; k++) {
    low = Math.min(low, o.pos.y + o.wo[3 * k + 1] - o.cRad[k]);
    high = Math.max(high, o.pos.y + o.wo[3 * k + 1] + o.cRad[k]);
  }
  return { low, high };
}

export function findViolation({ objs, ey, fluid, yMin, yMax }) {
  for (const o of objs) {
    for (const key of ["pos", "vel", "ang"]) {
      const problem = vectorProblem(`shape ${o.id} ${key}`, o[key]);
      if (problem) return problem;
    }
    for (const key of SIZE_FIELDS) if (o[key] !== undefined && bad(o[key])) return `shape ${o.id} ${key} is ${o[key]}`;
    if (o.dying || o.pinned || o.dragged) continue;
    const { low, high } = colliderExtent(o);
    if (low < yMin - ROOM_TOLERANCE) return `shape ${o.id} below floor: ${low} < ${yMin}`;
    if (high > yMax + ROOM_TOLERANCE) return `shape ${o.id} above ceiling: ${high} > ${yMax}`;
  }
  for (const key of ["pos", "vel"]) {
    const problem = vectorProblem(`eye ${key}`, ey[key]);
    if (problem) return problem;
  }
  for (let i = 0; i < fluid.n; i++) {
    if (bad(fluid.px[i])) return `fluid px[${i}] is ${fluid.px[i]}`;
    if (bad(fluid.py[i])) return `fluid py[${i}] is ${fluid.py[i]}`;
  }
  return null;
}

export function assertSane(debug) {
  expect(findViolation(debug)).toBeNull();
}
