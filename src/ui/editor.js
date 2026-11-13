import * as THREE from "three";
import { TAN, CAM_Z } from "../gfx/background.js";
import { SHAPES } from "../shapes/shapes.js";
import { MAX_OBJS } from "../world/objects.js";

export function createEditor(ctx) {
  const { window, document, navigator } = ctx.env;
  const { scene, objs, tmpV } = ctx;
  const { say, hideHint, boing, impact, applySize, addObj, removeObj, getFracGeo, maxSizeFor } = ctx;

  const ed = document.getElementById('editor');
  const edShapes = document.getElementById('ed-shapes');
  const edBody = document.getElementById('ed-body');
  const selRing = new THREE.Mesh(
    new THREE.RingGeometry(0.93, 1, 64),
    new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.85, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  );
  selRing.visible = false; selRing.renderOrder = 5;
  scene.add(selRing);
  ctx.selRing = selRing;

  const BEHS = [['wander', 'Wander'], ['follow', 'Follow finger'], ['flee', 'Flee finger'], ['chase', 'Chase others'], ['seek', 'Seek liquid'], ['avoid', 'Avoid liquid']];
  const behBtns = [], abehBtns = [];
  const ABEHS = [['gesture', 'Gestures'], ['punch', 'Punch'], ['grab', 'Grab & throw'], ['hug', 'Hug & hold hands']];
  const FIELDS = [
    ['Form'],
    ['size', 'Size', 0.3, 5, 0.01],
    ['sx', 'Stretch X', 0.4, 3, 0.01],
    ['sy', 'Stretch Y', 0.4, 3, 0.01],
    ['sz', 'Stretch Z', 0.4, 3, 0.01],
    ['level', 'Complexity', 0, 3, 1],
    ['Feel'],
    ['wob', 'Wobble', -1, 4, 0.05],
    ['Physics'],
    ['bounce', 'Bounciness', 0, 1.1, 0.01],
    ['density', 'Weight', 0.2, 5, 0.05],
    ['friction', 'Friction', 0, 1, 0.01],
    ['gScale', 'Gravity', 0, 2, 0.05],
    ['Legs'],
    ['legs', 'Legs', 0, 24, 1],
    ['legLen', 'Leg length', 0.1, 3, 0.01],
    ['legSegs', 'Leg segments', 2, 6, 1],
    ['footScale', 'Foot size', 0.5, 3, 0.01],
    ['clumsy', 'Clumsiness', 0, 1, 0.01],
    ['stamina', 'Stamina', 0, 1, 0.01],
    ['@beh'],
    ['Arms'],
    ['arms', 'Arms', 0, 12, 1],
    ['armLen', 'Arm length', 0.1, 2, 0.01],
    ['armSegs', 'Arm segments', 2, 6, 1],
    ['handScale', 'Hand size', 0.5, 3, 0.01],
    ['Joints'],
    ['jflex', 'Joint limit', 0.1, 1, 0.01],
    ['@abeh']
  ];
  const refs = {};
  FIELDS.forEach(fd => {
    if (fd[0] === '@abeh') {
      const h = document.createElement('div'); h.className = 'ed-sec'; h.textContent = 'Arm behavior';
      const box = document.createElement('div'); box.className = 'chips';
      ABEHS.forEach(bh => {
        const b = document.createElement('button');
        b.textContent = bh[1]; b.dataset.k = bh[0];
        b.addEventListener('click', () => { if (!ctx.sel) return; ctx.sel.abeh[bh[0]] = !ctx.sel.abeh[bh[0]]; b.classList.toggle('on', ctx.sel.abeh[bh[0]]); });
        box.appendChild(b); abehBtns.push(b);
      });
      edBody.appendChild(h); edBody.appendChild(box);
      return;
    }
    if (fd[0] === '@beh') {
      const h = document.createElement('div'); h.className = 'ed-sec'; h.textContent = 'Behavior';
      const box = document.createElement('div'); box.className = 'chips';
      BEHS.forEach(bh => {
        const b = document.createElement('button');
        b.textContent = bh[1]; b.dataset.k = bh[0];
        b.addEventListener('click', () => { if (!ctx.sel) return; ctx.sel.beh[bh[0]] = !ctx.sel.beh[bh[0]]; b.classList.toggle('on', ctx.sel.beh[bh[0]]); });
        box.appendChild(b); behBtns.push(b);
      });
      edBody.appendChild(h); edBody.appendChild(box);
      return;
    }
    if (fd.length === 1) {
      const h = document.createElement('div'); h.className = 'ed-sec'; h.textContent = fd[0];
      edBody.appendChild(h); return;
    }
    const key = fd[0];
    const row = document.createElement('label'); row.className = 'sl';
    row.innerHTML = '<span></span><input type="range"><output></output>';
    row.children[0].textContent = fd[1];
    const inp = row.children[1];
    inp.min = fd[2]; inp.max = fd[3]; inp.step = fd[4];
    inp.addEventListener('input', () => {
      if (!ctx.sel) return;
      applyField(ctx.sel, key, parseFloat(inp.value));
      showField(key); showField('size');
    });
    edBody.appendChild(row);
    refs[key] = { inp, out: row.children[2] };
  });
  SHAPES.forEach((sh, i) => {
    const b = document.createElement('button');
    b.textContent = sh.name; b.dataset.i = i;
    b.addEventListener('click', () => { if (ctx.sel) { setShape(ctx.sel, i); syncEditor(); } });
    edShapes.appendChild(b);
  });

  function fieldValue(o, key) { return key === 'size' ? o.sizeT : o[key]; }
  function showField(key) {
    const v = fieldValue(ctx.sel, key);
    refs[key].inp.value = v;
    refs[key].out.textContent = (key === 'level' || key === 'legs' || key === 'arms' || key === 'legSegs' || key === 'armSegs') ? String(v) : (key === 'wob' && v <= -0.99 ? 'Rigid' : Number(v).toFixed(2));
  }
  function syncEditor() {
    if (!ctx.sel) return;
    Object.keys(refs).forEach(showField);
    behBtns.forEach(b => b.classList.toggle('on', !!ctx.sel.beh[b.dataset.k]));
    abehBtns.forEach(b => b.classList.toggle('on', !!ctx.sel.abeh[b.dataset.k]));
    edShapes.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.i === ctx.sel.shape));
  }
  function applyField(o, key, v) {
    if (key === 'size') { v = Math.min(v, maxSizeFor(o)); o.size = o.sizeT = v; }
    else if (key === 'level') { o.level = Math.round(v); o.mesh.geometry = getFracGeo(o.shape, o.level); }
    else if (key === 'legSegs') { o.legSegs = Math.round(v); ctx.buildLegs(o); }
    else if (key === 'armSegs') { o.armSegs = Math.round(v); ctx.buildArms(o); }
    else if (key === 'arms') { const was = o.arms; ctx.setArms(o, Math.round(v)); if (!was && o.arms > 0) say('Arms on. Pick what they do below', 1800); }
    else if (key === 'legs') { const was = o.legs; ctx.setLegs(o, Math.round(v)); if (!was && o.legs > 0) say('Legs on. Pick how it moves below', 1800); }
    else o[key] = v;
    applySize(o);
    if (key === 'sx' || key === 'sy' || key === 'sz' || key === 'level' || key === 'legs' || key === 'legLen') fitRoom(o);
  }
  function fitRoom(o) {
    const m = maxSizeFor(o);
    if (o.sizeT > m) { o.size = o.sizeT = m; applySize(o); say('Shrunk to fit the room', 900); }
  }
  function setShape(o, idx) {
    const sh = SHAPES[idx];
    o.shape = idx; o.baseR = sh.r; o.baseFront = sh.front; o.shapePitch = sh.pitch;
    o.mesh.geometry = getFracGeo(idx, o.level);
    applySize(o);
    fitRoom(o);
    impact(o, tmpV.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), 7);
    o.moodT = 0.8;
  }
  function updatePinTarget() {
    if (!ctx.sel) return;
    const yc = (ctx.H - ed.offsetHeight) / 2;
    ctx.sel.pinTarget.set(0, (1 - 2 * yc / ctx.H) * TAN * CAM_Z, 0);
  }
  function openEditor(o) {
    if (ctx.sel && ctx.sel !== o) ctx.sel.pinned = false;
    ctx.sel = o; o.pinned = true; o.moodT = 1;
    hideHint();
    ctx.closeFluidPanel();
    ed.hidden = false;
    ctx.refreshSheet();
    syncEditor();
    updatePinTarget();
    impact(o, tmpV.set(0, 1, 0), 6);
    boing(340 * o.pitch, 0.08);
    if (navigator.vibrate) navigator.vibrate(20);
  }
  function closeEditor() {
    if (!ctx.sel) return;
    ctx.sel.pinned = false; ctx.sel = null;
    ed.hidden = true;
    ctx.refreshSheet();
  }
  window.addEventListener('resize', updatePinTarget);

  document.getElementById('ed-done').addEventListener('click', closeEditor);
  document.getElementById('ed-del').addEventListener('click', () => {
    const o = ctx.sel; if (!o) return;
    closeEditor();
    o.dying = true; o.dieT = 0; o.moodT = 1;
    ctx.addRing(o.pos, 0xffe14d, 1.8);
    boing(700, 0.1);
    if (navigator.vibrate) navigator.vibrate(15);
  });
  document.getElementById('ed-reset').addEventListener('click', () => {
    const o = ctx.sel; if (!o) return;
    o.sx = o.sy = o.sz = 1; o.wob = 0; o.bounce = 0.75; o.density = 1; o.friction = 0.3; o.gScale = 1;
    o.level = 0; o.mesh.geometry = getFracGeo(o.shape, 0);
    o.legLen = 0.35; o.clumsy = 0.3; o.stamina = 0.5; o.beh = ctx.defaultBeh(); ctx.setLegs(o, 0);
    o.armLen = 0.5; o.abeh = ctx.defaultAbeh(); o.legSegs = 2; o.armSegs = 2; o.jflex = 0.8; o.footScale = 1; o.handScale = 1; ctx.setArms(o, 0);
    applySize(o);
    impact(o, tmpV.set(0, 1, 0), 6);
    syncEditor();
    say('Reset', 800);
  });
  document.getElementById('ed-dup').addEventListener('click', () => {
    const o = ctx.sel; if (!o) return;
    if (objs.length >= MAX_OBJS) {
      const old = objs.find(x => !x.dragged && !x.dying && !x.pinned);
      if (!old) { say('Too many shapes', 1000); return; }
      removeObj(old);
    }
    const dir = o.pos.x > 0 ? -1 : 1;
    const n = addObj(o.shape, o.pos.x + dir * (o.r * 1.1 + 0.3), o.pos.y + 0.3);
    n.pos.z = 0;
    ['sx', 'sy', 'sz', 'level', 'wob', 'bounce', 'density', 'friction', 'gScale', 'legLen', 'clumsy', 'stamina', 'armLen', 'legSegs', 'armSegs', 'jflex', 'footScale', 'handScale'].forEach(k => { n[k] = o[k]; });
    n.beh = Object.assign({}, o.beh); n.abeh = Object.assign({}, o.abeh);
    n.size = n.sizeT = o.sizeT;
    n.mesh.geometry = getFracGeo(n.shape, n.level);
    n.mat.uniforms.uColA.value.copy(o.mat.uniforms.uColA.value);
    n.mat.uniforms.uColB.value.copy(o.mat.uniforms.uColB.value);
    n.mat.uniforms.uHue.value = o.mat.uniforms.uHue.value;
    ctx.setLegs(n, o.legs);
    ctx.setArms(n, o.arms);
    applySize(n);
    n.vel.set(dir * 2.5, 2, 0);
    n.moodT = 1;
    boing(380 * n.pitch, 0.08);
    say('Duplicated', 900);
  });
  const api = { fieldValue, showField, syncEditor, applyField, fitRoom, setShape, updatePinTarget, openEditor, closeEditor };
  Object.assign(ctx, api);
  return { selRing, ...api };
}
