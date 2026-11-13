export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function installRandom(seed) {
  const original = Math.random;
  const game = mulberry32(seed);
  const uuid = mulberry32(seed ^ 0x9e3779b9);
  const counts = { game: 0, uuid: 0 };
  Math.random = () => {
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 3;
    const stack = new Error().stack;
    Error.stackTraceLimit = limit;
    if (stack.includes("generateUUID")) { counts.uuid += 1; return uuid(); }
    counts.game += 1;
    return game();
  };
  return { restore: () => { Math.random = original; }, counts };
}
