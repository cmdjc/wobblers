export function createContext() {
  return {
    W: 1, H: 1, hx: 2, hy: 4, hz: 1.8, yMin: -3, yMax: 4,
    uid: 0, nextShape: 0,
    actx: null, soundOn: true, lastSnd: 0,
    gMode: 0,
    clockNow: 0,
    sayTimer: 0, hintDone: false,
    tool: 'play',
    sel: null,
    fluidOpen: false,
    fluidAcc: 0, fluidMs: 0,
    stirHinted: false,
    pointerT: -99,
    spHead: 0,
    pileBlocks: [],
    outfitTex: null,
    time: 0,
  };
}
