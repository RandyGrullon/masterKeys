/**
 * Pruebas de la lógica de sincronización, SIN red.
 *
 * Lo que se verifica aquí es lo que puede corromper datos: que la fusión de
 * sesiones remotas no duplique ni pierda nada, y que el marcado de
 * "sincronizado" sea correcto. La parte de red se prueba contra el proyecto
 * real, no aquí.
 *
 *   node test-sync.mjs
 */

// ── Stub de localStorage para poder importar store.js en Node ─────────
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};
// Node 22 ya expone crypto.randomUUID, que es lo que usa store.js.

const KEY = 'piano-trainer:sessions:v1';
const {
  saveSession, loadSessions, unsyncedSessions, markSynced, mergeRemote, clearSessions,
} = await import('./src/store.js');

let pass = 0, fail = 0;
const ok = (label, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FALLA ${label} ${detail}`); }
};
const eq = (label, got, want) => ok(label, got === want, `-> obtuvo ${got}, esperaba ${want}`);

const mkSession = (date, n = 2) => ({
  date, mode: 'tap', assisted: false, level: 1, durationMs: 60000,
  events: Array.from({ length: n }, (_, i) => ({ expected: 60, played: 60, correct: true, latencyMs: 900 + i })),
});

console.log('\n=== Guardado: id y estado de sync ===');
clearSessions();
saveSession(mkSession('2026-07-20T10:00:00.000Z'));
{
  const all = loadSessions();
  eq('guarda 1 sesion', all.length, 1);
  ok('asigna un id', !!all[0].id);
  eq('nace sin sincronizar', all[0].synced, false);
}

console.log('\n=== Migracion: sesiones viejas sin id ===');
mem.clear();
localStorage.setItem(KEY, JSON.stringify([
  { date: '2026-07-01T10:00:00.000Z', events: [], durationMs: 1000 },
  { date: '2026-07-02T10:00:00.000Z', events: [], durationMs: 1000 },
]));
{
  const all = loadSessions();
  ok('todas reciben id', all.every((s) => !!s.id));
  ok('los ids son unicos', new Set(all.map((s) => s.id)).size === 2);
  ok('se marcan como no sincronizadas', all.every((s) => s.synced === false));
  // La migracion debe persistir, no recalcularse cada vez.
  const again = loadSessions();
  eq('los ids son estables entre lecturas', again[0].id, all[0].id);
}

console.log('\n=== Pendientes y marcado ===');
clearSessions();
saveSession(mkSession('2026-07-20T10:00:00.000Z'));
saveSession(mkSession('2026-07-21T10:00:00.000Z'));
{
  eq('2 pendientes', unsyncedSessions().length, 2);
  const first = loadSessions()[0].id;
  markSynced([first]);
  eq('queda 1 pendiente tras marcar', unsyncedSessions().length, 1);
  ok('la marcada quedo sincronizada', loadSessions().find((s) => s.id === first).synced === true);
}

console.log('\n=== Fusion de remotas ===');
clearSessions();
saveSession(mkSession('2026-07-20T10:00:00.000Z'));
{
  const localId = loadSessions()[0].id;
  const remote = [
    { id: localId, date: '2026-07-20T10:00:00.000Z', events: [], durationMs: 60000 }, // ya la tengo
    { id: 'remota-A', date: '2026-07-19T10:00:00.000Z', events: [], durationMs: 60000 },
    { id: 'remota-B', date: '2026-07-22T10:00:00.000Z', events: [], durationMs: 60000 },
  ];
  const added = mergeRemote(remote);
  eq('añade solo las 2 nuevas', added, 2);
  eq('total local = 3', loadSessions().length, 3);
  ok('no duplica la que ya existia',
    loadSessions().filter((s) => s.id === localId).length === 1);
  ok('las bajadas quedan marcadas como sincronizadas',
    loadSessions().find((s) => s.id === 'remota-A').synced === true);

  // Idempotencia: volver a fundir lo mismo no cambia nada.
  const again = mergeRemote(remote);
  eq('segunda fusion no añade nada', again, 0);
  eq('total sigue en 3', loadSessions().length, 3);
}

console.log('\n=== Orden cronologico tras fundir ===');
{
  const fechas = loadSessions().map((s) => s.date);
  const ordenadas = [...fechas].sort();
  ok('quedan ordenadas por fecha', JSON.stringify(fechas) === JSON.stringify(ordenadas),
    JSON.stringify(fechas));
}

console.log('\n=== Robustez: entradas basura ===');
{
  const antes = loadSessions().length;
  const added = mergeRemote([null, undefined, {}, { date: 'x' }]);
  eq('ignora filas sin id', added, 0);
  eq('no altera el total', loadSessions().length, antes);
}

console.log(`\n${pass} ok, ${fail} fallan\n`);
process.exit(fail > 0 ? 1 : 0);
