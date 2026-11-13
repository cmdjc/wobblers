import * as THREE from "three";
import { createContext } from "../../../src/context.js";
import { createShapes } from "../../../src/shapes/shapes.js";
import { createColliders } from "../../../src/shapes/colliders.js";
import { createEyes } from "../../../src/world/eyes.js";
import { createObjects } from "../../../src/world/objects.js";
import { makeContext } from "../../helpers/stubCanvas.js";

export function stubDocument() {
  return {
    createElement: () => {
      const canvas = { width: 300, height: 150, getContext: () => canvas.__ctx };
      canvas.__ctx = makeContext(canvas);
      return canvas;
    },
  };
}

export function makeWorld() {
  const ctx = createContext();
  ctx.env = { document: stubDocument() };
  ctx.scene = new THREE.Scene();
  ctx.timeU = { value: 0 };
  ctx.tmpG = new THREE.Vector3();
  ctx.tmpV = new THREE.Vector3();
  ctx.tmpV2 = new THREE.Vector3();
  ctx.qInv = new THREE.Quaternion();
  ctx.boing = () => {};
  ctx.blocks = [];
  ctx.reb = { genius: null };
  ctx.footR = () => 0.1;
  ctx.hipXZ = (o, i) => [i * 0.2, 0];
  ctx.defaultBeh = () => ({});
  ctx.defaultAbeh = () => ({});
  for (const name of ["closeEditor", "clearLegs", "clearArms", "dropCarry", "clearOutfit", "releaseCarry"]) ctx[name] = () => {};
  createShapes(ctx);
  createColliders(ctx);
  createEyes(ctx);
  const { objs } = createObjects(ctx);
  return { ctx, objs };
}
