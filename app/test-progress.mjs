/**
 * Pruebas del sistema de progreso por nivel.
 *
 * Lo que hay que blindar: que el mismo criterio honesto de la puerta de
 * Fase 1 (sin ayuda, muestra suficiente, p90<2s, precisión>=95%) se aplique
 * por nivel, que un nivel se bloquee hasta dominar el anterior, y que
 * 'sin datos' nunca se confunda con 'no lo dominas'.
 *
 *   node test-progress.mjs
 */

import { GATE } from './src/store.js';
import { levelStats, levelMastery, levelStatus, fullProgress, recommendedLevel, overallProgress } from './src/progress.js';
import { LEVELS } from './src/music/generator.js';

let pass = 0, fail = 0;
const ok = (label, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FALLA ${label} ${detail}`); }
};
const eq = (label, got, want) => ok(label, got === want, `-> obtuvo ${JSON.stringify(got)}, esperaba ${JSON.stringify(want)}`);

/** Fabrica una sesión con N eventos, todos correctos y rápidos (o no). */
function mkSession({ level, n = 60, assisted = false, latencyMs = 900, accuracy = 1 }) {
  const events = Array.from({ length: n }, (_, i) => ({
    expected: 60, played: accuracy === 1 || i < Math.round(n * accuracy) ? 60 : 61,
    correct: accuracy === 1 || i < Math.round(n * accuracy),
    latencyMs,
  }));
  return { level, assisted, events, durationMs: n * 1000, date: '2026-07-20T10:00:00.000Z' };
}

console.log('\n=== Sin datos: null, no false ===');
{
  const m = levelMastery([], 1);
  eq('status es null (no false) sin muestra', m.status, null);
  ok('el mensaje explica cuántas faltan', m.reason.includes('notas más'));
}

console.log('\n=== Dominio: cumple ambos umbrales ===');
{
  const sessions = [mkSession({ level: 1, n: GATE.minNotes, latencyMs: 900, accuracy: 1 })];
  const m = levelMastery(sessions, 1);
  eq('dominado', m.status, true);
}

console.log('\n=== No domina: precisión insuficiente ===');
{
  const sessions = [mkSession({ level: 1, n: GATE.minNotes, latencyMs: 900, accuracy: 0.7 })];
  const m = levelMastery(sessions, 1);
  eq('no dominado por precisión', m.status, false);
  ok('el motivo menciona precisión', m.reason.includes('precisión'));
}

console.log('\n=== No domina: latencia alta ===');
{
  const sessions = [mkSession({ level: 1, n: GATE.minNotes, latencyMs: 3000, accuracy: 1 })];
  const m = levelMastery(sessions, 1);
  eq('no dominado por latencia', m.status, false);
  ok('el motivo menciona latencia', m.reason.includes('latencia'));
}

console.log('\n=== Sesiones CON ayuda no cuentan ===');
{
  const sessions = [mkSession({ level: 1, n: GATE.minNotes, latencyMs: 900, accuracy: 1, assisted: true })];
  const m = levelMastery(sessions, 1);
  eq('sigue sin datos válidos', m.status, null);
}

console.log('\n=== Varias sesiones se agregan ===');
{
  const sessions = [
    mkSession({ level: 1, n: 30, latencyMs: 900, accuracy: 1 }),
    mkSession({ level: 1, n: 30, latencyMs: 900, accuracy: 1 }),
  ];
  const s = levelStats(sessions, 1);
  eq('suma los eventos de ambas sesiones', s.attempted, 60);
}

console.log('\n=== Bloqueo: nivel 2 bloqueado hasta dominar el 1 ===');
{
  eq('nivel 1 sin datos está en curso, no bloqueado', levelStatus([], 1), 'in_progress');
  eq('nivel 2 bloqueado si el 1 no está dominado', levelStatus([], 2), 'locked');

  const dominaNivel1 = [mkSession({ level: 1, n: GATE.minNotes, accuracy: 1, latencyMs: 900 })];
  eq('nivel 2 se desbloquea al dominar el 1', levelStatus(dominaNivel1, 2), 'in_progress');
  eq('nivel 3 sigue bloqueado (2 no dominado)', levelStatus(dominaNivel1, 3), 'locked');
}

console.log('\n=== fullProgress cubre los 5 niveles en orden ===');
{
  const prog = fullProgress([]);
  eq('5 niveles', prog.length, LEVELS.length);
  eq('nivel 1 primero', prog[0].id, 1);
  eq('nivel 1 en curso al empezar', prog[0].status, 'in_progress');
  ok('el resto bloqueados al empezar', prog.slice(1).every((p) => p.status === 'locked'));
}

console.log('\n=== recommendedLevel ===');
{
  eq('sin datos, recomienda nivel 1', recommendedLevel([]), 1);
  const dominaNivel1 = [mkSession({ level: 1, n: GATE.minNotes, accuracy: 1, latencyMs: 900 })];
  eq('tras dominar 1, recomienda 2', recommendedLevel(dominaNivel1), 2);

  const dominaTodos = LEVELS.map((l) => mkSession({ level: l.id, n: GATE.minNotes, accuracy: 1, latencyMs: 900 }));
  eq('con todo dominado, recomienda el último', recommendedLevel(dominaTodos), LEVELS[LEVELS.length - 1].id);
}

console.log('\n=== overallProgress ===');
{
  eq('0 de 5 al empezar', overallProgress([]).mastered, 0);
  const dominaNivel1 = [mkSession({ level: 1, n: GATE.minNotes, accuracy: 1, latencyMs: 900 })];
  eq('1 de 5 tras dominar el primero', overallProgress(dominaNivel1).mastered, 1);
  // Independiente del número de niveles: la escalera crece con las fases del plan.
  eq(`1/${LEVELS.length} niveles en porcentaje`, overallProgress(dominaNivel1).pct,
    Math.round((1 / LEVELS.length) * 100));
}

console.log(`\n${pass} ok, ${fail} fallan\n`);
process.exit(fail > 0 ? 1 : 0);
