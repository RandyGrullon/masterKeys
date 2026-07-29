/**
 * Metrónomo por Web Audio.
 *
 * El plan lo llama "obligatorio", y con razón: sin referencia externa de pulso
 * el alumno ajusta el tempo a lo que le sale, que es cómo se fosilizan los
 * errores de ritmo.
 *
 * El agendado va por adelantado con el reloj del AudioContext (no setInterval),
 * porque los temporizadores de JS derivan y un metrónomo que se arrastra es
 * peor que ninguno.
 */

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.12;

export class Metronome {
  constructor({ bpm = 60, beatsPerMeasure = 3, onBeat } = {}) {
    this.bpm = bpm;
    this.beatsPerMeasure = beatsPerMeasure;
    this.onBeat = onBeat ?? (() => {});
    this.ctx = null;
    this.running = false;
    this._nextNoteTime = 0;
    this._beat = 0;
    this._timer = null;
    /** Tiempo del AudioContext en que arrancó el pulso 0. */
    this.startedAtCtx = 0;
    /** performance.now() equivalente, para medir desviación rítmica. */
    this.startedAtMs = 0;
  }

  _ensure() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  start() {
    if (this.running) return;
    const ctx = this._ensure();
    this.running = true;
    this._beat = 0;
    this._nextNoteTime = ctx.currentTime + 0.08;
    this.startedAtCtx = this._nextNoteTime;
    this.startedAtMs = performance.now() + (this._nextNoteTime - ctx.currentTime) * 1000;
    this._loop();
  }

  stop() {
    this.running = false;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }

  _loop() {
    if (!this.running) return;
    const ctx = this.ctx;
    const spb = 60 / this.bpm;
    while (this._nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
      const isDownbeat = this._beat % this.beatsPerMeasure === 0;
      this._click(this._nextNoteTime, isDownbeat);
      this.onBeat(this._beat, isDownbeat, this._nextNoteTime);
      this._nextNoteTime += spb;
      this._beat++;
    }
    this._timer = setTimeout(() => this._loop(), LOOKAHEAD_MS);
  }

  /** Clic corto; el tiempo 1 suena más agudo para marcar el compás. */
  _click(when, isDownbeat) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = isDownbeat ? 1600 : 1100;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(isDownbeat ? 0.16 : 0.09, when + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + 0.06);
  }
}
