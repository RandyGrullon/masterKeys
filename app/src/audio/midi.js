/**
 * Entrada MIDI vía Web MIDI API.
 *
 * Es la entrada IDEAL: el piano envía el número de nota exacto (60 = DO4, el
 * mismo esquema que theory.js), con velocity y note-off explícitos. Elimina de
 * raíz los tres problemas del micrófono — acordes, pedal y error de octava —
 * porque no hay que estimar nada: la nota llega dada.
 *
 * Requisitos: navegador Chromium (Chrome, Edge, Samsung Internet), contexto
 * seguro (HTTPS o localhost), y un instrumento que emita MIDI (piano digital,
 * teclado USB o barra de captura). Un piano acústico sin electrónica no envía
 * MIDI.
 */

/**
 * Interpreta un mensaje MIDI crudo. Función pura para poder probarla sin la API.
 * @param {number[]|Uint8Array} data - [status, dato1, dato2]
 */
export function parseMidiMessage(data) {
  const status = data[0];
  const note = data[1];
  const velocity = data[2] ?? 0;
  const cmd = status & 0xf0;
  // Note-on con velocity 0 es, por convención, un note-off.
  if (cmd === 0x90 && velocity > 0) return { type: 'noteon', midi: note, velocity };
  if (cmd === 0x80 || (cmd === 0x90 && velocity === 0)) return { type: 'noteoff', midi: note };
  return { type: 'other' };
}

export class MidiListener {
  constructor({ onNote, onDevice } = {}) {
    this.onNote = onNote ?? (() => {});
    this.onDevice = onDevice ?? (() => {});
    this.access = null;
    this._handler = (e) => this._onMessage(e);
  }

  async start() {
    if (!navigator.requestMIDIAccess) {
      throw new Error('Este navegador no soporta MIDI. Usa Chrome, Edge o Samsung Internet.');
    }
    this.access = await navigator.requestMIDIAccess({ sysex: false });
    this._attach();
    // Re-enganchar si conectan/desconectan un instrumento en caliente.
    this.access.onstatechange = () => this._attach();
    return this.deviceNames();
  }

  _attach() {
    if (!this.access) return;
    for (const input of this.access.inputs.values()) {
      input.onmidimessage = this._handler; // reasignar es idempotente
    }
    this.onDevice(this.deviceNames());
  }

  _onMessage(e) {
    const msg = parseMidiMessage(e.data);
    if (msg.type === 'noteon') this.onNote({ midi: msg.midi, velocity: msg.velocity });
  }

  deviceNames() {
    if (!this.access) return [];
    return [...this.access.inputs.values()].map((i) => i.name || 'MIDI');
  }

  stop() {
    if (this.access) {
      for (const input of this.access.inputs.values()) input.onmidimessage = null;
      this.access.onstatechange = null;
      this.access = null;
    }
  }
}
