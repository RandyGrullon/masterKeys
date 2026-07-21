/**
 * Generador procedural de ejercicios de lectura a primera vista.
 *
 * POR QUÉ GENERADO Y NO UN CORPUS FIJO:
 * la medición solo prueba LECTURA si el material es inédito. Con ejercicios
 * repetidos, el alumno los memoriza y el micrófono no puede distinguir leer
 * de recordar — que es exactamente la patología a evitar en este plan.
 * Material infinito y siempre nuevo hace imposible memorizar, y de paso
 * resuelve el problema de derechos de autor.
 *
 * El paseo aleatorio está restringido para producir música PLAUSIBLE (grados
 * conjuntos mayoritarios, saltos ocasionales, resolución hacia la tónica).
 * Notas verdaderamente aleatorias no entrenan lectura: entrenan descifrado
 * símbolo a símbolo, que es el hábito que queremos romper.
 */

import { diatonicIndex } from './theory.js';

/** PRNG con semilla — mulberry32. Reproducible para depurar un ejercicio. */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semitonos desde la tónica para cada grado de una escala mayor. */
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];

/** Tónicas soportadas. El plan trabaja DO, SOL y FA en la Fase 1. */
export const KEYS = {
  C: { name: 'DO mayor', tonicPc: 0, sharps: 0, flats: 0 },
  G: { name: 'SOL mayor', tonicPc: 7, sharps: 1, flats: 0 },
  F: { name: 'FA mayor', tonicPc: 5, sharps: 0, flats: 1 },
};

/**
 * Niveles alineados con la Fase 1 del plan.
 * `maxInterval` está en GRADOS de la escala, no en semitonos.
 */
export const LEVELS = [
  {
    id: 1,
    name: 'Anclas',
    description: 'Solo las 4 notas ancla. Reconocimiento puro.',
    clefs: ['treble', 'bass'],
    keys: ['C'],
    anchorsOnly: true,
    maxInterval: 7,
    length: 8,
    range: { treble: [60, 72], bass: [48, 60] },
  },
  {
    id: 2,
    name: 'Grados conjuntos',
    description: 'Movimiento por segundas alrededor de las anclas.',
    clefs: ['treble'],
    keys: ['C'],
    anchorsOnly: false,
    maxInterval: 1,
    length: 10,
    range: { treble: [60, 74], bass: [45, 60] },
  },
  {
    id: 3,
    name: 'Terceras',
    description: 'Se añaden saltos de tercera: línea a línea, espacio a espacio.',
    clefs: ['treble'],
    keys: ['C'],
    anchorsOnly: false,
    maxInterval: 2,
    length: 12,
    range: { treble: [59, 76], bass: [45, 60] },
  },
  {
    id: 4,
    name: 'Dos claves',
    description: 'Clave de sol y de fa alternando. Intervalos hasta la quinta.',
    clefs: ['treble', 'bass'],
    keys: ['C'],
    anchorsOnly: false,
    maxInterval: 4,
    length: 12,
    range: { treble: [59, 79], bass: [40, 60] },
  },
  {
    id: 5,
    name: 'Otras tonalidades',
    description: 'Se añaden SOL y FA mayor. Aparecen las alteraciones.',
    clefs: ['treble', 'bass'],
    keys: ['C', 'G', 'F'],
    anchorsOnly: false,
    maxInterval: 4,
    length: 14,
    range: { treble: [59, 79], bass: [40, 60] },
  },
];

const ANCHOR_MIDIS = [53, 60, 67, 72];

/** Todas las alturas de la tonalidad dentro de un rango. */
function scalePitches(tonicPc, [lo, hi]) {
  const out = [];
  for (let midi = lo; midi <= hi; midi++) {
    const rel = ((midi - tonicPc) % 12 + 12) % 12;
    if (MAJOR_STEPS.includes(rel)) out.push(midi);
  }
  return out;
}

/**
 * Genera un ejercicio. Sin `seed` usa la hora actual, de modo que cada
 * ejercicio es distinto: es el punto del diseño.
 */
export function generateExercise(levelId, seed = Date.now()) {
  const level = LEVELS.find((l) => l.id === levelId) ?? LEVELS[0];
  const rng = makeRng(seed);
  const keyId = level.keys[Math.floor(rng() * level.keys.length)];
  const key = KEYS[keyId];

  const notes = [];
  let clef = level.clefs[0];
  let prevIdx = null;

  for (let i = 0; i < level.length; i++) {
    // En nivel 4+ la clave puede cambiar por frases de 3-4 notas, nunca nota
    // a nota: saltar de clave cada nota es un ejercicio artificial que no
    // aparece en música real.
    if (level.clefs.length > 1 && i > 0 && i % 4 === 0) {
      clef = level.clefs[Math.floor(rng() * level.clefs.length)];
      prevIdx = null;
    } else if (i === 0) {
      clef = level.clefs[Math.floor(rng() * level.clefs.length)];
    }

    let pool;
    if (level.anchorsOnly) {
      const range = level.range[clef];
      pool = ANCHOR_MIDIS.filter((m) => m >= range[0] && m <= range[1]);
      if (pool.length === 0) pool = ANCHOR_MIDIS.slice();
    } else {
      pool = scalePitches(key.tonicPc, level.range[clef]);
    }

    let midi;
    if (prevIdx === null) {
      midi = pool[Math.floor(rng() * pool.length)];
    } else {
      // Candidatos dentro del intervalo máximo, medido en grados de escala.
      const near = pool.filter((m) => {
        const d = Math.abs(diatonicIndex(m) - prevIdx);
        return d > 0 && d <= level.maxInterval;
      });
      const candidates = near.length ? near : pool;
      // Sesgo hacia grados conjuntos: la música real se mueve mayormente por
      // segundas, y leer saltos constantes no representa nada.
      const stepwise = candidates.filter((m) => Math.abs(diatonicIndex(m) - prevIdx) === 1);
      midi =
        stepwise.length && rng() < 0.6
          ? stepwise[Math.floor(rng() * stepwise.length)]
          : candidates[Math.floor(rng() * candidates.length)];
    }

    prevIdx = diatonicIndex(midi);
    notes.push({ midi, clef, duration: 1 });
  }

  return {
    seed,
    levelId: level.id,
    levelName: level.name,
    keyId,
    keyName: key.name,
    notes,
  };
}
