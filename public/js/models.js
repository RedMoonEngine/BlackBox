// Modelos procedurales low-poly (hechos con geometria basica de Three).
import * as THREE from "three";
import { mat, emat } from "./ps1.js";

// ---- sala oscura ---------------------------------------------------------
export function makeRoom() {
  const g = new THREE.Group();
  const wall = mat(0x0a0a0d);
  const room = new THREE.Mesh(new THREE.BoxGeometry(18, 9, 18), wall);
  room.material.side = THREE.BackSide;
  room.position.y = 3.5;
  g.add(room);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), mat(0x070708));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.99;
  g.add(floor);

  // pilares apenas visibles en las esquinas
  const pil = mat(0x101014);
  for (const [x, z] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 9, 0.5), pil);
    p.position.set(x, 3.5, z);
    g.add(p);
  }
  return g;
}

// ---- mesa redonda --------------------------------------------------------
export function makeTable() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 2.55, 0.18, 18), mat(0x2a1e14));
  top.position.y = 0;
  g.add(top);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.08, 6, 22), mat(0x3a2c1e));
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  const leg = mat(0x14100b);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 1.9, 8), leg);
  base.position.y = -1.0;
  g.add(base);
  return g;
}

// ---- caja negra central --------------------------------------------------
// Devuelve {group, slot, lid} para animar.
export function makeBlackBox() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.05, 1.05), mat(0x0d0d12));
  body.position.y = 0.64;
  g.add(body);

  // aristas para que lea como cubo en la oscuridad
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(body.geometry),
    new THREE.LineBasicMaterial({ color: 0x44454f })
  );
  edges.position.copy(body.position);
  g.add(edges);

  // ranura emisiva en la cara frontal
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.05), emat(0xd94b3a));
  slot.position.set(0, 0.7, 0.54);
  g.add(slot);

  // "ojo" tenue arriba
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), emat(0x6ab0d1));
  eye.position.set(0, 1.28, 0.28);
  g.add(eye);
  g.userData.eye = eye;

  return { group: g, slot, body };
}

// ---- silla ---------------------------------------------------------------
export function makeChair() {
  const g = new THREE.Group();
  const m = mat(0x0d0d10);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), m);
  seat.position.y = -0.15;
  g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.08), m);
  back.position.set(0, 0.2, -0.28);
  g.add(back);
  return g;
}

// ---- figura sombria (silueta sentada) ------------------------------------
// Casi negra: las caras casi no se ven, solo sombras.
export function makeFigure(seatColor = 0x151517) {
  const g = new THREE.Group();
  const skin = mat(0x0b0b0d);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 0.9, 7), skin);
  torso.position.y = 0.55;
  g.add(torso);
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.28, 0.4), skin);
  shoulders.position.y = 0.95;
  g.add(shoulders);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 0), mat(0x0e0e11));
  head.position.y = 1.28;
  g.add(head);
  // rim muy tenue del color del asiento (para distinguir)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 5, 10), emat(seatColor));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1.02;
  g.add(rim);
  g.userData.rim = rim;
  return g;
}

// ---- TV CRT (para VHS / ambiente) ----------------------------------------
export function makeTV() {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, 0.9), mat(0x1a1712));
  g.add(shell);
  const cvs = document.createElement("canvas");
  cvs.width = 64; cvs.height = 48;
  const tex = new THREE.CanvasTexture(cvs);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.72),
    new THREE.MeshBasicMaterial({ map: tex }));
  screen.position.z = 0.46;
  g.add(screen);
  g.userData.canvas = cvs;
  g.userData.tex = tex;
  return g;
}

// pinta estatica en la TV
export function paintStatic(cvs, tex, bright = 1) {
  const ctx = cvs.getContext("2d");
  const img = ctx.createImageData(cvs.width, cvs.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (Math.random() * 90 * bright) | 0;
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  tex.needsUpdate = true;
}

// placa flotante con nombre/estado del jugador (CanvasTexture, se puede repintar)
export function makePlacard() {
  const cvs = document.createElement("canvas");
  cvs.width = 256; cvs.height = 64;
  const tex = new THREE.CanvasTexture(cvs);
  tex.magFilter = THREE.NearestFilter;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.225),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  mesh.userData = { cvs, tex };
  return mesh;
}

export function paintPlacard(mesh, { name, hp, coins, holder, dead, connected }) {
  const { cvs, tex } = mesh.userData;
  const ctx = cvs.getContext("2d");
  ctx.clearRect(0, 0, cvs.width, cvs.height);
  ctx.fillStyle = holder ? "rgba(40,30,8,.92)" : "rgba(8,8,10,.82)";
  ctx.fillRect(0, 0, cvs.width, cvs.height);
  ctx.strokeStyle = holder ? "#e8b04b" : (dead ? "#552222" : "#2a2a2e");
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, cvs.width - 4, cvs.height - 4);
  ctx.font = "bold 26px 'Courier New',monospace";
  ctx.textBaseline = "middle";
  ctx.fillStyle = dead ? "#6a4a4a" : (connected ? "#e8e2d6" : "#7c776c");
  ctx.fillText((dead ? "☠ " : "") + name, 12, 24);
  ctx.font = "20px 'Courier New',monospace";
  ctx.fillStyle = "#d94b3a";
  ctx.fillText("❤".repeat(Math.max(0, hp)) || "—", 12, 48);
  ctx.fillStyle = "#e8b04b";
  ctx.textAlign = "right";
  ctx.fillText("🪙" + coins, cvs.width - 12, 48);
  ctx.textAlign = "left";
  tex.needsUpdate = true;
}
