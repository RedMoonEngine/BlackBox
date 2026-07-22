// Cliente WebSocket: conecta a /ws, envia intenciones, recibe la vista del jugador.

export class Net {
  constructor(onMsg, onOpen, onClose) {
    this.onMsg = onMsg;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.ws = null;
    this.queue = [];
    this.joinInfo = null; // {room, name} para reconectar
  }

  connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${location.host}/ws`;
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      for (const m of this.queue) this.ws.send(JSON.stringify(m));
      this.queue = [];
      this.onOpen && this.onOpen();
    };
    this.ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      this.onMsg(msg);
    };
    this.ws.onclose = () => {
      this.onClose && this.onClose();
      // reintento simple de reconexion si ya habiamos entrado a una sala
      if (this.joinInfo) {
        setTimeout(() => {
          this.connect();
          this.send({ t: "join", ...this.joinInfo });
        }, 1500);
      }
    };
    this.ws.onerror = () => {};
  }

  send(obj) {
    if (obj.t === "join") this.joinInfo = { room: obj.room, name: obj.name };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    } else {
      this.queue.push(obj);
    }
  }

  // helpers de accion (v2)
  join(room, name) { this.send({ t: "join", room, name }); }
  start() { this.send({ t: "start" }); }
  addBot() { this.send({ t: "addbot" }); }
  removeBot() { this.send({ t: "removebot" }); }
  bet(amount) { this.send({ t: "bet", amount }); }
  ready(v) { this.send({ t: "ready", value: v }); }
  objOpen() { this.send({ t: "action", kind: "open" }); }
  objPocket() { this.send({ t: "action", kind: "pocket" }); }
  pushTo(seat) { this.send({ t: "action", kind: "pushTo", targetSeat: seat }); }
  spin() { this.send({ t: "spin" }); }
  roulettePull() { this.send({ t: "action", kind: "pull" }); }
  rouletteStop() { this.send({ t: "action", kind: "stop" }); }
  useObject(uid, target) { this.send({ t: "use", uid, target }); }
  useRelic(id) { this.send({ t: "use_relic", id }); }
  buy(id) { this.send({ t: "buy", id }); }
  bid(amount) { this.send({ t: "bid", amount }); }
  again() { this.send({ t: "again" }); }
}
