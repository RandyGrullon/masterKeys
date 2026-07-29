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
 * MODELO DE DATOS: un ejercicio es una lista de EVENTOS. Cada evento es una
 * porción vertical de tiempo con una o más notas (una nota suelta, un acorde,
 * o las dos manos a la vez) y una duración en pulsos. Así el mismo motor cubre
 * desde "una negra en clave de sol" hasta "vals a dos manos en 3/4".
 */

import { diatonicIndex } from './theory.js';
import { fillMeasures, assignMeasures, TIME_SIGNATURES } from './rhythm.js';

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

/** Tonalidades soportadas, en el orden en que las introduce el plan. */
export const KEYS = {
  C: { name: 'DO mayor', tonicPc: 0, sharps: 0, flats: 0 },
  G: { name: 'SOL mayor', tonicPc: 7, sharps: 1, flats: 0 },
  F: { name: 'FA mayor', tonicPc: 5, sharps: 0, flats: 1 },
  Bb: { name: 'SI♭ mayor', tonicPc: 10, sharps: 0, flats: 2 },
};

/**
 * Escalera de niveles alineada con las fases del PLAN.md.
 *
 *   rhythm    duraciones permitidas, en pulsos (1 = negra)
 *   hands     'one' | 'two'  — 'two' genera notas simultáneas en ambas claves
 *   texture   'single' | 'triad' | 'waltz'
 *   phase     a qué fase del plan pertenece, para orientar al alumno
 */
export const LEVELS = [
  // ── Fase 1 · Alfabetización ────────────────────────────────────────
  {
    id: 1, phase: 1, name: 'Anclas',
    description: 'Solo las 4 notas ancla. Reconocimiento puro.',
    clefs: ['treble', 'bass'], keys: ['C'], anchorsOnly: true,
    maxInterval: 7, measures: 3, rhythm: [1], hands: 'one', texture: 'single',
    range: { treble: [60, 72], bass: [48, 60] },
  },
  {
    id: 2, phase: 1, name: 'Grados conjuntos',
    description: 'Movimiento por segundas alrededor de las anclas.',
    clefs: ['treble'], keys: ['C'], anchorsOnly: false,
    maxInterval: 1, measures: 4, rhythm: [1], hands: 'one', texture: 'single',
    range: { treble: [60, 74], bass: [45, 60] },
  },
  {
    id: 3, phase: 1, name: 'Terceras',
    description: 'Saltos de tercera: línea a línea, espacio a espacio.',
    clefs: ['treble'], keys: ['C'], anchorsOnly: false,
    maxInterval: 2, measures: 4, rhythm: [1], hands: 'one', texture: 'single',
    range: { treble: [59, 76], bass: [45, 60] },
  },
  {
    id: 4, phase: 1, name: 'Dos claves',
    description: 'Clave de sol y de fa alternando. Intervalos hasta la quinta.',
    clefs: ['treble', 'bass'], keys: ['C'], anchorsOnly: false,
    maxInterval: 4, measures: 4, rhythm: [1], hands: 'one', texture: 'single',
    range: { treble: [59, 79], bass: [40, 60] },
  },
  // ── Ritmo — el hueco que el plan señala como el 90% de los errores ──
  {
    id: 5, phase: 1, name: 'Ritmo: blancas y redondas',
    description: 'Aparecen figuras largas. Hay que contar, no solo nombrar.',
    clefs: ['treble', 'bass'], keys: ['C'], anchorsOnly: false,
    maxInterval: 4, measures: 4, rhythm: [1, 2, 3], hands: 'one', texture: 'single',
    range: { treble: [59, 79], bass: [40, 60] },
  },
  {
    id: 6, phase: 1, name: 'Ritmo: corcheas',
    description: 'Medio pulso. El conteo pasa a «1 - y».',
    clefs: ['treble', 'bass'], keys: ['C'], anchorsOnly: false,
    maxInterval: 4, measures: 4, rhythm: [0.5, 1, 2], hands: 'one', texture: 'single',
    range: { treble: [59, 79], bass: [40, 60] },
  },
  {
    id: 7, phase: 1, name: 'Ritmo: puntillos',
    description: 'El puntillo añade la mitad del valor. Sale mucho en las dos piezas.',
    clefs: ['treble', 'bass'], keys: ['C'], anchorsOnly: false,
    maxInterval: 4, measures: 4, rhythm: [0.5, 1, 1.5, 2, 3], hands: 'one', texture: 'single',
    range: { treble: [59, 79], bass: [40, 60] },
  },
  {
    id: 8, phase: 1, name: 'Otras tonalidades',
    description: 'Se añaden SOL y FA mayor. Aparecen las alteraciones.',
    clefs: ['treble', 'bass'], keys: ['C', 'G', 'F'], anchorsOnly: false,
    maxInterval: 4, measures: 4, rhythm: [0.5, 1, 1.5, 2], hands: 'one', texture: 'single',
    range: { treble: [59, 79], bass: [40, 60] },
  },
  // ── Fase 2 · Puente técnico ────────────────────────────────────────
  {
    id: 9, phase: 2, name: 'Dos manos',
    description: 'Ambas claves A LA VEZ. La habilidad real de las piezas.',
    clefs: ['treble', 'bass'], keys: ['C', 'G'], anchorsOnly: false,
    maxInterval: 4, measures: 4, rhythm: [1, 2], hands: 'two', texture: 'single',
    range: { treble: [60, 79], bass: [40, 59] },
  },
  {
    id: 10, phase: 2, name: 'Acordes de tríada',
    description: 'Tres notas juntas en la mano derecha.',
    clefs: ['treble'], keys: ['C', 'G', 'F'], anchorsOnly: false,
    maxInterval: 4, measures: 4, rhythm: [1, 2], hands: 'one', texture: 'triad',
    range: { treble: [60, 79], bass: [40, 59] },
  },
  {
    id: 11, phase: 2, name: 'Vals: bajo–acorde–acorde',
    description: 'El patrón de 3/4 que mueve Howl\'s y La La Land.',
    clefs: ['treble', 'bass'], keys: ['C', 'G', 'F'], anchorsOnly: false,
    maxInterval: 4, measures: 4, rhythm: [1], hands: 'two', texture: 'waltz',
    range: { treble: [60, 79], bass: [36, 55] },
  },
  // ── Fase 3 · Bemoles (Howl's) ──────────────────────────────────────
  {
    id: 12, phase: 3, name: 'Bemoles',
    description: 'FA y SI♭ mayor, las tonalidades de Howl\'s.',
    clefs: ['treble', 'bass'], keys: ['F', 'Bb'], anchorsOnly: false,
    maxInterval: 4, measures: 4, rhythm: [0.5, 1, 1.5, 2], hands: 'two', texture: 'single',
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

/** Construye una tríada (1-3-5) sobre una nota, dentro de la tonalidad. */
function triadOn(rootMidi, pool) {
  const idx = pool.indexOf(rootMidi);
  if (idx === -1) return [rootMidi];
  // Terceras diatónicas = saltar un grado de la escala cada vez.
  const third = pool[idx + 2];
  const fifth = pool[idx + 4];
  return [rootMidi, third, fifth].filter((m) => m !== undefined);
}

/** Elige la siguiente altura con paseo restringido (música plausible). */
function nextPitch(rng, pool, prevIdx, maxInterval) {
  if (prevIdx === null) return pool[Math.floor(rng() * pool.length)];
  const near = pool.filter((m) => {
    const d = Math.abs(diatonicIndex(m) - prevIdx);
    return d > 0 && d <= maxInterval;
  });
  const candidates = near.length ? near : pool;
  // Sesgo hacia grados conjuntos: la música real se mueve mayormente por
  // segundas, y leer saltos constantes no representa nada.
  const stepwise = candidates.filter((m) => Math.abs(diatonicIndex(m) - prevIdx) === 1);
  return stepwise.length && rng() < 0.6
    ? stepwise[Math.floor(rng() * stepwise.length)]
    : candidates[Math.floor(rng() * candidates.length)];
}

/**
 * Genera un ejercicio. Sin `seed` usa la hora actual, de modo que cada
 * ejercicio es distinto: es el punto del diseño.
 */
export function generateExercise(levelId, seed = Date.now(), timeSigKey = '3/4') {
  const level = LEVELS.find((l) => l.id === levelId) ?? LEVELS[0];
  const rng = makeRng(seed);
  const keyId = level.keys[Math.floor(rng() * level.keys.length)];
  const key = KEYS[keyId];
  const ts = TIME_SIGNATURES[timeSigKey] ?? TIME_SIGNATURES['3/4'];

  // ── El vals tiene una estructura rítmica fija: 3 negras por compás ──
  if (level.texture === 'waltz') {
    return waltzExercise({ level, key, keyId, rng, ts, seed });
  }

  // ── Ritmo primero: figuras que llenen compases exactos ──────────────
  const durations = fillMeasures(rng, level.rhythm, ts.beats, level.measures);
  const slots = assignMeasures(durations, ts.beats);

  const events = [];
  let clef = level.clefs[Math.floor(rng() * level.clefs.length)];
  let prevTreble = null;
  let prevBass = null;

  slots.forEach((slot, i) => {
    // La clave cambia por frases, nunca nota a nota (eso no existe en música
    // real y solo entrenaría a saltar de pentagrama).
    if (level.hands === 'one' && level.clefs.length > 1 && i > 0 && i % 4 === 0) {
      const picked = level.clefs[Math.floor(rng() * level.clefs.length)];
      // Solo se reinicia el paseo si la clave CAMBIÓ de verdad. Reiniciarlo
      // cuando el sorteo repite la misma clave metía un salto grande en medio
      // de una línea continua, sin motivo visible para quien lee.
      if (picked !== clef) {
        clef = picked;
        if (clef === 'treble') prevTreble = null; else prevBass = null;
      }
    }

    const notes = [];

    if (level.hands === 'two') {
      // Mano derecha siempre; izquierda en los pulsos fuertes, para que la
      // textura sea legible y no un muro de notas.
      const tPool = level.anchorsOnly
        ? ANCHOR_MIDIS.filter((m) => m >= level.range.treble[0] && m <= level.range.treble[1])
        : scalePitches(key.tonicPc, level.range.treble);
      const t = nextPitch(rng, tPool, prevTreble, level.maxInterval);
      prevTreble = diatonicIndex(t);
      notes.push({ midi: t, clef: 'treble' });

      if (slot.beatInMeasure < 1e-9 || rng() < 0.35) {
        const bPool = scalePitches(key.tonicPc, level.range.bass);
        const b = nextPitch(rng, bPool, prevBass, level.maxInterval);
        prevBass = diatonicIndex(b);
        notes.push({ midi: b, clef: 'bass' });
      }
    } else {
      const pool = level.anchorsOnly
        ? (ANCHOR_MIDIS.filter((m) => m >= level.range[clef][0] && m <= level.range[clef][1]).length
            ? ANCHOR_MIDIS.filter((m) => m >= level.range[clef][0] && m <= level.range[clef][1])
            : ANCHOR_MIDIS.slice())
        : scalePitches(key.tonicPc, level.range[clef]);
      const prev = clef === 'treble' ? prevTreble : prevBass;
      const m = nextPitch(rng, pool, prev, level.maxInterval);
      if (clef === 'treble') prevTreble = diatonicIndex(m); else prevBass = diatonicIndex(m);

      if (level.texture === 'triad') {
        for (const n of triadOn(m, pool)) notes.push({ midi: n, clef });
      } else {
        notes.push({ midi: m, clef });
      }
    }

    events.push({ ...slot, notes });
  });

  return {
    seed, levelId: level.id, levelName: level.name, phase: level.phase,
    keyId, keyName: key.name, timeSignature: ts.label, beatsPerMeasure: ts.beats,
    events,
  };
}

/**
 * Vals: en cada compás de 3/4, el tiempo 1 lleva el bajo de la tónica y los
 * tiempos 2 y 3 el acorde. Es literalmente el ejercicio de la Fase 2 del plan.
 */
function waltzExercise({ level, key, keyId, rng, ts, seed }) {
  const bassPool = scalePitches(key.tonicPc, level.range.bass);
  const treblePool = scalePitches(key.tonicPc, level.range.treble);
  const events = [];
  let absolute = 0;

  for (let m = 0; m < level.measures; m++) {
    // Raíz del compás: grados I, IV, V o vi (los del plan: C, F, G, Am).
    const degree = [0, 3, 4, 5][Math.floor(rng() * 4)];
    const root = bassPool[degree] ?? bassPool[0];
    const chordRoot = treblePool.find((n) => ((n - root) % 12 + 12) % 12 === 0) ?? treblePool[0];
    const chord = triadOn(chordRoot, treblePool).slice(1); // 3ª y 5ª, sin la raíz

    // Tiempo 1: bajo solo.
    events.push({
      duration: 1, measure: m, beatInMeasure: 0, absoluteBeat: absolute,
      notes: [{ midi: root, clef: 'bass' }],
    });
    absolute += 1;
    // Tiempos 2 y 3: el acorde.
    for (let b = 1; b < 3; b++) {
      events.push({
        duration: 1, measure: m, beatInMeasure: b, absoluteBeat: absolute,
        notes: chord.map((midi) => ({ midi, clef: 'treble' })),
      });
      absolute += 1;
    }
  }

  return {
    seed, levelId: level.id, levelName: level.name, phase: level.phase,
    keyId, keyName: key.name, timeSignature: ts.label, beatsPerMeasure: ts.beats,
    events,
  };
}

/** Todas las alturas de un evento, en orden ascendente. */
export const eventMidis = (event) => event.notes.map((n) => n.midi).sort((a, b) => a - b);
