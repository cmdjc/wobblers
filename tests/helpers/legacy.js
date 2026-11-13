import { readFileSync } from "node:fs";

const legacyHtml = readFileSync(new URL("../../legacy/wobblers.html", import.meta.url), "utf8");
const scriptOpen = legacyHtml.indexOf("<script>\n(function () {") + "<script>\n".length;
const scriptClose = legacyHtml.lastIndexOf("</script>");
const legacySource = legacyHtml.slice(scriptOpen, scriptClose);
const iifeEnd = legacySource.lastIndexOf("})();");

const exposeLine = `window.__legacy = {
    objs, ey, reb, aw, FL, fluid, blocks, scene, camera, rings, look,
    addObj, removeObj, summonEye, spawnGenius, startAwakening, startBoss, peaceEnding, abortRebellion, abortAwakening, defeatEye,
    applyPunish, applyPrize,
    get W() { return W; },
    get H() { return H; },
    get hx() { return hx; },
    get hy() { return hy; },
    get hz() { return hz; },
    get yMin() { return yMin; },
    get yMax() { return yMax; },
    get uid() { return uid; },
    get nextShape() { return nextShape; },
    get actx() { return actx; },
    get soundOn() { return soundOn; },
    get lastSnd() { return lastSnd; },
    get gMode() { return gMode; },
    get clockNow() { return clockNow; },
    get sayTimer() { return sayTimer; },
    get hintDone() { return hintDone; },
    get tool() { return tool; },
    get sel() { return sel; },
    get fluidOpen() { return fluidOpen; },
    get fluidAcc() { return fluidAcc; },
    get fluidMs() { return fluidMs; },
    get stirHinted() { return stirHinted; },
    get pointerT() { return pointerT; },
    get spHead() { return spHead; },
    get pileBlocks() { return pileBlocks; },
    get outfitTex() { return outfitTex; },
    get last() { return last; },
    get time() { return time; },
  };
`;

const patchedSource = legacySource.slice(0, iifeEnd) + exposeLine + legacySource.slice(iifeEnd);

export function loadLegacy(harness, THREE) {
  const patchedThree = { ...THREE, WebGLRenderer: function WebGLRenderer() { return harness.renderer; } };
  const { window, document, env } = harness;
  const run = new Function("THREE", "window", "document", "performance", "navigator", "setTimeout", "clearTimeout", "requestAnimationFrame", patchedSource);
  run(patchedThree, window, document, env.performance, env.navigator, env.setTimeout, env.clearTimeout, env.requestAnimationFrame);
  return window.__legacy;
}
