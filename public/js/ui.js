// Capa de UI: lobby, HUD, panel de accion, tienda, reveal, telefono, game over.
const MAX_HP = 3;
const $ = (id) => document.getElementById(id);

export class UI {
  constructor(net, audio) {
    this.net = net;
    this.audio = audio;
    this.joined = false;
    this.mySeat = null;
    this.lastPhase = null;
    this.timerDeadline = 0;   // ms (performance.now) para countdown local
    this.timerTotal = 1;
    this.timerActive = false;
    this.revealQueue = [];
    this.revealBusy = false;
    this.onReveal3D = null;   // callback -> scene.reveal(face,tone)
    this._bindLobby();
    this._bindPhone();
    this._bindShopGameover();
  }

  // ------------- lobby -------------
  _bindLobby() {
    $("btn-join").onclick = () => {
      const name = $("in-name").value.trim() || "Anónimo";
      const room = $("in-room").value.trim().toUpperCase();
      this.audio.start();
      this.audio.sfx("click");
      this.net.join(room, name);
    };
    $("in-room").addEventListener("keydown", (e) => { if (e.key === "Enter") $("btn-join").click(); });
    $("in-name").addEventListener("keydown", (e) => { if (e.key === "Enter") $("btn-join").click(); });
    $("btn-start").onclick = () => { this.audio.sfx("deal"); this.net.start(); };
  }

  onJoined(seat) {
    this.joined = true;
    this.mySeat = seat;
    $("lobby-join").classList.add("hidden");
    $("lobby-room").classList.remove("hidden");
  }

  showError(msg) {
    $("lobby-err").textContent = msg;
    setTimeout(() => { if ($("lobby-err").textContent === msg) $("lobby-err").textContent = ""; }, 4000);
  }

  // ------------- render principal -------------
  update(state) {
    this.mySeat = state.you.seat;
    const inGame = state.phase !== "LOBBY";

    // pantallas
    $("lobby").classList.toggle("hidden", inGame);
    $("hud").classList.toggle("hidden", !inGame);

    if (!inGame) { this._renderLobbyRoom(state); }
    else { this._renderHud(state); }

    // overlays por fase
    $("shop").classList.toggle("hidden", !(state.phase === "SHOP" && state.shop));
    if (state.phase === "SHOP" && state.shop) this._renderShop(state);

    $("gameover").classList.toggle("hidden", state.phase !== "GAMEOVER");
    if (state.phase === "GAMEOVER") this._renderGameover(state);

    // corrupcion -> estetica
    document.body.classList.toggle("corrupt", state.corruption >= 5);
    document.body.classList.toggle("corrupt-2", state.corruption >= 9);

    this.lastPhase = state.phase;
  }

  _renderLobbyRoom(state) {
    $("room-code").textContent = state.code;
    const ul = $("seat-list");
    ul.innerHTML = "";
    for (const s of state.seats.slice().sort((a, b) => a.seat - b.seat)) {
      const li = document.createElement("li");
      if (s.seat === this.mySeat) li.classList.add("me");
      if (!s.connected) li.classList.add("off");
      li.innerHTML = `${s.seat === state.hostSeat ? '<span class="host-star">★</span> ' : ""}P${s.seat} · ${s.name}`;
      ul.appendChild(li);
    }
    const isHost = state.you.isHost;
    const enough = state.seats.filter((s) => s.connected).length >= 2;
    $("btn-start").classList.toggle("hidden", !(isHost && enough));
    let waitMsg = "";
    if (!isHost) waitMsg = "Esperando a que el anfitrión abra la caja…";
    else if (!enough) waitMsg = "Faltan jugadores (mínimo 2)…";
    $("wait-host").textContent = waitMsg;
    $("wait-host").classList.toggle("hidden", waitMsg === "");
  }

  _renderHud(state) {
    const y = state.you;
    $("hud-round").textContent = state.round;
    $("hud-box").textContent = state.boxSize;
    $("hud-corrupt").textContent = state.corruption;
    $("hud-coins").textContent = y.coins;
    let hearts = "";
    for (let i = 0; i < MAX_HP; i++) hearts += i < y.hp ? "❤" : "♡";
    $("hud-hp").textContent = y.alive ? hearts : "☠";

    // banner de fase
    const banners = {
      DEAL: "▸ la ranura se abre…",
      RESOLVE: "▸ …",
      PAYOUT: "▸ reparto de monedas",
    };
    $("phase-banner").textContent = banners[state.phase] || "";

    // panel de accion vs espectar
    const cur = state.current;
    const iAmHolder = cur && cur.holderSeat === this.mySeat;
    const showAction = state.phase === "CHOOSE" && y.canAct;
    const showSpectate = state.phase === "CHOOSE" && cur && !y.canAct;

    $("action-panel").classList.toggle("hidden", !showAction);
    $("spectate").classList.toggle("hidden", !showSpectate);

    if (showAction) this._renderAction(state);
    else this.timerActive = false;

    if (showSpectate) this._renderSpectate(state);

    // log
    const log = $("log");
    log.innerHTML = "";
    for (const line of state.log.slice().reverse()) {
      const d = document.createElement("div");
      d.textContent = line;
      log.appendChild(d);
    }
    // hints privados
    const hb = $("hints");
    hb.innerHTML = "";
    for (const h of (y.hints || []).slice().reverse()) {
      const d = document.createElement("div");
      d.textContent = h;
      hb.appendChild(d);
    }
  }

  _renderAction(state) {
    const cur = state.current, y = state.you;
    const face = y.heldFace || { emoji: "❓", name: "???" };
    const isPhone = face.type === "phone";
    $("held-info").innerHTML =
      `<span class="big-emo">${face.emoji}</span>` +
      `Tenés: <b>${face.name}</b>` +
      `<span class="sub">nadie sabe qué hace realmente${isPhone ? " · podés ATENDER o pasarlo" : ""}</span>`;

    const btns = $("action-btns");
    btns.innerHTML = "";
    const mk = (label, cls, fn) => {
      const b = document.createElement("button");
      b.className = "big " + cls;
      b.textContent = label;
      b.onclick = () => { this.audio.sfx("click"); fn(); };
      btns.appendChild(b);
      return b;
    };
    mk(isPhone ? "ATENDER ☎️" : "ABRIR", "open", () => this.net.use());
    if (cur.pushesLeft > 0) {
      mk("EMPUJAR ▸", "", () => {
        const pp = $("push-picker");
        pp.classList.toggle("hidden");
      });
    }
    if ((y.upgrades.trash || 0) > 0) mk("🗑 TIRAR", "ghost", () => this.net.trash());
    if ((y.upgrades.reorder || 0) > 0) mk("🔄 GIRAR", "ghost", () => this.net.reorder());

    // push picker
    const pp = $("push-picker");
    pp.classList.add("hidden");
    pp.innerHTML = "";
    for (const s of state.seats) {
      if (s.seat === this.mySeat || !s.alive || !s.connected) continue;
      const b = document.createElement("button");
      b.className = "big";
      b.textContent = `▸ P${s.seat} ${s.name}`;
      b.onclick = () => { this.audio.sfx("push"); this.net.pushTo(s.seat); pp.classList.add("hidden"); };
      pp.appendChild(b);
    }

    // timer
    if (cur.timerMs != null) {
      this.timerTotal = Math.max(this.timerTotal, cur.timerMs);
      this.timerDeadline = performance.now() + cur.timerMs;
      this.timerActive = true;
    }
  }

  _renderSpectate(state) {
    const cur = state.current;
    const holder = state.seats.find((s) => s.seat === cur.holderSeat);
    const secs = cur.timerMs != null ? Math.ceil(cur.timerMs / 1000) : "?";
    $("spectate").innerHTML =
      `<span class="who">P${cur.holderSeat} ${holder ? holder.name : ""}</span> tiene un objeto misterioso… ` +
      `<span class="hint">(${cur.pushesLeft} empujes restantes · ${secs}s)</span>`;
    if (cur.timerMs != null) {
      this.timerDeadline = performance.now() + cur.timerMs;
      this.timerTotal = Math.max(this.timerTotal, cur.timerMs);
      this.timerActive = false; // no muestro barra propia al espectar
    }
  }

  // countdown local (lo llama main cada frame)
  tickTimer() {
    if (!this.timerActive) return;
    const left = Math.max(0, this.timerDeadline - performance.now());
    const frac = Math.max(0, Math.min(1, left / (this.timerTotal || 1)));
    $("timer-bar").style.width = (frac * 100) + "%";
    $("timer-num").textContent = Math.ceil(left / 1000) + "s";
    $("timer-bar").style.background = frac < 0.3 ? "var(--red)" : "var(--amber)";
  }

  // ------------- tienda -------------
  _bindShopGameover() {
    $("btn-ready").onclick = () => {
      this._ready = !this._ready;
      this.audio.sfx("click");
      this.net.ready(this._ready);
      $("btn-ready").textContent = this._ready ? "LISTO ✓" : "LISTO";
    };
    $("btn-again").onclick = () => { this.audio.sfx("deal"); this.net.again(); };
  }

  _renderShop(state) {
    const y = state.you;
    $("shop-coins").textContent = y.coins;
    const grid = $("shop-grid");
    grid.innerHTML = "";
    for (const o of state.shop.offers) {
      const owned = y.upgrades[o.id] || 0;
      const div = document.createElement("div");
      div.className = "shop-item" + (owned ? " owned" : "");
      const can = y.coins >= o.cost && y.alive;
      div.innerHTML =
        `<div class="emo">${o.emoji}</div>` +
        `<div class="nm">${o.name}${owned ? ` ×${owned}` : ""}</div>` +
        `<div class="ds">${o.desc}</div>` +
        `<div class="cost">${o.cost} 🪙</div>`;
      const b = document.createElement("button");
      b.className = "big";
      b.textContent = "COMPRAR";
      b.disabled = !can;
      b.onclick = () => { this.audio.sfx("coin"); this.net.buy(o.id); };
      div.appendChild(b);
      grid.appendChild(div);
    }
    const readyN = state.shop.ready.length;
    const total = state.seats.filter((s) => s.alive && s.connected).length;
    $("shop-ready").textContent = `${readyN}/${total} listos`;
    if (state.shop.timerMs != null) {
      const frac = Math.max(0, Math.min(1, state.shop.timerMs / 22000));
      $("shop-timer").innerHTML = `<i style="width:${frac * 100}%"></i>`;
    }
    // sincronizar mi boton listo
    this._ready = state.shop.ready.includes(this.mySeat);
    $("btn-ready").textContent = this._ready ? "LISTO ✓" : "LISTO";
  }

  // ------------- reveal (cola) -------------
  reveal(reveals) {
    for (const r of reveals) this.revealQueue.push(r);
    this._pumpReveal();
  }
  _pumpReveal() {
    if (this.revealBusy || !this.revealQueue.length) return;
    this.revealBusy = true;
    const r = this.revealQueue.shift();
    const box = $("reveal");
    box.className = "reveal " + (r.tone || "");
    box.querySelector(".reveal-emoji").textContent = r.emoji;
    box.querySelector(".reveal-name").textContent = r.name;
    box.querySelector(".reveal-text").textContent = r.text;
    box.classList.remove("hidden");
    requestAnimationFrame(() => box.classList.add("show"));
    this.audio.sfx(r.tone === "good" ? "good" : r.tone === "bad" ? "bad" : r.tone === "info" ? "info" : "weird");
    if (this.onReveal3D && r.type) this.onReveal3D({ type: r.type }, r.tone);
    setTimeout(() => {
      box.classList.remove("show");
      setTimeout(() => {
        box.classList.add("hidden");
        this.revealBusy = false;
        this._pumpReveal();
      }, 220);
    }, 1900);
  }

  // ------------- telefono -------------
  _bindPhone() {
    $("btn-answer").classList.add("hidden");
    $("btn-ignore").textContent = "COLGAR";
    $("btn-ignore").onclick = () => { window.speechSynthesis && window.speechSynthesis.cancel(); $("phone").classList.add("hidden"); };
  }

  async phone(line) {
    const el = $("phone");
    el.classList.remove("hidden", "answered");
    $("phone-status").textContent = "Está sonando…";
    $("phone-line").textContent = "";
    $("btn-ignore").classList.add("hidden");
    this.audio.ring(1);
    await new Promise((r) => setTimeout(r, 1100));
    el.classList.add("answered");
    $("phone-status").textContent = "En la línea…";
    $("phone-line").textContent = "“" + line + "”";
    $("btn-ignore").classList.remove("hidden");
    await this.audio.speak(line);
    // auto colgar
    setTimeout(() => { if (!el.classList.contains("hidden")) el.classList.add("hidden"); }, 3500);
  }

  // ------------- game over -------------
  _renderGameover(state) {
    const w = state.seats.find((s) => s.seat === state.winnerSeat);
    const iWon = state.winnerSeat === this.mySeat;
    $("go-title").textContent = iWon ? "🏆" : "☠";
    $("go-sub").textContent = w ? `Gana ${w.name} (P${w.seat})` : "Nadie quedó en pie.";
    $("btn-again").classList.toggle("hidden", !state.you.isHost);
    $("go-wait").classList.toggle("hidden", state.you.isHost);
    this._ready = false;
  }
}
