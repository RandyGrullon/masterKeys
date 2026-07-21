/**
 * Renderizador de pentagrama en SVG.
 *
 * Geometría verificada contra los diagramas del PLAN.md. Ojo con el DO4 en
 * clave de fa: va en la PRIMERA LÍNEA ADICIONAL ENCIMA del pentagrama, no en
 * el espacio superior (eso sería SI3). Ese error ya se cometió una vez en los
 * diagramas del plan; el índice diatónico lo hace imposible aquí.
 */

import { diatonicIndex, describeMidi, TREBLE_BOTTOM_INDEX, BASS_BOTTOM_INDEX } from './theory.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const LAYOUT = {
  lineGap: 12,
  get half() {
    return this.lineGap / 2;
  },
  trebleBottomY: 88, // MI4
  bassBottomY: 188, // SOL2
  noteSpacing: 62,
  leftPad: 96,
  height: 250,
};

export const yFor = (midi, clef) => {
  const idx = diatonicIndex(midi);
  return clef === 'treble'
    ? LAYOUT.trebleBottomY - (idx - TREBLE_BOTTOM_INDEX) * LAYOUT.half
    : LAYOUT.bassBottomY - (idx - BASS_BOTTOM_INDEX) * LAYOUT.half;
};

const el = (name, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};

/** Líneas adicionales necesarias, en coordenadas Y. */
function ledgerYs(midi, clef) {
  const idx = diatonicIndex(midi);
  const bottom = clef === 'treble' ? TREBLE_BOTTOM_INDEX : BASS_BOTTOM_INDEX;
  const top = bottom + 8; // 5 líneas = 8 pasos diatónicos
  const out = [];
  // Por debajo: líneas en pasos PARES bajo la línea inferior.
  for (let i = bottom - 2; i >= idx; i -= 2) out.push(yFor(midiAtIndex(i, midi), clef));
  // Por encima.
  for (let i = top + 2; i <= idx; i += 2) out.push(yFor(midiAtIndex(i, midi), clef));
  return out;
}

/**
 * Devuelve un MIDI cuyo índice diatónico sea `targetIdx`, usado solo para
 * calcular la Y de una línea adicional. La clase de altura da igual.
 */
function midiAtIndex(targetIdx, referenceMidi) {
  let m = referenceMidi;
  let guard = 0;
  while (diatonicIndex(m) < targetIdx && guard++ < 128) m++;
  while (diatonicIndex(m) > targetIdx && guard++ < 128) m--;
  return m;
}

function drawStaffLines(svg, bottomY, x0, x1) {
  for (let i = 0; i < 5; i++) {
    svg.appendChild(
      el('line', {
        x1: x0, x2: x1,
        y1: bottomY - i * LAYOUT.lineGap,
        y2: bottomY - i * LAYOUT.lineGap,
        class: 'staff-line',
      }),
    );
  }
}

/**
 * Dibuja el ejercicio completo.
 * `states` es un array paralelo a las notas: 'pending' | 'current' | 'ok' | 'error'
 */
export function renderExercise(container, exercise, states = []) {
  container.innerHTML = '';
  const width = LAYOUT.leftPad + exercise.notes.length * LAYOUT.noteSpacing + 60;
  const svg = el('svg', {
    class: 'score',
    viewBox: `0 0 ${width} ${LAYOUT.height}`,
    width,
    height: LAYOUT.height,
  });

  const x1 = width - 20;
  drawStaffLines(svg, LAYOUT.trebleBottomY, 20, x1);
  drawStaffLines(svg, LAYOUT.bassBottomY, 20, x1);

  // Llave y barras del sistema
  svg.appendChild(el('line', { x1: 20, x2: 20, y1: LAYOUT.trebleBottomY - 48, y2: LAYOUT.bassBottomY, class: 'staff-bar' }));
  svg.appendChild(el('line', { x1: x1, x2: x1, y1: LAYOUT.trebleBottomY - 48, y2: LAYOUT.bassBottomY, class: 'staff-bar' }));

  const trebleClef = el('text', { x: 30, y: LAYOUT.trebleBottomY, class: 'clef' });
  trebleClef.textContent = '\u{1D11E}';
  svg.appendChild(trebleClef);
  const bassClef = el('text', { x: 30, y: LAYOUT.bassBottomY - 24, class: 'clef' });
  bassClef.textContent = '\u{1D122}';
  svg.appendChild(bassClef);

  // Armadura: solo 1 sostenido (SOL M) o 1 bemol (FA M) en este nivel.
  if (exercise.keyId === 'G') {
    addAccidental(svg, '♯', 72, yFor(77, 'treble')); // FA#5
    addAccidental(svg, '♯', 72, yFor(53, 'bass')); // FA#3
  } else if (exercise.keyId === 'F') {
    addAccidental(svg, '♭', 72, yFor(71, 'treble')); // SIb4
    addAccidental(svg, '♭', 72, yFor(47, 'bass')); // SIb2
  }

  exercise.notes.forEach((note, i) => {
    const x = LAYOUT.leftPad + i * LAYOUT.noteSpacing;
    const y = yFor(note.midi, note.clef);
    const state = states[i] ?? 'pending';

    for (const ly of ledgerYs(note.midi, note.clef)) {
      svg.appendChild(el('line', { x1: x - 15, x2: x + 15, y1: ly, y2: ly, class: 'ledger' }));
    }

    const head = el('ellipse', {
      cx: x, cy: y, rx: 7.5, ry: 5.6,
      transform: `rotate(-18 ${x} ${y})`,
      class: `notehead ${state}`,
    });
    svg.appendChild(head);

    // Plica: hacia arriba por debajo de la línea central, hacia abajo encima.
    const centerY = note.clef === 'treble'
      ? LAYOUT.trebleBottomY - 2 * LAYOUT.lineGap
      : LAYOUT.bassBottomY - 2 * LAYOUT.lineGap;
    const up = y > centerY;
    svg.appendChild(
      el('line', {
        x1: up ? x + 7 : x - 7, x2: up ? x + 7 : x - 7,
        y1: y, y2: up ? y - 38 : y + 38,
        class: `stem ${state}`,
      }),
    );

    if (state === 'current') {
      svg.appendChild(el('circle', { cx: x, cy: y, r: 17, class: 'cursor-ring' }));
    }
  });

  svg.appendChild(el('rect', { x: 0, y: 0, width: 0, height: 0 })); // no-op, mantiene bbox
  container.appendChild(svg);
  return svg;
}

function addAccidental(svg, glyph, x, y) {
  const t = el('text', { x, y: y + 6, class: 'accidental' });
  t.textContent = glyph;
  svg.appendChild(t);
}

export const noteLabel = (midi) => describeMidi(midi).nameEs;
