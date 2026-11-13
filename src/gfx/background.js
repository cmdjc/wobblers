import * as THREE from "three";
import { BG_VS, BG_FS } from "./shaders.js";

export const CAM_Z = 10;
export const TAN = Math.tan(THREE.MathUtils.degToRad(25));
const MOTES = 140;

export function createBackground(ctx) {
  const { window, document } = ctx.env;
  const { scene, camera, renderer } = ctx;

  /* ---------- background: slow contour swirl ---------- */
  const bg = new THREE.Mesh(
    new THREE.SphereGeometry(80, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { uTime: ctx.timeU },
      vertexShader: BG_VS,
      fragmentShader: BG_FS
    })
  );
  scene.add(bg);

  /* ---------- room edges ---------- */
  const box = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color: 0xffd1f0, transparent: true, opacity: 0.35 })
  );
  scene.add(box);

  /* ---------- drifting motes ---------- */
  const moteArr = new Float32Array(MOTES * 3);
  for (let i = 0; i < MOTES; i++) {
    moteArr[i*3] = (Math.random()-0.5)*8; moteArr[i*3+1] = (Math.random()-0.5)*16; moteArr[i*3+2] = (Math.random()-0.5)*4 - 1;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(moteArr, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ color: 0xffe1a8, size: 0.06, transparent: true, opacity: 0.7, depthWrite: false }));
  scene.add(motes);

  function updateMotes(dt) {
    for (let i = 0; i < MOTES; i++) {
      moteArr[i * 3 + 1] += dt * 0.25;
      moteArr[i * 3] += Math.sin(ctx.time * 0.4 + i) * dt * 0.05;
      if (moteArr[i * 3 + 1] > 8) moteArr[i * 3 + 1] = -8;
    }
    moteGeo.attributes.position.needsUpdate = true;
  }

  /* ---------- room bounds from camera ---------- */
  function resize() {
    ctx.W = window.innerWidth; ctx.H = window.innerHeight;
    renderer.setSize(ctx.W, ctx.H, false);
    camera.aspect = ctx.W / ctx.H; camera.updateProjectionMatrix();
    const d = CAM_Z - ctx.hz;
    ctx.hy = TAN * d * 0.98; ctx.hx = TAN * d * (ctx.W / ctx.H) * 0.98;
    const wpp = 2 * ctx.hy / ctx.H;
    const barH = document.getElementById('bar').offsetHeight || 120;
    ctx.yMax = ctx.hy; ctx.yMin = -ctx.hy + (barH + 6) * wpp;
    box.scale.set(ctx.hx * 2, ctx.yMax - ctx.yMin, ctx.hz * 2);
    box.position.set(0, (ctx.yMax + ctx.yMin) / 2, 0);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('load', resize);
  resize();

  const api = { resize, updateMotes };
  Object.assign(ctx, { resize });
  return api;
}
