// Look PS1: baja resolucion (nearest upscale via CSS) + vertex snapping + flat shading.
import * as THREE from "three";

// Grilla de "jitter" de vertices (mas chico = mas tembleque PS1).
const SNAP_X = 240.0;
const SNAP_Y = 180.0;

// Parchea un material para cuantizar la posicion en clip-space (wobble PS1).
export function ps1Patch(material) {
  material.flatShading = true;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `#include <project_vertex>
       {
         float gw = gl_Position.w;
         vec2 grid = vec2(${SNAP_X.toFixed(1)}, ${SNAP_Y.toFixed(1)});
         vec2 sn = gl_Position.xy / gw;
         sn = floor(sn * grid * 0.5) / (grid * 0.5);
         gl_Position.xy = sn * gw;
       }`
    );
  };
  return material;
}

// Material Lambert PS1 (barato, Gouraud, facetado).
export function mat(color, opts = {}) {
  return ps1Patch(new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }));
}

// Material emisivo (para la ranura, pantallas, marcadores).
export function emat(color, intensity = 1) {
  return new THREE.MeshBasicMaterial({ color });
}

// Ajusta el buffer interno a baja resolucion; el CSS lo estira con nearest.
export function sizeLowRes(renderer, camera, targetHeight = 300) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const scale = Math.min(1, targetHeight / h);
  const lw = Math.max(64, Math.round(w * scale));
  const lh = Math.max(48, Math.round(h * scale));
  renderer.setPixelRatio(1);
  renderer.setSize(lw, lh, false); // false = NO tocar el CSS del canvas
  const cv = renderer.domElement;
  cv.style.width = "100vw";
  cv.style.height = "100vh";
  if (camera) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}
