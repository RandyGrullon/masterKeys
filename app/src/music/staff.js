/**
 * Renderizador de pentagrama en SVG.
 *
 * Geometría verificada contra los diagramas del PLAN.md. Ojo con el DO4 en
 * clave de fa: va en la PRIMERA LÍNEA ADICIONAL ENCIMA del pentagrama, no en
 * el espacio superior (eso sería SI3). Ese error ya se cometió una vez en los
 * diagramas del plan; el índice diatónico lo hace imposible aquí.
 *
 * Dibuja eventos (una o más notas simultáneas) con su figura correcta:
 * redonda/blanca huecas, negra/corchea rellenas, puntillo, corchete, y barras
 * de compás en los límites del compás.
 */

import { diatonicIndex, TREBLE_BOTTOM_INDEX, BASS_BOTTOM_INDEX } from './theory.js';
import { describeDuration } from './rhythm.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const LAYOUT = {
  lineGap: 12,
  get half() { return this.lineGap / 2; },
  trebleBottomY: 88, // MI4
  bassBottomY: 188, // SOL2
  beatWidth: 46, // ancho horizontal de un pulso
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

/** Coordenadas Y de las líneas adicionales que necesita una nota. */
function ledgerYs(midi, clef) {
  const idx = diatonicIndex(midi);
  const bottom = clef === 'treble' ? TREBLE_BOTTOM_INDEX : BASS_BOTTOM_INDEX;
  const top = bottom + 8; // 5 líneas = 8 pasos diatónicos
  const gap = LAYOUT.lineGap;
  const baseY = clef === 'treble' ? LAYOUT.trebleBottomY : LAYOUT.bassBottomY;
  const out = [];
  for (let i = bottom - 2; i >= idx; i -= 2) out.push(baseY + ((bottom - i) / 2) * gap);
  for (let i = top + 2; i <= idx; i += 2) out.push(baseY - 4 * gap - ((i - top) / 2) * gap);
  return out;
}

function drawStaffLines(svg, bottomY, x0, x1) {
  for (let i = 0; i < 5; i++) {
    svg.appendChild(el('line', {
      x1: x0, x2: x1,
      y1: bottomY - i * LAYOUT.lineGap, y2: bottomY - i * LAYOUT.lineGap,
      class: 'staff-line',
    }));
  }
}

function addAccidental(svg, glyph, x, y) {
  const t = el('text', { x, y: y + 6, class: 'accidental' });
  t.textContent = glyph;
  svg.appendChild(t);
}

/**
 * Dibuja el ejercicio.
 *
 * `states` es paralelo a los eventos: 'pending' | 'current' | 'ok' | 'error'
 * `options.occludeFrom` oculta los eventos a partir de ese índice (modo
 * anticipación: te obliga a haber leído por delante).
 */
export function renderExercise(container, exercise, states = [], options = {}) {
  container.innerHTML = '';
  const events = exercise.events ?? [];
  const beatsPerMeasure = exercise.beatsPerMeasure ?? 3;
  const totalBeats = events.reduce((s, e) => s + e.duration, 0);
  const width = LAYOUT.leftPad + totalBeats * LAYOUT.beatWidth + 70;

  const svg = el('svg', {
    class: 'score', viewBox: `0 0 ${width} ${LAYOUT.height}`,
    width, height: LAYOUT.height,
  });

  const xRight = width - 24;
  drawStaffLines(svg, LAYOUT.trebleBottomY, 20, xRight);
  drawStaffLines(svg, LAYOUT.bassBottomY, 20, xRight);

  // Llave del sistema y barra final.
  svg.appendChild(el('line', { x1: 20, x2: 20, y1: LAYOUT.trebleBottomY - 48, y2: LAYOUT.bassBottomY, class: 'staff-bar' }));
  svg.appendChild(el('line', { x1: xRight, x2: xRight, y1: LAYOUT.trebleBottomY - 48, y2: LAYOUT.bassBottomY, class: 'staff-bar' }));

  const trebleClef = el('text', { x: 30, y: LAYOUT.trebleBottomY, class: 'clef' });
  trebleClef.textContent = '\u{1D11E}';
  svg.appendChild(trebleClef);
  const bassClef = el('text', { x: 30, y: LAYOUT.bassBottomY - 24, class: 'clef' });
  bassClef.textContent = '\u{1D122}';
  svg.appendChild(bassClef);

  // Armadura.
  const KEY_ACCIDENTALS = {
    G: [{ g: '♯', t: 77, b: 53 }],
    F: [{ g: '♭', t: 71, b: 47 }],
    Bb: [{ g: '♭', t: 71, b: 47 }, { g: '♭', t: 75, b: 51 }],
  };
  (KEY_ACCIDENTALS[exercise.keyId] ?? []).forEach((a, i) => {
    addAccidental(svg, a.g, 66 + i * 11, yFor(a.t, 'treble'));
    addAccidental(svg, a.g, 66 + i * 11, yFor(a.b, 'bass'));
  });

  // Indicación de compás.
  const tsText = el('text', { x: 82, y: LAYOUT.trebleBottomY - 14, class: 'timesig' });
  tsText.textContent = exercise.timeSignature ?? '3/4';
  svg.appendChild(tsText);

  // ── Eventos ─────────────────────────────────────────────────────────
  const occludeFrom = options.occludeFrom ?? Infinity;
  let lastMeasure = 0;

  events.forEach((event, i) => {
    const x = LAYOUT.leftPad + event.absoluteBeat * LAYOUT.beatWidth;

    // Barra de compás cuando cambia el número de compás.
    if (event.measure > lastMeasure) {
      const bx = x - LAYOUT.beatWidth * 0.28;
      svg.appendChild(el('line', {
        x1: bx, x2: bx,
        y1: LAYOUT.trebleBottomY - 4 * LAYOUT.lineGap, y2: LAYOUT.trebleBottomY,
        class: 'measure-bar',
      }));
      svg.appendChild(el('line', {
        x1: bx, x2: bx,
        y1: LAYOUT.bassBottomY - 4 * LAYOUT.lineGap, y2: LAYOUT.bassBottomY,
        class: 'measure-bar',
      }));
      lastMeasure = event.measure;
    }

    const state = states[i] ?? 'pending';
    const fig = describeDuration(event.duration);

    // Oculto (modo anticipación): marca de posición, sin altura ni figura.
    if (i >= occludeFrom) {
      svg.appendChild(el('rect', {
        x: x - 8, y: LAYOUT.trebleBottomY - 4 * LAYOUT.lineGap - 6,
        width: 16, height: 4 * LAYOUT.lineGap + 12,
        class: 'occluded',
      }));
      return;
    }

    for (const note of event.notes) {
      const y = yFor(note.midi, note.clef);

      for (const ly of ledgerYs(note.midi, note.clef)) {
        svg.appendChild(el('line', { x1: x - 14, x2: x + 14, y1: ly, y2: ly, class: 'ledger' }));
      }

      svg.appendChild(el('ellipse', {
        cx: x, cy: y, rx: 7.2, ry: 5.4,
        transform: `rotate(-18 ${x} ${y})`,
        class: `notehead ${state}${fig.hollow ? ' hollow' : ''}`,
      }));

      if (fig.dotted) {
        svg.appendChild(el('circle', { cx: x + 13, cy: y, r: 2, class: `dot ${state}` }));
      }

      if (fig.stem) {
        const centerY = note.clef === 'treble'
          ? LAYOUT.trebleBottomY - 2 * LAYOUT.lineGap
          : LAYOUT.bassBottomY - 2 * LAYOUT.lineGap;
        const up = y > centerY;
        const sx = up ? x + 6.8 : x - 6.8;
        const sy2 = up ? y - 36 : y + 36;
        svg.appendChild(el('line', { x1: sx, x2: sx, y1: y, y2: sy2, class: `stem ${state}` }));

        // Corchete de la corchea.
        if (fig.flags > 0) {
          const dir = up ? 1 : -1;
          svg.appendChild(el('path', {
            d: `M ${sx} ${sy2} q 9 ${5 * dir} 7 ${13 * dir} q -1 ${-6 * dir} -7 ${-8 * dir} z`,
            class: `flag ${state}`,
          }));
        }
      }
    }

    if (state === 'current') {
      const ys = event.notes.map((n) => yFor(n.midi, n.clef));
      const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
      const r = Math.max(16, (Math.max(...ys) - Math.min(...ys)) / 2 + 14);
      svg.appendChild(el('ellipse', { cx: x, cy: midY, rx: 17, ry: r, class: 'cursor-ring' }));
    }
  });

  container.appendChild(svg);
  return { svg, xOfEvent: (i) => LAYOUT.leftPad + (events[i]?.absoluteBeat ?? 0) * LAYOUT.beatWidth };
}
