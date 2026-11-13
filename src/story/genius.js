import * as THREE from "three";
import { MAX_OBJS } from "../world/objects.js";
import { Y_AXIS, Z_AXIS } from "../limbs/legs.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rigQ1 = new THREE.Quaternion(), rigQ2 = new THREE.Quaternion();
const IDEAS = ['E=mc\u00b2', '42?', '\u03a3', '\u03c0', 'hmm...', 'x\u00b2+y\u00b2', '!?', 'F=ma', 'carry the 1', 'eureka?'];

export function sketchPath(kind) {
  const pts = [];
  const poly = (arr, per) => { for (let i = 0; i < arr.length - 1; i++) for (let k = 0; k < per; k++) { const u = k / per; pts.push([arr[i][0] + (arr[i + 1][0] - arr[i][0]) * u, arr[i][1] + (arr[i + 1][1] - arr[i][1]) * u]); } };
  if (kind === 'gear') { for (let a = 0; a < 6.283; a += 0.1) { const r = 0.5 + 0.09 * Math.sign(Math.sin(a * 8)); pts.push([Math.cos(a) * r, Math.sin(a) * r]); } }
  else if (kind === 'spiral') { for (let a = 0; a < 18; a += 0.35) pts.push([Math.cos(a) * a * 0.03, Math.sin(a) * a * 0.03]); }
  else if (kind === 'cannon') { poly([[-0.55, -0.12], [0.5, 0.22], [0.6, 0.05], [-0.45, -0.3], [-0.55, -0.12]], 7); for (let a = 0; a < 6.283; a += 0.5) pts.push([-0.15 + Math.cos(a) * 0.17, -0.38 + Math.sin(a) * 0.17]); }
  else if (kind === 'zigzag') poly([[-0.5, -0.3], [-0.2, 0.3], [0.05, -0.3], [0.3, 0.3], [0.5, -0.1]], 8);
  else poly([[0, 0.5], [0.3, -0.4], [-0.48, 0.15], [0.48, 0.15], [-0.3, -0.4], [0, 0.5]], 7);
  return pts;
}

export function createGenius(ctx) {
  const { scene, objs, reb } = ctx;
  const { mkTex, say, chime, tone, spark, flash, popText, addRing, addObj, removeObj, setLegs } = ctx;
  const { setTimeout } = ctx.env;

  function outfitTextures() {
    if (ctx.outfitTex) return ctx.outfitTex;
    const ink = '#12082b';
    ctx.outfitTex = {
      clip: mkTex(64, 80, g => {
        g.fillStyle = '#c99a5b'; g.strokeStyle = ink; g.lineWidth = 3; g.fillRect(4, 6, 56, 70); g.strokeRect(4, 6, 56, 70);
        g.fillStyle = '#fffdf0'; g.fillRect(10, 16, 44, 54); g.strokeRect(10, 16, 44, 54);
        g.strokeStyle = '#b8bccb'; g.lineWidth = 2; for (const y of [26, 34, 42]) { g.beginPath(); g.moveTo(14, y); g.lineTo(50, y); g.stroke(); }
        g.strokeStyle = '#4a7bd8'; g.beginPath(); g.moveTo(14, 54); g.quadraticCurveTo(24, 46, 30, 58); g.quadraticCurveTo(38, 66, 48, 52); g.stroke();
        g.fillStyle = '#8a8f9c'; g.fillRect(20, 2, 24, 12); g.strokeStyle = ink; g.strokeRect(20, 2, 24, 12);
      }),
      brain: mkTex(128, 96, g => {
        const gr = g.createRadialGradient(64, 50, 4, 64, 50, 62);
        gr.addColorStop(0, 'rgba(255,170,215,0.55)'); gr.addColorStop(1, 'rgba(255,170,215,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 96);
        g.lineWidth = 3; g.strokeStyle = '#c2457f'; g.fillStyle = '#ff9ac8';
        for (const x of [46, 82]) { g.beginPath(); g.ellipse(x, 48, 28, 26, 0, 0, 6.283); g.fill(); g.stroke(); }
        g.beginPath(); g.moveTo(64, 24); g.lineTo(64, 72); g.stroke();
        g.lineWidth = 2.5;
        for (const [a, b, c2, d] of [[30, 40, 44, 34], [36, 56, 52, 60], [76, 34, 94, 40], [78, 58, 92, 54], [44, 46, 56, 44], [72, 48, 86, 46]]) { g.beginPath(); g.moveTo(a, b); g.quadraticCurveTo((a + c2) / 2, (b + d) / 2 - 8, c2, d); g.stroke(); }
        g.fillStyle = '#e07aa8'; g.fillRect(58, 72, 12, 12);
      }),
      bulb: mkTex(64, 96, g => {
        const gr = g.createRadialGradient(32, 34, 2, 32, 34, 30);
        gr.addColorStop(0, 'rgba(255,248,170,1)'); gr.addColorStop(1, 'rgba(255,220,90,0.9)');
        g.fillStyle = gr; g.strokeStyle = ink; g.lineWidth = 3;
        g.beginPath(); g.arc(32, 34, 24, 0, 6.283); g.fill(); g.stroke();
        g.fillStyle = '#9aa0b0'; g.fillRect(22, 58, 20, 14); g.strokeRect(22, 58, 20, 14); g.fillRect(25, 72, 14, 8); g.strokeRect(25, 72, 14, 8);
        g.strokeStyle = '#d98a1a'; g.lineWidth = 2; g.beginPath(); g.moveTo(26, 56); g.lineTo(28, 40); g.lineTo(32, 46); g.lineTo(36, 40); g.lineTo(38, 56); g.stroke();
      })
    };
    return ctx.outfitTex;
  }
  function stickBetween(a, b, r, mat) {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 6), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.multiplyScalar(1 / len));
    m.scale.set(1, len, 1);
    return m;
  }
  // real 3D gear for the genius: spiky hair, round glasses, goggles pushed up on the forehead
  function buildRig(o) {
    const g = new THREE.Group();
    const ink = new THREE.MeshBasicMaterial({ color: 0x12082b });
    const lens = new THREE.MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    const brass = new THREE.MeshBasicMaterial({ color: 0xd4a24c });
    const strap = new THREE.MeshBasicMaterial({ color: 0x6b4a2f });
    const glass = new THREE.MeshBasicMaterial({ color: 0x78cdff, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
    const hairM = new THREE.MeshBasicMaterial({ color: 0xf0eef8 });
    const lineM = new THREE.LineBasicMaterial({ color: 0x12082b });
    o.rigMats = [ink, lens, brass, strap, glass, hairM, lineM];
    // glasses
    for (const sx of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.022, 8, 28), ink); ring.position.set(sx * 0.17, 0.08, 0.58); g.add(ring);
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), lens); l.position.set(sx * 0.17, 0.08, 0.575); g.add(l);
      g.add(stickBetween(new THREE.Vector3(sx * 0.335, 0.09, 0.575), new THREE.Vector3(sx * 0.47, 0.09, 0.17), 0.016, ink));
    }
    g.add(stickBetween(new THREE.Vector3(-0.03, 0.1, 0.585), new THREE.Vector3(0.03, 0.1, 0.585), 0.016, ink));
    // goggles on the forehead
    const gz = new THREE.Vector3(0, 0, 1);
    for (const sx of [-1, 1]) {
      const dir = new THREE.Vector3(sx * 0.15, 0.36, 0.4).normalize();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 8, 22), brass);
      ring.position.copy(dir).multiplyScalar(0.505); ring.quaternion.setFromUnitVectors(gz, dir); g.add(ring);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.095, 18), glass);
      disc.position.copy(dir).multiplyScalar(0.51); disc.quaternion.copy(ring.quaternion); g.add(disc);
    }
    const band = new THREE.Mesh(new THREE.TorusGeometry(Math.sqrt(0.25 - 0.34 * 0.34) + 0.01, 0.032, 6, 36), strap);
    band.rotation.x = Math.PI / 2; band.position.y = 0.34; g.add(band);
    // pointy hair: a crown of cones
    const Yv = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 16; i++) {
      const phi = i * 2.399, th = 0.12 + (i % 5) * 0.14, len = 0.3 + ((i * 37) % 7) * 0.05;
      const dir = new THREE.Vector3(Math.sin(th) * Math.cos(phi), Math.cos(th), Math.sin(th) * Math.sin(phi));
      const axis = dir.clone().add(new THREE.Vector3(0, 0.6, 0)).normalize();
      const geo = new THREE.ConeGeometry(0.065, 1, 6); geo.translate(0, 0.5, 0);
      const spike = new THREE.Mesh(geo, hairM);
      spike.position.copy(dir).multiplyScalar(0.46);
      spike.quaternion.setFromUnitVectors(Yv, axis);
      spike.scale.set(1, len, 1);
      spike.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineM));
      g.add(spike);
    }
    scene.add(g);
    o.rig = g;
  }
  function makeOutfit(o) {
    const tx = outfitTextures();
    const mk = (map, ro, depth, add) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: depth !== false, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
      sp.renderOrder = ro; scene.add(sp); return sp;
    };
    o.outfit = { clip: mk(tx.clip, 0.8), brain: mk(tx.brain, 2, false, true), bulb: mk(tx.bulb, 2.1, false) };
    buildRig(o);
  }
  function clearOutfit(o) {
    if (o.rig) {
      o.rig.traverse(c => { if (c.geometry) c.geometry.dispose(); });
      scene.remove(o.rig);
      if (o.rigMats) o.rigMats.forEach(m => m.dispose());
      o.rig = null; o.rigMats = null;
    }
    if (!o.outfit) return;
    for (const k in o.outfit) { scene.remove(o.outfit[k]); o.outfit[k].material.dispose(); }
    o.outfit = null;
  }
  function releaseCarry(o) {
    if (o.carry) { o.carry.pinned = false; o.carry.carried = false; o.carry = null; }
  }
  function updateOutfit(o, t, sc) {
    const f = o.outfit, S = o.size * sc, cs = Math.cos(o.tilt), sn = Math.sin(o.tilt), fz = o.pos.z + o.front;
    const vs = o.vel.dot(o.side);
    if (Math.abs(vs) > 0.3) o.faceDir += (Math.sign(vs) - o.faceDir) * 0.1;
    if (o.rig) { // hair, glasses and goggles ride on the body
      rigQ1.setFromAxisAngle(Z_AXIS, o.tilt); rigQ2.setFromUnitVectors(Y_AXIS, o.up);
      o.rig.quaternion.copy(rigQ1).multiply(rigQ2);
      o.rig.position.copy(o.pos); o.rig.scale.setScalar(S); o.rig.visible = sc > 0.05;
    }
    const put = (sp, ox, oy, dz, w, h, rot) => {
      sp.position.set(o.pos.x + (ox * cs - oy * sn) * S, o.pos.y + (ox * sn + oy * cs) * S, fz + dz);
      sp.scale.set(w * S, h * S, 1); sp.material.rotation = o.tilt + (rot || 0); sp.visible = sc > 0.05;
    };
    put(f.clip, 0.62 * o.faceDir, -0.12, 0.05, 0.5, 0.62, Math.sin(t * 4) * 0.08 + (o.thinkT > 0 ? Math.sin(t * 14) * 0.14 : 0));
    const pulse = 1 + 0.08 * Math.sin(t * 3);
    put(f.brain, 0, 1.22, 0.0, 0.95 * pulse, 0.72 * pulse, 0);
    f.brain.material.opacity = 0.7 + 0.3 * Math.sin(t * 3);
    put(f.bulb, -0.62 * o.faceDir, 1.35, 0.0, 0.36, 0.54, 0);
    f.bulb.visible = f.bulb.visible && o.bulbT > 0;
  }
  // genius behaviour: pacing, muttering, sketching ideas in the air
  function startIdea(o, kind) {
    kind = kind || ['gear', 'spiral', 'cannon', 'zigzag', 'star'][(Math.random() * 5) | 0];
    o.sketch = { pts: sketchPath(kind), i: 0, t: 0, ox: o.size * 1.0 * (Math.random() < 0.5 ? -1 : 1), oy: o.size * 1.15 };
    o.thinkT = 2.0;
  }
  function sketchTick(o, dt) {
    const sk = o.sketch;
    sk.t += dt;
    while (sk.i < sk.pts.length && sk.t > sk.i * 0.035) {
      const p = sk.pts[sk.i++];
      spark(o.pos.x + sk.ox + p[0], o.pos.y + sk.oy + p[1], o.pos.z + 0.5, 1, { color: 0x7fe9ff, speed: 0.001, life: 2.2, size: 0.08, grav: 0 });
    }
    if (sk.i >= sk.pts.length) { o.sketch = null; if (Math.random() < 0.55) lightbulb(o); }
  }
  function lightbulb(o) {
    o.bulbT = 1.3;
    tone(880, 0.4, 0.05, 'triangle'); setTimeout(() => tone(1320, 0.4, 0.05, 'triangle'), 120);
    popText(o.pos.x, o.pos.y + o.size * 1.9, '!', '#ffe9a0', 1.2, 0.7);
  }
  function mutter(o) {
    popText(o.pos.x + (Math.random() - 0.5) * 0.8, o.pos.y + o.size * 1.0, IDEAS[(Math.random() * IDEAS.length) | 0], '#bfefff', 1.8, 0.55);
    for (let i = 0; i < 3; i++) setTimeout(() => tone(150 + Math.random() * 130, 0.07, 0.014, 'square'), i * 90);
  }
  function geniusAI(o, dt, t, grounded) {
    o.energy = 1;
    o.ideaT -= dt; o.muttT -= dt; o.paceT -= dt; o.bulbT = Math.max(0, o.bulbT - dt);
    if (o.ideaT <= 0 && !o.sketch) { o.ideaT = 6 + Math.random() * 6; startIdea(o, null); }
    if (o.muttT <= 0) { o.muttT = 1.8 + Math.random() * 2.6; mutter(o); }
    if (o.sketch) sketchTick(o, dt);
    if (reb.state === 'celebrate') {
      o.vTarget = Math.sin(t * 3) * 1.2;
      if (grounded && Math.random() < dt * 1.5) { o.vel.y = 5.5; o.hopT = 0.3; o.groundT = 0; }
      return;
    }
    if (!grounded) return;
    if (reb.kind === 'cannon' && reb.cn && reb.state === 'battle' && !objs.some(x => x.role === 'loader')) { // nobody to help: load it itself
      ctx.loaderAI(o, grounded, 1.5);
      if (o.carry || reb.cn.loader === o) return;
    }
    const home = reb.cn ? reb.cn.x + 1.3 : o.homeX;
    if (o.thinkT > 0) { o.thinkT -= dt; o.vTarget = 0; o.tiltT = Math.sin(t * 9) * 0.05; return; }
    if (o.paceT <= 0) { o.paceT = 1 + Math.random() * 2.5; o.paceDir = Math.random() < 0.25 ? 0 : (Math.random() < 0.5 ? -1 : 1); }
    const far = Math.abs(o.pos.x - home) > 2.2;
    if (o.pos.x < home - 0.9) o.paceDir = 1; else if (o.pos.x > home + 0.9) o.paceDir = -1;
    if (far) o.paceDir = Math.sign(home - o.pos.x);
    o.vTarget = o.paceDir * (far ? 1.5 : 0.9);
  }
  function spawnGenius() {
    if (objs.length >= MAX_OBJS) { const old = objs.find(x => !x.dragged && !x.dying && !x.pinned && !x.role && !x.genius); if (old) removeObj(old); else return; }
    const g = addObj(0, clamp((Math.random() - 0.5) * ctx.hx, -ctx.hx + 0.9, ctx.hx - 0.9), ctx.yMax - 0.8);
    g.pos.z = 0; g.vel.set(0, -1, 0);
    g.genius = true; g.size = g.sizeT = 1.1; g.clumsy = 0.45; g.stamina = 1; g.pace = 0.8; g.homeX = g.pos.x;
    g.mat.uniforms.uColA.value.setHex(0xfff2a8); g.mat.uniforms.uColB.value.setHex(0xffd25a);
    setLegs(g, 2); g.role = 'genius';
    makeOutfit(g);
    reb.genius = g;
    popText(g.pos.x, g.pos.y - 0.8, 'Hmm...', '#ffe9a0', 2, 0.8);
    spark(g.pos.x, g.pos.y, 0.6, 24, { color: 0xffe9a0, speed: 3, life: 1.2, size: 0.14, spread: 0.6 });
    chime([784, 988, 1175], 120, 0.05); flash('#fff6d8', 0.25);
    say('A genius wobbler has appeared!', 3200);
  }
  function retireGenius() {
    const g = reb.genius; reb.genius = null;
    if (!g || objs.indexOf(g) < 0) return;
    g.genius = false; g.role = null;
    popText(g.pos.x, g.pos.y + 1.4, 'Eureka!', '#ffe9a0', 2.2, 1.0);
    spark(g.pos.x, g.pos.y, 1, 30, { color: 0xffe9a0, speed: 4, life: 1.4, size: 0.15, spread: g.r });
    addRing(g.pos, 0xffe9a0, 3);
    g.dying = true; g.dieT = 0;
  }
  const api = { outfitTextures, stickBetween, buildRig, makeOutfit, clearOutfit, releaseCarry, updateOutfit, startIdea, geniusAI, spawnGenius, retireGenius };
  Object.assign(ctx, api);
  return api;
}
