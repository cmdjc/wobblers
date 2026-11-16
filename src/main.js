import "./ui/style.css";
import "./ui/credits.css";
import * as THREE from "three";
import { createGame } from "./game.js";
import { createCredits } from "./ui/credits.js";

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true });
const env = {
  window,
  document,
  performance,
  navigator,
  setTimeout: window.setTimeout.bind(window),
  clearTimeout: window.clearTimeout.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
};
const game = createGame({ renderer, env });
createCredits(document);

if (new URLSearchParams(window.location.search).has("debug")) window.__wob = game.debug;
