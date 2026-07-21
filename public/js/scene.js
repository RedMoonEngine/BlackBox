// Escena v2: mesa + BlackBox (CRT animada) + "escenario" 3D por actividad:
//  SLOTS -> tragaperras que flota hacia la cámara; tirás la PALANCA arrastrando el mouse.
//  ROULETTE -> revólver que se acerca (discreto); hacés click en el gatillo.
//  MARKET -> maletín que cae del cielo y se abre revelando los objetos en 3D.
//  + reveal del casino (demonios).
import * as THREE from "three";
import { sizeLowRes } from "./ps1.js";
import {
  makeRoom, makeTable, makeBlackBox, makeChair, makeFigure, makeSlotCabinet,
  makePlacard, paintPlacard, makeSlotMachine, makeRevolver, makeBriefcase, makeRelic, makeDoll,
  makeMysteryBox, SLOT_SYMS,
} from "./models.js";
import { makeItem } from "./items3d.js";
import { Assets } from "./assets.js";
import { drawIcon, ACT_ICON, EMOJI_ICON } from "./icons.js";

const RSEAT = 3.3;
const CAM_Y = 1.55;
const FLOOR = -0.99;              // piso real del salón (coincide con makeRoom)
const LOOK = new THREE.Vector3(0, 0.8, 0);
const WHEEL = ["box", "slot", "revolver", "film", "cart", "question"];

export class SceneManager {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "low-power" });
    this.renderer.setClearColor(0x050204, 1);
    if ("useLegacyLights" in this.renderer) this.renderer.useLegacyLights = true;

    this.scene = new THREE.Scene();
    // niebla MUY oscura: el fondo se hunde en negro, sólo la mesa queda en luz
    this.scene.fog = new THREE.Fog(0x050204, 6, 19);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 60);
    this.camera.position.set(0, CAM_Y, RSEAT + 0.4);

    // relleno global mínimo: el salón vive de las luces tenues, no de la ambiental
    this.ambient = new THREE.AmbientLight(0x1a1622, 0.4);
    this.scene.add(this.ambient);
    this.hemi = new THREE.HemisphereLight(0x2e2430, 0x0a0610, 0.42);
    this.scene.add(this.hemi);
    // luz de la LÁMPARA central: un pool cálido y tenue sobre la mesa/caja.
    this.tableLight = new THREE.PointLight(0xffcf9a, 2.6, 13, 1.2);
    this.tableLight.position.set(0, 3.4, 0);
    this.scene.add(this.tableLight);
    this._tableLight0 = 2.6;
    // luz cálida baja que lame el fieltro y los props de la mesa (props legibles
    // sin iluminar el fondo: está baja y con caída fuerte)
    this.feltLight = new THREE.PointLight(0xffb878, 1.5, 8, 1.6);
    this.feltLight.position.set(0, 1.05, 0);
    this.scene.add(this.feltLight);
    this._feltLight0 = 1.5;
    const boxGlow = new THREE.PointLight(0xd94b3a, 0.55, 4.5, 1.6);
    boxGlow.position.set(0, 1.4, 0.6);
    this.scene.add(boxGlow);

    this.room = makeRoom();
    this.scene.add(this.room);

    // ---- modelos 3D del usuario (GLB), con fallback procedural si algo falla ----
    this.assets = new Assets();

    // mesa. Su textura se usa además como emissiveMap para que el fieltro lea en
    // la oscuridad (si no, la mesa queda negra bajo la luz tenue del salón).
    this.tableProp = this.assets.spawn("table", { onReady: (inner) => {
      if (!inner) { this.tableProp.add(makeTable()); return; }
      inner.traverse((o) => {
        if (o.isMesh && o.material) {
          // Tripo exporta PBR con metalness alto y SIN environment map -> la mesa
          // sale negra. Forzando metal=0 / rough alto responde a las point lights.
          o.material.metalness = 0.0;
          o.material.roughness = 0.85;
          if (o.material.map) {
            o.material.emissiveMap = o.material.map;
            o.material.emissive = new THREE.Color(0xffe8c8);
            o.material.emissiveIntensity = 0.6;
          } else {
            o.material.emissive = new THREE.Color(0x2a1e12);
            o.material.emissiveIntensity = 0.4;
          }
          o.material.needsUpdate = true;
        }
      });
    } });
    this.scene.add(this.tableProp);

    // BlackBox central (TvBox). El modelo no tiene "slot"/"eye": se quedan en null.
    // Su PANTALLA (material "Material.001") recibe la textura CRT viva (this.crtTex).
    this.boxSlot = null;
    this.boxScreen = null;
    this.box = this.assets.spawn("box", { onReady: (inner) => {
      if (!inner) { const bb = makeBlackBox(); this.box.add(bb.group); this.boxSlot = bb.slot; this.box.userData.eye = bb.group.userData.eye; return; }
      inner.traverse((o) => {
        if (o.isMesh && o.material && o.material.name === "Material.001") {
          o.material = new THREE.MeshBasicMaterial({ map: this.crtTex, toneMapped: false });
          this.boxScreen = o;
        }
      });
    } });
    this.scene.add(this.box);

    // Canvas de la CRT: se redibuja cada frame y se usa como textura de la PANTALLA
    // del TvBox (el TvBox gira para que su pantalla mire a la cámara local).
    this.crtCanvas = document.createElement("canvas");
    this.crtCanvas.width = 128; this.crtCanvas.height = 96;
    this.crtTex = new THREE.CanvasTexture(this.crtCanvas);
    this.crtTex.magFilter = THREE.NearestFilter; this.crtTex.minFilter = THREE.NearestFilter;
    this.crtTex.colorSpace = THREE.SRGBColorSpace;
    // La pantalla del modelo mapea la textura dada vuelta en vertical -> flipY=false.
    this.crtTex.flipY = false;
    this.crtMode = "idle";

    // objeto flotante (OBJETOS)
    this.objectProp = null; this.objType = null;

    // ---- escenario 3D ----
    this.slot = makeSlotMachine(); this.slot.visible = false; this.scene.add(this.slot);
    this.reelState = [{ o: 0, phase: "idle", land: 0, target: 0 },
                      { o: 0, phase: "idle", land: 0, target: 0 },
                      { o: 0, phase: "idle", land: 0, target: 0 }];
    this.leverPull = 0; this.leverLocked = false;

    this.revolver = this.assets.spawn("revolver", { onReady: (inner) => { if (!inner) this.revolver.add(makeRevolver()); } });
    this.revolver.visible = false; this.scene.add(this.revolver);
    this.cylSpin = 0;   // se reutiliza como energía de retroceso del disparo

    this.briefcase = makeBriefcase(); this.briefcase.visible = false; this.scene.add(this.briefcase);
    this.caseItems = new THREE.Group(); this.briefcase.add(this.caseItems);
    this.caseAnim = 0; this.caseStockKey = "";

    // ---- reveal del casino: se abre un salón INMENSO y en llamas a lo lejos ----
    this.casinoGroup = new THREE.Group(); this.casinoGroup.visible = false;
    // gabinetes de tragaperras dispersos, lejos, sobre el piso
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.7, r = 8 + (i % 2) * 6;
      const cab = makeSlotCabinet();
      cab.position.set(Math.cos(a) * r, FLOOR, Math.sin(a) * r);
      cab.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
      cab.scale.setScalar(1.4);
      this.casinoGroup.add(cab);
    }
    // hogueras/braseros distantes: planos emisivos que miran a la cámara y parpadean
    this.fires = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.15, r = 13 + (i % 4) * 4;
      const fire = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.4),
        new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0,
          depthWrite: false, blending: THREE.AdditiveBlending }));
      fire.position.set(Math.cos(a) * r, FLOOR + 1.5, Math.sin(a) * r);
      this.casinoGroup.add(fire); this.fires.push(fire);
    }
    // brasas que suben (partículas billboard)
    this.emberList = [];
    for (let i = 0; i < 44; i++) {
      const e = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.09),
        new THREE.MeshBasicMaterial({ color: 0xffab3a, transparent: true, opacity: 0,
          depthWrite: false, blending: THREE.AdditiveBlending }));
      const rr = 6 + Math.random() * 16, aa = Math.random() * Math.PI * 2;
      e.position.set(Math.cos(aa) * rr, FLOOR + Math.random() * 6, Math.sin(aa) * rr);
      e.userData.spd = 0.6 + Math.random() * 1.4;
      this.casinoGroup.add(e); this.emberList.push(e);
    }
    // luz cálida global del incendio (sube durante el reveal)
    this.casinoFire = new THREE.PointLight(0xff5a1e, 0, 45, 1.0);
    this.casinoFire.position.set(0, 3, 0);
    this.scene.add(this.casinoFire);
    this.scene.add(this.casinoGroup);

    // ---- objetos (izquierda) y reliquias (derecha) del jugador local sobre la
    // mesa; hover los levanta/resalta y click usa el objeto. Reliquias ajenas en
    // 3D solo si tenés el Ojo del Vidente. ----
    this.myItems = new THREE.Group(); this.scene.add(this.myItems);
    this.myRelics = new THREE.Group(); this.scene.add(this.myRelics);
    this.othersRelics = new THREE.Group(); this.scene.add(this.othersRelics);
    this.hovered = null; this.onUseItem = null;
    this._invKey = ""; this._relKey = ""; this._othKey = "";

    this.seatObjs = new Map();
    this.seatWorld = new Map();
    this.dolls = new Map();        // seat -> {group, head} (Muñeca Maldita al lado del dueño)
    this.mySeat = null; this.holderSeat = null;
    this.targetBoxScale = 1; this.casinoActive = false; this.casinoLevel = 0;
    this.stage = null;            // 'slots' | 'revolver' | 'briefcase' | null
    this.state = null;
    this.clock = new THREE.Clock();
    this.fx = [];                 // partículas (sangre / explosión)
    this.fxGroup = new THREE.Group(); this.scene.add(this.fxGroup);
    this.shakeT = 0; this.shakeAmp = 0;

    // interacción con el mouse
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.grab = null;
    this.onSpin = null; this.onPull = null;
    const cv = this.renderer.domElement;
    cv.addEventListener("pointerdown", (e) => this._down(e));
    window.addEventListener("pointermove", (e) => this._move(e));
    window.addEventListener("pointerup", (e) => this._up(e));

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() { sizeLowRes(this.renderer, this.camera, 540); }

  seatPos(k, n) {
    const a = -Math.PI / 2 + (k / n) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * RSEAT, 0, Math.sin(a) * RSEAT);
  }

  // ---------------- estado ----------------
  update(state) {
    const prevPhase = this.state ? this.state.phase : null;
    this.state = state;
    this.mySeat = state.you.seat;
    const cur = state.current;
    this.holderSeat = cur ? cur.holderSeat : (state.roulette ? state.roulette.holderSeat : null);
    this.targetBoxScale = 0.9 + Math.min(8, state.menace || 0) * 0.02;
    this.casinoActive = state.phase === "CASINO";

    const seats = state.seats.slice().sort((a, b) => a.seat - b.seat);
    const n = seats.length;
    const present = new Set(seats.map((s) => s.seat));
    for (const [seat, obj] of this.seatObjs)
      if (!present.has(seat)) { this.scene.remove(obj.group); this.seatObjs.delete(seat); }
    seats.forEach((s, k) => {
      const pos = this.seatPos(k, n);
      this.seatWorld.set(s.seat, pos);
      const isMe = s.seat === this.mySeat;
      let obj = this.seatObjs.get(s.seat);
      if (!obj) {
        const group = new THREE.Group();
        const figure = this.assets.spawn("character", {
          animOffset: Math.random() * 2, playbackRate: 0.9 + Math.random() * 0.2,
          onReady: (inner) => { if (!inner) figure.add(makeFigure(0x222230)); },
        });
        const placard = makePlacard(); placard.position.y = 1.62;
        // anillo emisivo que marca al sostenedor (el GLB no trae "rim")
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 6, 24),
          new THREE.MeshBasicMaterial({ color: 0xe8b04b }));
        ring.rotation.x = Math.PI / 2; ring.position.y = 0.03; ring.visible = false;
        // sin silla procedural: el modelo del personaje ya viene sentado con su silla
        group.add(figure, placard, ring);
        this.scene.add(group);
        obj = { group, figure, placard, ring };
        this.seatObjs.set(s.seat, obj);
      }
      obj.group.position.set(pos.x, 0, pos.z);
      obj.group.rotation.y = Math.atan2(-pos.x, -pos.z);
      obj.figure.visible = !isMe;
      const isHolder = this.holderSeat === s.seat;
      obj.ring.visible = isHolder && !isMe;
      paintPlacard(obj.placard, { name: s.name, hp: s.hp, coins: s.chips, holder: isHolder,
        dead: !s.alive, connected: s.connected });
      obj.placard.visible = !isMe;
      if (isMe) {
        const out = pos.clone().multiplyScalar((RSEAT + 0.55) / RSEAT);
        this.camBase = new THREE.Vector3(out.x, CAM_Y, out.z);
      }
    });

    // muñecas malditas: una al lado del asiento de cada dueño (todos las ven)
    this._layoutDolls(seats);

    // objetos (izq) / reliquias (der) del jugador local + reliquias ajenas (con Ojo)
    this._layoutInventory(state, seats, n);

    // CRT segun fase
    if (state.phase === "SPIN") this.crtMode = "spin";
    else if (ACT_ICON[state.phase]) { this.crtMode = "act"; this.crtActivity = state.phase; }
    else if (state.phase === "CASINO") this.crtMode = "casino";
    else this.crtMode = "idle";

    // objeto flotante (OBJETOS): SIEMPRE una caja misteriosa (el objeto está cerrado)
    const objType = state.phase === "OBJETOS" && cur ? "mystery" : null;
    if (objType !== this.objType) {
      if (this.objectProp) { this.scene.remove(this.objectProp); this.objectProp = null; }
      if (objType) { this.objectProp = makeMysteryBox(); this.scene.add(this.objectProp); }
      this.objType = objType;
    }

    // ---- escenario segun actividad ----
    const newStage = state.phase === "SLOTS" ? "slots"
      : state.phase === "ROULETTE" ? "revolver"
      : state.phase === "MARKET" ? "briefcase" : null;
    this.stage = newStage;
    this.slot.visible = newStage === "slots";
    this.revolver.visible = newStage === "revolver";
    this.briefcase.visible = newStage === "briefcase";

    // SLOTS: preparar rodillos
    if (newStage === "slots") {
      const mine = state.you.myReels;
      if (mine && !this._reelsSet) {
        this._reelsSet = true;
        mine.reels.forEach((sym, i) => {
          const idx = Math.max(0, SLOT_SYMS.indexOf(sym));
          this.reelState[i].phase = "spin";
          this.reelState[i].target = idx / SLOT_SYMS.length;
          this.reelState[i].land = this.clock.elapsedTime + 0.4 + i * 0.45;
        });
      }
    } else { this._reelsSet = false; }

    // ROULETTE: detectar disparo (cambia holder o reward) -> girar tambor
    if (newStage === "revolver") {
      const key = state.roulette ? state.roulette.holderSeat + ":" + state.roulette.reward : "";
      if (key !== this._rrKey) { this._rrKey = key; this.cylSpin = 6.0; }
    }

    // MARKET: al entrar, tirar el maletín y armar los objetos
    if (newStage === "briefcase") {
      if (prevPhase !== "MARKET") { this.caseAnim = 0; }
      const stock = state.market ? state.market.stock : [];
      const key = stock.map((o) => o.kind + o.id).join(",");
      if (key !== this.caseStockKey) {
        this.caseStockKey = key;
        while (this.caseItems.children.length) this.caseItems.remove(this.caseItems.children[0]);
        stock.forEach((o, i) => {
          let m;
          if (o.kind === "relic") {
            m = this._relicMesh(o.id);
          } else {
            m = this._itemMesh(o.id);
          }
          const spread = (i - (stock.length - 1) / 2) * 0.34;
          m.position.set(spread, 0.4, 0.1);
          m.scale.setScalar(0.9);
          m.userData.baseX = spread;
          this.caseItems.add(m);
        });
      }
    } else { this.caseStockKey = ""; }
  }

  // Devuelve el prop 3D de un objeto: GLB del usuario / carta PNG 3D / procedural.
  _itemMesh(type) {
    if (this.assets.has(type))
      return this.assets.spawn(type, { onReady: (inner, holder) => { if (!inner) holder.add(makeItem(type)); } });
    if (this.assets.hasCard(type)) return this.assets.card(type);
    return makeItem(type);
  }

  _relicMesh(id) {
    if (id === "muneca") return makeDoll().group;   // muñeca procedural (ver models.js)
    return this.assets.has(id)
      ? this.assets.spawn(id, { onReady: (inner, holder) => { if (!inner) holder.add(makeRelic(id)); } })
      : makeRelic(id);
  }

  // Muñeca Maldita: prop al lado del asiento de cada dueño. La cabeza rota cada
  // frame (en render) para seguir con la mirada al jugador de turno.
  _layoutDolls(seats) {
    const want = new Set(seats.filter((s) => s.hasDoll).map((s) => s.seat));
    for (const [seat, d] of this.dolls)
      if (!want.has(seat)) { this.scene.remove(d.group); this.dolls.delete(seat); }
    for (const s of seats) {
      if (!s.hasDoll) continue;
      const pos = this.seatWorld.get(s.seat);
      if (!pos) continue;
      let d = this.dolls.get(s.seat);
      if (!d) {
        const md = makeDoll();
        this.scene.add(md.group);
        d = { group: md.group, head: md.head };
        this.dolls.set(s.seat, d);
      }
      const inward = pos.clone().setY(0).multiplyScalar(2.15 / RSEAT);
      const tang = new THREE.Vector3(pos.z, 0, -pos.x).normalize();
      d.group.position.set(inward.x + tang.x * 0.72, 0, inward.z + tang.z * 0.72);
    }
  }

  // Coloca en 3D sobre la mesa: objetos del jugador (izquierda), reliquias (derecha),
  // y las reliquias ajenas (solo si el server las manda: tenés el Ojo del Vidente).
  _layoutInventory(state, seats, n) {
    if (!this.camBase) return;
    const inv = state.you.inventory || [];
    const rel = state.you.relics || [];
    const fwd = new THREE.Vector3(-this.camBase.x, 0, -this.camBase.z).normalize();
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    // hacia ADELANTE sobre la mesa (hacia el centro), bien a la vista y sin cortarse
    const anchor = new THREE.Vector3(this.camBase.x, 0, this.camBase.z).addScaledVector(fwd, 2.0);

    const invKey = inv.map((o) => o.uid).join(",");
    if (invKey !== this._invKey) {
      this._invKey = invKey;
      this._rebuildTableGroup(this.myItems, inv.map((o) => ({ ...o, kind: "object" })), 1.0);
    }
    // la muñeca NO va en la fila de reliquias: se muestra como el prop al lado del asiento
    const relShown = rel.filter((r) => r.id !== "muneca");
    const relKey = relShown.map((r) => r.id).join(",");
    if (relKey !== this._relKey) {
      this._relKey = relKey;
      this._rebuildTableGroup(this.myRelics, relShown.map((r) => ({ ...r, kind: "relic" })), 1.1);
    }
    this._placeRow(this.myItems, anchor, right, -1);
    this._placeRow(this.myRelics, anchor, right, +1);

    // reliquias ajenas
    const others = seats.filter((s) => s.seat !== this.mySeat && (s.relicIds || []).length);
    const othKey = others.map((s) => s.seat + ":" + s.relicIds.join("-")).join("|");
    if (othKey !== this._othKey) {
      this._othKey = othKey;
      while (this.othersRelics.children.length) this.othersRelics.remove(this.othersRelics.children[0]);
      others.forEach((s) => {
        const pos = this.seatWorld.get(s.seat);
        if (!pos) return;
        const f = new THREE.Vector3(-pos.x, 0, -pos.z).normalize();
        const r = new THREE.Vector3(f.z, 0, -f.x);
        const a = pos.clone().setY(0).addScaledVector(f, 0.8);
        const ids = s.relicIds.filter((id) => id !== "muneca");   // muñeca = prop al lado
        ids.forEach((id, i) => {
          const m = this._relicMesh(id);
          m.scale.setScalar(1.3);
          const off = (i - (ids.length - 1) / 2) * 0.32;
          m.position.set(a.x + r.x * off, 0.16, a.z + r.z * off);
          this.othersRelics.add(m);
        });
      });
    }
  }

  _rebuildTableGroup(group, list, baseScale) {
    while (group.children.length) {
      const c = group.children[0];
      this.assets.release(c);
      group.remove(c);
    }
    let i = 0;
    for (const entry of list) {
      const m = entry.kind === "object" ? this._itemMesh(entry.type) : this._relicMesh(entry.id);
      // orientación de reposo FIJA (no giran): cada objeto "posado" a un ángulo distinto
      const rest = 0.5 + i * 1.7;
      m.userData = Object.assign(m.userData || {}, {
        kind: entry.kind, uid: entry.uid, type: entry.type, target: entry.target, relicId: entry.id,
        baseScale, baseY: 0.16, rest, hover: false,
      });
      m.position.set(0, 0.16, 0);
      m.rotation.y = rest;
      m.scale.setScalar(baseScale);
      group.add(m);
      i++;
    }
  }

  _placeRow(group, anchor, right, side) {
    // más separación para que no se amontonen y puedas elegir cada uno
    group.children.forEach((m, i) => {
      const off = side * (0.5 + i * 0.52);
      m.position.x = anchor.x + right.x * off;
      m.position.z = anchor.z + right.z * off;
    });
  }

  // Devuelve el hijo de nivel superior (holder) golpeado por el rayo, o null.
  _pickItem(groups) {
    const objs = [];
    for (const g of groups) for (const c of g.children) objs.push(c);
    if (!objs.length) return null;
    const hits = this.raycaster.intersectObjects(objs, true);
    if (!hits.length) return null;
    const set = new Set(objs);
    let o = hits[0].object;
    while (o && !set.has(o)) o = o.parent;
    return o || null;
  }

  // ---------------- interacción mouse ----------------
  _setNdc(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);
  }
  _hits(objs) { return this.raycaster.intersectObjects(objs, true).length > 0; }

  _down(e) {
    if (!this.state) return;
    this._setNdc(e);
    const you = this.state.you;
    if (this.stage === "slots" && you.canSpin && !this.leverLocked) {
      if (this._hits([this.slot.userData.knob, this.slot.userData.lever])) {
        this.grab = { mode: "lever", startY: e.clientY, fired: false };
      }
    } else if (this.stage === "revolver" && you.rouletteTurn) {
      if (this._hits([this.revolver])) {
        this.grab = { mode: "trigger" };
      }
    } else {
      // click sobre un objeto propio de la mesa -> usarlo
      const hit = this._pickItem([this.myItems]);
      if (hit && hit.userData.kind === "object") this.grab = { mode: "useItem", obj: hit };
    }
  }
  _move(e) {
    if (this.grab && this.grab.mode === "lever") {
      const dy = e.clientY - this.grab.startY;
      this.leverPull = Math.max(0, Math.min(1, dy / 150));
      if (this.leverPull >= 0.92 && !this.grab.fired) {
        this.grab.fired = true;
        this.leverLocked = true;
        this.onSpin && this.onSpin();
        this._spinReels();
      }
      return;
    }
    // hover: resaltar objeto/reliquia bajo el cursor
    this._setNdc(e);
    const hit = this._pickItem([this.myItems, this.myRelics]);
    if (hit !== this.hovered) {
      if (this.hovered) this.hovered.userData.hover = false;
      this.hovered = hit;
      if (hit) hit.userData.hover = true;
      this.renderer.domElement.style.cursor =
        hit && hit.userData.kind === "object" ? "pointer" : hit ? "help" : "";
    }
  }
  _up(e) {
    if (!this.grab) return;
    if (this.grab.mode === "lever" && !this.grab.fired) {
      this.leverPull = 0; // volvió sin llegar
    } else if (this.grab.mode === "trigger") {
      this._setNdc(e);
      if (this._hits([this.revolver])) {
        this.cylSpin = 8.0;
        this.onPull && this.onPull();
      }
    } else if (this.grab.mode === "useItem") {
      this._setNdc(e);
      const hit = this._pickItem([this.myItems]);
      if (hit === this.grab.obj && this.onUseItem) this.onUseItem(this.grab.obj.userData.uid);
    }
    this.grab = null;
  }

  _spinReels() {
    for (const rs of this.reelState) { rs.phase = "freespin"; }
  }

  // punto donde ocurren los efectos (cerca de la caja / centro de la mesa)
  _fxOrigin() {
    if (this.stage === "revolver" && this.revolver.visible)
      return this.revolver.position.clone();
    return new THREE.Vector3(0, 1.25, 0);
  }
  _spawnParticles(origin, n, color, speed, gravity, sizeR, life) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sizeR, sizeR, sizeR),
        new THREE.MeshBasicMaterial({ color }));
      m.position.copy(origin);
      const dir = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      const v = dir.multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      this.fxGroup.add(m);
      this.fx.push({ m, v, g: gravity, life, max: life });
    }
  }
  bloodBurst() {
    const o = this._fxOrigin();
    this._spawnParticles(o, 60, 0x9a1010, 4.0, 7.0, 0.05, 1.2);
    this._spawnParticles(o, 20, 0xd94b3a, 3.0, 6.0, 0.04, 1.0);
    this.shakeT = 0.5; this.shakeAmp = 0.12;
    this.cylSpin = 12.0;
  }
  explode() {
    const o = this._fxOrigin();
    // destello
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd08a, transparent: true, opacity: 0.9 }));
    flash.position.copy(o); this.fxGroup.add(flash);
    this.fx.push({ m: flash, v: new THREE.Vector3(), g: 0, life: 0.35, max: 0.35, flash: true });
    this._spawnParticles(o, 40, 0xff7b2a, 5.0, 2.0, 0.06, 0.7);
    this._spawnParticles(o, 30, 0x555555, 3.0, 1.0, 0.07, 1.0);
    this._spawnParticles(o, 16, 0xffe08a, 6.0, 1.0, 0.05, 0.5);
    this.shakeT = 0.6; this.shakeAmp = 0.2;
  }
  revolverBang() { this.bloodBurst(); }

  // ---------------- posicionar props en vista ----------------
  _placeInView(prop, dist, ox, oy, k) {
    const cam = this.camera;
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
    const rup = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const target = cam.position.clone()
      .add(fwd.multiplyScalar(dist)).add(right.multiplyScalar(ox)).add(rup.multiplyScalar(oy));
    prop.position.lerp(target, k);
    prop.lookAt(cam.position);
  }

  _drawCRT() {
    const ctx = this.crtCanvas.getContext("2d");
    const W = this.crtCanvas.width, H = this.crtCanvas.height, t = this.clock.elapsedTime;
    ctx.fillStyle = "#0a0410"; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (this.crtMode === "spin") {
      drawIcon(ctx, WHEEL[Math.floor(t * 14) % WHEEL.length], W / 2, H / 2 - 2, 54, "#e8b04b");
    } else if (this.crtMode === "act") {
      drawIcon(ctx, ACT_ICON[this.crtActivity] || "question", W / 2, H / 2 - 10, 50, "#e8b04b");
      ctx.font = "11px 'Courier New',monospace"; ctx.fillStyle = "#b07bd1";
      ctx.fillText(this.crtActivity || "", W / 2, H - 13);
    } else if (this.crtMode === "casino") {
      drawIcon(ctx, "horns", W / 2, H / 2, 48, "#d94b3a");
    } else {
      ctx.font = "bold 16px 'Courier New',monospace";
      ctx.fillStyle = Math.sin(t * 6) > -0.3 ? "#d94b3a" : "#3a1418";
      ctx.fillText("BLACKBOX", W / 2, H / 2);
    }
    const ry = (t * 60) % H;
    ctx.fillStyle = "rgba(255,255,255,.06)"; ctx.fillRect(0, ry, W, 6);
    ctx.fillStyle = "rgba(0,0,0,.28)";
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    this.crtTex.needsUpdate = true;
  }

  // ---------------- ambiente del salón ----------------
  // Anima lámparas (flicker + balanceo), neones apagados, humo, espectadores y
  // la luz roja del fondo. La lámpara central maneja la luz de la mesa/caja.
  _animateRoom(t, dt) {
    const A = this.room && this.room.userData.anim;
    if (!A) return;
    const cam = this.camera.position;
    let fl = 1;
    A.lamps.forEach((l, i) => {
      const u = l.userData;
      const f = 0.9 + Math.sin(t * 6 + u.phase) * 0.05 + (Math.random() < 0.015 ? -0.22 : 0);
      u.inner.material.opacity = 0.1 + 0.28 * f;
      u.glow.material.opacity = 0.16 * f;
      u.glow.lookAt(cam.x, l.position.y + u.glow.position.y, cam.z);
      l.position.x = u.baseX + Math.sin(t * 0.5 + u.phase) * 0.04;
      l.position.z = u.baseZ + Math.cos(t * 0.4 + u.phase) * 0.03;
      if (i === 0) fl = f;
    });
    this.tableLight.intensity = this._tableLight0 * fl;
    this.feltLight.intensity = this._feltLight0 * (0.92 + Math.sin(t * 4) * 0.06);
    for (const n of A.neons) {
      const spark = Math.sin(t * 0.7 + n.userData.phase) > 0.93 || Math.random() < 0.008;
      n.userData.mat.opacity = spark ? 0.55 : 0.12 + Math.sin(t * 3 + n.userData.phase) * 0.03;
    }
    for (const s of A.spectators) {
      s.position.y = s.userData.baseY + Math.sin(t * s.userData.sway + s.userData.phase) * 0.03;
      s.lookAt(cam.x, s.position.y, cam.z);
    }
    for (const sm of A.smokes) {
      const u = sm.userData;
      sm.position.y += u.drift * dt;
      if (sm.position.y > FLOOR + 5) sm.position.y = FLOOR + 0.3;
      u.roll = (u.roll || 0) + u.spin * dt;
      sm.material.opacity = u.maxOp * (0.5 + 0.5 * Math.sin(t * 0.5 + u.phase));
      sm.lookAt(cam.x, sm.position.y, cam.z);
      sm.rotation.z = u.roll;
    }
    for (const rl of A.redLights) rl.intensity = 0.42 + Math.sin(t * 1.2 + rl.position.x) * 0.16;
  }

  // ---------------- render ----------------
  render() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    this.assets.update(dt);   // avanza las animaciones de los modelos riggeados

    if (this.camBase) {
      let sx = 0, sy = 0, sz = 0;
      if (this.shakeT > 0) {
        this.shakeT -= dt;
        const a = this.shakeAmp * Math.max(0, this.shakeT / 0.6);
        sx = (Math.random() * 2 - 1) * a; sy = (Math.random() * 2 - 1) * a; sz = (Math.random() * 2 - 1) * a;
      }
      this.camera.position.set(
        this.camBase.x + Math.sin(t * 0.7) * 0.02 + sx,
        this.camBase.y + Math.sin(t * 1.3) * 0.015 + sy,
        this.camBase.z + Math.cos(t * 0.5) * 0.02 + sz);
      this.camera.lookAt(LOOK);
    }

    this.box.scale.setScalar(THREE.MathUtils.lerp(this.box.scale.x || 1, this.targetBoxScale, 0.05));
    const pulse = 0.55 + Math.sin(t * 3) * 0.25;
    if (this.boxSlot) this.boxSlot.material.color.setRGB(pulse * 0.85, pulse * 0.29, pulse * 0.23);
    if (this.box.userData.eye)
      this.box.userData.eye.material.color.setRGB(0.1, 0.3 + pulse * 0.3, 0.4 + pulse * 0.3);
    this._drawCRT();
    // El TvBox gira para que su PANTALLA (mira a +Z local) apunte a la cámara local,
    // igual que antes hacía el billboard, pero ahora es la pantalla real del modelo.
    this.box.rotation.y = Math.atan2(this.camera.position.x, this.camera.position.z);

    // partículas (sangre/explosión)
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.life -= dt;
      if (f.flash) {
        f.m.scale.setScalar(1 + (1 - f.life / f.max) * 3.2);
        f.m.material.opacity = Math.max(0, (f.life / f.max) * 0.9);
      } else {
        f.v.y -= f.g * dt;
        f.m.position.addScaledVector(f.v, dt);
        f.m.scale.setScalar(Math.max(0.01, f.life / f.max));
      }
      if (f.life <= 0) { this.fxGroup.remove(f.m); this.fx.splice(i, 1); }
    }

    if (this.objectProp) {
      this.objectProp.position.set(0, 2.2 + Math.sin(t * 2) * 0.06, 0);
      this.objectProp.rotation.y = t * 0.8; this.objectProp.scale.setScalar(1.5);
    }

    // ---- SLOTS ----
    if (this.stage === "slots") {
      this._placeInView(this.slot, 1.35, 0.05, -0.2 + Math.sin(t) * 0.02, 0.14);
      this.slot.scale.setScalar(THREE.MathUtils.lerp(this.slot.scale.x || 0.2, 0.72, 0.12));
      // rodillos
      const N = SLOT_SYMS.length;
      this.reelState.forEach((rs, i) => {
        if (rs.phase === "freespin") { rs.o = (rs.o + dt * 5) % 1; if (rs.target != null && t >= rs.land && rs.land) rs.phase = "spin"; }
        else if (rs.phase === "spin") {
          if (t < rs.land) rs.o = (rs.o + dt * 5) % 1;
          else {
            let d = (rs.target - rs.o + 1) % 1;
            rs.o = (rs.o + Math.min(d, dt * 2.5)) % 1;
            if (Math.abs(((rs.target - rs.o + 1) % 1)) < 0.008) { rs.o = rs.target; rs.phase = "idle"; }
          }
        }
        this.slot.userData.reels[i].tex.offset.y = rs.o;
      });
      // palanca
      this.slot.userData.lever.rotation.x = this.leverPull * 1.35;
      if (this.leverLocked && this.reelState.every((r) => r.phase === "idle")) {
        this.leverPull = THREE.MathUtils.lerp(this.leverPull, 0, 0.15);
        if (this.leverPull < 0.02) { this.leverLocked = false; this.leverPull = 0; }
      }
      if (this.slot.userData.marqueeLight)
        this.slot.userData.marqueeLight.material.color.setRGB(0.9, 0.5 + Math.sin(t * 6) * 0.4, 0.2);
    } else { this.slot.scale.setScalar(0.2); this.leverPull = 0; this.leverLocked = false; }

    // ---- ROULETTE ----
    if (this.stage === "revolver") {
      const mine = this.state && this.state.you.rouletteTurn;
      if (mine) { this._placeInView(this.revolver, 1.55, 0.34, 0.02 + Math.sin(t * 1.5) * 0.02, 0.12); this.revolver.scale.setScalar(THREE.MathUtils.lerp(this.revolver.scale.x || 0.2, 1.0, 0.12)); }
      else {
        const hp = this.holderSeat != null ? this.seatWorld.get(this.holderSeat) : null;
        this.revolver.position.lerp(new THREE.Vector3(0, 1.55 + Math.sin(t * 2) * 0.03, 0.15), 0.1);
        if (hp) this.revolver.rotation.set(0, Math.atan2(hp.x, hp.z), 0);
        this.revolver.scale.setScalar(THREE.MathUtils.lerp(this.revolver.scale.x || 0.2, 0.7, 0.1));
      }
      if (this.cylSpin > 0) { this.revolver.rotateX(-this.cylSpin * dt * 2.2); this.cylSpin *= 0.86; }
    } else { this.revolver.scale.setScalar(0.2); }

    // ---- MARKET (maletín que cae del cielo hacia vos) ----
    if (this.stage === "briefcase") {
      this.caseAnim = Math.min(1, this.caseAnim + dt * 0.8);
      const a = this.caseAnim;
      const cam = this.camera;
      const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
      const up = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
      const rup = new THREE.Vector3().crossVectors(right, fwd).normalize();
      const anchor = cam.position.clone().add(fwd.multiplyScalar(1.6)).add(rup.multiplyScalar(-0.28));
      const drop = a < 0.45 ? (1 - (a / 0.45) * (a / 0.45)) * 4.5
        : Math.abs(Math.sin((a - 0.45) * 9)) * 0.16 * Math.max(0, 1 - (a - 0.45) * 3);
      this.briefcase.position.lerp(new THREE.Vector3(anchor.x, anchor.y + drop, anchor.z), 0.3);
      this.briefcase.lookAt(cam.position.x, this.briefcase.position.y, cam.position.z);
      this.briefcase.scale.setScalar(1.15);
      const lidOpen = Math.max(0, Math.min(1, (a - 0.5) / 0.35));
      this.briefcase.userData.lid.rotation.x = -lidOpen * 2.0;
      if (this.briefcase.userData.glow) this.briefcase.userData.glow.material.opacity = lidOpen * 0.5;
      this.caseItems.children.forEach((m, i) => {
        m.visible = lidOpen > 0.3;
        m.position.y = 0.32 + lidOpen * 0.28 + Math.sin(t * 2 + i) * 0.04;
        m.rotation.y = t * 0.9 + i;
      });
    }

    // ---- ambiente del salón (lámparas / neones / humo / espectadores) ----
    this._animateRoom(t, dt);

    // ---- reveal del casino: se abre un salón inmenso en llamas ----
    const target = this.casinoActive ? 1 : 0;
    this.casinoLevel = THREE.MathUtils.lerp(this.casinoLevel, target, this.casinoActive ? 0.25 : 0.12);
    const lv = this.casinoLevel;
    this.casinoGroup.visible = lv > 0.02;
    this.ambient.intensity = 0.4 + lv * 0.9;
    this.tableLight.intensity += lv * 1.2;   // el fuego suma brillo (sobre el flicker)
    this.casinoFire.intensity = lv * 6.0;
    // la niebla se abre y se tiñe de rojo -> profundidad enorme e incendio
    this.scene.fog.far = 19 + lv * 60;
    this.scene.fog.color.setRGB(0.02 + lv * 0.17, 0.008 + lv * 0.03, 0.016 * (1 - lv) + lv * 0.02);
    this.renderer.setClearColor(this.scene.fog.color, 1);
    if (lv > 0.02) {
      for (const fire of this.fires) {
        fire.lookAt(this.camera.position);
        const f = 0.6 + Math.sin(t * 12 + fire.position.x * 3) * 0.4;
        fire.material.opacity = (0.45 + f * 0.55) * lv;
        fire.scale.set(1, 0.8 + f * 0.4, 1);
      }
      for (const e of this.emberList) {
        e.position.y += e.userData.spd * dt;
        if (e.position.y > FLOOR + 7) e.position.y = FLOOR + 0.2;
        e.material.opacity = lv * (0.35 + Math.random() * 0.35);
        e.lookAt(this.camera.position);
      }
      for (const c of this.casinoGroup.children) if (c.userData.light) {
        const f = 0.5 + Math.sin(t * 8 + c.position.x) * 0.5;
        c.userData.light.material.color.setRGB(0.85 * f, 0.2, 0.25);
      }
    }

    let i = 0;
    for (const obj of this.seatObjs.values()) { obj.figure.position.y = Math.sin(t * 1.1 + i) * 0.015; i++; }

    // muñecas: la cabeza sigue con la mirada al jugador de turno (o a la caja en reposo)
    for (const [seat, d] of this.dolls) {
      const tw = this.holderSeat != null ? this.seatWorld.get(this.holderSeat) : null;
      const tx = tw ? tw.x : 0, tz = tw ? tw.z : 0;
      const yaw = Math.atan2(tx - d.group.position.x, tz - d.group.position.z);
      let dy = yaw - d.head.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));   // camino más corto
      d.head.rotation.y += dy * 0.12;
      d.head.rotation.z = Math.sin(t * 1.3 + seat) * 0.06;   // ladeo espeluznante
    }

    // objetos/reliquias sobre la mesa: girito lento + hover que levanta y agranda
    const showInv = this.state && this.state.phase !== "CASINO" && this.state.phase !== "SPIN";
    this.myItems.visible = showInv; this.myRelics.visible = showInv; this.othersRelics.visible = showInv;
    if (showInv) {
      // apoyados y quietos; SOLO al pasar el mouse se levantan un poco y se agrandan
      for (const g of [this.myItems, this.myRelics]) {
        for (const m of g.children) {
          const ty = m.userData.baseY + (m.userData.hover ? 0.14 : 0);
          m.position.y = THREE.MathUtils.lerp(m.position.y, ty, 0.25);
          const ts = (m.userData.baseScale || 1) * (m.userData.hover ? 1.22 : 1);
          m.scale.setScalar(THREE.MathUtils.lerp(m.scale.x, ts, 0.25));
        }
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}
