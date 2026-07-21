// Escena Three.js: mesa unica, caja negra al centro, figuras sombrias por asiento,
// camara en primera persona en TU asiento. Todo oscuro, con niebla.
import * as THREE from "three";
import { sizeLowRes, emat } from "./ps1.js";
import {
  makeRoom, makeTable, makeBlackBox, makeChair, makeFigure, makeTV,
  makePlacard, paintPlacard, paintStatic,
} from "./models.js";
import { makeItem, makeMystery } from "./items3d.js";

const RSEAT = 3.0;
const CAM_Y = 1.55;
const LOOK = new THREE.Vector3(0, 0.8, 0);
const TONE_COLORS = { good: 0x7bd16a, bad: 0xd94b3a, info: 0x6ab0d1, weird: 0xb07bd1 };

export class SceneManager {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "low-power" });
    this.renderer.setClearColor(0x000000, 1);
    // unidades de luz "intuitivas" (0-1) en vez del modelo fisico de r155+
    if ("useLegacyLights" in this.renderer) this.renderer.useLegacyLights = true;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x000000, 4, 13);

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 60);
    this.camera.position.set(0, CAM_Y, RSEAT + 0.4);

    // base tenue para que nada sea negro puro, + "bombita" sobre la mesa
    this.scene.add(new THREE.AmbientLight(0x2a2636, 1.1));
    this.tableLight = new THREE.PointLight(0xffd39a, 1.6, 14, 1.2);
    this.tableLight.position.set(0, 3.4, 0);
    this.scene.add(this.tableLight);
    const boxGlow = new THREE.PointLight(0xd94b3a, 0.7, 5, 1.5);
    boxGlow.position.set(0, 1.4, 0.6);
    this.scene.add(boxGlow);

    this.scene.add(makeRoom());
    this.scene.add(makeTable());

    const bb = makeBlackBox();
    this.box = bb.group;
    this.boxSlot = bb.slot;
    this.scene.add(this.box);

    this.tv = makeTV();
    this.tv.position.set(-4.4, 0.4, -2.2);
    this.tv.rotation.y = 0.5;
    this.scene.add(this.tv);

    this.mystery = makeMystery();
    this.mystery.visible = false;
    this.scene.add(this.mystery);

    this.seatObjs = new Map();   // seat -> {group, figure, placard}
    this.mySeat = null;
    this.holderSeat = null;
    this.targetBoxScale = 1;
    this.revealProp = null;
    this.revealT = 0;
    this.slotFlash = 0;
    this.clock = new THREE.Clock();
    this.corruption = 0;

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    sizeLowRes(this.renderer, this.camera, 300);
  }

  seatAngle(k, n) { return -Math.PI / 2 + (k / n) * Math.PI * 2; }

  seatPos(k, n) {
    const a = this.seatAngle(k, n);
    return new THREE.Vector3(Math.cos(a) * RSEAT, 0, Math.sin(a) * RSEAT);
  }

  // ---- actualizar segun estado del servidor ----
  update(state) {
    this.mySeat = state.you.seat;
    this.holderSeat = state.current ? state.current.holderSeat : null;
    this.corruption = state.corruption || 0;
    this.targetBoxScale = 0.82 + (state.boxSize || 3) * 0.045;

    const seats = state.seats.slice().sort((a, b) => a.seat - b.seat);
    const n = seats.length;
    const present = new Set(seats.map((s) => s.seat));

    // borrar asientos que ya no estan
    for (const [seat, obj] of this.seatObjs) {
      if (!present.has(seat)) { this.scene.remove(obj.group); this.seatObjs.delete(seat); }
    }

    seats.forEach((s, k) => {
      const pos = this.seatPos(k, n);
      const isMe = s.seat === this.mySeat;
      let obj = this.seatObjs.get(s.seat);
      if (!obj) {
        const group = new THREE.Group();
        const chair = makeChair();
        const figure = makeFigure(0x222230);
        const placard = makePlacard();
        placard.position.y = 1.62;
        group.add(chair, figure, placard);
        this.scene.add(group);
        obj = { group, figure, placard };
        this.seatObjs.set(s.seat, obj);
      }
      obj.group.position.set(pos.x, 0, pos.z);
      // mirar hacia el centro
      obj.group.rotation.y = Math.atan2(-pos.x, -pos.z);
      // mi propia figura no se dibuja (soy yo, primera persona)
      obj.figure.visible = !isMe;
      // resaltar sostenedor
      const isHolder = this.holderSeat === s.seat;
      if (obj.figure.userData.rim) {
        obj.figure.userData.rim.material.color.setHex(isHolder ? 0xe8b04b : 0x222230);
      }
      paintPlacard(obj.placard, {
        name: s.name, hp: s.hp, coins: s.coins,
        holder: isHolder, dead: !s.alive, connected: s.connected,
      });
      obj.placard.visible = !isMe; // no necesito ver mi propia placa
      // la placa hereda la rotacion del grupo (mira al centro -> hacia mi camara)

      if (isMe) {
        // ubicar camara en mi asiento
        const out = pos.clone().multiplyScalar((RSEAT + 0.55) / RSEAT);
        this.camBase = new THREE.Vector3(out.x, CAM_Y, out.z);
      }
    });

    // cartucho misterioso: visible durante CHOOSE, flotando sobre la ranura
    const showMystery = state.phase === "CHOOSE" && state.current;
    this.mystery.visible = showMystery;

    // fog/luz segun corrupcion
    const c = Math.min(1, this.corruption / 12);
    this.scene.fog.far = 13 - c * 4;
    this.tableLight.intensity = 1.4 - c * 0.5;
  }

  // ---- reveal 3D: sale el objeto real sobre la caja ----
  reveal(face, tone) {
    if (this.revealProp) { this.scene.remove(this.revealProp); this.revealProp = null; }
    const prop = makeItem(face.type);
    prop.scale.set(2.2, 2.2, 2.2);
    prop.position.set(0, 1.55, 0);
    this.scene.add(prop);
    this.revealProp = prop;
    this.revealT = 2.4;
    this.slotFlash = 1;
    this.slotTone = TONE_COLORS[tone] || 0xd94b3a;
  }

  // ---- loop de render ----
  render() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;

    // camara: leve balanceo (respiracion)
    if (this.camBase) {
      this.camera.position.set(
        this.camBase.x + Math.sin(t * 0.7) * 0.02,
        this.camBase.y + Math.sin(t * 1.3) * 0.015,
        this.camBase.z + Math.cos(t * 0.5) * 0.02
      );
      this.camera.lookAt(LOOK);
    }

    // caja: escala suave + latido de la ranura + ojo
    this.box.scale.setScalar(THREE.MathUtils.lerp(this.box.scale.x || 1, this.targetBoxScale, 0.05));
    const pulse = 0.55 + Math.sin(t * 3) * 0.25;
    if (this.slotFlash > 0) {
      this.slotFlash = Math.max(0, this.slotFlash - dt * 1.5);
      this.boxSlot.material.color.setHex(this.slotTone);
    } else {
      this.boxSlot.material.color.setRGB(pulse * 0.85, pulse * 0.29, pulse * 0.23);
    }
    if (this.box.userData.eye) {
      this.box.userData.eye.material.color.setRGB(0.1, 0.3 + pulse * 0.3, 0.4 + pulse * 0.3);
    }

    // cartucho misterioso flotando + girando
    if (this.mystery.visible) {
      this.mystery.position.set(0, 1.5 + Math.sin(t * 2) * 0.06, 0);
      this.mystery.rotation.y = t * 0.8;
      this.mystery.scale.setScalar(1.5);
    }

    // figuras: leve bob
    let i = 0;
    for (const obj of this.seatObjs.values()) {
      obj.figure.position.y = Math.sin(t * 1.1 + i) * 0.015;
      i++;
    }

    // reveal prop
    if (this.revealProp) {
      this.revealT -= dt;
      this.revealProp.rotation.y += dt * 2;
      this.revealProp.position.y = 1.55 + (2.4 - this.revealT) * 0.15;
      const k = Math.min(1, this.revealT / 0.4);
      this.revealProp.scale.setScalar(2.2 * k + 0.1);
      if (this.revealT <= 0) { this.scene.remove(this.revealProp); this.revealProp = null; }
    }

    // TV: estatica intermitente
    if (Math.random() < 0.5) paintStatic(this.tv.userData.canvas, this.tv.userData.tex, 0.6);

    this.renderer.render(this.scene, this.camera);
  }
}
