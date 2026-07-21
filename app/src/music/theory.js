/**
 * Teoría musical: conversión entre frecuencia, MIDI, nombre y POSICIÓN EN EL
 * PENTAGRAMA.
 *
 * El índice diatónico es la pieza central: cuenta grados de la escala (no
 * semitonos), que es exactamente como funciona la altura sobre el pentagrama.
 * DO y DO# ocupan la MISMA línea; por eso no se puede usar el número MIDI
 * directamente para dibujar.
 */

const NAMES_ES = ['DO', 'DO#', 'RE', 'RE#', 'MI', 'FA', 'FA#', 'SOL', 'SOL#', 'LA', 'LA#', 'SI'];
const NAMES_EN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Grado de la escala de cada clase de altura. DO=0, RE=1, ... SI=6. */
const PC_TO_DEGREE = { 0: 0, 1: 0, 2: 1, 3: 1, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4, 9: 5, 10: 5, 11: 6 };
const PC_IS_BLACK = { 1: true, 3: true, 6: true, 8: true, 10: true };

export const A4_HZ = 440;
export const A4_MIDI = 69;

export const midiToFrequency = (midi) => A4_HZ * Math.pow(2, (midi - A4_MIDI) / 12);
export const frequencyToMidiFloat = (hz) => A4_MIDI + 12 * Math.log2(hz / A4_HZ);

export function frequencyToNote(hz) {
  const exact = frequencyToMidiFloat(hz);
  const midi = Math.round(exact);
  return { midi, cents: Math.round((exact - midi) * 100), ...describeMidi(midi) };
}

export function describeMidi(midi) {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1; // MIDI 60 = DO4 (do central)
  return {
    nameEs: `${NAMES_ES[pc]}${octave}`,
    nameEn: `${NAMES_EN[pc]}${octave}`,
    octave,
    isBlack: !!PC_IS_BLACK[pc],
  };
}

/**
 * Índice diatónico: octava*7 + grado. DO4 -> 4*7+0 = 28.
 * Es la coordenada vertical del pentagrama, en pasos de medio espacio.
 */
export function diatonicIndex(midi) {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return octave * 7 + PC_TO_DEGREE[pc];
}

// Anclas de referencia, verificadas contra los diagramas del plan:
//   MI4 = 4*7+2 = 30  -> línea inferior de la clave de SOL
//   SOL2 = 2*7+4 = 18 -> línea inferior de la clave de FA
export const TREBLE_BOTTOM_INDEX = 30;
export const BASS_BOTTOM_INDEX = 18;

/** Las 4 anclas de la Lección 1 del plan. */
export const ANCHORS = [
  { midi: 53, label: 'FA3', hint: '4ª línea de la clave de fa' },
  { midi: 60, label: 'DO4', hint: 'do central, línea adicional' },
  { midi: 67, label: 'SOL4', hint: '2ª línea de la clave de sol' },
  { midi: 72, label: 'DO5', hint: '3er espacio de la clave de sol' },
];

/**
 * ¿Coincide lo detectado con lo esperado?
 * `tolerantOctave` perdona el error de octava, típico en notas graves con el
 * fundamental débil. En los drills de lectura se exige la octava: confundir
 * DO4 con DO5 es precisamente el error que hay que corregir.
 */
export function matchesExpected(detectedMidi, expectedMidi, tolerantOctave = false) {
  if (detectedMidi === expectedMidi) return true;
  return tolerantOctave && Math.abs(detectedMidi - expectedMidi) % 12 === 0;
}

// ── Lógica de lectura (la "literatura" del pentagrama) ─────────────────

const ORD_F = ['', '1ª', '2ª', '3ª', '4ª', '5ª'];
const ORD_M = ['', '1er', '2º', '3er', '4º', '5º'];

/**
 * Describe dónde está una nota en el pentagrama: línea o espacio, y qué número,
 * contando líneas adicionales. Es lo que un principiante necesita oír en
 * palabras: "2ª línea", "1ª línea adicional debajo".
 */
export function describeStaffPosition(midi, clef) {
  const bottom = clef === 'treble' ? TREBLE_BOTTOM_INDEX : BASS_BOTTOM_INDEX;
  const rel = diatonicIndex(midi) - bottom; // 0 = línea inferior
  const clefName = clef === 'treble' ? 'de sol' : 'de fa';

  if (rel >= 0 && rel <= 8) {
    if (rel % 2 === 0) return `${ORD_F[rel / 2 + 1]} línea del pentagrama ${clefName}`;
    return `${ORD_M[(rel - 1) / 2 + 1]} espacio del pentagrama ${clefName}`;
  }
  // Fuera del pentagrama: líneas adicionales.
  if (rel < 0) {
    const n = Math.ceil(-rel / 2);
    return rel % 2 === 0
      ? `${ORD_F[n]} línea adicional debajo`
      : `en el espacio bajo la ${ORD_F[Math.floor((-rel) / 2)] || '1ª'} línea adicional`;
  }
  const over = rel - 8;
  const n = Math.ceil(over / 2);
  return over % 2 === 0
    ? `${ORD_F[n]} línea adicional encima`
    : `en el espacio sobre la ${ORD_F[Math.max(1, Math.floor(over / 2))]} línea adicional`;
}

/**
 * Describe el intervalo entre dos notas — el corazón de la Lección 3 del plan:
 * leer por DISTANCIA, no por nombre. Devuelve el número (2ª, 3ª…), la dirección
 * y la "forma" visual que se ve en el pentagrama.
 */
export function describeInterval(fromMidi, toMidi) {
  const diff = diatonicIndex(toMidi) - diatonicIndex(fromMidi);
  const steps = Math.abs(diff);
  const dir = diff > 0 ? 'hacia arriba' : diff < 0 ? 'hacia abajo' : '';
  const NAMES = ['unísono', '2ª', '3ª', '4ª', '5ª', '6ª', '7ª', '8ª (octava)'];
  const number = NAMES[steps] ?? `${steps + 1}ª`;
  const SHAPES = {
    0: 'la misma nota',
    1: 'tecla de al lado — línea a espacio vecino',
    2: 'saltas una tecla — línea a línea, o espacio a espacio',
    3: 'saltas dos teclas',
    4: 'la apertura natural de la mano',
    7: 'misma letra, una octava',
  };
  return { steps, number, dir, shape: SHAPES[steps] ?? `salto de ${steps} grados`, isStep: steps === 1 };
}

/** El ancla más cercana y a qué distancia diatónica está. */
export function nearestAnchor(midi) {
  const target = diatonicIndex(midi);
  let best = ANCHORS[0];
  let bestDist = Infinity;
  for (const a of ANCHORS) {
    const d = Math.abs(diatonicIndex(a.midi) - target);
    if (d < bestDist) {
      bestDist = d;
      best = a;
    }
  }
  return { anchor: best, distance: bestDist, isAnchor: bestDist === 0 };
}
