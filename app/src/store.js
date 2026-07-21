/**
 * Registro local de práctica. localStorage basta: son unos pocos KB al mes y
 * funciona sin red, que es el requisito real (tablet en el atril, sin wifi).
 *
 * Este es el sustrato que un coach con IA leería MÁS ADELANTE. Se guarda desde
 * ya porque sin semanas de datos reales, cualquier consejo automático sería
 * genérico — el antipatrón que hay que evitar.
 */

const KEY = 'piano-trainer:sessions:v1';

/** Puerta de salida de la Fase 1 del PLAN.md. */
export const GATE = {
  minNotes: 50,
  maxP90LatencyMs: 2000,
  minAccuracy: 0.95,
  targetNotesPerMin: 60,
};

export function loadSessions() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function saveSession(session) {
  const all = loadSessions();
  all.push(session);
  // Se conservan 400 sesiones (más de un año a 1/día).
  localStorage.setItem(KEY, JSON.stringify(all.slice(-400)));
  return session;
}

export function clearSessions() {
  localStorage.removeItem(KEY);
}

export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function summarize(session) {
  const attempted = session.events.length;
  const correct = session.events.filter((e) => e.correct).length;
  const latencies = session.events.filter((e) => e.correct).map((e) => e.latencyMs);
  const durationMin = session.durationMs / 60000;
  return {
    attempted,
    correct,
    accuracy: attempted ? correct / attempted : 0,
    p50: percentile(latencies, 50),
    p90: percentile(latencies, 90),
    notesPerMin: durationMin > 0 ? correct / durationMin : 0,
  };
}

/**
 * ¿Se superó la puerta de Fase 1?
 *
 * Deliberadamente devuelve `null` cuando no hay muestra suficiente, en vez de
 * `false`: "aún no se sabe" y "no lo lograste" son cosas distintas y mezclarlas
 * sería mentirle al alumno.
 */
export function evaluateGate(sessions = loadSessions()) {
  const recent = sessions.slice(-5);
  const events = recent.flatMap((s) => s.events);
  if (events.length < GATE.minNotes) {
    return {
      status: null,
      reason: `Faltan ${GATE.minNotes - events.length} notas para poder evaluar`,
      sample: events.length,
    };
  }
  const correct = events.filter((e) => e.correct);
  const accuracy = correct.length / events.length;
  const p90 = percentile(correct.map((e) => e.latencyMs), 90);
  const passed = accuracy >= GATE.minAccuracy && p90 <= GATE.maxP90LatencyMs;
  return {
    status: passed,
    accuracy,
    p90,
    sample: events.length,
    reason: passed
      ? 'Puerta superada: identificas notas por debajo de 2 s con precisión alta'
      : accuracy < GATE.minAccuracy
        ? `Precisión ${(accuracy * 100).toFixed(0)}% — hace falta ${GATE.minAccuracy * 100}%`
        : `Latencia p90 ${(p90 / 1000).toFixed(2)} s — hace falta bajar de 2 s`,
  };
}

/** Semillas ya usadas, para no repetir nunca un ejercicio. */
const SEEN_KEY = 'piano-trainer:seeds:v1';
export function isSeedUsed(seed) {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]').includes(seed);
  } catch {
    return false;
  }
}
export function markSeedUsed(seed) {
  let seeds = [];
  try {
    seeds = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
  } catch {
    seeds = [];
  }
  seeds.push(seed);
  localStorage.setItem(SEEN_KEY, JSON.stringify(seeds.slice(-2000)));
}
