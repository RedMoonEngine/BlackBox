// UI v2: lobby, HUD, apuesta, y un panel por actividad (OBJETOS/SLOTS/RULETA/EVENTO/MERCADO),
// barra de inventario + reliquias, overlays de casino / El Dueño, reveal y teléfono.
import { svg, iconEmoji, ACT_ICON, clean } from "./icons.js";
const $ = (id) => document.getElementById(id);
const ACTNAME = { OBJETOS: "OBJETOS", SLOTS: "TRAGAPERRAS", ROULETTE: "RULETA RUSA",
  EVENT: "EVENTO", MARKET: "MERCADO" };
const actLabel = (a) => a ? `${svg(ACT_ICON[a] || "question")} ${ACTNAME[a] || a}` : "—";
const chip = (n) => `${svg("chip")} <b>${n}</b>`;

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
const gtimer = '<div class="gtimer"><i class="gtimer-bar"></i><span class="gtimer-num"></span></div>';

export class UI {
  constructor(net, audio) {
    this.net = net;
    this.audio = audio;
    this.joined = false;
    this.mySeat = null;
    this.myBet = 0;
    this._ready = false;
    this._timerPhase = null;
    this._deadline = 0;
    this._total = 1;
    this.revealQueue = [];
    this.revealBusy = false;

    // paneles dinámicos dentro del HUD
    const hud = $("hud");
    this.betPanel = el("div", "panel-c hidden");
    this.slotsPanel = el("div", "panel-c hidden");
    this.roulettePanel = el("div", "panel-c hidden");
    this.marketPanel = el("div", "panel-c hidden");
    this.eventPanel = el("div", "event-banner-c hidden");
    this.invbar = el("div", "invbar hidden");
    this.relicbar = el("div", "relicbar hidden");
    hud.append(this.betPanel, this.slotsPanel, this.roulettePanel, this.marketPanel,
      this.eventPanel, this.invbar, this.relicbar);
    // overlays
    this.casinoOv = el("div", "casino-ov hidden",
      `<div>${svg("eye")} EL CASINO TE OBSERVA ${svg("eye")}</div>`);
    this.ownerOv = el("div", "owner-ov hidden",
      `<div class="owner-card"><div class="owner-emo">${svg("hand")}</div><div id="owner-text">EL DUEÑO</div></div>`);
    this.targetOv = el("div", "target-ov hidden");
    this.fxBloodEl = el("div", "fx-blood");
    this.fxFlashEl = el("div", "fx-flash");
    this.scareEl = el("div", "jumpscare hidden",
      `<div class="scare-inner"><div class="scare-face">🪆</div>
        <div class="scare-title">¡LA MUÑECA!</div><div class="scare-by"></div></div>`);
    this.tutOv = el("div", "tut-ov hidden", this._tutorialHTML());
    document.body.append(this.casinoOv, this.ownerOv, this.targetOv, this.fxBloodEl, this.fxFlashEl,
      this.scareEl, this.tutOv);
    this.tutOv.addEventListener("click", (e) => {
      if (e.target === this.tutOv || e.target.id === "tut-close") this.tutOv.classList.add("hidden");
    });
    // botón en el menú principal
    const lc = document.querySelector(".lobby-card");
    if (lc) {
      const b = el("button", "big ghost tut-btn", `${svg("question")} CÓMO SE JUEGA`);
      b.onclick = () => { this.audio.start(); this.audio.sfx("click"); this.tutOv.classList.remove("hidden"); };
      lc.appendChild(b);
    }

    $("timer-bar").classList.add("gtimer-bar");
    $("timer-num").classList.add("gtimer-num");

    this._bindLobby();
    this._bindPhone();
    this._bindShopGameover();
  }

  _bindLobby() {
    $("btn-join").onclick = () => {
      const name = $("in-name").value.trim() || "Anónimo";
      const room = $("in-room").value.trim().toUpperCase();
      this.audio.start(); this.audio.sfx("click");
      this.net.join(room, name);
    };
    const enter = (e) => { if (e.key === "Enter") $("btn-join").click(); };
    $("in-room").addEventListener("keydown", enter);
    $("in-name").addEventListener("keydown", enter);
    $("btn-start").onclick = () => { this.audio.sfx("deal"); this.net.start(); };
    const ab = $("btn-addbot"); if (ab) ab.onclick = () => { this.audio.sfx("click"); this.net.addBot(); };
    const rb = $("btn-rmbot"); if (rb) rb.onclick = () => { this.audio.sfx("click"); this.net.removeBot(); };
  }
  onJoined(seat) {
    this.joined = true; this.mySeat = seat;
    $("lobby-join").classList.add("hidden");
    $("lobby-room").classList.remove("hidden");
  }
  showError(msg) {
    $("lobby-err").textContent = msg;
    setTimeout(() => { if ($("lobby-err").textContent === msg) $("lobby-err").textContent = ""; }, 4000);
  }

  // usar un objeto del inventario por uid (lo dispara el click en el modelo 3D)
  useObjectByUid(uid) {
    const st = this._lastState;
    if (!st) return;
    const o = (st.you.inventory || []).find((x) => x.uid === uid);
    if (o) this._useObject(st, o);
  }

  // ---------------- render principal ----------------
  update(state) {
    this._lastState = state;
    this.mySeat = state.you.seat;
    const inGame = state.phase !== "LOBBY";
    $("lobby").classList.toggle("hidden", inGame);
    $("hud").classList.toggle("hidden", !inGame);
    if (!inGame) { this._renderLobbyRoom(state); this._hideAll(); return; }

    this._renderTop(state);
    this._renderBanner(state);
    this._renderInv(state);
    this._renderRelics(state);
    this._renderLog(state);
    this._renderHints(state);

    // paneles por fase
    const p = state.phase;
    this._show(this.betPanel, p === "BET");
    if (p !== "BET") this.betPanel.innerHTML = ""; // rearmar el slider fresco cada ronda
    this._show($("action-panel"), p === "OBJETOS" && state.you.canAct);
    this._show(this.slotsPanel, p === "SLOTS");
    this._show(this.roulettePanel, p === "ROULETTE");
    this._show(this.eventPanel, p === "EVENT");
    this._show(this.marketPanel, p === "MARKET" && !!state.market);
    $("shop").classList.add("hidden");
    this._show($("spectate"), (p === "OBJETOS" && !state.you.canAct) || p === "SPIN");
    this._show(this.casinoOv, p === "CASINO");
    this._show($("gameover"), p === "GAMEOVER");

    if (p === "BET") this._renderBet(state);
    else if (p === "OBJETOS") { if (state.you.canAct) this._renderObjeto(state); else this._renderSpectate(state); }
    else if (p === "SPIN") this._renderSpin(state);
    else if (p === "SLOTS") this._renderSlots(state);
    else if (p === "ROULETTE") this._renderRoulette(state);
    else if (p === "EVENT") this._renderEvent(state);
    else if (p === "MARKET") this._renderMarket(state);
    else if (p === "GAMEOVER") this._renderGameover(state);

    this._show(this.ownerOv, p === "EVENT" && state.event && state.event.id === "owner");
    if (p === "EVENT" && state.event && state.event.id === "owner")
      $("owner-text").textContent = state.event.text || "EL DUEÑO";

    document.body.classList.toggle("corrupt", state.menace >= 4);
    document.body.classList.toggle("corrupt-2", state.menace >= 8);
    this._setTimer(state);
    this.tickTimer(); // pintar la barra ya mismo así no "parpadea" al reconstruir el panel
  }

  fxBlood() { const e = this.fxBloodEl; e.classList.remove("show"); void e.offsetWidth; e.classList.add("show"); }
  fxFlash() { const e = this.fxFlashEl; e.classList.remove("show"); void e.offsetWidth; e.classList.add("show"); }
  jumpscare(msg) {
    const e = this.scareEl;
    e.querySelector(".scare-by").textContent =
      msg && msg.byName ? "la muñeca de " + clean(msg.byName) + " te clavó los ojos" : "";
    e.classList.remove("hidden", "show"); void e.offsetWidth; e.classList.add("show");
    clearTimeout(this._scareT);
    this._scareT = setTimeout(() => { e.classList.remove("show"); e.classList.add("hidden"); }, 1300);
  }

  _tutorialHTML() {
    const row = (ic, t, d) => `<div class="tut-row"><span class="tut-ic">${svg(ic)}</span><div><b>${t}</b><br><span class="hint">${d}</span></div></div>`;
    return `<div class="tut-card">
      <h2>CÓMO SE JUEGA</h2>
      <p class="tut-intro">Están todos alrededor de una mesa. En el centro, la <b>BlackBox</b>: un casino con
        voluntad propia. Sobreviví, juntá fichas y leé a tus amigos. <b>Gana el último en pie</b>; si se
        llega al <b>límite de rondas</b> (lo ves arriba como RONDA n/máx), gana <b>el de más fichas</b>.</p>

      <h3>Cada ronda</h3>
      <ol class="tut-loop">
        <li>${svg("chip")} <b>Apostás a ciegas</b>: lo que pongas va al <b>POZO</b> (todavía no sabés a qué van a jugar).</li>
        <li>La caja <b>gira su ruleta</b> y elige la actividad.</li>
        <li>Se <b>juega</b>: hay premios y castigos, y alguien puede quedar eliminado.</li>
        <li>${svg("chip")} <b>Así se gana la apuesta:</b> al terminar la ronda, el pozo se <b>reparte en partes iguales entre los que sigan VIVOS</b>. Si te eliminan, perdés lo que apostaste. En la <b>ruleta rusa</b> el pozo se lo llevan los que se animaron a disparar y sobrevivieron.</li>
      </ol>

      <h3>Las actividades</h3>
      ${row("box", "OBJETOS", "Te llega un objeto <b>CERRADO</b>: nadie sabe qué es. <b>Abrilo</b> y arriesgate, o <b>pasáselo</b> a otro y que arriesgue él (podés mentir: 'tomá, un regalo'). Al abrir: si es <b>trampa</b> (bomba, maldición) te pega a vos; si es un <b>premio</b> cobrás fichas; si es una <b>herramienta</b> va a tu inventario para usarla cuando quieras.")}
      ${row("slot", "TRAGAPERRAS", "<b>Tirá la palanca</b> arrastrándola con el mouse. Combiná símbolos para ganar fichas, objetos o reliquias.")}
      ${row("revolver", "RULETA RUSA", "<b>Hacé click en el gatillo</b> para arriesgar por más premio… o <b>plantate</b> y cobrá lo seguro.")}
      ${row("film", "EVENTO", "Pasa cualquier cosa: lluvia de fichas, un monstruo, una subasta… hasta aparece <b>El Dueño</b>.")}
      ${row("cart", "MERCADO", "<b>Cae un maletín</b> del cielo con objetos y <b>reliquias</b> para comprar con fichas.")}

      <h3>Lo que tenés</h3>
      ${row("chip", "Fichas", "Para apostar y comprar. Quedarte sin fichas no te elimina.")}
      ${row("heart", "Vidas", "Bombas, ruleta y monstruos te sacan vidas. Si llegan a 0, <b>quedás fuera</b>.")}
      ${row("whisky", "Inventario", "Objetos que <b>usás cuando querés</b> (bomba, whisky, imán, jeringa…). <b>Tocá un objeto</b> para usarlo; algunos piden objetivo.")}
      ${row("eye", "Reliquias", "Pasivas <b>permanentes</b> que cambian las reglas a tu favor.")}

      <p class="tut-warn">${svg("warning")} El <b>teléfono</b> puede mentir. La caja <b>aprende</b>: cuanto más agresivos juegan todos, peor se pone. 🪆 Ojo con la <b>Muñeca Maldita</b>: se sienta al lado de su dueño, vigila el turno de cada uno y a veces te pega un <b>susto</b> y te <b>roba una reliquia</b>. La gracia no es la puntería: es <b>leer, mentir y arriesgar</b>.</p>
      <button class="big" id="tut-close">ENTENDIDO</button>
    </div>`;
  }

  _hideAll() {
    for (const e of [this.betPanel, this.slotsPanel, this.roulettePanel, this.eventPanel,
      this.invbar, this.relicbar, this.casinoOv, this.ownerOv,
      $("phase-banner"), $("action-panel"), $("spectate"), $("shop"), $("gameover")])
      e && e.classList.add("hidden");
  }
  _show(e, on) { if (e) e.classList.toggle("hidden", !on); }

  _renderTop(state) {
    const y = state.you;
    const tb = $("topbar");
    const hearts = y.alive ? svg("heart").repeat(y.hp) || "—" : svg("skull");
    tb.innerHTML =
      `<div class="tb-left">
        <span class="pill">RONDA <b>${state.round}${state.roundCap ? "/" + state.roundCap : ""}</b></span>
        <span class="pill act">${actLabel(state.activity)}</span>
        <span class="pill corrupt">CASINO <b>${"▮".repeat(Math.min(8, state.menace)) || "○"}</b></span>
        <span class="pill">POZO ${chip(state.pot)}</span>
       </div>
       <div class="tb-right">
        <span class="hp">${hearts}</span>
        <span class="pill coins">${chip(y.chips)}</span>
       </div>`;
  }

  _renderInv(state) {
    const inv = state.you.inventory || [];
    this._show(this.invbar, state.phase !== "SPIN" && state.phase !== "CASINO");
    this.invbar.innerHTML = `<span class="inv-lbl">INVENTARIO</span>`;
    if (!inv.length) { this.invbar.innerHTML += `<span class="hint">vacío</span>`; return; }
    for (const o of inv) {
      const b = el("button", "inv-item", iconEmoji(o.emoji) || "?");
      b.title = `${o.name} — ${o.desc}`;
      b.onclick = () => this._useObject(state, o);
      this.invbar.appendChild(b);
    }
  }

  _useObject(state, o) {
    this.audio.sfx("click");
    if (o.target === "self") { this.net.useObject(o.uid, null); return; }
    // selector de objetivo
    const ov = this.targetOv;
    ov.innerHTML = `<div class="target-card"><div class="hint">${iconEmoji(o.emoji)} ${o.name} — elegí objetivo</div></div>`;
    const card = ov.querySelector(".target-card");
    if (o.target === "any") {
      const self = el("button", "big", "▸ A MÍ");
      self.onclick = () => { this.net.useObject(o.uid, this.mySeat); ov.classList.add("hidden"); };
      card.appendChild(self);
    }
    for (const s of state.seats) {
      if (s.seat === this.mySeat || !s.alive || !s.connected) continue;
      const b = el("button", "big", `▸ P${s.seat} ${s.name}`);
      b.onclick = () => { this.audio.sfx("push"); this.net.useObject(o.uid, s.seat); ov.classList.add("hidden"); };
      card.appendChild(b);
    }
    const cancel = el("button", "big ghost", "cancelar");
    cancel.onclick = () => ov.classList.add("hidden");
    card.appendChild(cancel);
    ov.classList.remove("hidden");
  }

  _renderRelics(state) {
    const r = state.you.relics || [];
    this._show(this.relicbar, r.length > 0);
    this.relicbar.innerHTML = "";
    for (const rel of r) {
      const s = el("span", "relic-item", iconEmoji(rel.emoji) || "?");
      s.title = `${rel.name} — ${rel.desc}`;
      this.relicbar.appendChild(s);
    }
  }

  _renderLog(state) {
    const log = $("log"); log.innerHTML = "";
    for (const line of state.log.slice().reverse()) {
      const d = document.createElement("div"); d.textContent = clean(line); log.appendChild(d);
    }
  }
  _renderHints(state) {
    const hb = $("hints"); hb.innerHTML = "";
    for (const h of (state.you.hints || []).slice().reverse()) {
      const d = document.createElement("div"); d.textContent = clean(h); hb.appendChild(d);
    }
  }

  // Cartel central: SIEMPRE dice qué está pasando y qué tenés que hacer.
  // k = "mine" (te toca a vos, pulsa) | "wait" (mirás) | "weird" | "bad".
  _seatName(state, seat) {
    const s = state.seats.find((x) => x.seat === seat);
    return s ? `P${seat} ${s.name}` : (seat != null ? `P${seat}` : "alguien");
  }
  _bannerFor(state) {
    const p = state.phase, y = state.you;
    switch (p) {
      case "BET":
        return y.ready
          ? { t: "APUESTA LISTA ✓", s: "esperando a que el resto confirme… el pozo se reparte entre los que SOBREVIVAN la ronda", k: "wait" }
          : { t: "APOSTÁ A CIEGAS", s: "todo lo apostado va al POZO; al final de la ronda se reparte entre los que SIGAN VIVOS. Si morís, lo perdés", k: "mine" };
      case "SPIN":
        return { t: "LA CAJA ELIGE…", s: "la ruleta decide la actividad de esta ronda", k: "wait" };
      case "OBJETOS": {
        const c = state.current;
        if (c && c.holderSeat === y.seat)
          return { t: "OBJETO CERRADO EN TUS MANOS",
            s: "no sabés si es un PREMIO o una TRAMPA. Abrilo y arriesgate, o pasáselo a alguien y que se coma el riesgo", k: "mine" };
        return { t: "OBJETO CERRADO EN JUEGO", s: `${this._seatName(state, c && c.holderSeat)} decide si lo abre o te lo pasa…`, k: "wait" };
      }
      case "SLOTS":
        return y.canSpin
          ? { t: "TRAGAPERRAS · TU TURNO", s: "tirá la PALANCA del gabinete: arrastrala hacia abajo con el mouse", k: "mine" }
          : { t: "TRAGAPERRAS", s: "se están jugando las tiradas…", k: "wait" };
      case "ROULETTE": {
        const r = state.roulette;
        if (y.rouletteTurn)
          return { t: "RULETA RUSA · TU TURNO", s: "disparás por más premio (click al gatillo) o te PLANTÁS y cobrás lo seguro", k: "mine" };
        return { t: "RULETA RUSA", s: `${this._seatName(state, r && r.holderSeat)} decide si arriesga…`, k: "wait" };
      }
      case "EVENT": {
        const e = state.event;
        return { t: "EVENTO", s: e && e.text ? clean(e.text) : "algo raro pasa en la mesa…", k: "weird" };
      }
      case "MARKET":
        return { t: "MERCADO NEGRO", s: y.ready ? "listo — esperando al resto…" : "cae un maletín: comprá objetos y reliquias con tus fichas", k: y.ready ? "wait" : "mine" };
      case "CASINO":
        return { t: "EL CASINO DESPIERTA", s: "cuanto más agresivos juegan todos, peor se pone…", k: "bad" };
      default:
        return null;
    }
  }
  _renderBanner(state) {
    const el = $("phase-banner");
    const b = this._bannerFor(state);
    if (!b) { el.classList.add("hidden"); el.innerHTML = ""; return; }
    el.classList.remove("hidden");
    el.className = "phase-banner k-" + (b.k || "wait");
    el.innerHTML = `<span class="pb-title">${b.t}</span><span class="pb-sub">${b.s}</span>`;
  }

  _renderLobbyRoom(state) {
    $("room-code").textContent = state.code;
    const ul = $("seat-list"); ul.innerHTML = "";
    for (const s of state.seats.slice().sort((a, b) => a.seat - b.seat)) {
      const li = el("li", (s.seat === this.mySeat ? "me " : "") + (s.connected ? "" : "off"),
        `${s.seat === state.hostSeat ? '<span class="host-star">★</span> ' : ""}P${s.seat} · ${s.name}`);
      ul.appendChild(li);
    }
    const isHost = state.you.isHost;
    const enough = state.seats.filter((s) => s.connected).length >= 2;
    $("btn-start").classList.toggle("hidden", !(isHost && enough));
    $("bot-controls").classList.toggle("hidden", !isHost);
    let w = "";
    if (!isHost) w = "Esperando a que el anfitrión abra la caja…";
    else if (!enough) w = "Faltan jugadores… agregá bots 🤖 para probar solo.";
    $("wait-host").textContent = w;
    $("wait-host").classList.toggle("hidden", w === "");
  }

  // ---------------- BET ----------------
  _renderBet(state) {
    const y = state.you;
    const cap = Math.min(state.betCap, y.chips);
    if (this.myBet > cap) this.myBet = cap;
    this._betCap = cap;

    if (!this.betPanel.querySelector("#bet-range")) {
      // construir una sola vez por ronda (así el slider no se reinicia en cada broadcast)
      this.betPanel.innerHTML =
        `<div class="bet-title">APOSTÁ ${svg("chip")} A CIEGAS</div>
         <div class="bet-sub">va todo al POZO → al terminar la ronda se reparte entre los SOBREVIVIENTES. Si te eliminan, lo perdés.</div>
         <div class="bet-display"><span class="bet-num" id="bet-amt">${this.myBet}</span>
           <span class="bet-cap">/ ${cap}</span></div>
         <input type="range" id="bet-range" class="bet-range" min="0" max="${cap}" value="${this.myBet}">
         <div class="bet-steps">
           <button class="stepper" data-d="-5">−5</button>
           <button class="stepper" data-d="-1">−1</button>
           <button class="stepper" data-set="0">0</button>
           <button class="stepper" data-d="1">+1</button>
           <button class="stepper" data-d="5">+5</button>
           <button class="stepper allin" data-set="${cap}">ALL-IN</button>
         </div>
         <button class="big open bet-confirm" id="bet-ok">CONFIRMAR APUESTA</button>${gtimer}`;
      const setBet = (v) => {
        this.myBet = Math.max(0, Math.min(this._betCap, Math.round(v) || 0));
        $("bet-amt").textContent = this.myBet;
        $("bet-range").value = this.myBet;
        this.net.bet(this.myBet);
      };
      $("bet-range").oninput = (e) => { this.myBet = parseInt(e.target.value); $("bet-amt").textContent = this.myBet; };
      $("bet-range").onchange = () => { this.audio.sfx("click"); this.net.bet(this.myBet); };
      this.betPanel.querySelectorAll(".stepper").forEach((b) => {
        b.onclick = () => {
          this.audio.sfx(b.classList.contains("allin") ? "coin" : "click");
          setBet(b.dataset.set != null ? parseInt(b.dataset.set) : this.myBet + parseInt(b.dataset.d));
        };
      });
      $("bet-ok").onclick = () => {
        this._ready = !this._ready;
        this.net.bet(this.myBet); this.net.ready(this._ready);
        this.audio.sfx("click");
      };
    }
    // actualizar lo dinámico
    $("bet-amt").textContent = this.myBet;
    const range = $("bet-range");
    if (document.activeElement !== range) range.value = this.myBet;
    this._ready = y.ready;
    const ok = $("bet-ok");
    ok.textContent = y.ready ? "APUESTA LISTA ✓" : "CONFIRMAR APUESTA";
    ok.classList.toggle("ready", y.ready);
  }

  _renderSpin(state) {
    $("spectate").innerHTML = `<div class="big-spin">LA RULETA GIRA…</div>`;
  }

  // ---------------- OBJETOS ----------------
  _renderObjeto(state) {
    const cur = state.current;
    const key = cur.holderSeat + ":" + cur.pushesLeft + ":" + cur.itemsLeft;
    if (key === this._objKey && $("action-btns").children.length) return;
    this._objKey = key;
    $("held-info").innerHTML =
      `<span class="big-emo">${svg("question")}</span>` +
      `Te llegó un <b>OBJETO CERRADO</b>` +
      `<span class="sub">no sabés si es un <b>premio</b> o una <b>trampa</b>. Abrilo y arriesgate… o pasáselo a alguien (y que se lo coma él).</span>`;
    const btns = $("action-btns"); btns.innerHTML = "";
    const mk = (label, cls, fn) => {
      const b = el("button", "big " + cls, label);
      b.onclick = () => { this.audio.sfx("click"); fn(); };
      btns.appendChild(b);
    };
    mk("ABRIR", "open", () => this.net.objOpen());
    if (cur.pushesLeft > 0) mk(`PASAR ▸ (${cur.pushesLeft})`, "", () => $("push-picker").classList.toggle("hidden"));
    const pp = $("push-picker"); pp.classList.add("hidden"); pp.innerHTML = "";
    for (const s of state.seats) {
      if (s.seat === this.mySeat || !s.alive || !s.connected) continue;
      const b = el("button", "big", `▸ P${s.seat} ${s.name}`);
      b.onclick = () => { this.audio.sfx("push"); this.net.pushTo(s.seat); pp.classList.add("hidden"); };
      pp.appendChild(b);
    }
  }
  _renderSpectate(state) {
    if (state.phase !== "OBJETOS") return;
    const cur = state.current;
    const h = state.seats.find((s) => s.seat === cur.holderSeat);
    $("spectate").innerHTML =
      `<span class="who">P${cur.holderSeat} ${h ? h.name : ""}</span> tiene un <b>objeto sin abrir</b> ${svg("question")}… ` +
      `<span class="hint">(${cur.pushesLeft} pases)</span>`;
  }

  // ---------------- SLOTS ----------------
  _renderSlots(state) {
    const y = state.you;
    const mine = y.myReels;
    const reelIcons = (arr) => arr.map((e) => iconEmoji(e) || svg("question")).join("");
    let grid = "";
    for (const s of state.seats.filter((x) => x.alive)) {
      const r = state.slots.results[s.seat];
      grid += `<div class="slot-row"><span class="hint">P${s.seat}</span> <span class="reels">${r ? reelIcons(r.reels) : svg("question").repeat(3)}</span></div>`;
    }
    this.slotsPanel.innerHTML =
      `<div class="panel-h">${svg("slot")} TRAGAPERRAS</div>
       ${y.canSpin
        ? `<div class="pull-hint">${svg("slot")} tirá la <b>PALANCA</b> — arrastrala hacia abajo con el mouse</div>`
        : `<div class="hint">${mine ? clean(mine.text) : "esperando a los demás…"}</div>`}
       <div class="slot-grid">${grid}</div>${gtimer}`;
  }

  // ---------------- ROULETTE ----------------
  _renderRoulette(state) {
    const r = state.roulette;
    const chambers = r.chambers || 6;
    const h = state.seats.find((s) => s.seat === r.holderSeat);
    const odds = Math.round(100 / chambers);
    this.roulettePanel.innerHTML =
      `<div class="panel-h">${svg("revolver")} RULETA RUSA</div>
       <div class="rew">premio ${chip(r.reward)} · riesgo <b>${odds}%</b> · ${chambers} recámaras</div>
       ${state.you.rouletteTurn
        ? `<div class="hint">hacé click en el <b class="red">gatillo</b> del revólver…</div>
           <div class="rr-btns"><button class="big danger" id="pull">…o apretar acá</button>
             <button class="big ghost" id="stopr">PLANTARSE</button></div>
           ${state.you.whisky > 0 ? `<div class="hint">${svg("whisky")} mano firme (salva 1 disparo)</div>` : ""}`
        : `<div class="hint"><span class="who">P${r.holderSeat} ${h ? h.name : ""}</span> decide…</div>`}
       ${gtimer}`;
    if (state.you.rouletteTurn) {
      $("pull").onclick = () => { this.audio.sfx("revolver"); this.net.roulettePull(); };
      $("stopr").onclick = () => { this.audio.sfx("click"); this.net.rouletteStop(); };
    }
  }

  // ---------------- EVENT ----------------
  _renderEvent(state) {
    const e = state.event;
    if (!e) { this.eventPanel.innerHTML = ""; return; }
    if (e.id === "auction") {
      this.eventPanel.innerHTML =
        `<div class="panel-h">${svg("film")} SUBASTA</div>
         <div class="big-emo">${e.prize ? iconEmoji(e.prize.emoji) : svg("question")}</div>
         <div class="hint">${e.prize ? e.prize.name : ""}</div>
         <div class="bet-row"><button class="stepper" data-d="-1">−1</button>
           <div class="bet-amt">${svg("chip")} <b id="bid-amt">${this.myBet}</b></div>
           <button class="stepper" data-d="1">+1</button></div>
         <button class="big open" id="bid-ok">OFERTAR</button>${gtimer}`;
      this.eventPanel.querySelectorAll(".stepper").forEach((b) => {
        b.onclick = () => { this.myBet = Math.max(0, Math.min(state.you.chips, this.myBet + parseInt(b.dataset.d))); $("bid-amt").textContent = this.myBet; };
      });
      $("bid-ok").onclick = () => { this.audio.sfx("coin"); this.net.bid(this.myBet); };
    } else if (e.id !== "owner") {
      this.eventPanel.innerHTML = `<div class="ev-banner">${svg("film")} EVENTO</div>`;
    }
  }

  // ---------------- MARKET (barra compacta; el maletín 3D es el show) ----------------
  _renderMarket(state) {
    const y = state.you;
    let items = "";
    (state.market.stock || []).forEach((o) => {
      const sold = state.market.sold.includes(o.id);
      const dis = sold || y.chips < o.cost ? "disabled" : "";
      items += `<button class="mkt-item ${o.kind}" data-id="${o.kind}:${o.id}" ${dis} title="${o.desc || ""}">
        <span class="mkt-emo">${iconEmoji(o.emoji)}</span><span class="mkt-nm">${o.name}${o.kind === "relic" ? " ✦" : ""}</span>
        <span class="mkt-desc">${o.desc || ""}</span>
        <span class="mkt-cost">${sold ? "vendido" : `${o.cost} ${svg("chip")}`}</span></button>`;
    });
    const total = state.seats.filter((s) => s.alive && s.connected).length;
    const readyN = state.seats.filter((s) => s.ready).length;
    this.marketPanel.innerHTML =
      `<div class="panel-h">${svg("cart")} MERCADO NEGRO <span class="hint">${chip(y.chips)} · cae del cielo…</span></div>
       <div class="mkt-row">${items}</div>
       <div class="bet-row2"><span class="hint" style="align-self:center">${readyN}/${total} listos</span>
         <button class="big open" id="mkt-ready">${y.ready ? "LISTO ✓" : "LISTO"}</button></div>${gtimer}`;
    this.marketPanel.querySelectorAll(".mkt-item").forEach((b) => {
      b.onclick = () => { this.audio.sfx("coin"); this.net.buy(b.dataset.id); };
    });
    $("mkt-ready").onclick = () => { this._ready = !y.ready; this.audio.sfx("click"); this.net.ready(this._ready); };
  }

  // ---------------- timers ----------------
  _setTimer(state) {
    let ms = null;
    const p = state.phase;
    if (p === "BET") ms = state.betTimerMs;
    else if (p === "OBJETOS" && state.current) ms = state.current.timerMs;
    else if (p === "SLOTS" && state.slots) ms = state.slots.timerMs;
    else if (p === "ROULETTE" && state.roulette) ms = state.roulette.timerMs;
    else if (p === "MARKET" && state.market) ms = state.market.timerMs;
    else if (p === "EVENT" && state.event) ms = state.event.timerMs;
    if (ms == null) { this._deadline = 0; return; }
    if (this._timerPhase !== p) { this._total = ms || 1; this._timerPhase = p; }
    this._total = Math.max(this._total, ms);
    this._deadline = performance.now() + ms;
  }
  tickTimer() {
    if (!this._deadline) return;
    const left = Math.max(0, this._deadline - performance.now());
    const frac = Math.max(0, Math.min(1, left / (this._total || 1)));
    document.querySelectorAll(".gtimer-bar").forEach((b) => {
      b.style.width = (frac * 100) + "%";
      b.style.background = frac < 0.3 ? "var(--red)" : "var(--amber)";
    });
    document.querySelectorAll(".gtimer-num").forEach((n) => { n.textContent = Math.ceil(left / 1000) + "s"; });
  }

  // ---------------- reveal ----------------
  reveal(reveals) {
    for (const r of reveals) this.revealQueue.push(r);
    this._pump();
  }
  _pump() {
    if (this.revealBusy || !this.revealQueue.length) return;
    this.revealBusy = true;
    const r = this.revealQueue.shift();
    const box = $("reveal");
    box.className = "reveal " + (r.tone || "");
    const toneIcon = { good: "chip", bad: "skull", info: "eye", weird: "star" }[r.tone] || "question";
    box.querySelector(".reveal-emoji").innerHTML = iconEmoji(r.emoji) || svg(toneIcon);
    box.querySelector(".reveal-name").textContent = r.name;
    box.querySelector(".reveal-text").textContent = clean(r.text);
    box.classList.remove("hidden");
    requestAnimationFrame(() => box.classList.add("show"));
    this.audio.sfx(r.tone === "good" ? "good" : r.tone === "bad" ? "bad" : r.tone === "info" ? "info" : "weird");
    setTimeout(() => {
      box.classList.remove("show");
      setTimeout(() => { box.classList.add("hidden"); this.revealBusy = false; this._pump(); }, 200);
    }, 1700);
  }

  // ---------------- phone ----------------
  _bindPhone() {
    const pe = $("phone").querySelector(".phone-emoji"); if (pe) pe.innerHTML = svg("phone");
    $("btn-answer").classList.add("hidden");
    $("btn-ignore").textContent = "COLGAR";
    $("btn-ignore").onclick = () => { window.speechSynthesis && window.speechSynthesis.cancel(); $("phone").classList.add("hidden"); };
  }
  async phone(line) {
    const e = $("phone");
    e.classList.remove("hidden", "answered");
    $("phone-status").textContent = "Está sonando…";
    $("phone-line").textContent = ""; $("btn-ignore").classList.add("hidden");
    this.audio.ring(1);
    await new Promise((r) => setTimeout(r, 1000));
    e.classList.add("answered");
    $("phone-status").textContent = "En la línea…";
    $("phone-line").textContent = "“" + line + "”";
    $("btn-ignore").classList.remove("hidden");
    await this.audio.speak(line);
    setTimeout(() => { if (!e.classList.contains("hidden")) e.classList.add("hidden"); }, 3500);
  }

  // ---------------- gameover ----------------
  _bindShopGameover() {
    $("btn-ready").onclick = () => {
      this._ready = !this._ready; this.audio.sfx("click"); this.net.ready(this._ready);
      $("btn-ready").textContent = this._ready ? "LISTO ✓" : "LISTO";
    };
    $("btn-again").onclick = () => { this.audio.sfx("deal"); this.net.again(); };
  }
  _renderGameover(state) {
    const w = state.seats.find((s) => s.seat === state.winnerSeat);
    const iWon = state.winnerSeat === this.mySeat;
    $("go-title").innerHTML = iWon ? svg("star") : svg("skull");
    $("go-sub").innerHTML = w ? `Gana ${w.name} (P${w.seat}) con ${chip(w.chips)}` : "Nadie quedó en pie.";
    $("btn-again").classList.toggle("hidden", !state.you.isHost);
    $("go-wait").classList.toggle("hidden", state.you.isHost);
  }
}
