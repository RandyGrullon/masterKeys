/**
 * Lectura a Primera Vista — orquestación de la app.
 *
 * Dos modos:
 *   piano  — el micrófono escucha la nota tocada (requiere el instrumento)
 *   táctil — se toca el nombre en pantalla (para el viaje a Alemania, 8-30 ago,
 *            donde no hay piano pero sí hay que mantener la velocidad de lectura)
 *
 * Decisión pedagógica: ante un error NO se revela la respuesta. Dar la nota en
 * cuanto el alumno vacila elimina el intento de recuperación, que es donde
 * ocurre el aprendizaje. Solo se marca el fallo y se deja reintentar.
 */

import { generateExercise, LEVELS } from './music/generator.js';
import { renderExercise } from './music/staff.js';
import { describeMidi, matchesExpected } from './music/theory.js';
import { PianoListener } from './audio/listener.js';
import { saveSession, summarize, evaluateGate, loadSessions, markSeedUsed, GATE } from './store.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  mode: 'tap',
  level: 1,
  exercise: null,
  states: [],
  index: 0,
  events: [],
  startedAt: null,
  noteShownAt: null,
  listener: null,
  running: false,
};

// ── Ejercicio ─────────────────────────────────────────────────────────
function newExercise() {
  const seed = Date.now() ^ Math.floor(Math.random() * 0xffff);
  markSeedUsed(seed);
  state.exercise = generateExercise(state.level, seed);
  state.states = state.exercise.notes.map((_, i) => (i === 0 ? 'current' : 'pending'));
  state.index = 0;
  state.noteShownAt = performance.now();
  draw();
}

function draw() {
  renderExercise($('#score'), state.exercise, state.states);
  const el = $('#score');
  // Mantiene la nota actual a la vista: la partitura se desplaza de lado.
  const x = 96 + state.index * 62;
  el.scrollTo({ left: Math.max(0, x - el.clientWidth / 2), behavior: 'smooth' });
  $('#exercise-info').textContent =
    `${state.exercise.levelName} · ${state.exercise.keyName} · ${state.index + 1}/${state.exercise.notes.length}`;
}

function expectedNote() {
  return state.exercise.notes[state.index];
}

function submit(midi) {
  if (!state.running || !state.exercise) return;
  const expected = expectedNote();
  const correct = matchesExpected(midi, expected.midi, false);
  const latencyMs = performance.now() - state.noteShownAt;

  state.events.push({
    expected: expected.midi,
    played: midi,
    correct,
    latencyMs,
    clef: expected.clef,
    at: Date.now(),
  });

  if (correct) {
    state.states[state.index] = 'ok';
    state.index++;
    if (state.index >= state.exercise.notes.length) {
      newExercise();
    } else {
      state.states[state.index] = 'current';
      state.noteShownAt = performance.now();
      draw();
    }
    flash('ok');
  } else {
    // Se marca el error pero NO se revela la nota correcta ni se avanza.
    state.states[state.index] = 'error';
    draw();
    setTimeout(() => {
      if (state.states[state.index] === 'error') {
        state.states[state.index] = 'current';
        draw();
      }
    }, 400);
    flash('error', describeMidi(midi).nameEs);
  }
  updateStats();
}

function flash(kind, text = '') {
  const el = $('#feedback');
  el.className = `feedback ${kind}`;
  el.textContent = kind === 'ok' ? '✓' : `✕ ${text}`;
  clearTimeout(flash._t);
  flash._t = setTimeout(() => {
    el.className = 'feedback';
    el.textContent = '';
  }, 600);
}

// ── Estadísticas ──────────────────────────────────────────────────────
function updateStats() {
  const durationMs = state.startedAt ? performance.now() - state.startedAt : 0;
  const s = summarize({ events: state.events, durationMs });
  $('#stat-correct').textContent = s.correct;
  $('#stat-accuracy').textContent = s.attempted ? `${Math.round(s.accuracy * 100)}%` : '—';
  $('#stat-npm').textContent = s.notesPerMin ? s.notesPerMin.toFixed(0) : '—';
  $('#stat-p90').textContent = s.p90 ? `${(s.p90 / 1000).toFixed(2)} s` : '—';
  $('#stat-p90').className = s.p90 && s.p90 <= GATE.maxP90LatencyMs ? 'value good' : 'value';
}

function renderGate() {
  const g = evaluateGate();
  const box = $('#gate');
  if (g.status === null) {
    box.className = 'gate unknown';
    box.innerHTML = `<strong>Puerta de Fase 1</strong><span>${g.reason}</span>`;
  } else {
    box.className = `gate ${g.status ? 'passed' : 'pending'}`;
    box.innerHTML =
      `<strong>Puerta de Fase 1 ${g.status ? '— superada' : ''}</strong>` +
      `<span>${g.reason} · muestra de ${g.sample} notas</span>`;
  }
  const sessions = loadSessions();
  $('#history').textContent = sessions.length
    ? `${sessions.length} sesiones guardadas · ${sessions.reduce((n, s) => n + s.events.length, 0)} notas en total`
    : 'Sin sesiones todavía';
}

// ── Ciclo de sesión ───────────────────────────────────────────────────
async function startSession() {
  state.events = [];
  state.startedAt = performance.now();
  state.running = true;

  if (state.mode === 'piano') {
    try {
      state.listener = new PianoListener({
        onNote: ({ midi }) => submit(midi),
        onLevel: (rms) => {
          $('#level-bar').style.width = `${Math.min(100, rms * 900)}%`;
        },
      });
      await state.listener.start();
      $('#mic-status').textContent = 'Escuchando el piano';
    } catch (err) {
      $('#mic-status').textContent = `Sin micrófono: ${err.message}`;
      state.mode = 'tap';
      $('#mode-tap').checked = true;
      renderTapPad();
    }
  }

  newExercise();
  $('#btn-start').hidden = true;
  $('#btn-stop').hidden = false;
  updateStats();
}

function stopSession() {
  state.running = false;
  if (state.listener) {
    state.listener.stop();
    state.listener = null;
  }
  const durationMs = performance.now() - state.startedAt;
  if (state.events.length) {
    saveSession({
      date: new Date().toISOString(),
      mode: state.mode,
      level: state.level,
      durationMs,
      events: state.events,
    });
  }
  $('#btn-start').hidden = false;
  $('#btn-stop').hidden = true;
  $('#mic-status').textContent = '';
  $('#level-bar').style.width = '0%';
  renderGate();
}

// ── Teclado táctil (modo sin piano) ───────────────────────────────────
function renderTapPad() {
  const pad = $('#tap-pad');
  pad.innerHTML = '';
  const names = ['DO', 'RE', 'MI', 'FA', 'SOL', 'LA', 'SI'];
  // Se pide la nota Y la octava: confundir DO4 con DO5 es justo el error que
  // el plan quiere corregir, así que no se puede aceptar la clase de altura sola.
  for (let octave = 2; octave <= 6; octave++) {
    const row = document.createElement('div');
    row.className = 'tap-row';
    names.forEach((n, degree) => {
      const midi = (octave + 1) * 12 + [0, 2, 4, 5, 7, 9, 11][degree];
      const b = document.createElement('button');
      b.className = 'tap-key';
      b.textContent = `${n}${octave}`;
      b.addEventListener('click', () => submit(midi));
      row.appendChild(b);
    });
    pad.appendChild(row);
  }
}

function setMode(mode) {
  state.mode = mode;
  $('#tap-pad').hidden = mode !== 'tap';
  $('#mic-panel').hidden = mode !== 'piano';
  if (mode === 'tap') renderTapPad();
}

// ── Arranque ──────────────────────────────────────────────────────────
function init() {
  const sel = $('#level');
  LEVELS.forEach((l) => {
    const opt = document.createElement('option');
    opt.value = l.id;
    opt.textContent = `${l.id}. ${l.name} — ${l.description}`;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => {
    state.level = Number(sel.value);
    if (state.running) newExercise();
  });

  $('#mode-tap').addEventListener('change', () => setMode('tap'));
  $('#mode-piano').addEventListener('change', () => setMode('piano'));
  $('#btn-start').addEventListener('click', startSession);
  $('#btn-stop').addEventListener('click', stopSession);

  // Enganche de depuración: permite simular una sesión sin micrófono ni
  // clics, para verificar el ciclo completo de medición.
  window.__piano = { state, submit };

  setMode('tap');
  state.exercise = generateExercise(1, 12345);
  state.states = state.exercise.notes.map((_, i) => (i === 0 ? 'current' : 'pending'));
  draw();
  renderGate();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
