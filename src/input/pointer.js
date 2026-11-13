import * as THREE from "three";

export function createPointer(ctx) {
  const { performance, navigator, setTimeout, clearTimeout } = ctx.env;
  const { canvas, camera, objs, tmpV } = ctx;

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  ctx.ray = ray;
  const sph = new THREE.Sphere(new THREE.Vector3(), 1);
  const tmpP = new THREE.Vector3();
  const pointers = new Map();
  ctx.pointers = pointers;
  const look = { x: 0, y: 0, last: -99 };
  ctx.look = look;

  function setRay(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1));
    ray.setFromCamera(ndc, camera);
    look.x = ndc.x; look.y = ndc.y; look.last = ctx.clockNow;
    if (ray.ray.intersectPlane(ctx.plane0, ctx.pointerW)) ctx.pointerT = ctx.clockNow;
  }
  const pickHit = new THREE.Vector3();
  ctx.pickHit = pickHit;
  function pickObj() {
    let best = null, bd = 1e9;
    for (const o of objs) {
      if (o.dragged || o.dying) continue;
      for (let k = 0; k < o.cn; k++) {
        sph.center.set(o.pos.x + o.wo[3 * k], o.pos.y + o.wo[3 * k + 1], o.pos.z + o.wo[3 * k + 2]);
        sph.radius = o.cRad[k] * 1.2 + 0.06;
        if (ray.ray.intersectSphere(sph, tmpP)) {
          const d = tmpP.distanceTo(ray.ray.origin);
          if (d < bd) { bd = d; best = o; pickHit.copy(tmpP); }
        }
      }
    }
    return best;
  }

  canvas.addEventListener('pointerdown', e => {
    const { aw } = ctx;
    e.preventDefault();
    ctx.ensureAudio(); ctx.hideHint();
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    setRay(e);
    const o = pickObj();
    if (aw.lockT > 0) { pointers.set(e.pointerId, { o: null, t0: performance.now(), x0: e.clientX, y0: e.clientY, moved: 999 }); return; }
    if (aw.state === 'wary' && ctx.awPillHit(e)) { pointers.set(e.pointerId, { o: null, t0: performance.now(), x0: e.clientX, y0: e.clientY, moved: 999 }); ctx.startBoss('pill'); return; }
    if (aw.state === 'capture') { pointers.set(e.pointerId, { o: null, t0: performance.now(), x0: e.clientX, y0: e.clientY, moved: 999 }); return; }
    if (o && aw.state === 'boss') { ctx.awSmash(o); pointers.set(e.pointerId, { o: null, t0: performance.now(), x0: e.clientX, y0: e.clientY, moved: 999 }); return; }
    if (o && aw.state === 'villain') { ctx.villainTap(o); pointers.set(e.pointerId, { o: null, t0: performance.now(), x0: e.clientX, y0: e.clientY, moved: 999 }); return; }
    if (o && (aw.state === 'notice' || aw.state === 'wary' || aw.state === 'boss' || aw.state === 'defeat')) {
      ctx.awSlip(o); pointers.set(e.pointerId, { o: null, t0: performance.now(), x0: e.clientX, y0: e.clientY, moved: 999 }); return;
    }
    const rec = { o: null, t0: performance.now(), x0: e.clientX, y0: e.clientY, moved: 0 };
    if (o) {
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -o.pos.z);
      const hit = new THREE.Vector3();
      if (ray.ray.intersectPlane(plane, hit)) {
        rec.o = o; rec.plane = plane;
        rec.off = o.pos.clone().sub(hit);
        rec.target = o.pos.clone();
        o.dragged = true; o.drag = rec; o.moodT = 0;
        tmpV.copy(pickHit).sub(o.pos);
        if (tmpV.lengthSq() < 1e-6) tmpV.set(0, 0, 1);
        o.pressWorld.copy(tmpV).normalize(); o.holdT = 0;
      }
    }
    if (rec.o) rec.timer = setTimeout(() => {
      if (pointers.get(e.pointerId) === rec && rec.o && rec.moved < 10) {
        const ob = rec.o;
        rec.o = null; rec.moved = 999;
        ob.dragged = false; ob.drag = null;
        ctx.openEditor(ob);
      }
    }, 480);
    pointers.set(e.pointerId, rec);
  });
  canvas.addEventListener('pointermove', e => {
    e.preventDefault();
    const rec = pointers.get(e.pointerId);
    setRay(e);
    if (!rec) return;
    rec.moved = Math.max(rec.moved, Math.hypot(e.clientX - rec.x0, e.clientY - rec.y0));
    if (rec.o) {
      const hit = new THREE.Vector3();
      if (ray.ray.intersectPlane(rec.plane, hit)) rec.target.copy(hit).add(rec.off);
    } else if (ctx.aw.state === 'villain' && rec.moved > 6) ctx.rattleMove(e, rec);
    else if (ctx.fluid.n > 0 && rec.moved > 5) ctx.stirFluid(rec);
  });
  function release(e, cancelled) {
    const rec = pointers.get(e.pointerId);
    if (!rec) return;
    pointers.delete(e.pointerId);
    clearTimeout(rec.timer);
    const quick = !cancelled && (performance.now() - rec.t0) < 260 && rec.moved < 12;
    const o = rec.o;
    if (o) {
      o.dragged = false; o.drag = null;
      if (quick && ctx.tool !== 'play') {
        ctx.applyTool(o);
      } else if (quick) {
        tmpV.copy(rec.off); tmpV.z = 0;
        if (tmpV.length() < 0.04) tmpV.set((Math.random() - 0.5) * 0.4, 1, 0);
        tmpV.normalize();
        o.vel.copy(tmpV).multiplyScalar(5.5 / Math.sqrt(o.density));
        o.vel.y += 3.5; o.vel.z += (Math.random() - 0.5) * 2;
        o.ang.x += (Math.random() - 0.5) * 9; o.ang.y += (Math.random() - 0.5) * 9; o.ang.z += (Math.random() - 0.5) * 9;
        ctx.impact(o, tmpV, 9);
        o.rip = 0.12; o.moodT = 1.2;
        ctx.boing(300 * o.pitch, 0.1);
        if (navigator.vibrate) navigator.vibrate(12);
      } else {
        o.vel.multiplyScalar(1.15);
        const sp = o.vel.length();
        if (sp > 35) o.vel.multiplyScalar(35 / sp);
        o.ang.x += -o.vel.y * 0.12; o.ang.y += o.vel.x * 0.12;
        o.ang.z += (Math.random() - 0.5) * sp * 0.15;
        if (sp > 6) ctx.boing(200 * o.pitch, 0.05);
      }
    } else if (quick && ctx.tool === 'play') {
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const hit = new THREE.Vector3();
      if (ray.ray.intersectPlane(plane, hit)) { ctx.blast(hit); if (ctx.aw.state === 'wary') ctx.awAggress(0.06); }
    }
  }
  canvas.addEventListener('pointerup', e => { e.preventDefault(); release(e, false); });
  canvas.addEventListener('pointercancel', e => release(e, true));
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  const api = { ray, pointers, look, setRay, pickObj, release };
  Object.assign(ctx, { setRay, pickObj, release });
  return api;
}
