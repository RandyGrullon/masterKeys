/**
 * Ritmo: duraciones, compases y su descripción en palabras.
 *
 * POR QUÉ IMPORTA TANTO: el PLAN.md lo dice sin rodeos — "el 90% de los errores
 * de lectura son de ritmo, no de notas". Hasta ahora la app solo generaba negras,
 * así que entrenaba media habilidad.
 *
 * Las duraciones se miden en PULSOS (beats), no en segundos: 1 = negra.
 * Así el compás y el tempo son independientes de la notación.
 */

/** Duraciones en pulsos, con su nombre y cómo se dibujan. */
export const DURATIONS = {
  4: { name: 'redonda', hollow: true, stem: false, flags: 0, dotted: false, count: '1 - 2 - 3 - 4' },
  3: { name: 'blanca con puntillo', hollow: true, stem: true, flags: 0, dotted: true, count: '1 - 2 - 3' },
  2: { name: 'blanca', hollow: true, stem: true, flags: 0, dotted: false, count: '1 - 2' },
  1.5: { name: 'negra con puntillo', hollow: false, stem: true, flags: 0, dotted: true, count: '1 - y' },
  1: { name: 'negra', hollow: false, stem: true, flags: 0, dotted: false, count: '1' },
  0.5: { name: 'corchea', hollow: false, stem: true, flags: 1, dotted: false, count: 'medio pulso' },
};

export function describeDuration(beats) {
  return DURATIONS[beats] ?? { name: `${beats} pulsos`, hollow: false, stem: true, flags: 0, dotted: false, count: '' };
}

/** Compases soportados. El plan trabaja 3/4 (vals) en las tres piezas. */
export const TIME_SIGNATURES = {
  '3/4': { beats: 3, unit: 4, label: '3/4', accent: 'UN - dos - tres', description: 'vals' },
  '4/4': { beats: 4, unit: 4, label: '4/4', accent: 'UN - dos - tres - cuatro', description: 'compasillo' },
};

/**
 * Reparte una secuencia de duraciones en compases, sin que ninguna figura
 * cruce la barra: al llenar el compás se corta. Devuelve el número de compás
 * y la posición dentro de él para cada evento.
 */
export function assignMeasures(durations, beatsPerMeasure) {
  const out = [];
  let measure = 0;
  let beatInMeasure = 0;
  let absolute = 0;
  for (const d of durations) {
    out.push({ duration: d, measure, beatInMeasure, absoluteBeat: absolute });
    beatInMeasure += d;
    absolute += d;
    // Tolerancia por aritmética de punto flotante con 0.5 y 1.5.
    if (beatInMeasure >= beatsPerMeasure - 1e-9) {
      measure++;
      beatInMeasure = 0;
    }
  }
  return out;
}

/**
 * Elige duraciones que SUMEN exactamente compases completos.
 *
 * Rellenar compás a compás (en vez de tirar figuras al azar) garantiza que
 * ninguna nota quede cruzando una barra, que es cómo se escribe música real
 * y lo que hay que aprender a leer.
 */
export function fillMeasures(rng, allowed, beatsPerMeasure, measureCount) {
  const result = [];
  for (let m = 0; m < measureCount; m++) {
    let left = beatsPerMeasure;
    let guard = 0;
    while (left > 1e-9 && guard++ < 64) {
      const fits = allowed.filter((d) => d <= left + 1e-9);
      if (!fits.length) break;
      const pick = fits[Math.floor(rng() * fits.length)];
      result.push(pick);
      left -= pick;
    }
    // Si quedó un hueco por redondeo, se cierra con la figura más pequeña.
    if (left > 1e-9) {
      const smallest = Math.min(...allowed);
      while (left > 1e-9) { result.push(smallest); left -= smallest; }
    }
  }
  return result;
}

/** Segundos por pulso a un tempo dado. */
export const beatSeconds = (bpm) => 60 / bpm;

/**
 * Evalúa la precisión rítmica: desviación entre cuándo debía sonar la nota y
 * cuándo sonó, en milisegundos. Se devuelve con signo (negativo = adelantado).
 */
export function timingError(expectedBeat, playedAtMs, startMs, bpm) {
  const expectedMs = startMs + expectedBeat * beatSeconds(bpm) * 1000;
  return Math.round(playedAtMs - expectedMs);
}

/** Umbral de "a tiempo": ±15% del pulso, criterio habitual en pedagogía. */
export function inTime(errorMs, bpm) {
  return Math.abs(errorMs) <= beatSeconds(bpm) * 1000 * 0.15;
}
