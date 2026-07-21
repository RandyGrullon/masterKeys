/**
 * Captura de micrófono + detección de ataques (onsets).
 *
 * Detectar el TONO no basta: en un piano acústico la nota anterior sigue
 * sonando mientras entra la siguiente. Hace falta decidir cuándo hay una nota
 * NUEVA. Aquí se combinan dos señales:
 *
 *   1. cambio de altura estable durante varios cuadros seguidos, y
 *   2. re-ataque de energía (subida de RMS sobre el mínimo reciente),
 *      necesario para detectar la misma nota repetida.
 *
 * Se usa AnalyserNode y no AudioWorklet a propósito: el worklet exige servir
 * un archivo aparte y complica el service worker, y para este caso la latencia
 * de ~45 ms del analizador es irrelevante — el umbral pedagógico son 2 s.
 */

import { detectPitch } from './yin.js';
import { frequencyToNote } from '../music/theory.js';

const FFT_SIZE = 4096;
const STABLE_FRAMES = 3; // cuadros seguidos con la misma nota para aceptarla
const MIN_INTERVAL_MS = 110; // anti-rebote entre ataques
const REATTACK_RATIO = 2.2; // subida de RMS que cuenta como nota repetida
const MIN_CONFIDENCE = 0.85;

export class PianoListener {
  constructor({ onNote, onLevel } = {}) {
    this.onNote = onNote ?? (() => {});
    this.onLevel = onLevel ?? (() => {});
    this.ctx = null;
    this.stream = null;
    this.running = false;

    this._buf = new Float32Array(FFT_SIZE);
    this._candidate = null;
    this._stable = 0;
    this._lastMidi = null;
    this._lastTime = 0;
    this._recentMinRms = 1;
  }

  async start() {
    if (this.running) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // Estos procesos están pensados para voz y destruyen la señal de un
        // piano: la cancelación de eco recorta la cola de resonancia y el AGC
        // bombea el volumen entre notas.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
    this.analyser.smoothingTimeConstant = 0;
    source.connect(this.analyser);

    this.running = true;
    this._loop();
  }

  stop() {
    this.running = false;
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.ctx) this.ctx.close();
    this.ctx = null;
    this.stream = null;
  }

  _loop() {
    if (!this.running) return;
    this.analyser.getFloatTimeDomainData(this._buf);

    const result = detectPitch(this._buf, { sampleRate: this.ctx.sampleRate });
    this.onLevel(result.rms ?? 0);

    if (result.frequency && result.confidence >= MIN_CONFIDENCE) {
      const { midi } = frequencyToNote(result.frequency);

      if (this._candidate === midi) this._stable++;
      else {
        this._candidate = midi;
        this._stable = 1;
      }

      if (this._stable === STABLE_FRAMES) {
        const now = performance.now();
        const changedPitch = midi !== this._lastMidi;
        const reattacked = result.rms > this._recentMinRms * REATTACK_RATIO;
        const spaced = now - this._lastTime > MIN_INTERVAL_MS;

        if (spaced && (changedPitch || reattacked)) {
          this._lastMidi = midi;
          this._lastTime = now;
          this._recentMinRms = result.rms;
          this.onNote({ midi, confidence: result.confidence, at: now });
        }
      }
      this._recentMinRms = Math.min(this._recentMinRms, result.rms);
    } else {
      // Silencio: se reinicia para que la próxima nota cuente aunque repita.
      this._candidate = null;
      this._stable = 0;
      this._lastMidi = null;
      this._recentMinRms = 1;
    }

    requestAnimationFrame(() => this._loop());
  }
}
