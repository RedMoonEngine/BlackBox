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

// cuando la UI muestra un reveal, tambien lo sacamos en 3D sobre la caja
ui.onReveal3D = (face, tone) => scene.reveal(face, tone);

let lastPhase = null;
let haveState = false;

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
        if (msg.phase === "DEAL") audio.sfx("deal");
        lastPhase = msg.phase;
      }
      break;
    case "reveal":
      ui.reveal(msg.reveals);
      break;
    case "phone":
      ui.phone(msg.line);
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
  "empujá el objeto… o abrilo vos. nadie sabe qué hace.",
  "el teléfono nunca dice del todo la verdad.",
  "si todos juegan igual, la caja aprende y empeora.",
  "las monedas compran ojos, imanes y sorpresas.",
  '"tomá, encontré plata." — capaz era una bomba.',
  "la caja crece cada ronda. abre más compartimentos.",
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
