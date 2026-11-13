import * as THREE from "three";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pv = new THREE.Vector3();

export function createVisuals(ctx) {
  const { objs, camera, look, aw, selRing } = ctx;
  const { removeObj, applySize, updateLegs, updateArms, updateOutfit, divineStatus, drawEyes } = ctx;

  function updateVisuals(dt, time) {
    for (const o of objs.slice()) {
      o.mesh.position.copy(o.pos);
      let sc = 1;
      if (o.dying) {
        o.dieT += dt;
        const kd = Math.max(0, o.dieT) / 0.3;
        if (kd >= 1) { removeObj(o); continue; }
        sc = kd < 0.2 ? 1 + 0.3 * (kd / 0.2) : Math.max(0.001, 1.3 * (1 - (kd - 0.2) / 0.8));
      }
      if (Math.abs(o.sizeT - o.size) > 0.002) {
        o.size += (o.sizeT - o.size) * (1 - Math.exp(-12 * dt));
        applySize(o);
      }
      o.mesh.scale.set(o.size * o.sx * sc, o.size * o.sy * sc, o.size * o.sz * sc);
      const ek = 1 + 0.12 * o.level;
      o.eyes.s.scale.set(o.size * 0.9 * sc * ek, o.size * 0.45 * sc * ek, 1);
      updateLegs(o, dt, time, sc);
      if (o.arms > 0) updateArms(o, dt, time, sc);
      if (o.outfit) updateOutfit(o, time, sc);
      const u = o.mat.uniforms;
      u.uQ.value = o.q; u.uRip.value = o.rip * (o.wob < 0 ? 1 + o.wob : 1); u.uPress.value = o.p;
      divineStatus(o, dt);
      { const kk = 1 - Math.exp(-6 * dt);
        u.uStone.value += ((o.stoneT > 0 ? 1 : 0) - u.uStone.value) * kk;
        u.uSick.value += ((o.sickT > 0 ? 1 : 0) - u.uSick.value) * kk;
        u.uGold.value += ((o.goldT > 0 ? 1 : 0) - u.uGold.value) * kk;
        u.uGray.value += ((aw.state === 'villain' && o.caged ? aw.gray : 0) - u.uGray.value) * kk; }

      pv.copy(o.pos).project(camera);
      let tx, ty;
      if (time - look.last < 3) { tx = look.x; ty = look.y; }
      else { tx = Math.sin(time * 0.6 + o.id) * 0.6; ty = Math.cos(time * 0.45 + o.id * 1.7) * 0.6; }
      const dx = (tx - pv.x) * camera.aspect, dy = ty - pv.y;
      const len = Math.hypot(dx, dy) || 1;
      const m = Math.min(len * 2, 1);
      const mood = o.dragged ? 2 : (o.moodT > 0 ? 1 : ((aw.state === 'villain' && o.caged && aw.gray > 0.55) ? 3 : (o.stoneT > 0 ? 2 : (o.sickT > 0 ? 4 : (o.legs > 0 ? ((o.state === 'fall' || o.dizzyT > 0) ? 4 : ((o.state === 'rest' || o.energy < 0.3) ? 3 : 0)) : 0)))));
      const blink = ((time + o.id * 1.7) % (3.5 + (o.id % 3))) < 0.13;
      let eyeX = dx / len * m, eyeY = dy / len * m;
      if (aw.state === 'notice' || aw.state === 'villain' || (aw.state === 'wary' && !(ctx.clockNow - ctx.pointerT < 1.5))) { eyeX = 0; eyeY = 0; } // staring right at you
      if (mood === 4) { eyeX = Math.cos(time * 9 + o.id) * 0.8; eyeY = Math.sin(time * 9 + o.id) * 0.8; }
      drawEyes(o.eyes, eyeX, eyeY, mood, blink);
      o.eyes.s.position.set(o.pos.x, o.pos.y + o.size * 0.08, o.pos.z + o.front);
      o.eyes.s.material.rotation = clamp(-o.vel.x * 0.03, -0.5, 0.5);
    }
  }
  function updateSelectionRing(time) {
    if (ctx.sel && objs.indexOf(ctx.sel) >= 0) {
      selRing.visible = true;
      selRing.position.set(ctx.sel.pos.x, ctx.sel.pos.y, ctx.sel.pos.z + ctx.sel.front * 0.5);
      selRing.scale.setScalar(ctx.sel.r * (1.25 + 0.05 * Math.sin(time * 6)));
    } else selRing.visible = false;
  }

  const api = { updateVisuals, updateSelectionRing };
  Object.assign(ctx, api);
  return api;
}
