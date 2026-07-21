// Modelos procedurales low-poly (hechos con geometria basica de Three).
import * as THREE from "three";
import { mat, emat } from "./ps1.js";
import { drawIcon, EMOJI_ICON } from "./icons.js";

// ---- sala: cabaret / casino noir ----------------------------------------
// Salón oscuro pero LEGIBLE: lámparas colgantes que iluminan la mesa, cortinas
// rojas, columnas, neones apagados, humo, luz roja al fondo y siluetas de
// espectadores. makeRoom() devuelve el grupo y deja "handles" en
// userData.anim para que scene.js los anime cada frame.
const FLOOR_Y = -0.99;

// textura radial suave (para humo / resplandores)
function _radialTex(inner, outer) {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const x = c.getContext("2d");
  const grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, inner); grd.addColorStop(1, outer);
  x.fillStyle = grd; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// silueta de espectador (busto): oscura, con rim cálido arriba (lámparas) y
// rojo a los costados (luz del fondo). Sutil, "en la penumbra".
function _spectatorTex() {
  const c = document.createElement("canvas"); c.width = 96; c.height = 168;
  const x = c.getContext("2d");
  const draw = () => { x.beginPath();
    x.moveTo(8, 168); x.quadraticCurveTo(10, 100, 48, 88);
    x.quadraticCurveTo(86, 100, 88, 168); x.closePath();
    x.ellipse(48, 64, 20, 25, 0, 0, Math.PI * 2); x.fill(); };
  // cuerpo: casi negro abajo, un pelín más claro arriba (rim de lámpara)
  const body = x.createLinearGradient(0, 40, 0, 168);
  body.addColorStop(0, "#26222e"); body.addColorStop(.35, "#131019"); body.addColorStop(1, "#070409");
  x.fillStyle = body; draw();
  // rim rojo a los costados (sólo sobre la silueta)
  x.globalCompositeOperation = "source-atop";
  const rim = x.createLinearGradient(0, 0, 96, 0);
  rim.addColorStop(0, "rgba(150,26,22,.5)"); rim.addColorStop(.5, "rgba(0,0,0,0)");
  rim.addColorStop(1, "rgba(120,22,44,.45)");
  x.fillStyle = rim; x.fillRect(0, 0, 96, 168);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// columna con base y capitel
function _column(h) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, h, 14, 1, true),
    mat(0x141019, { emissive: 0x070510, side: THREE.DoubleSide }));
  shaft.position.y = FLOOR_Y + h / 2; g.add(shaft);
  const base = _cyl(0.52, 0.6, 0.5, 14, 0x120f18); base.position.y = FLOOR_Y + 0.25; g.add(base);
  const cap = _cyl(0.5, 0.42, 0.45, 14, 0x120f18); cap.position.y = FLOOR_Y + h - 0.22; g.add(cap);
  const abac = _box(1.05, 0.22, 1.05, 0x14111c); abac.position.y = FLOOR_Y + h + 0.02; g.add(abac);
  return g;
}

// cortina roja con pliegues reales (onda a lo ancho -> el flat-shading la esculpe)
function _curtain(w, h, folds) {
  const geo = new THREE.PlaneGeometry(w, h, folds * 3, 1);
  const pos = geo.attributes.position;
  const amp = (w / folds) * 0.5;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / w + 0.5;
    pos.setZ(i, (Math.cos(u * Math.PI * 2 * folds) * 0.5 + 0.5) * amp);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat(0x1c040b, { emissive: 0x0a0103, side: THREE.DoubleSide }));
}

// lámpara colgante (SÓLO visual: la luz real la pone scene.js donde hace falta)
function _hangingLamp(x, z, shadeY, ceilY, warm) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const cordLen = ceilY - shadeY;
  const cord = _cyl(0.015, 0.015, cordLen, 5, 0x08080a);
  cord.position.y = shadeY + cordLen / 2; g.add(cord);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.5, 18, 1, true),
    mat(0x17110b, { emissive: 0x2a1a08, side: THREE.DoubleSide }));
  shade.position.y = shadeY; g.add(shade);
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.42, 18), emat(warm));
  inner.material.transparent = true; inner.material.opacity = 0.55;
  inner.position.y = shadeY - 0.05; g.add(inner);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), emat(warm));
  bulb.position.y = shadeY - 0.16; g.add(bulb);
  // resplandor billboard alrededor del bulbo (tenue)
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4),
    new THREE.MeshBasicMaterial({ map: _radialTex("rgba(255,205,145,.85)", "rgba(255,180,120,0)"),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.2 }));
  glow.position.y = shadeY - 0.1; g.add(glow);
  g.userData = { bulb, inner, glow, baseX: x, baseZ: z, phase: Math.random() * 6 };
  return g;
}

// neón "apagado" (aro + arco tenue que parpadea de vez en cuando)
function _neon(color) {
  const g = new THREE.Group();
  const m = emat(color); m.transparent = true; m.opacity = 0.14;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 6, 22), m);
  g.add(ring);
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.03, 6, 16, Math.PI * 1.25), m);
  arc.position.set(0.72, -0.12, 0); g.add(arc);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.03), m);
  bar.position.set(-0.62, 0, 0); g.add(bar);
  g.userData = { mat: m, phase: Math.random() * 10 };
  return g;
}

// espectador (billboard con la silueta)
function _spectator(tex) {
  return new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.35),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.92 }));
}

// puff de humo (billboard aditivo)
function _smoke(tex, color) {
  return new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0 }));
}

export function makeRoom() {
  const g = new THREE.Group();
  const anim = { lamps: [], neons: [], spectators: [], smokes: [], redLights: [] };
  const W = 26, H = 12, ceilY = FLOOR_Y + H;

  // --- caja del salón (paredes + techo) — muy oscuro ---
  const shell = new THREE.Mesh(new THREE.BoxGeometry(W, H, W),
    mat(0x070510, { emissive: 0x030206, side: THREE.BackSide }));
  shell.position.y = FLOOR_Y + H / 2; g.add(shell);

  // --- piso: un solo plano MUY oscuro. NADA de alfombra encima (dos planos a
  // 0.01 del piso hacían z-fighting/"glitch" que se pegaba a la mesa). ---
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, W), mat(0x070508));
  floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR_Y; g.add(floor);

  // --- columnas (anillo) ---
  const NC = 8;
  for (let i = 0; i < NC; i++) {
    const a = (i / NC) * Math.PI * 2 + Math.PI / NC;
    const col = _column(H - 0.4);
    col.position.set(Math.cos(a) * 8.2, 0, Math.sin(a) * 8.2);
    g.add(col);
  }
  // --- cortinas rojas (entre columnas, contra la pared) ---
  for (let i = 0; i < NC; i++) {
    const a = (i / NC) * Math.PI * 2;
    const cur = _curtain(6.4, H - 1.2, 7);
    cur.position.set(Math.cos(a) * 9.6, FLOOR_Y + (H - 1.2) / 2, Math.sin(a) * 9.6);
    cur.lookAt(0, cur.position.y, 0);
    g.add(cur);
  }
  // valance / cenefa superior de terciopelo
  const valance = new THREE.Mesh(new THREE.CylinderGeometry(9.7, 9.7, 1.1, 48, 1, true),
    mat(0x1a040a, { emissive: 0x0c0204, side: THREE.DoubleSide }));
  valance.position.y = FLOOR_Y + H - 1.1; g.add(valance);

  // --- siluetas de espectadores (anillo en la penumbra) ---
  const specTex = _spectatorTex();
  const NS = 16;
  for (let i = 0; i < NS; i++) {
    const a = (i / NS) * Math.PI * 2 + 0.2;
    const r = 6.5 + (i % 3) * 0.55;
    const s = _spectator(specTex);
    s.material.opacity = 0.68;   // más tenues: sombras en la penumbra
    s.position.set(Math.cos(a) * r, FLOOR_Y + 1.16, Math.sin(a) * r);
    s.userData = { baseY: s.position.y, phase: Math.random() * 6, sway: 0.4 + Math.random() * 0.7 };
    g.add(s); anim.spectators.push(s);
  }

  // --- lámparas colgantes: 1 central sobre la mesa + 4 satélite ---
  const main = _hangingLamp(0, 0, 3.55, ceilY, 0xffcaa0);
  g.add(main); anim.lamps.push(main);
  for (const [x, z] of [[3.4, 3.4], [-3.4, 3.4], [3.4, -3.4], [-3.4, -3.4]]) {
    const l = _hangingLamp(x, z, 4.5, ceilY, 0xe0965e);
    g.add(l); anim.lamps.push(l);
  }

  // --- neones apagados (alto, contra las columnas) ---
  const neonCols = [0x3a1030, 0x0c2a30, 0x30240a, 0x2a0a1c, 0x14203a];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.5;
    const n = _neon(neonCols[i % neonCols.length]);
    n.position.set(Math.cos(a) * 7.7, FLOOR_Y + 5.4, Math.sin(a) * 7.7);
    n.lookAt(0, n.position.y, 0);
    g.add(n); anim.neons.push(n);
  }

  // --- luz roja al fondo (uplights + resplandor) ---
  const glowTex = _radialTex("rgba(210,30,20,.9)", "rgba(210,30,20,0)");
  for (const [x, z] of [[0, -9], [0, 9], [-9, 0]]) {
    // luz roja SÓLO al fondo: lejana, débil y con caída fuerte
    const rl = new THREE.PointLight(0xc21810, 0.45, 7, 2.4);
    rl.position.set(x * 0.98, FLOOR_Y + 2.0, z * 0.98);
    g.add(rl); anim.redLights.push(rl);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 7.5),
      new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0.28 }));
    glow.position.set(x, FLOOR_Y + 3, z);
    glow.lookAt(0, glow.position.y, 0);
    g.add(glow);
  }

  // --- humo volumétrico (puffs que suben y giran) ---
  const smokeTex = _radialTex("rgba(255,255,255,.85)", "rgba(255,255,255,0)");
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 6.5;
    const sm = _smoke(smokeTex, i % 2 ? 0x5a3a24 : 0x2c1622);
    const sc = 3 + Math.random() * 4.5;
    sm.scale.set(sc, sc, 1);
    sm.position.set(Math.cos(a) * r, FLOOR_Y + 0.4 + Math.random() * 2.8, Math.sin(a) * r);
    sm.userData = { drift: 0.05 + Math.random() * 0.09, spin: (Math.random() - 0.5) * 0.25,
      maxOp: 0.05 + Math.random() * 0.06, phase: Math.random() * 6 };
    g.add(sm); anim.smokes.push(sm);
  }

  g.userData.anim = anim;
  return g;
}

// ---- mesa redonda --------------------------------------------------------
export function makeTable() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 2.55, 0.18, 18), mat(0x4a3420));
  top.position.y = 0;
  g.add(top);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.08, 6, 22), mat(0x5a3e2a));
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  const leg = mat(0x24201a);
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

// ---- gabinete de tragaperras (silueta de fondo del casino) ---------------
export function makeSlotCabinet(color = 0x14141c) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.7, 0.6), mat(color));
  body.position.y = 0.85;
  g.add(body);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.4), emat(0x3a2a4a));
  screen.position.set(0, 1.15, 0.31);
  g.add(screen);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), emat(0xd94b3a));
  light.position.y = 1.75;
  g.add(light);
  g.userData.light = light;
  return g;
}

// ---- helpers locales ----
function _box(w, h, d, c) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); }
function _cyl(r1, r2, h, s, c) { return new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, s), mat(c)); }

// ---- tragaperras INTERACTIVA (rodillos + palanca que se arrastra) ---------
export const SLOT_SYMS = ["🍒", "🔔", "⭐", "🎰", "💀", "📦", "👁"];

function reelTexture() {
  const N = SLOT_SYMS.length;
  const cvs = document.createElement("canvas");
  cvs.width = 64; cvs.height = 64 * N;
  const ctx = cvs.getContext("2d");
  for (let k = 0; k < N; k++) {
    ctx.fillStyle = k % 2 ? "#171020" : "#211732";
    ctx.fillRect(0, k * 64, 64, 64);
    drawIcon(ctx, EMOJI_ICON[SLOT_SYMS[k]] || "question", 32, k * 64 + 32, 40, "#e8e2d6");
  }
  const tex = new THREE.CanvasTexture(cvs);
  tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  tex.repeat.set(1, 1 / N);
  return tex;
}

export function makeSlotMachine() {
  const g = new THREE.Group();
  // gabinete
  const body = _box(1.05, 1.25, 0.5, 0x2a1030); g.add(body);
  const marquee = _box(1.1, 0.24, 0.55, 0x3a1848); marquee.position.y = 0.72; g.add(marquee);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), emat(0xe8b04b));
  light.position.set(0, 0.72, 0.3); g.add(light);
  g.userData.marqueeLight = light;
  // pantalla de rodillos
  const screen = _box(0.86, 0.5, 0.06, 0x0a0510); screen.position.set(0, 0.12, 0.24); g.add(screen);
  const reels = [];
  for (let i = 0; i < 3; i++) {
    const tex = reelTexture();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.44),
      new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set((i - 1) * 0.27, 0.12, 0.28);
    g.add(m);
    reels.push({ tex, N: SLOT_SYMS.length });
  }
  // ranura de monedas
  const slot = _box(0.3, 0.03, 0.02, 0x000); slot.position.set(0, -0.3, 0.26); g.add(slot);
  // PALANCA (a la derecha) — el brazo apunta ARRIBA, se tira hacia abajo/adelante
  const lever = new THREE.Group();
  lever.position.set(0.6, 0.02, 0.12);
  const arm = _cyl(0.035, 0.035, 0.52, 8, 0x9a9aa2); arm.position.y = 0.26; lever.add(arm);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), emat(0xd94b3a));
  knob.position.y = 0.54; lever.add(knob);
  g.add(lever);
  g.userData.lever = lever;
  g.userData.knob = knob;
  g.userData.reels = reels;
  return g;
}

// ---- revólver (ruleta rusa) ----------------------------------------------
export function makeRevolver() {
  const g = new THREE.Group();
  const steel = 0x3b3c44, dark = 0x24242a;
  // cuerpo/marco que conecta culata, tambor y caño
  const frame = _box(0.34, 0.14, 0.06, steel); frame.position.set(0.02, 0.02, 0); g.add(frame);
  const topStrap = _box(0.5, 0.05, 0.055, steel); topStrap.position.set(0.14, 0.09, 0); g.add(topStrap);
  // culata (mango) inclinada, unida al marco
  const grip = _box(0.12, 0.26, 0.07, 0x3a2416); grip.position.set(-0.18, -0.12, 0); grip.rotation.z = 0.45; g.add(grip);
  const gripCap = _box(0.1, 0.06, 0.075, 0x24160c); gripCap.position.set(-0.28, -0.24, 0); gripCap.rotation.z = 0.45; g.add(gripCap);
  // caño con alza y punto de mira
  const barrel = _cyl(0.03, 0.03, 0.42, 12, steel); barrel.rotation.z = Math.PI / 2; barrel.position.set(0.34, 0.05, 0); g.add(barrel);
  const bore = _cyl(0.016, 0.016, 0.04, 10, 0x0a0a0a); bore.rotation.z = Math.PI / 2; bore.position.set(0.55, 0.05, 0); g.add(bore);
  const frontSight = _box(0.02, 0.04, 0.03, dark); frontSight.position.set(0.5, 0.1, 0); g.add(frontSight);
  const rearSight = _box(0.03, 0.03, 0.05, dark); rearSight.position.set(0.06, 0.12, 0); g.add(rearSight);
  // martillo (hammer) atrás
  const hammer = _box(0.05, 0.09, 0.04, dark); hammer.position.set(-0.1, 0.11, 0); hammer.rotation.z = -0.3; g.add(hammer);
  // tambor
  const cylr = _cyl(0.09, 0.09, 0.11, 12, 0x55565e); cylr.rotation.z = Math.PI / 2; cylr.position.set(0.06, 0.02, 0); g.add(cylr);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), mat(0x0a0a0a));
    hole.rotation.z = Math.PI / 2;
    hole.position.set(0.02, Math.cos(a) * 0.05, Math.sin(a) * 0.05);
    cylr.add(hole);
  }
  // guardamonte + gatillo
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.014, 6, 12, Math.PI), mat(steel));
  guard.rotation.x = Math.PI / 2; guard.rotation.z = Math.PI; guard.position.set(-0.03, -0.11, 0); g.add(guard);
  const trigger = _box(0.03, 0.08, 0.04, 0xd94b3a); trigger.position.set(-0.03, -0.09, 0); g.add(trigger);
  g.userData = { cyl: cylr, trigger, barrel, hammer };
  return g;
}

// ---- maletín (mercado) — cae del cielo y se abre --------------------------
export function makeBriefcase() {
  const g = new THREE.Group();
  const base = _box(0.6, 0.14, 0.42, 0x2a1a10); g.add(base);
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.07, -0.21);
  const lid = _box(0.6, 0.14, 0.42, 0x3a2410); lid.position.set(0, 0, 0.21); lidPivot.add(lid);
  const felt = _box(0.5, 0.02, 0.34, 0x5a1020); felt.position.set(0, 0.08, 0.21); lidPivot.add(felt);
  g.add(lidPivot);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.018, 6, 10), mat(0x1a1008));
  handle.position.set(0, 0.1, 0.22); handle.rotation.x = Math.PI / 2; g.add(handle);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.34), emat(0xe8b04b));
  glow.rotation.x = -Math.PI / 2; glow.position.set(0, 0.08, 0);
  glow.material.transparent = true; glow.material.opacity = 0.0;
  g.add(glow);
  g.userData = { lid: lidPivot, glow };
  return g;
}

// ---- reliquias (modelos 3D chicos) ---------------------------------------
export function makeRelic(id) {
  const g = new THREE.Group();
  if (id === "ojo") {
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 9), mat(0xe8e2d6)));
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), emat(0x6ab0d1)); iris.position.z = 0.1; g.add(iris);
    const pup = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), emat(0x050505)); pup.position.z = 0.14; g.add(pup);
  } else if (id === "diente") {
    g.add(_cyl(0.11, 0.13, 0.17, 6, 0xe8b04b));
    for (const s of [-1, 1]) { const r = _cyl(0.03, 0.008, 0.11, 5, 0xe8b04b); r.position.set(s * 0.05, -0.13, 0); g.add(r); }
  } else if (id === "cuernos") {
    for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.26, 6), mat(0xb03a2a)); c.position.set(s * 0.09, 0.08, 0); c.rotation.z = -s * 0.5; g.add(c); }
  } else if (id === "tahur") {
    g.add(_box(0.17, 0.24, 0.01, 0xe8e2d6));
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.02), emat(0xd94b3a)); p.position.z = 0.01; g.add(p);
  } else if (id === "mascara") {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 7), mat(0xb07bd1)); m.scale.z = 0.5; g.add(m);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.02), emat(0x050505)); e.position.set(s * 0.06, 0.03, 0.09); g.add(e); }
  } else {
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), mat(0x888)));
  }
  return g;
}

// ---- caja misteriosa (objeto CERRADO de la fase OBJETOS) -----------------
// Un "regalo" oscuro con moño rojo y signos de pregunta: no sabés si adentro
// hay un premio o una bomba.
export function makeMysteryBox() {
  const g = new THREE.Group();
  const box = _box(0.5, 0.5, 0.5, 0x241018); box.position.y = 0; g.add(box);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry),
    new THREE.LineBasicMaterial({ color: 0xe8b04b })); g.add(edges);
  // cintas / moño emisivo
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.53, 0.1, 0.53), emat(0xd94b3a)));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.53, 0.53), emat(0xd94b3a)));
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), emat(0xe8b04b));
  knot.position.y = 0.27; g.add(knot);
  // signos de pregunta en las 4 caras
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const x = c.getContext("2d");
  x.fillStyle = "#f0c85a";
  x.font = "bold 54px 'Courier New',monospace"; x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText("?", 32, 38);
  const qtex = new THREE.CanvasTexture(c); qtex.colorSpace = THREE.SRGBColorSpace;
  const qmat = new THREE.MeshBasicMaterial({ map: qtex, transparent: true, toneMapped: false });
  for (const ry of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), qmat);
    q.position.set(Math.sin(ry) * 0.26, 0, Math.cos(ry) * 0.26); q.rotation.y = ry; g.add(q);
  }
  return g;
}

// ---- Muñeca Maldita (reliquia): muñeca de porcelana con cabeza controlable ---
// El GLB del usuario está riggeado de un modo que no escala/renderiza fiable en
// el motor y perdió el nombre del hueso; esta versión procedural permite que la
// CABEZA siga con la mirada al jugador de turno de forma perfecta. Devuelve
// {group, head}: rotá `head` para que mire a alguien.
export function makeDoll() {
  const g = new THREE.Group();
  // auto-brillo alto: la muñeca debe leerse como presencia pálida en la penumbra
  const porcelain = mat(0xe6d8c4, { emissive: 0x8a7458 });
  const dress = mat(0x6a0c1a, { emissive: 0x45101a });
  const dark = mat(0x160c14, { emissive: 0x0c060a });
  // vestido (falda cónica) + torso
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.42, 12), dress);
  skirt.position.y = 0.21; g.add(skirt);
  const torso = _cyl(0.1, 0.14, 0.18, 10, 0x6c0c1a); torso.position.y = 0.45; g.add(torso);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 12), dark);
  collar.rotation.x = Math.PI / 2; collar.position.y = 0.54; g.add(collar);
  // bracitos colgando
  for (const s of [-1, 1]) {
    const arm = _cyl(0.032, 0.028, 0.22, 6, 0xe6d8c4); arm.position.set(s * 0.14, 0.42, 0);
    arm.rotation.z = s * 0.22; g.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), porcelain);
    hand.position.set(s * 0.17, 0.31, 0); g.add(hand);
  }
  // piernitas
  for (const s of [-1, 1]) {
    const leg = _cyl(0.038, 0.032, 0.14, 6, 0xe6d8c4); leg.position.set(s * 0.07, 0.06, 0.04); g.add(leg);
    const shoe = _box(0.06, 0.04, 0.09, 0x140a12); shoe.position.set(s * 0.07, 0.0, 0.06); g.add(shoe);
  }
  // ---- cabeza (grupo que rota para "mirar"): la cara mira a +Z ----
  const head = new THREE.Group(); head.position.y = 0.64; g.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), porcelain);
  skull.scale.set(1, 1.05, 0.95); head.add(skull);
  // pelo (media esfera oscura)
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.165, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), dark);
  hair.position.y = 0.02; head.add(hair);
  const bang = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 8, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.2), dark);
  bang.position.set(0, 0.03, 0.02); head.add(bang);
  // ojos negros con brillo rojo (miran +Z)
  for (const s of [-1, 1]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 7), emat(0x080606));
    socket.position.set(s * 0.06, -0.01, 0.125); head.add(socket);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 5), emat(0xe23a2a));
    glint.position.set(s * 0.062, 0.0, 0.16); head.add(glint);
  }
  // grieta + boca cosida
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.01), emat(0x6a1010));
  mouth.position.set(0, -0.08, 0.14); head.add(mouth);
  for (let i = -2; i <= 2; i++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.03, 0.01), dark);
    st.position.set(i * 0.017, -0.08, 0.142); head.add(st);
  }
  g.userData.head = head;
  return { group: g, head };
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
  if (dead) drawIcon(ctx, "skull", 22, 24, 22, "#8a5a5a");
  ctx.fillText(name, dead ? 38 : 12, 24);
  // corazones
  const hpN = Math.max(0, hp);
  for (let i = 0; i < hpN; i++) drawIcon(ctx, "heart", 22 + i * 22, 48, 18, "#d94b3a");
  if (hpN === 0) { ctx.fillStyle = "#6a4a4a"; ctx.fillText("—", 16, 50); }
  // fichas (chip + número)
  const cval = coins === null || coins === undefined ? "?" : String(coins);
  ctx.font = "20px 'Courier New',monospace";
  ctx.fillStyle = "#e8b04b";
  ctx.textAlign = "right";
  ctx.fillText(cval, cvs.width - 12, 48);
  drawIcon(ctx, "chip", cvs.width - 20 - ctx.measureText(cval).width - 12, 48, 18, "#e8b04b");
  ctx.textAlign = "left";
  tex.needsUpdate = true;
}
