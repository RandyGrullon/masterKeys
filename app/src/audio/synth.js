/**
 * Sintetizador de piano por Web Audio — sin archivos de samples.
 *
 * Se sintetiza en vez de cargar samples para no romper el modo offline (el
 * service worker cachea una lista fija de archivos; un .mp3 de piano pesaría
 * mucho y habría que gestionarlo aparte). El timbre es aditivo: unos pocos
 * armónicos con amplitud decreciente y una envolvente de ataque rápido y
 * decaimiento exponencial, que es como suena una cuerda percutida.
 *
 * El AudioContext solo puede sonar tras un gesto del usuario; se reanuda al
 * primer toque o al empezar sesión.
 */

import { midiToFrequency } from '../music/theory.js';

// Armónicos y su peso relativo. El fundamental domina para que el tono sea
// cálido y su altura, inequívoca; los superiores dan el brillo del ataque.
const PARTIALS = [
  { mult: 1, gain: 1.0 },
  { mult: 2, gain: 0.5 },
  { mult: 3, gain: 0.32 },
  { mult: 4, gain: 0.18 },
  { mult: 5, gain: 0.1 },
  { mult: 6, gain: 0.05 },
];

export class Synth {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
  }

  _ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      // Filtro suave: quita la aspereza de los armónicos altos.
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 4500;
      this.master.connect(lp);
      lp.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  /** Reanuda el contexto tras un gesto del usuario (toque, botón). */
  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  /** Toca una nota. velocity 1..127 escala el volumen. */
  play(midi, velocity = 100) {
    if (!this.enabled) return;
    const ctx = this._ensure();
    const now = ctx.currentTime;
    const freq = midiToFrequency(midi);

    // Notas graves suenan más tiempo, como en un piano real.
    const dur = midi < 60 ? 2.4 : midi < 72 ? 1.8 : 1.3;
    const peak = Math.max(0.05, Math.min(1, velocity / 127)) * 0.9;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(peak, now + 0.005); // ataque rápido
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur); // decaimiento
    env.connect(this.master);

    const oscs = [];
    for (const p of PARTIALS) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * p.mult;
      const g = ctx.createGain();
      g.gain.value = p.gain;
      osc.connect(g);
      g.connect(env);
      osc.start(now);
      osc.stop(now + dur + 0.05);
      oscs.push(osc);
    }
    // Liberar nodos al terminar.
    oscs[0].onended = () => {
      env.disconnect();
      for (const o of oscs) o.disconnect();
    };
  }
}
