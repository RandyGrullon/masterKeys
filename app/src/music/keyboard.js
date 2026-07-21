/**
 * Piano interactivo en SVG.
 *
 * Doble papel:
 *   - INPUT en modo táctil: tocas la tecla real en vez de un botón abstracto.
 *   - GUÍA visual: ilumina la tecla de la nota actual (solo en modo aprender),
 *     y marca la tecla tocada como acierto o error.
 *
 * Enseña de paso la orientación del teclado del PLAN.md: DO siempre a la
 * izquierda del grupo de 2 negras, FA a la izquierda del grupo de 3. Por eso
 * los DO llevan etiqueta y el DO central va resaltado.
 */

import { describeMidi } from './theory.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const WHITE_W = 38;
const WHITE_H = 150;
const BLACK_W = 24;
const BLACK_H = 96;

// Semitonos de las teclas blancas y su desplazamiento de negra a la derecha.
const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11]; // DO RE MI FA SOL LA SI
const HAS_BLACK_RIGHT = { 0: true, 2: true, 5: true, 7: true, 9: true };

const el = (name, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};

/**
 * Dibuja el piano de `loMidi` a `hiMidi`.
 * `onKey(midi)` se llama al tocar (null = solo lectura, modo micrófono).
 * Devuelve una API para iluminar teclas sin redibujar.
 */
export function renderKeyboard(container, loMidi, hiMidi, onKey) {
  container.innerHTML = '';

  // Recolecta teclas blancas del rango; las negras se posan entre ellas.
  const whites = [];
  for (let m = loMidi; m <= hiMidi; m++) {
    if (WHITE_PCS.includes(((m % 12) + 12) % 12)) whites.push(m);
  }
  const width = whites.length * WHITE_W + 2;
  const svg = el('svg', {
    class: 'piano',
    viewBox: `0 0 ${width} ${WHITE_H + 4}`,
    width,
    height: WHITE_H + 4,
  });

  const byMidi = new Map(); // midi -> elemento de tecla, para iluminar luego
  const xOf = new Map(); // midi -> x izquierda

  // Blancas primero (van debajo).
  whites.forEach((midi, i) => {
    const x = i * WHITE_W + 1;
    xOf.set(midi, x);
    const info = describeMidi(midi);
    const isC = ((midi % 12) + 12) % 12 === 0;
    const key = el('rect', {
      x, y: 1, width: WHITE_W, height: WHITE_H, rx: 4,
      class: `key white${isC ? ' is-c' : ''}`,
      'data-midi': midi,
    });
    svg.appendChild(key);
    byMidi.set(midi, key);

    // Etiqueta: todos los DO llevan nombre+octava; ayuda a ubicarse.
    if (isC) {
      const label = el('text', { x: x + WHITE_W / 2, y: WHITE_H - 8, class: 'key-label c-label' });
      label.textContent = info.nameEs;
      svg.appendChild(label);
    }
  });

  // Negras encima.
  for (let m = loMidi; m <= hiMidi; m++) {
    const pc = ((m % 12) + 12) % 12;
    if (!WHITE_PCS.includes(pc)) continue;
    if (!HAS_BLACK_RIGHT[pc]) continue;
    const blackMidi = m + 1;
    if (blackMidi > hiMidi || !xOf.has(m)) continue;
    const x = xOf.get(m) + WHITE_W - BLACK_W / 2;
    const key = el('rect', {
      x, y: 1, width: BLACK_W, height: BLACK_H, rx: 3,
      class: 'key black', 'data-midi': blackMidi,
    });
    svg.appendChild(key);
    byMidi.set(blackMidi, key);
  }

  // Interacción táctil.
  if (onKey) {
    svg.addEventListener('pointerdown', (e) => {
      const midi = e.target?.getAttribute?.('data-midi');
      if (midi) {
        e.preventDefault();
        onKey(Number(midi));
      }
    });
    svg.classList.add('interactive');
  }

  container.appendChild(svg);

  return {
    width,
    xOf: (midi) => xOf.get(midi),
    /** Marca una tecla con un estado: 'target' | 'correct' | 'wrong'. */
    mark(midi, state) {
      byMidi.get(midi)?.classList.add(state);
    },
    /**
     * Quita solo la guía (`target`). NO toca 'correct'/'wrong': al avanzar de
     * nota se redibuja la guía, pero el destello de acierto de la tecla anterior
     * debe sobrevivir hasta que su propio temporizador lo retire (clearFeedback).
     */
    clear() {
      for (const k of byMidi.values()) k.classList.remove('target');
    },
    /** Quita los estados transitorios de acierto/error, conserva la guía. */
    clearFeedback() {
      for (const k of byMidi.values()) k.classList.remove('correct', 'wrong');
    },
  };
}
