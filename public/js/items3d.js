// Mallas procedurales low-poly de los objetos v2 (+ genérico).
import * as THREE from "three";
import { mat, emat } from "./ps1.js";

function cyl(r1, r2, h, seg, color) {
  return new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat(color));
}
function box(w, h, d, color) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
}

function generic() {
  const g = new THREE.Group();
  const b = box(0.4, 0.4, 0.4, 0x14141a);
  g.add(b);
  const q = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.05), emat(0xd94b3a));
  q.position.y = 0.26;
  g.add(q);
  return g;
}

function bomba() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 0), mat(0x0c0c0e)));
  const fuse = cyl(0.02, 0.02, 0.18, 5, 0x3a2a1a);
  fuse.position.set(0.06, 0.26, 0); fuse.rotation.z = -0.4; g.add(fuse);
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), emat(0xe8b04b));
  spark.position.set(0.13, 0.35, 0); g.add(spark);
  return g;
}
function dinamita() {
  const g = new THREE.Group();
  for (const x of [-0.1, 0, 0.1]) {
    const s = cyl(0.06, 0.06, 0.42, 8, 0xb03a2a); s.position.x = x; g.add(s);
  }
  const band = box(0.34, 0.06, 0.14, 0x2a1a12); g.add(band);
  const fuse = cyl(0.015, 0.015, 0.16, 4, 0x555); fuse.position.set(0.1, 0.28, 0); g.add(fuse);
  return g;
}
function sospechosa() {
  const g = new THREE.Group();
  g.add(box(0.36, 0.3, 0.36, 0x5a4632));
  const q = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.06), emat(0xd94b3a));
  q.position.y = 0.17; g.add(q);
  const tape = box(0.05, 0.31, 0.37, 0x3a2c1e); g.add(tape);
  return g;
}
function maldicion() {
  const g = new THREE.Group();
  g.add(cyl(0.06, 0.08, 0.34, 8, 0x1a1418));
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 6), emat(0xb07bd1));
  flame.position.y = 0.24; g.add(flame);
  return g;
}
function whisky() {
  const g = new THREE.Group();
  const bottle = cyl(0.08, 0.1, 0.32, 8, 0x6a3a1a);
  bottle.material.transparent = true; bottle.material.opacity = 0.85; g.add(bottle);
  const neck = cyl(0.035, 0.05, 0.12, 6, 0x6a3a1a); neck.position.y = 0.2; g.add(neck);
  const label = box(0.12, 0.1, 0.001, 0xcabf9a); label.position.set(0, 0, 0.1); g.add(label);
  return g;
}
function llave() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.03, 6, 12), mat(0xc9a24b));
  ring.position.x = -0.12; g.add(ring);
  const shaft = cyl(0.03, 0.03, 0.34, 6, 0xc9a24b);
  shaft.rotation.z = Math.PI / 2; shaft.position.x = 0.08; g.add(shaft);
  const tooth = box(0.05, 0.09, 0.04, 0xc9a24b); tooth.position.set(0.22, -0.05, 0); g.add(tooth);
  return g;
}
function dado() {
  const g = new THREE.Group();
  g.add(box(0.28, 0.28, 0.28, 0xe8e2d6));
  for (const [x, y, z] of [[0, 0, 0.145], [0.145, 0.08, 0], [-0.08, 0.145, 0.05]]) {
    const pip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), mat(0x111));
    pip.position.set(x, y, z); g.add(pip);
  }
  return g;
}
function jeringa() {
  const g = new THREE.Group();
  const barrel = cyl(0.05, 0.05, 0.34, 8, 0xaaccbb);
  barrel.rotation.z = Math.PI / 2; barrel.material.transparent = true; barrel.material.opacity = 0.7; g.add(barrel);
  const liquid = cyl(0.035, 0.035, 0.16, 8, 0x7bd16a);
  liquid.rotation.z = Math.PI / 2; liquid.position.x = -0.05; g.add(liquid);
  const needle = cyl(0.008, 0.008, 0.12, 4, 0xcccccc);
  needle.rotation.z = Math.PI / 2; needle.position.x = 0.23; g.add(needle);
  return g;
}
function telefono() {
  const g = new THREE.Group();
  g.add(box(0.34, 0.1, 0.26, 0x101014));
  const handset = box(0.32, 0.07, 0.08, 0x1c1c22); handset.position.y = 0.11; g.add(handset);
  for (const x of [-0.15, 0.15]) {
    const ear = cyl(0.05, 0.05, 0.05, 8, 0x1c1c22); ear.position.set(x, 0.13, 0); g.add(ear);
  }
  const dial = cyl(0.09, 0.09, 0.015, 12, 0xd94b3a);
  dial.rotation.x = Math.PI / 2; dial.position.set(0, 0.06, 0.09); g.add(dial);
  return g;
}
function bolsa() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mat(0x6a5238));
  body.scale.y = 0.9; g.add(body);
  const tie = cyl(0.07, 0.1, 0.08, 6, 0x4a3826); tie.position.y = 0.18; g.add(tie);
  const dollar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.001), emat(0xe8b04b));
  dollar.position.set(0, 0, 0.19); g.add(dollar);
  return g;
}
function linterna() {
  const g = new THREE.Group();
  g.add(cyl(0.06, 0.06, 0.28, 8, 0x1c1c22));
  const head = cyl(0.11, 0.06, 0.1, 8, 0x2a2a30); head.position.y = 0.18; g.add(head);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.2, 8), emat(0xe8d39a));
  beam.material.transparent = true; beam.material.opacity = 0.5; beam.position.y = 0.32; g.add(beam);
  return g;
}
function iman() {
  const g = new THREE.Group();
  const u = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.05, 6, 12, Math.PI), mat(0xb03a2a));
  u.rotation.z = Math.PI; g.add(u);
  for (const x of [-0.14, 0.14]) {
    const tip = box(0.08, 0.06, 0.1, 0xcccccc); tip.position.set(x, 0.02, 0); g.add(tip);
  }
  return g;
}
function comodin() {
  const g = new THREE.Group();
  const card = box(0.22, 0.32, 0.01, 0xe8e2d6); g.add(card);
  const j = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.02), emat(0xb07bd1));
  j.position.z = 0.01; g.add(j);
  return g;
}
function vhs() {
  const g = new THREE.Group();
  g.add(box(0.5, 0.14, 0.3, 0x101014));
  const label = box(0.42, 0.02, 0.22, 0x6a6055); label.position.y = 0.08; g.add(label);
  for (const x of [-0.1, 0.1]) {
    const reel = cyl(0.05, 0.05, 0.03, 8, 0x222226);
    reel.rotation.x = Math.PI / 2; reel.position.set(x, 0.1, 0); g.add(reel);
  }
  return g;
}

const BUILDERS = {
  bomba, dinamita, sospechosa, maldicion, whisky, llave, dado,
  jeringa, telefono, bolsa, linterna, iman, comodin, vhs,
};

export function makeItem(type) {
  const fn = BUILDERS[type];
  return fn ? fn() : generic();
}
export function makeMystery() { return generic(); }
