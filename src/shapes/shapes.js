import * as THREE from "three";

export function makeGear(low) {
  const N = 12, seg = low ? 48 : 144, hs = low ? 1 : 6, T = 0.28;
  const g = new THREE.CylinderGeometry(0.5, 0.5, T, seg, hs);
  g.rotateX(Math.PI / 2);                       // axis along z, so the gear faces the camera like the torus
  const prof = a => 0.4 + 0.1 * Math.min(1, Math.max(0, (Math.sin(N * a) + 0.15) * 3));
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), r0 = Math.hypot(x, y);
    if (r0 < 1e-6) continue;
    const a = Math.atan2(y, x), r = prof(a) * (r0 / 0.5);
    p.setX(i, Math.cos(a) * r); p.setY(i, Math.sin(a) * r);
    if (Math.abs(n.getZ(i)) < 0.5) {           // the toothed rim: normal follows the tooth profile
      const d = 0.002, ra = prof(a - d), rb = prof(a + d);
      const tx = Math.cos(a + d) * rb - Math.cos(a - d) * ra, ty = Math.sin(a + d) * rb - Math.sin(a - d) * ra;
      const l = Math.hypot(tx, ty) || 1;
      n.setX(i, ty / l); n.setY(i, -tx / l); n.setZ(i, 0);
    }
  }
  return g;
}
export function roundedBox(seg) {
  const sg = seg || 12;
  const g = new THREE.BoxGeometry(1, 1, 1, sg, sg, sg);
  const p = g.attributes.position, n = g.attributes.normal;
  const v = new THREE.Vector3(), s = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    s.copy(v).normalize().multiplyScalar(0.62);
    v.lerp(s, 0.5);
    p.setXYZ(i, v.x, v.y, v.z);
    nn.fromBufferAttribute(n, i).lerp(s.copy(v).normalize(), 0.6).normalize();
    n.setXYZ(i, nn.x, nn.y, nn.z);
  }
  return g;
}
export const SHAPES = [
  { name: 'Sphere',   geo: () => new THREE.SphereGeometry(0.5, 40, 28), low: () => new THREE.SphereGeometry(0.5, 14, 10), e: 0.5,  r: 0.5,  front: 0.54, pitch: 1.0 },
  { name: 'Cube',     geo: () => roundedBox(12), low: () => roundedBox(5), e: 0.55, r: 0.6,  front: 0.76, pitch: 0.84 },
  { name: 'Torus',    geo: () => new THREE.TorusGeometry(0.36, 0.15, 24, 48), low: () => new THREE.TorusGeometry(0.36, 0.15, 10, 20), e: 0.5, r: 0.52, front: 0.56, pitch: 1.26 },
  { name: 'Knot',     geo: () => new THREE.TorusKnotGeometry(0.28, 0.1, 110, 14, 2, 3), low: () => new THREE.TorusKnotGeometry(0.28, 0.1, 40, 6, 2, 3), e: 0.5, r: 0.5, front: 0.6, pitch: 1.12 },
  { name: 'Cone',     geo: () => new THREE.ConeGeometry(0.5, 1, 40, 14), low: () => new THREE.ConeGeometry(0.5, 1, 20, 5), e: 0.5, r: 0.55, front: 0.58, pitch: 0.7 },
  { name: 'Cylinder', geo: () => new THREE.CylinderGeometry(0.42, 0.42, 1, 32, 14), low: () => new THREE.CylinderGeometry(0.42, 0.42, 1, 20, 5), e: 0.5, r: 0.56, front: 0.56, pitch: 0.78 },
  { name: 'Pyramid',  geo: () => new THREE.ConeGeometry(0.62, 1, 4, 12), low: () => new THREE.ConeGeometry(0.62, 1, 4, 5), e: 0.5, r: 0.58, front: 0.62, pitch: 0.9 },
  { name: 'Gear',     geo: () => makeGear(false), low: () => makeGear(true), e: 0.5, r: 0.5, front: 0.17, pitch: 0.95 }
];
export const GEAR = 7, AUTO_SHAPES = 7; // gifts and prizes never hand out gears
export const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
// collider: [type, halfX, halfY, halfZ] in unscaled shape units (torus: ring radius, ring radius, tube radius)
export const COL = [['ell', .5, .5, .5], ['box', .56, .56, .56], ['ring', .36, .36, .15], ['ell', .45, .45, .45],
             ['ell', .46, .5, .46], ['cyl', .42, .5, .42], ['ell', .5, .5, .5], ['cylz', .46, .46, .14]];

export function createShapes(ctx) {
  const geoCache = [], lowCache = [], fracCache = {};
  const getGeo = i => geoCache[i] || (geoCache[i] = SHAPES[i].geo());
  const getLow = i => lowCache[i] || (lowCache[i] = SHAPES[i].low());

  // Complexity: the shape sprouts smaller copies of itself on six sides, recursively.
  function getFracGeo(i, lv) {
    if (!lv) return getGeo(i);
    const key = i + ':' + lv;
    if (fracCache[key]) return fracCache[key];
    const sh = SHAPES[i], root = getGeo(i), low = getLow(i);
    const pos = [], nor = [], idx = [];
    let base = 0;
    const v = new THREE.Vector3();
    function emit(g, cx, cy, cz, sc) {
      const p = g.attributes.position, n = g.attributes.normal, ix = g.index;
      for (let k = 0; k < p.count; k++) {
        v.fromBufferAttribute(p, k);
        pos.push(v.x * sc + cx, v.y * sc + cy, v.z * sc + cz);
        nor.push(n.getX(k), n.getY(k), n.getZ(k));
      }
      if (ix) { for (let k = 0; k < ix.count; k++) idx.push(ix.getX(k) + base); }
      else { for (let k = 0; k < p.count; k++) idx.push(base + k); }
      base += p.count;
    }
    emit(root, 0, 0, 0, 1);
    (function grow(cx, cy, cz, sc, from, depth) {
      if (depth > lv) return;
      const cs = sc * 0.5;
      for (let d = 0; d < 6; d++) {
        if (from >= 0 && d === (from ^ 1)) continue;
        const dist = sc * sh.e + cs * sh.e * 0.8;
        const x = cx + DIRS[d][0] * dist, y = cy + DIRS[d][1] * dist, z = cz + DIRS[d][2] * dist;
        emit(low, x, y, z, cs);
        grow(x, y, z, cs, d, depth + 1);
      }
    })(0, 0, 0, 1, -1, 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
    return (fracCache[key] = g);
  }
  const api = { getGeo, getLow, getFracGeo };
  Object.assign(ctx, api);
  return api;
}
