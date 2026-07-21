/**
 * Pruebas de teoría, geometría del pentagrama y generador.
 *
 * La geometría es donde ya se coló un error una vez (el DO4 en clave de fa
 * dibujado en el espacio superior, que es SI3). Aquí queda blindado.
 *
 *   node test-music.mjs
 */

import {
  diatonicIndex, describeMidi, midiToFrequency, frequencyToNote, matchesExpected,
  describeStaffPosition, describeInterval, nearestAnchor,
} from './src/music/theory.js';
import { yFor, LAYOUT } from './src/music/staff.js';
import { generateExercise, LEVELS, KEYS } from './src/music/generator.js';

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  if (got === want) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FALLA ${label}: obtuvo ${got}, esperaba ${want}`); }
};
const ok = (label, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FALLA ${label} ${detail}`); }
};

console.log('\n=== Indice diatonico ===');
eq('DO4 (do central) = 28', diatonicIndex(60), 28);
eq('MI4 = 30 (linea inferior clave de sol)', diatonicIndex(64), 30);
eq('SOL2 = 18 (linea inferior clave de fa)', diatonicIndex(43), 18);
eq('DO# comparte linea con DO', diatonicIndex(61), diatonicIndex(60));
eq('SI3 = 27', diatonicIndex(59), 27);

console.log('\n=== Nombres ===');
eq('60 -> DO4', describeMidi(60).nameEs, 'DO4');
eq('53 -> FA3', describeMidi(53).nameEs, 'FA3');
eq('67 -> SOL4', describeMidi(67).nameEs, 'SOL4');
eq('72 -> DO5', describeMidi(72).nameEs, 'DO5');
eq('61 es tecla negra', describeMidi(61).isBlack, true);

console.log('\n=== Geometria del pentagrama ===');
const G = LAYOUT.lineGap;
// Clave de sol: lineas en 88(MI4) 76(SOL4) 64(SI4) 52(RE5) 40(FA5)
eq('MI4 en la linea inferior de sol', yFor(64, 'treble'), 88);
eq('SOL4 en la 2a linea', yFor(67, 'treble'), 88 - G);
eq('DO5 en el 3er espacio', yFor(72, 'treble'), 88 - 2.5 * G);
eq('FA5 en la linea superior', yFor(77, 'treble'), 88 - 4 * G);
// Clave de fa: lineas en 188(SOL2) 176(SI2) 164(RE3) 152(FA3) 140(LA3)
eq('SOL2 en la linea inferior de fa', yFor(43, 'bass'), 188);
eq('FA3 en la 4a linea', yFor(53, 'bass'), 188 - 3 * G);
eq('LA3 en la linea superior', yFor(57, 'bass'), 188 - 4 * G);

// EL BUG HISTORICO: DO4 en clave de fa.
const laTop = yFor(57, 'bass');       // linea superior
const si3 = yFor(59, 'bass');          // espacio encima
const do4bass = yFor(60, 'bass');      // 1a linea adicional encima
eq('SI3 esta medio espacio sobre la linea superior', si3, laTop - G / 2);
eq('DO4 en clave de fa esta un espacio COMPLETO sobre la linea superior', do4bass, laTop - G);
ok('DO4 != SI3 en clave de fa (bug historico)', do4bass !== si3, `ambos dieron ${do4bass}`);

// DO4 en clave de sol: 1a linea adicional DEBAJO
const mi4 = yFor(64, 'treble');
eq('DO4 en clave de sol, una linea adicional debajo', yFor(60, 'treble'), mi4 + G);

console.log('\n=== Logica de lectura ===');
// Posicion en el pentagrama
eq('SOL4 -> 2a linea de sol', describeStaffPosition(67, 'treble'), '2ª línea del pentagrama de sol');
eq('MI4 -> 1a linea de sol', describeStaffPosition(64, 'treble'), '1ª línea del pentagrama de sol');
eq('FA4 -> 1er espacio de sol', describeStaffPosition(65, 'treble'), '1er espacio del pentagrama de sol');
eq('DO4 en sol -> 1a linea adicional debajo', describeStaffPosition(60, 'treble'), '1ª línea adicional debajo');
eq('FA3 -> 4a linea de fa', describeStaffPosition(53, 'bass'), '4ª línea del pentagrama de fa');
eq('DO4 en fa -> 1a linea adicional encima', describeStaffPosition(60, 'bass'), '1ª línea adicional encima');
// Intervalos
{
  const t = describeInterval(60, 62); // DO4 -> RE4
  eq('DO->RE es 2a', t.number, '2ª');
  eq('DO->RE hacia arriba', t.dir, 'hacia arriba');
  ok('DO->RE es grado conjunto', t.isStep === true);
}
{
  const t = describeInterval(67, 60); // SOL4 -> DO4
  eq('SOL->DO (baja) es 5a', t.number, '5ª');
  eq('SOL->DO hacia abajo', t.dir, 'hacia abajo');
}
eq('DO4->DO5 es octava', describeInterval(60, 72).number, '8ª (octava)');
eq('DO->MI es 3a', describeInterval(60, 64).number, '3ª');
// Anclas
ok('DO4 ES ancla', nearestAnchor(60).isAnchor === true);
ok('RE4 no es ancla, esta a 1 grado de DO4', nearestAnchor(62).isAnchor === false && nearestAnchor(62).distance === 1);

console.log('\n=== Frecuencias ===');
ok('LA4 = 440 Hz', Math.abs(midiToFrequency(69) - 440) < 0.001);
eq('440 Hz -> LA4', frequencyToNote(440).nameEs, 'LA4');
eq('261.63 Hz -> DO4', frequencyToNote(261.63).nameEs, 'DO4');
ok('octava NO coincide sin tolerancia', matchesExpected(72, 60, false) === false);
ok('octava coincide con tolerancia', matchesExpected(72, 60, true) === true);

console.log('\n=== Generador ===');
for (const level of LEVELS) {
  const ex = generateExercise(level.id, 424242);
  eq(`nivel ${level.id} genera ${level.length} notas`, ex.notes.length, level.length);

  const badInterval = [];
  for (let i = 1; i < ex.notes.length; i++) {
    const a = ex.notes[i - 1], b = ex.notes[i];
    if (a.clef !== b.clef) continue; // el cambio de clave reinicia el paseo
    const d = Math.abs(diatonicIndex(b.midi) - diatonicIndex(a.midi));
    if (d > level.maxInterval) badInterval.push(`${describeMidi(a.midi).nameEs}->${describeMidi(b.midi).nameEs} (${d})`);
  }
  ok(`nivel ${level.id} respeta el intervalo maximo (${level.maxInterval})`, badInterval.length === 0, badInterval.join(', '));

  const outOfRange = ex.notes.filter((n) => {
    const [lo, hi] = level.range[n.clef];
    return n.midi < lo || n.midi > hi;
  });
  ok(`nivel ${level.id} respeta el rango`, outOfRange.length === 0,
    outOfRange.map((n) => describeMidi(n.midi).nameEs).join(', '));

  // Las notas deben pertenecer a la tonalidad.
  const tonicPc = KEYS[ex.keyId].tonicPc;
  const inKey = ex.notes.every((n) => [0, 2, 4, 5, 7, 9, 11].includes((((n.midi - tonicPc) % 12) + 12) % 12));
  ok(`nivel ${level.id} se mantiene en ${ex.keyName}`, inKey);
}

console.log('\n=== Novedad: dos semillas nunca dan lo mismo ===');
{
  const seen = new Set();
  let dupes = 0;
  for (let i = 0; i < 300; i++) {
    const ex = generateExercise(3, 1000 + i);
    const sig = ex.notes.map((n) => n.midi).join(',');
    if (seen.has(sig)) dupes++;
    seen.add(sig);
  }
  ok(`300 semillas -> ${seen.size} ejercicios distintos`, dupes === 0, `${dupes} repetidos`);
}

console.log('\n=== Reproducibilidad: misma semilla, mismo ejercicio ===');
{
  const a = generateExercise(4, 777).notes.map((n) => n.midi).join(',');
  const b = generateExercise(4, 777).notes.map((n) => n.midi).join(',');
  ok('semilla 777 es determinista', a === b);
}

console.log(`\n${pass} ok, ${fail} fallan\n`);
process.exit(fail > 0 ? 1 : 0);
