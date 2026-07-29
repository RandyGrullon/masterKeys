/**
 * El calendario del PLAN.md, en datos.
 *
 * Sirve para que la app sepa DÓNDE ESTÁS: en qué semana de las 16, qué fase
 * toca, y si estás en el tramo sin piano (Alemania, 8-30 ago). Sin esto la app
 * es un juego de notas; con esto es el plan.
 *
 * Las fechas son las del plan real, no relativas: si el plan cambia, se cambia
 * aquí y no hay que recalcular nada.
 */

export const PLAN_START = '2026-07-19';
export const PLAN_END = '2026-11-29';

/** Fases con sus fechas y el nivel de la app que les corresponde. */
export const PHASES = [
  {
    id: 1, name: 'Alfabetización', from: '2026-07-19', to: '2026-08-07',
    goal: 'Identificar cualquier nota de ambas claves en menos de 2 s',
    levels: [1, 2, 3, 4, 5, 6, 7, 8],
  },
  {
    id: 'trip', name: '✈ Alemania — sin piano', from: '2026-08-08', to: '2026-08-30',
    goal: '15 min/día de lectura en pantalla. No perder velocidad',
    levels: [1, 2, 3, 4, 5, 6, 7, 8], noPiano: true,
  },
  {
    id: 2, name: 'Puente técnico', from: '2026-08-31', to: '2026-09-13',
    goal: 'Vals bajo–acorde–acorde y cifrados en 5 tonalidades',
    levels: [9, 10, 11],
  },
  {
    id: 3, name: "Merry-Go-Round of Life", from: '2026-09-14', to: '2026-10-25',
    goal: 'Pieza completa a tempo, con pedal limpio',
    levels: [11, 12],
  },
  {
    id: 4, name: 'La La Land', from: '2026-10-26', to: '2026-11-22',
    goal: "Mia & Sebastian's Theme completo y de memoria",
    levels: [12],
  },
  {
    id: 5, name: 'Pulido', from: '2026-11-23', to: '2026-11-29',
    goal: 'Las dos piezas grabadas. Prueba final de lectura',
    levels: [12],
  },
];

const day = (s) => new Date(`${s}T00:00:00Z`).getTime();
const DAY_MS = 86400000;

/** Estado del plan para una fecha dada (por defecto, hoy). */
export function planStatus(now = new Date()) {
  const t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const start = day(PLAN_START);
  const end = day(PLAN_END);

  const weekIndex = Math.floor((t - start) / (7 * DAY_MS)) + 1;
  const totalWeeks = Math.ceil((end - start) / (7 * DAY_MS));
  const daysLeft = Math.round((end - t) / DAY_MS);

  const phase = PHASES.find((p) => t >= day(p.from) && t <= day(p.to));

  if (t < start) {
    return { before: true, phase: PHASES[0], week: 0, totalWeeks, daysLeft: Math.round((end - t) / DAY_MS) };
  }
  if (t > end) {
    return { after: true, phase: null, week: totalWeeks, totalWeeks, daysLeft: 0 };
  }
  return {
    phase: phase ?? null,
    week: Math.max(1, Math.min(totalWeeks, weekIndex)),
    totalWeeks,
    daysLeft,
    noPiano: !!phase?.noPiano,
  };
}

/** Niveles de la app recomendados para la fase actual. */
export function levelsForToday(now = new Date()) {
  return planStatus(now).phase?.levels ?? [1];
}
