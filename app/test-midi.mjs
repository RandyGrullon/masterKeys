/**
 * Pruebas del parseo de mensajes MIDI, sin hardware.
 *
 * Lo que importa: distinguir un ataque real (note-on) de un note-off, incluida
 * la convención de note-on con velocity 0 = note-off, y no reaccionar a otros
 * mensajes (pedal, pitch-bend, control change).
 *
 *   node test-midi.mjs
 */

import { parseMidiMessage } from './src/audio/midi.js';

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FALLA ${label}: obtuvo ${g}, esperaba ${w}`); }
};

console.log('\n=== Note-on (ataque real) ===');
// 0x90 = note-on canal 1. DO4 = 60, velocity 100.
eq('DO4 note-on', parseMidiMessage([0x90, 60, 100]), { type: 'noteon', midi: 60, velocity: 100 });
// Canal 4 (0x93) también es note-on.
eq('note-on en otro canal', parseMidiMessage([0x93, 67, 80]), { type: 'noteon', midi: 67, velocity: 80 });

console.log('\n=== Note-off ===');
eq('note-off explícito (0x80)', parseMidiMessage([0x80, 60, 0]), { type: 'noteoff', midi: 60 });
// Convención: note-on con velocity 0 ES un note-off. Este es el caso que
// rompería un parser ingenuo y dispararía notas fantasma.
eq('note-on velocity 0 = note-off', parseMidiMessage([0x90, 60, 0]), { type: 'noteoff', midi: 60 });

console.log('\n=== Otros mensajes: NO deben contar como nota ===');
eq('control change (pedal, 0xB0)', parseMidiMessage([0xB0, 64, 127]).type, 'other');
eq('pitch bend (0xE0)', parseMidiMessage([0xE0, 0, 64]).type, 'other');
eq('program change (0xC0)', parseMidiMessage([0xC0, 5]).type, 'other');
eq('clock/realtime (0xF8)', parseMidiMessage([0xF8]).type, 'other');

console.log('\n=== Los números MIDI coinciden con theory.js ===');
// 60=DO4, 53=FA3, 67=SOL4, 72=DO5 — las 4 anclas del plan.
for (const [midi, nombre] of [[60,'DO4'],[53,'FA3'],[67,'SOL4'],[72,'DO5']]) {
  eq(`${nombre} llega como midi ${midi}`, parseMidiMessage([0x90, midi, 90]).midi, midi);
}

console.log(`\n${pass} ok, ${fail} fallan\n`);
process.exit(fail > 0 ? 1 : 0);
