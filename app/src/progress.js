/**
 * Progreso por nivel: "¿qué domino, qué está en curso, qué me falta?"
 *
 * Reutiliza el mismo criterio honesto que la puerta de Fase 1 (store.js):
 * - solo cuentan sesiones SIN ayuda — con el piano dándote la tecla no se
 *   prueba lectura, así que esas sesiones no pueden hacerte "progresar".
 * - con muestra insuficiente el estado es `null` ("aún no se sabe"), nunca
 *   `false` ("no lo dominas") — son afirmaciones distintas y no hay que
 *   mentir por omisión de dato.
 *
 * Un nivel se considera DOMINADO con el mismo umbral que la puerta de Fase 1
 * del plan (p90 < 2 s, precisión ≥ 95%, sobre 50+ notas): es el criterio que
 * ya validamos, no uno nuevo inventado para "hacer que se vea progreso".
 */

import { LEVELS } from './music/generator.js';
import { GATE, percentile } from './store.js';

/** Métricas SIN ayuda para un nivel concreto, agregando varias sesiones. */
export function levelStats(sessions, levelId) {
  const events = sessions
    .filter((s) => s.level === levelId && !s.assisted)
    .flatMap((s) => s.events);
  const attempted = events.length;
  const correct = events.filter((e) => e.correct);
  const accuracy = attempted ? correct.length / attempted : 0;
  const p90 = percentile(correct.map((e) => e.latencyMs), 90);
  return { attempted, correctCount: correct.length, accuracy, p90 };
}

/**
 * Estado de un nivel: 'locked' | 'in_progress' | 'mastered'.
 * 'locked' = el nivel anterior aún no se domina (no tiene sentido medir este).
 */
export function levelStatus(sessions, levelId) {
  const idx = LEVELS.findIndex((l) => l.id === levelId);
  if (idx > 0) {
    const prevMastery = levelMastery(sessions, LEVELS[idx - 1].id);
    if (prevMastery.status !== true) return 'locked';
  }
  const m = levelMastery(sessions, levelId);
  if (m.status === true) return 'mastered';
  return 'in_progress';
}

/** ¿Se domina este nivel? Mismo umbral que GATE, aplicado por nivel. */
export function levelMastery(sessions, levelId) {
  const s = levelStats(sessions, levelId);
  if (s.attempted < GATE.minNotes) {
    return { status: null, stats: s, reason: `${GATE.minNotes - s.attempted} notas más sin ayuda` };
  }
  const passed = s.accuracy >= GATE.minAccuracy && s.p90 <= GATE.maxP90LatencyMs;
  return {
    status: passed,
    stats: s,
    reason: passed
      ? 'dominado'
      : s.accuracy < GATE.minAccuracy
        ? `precisión ${(s.accuracy * 100).toFixed(0)}% (falta ${(GATE.minAccuracy * 100).toFixed(0)}%)`
        : `${(s.p90 / 1000).toFixed(2)} s de latencia (falta bajar de 2 s)`,
  };
}

/** Vista completa: los 5 niveles con su estado, para pintar la barra de progreso. */
export function fullProgress(sessions) {
  return LEVELS.map((level) => {
    const mastery = levelMastery(sessions, level.id);
    return {
      id: level.id,
      name: level.name,
      description: level.description,
      status: levelStatus(sessions, level.id),
      mastery,
    };
  });
}

/** Siguiente nivel recomendado: el primer 'in_progress' desbloqueado, o el último dominado. */
export function recommendedLevel(sessions) {
  const prog = fullProgress(sessions);
  const next = prog.find((p) => p.status === 'in_progress');
  if (next) return next.id;
  const mastered = prog.filter((p) => p.status === 'mastered');
  return mastered.length ? mastered[mastered.length - 1].id : 1;
}

/** Resumen de una línea: cuántos niveles dominados de cuántos totales. */
export function overallProgress(sessions) {
  const prog = fullProgress(sessions);
  const mastered = prog.filter((p) => p.status === 'mastered').length;
  return { mastered, total: LEVELS.length, pct: Math.round((mastered / LEVELS.length) * 100) };
}

/**
 * Métricas separadas por clave. Casi todo el mundo flaquea en clave de fa y no
 * se da cuenta porque la media global lo esconde.
 */
export function clefBreakdown(sessions) {
  const out = {
    treble: { attempted: 0, correct: 0, lat: [] },
    bass: { attempted: 0, correct: 0, lat: [] },
  };
  for (const s of sessions) {
    if (s.assisted) continue;
    for (const e of s.events ?? []) {
      const b = out[e.clef];
      if (!b) continue;
      b.attempted++;
      if (e.correct) { b.correct++; b.lat.push(e.latencyMs); }
    }
  }
  for (const k of Object.keys(out)) {
    const b = out[k];
    b.accuracy = b.attempted ? b.correct / b.attempted : null;
    b.p90 = b.lat.length ? percentile(b.lat, 90) : null;
    delete b.lat;
  }
  return out;
}

/** Lunes de la semana de una fecha (ISO corto), para agrupar. */
function weekKey(dateStr) {
  const d = new Date(dateStr);
  const day = (d.getUTCDay() + 6) % 7; // 0 = lunes
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

/**
 * Historial agregado por semana: lo único que muestra si de verdad mejoras.
 * Una sesión aislada no dice nada; la tendencia sí.
 */
export function weeklyHistory(sessions) {
  const weeks = new Map();
  for (const s of sessions) {
    if (s.assisted) continue;
    const k = weekKey(s.date);
    if (!weeks.has(k)) weeks.set(k, { week: k, sessions: 0, notes: 0, correct: 0, lat: [], minutes: 0 });
    const w = weeks.get(k);
    w.sessions++;
    w.minutes += (s.durationMs ?? 0) / 60000;
    for (const e of s.events ?? []) {
      w.notes++;
      if (e.correct) { w.correct++; w.lat.push(e.latencyMs); }
    }
  }
  return [...weeks.values()]
    .sort((a, b) => a.week.localeCompare(b.week))
    .map((w) => ({
      week: w.week,
      sessions: w.sessions,
      notes: w.notes,
      minutes: Math.round(w.minutes),
      accuracy: w.notes ? w.correct / w.notes : null,
      p90: w.lat.length ? percentile(w.lat, 90) : null,
    }));
}
