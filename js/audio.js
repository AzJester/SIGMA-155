/* SIGMA 155: FIRE MISSION — synthesized audio (Web Audio API, no asset files).
   Everything is generated: noise bursts, filtered booms, whistles, alarms, UI ticks. */
'use strict';

const Sfx = {
  ctx: null,
  master: null,
  enabled: true,
  _noiseBuf: null,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // 2-second white noise buffer reused by all noise-based effects
    const len = this.ctx.sampleRate * 2;
    this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this._noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  setEnabled(on) { this.enabled = on; if (this.master) this.master.gain.value = on ? 0.5 : 0; },

  _noise(t0, dur, freq, q, gain, slideTo) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this._noiseBuf; src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.05);
  },

  _tone(t0, dur, type, f0, f1, gain) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  },

  /* Big muzzle blast: low thump + crack + airy tail */
  fire() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, 0.55, 'sine', 110, 28, 0.9);
    this._noise(t, 0.12, 2400, 0.6, 0.55);
    this._noise(t + 0.02, 0.9, 350, 0.8, 0.5, 70);
  },

  /* Distant impact: volume/brightness falls with distance (m) */
  impact(dist) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const a = Math.max(0.06, Math.min(1, 2200 / Math.max(300, dist)));
    this._tone(t, 0.8, 'sine', 70, 24, 0.8 * a);
    this._noise(t, 0.7 + 0.5 * a, 220 + 500 * a, 0.7, 0.55 * a, 60);
  },

  /* Incoming shell whistle, descending */
  whistle(dur) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, dur || 1.4, 'sawtooth', 2300, 700, 0.045);
  },

  alarm() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      this._tone(t + i * 0.28, 0.2, 'square', 880, 880, 0.10);
      this._tone(t + i * 0.28 + 0.1, 0.16, 'square', 660, 660, 0.10);
    }
  },

  rws() { // remote weapon station burst
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 5; i++) this._noise(t + i * 0.07, 0.05, 1500, 1.5, 0.18);
  },

  droneDown() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, 0.7, 'sawtooth', 600, 90, 0.12);
    this._noise(t + 0.5, 0.4, 400, 0.8, 0.3);
  },

  intercept() { // Iron Fist hard-kill
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.18, 3000, 0.8, 0.4);
    this._tone(t, 0.3, 'sine', 240, 60, 0.4);
  },

  emplace() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.9, 160, 1.2, 0.22, 90);
    this._tone(t + 0.7, 0.25, 'sine', 90, 50, 0.3);
  },

  lay() { // turret/elevation drive
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.35, 420, 2.5, 0.07);
  },

  click() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, 0.06, 'square', 1400, 900, 0.06);
  },

  confirm() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, 0.09, 'square', 880, 880, 0.07);
    this._tone(t + 0.09, 0.12, 'square', 1320, 1320, 0.07);
  },

  deny() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, 0.16, 'square', 220, 160, 0.09);
  },

  rearm() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) this._noise(t + i * 0.5, 0.2, 300 + i * 80, 2, 0.12);
  },

  win() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => this._tone(t + i * 0.16, 0.3, 'triangle', f, f, 0.12));
  },

  lose() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    [392, 330, 262, 196].forEach((f, i) => this._tone(t + i * 0.22, 0.4, 'triangle', f, f, 0.12));
  }
};
