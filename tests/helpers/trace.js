import { FNV_OFFSET, fnvHex, fnvUpdate, stable } from "./fnv.js";

const isTyped = (v) => v && typeof v === "object";
const isPrimitive = (v) => v === null || v === undefined || ["number", "string", "boolean"].includes(typeof v);
const isNumberArray = (v) => Array.isArray(v) && v.every((x) => typeof x === "number");
const isPlainObject = (v) => isTyped(v) && Object.getPrototypeOf(v) === Object.prototype;

const vectorLike = (v) => isTyped(v) && (v.isVector2 || v.isVector3 || v.isVector4 || v.isQuaternion || v.isEuler || v.isColor);

function plainFields(obj, depth) {
  const out = {};
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (typeof value === "function") continue;
    if (isPrimitive(value)) out[key] = value === undefined ? "undefined" : value;
    else if (vectorLike(value)) out[key] = value.toArray();
    else if (isNumberArray(value)) out[key] = value.slice();
    else if (depth > 0 && isPlainObject(value)) out[key] = plainFields(value, depth - 1);
  }
  return out;
}

function encodeUniform(value) {
  if (isPrimitive(value)) return value === undefined ? "undefined" : value;
  if (value.isTexture) return "texture";
  if (vectorLike(value)) return value.toArray();
  if (value.isMatrix3 || value.isMatrix4) return value.elements.slice();
  if (ArrayBuffer.isView(value)) return Array.from(value);
  if (Array.isArray(value)) return value.map(encodeUniform);
  return "[object]";
}

export const hash = (value) => fnvHex(fnvUpdate(FNV_OFFSET, stable(value)));

export function diff(a, b, path = "") {
  if (Object.is(a, b)) return null;
  const bothContainers = isTyped(a) && isTyped(b) && Array.isArray(a) === Array.isArray(b);
  if (!bothContainers) return { path, a, b };
  const keys = Array.isArray(a)
    ? Array.from({ length: Math.max(a.length, b.length) }, (_, i) => i)
    : [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const key of keys) {
    const childPath = Array.isArray(a) ? `${path}[${key}]` : `${path}${path ? "." : ""}${key}`;
    if (!(key in a) || !(key in b)) return { path: childPath, a: a[key], b: b[key] };
    const found = diff(a[key], b[key], childPath);
    if (found) return found;
  }
  return null;
}

function describeMaterial(material, path, canvasLogs) {
  const out = { type: material.type, opacity: material.opacity, transparent: material.transparent, visible: material.visible };
  for (const key of ["blending", "depthTest", "depthWrite", "side", "rotation"]) if (key in material) out[key] = material[key];
  if (material.color) out.color = material.color.getHex();
  const noteTexture = (role, texture) => {
    const image = texture.image;
    if (image && image.__hash !== undefined) canvasLogs[`${path}:${role}`] = [image.__hash, image.__calls];
    else if (image && image.getContext) canvasLogs[`${path}:${role}`] = [FNV_OFFSET, 0];
  };
  if (material.map && material.map.isTexture) { out.map = "map"; noteTexture("map", material.map); }
  if (material.uniforms) {
    out.uniforms = {};
    for (const name of Object.keys(material.uniforms).sort()) {
      const value = material.uniforms[name].value;
      out.uniforms[name] = encodeUniform(value);
      if (value && value.isTexture) noteTexture(name, value);
    }
  }
  if (material.vertexShader !== undefined) out.shader = hash(material.vertexShader + material.fragmentShader);
  return out;
}

function describeNode(node, path, canvasLogs) {
  const out = {
    type: node.type,
    visible: node.visible,
    position: node.position.toArray(),
    quaternion: node.quaternion.toArray(),
    scale: node.scale.toArray(),
    renderOrder: node.renderOrder,
  };
  if (node.material) {
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    out.materials = materials.map((m, i) => describeMaterial(m, `${path}.m${i}`, canvasLogs));
  }
  if (node.geometry) {
    out.geometry = { type: node.geometry.type, count: node.geometry.attributes.position?.count ?? null, drawRange: [node.geometry.drawRange.start, node.geometry.drawRange.count] };
  }
  out.children = node.children.map((child, i) => describeNode(child, `${path}/${i}`, canvasLogs));
  return out;
}

function describeDom(document) {
  const out = {};
  for (const el of document.querySelectorAll("[id]")) {
    const entry = { hidden: el.hidden, className: el.className, cssText: el.style.cssText };
    if (el.tagName === "BUTTON" || el.id === "say") entry.text = el.textContent;
    out[el.id] = entry;
  }
  return out;
}

const REMOVED_DEAD_FIELDS = { ey: ["fold", "featherMat", "wings"] };

const without = (fields, removed = []) => Object.fromEntries(Object.entries(fields).filter(([key]) => !removed.includes(key)));

export function snapshot(debug, harness) {
  const { fluid } = debug;
  const canvasLogs = {};
  const renderer = harness.renderer;
  const calls = renderer.calls.slice(harness.traceCursor).map((c) => [c.name, ...c.args.filter((a) => typeof a === "number")]);
  harness.traceCursor = renderer.calls.length;
  return {
    shapes: debug.objs.map((o) => plainFields(o, 1)),
    ey: without(plainFields(debug.ey, 1), REMOVED_DEAD_FIELDS.ey),
    reb: plainFields(debug.reb, 1),
    aw: plainFields(debug.aw, 1),
    FL: plainFields(debug.FL, 1),
    fluid: { n: fluid.n, px: Array.from(fluid.px.subarray(0, fluid.n)), py: Array.from(fluid.py.subarray(0, fluid.n)) },
    camera: { position: debug.camera.position.toArray(), quaternion: debug.camera.quaternion.toArray(), aspect: debug.camera.aspect, fov: debug.camera.fov },
    scene: describeNode(debug.scene, "s", canvasLogs),
    dom: describeDom(harness.document),
    canvasLogs,
    renderer: calls,
    helpers: Object.fromEntries(["gMode", "tool", "time", "clockNow", "nextShape", "uid", "W", "H", "hx", "hy", "hz", "yMin", "yMax"].map((k) => [k, debug[k]])),
  };
}
