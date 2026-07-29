/**
 * Pruebas de ritmo, generador de eventos y calendario del plan.
 *
 * Lo crítico: que las figuras SUMEN compases exactos (ninguna nota cruzando la
 * barra) y que los acordes y las dos manos generen eventos con varias notas.
 *
 *   node test-rhythm.mjs
 */

import { fillMeasures, assignMeasures, describeDuration, timingError, inTime, TIME_SIGNATURES } from './src/music/rhythm.js';
import { generateExercise, LEVELS, eventMidis } from './src/music/generator.js';
import { planStatus, PHASES } from './src/plan.js';

let pass = 0, fail = 0;
const ok = (label, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FALLA ${label} ${detail}`); }
};
const eq = (label, got, want) => ok(label, got === want, `-> obtuvo ${got}, esperaba ${want}`);

// PRNG determinista para las pruebas.
const mkRng = (seed) => { let a = seed; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; };

console.log('\n=== Rellenar compases: suma exacta ===');
for (const [allowed, label] of [[[1], 'solo negras'], [[1, 2, 3], 'con blancas'], [[0.5, 1, 1.5, 2], 'con corcheas y puntillos']]) {
  for (const measures of [1, 4, 8]) {
    const d = fillMeasures(mkRng(7), allowed, 3, measures);
    const total = d.reduce((s, x) => s + x, 0);
    ok(`${label}, ${measures} compases de 3/4 suman ${measures * 3}`, Math.abs(total - measures * 3) < 1e-9, `-> ${total}`);
  }
}

console.log('\n=== Ninguna figura cruza la barra de compás ===');
{
  const d = fillMeasures(mkRng(3), [0.5, 1, 1.5, 2, 3], 3, 6);
  const slots = assignMeasures(d, 3);
  const cruza = slots.filter((s) => s.beatInMeasure + s.duration > 3 + 1e-9);
  ok('ninguna figura se sale de su compás', cruza.length === 0, JSON.stringify(cruza));
  // Los compases deben ser consecutivos empezando en 0.
  const measures = [...new Set(slots.map((s) => s.measure))];
  ok('compases consecutivos desde 0', measures.every((m, i) => m === i), JSON.stringify(measures));
}

console.log('\n=== Nombres de figuras ===');
eq('4 pulsos = redonda', describeDuration(4).name, 'redonda');
eq('2 pulsos = blanca', describeDuration(2).name, 'blanca');
eq('1 pulso = negra', describeDuration(1).name, 'negra');
eq('0.5 = corchea', describeDuration(0.5).name, 'corchea');
eq('1.5 = negra con puntillo', describeDuration(1.5).name, 'negra con puntillo');
ok('la redonda es hueca y sin plica', describeDuration(4).hollow && !describeDuration(4).stem);
ok('la negra es rellena con plica', !describeDuration(1).hollow && describeDuration(1).stem);
ok('la corchea lleva un corchete', describeDuration(0.5).flags === 1);

console.log('\n=== Generador: todos los niveles producen eventos válidos ===');
for (const level of LEVELS) {
  const ex = generateExercise(level.id, 20260719);
  ok(`nivel ${level.id} (${level.name}) genera eventos`, ex.events.length > 0);
  ok(`nivel ${level.id}: todo evento tiene al menos una nota`, ex.events.every((e) => e.notes.length > 0));
  ok(`nivel ${level.id}: duraciones permitidas`, ex.events.every((e) => level.rhythm.includes(e.duration)),
    JSON.stringify([...new Set(ex.events.map((e) => e.duration))]));
  // Suma total = compases completos
  const total = ex.events.reduce((s, e) => s + e.duration, 0);
  ok(`nivel ${level.id}: suma ${total} = compases enteros`, Math.abs(total % ex.beatsPerMeasure) < 1e-9, `-> ${total}`);
}

console.log('\n=== Acordes y dos manos ===');
{
  const triad = generateExercise(10, 555); // nivel 'Acordes de tríada'
  const conVarias = triad.events.filter((e) => e.notes.length > 1);
  ok('el nivel de tríadas produce eventos de varias notas', conVarias.length > 0);
  ok('las tríadas tienen hasta 3 notas', triad.events.every((e) => e.notes.length <= 3));

  const dosManos = generateExercise(9, 777); // nivel 'Dos manos'
  const ambas = dosManos.events.filter((e) => new Set(e.notes.map((n) => n.clef)).size > 1);
  ok('el nivel de dos manos produce eventos en ambas claves', ambas.length > 0);

  const vals = generateExercise(11, 999); // nivel 'Vals'
  ok('el vals usa 3 eventos por compás', vals.events.length === vals.events.filter(Boolean).length && vals.events.length % 3 === 0);
  const primeros = vals.events.filter((e) => e.beatInMeasure === 0);
  ok('el tiempo 1 del vals es bajo en clave de fa',
    primeros.every((e) => e.notes.every((n) => n.clef === 'bass')));
  const segundos = vals.events.filter((e) => e.beatInMeasure > 0);
  ok('los tiempos 2 y 3 llevan el acorde en clave de sol',
    segundos.every((e) => e.notes.every((n) => n.clef === 'treble')));
}

console.log('\n=== Novedad: sigue sin repetirse ===');
{
  const firmas = new Set();
  for (let i = 0; i < 200; i++) {
    const ex = generateExercise(7, 4000 + i);
    firmas.add(ex.events.map((e) => `${e.duration}:${eventMidis(e).join('.')}`).join('|'));
  }
  ok(`200 semillas -> ${firmas.size} ejercicios distintos`, firmas.size >= 195, `${firmas.size}`);
}

console.log('\n=== Medición de ritmo ===');
{
  // A 60 bpm, un pulso = 1000 ms. El pulso 2 se espera a los 2000 ms.
  eq('a tiempo exacto: error 0', timingError(2, 3000, 1000, 60), 0);
  eq('200 ms tarde', timingError(2, 3200, 1000, 60), 200);
  eq('150 ms adelantado', timingError(2, 2850, 1000, 60), -150);
  ok('±150 ms a 60 bpm está a tiempo (15% = 150 ms)', inTime(150, 60));
  ok('300 ms a 60 bpm NO está a tiempo', !inTime(300, 60));
}

console.log('\n=== Calendario del plan ===');
{
  const during = planStatus(new Date('2026-09-20T12:00:00Z'));
  eq('20 sep está en la fase de Howl\'s', during.phase.name, "Merry-Go-Round of Life");
  const trip = planStatus(new Date('2026-08-15T12:00:00Z'));
  ok('15 ago está en el tramo sin piano', trip.noPiano === true);
  const first = planStatus(new Date('2026-07-20T12:00:00Z'));
  eq('20 jul es semana 1', first.week, 1);
  ok('las fases no se solapan', PHASES.every((p, i) =>
    i === 0 || new Date(p.from) > new Date(PHASES[i - 1].to)));
  const after = planStatus(new Date('2026-12-25T12:00:00Z'));
  ok('después del 29 nov el plan está terminado', after.after === true);
}

console.log(`\n${pass} ok, ${fail} fallan\n`);
process.exit(fail > 0 ? 1 : 0);
