// Mallas procedurales low-poly de los 8 objetos + el cartucho "misterio".
import * as THREE from "three";
import { mat, emat } from "./ps1.js";

function cyl(r1, r2, h, seg, color) {
  return new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat(color));
}
function box(w, h, d, color) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
}

// Cartucho misterioso: lo que TODOS ven sobre la mesa (no revela el tipo).
export function makeMystery() {
  const g = new THREE.Group();
  const b = box(0.42, 0.12, 0.28, 0x0a0a0c);
  g.add(b);
  const q = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.05), emat(0xd94b3a));
  q.position.y = 0.07;
  g.add(q);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(b.geometry),
    new THREE.LineBasicMaterial({ color: 0x33333a })
  );
  g.add(edges);
  return g;
}

function vhs() {
  const g = new THREE.Group();
  g.add(box(0.5, 0.14, 0.3, 0x101014));
  const label = box(0.42, 0.02, 0.22, 0x6a6055);
  label.position.y = 0.08;
  g.add(label);
  for (const x of [-0.1, 0.1]) {
    const reel = cyl(0.05, 0.05, 0.03, 8, 0x222226);
    reel.rotation.x = Math.PI / 2;
    reel.position.set(x, 0.1, 0);
    g.add(reel);
  }
  return g;
}

function key() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.03, 6, 12), mat(0xc9a24b));
  ring.position.x = -0.12;
  g.add(ring);
  const shaft = cyl(0.03, 0.03, 0.34, 6, 0xc9a24b);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.x = 0.08;
  g.add(shaft);
  const tooth = box(0.05, 0.09, 0.04, 0xc9a24b);
  tooth.position.set(0.22, -0.05, 0);
  g.add(tooth);
  return g;
}

function bomb() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), mat(0x0c0c0e));
  g.add(b);
  const fuse = cyl(0.015, 0.015, 0.16, 5, 0x3a2a1a);
  fuse.position.set(0.05, 0.22, 0);
  fuse.rotation.z = -0.4;
  g.add(fuse);
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), emat(0xe8b04b));
  spark.position.set(0.11, 0.3, 0);
  g.add(spark);
  g.userData.spark = spark;
  return g;
}

function syringe() {
  const g = new THREE.Group();
  const barrel = cyl(0.05, 0.05, 0.34, 8, 0xaaccbb);
  barrel.rotation.z = Math.PI / 2;
  barrel.material.transparent = true;
  barrel.material.opacity = 0.7;
  g.add(barrel);
  const liquid = cyl(0.035, 0.035, 0.16, 8, 0x7bd16a);
  liquid.rotation.z = Math.PI / 2;
  liquid.position.x = -0.05;
  g.add(liquid);
  const needle = cyl(0.008, 0.008, 0.12, 4, 0xcccccc);
  needle.rotation.z = Math.PI / 2;
  needle.position.x = 0.23;
  g.add(needle);
  const plunger = cyl(0.045, 0.045, 0.04, 8, 0xd94b3a);
  plunger.rotation.z = Math.PI / 2;
  plunger.position.x = -0.2;
  g.add(plunger);
  return g;
}

function coins() {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const c = cyl(0.13, 0.13, 0.035, 12, i % 2 ? 0xe8b04b : 0xc9902b);
    c.position.y = i * 0.04 - 0.05;
    c.position.x = (i % 2) * 0.02;
    g.add(c);
  }
  return g;
}

function radio() {
  const g = new THREE.Group();
  g.add(box(0.42, 0.26, 0.18, 0x1a140c));
  const spk = cyl(0.08, 0.08, 0.02, 12, 0x0a0a0a);
  spk.rotation.x = Math.PI / 2;
  spk.position.set(-0.1, 0, 0.1);
  g.add(spk);
  const dial = cyl(0.03, 0.03, 0.02, 8, 0xe8b04b);
  dial.rotation.x = Math.PI / 2;
  dial.position.set(0.12, 0.05, 0.1);
  g.add(dial);
  const ant = cyl(0.008, 0.008, 0.34, 4, 0xbbbbbb);
  ant.position.set(0.16, 0.28, -0.05);
  ant.rotation.z = -0.3;
  g.add(ant);
  return g;
}

function phone() {
  const g = new THREE.Group();
  g.add(box(0.34, 0.1, 0.26, 0x101014));
  // horquilla
  const handset = box(0.32, 0.07, 0.08, 0x1c1c22);
  handset.position.y = 0.11;
  g.add(handset);
  for (const x of [-0.15, 0.15]) {
    const ear = cyl(0.05, 0.05, 0.05, 8, 0x1c1c22);
    ear.position.set(x, 0.13, 0);
    g.add(ear);
  }
  const dial = cyl(0.09, 0.09, 0.015, 12, 0xd94b3a);
  dial.rotation.x = Math.PI / 2;
  dial.position.set(0, 0.06, 0.09);
  g.add(dial);
  return g;
}

function smallbox() {
  const g = new THREE.Group();
  g.add(box(0.32, 0.26, 0.32, 0x5a4632));
  const flap = box(0.34, 0.02, 0.16, 0x6a5238);
  flap.position.y = 0.14;
  flap.rotation.x = -0.5;
  g.add(flap);
  const tape = box(0.05, 0.27, 0.33, 0x3a2c1e);
  g.add(tape);
  return g;
}

const BUILDERS = { vhs, key, bomb, syringe, coins, radio, phone, smallbox };

export function makeItem(type) {
  const fn = BUILDERS[type];
  return fn ? fn() : makeMystery();
}
