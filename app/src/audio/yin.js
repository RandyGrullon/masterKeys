/**
 * Detección de tono YIN.
 *
 * Elegido sobre la autocorrelación simple porque un piano acústico tiene
 * armónicos muy fuertes: la autocorrelación se engancha con frecuencia al
 * primer armónico y reporta la nota una octava arriba. La función de
 * diferencia media acumulada (paso 2) es justo lo que corrige eso.
 *
 * Verificado en test-yin.mjs: 25/25 con timbre de piano sintético, ruido de
 * sala y desafinación de +30 cents.
 *
 * LÍMITE CONOCIDO: es monofónico. Ante un acorde reporta el "fundamental
 * virtual" (un DO mayor da DO2) con confianza ALTA. La confianza NO sirve
 * para filtrar polifonía — por eso la app solo lo usa en drills de nota suelta.
 *
 * Referencia: de Cheveigné & Kawahara (2002).
 */

const DEFAULTS = {
  threshold: 0.15,
  minFrequency: 55,
  maxFrequency: 2100,
  silenceThreshold: 0.008,
};

export function detectPitch(buffer, options) {
  const {
    sampleRate,
    threshold = DEFAULTS.threshold,
    minFrequency = DEFAULTS.minFrequency,
    maxFrequency = DEFAULTS.maxFrequency,
    silenceThreshold = DEFAULTS.silenceThreshold,
  } = options;

  // ── Puerta de silencio ──────────────────────────────────────────────
  let sumSquares = 0;
  for (let i = 0; i < buffer.length; i++) sumSquares += buffer[i] * buffer[i];
  const rms = Math.sqrt(sumSquares / buffer.length);
  if (rms < silenceThreshold) return { frequency: null, confidence: 0, rms };

  const minTau = Math.max(2, Math.floor(sampleRate / maxFrequency));
  const maxTau = Math.min(
    Math.floor(sampleRate / minFrequency),
    Math.floor(buffer.length / 2),
  );
  if (maxTau <= minTau) return { frequency: null, confidence: 0, rms };

  // ── Paso 1: función de diferencia ───────────────────────────────────
  const diff = new Float32Array(maxTau + 1);
  const limit = buffer.length - maxTau;
  for (let tau = minTau; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < limit; i++) {
      const delta = buffer[i] - buffer[i + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }

  // ── Paso 2: diferencia media acumulada normalizada ──────────────────
  const cmnd = new Float32Array(maxTau + 1);
  cmnd[minTau] = 1;
  let runningSum = 0;
  for (let tau = minTau; tau <= maxTau; tau++) {
    runningSum += diff[tau];
    cmnd[tau] = runningSum === 0 ? 1 : (diff[tau] * (tau - minTau + 1)) / runningSum;
  }

  // ── Paso 3: umbral absoluto ─────────────────────────────────────────
  // El PRIMER mínimo bajo el umbral, no el global: el global suele caer en un
  // múltiplo del periodo y produce error de octava.
  let tauEstimate = -1;
  for (let tau = minTau; tau <= maxTau; tau++) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 <= maxTau && cmnd[tau + 1] < cmnd[tau]) tau++;
      tauEstimate = tau;
      break;
    }
  }
  if (tauEstimate === -1) return { frequency: null, confidence: 0, rms };

  // ── Paso 4: interpolación parabólica ────────────────────────────────
  let betterTau = tauEstimate;
  if (tauEstimate > minTau && tauEstimate < maxTau) {
    const s0 = cmnd[tauEstimate - 1];
    const s1 = cmnd[tauEstimate];
    const s2 = cmnd[tauEstimate + 1];
    const denominator = 2 * (2 * s1 - s2 - s0);
    if (denominator !== 0) betterTau = tauEstimate + (s2 - s0) / denominator;
  }

  return {
    frequency: sampleRate / betterTau,
    confidence: Math.max(0, Math.min(1, 1 - cmnd[tauEstimate])),
    rms,
  };
}
