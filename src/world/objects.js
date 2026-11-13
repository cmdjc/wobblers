import * as THREE from "three";
import { VS, FS } from "../gfx/shaders.js";
import { SHAPES } from "../shapes/shapes.js";

const palettes = [
  [0xff3d81, 0xffe14d], [0x2de2e6, 0x7b2cff], [0xff9a3c, 0x2a1bff],
  [0xb6ffdc, 0xff2d2d], [0xfff04d, 0x9b2cff], [0x7cff6b, 0xff4fd8]
];
const LEVEL_FRONT = [1, 1.9, 2.35, 2.58];
export const MAX_OBJS = 16;

export function createObjects(ctx) {
  const objs = [];

  function addObj(shapeIdx, x, y) {
    const sh = SHAPES[shapeIdx];
    const pal = palettes[Math.floor(Math.random() * palettes.length)];
    const size = 0.72 + Math.random() * 0.35;
    const axis = new THREE.Vector3(0, 1, 0), lag = new THREE.Vector3(), pressLocal = new THREE.Vector3(0, 0, 1);
    const uniforms = {
      uTime: ctx.timeU, uAxis: { value: axis }, uQ: { value: 0 }, uLag: { value: lag }, uRip: { value: 0 },
      uColA: { value: new THREE.Color(pal[0]) }, uColB: { value: new THREE.Color(pal[1]) },
      uHue: { value: Math.random() },
      uPress: { value: 0 }, uPressDir: { value: pressLocal },
      uStone: { value: 0 }, uSick: { value: 0 }, uGold: { value: 0 }, uGray: { value: 0 }
    };
    const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: FS });
    const mesh = new THREE.Mesh(ctx.getGeo(shapeIdx), mat);
    mesh.scale.setScalar(size);
    mesh.frustumCulled = false;
    mesh.quaternion.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    ctx.scene.add(mesh);
    const eyes = ctx.makeEyes();
    eyes.s.scale.set(size * 0.9, size * 0.45, 1);
    ctx.scene.add(eyes.s);
    const o = {
      id: ctx.uid++, shape: shapeIdx, mesh, mat, eyes, size,
      r: sh.r * size, front: sh.front * size, mass: Math.pow(size, 3), pitch: sh.pitch / size,
      baseR: sh.r, baseFront: sh.front, shapePitch: sh.pitch, sizeT: size,
      pos: new THREE.Vector3(x, y, (Math.random() - 0.5) * 1.2),
      vel: new THREE.Vector3(),
      ang: new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3),
      q: 0, qv: 0, axis, lag, lagv: new THREE.Vector3(), rip: 0,
      moodT: 0, dragged: false, drag: null,
      wob: 0, p: 0, pv: 0, holdT: 0, pressWorld: new THREE.Vector3(0, 0, 1), pressLocal,
      dying: false, dieT: 0,
      sx: 1, sy: 1, sz: 1, level: 0, bounce: 0.75, density: 1, friction: 0.3, gScale: 1,
      pinned: false, pinTarget: new THREE.Vector3(), boundMul: 1, frontMul: 1,
      overT: 0,
      legSegs: 2, armSegs: 2, jflex: 0.8, footScale: 1, handScale: 1, fdir: 1,
      arms: 0, armLen: 0.5, abeh: ctx.defaultAbeh(), held: null, armMeshes: [], armMatA: null, armMatB: null,
      ai: { mode: 'idle', t: 0, cd: 5 + Math.random() * 8, gNext: 2 + Math.random() * 3, gUntil: 0, gKind: 'none', gArm: 0, gTarget: '', tp: new THREE.Vector3(), dir: new THREE.Vector3(),
            dirx: 1, item: null, itemR: 0.2, partner: null, passive: false, lead: false, hit: false, hugT: 0, punchCd: 0, tgt: null, heartT: 0 },
      legs: 0, legLen: 0.35, clumsy: 0.3, stamina: 0.5, beh: ctx.defaultBeh(),
      state: 'walk', energy: 1, fallT: 0, dizzyT: 0, pounceT: 0, tripNow: false,
      tilt: 0, tiltV: 0, tiltT: 0, yaw: 0, phase: Math.random() * 6, groundT: 0,
      up: new THREE.Vector3(0, 1, 0), side: new THREE.Vector3(1, 0, 0), vTarget: 0,
      wanderDir: 0, wanderT: 0, pace: 0.8 + Math.random() * 0.5,
      legMeshes: [], legMatA: null, legMatB: null, legCur: 0, legBuilt: 0, bottomLocal: 0, halfW: 0.5, halfD: 0.5,
      stoneT: 0, sickT: 0, sickCd: 0, goldT: 0, wobSaved: 0, densSaved: 1, carried: false,
      role: null, lvl: -1, part: false, carryMesh: null, hopT: 0, hopCd: 0, hitCd: 0, rally: 0, hopFail: 0, stuckT: 0,
      genius: false, outfit: null, rig: null, ideaT: 2, muttT: 1, paceT: 0, paceDir: 1, thinkT: 0, sketch: null, bulbT: 0, homeX: 0, faceDir: 1,
      carry: null, ammoT: 0, ammoHit: false, disposable: false, origSizeT: 0, caged: false
    };
    objs.push(o);
    applySize(o);
    return o;
  }
  function removeObj(o) {
    if (ctx.sel === o) ctx.closeEditor();
    ctx.clearLegs(o);
    ctx.clearArms(o);
    ctx.dropCarry(o);
    ctx.clearOutfit(o);
    ctx.releaseCarry(o);
    if (ctx.reb.genius === o) ctx.reb.genius = null;
    ctx.scene.remove(o.mesh); ctx.scene.remove(o.eyes.s);
    o.mat.dispose(); o.eyes.s.material.dispose(); o.eyes.tex.dispose();
    const i = objs.indexOf(o);
    if (i >= 0) objs.splice(i, 1);
  }
  function applySize(o) {
    const m = Math.max(o.sx, o.sy, o.sz);
    const sm = m >= 1 ? 1 + 0.6 * (m - 1) : m;
    o.frontMul = sm * LEVEL_FRONT[o.level];
    o.front = o.baseFront * o.size * o.frontMul;
    o.mass = Math.pow(o.size, 3) * o.sx * o.sy * o.sz * o.density * (1 + 0.5 * o.level);
    o.pitch = o.shapePitch / o.size;
    ctx.buildCollider(o);
  }
  const api = { objs, addObj, removeObj, applySize };
  Object.assign(ctx, api);
  return api;
}
