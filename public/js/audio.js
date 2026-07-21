// WebAudio: zumbido ambiente + SFX sintetizados + voz distorsionada del telefono.
// El AudioContext se crea recien con el primer gesto del usuario (click de entrar).

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambGain = null;
    this.ringOsc = null;
    this.enabled = true;
  }

  start() {
    if (this.ctx || !this.enabled) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { this.enabled = false; return; }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    this._ambient();
  }

  _ambient() {
    const ctx = this.ctx;
    // zumbido grave
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 52;
    const og = ctx.createGain();
    og.gain.value = 0.05;
    osc.connect(og).connect(this.master);
    osc.start();
    // ruido filtrado (aire del cuarto)
    const noise = this._noiseBuffer(2);
    const src = ctx.createBufferSource();
    src.buffer = noise; src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 320;
    const ng = ctx.createGain(); ng.gain.value = 0.015;
    src.connect(lp).connect(ng).connect(this.master);
    src.start();
    this.ambGain = og;
  }

  _noiseBuffer(secs) {
    const len = this.ctx.sampleRate * secs;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _beep(freq, dur, type = "square", vol = 0.2, slideTo = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  _noiseBurst(dur, vol = 0.3, freq = 800) {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(dur + 0.05);
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = freq;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(this.master);
    src.start(); src.stop(t + dur + 0.05);
  }

  sfx(kind) {
    if (!this.ctx) return;
    switch (kind) {
      case "good": this._beep(520, 0.09, "square", 0.18); setTimeout(() => this._beep(780, 0.12, "square", 0.16), 90); break;
      case "bad": this._noiseBurst(0.4, 0.4, 260); this._beep(120, 0.4, "sawtooth", 0.2, 40); break;
      case "info": this._beep(660, 0.06, "sine", 0.15); setTimeout(() => this._beep(660, 0.06, "sine", 0.12), 120); break;
      case "weird": this._beep(300, 0.3, "triangle", 0.15, 520); break;
      case "deal": this._beep(90, 0.12, "sawtooth", 0.25, 200); this._noiseBurst(0.1, 0.15, 500); break;
      case "push": this._beep(400, 0.12, "sine", 0.12, 180); break;
      case "click": this._beep(700, 0.03, "square", 0.1); break;
      case "coin": this._beep(880, 0.05, "square", 0.15); setTimeout(() => this._beep(1180, 0.07, "square", 0.13), 50); break;
    }
  }

  ring(times = 2) {
    if (!this.ctx) return;
    let n = 0;
    const one = () => {
      if (n++ >= times) return;
      const t = this.ctx.currentTime;
      for (let i = 0; i < 8; i++) {
        this._beep(1000, 0.05, "square", 0.12);
      }
      // dos tonos tipo telefono
      this._beep(480, 0.4, "sine", 0.18);
      this._beep(620, 0.4, "sine", 0.15);
      setTimeout(one, 900);
    };
    one();
  }

  // Voz distorsionada + cama de estatica. Devuelve promesa que resuelve al terminar.
  speak(text) {
    return new Promise((resolve) => {
      // cama de estatica bajo la voz
      if (this.ctx) {
        const src = this.ctx.createBufferSource();
        src.buffer = this._noiseBuffer(3);
        const bp = this.ctx.createBiquadFilter();
        bp.type = "bandpass"; bp.frequency.value = 1500; bp.Q.value = 0.7;
        const g = this.ctx.createGain(); g.gain.value = 0.02;
        src.connect(bp).connect(g).connect(this.master);
        src.start();
        setTimeout(() => { try { src.stop(); } catch {} }, 4000);
      }
      try {
        const synth = window.speechSynthesis;
        if (!synth) { setTimeout(resolve, 1600); return; }
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "es-ES";
        u.pitch = 0.2;
        u.rate = 0.85;
        u.volume = 1;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        synth.cancel();
        synth.speak(u);
        setTimeout(resolve, 5000); // fallback
      } catch { setTimeout(resolve, 1600); }
    });
  }
}
