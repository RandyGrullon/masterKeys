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
