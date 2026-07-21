// assets.js — carga los modelos 3D (.glb) que hizo el usuario desde /assets.
//
// - Cachea cada .glb (una sola descarga) y CLONA por instancia.
// - Las mallas riggeadas (personaje sentado / demonio bailando) se clonan con
//   SkeletonUtils para no romper el esqueleto, y reciben su propio AnimationMixer.
// - Auto-normaliza cada modelo: mide su bounding box y lo escala a un tamaño
//   objetivo + lo ancla en y=0 (así no dependemos de la escala con la que se
//   exportó desde Blender/Tripo).
import * as THREE from "three";
import { GLTFLoader } from "/vendor/addons/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "/vendor/addons/utils/SkeletonUtils.js";

// Manifiesto por clave lógica:
//   url     -> ruta del .glb
//   fit     -> 'max' (dimensión mayor) | 'y' (altura): a qué eje ajustar `size`
//   size    -> tamaño objetivo en unidades de mundo, tras normalizar (modo bbox)
//   scale   -> ESCALA FIJA explícita; si está, ignora fit/size. Necesario para los
//              modelos riggeados: su bbox en bind-pose es un blob diminuto y no
//              refleja el tamaño real animado, así que no sirve para auto-escalar.
//   anchor  -> 'center' | 'bottom' | 'top': dónde queda el y=0 del holder
//   offsetY -> corrección vertical extra tras anclar (afinar pies riggeados)
//   rot     -> [rx,ry,rz] radianes extra (para orientar el modelo)
//   anim    -> reproducir su primera animación en loop
const A = "/assets/";
const R = A + "Reliquias/";
export const MANIFEST = {
  table:     { url: A + "Table.glb",                 fit: "max", size: 6.0,  anchor: "top",    rot: [0, 0, 0] },
  box:       { url: A + "TvBox.glb",                  fit: "y",   size: 1.7,  anchor: "bottom", rot: [0, 0, 0] },
  character: { url: A + "CharacterWithAnimation.glb", scale: 6.8, anchor: "bottom", offsetY: 0, rot: [0, 0, 0], anim: true },
  demon:     { url: A + "DemonioBailando.glb",        scale: 4.8, anchor: "bottom", offsetY: 0, rot: [0, 0, 0], anim: true },
  revolver:  { url: A + "Revolver.glb",               fit: "max", size: 1.0,  anchor: "center", rot: [0, 0, 0] },
  // items que el usuario modeló (reemplazan a los procedurales de items3d.js)
  telefono:  { url: A + "Telefono.glb",               fit: "max", size: 0.44, anchor: "center", rot: [0, 0, 0] },
  bolsa:     { url: A + "Bolsa.glb",                   fit: "max", size: 0.42, anchor: "center", rot: [0, 0, 0] },
  // reliquias (ids que usa el engine)
  ojo:       { url: R + "Ojo del vidente.glb",        fit: "max", size: 0.34, anchor: "center", rot: [0, 0, 0] },
  diente:    { url: R + "Diente De Oro.glb",          fit: "max", size: 0.32, anchor: "center", rot: [0, 0, 0] },
  cuernos:   { url: R + "Cuernos de Satan.glb",       fit: "max", size: 0.34, anchor: "center", rot: [0, 0, 0] },
  tahur:     { url: R + "Mano del tahur.glb",         fit: "max", size: 0.36, anchor: "center", rot: [0, 0, 0] },
  mascara:   { url: R + "MascaraDeLosHorrores.glb",   fit: "max", size: 0.34, anchor: "center", rot: [0, 0, 0] },
  // reliquias nuevas
  sombrero:  { url: R + "SombreroDelDesquiciado.glb", fit: "max", size: 0.38, anchor: "center", rot: [0, 0, 0] },
  // La Muñeca es un modelo RIGGEADO (bind-pose chico) -> escala explícita como el
  // personaje. Se usa como prop grande al lado del asiento del dueño.
  muneca:    { url: R + "MuñecaMaldita.glb",          scale: 3.4, anchor: "bottom", rot: [0, 0, 0] },
  camara:    { url: R + "CamaraInstantanea.glb",      fit: "max", size: 0.34, anchor: "center", rot: [0, 0, 0] },
};

// Items que el usuario entregó como PNG (con alpha): se muestran como una carta 3D
// (plano doble-cara con la textura) que gira en el espacio.
export const CARDS = {
  comodin:   { url: A + "Comodin.png",   height: 0.3 },
  maldicion: { url: A + "Maldicion.png", height: 0.3 },
};

export class Assets {
  constructor() {
    this.loader = new GLTFLoader();
    this.texLoader = new THREE.TextureLoader();
    this.cache = new Map();  // key -> Promise<gltf>
    this.texCache = new Map(); // url -> Texture
    this.mixers = new Set(); // AnimationMixer activos (se avanzan en update)
  }

  has(key) { return key in MANIFEST; }
  hasCard(key) { return key in CARDS; }

  // Carta 3D: plano doble-cara con una textura PNG con alpha, ajustado a su aspecto.
  card(key) {
    const spec = CARDS[key] || { url: key, height: 0.5 };
    const h = spec.height || 0.5;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, toneMapped: false }));
    let tex = this.texCache.get(spec.url);
    const apply = (t) => {
      mesh.material.map = t; mesh.material.needsUpdate = true;
      const a = (t.image && t.image.width / t.image.height) || 0.66;
      mesh.scale.set(h * a, h, 1);
    };
    if (tex) { apply(tex); }
    else {
      this.texLoader.load(spec.url, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        this.texCache.set(spec.url, t); apply(t);
      });
    }
    return mesh;
  }

  _load(key) {
    if (this.cache.has(key)) return this.cache.get(key);
    const spec = MANIFEST[key];
    const p = spec
      ? new Promise((res, rej) => this.loader.load(spec.url, res, undefined, rej))
      : Promise.reject(new Error("asset desconocido: " + key));
    this.cache.set(key, p);
    return p;
  }

  // Precarga (opcional) para evitar el "pop-in" del primer frame.
  preload(keys) { return Promise.allSettled(keys.map((k) => this._load(k))); }

  // Devuelve YA un holder (Group) vacío que podés agregar a la escena; el modelo
  // se puebla cuando termina de cargar. onReady(inner, holder) se llama entonces
  // (inner=null si falló, para que el caller ponga un fallback procedural).
  spawn(key, { onReady, animOffset = 0, playbackRate = 1 } = {}) {
    const spec = MANIFEST[key];
    const holder = new THREE.Group();
    holder.userData.assetKey = key;
    this._load(key).then((gltf) => {
      const inner = _hasSkin(gltf.scene) ? skeletonClone(gltf.scene) : gltf.scene.clone(true);
      _normalize(inner, spec);
      _prep(inner);
      holder.add(inner);
      holder.userData.inner = inner;
      if (spec.anim && gltf.animations && gltf.animations.length) {
        const mixer = new THREE.AnimationMixer(inner);
        const action = mixer.clipAction(gltf.animations[0]);
        action.play();
        action.time = animOffset;
        mixer.timeScale = playbackRate;
        holder.userData.mixer = mixer;
        this.mixers.add(mixer);
      }
      holder.userData.ready = true;
      onReady && onReady(inner, holder);
    }).catch((err) => {
      console.warn("[assets] no cargó", key, err);
      holder.userData.error = true;
      onReady && onReady(null, holder);
    });
    return holder;
  }

  // Libera el mixer de un holder que sacaste de la escena.
  release(holder) {
    const m = holder && holder.userData && holder.userData.mixer;
    if (m) { m.stopAllAction(); this.mixers.delete(m); }
  }

  update(dt) { for (const m of this.mixers) m.update(dt); }
}

// ------------------------------------------------------------------ helpers --
function _hasSkin(obj) {
  let skin = false;
  obj.traverse((o) => { if (o.isSkinnedMesh) skin = true; });
  return skin;
}

function _prep(obj) {
  obj.traverse((o) => {
    if (o.isMesh) {
      // El bbox de un skinned deforma con la animación; sin culling evita popping.
      o.frustumCulled = false;
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
}

// Escala el modelo (fijo o por bbox) y lo ancla en y=0 según `anchor`.
function _normalize(obj, spec) {
  const [rx, ry, rz] = spec.rot || [0, 0, 0];
  obj.rotation.set(rx, ry, rz);
  obj.updateWorldMatrix(true, true);

  if (spec.scale) {
    obj.scale.multiplyScalar(spec.scale);
  } else {
    const box = new THREE.Box3().setFromObject(obj);
    const dim = new THREE.Vector3(); box.getSize(dim);
    const denom = spec.fit === "y" ? (dim.y || 1) : (Math.max(dim.x, dim.y, dim.z) || 1);
    obj.scale.multiplyScalar((spec.size || 1) / denom);
  }
  obj.updateWorldMatrix(true, true);

  const box = new THREE.Box3().setFromObject(obj);
  const c = new THREE.Vector3(); box.getCenter(c);
  obj.position.x -= c.x;
  obj.position.z -= c.z;
  if (spec.anchor === "bottom") obj.position.y -= box.min.y;
  else if (spec.anchor === "top") obj.position.y -= box.max.y;
  else obj.position.y -= c.y;
  obj.position.y += spec.offsetY || 0;
}
