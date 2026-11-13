import * as THREE from "three";
import { BLOB_VS, BLOB_FS, FLUID_VS, FLUID_FS } from "../gfx/shaders.js";
import { CAM_Z, TAN } from "../gfx/background.js";
import { createFluid } from "./solver.js";

export const N_FL = 1000;

export function createFluidRender(ctx) {
  const { window } = ctx.env;
  const { renderer, scene, camera, timeU } = ctx;

  const fluid = createFluid(N_FL);
  ctx.fluid = fluid;
  const FL = { amount: 0, visc: 0.05, dens: 1, hue: 205, opacity: 0.78, glow: 0 };
  ctx.FL = FL;

  const blobPos = new Float32Array(N_FL * 3), blobSpd = new Float32Array(N_FL);
  ctx.blobPos = blobPos; ctx.blobSpd = blobSpd;
  const blobGeo = new THREE.BufferGeometry();
  ctx.blobGeo = blobGeo;
  blobGeo.setAttribute('position', new THREE.BufferAttribute(blobPos, 3));
  blobGeo.setAttribute('aSpeed', new THREE.BufferAttribute(blobSpd, 1));
  blobGeo.setDrawRange(0, 0);
  const blobMat = new THREE.ShaderMaterial({
    uniforms: { uSize: { value: 30 }, uAmp: { value: 0.27 } },
    vertexShader: BLOB_VS,
    fragmentShader: BLOB_FS,
    blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false
  });
  const blobPts = new THREE.Points(blobGeo, blobMat);
  blobPts.frustumCulled = false;
  const blobScene = new THREE.Scene();
  blobScene.add(blobPts);
  const fieldRT = new THREE.WebGLRenderTarget(256, 256, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false
  });

  const fluidMat = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: {
      uField: { value: fieldRT.texture }, uTexel: { value: new THREE.Vector2(0.004, 0.004) }, uTime: timeU,
      uDeep: { value: new THREE.Color() }, uLight: { value: new THREE.Color() },
      uOpacity: { value: 0.8 }, uGlow: { value: 0 }, uBox: { value: new THREE.Vector4(0, 0, 1, 1) },
      uThr: { value: 0.24 }, uBump: { value: 3.0 }
    },
    vertexShader: FLUID_VS,
    fragmentShader: FLUID_FS
  });
  const fluidQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fluidMat);
  ctx.fluidQuad = fluidQuad;
  fluidQuad.frustumCulled = false; fluidQuad.renderOrder = 3; fluidQuad.visible = false;
  scene.add(fluidQuad);

  function applyFluidLook() {
    fluidMat.uniforms.uDeep.value.setHSL(FL.hue / 360, 0.8, 0.27);
    fluidMat.uniforms.uLight.value.setHSL(FL.hue / 360, 0.85, 0.62);
    fluidMat.uniforms.uOpacity.value = FL.opacity;
    fluidMat.uniforms.uGlow.value = FL.glow;
  }
  function fluidInit() {
    const k0 = CAM_Z / (CAM_Z - ctx.hz);
    fluid.configure(ctx.hx * k0, ctx.yMin * k0, ctx.yMax * k0, N_FL);
    const gl = renderer.getContext();
    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    const maxPt = (range && range[1]) ? range[1] : 64;
    const diamWorld = 2 * 1.7 * fluid.s;
    let rtH = 640;
    const sizePx = diamWorld * rtH / (2 * TAN * CAM_Z) + 2;
    if (sizePx > maxPt * 0.95) rtH = rtH * maxPt * 0.95 / sizePx;
    rtH = Math.max(160, Math.round(rtH));
    const rtW = Math.round(rtH * camera.aspect);
    fieldRT.setSize(rtW, rtH);
    blobMat.uniforms.uSize.value = diamWorld * rtH / (2 * TAN * CAM_Z) + 2;
    fluidMat.uniforms.uTexel.value.set(1 / rtW, 1 / rtH);
    camera.updateMatrixWorld();
    const bnd = fluid.bounds, a = new THREE.Vector3(-bnd[0], bnd[1], 0).project(camera), b = new THREE.Vector3(bnd[0], bnd[2], 0).project(camera);
    fluidMat.uniforms.uBox.value.set((a.x + 1) / 2, (a.y + 1) / 2, (b.x + 1) / 2, (b.y + 1) / 2);
    applyFluidLook();
  }
  window.addEventListener('resize', fluidInit);
  window.addEventListener('load', fluidInit);
  fluidInit();
  function renderFluidField() {
    if (fluid.n === 0) return;
    renderer.setRenderTarget(fieldRT);
    renderer.render(blobScene, camera);
    renderer.setRenderTarget(null);
  }

  const api = { fluid, FL, applyFluidLook, fluidInit, renderFluidField };
  Object.assign(ctx, { applyFluidLook, fluidInit, renderFluidField });
  return api;
}
