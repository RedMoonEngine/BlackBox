// Orquestacion: conecta red + escena 3D + UI + audio.
import { Net } from "./net.js";
import { Audio } from "./audio.js";
import { UI } from "./ui.js";
import { SceneManager } from "./scene.js";

const canvas = document.getElementById("gl");
const scene = new SceneManager(canvas);
const audio = new Audio();
const net = new Net(onMsg, onOpen, onClose);
const ui = new UI(net, audio);

// interacciones 3D -> red
scene.onSpin = () => { audio.sfx("spin"); net.spin(); };
scene.onPull = () => { audio.sfx("revolver"); net.roulettePull(); };
scene.onUseItem = (uid) => ui.useObjectByUid(uid);

let lastPhase = null;
let haveState = false;

function glitch(secs) {
  document.body.classList.add("glitching");
  setTimeout(() => document.body.classList.remove("glitching"), (secs || 3) * 1000);
}

function onMsg(msg) {
  switch (msg.t) {
    case "joined":
      ui.onJoined(msg.seat);
      break;
    case "state":
      haveState = true;
      ui.update(msg);
      scene.update(msg);
      if (msg.phase !== lastPhase) {
        if (msg.phase === "SPIN") audio.sfx("spin");
        else if (msg.phase === "CASINO") audio.sfx("casino");
        else if (msg.phase === "OBJETOS" || msg.phase === "SLOTS") audio.sfx("deal");
        lastPhase = msg.phase;
      }
      break;
    case "reveal":
      ui.reveal(msg.reveals);
      for (const r of msg.reveals || []) {
        if (r.name === "Ruleta" && r.tone === "bad") { scene.revolverBang(); audio.sfx("gunshot"); ui.fxBlood(); }
        if ((r.name === "Bomba" || r.name === "Dinamita") && r.tone === "bad") { scene.explode(); audio.sfx("explosion"); ui.fxFlash(); }
      }
      break;
    case "phone":
      ui.phone(msg.line);
      break;
    case "glitch":
      glitch(msg.secs);
      break;
    case "error":
      ui.showError(msg.msg);
      break;
  }
}

function onOpen() { /* conectado */ }
function onClose() { /* Net reintenta solo si ya estabamos en sala */ }

// loop de render
function frame() {
  scene.render();
  if (haveState) ui.tickTimer();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

net.connect();

// tips rotativos abajo
const TIPS = [
  "apostás a ciegas… la ruleta decide a qué jugás.",
  "el teléfono nunca dice del todo la verdad.",
  "guardá objetos y usalos en el peor momento del otro.",
  "las reliquias son para siempre y cambian las reglas.",
  '"tomá, encontré plata." — capaz era una bomba.',
  "cuanto más agresivos, más se despierta el casino.",
  "entre rondas, mirá bien: el casino te observa.",
];
let tipI = 0;
const tipsEl = document.getElementById("tips");
function rotateTip() {
  tipsEl.textContent = "▘ " + TIPS[tipI % TIPS.length] + " ▝";
  tipI++;
}
rotateTip();
setInterval(rotateTip, 8000);

// exponer para debug en consola
window.__bb = { net, scene, ui, audio };
