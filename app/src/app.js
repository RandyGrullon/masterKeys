/**
 * Lectura a Primera Vista — orquestación de la app.
 *
 * Entradas:
 *   táctil — tocas la tecla en el piano de pantalla (para el viaje, sin piano)
 *   piano  — el micrófono escucha la nota tocada (requiere el instrumento)
 *
 * Ayuda (modo aprender): el piano ILUMINA la tecla de la nota actual. Es para
 * quien todavía no ubica las teclas. Pero mostrar la respuesta convierte el
 * ejercicio en emparejar posiciones, no en leer — así que las sesiones con
 * ayuda se marcan `assisted` y NO cuentan para la puerta. La medición honesta
 * solo ocurre con la ayuda apagada.
 *
 * Ante un error NO se revela la nota correcta: dar la respuesta en cuanto el
 * alumno vacila elimina el intento de recuperación, que es donde se aprende.
 */

import { generateExercise, LEVELS } from './music/generator.js';
import { renderExercise } from './music/staff.js';
import { renderKeyboard } from './music/keyboard.js';
import {
  describeMidi, matchesExpected,
  describeStaffPosition, describeInterval, nearestAnchor,
} from './music/theory.js';
import { PianoListener } from './audio/listener.js';
import { saveSession, summarize, evaluateGate, loadSessions, markSeedUsed, GATE } from './store.js';
import { signIn, signUp, signOut, isSignedIn, userEmail } from './cloud/supabase.js';
import { syncNow } from './cloud/sync.js';

const $ = (sel) => document.querySelector(sel);

// Rango del piano en pantalla: cubre todos los niveles con margen (DO2–DO6).
const KB_LO = 36;
const KB_HI = 84;

const state = {
  mode: 'tap',
  showKey: true,
  level: 1,
  exercise: null,
  states: [],
  index: 0,
  events: [],
  startedAt: null,
  noteShownAt: null,
  listener: null,
  running: false,
  keyboard: null,
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
  const scoreEl = $('#score');
  const x = 96 + state.index * 62;
  scoreEl.scrollTo({ left: Math.max(0, x - scoreEl.clientWidth / 2), behavior: 'smooth' });
  updateGuidance();
}

/** Actualiza el piano resaltado y el panel de lógica de lectura. */
function updateGuidance() {
  const note = state.exercise?.notes[state.index];
  const kb = state.keyboard;
  if (kb) {
    kb.clear();
    if (note && state.showKey) kb.mark(note.midi, 'target');
    if (note) {
      const x = kb.xOf(note.midi);
      if (x != null) {
        const el = $('#piano');
        el.scrollTo({ left: Math.max(0, x - el.clientWidth / 2), behavior: 'smooth' });
      }
    }
  }
  renderLiteracy(note);
}

/** Panel "lógica de lectura": explica la nota actual en palabras. */
function renderLiteracy(note) {
  const box = $('#literacy');
  if (!note) { box.hidden = true; return; }
  box.hidden = false;

  const info = describeMidi(note.midi);
  $('#lit-name').textContent = info.nameEs;

  const anc = nearestAnchor(note.midi);
  $('#lit-anchor').textContent = anc.isAnchor
    ? '★ es una de tus 4 anclas'
    : `a ${anc.distance} ${anc.distance === 1 ? 'grado' : 'grados'} de ${describeMidi(anc.anchor.midi).nameEs} (ancla)`;

  $('#lit-staff').textContent = describeStaffPosition(note.midi, note.clef);

  const groupHint = info.nameEs.startsWith('DO')
    ? 'a la izquierda del grupo de 2 negras'
    : info.nameEs.startsWith('FA')
      ? 'a la izquierda del grupo de 3 negras'
      : 'tecla blanca';
  $('#lit-key').textContent = state.showKey
    ? `iluminada en el piano — ${groupHint}`
    : `búscala en el piano: ${groupHint}`;

  // Intervalo desde la nota anterior — la Lección 3 del plan.
  if (state.index > 0) {
    const prev = state.exercise.notes[state.index - 1];
    const iv = describeInterval(prev.midi, note.midi);
    $('#lit-interval').textContent = iv.steps === 0
      ? 'la misma nota que la anterior'
      : `${iv.number} ${iv.dir} desde ${describeMidi(prev.midi).nameEs} — ${iv.shape}`;
  } else {
    $('#lit-interval').textContent = 'primera nota: nómbrala; las siguientes, léelas por distancia';
  }
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
    expected: expected.midi, played: midi, correct, latencyMs,
    clef: expected.clef, at: Date.now(),
  });

  if (state.keyboard) {
    state.keyboard.clearFeedback();
    state.keyboard.mark(midi, correct ? 'correct' : 'wrong');
    setTimeout(() => state.keyboard && state.keyboard.clearFeedback(), 450);
  }

  if (correct) {
    state.states[state.index] = 'ok';
    state.index++;
    if (state.index >= state.exercise.notes.length) newExercise();
    else {
      state.states[state.index] = 'current';
      state.noteShownAt = performance.now();
      draw();
    }
    flash('ok');
  } else {
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
  flash._t = setTimeout(() => { el.className = 'feedback'; el.textContent = ''; }, 600);
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
  // Solo las sesiones SIN ayuda cuentan: con la tecla a la vista no se prueba lectura.
  const g = evaluateGate(loadSessions().filter((s) => !s.assisted));
  const box = $('#gate');
  if (g.status === null) {
    box.className = 'gate unknown';
    box.innerHTML = `<strong>Puerta de Fase 1</strong><span>${g.reason}</span>`;
  } else {
    box.className = `gate ${g.status ? 'passed' : 'pending'}`;
    box.innerHTML =
      `<strong>Puerta de Fase 1 ${g.status ? '— superada 🎉' : ''}</strong>` +
      `<span>${g.reason} · muestra de ${g.sample} notas sin ayuda</span>`;
  }
  const sessions = loadSessions();
  const assisted = sessions.filter((s) => s.assisted).length;
  $('#history').textContent = sessions.length
    ? `${sessions.length} sesiones · ${sessions.reduce((n, s) => n + s.events.length, 0)} notas` +
      (assisted ? ` · ${assisted} en modo aprender (no cuentan para la meta)` : '')
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
        onLevel: (rms) => { $('#level-bar').style.width = `${Math.min(100, rms * 900)}%`; },
      });
      await state.listener.start();
      $('#mic-status').textContent = 'Escuchando el piano';
    } catch (err) {
      $('#mic-status').textContent = `Sin micrófono: ${err.message}`;
      state.mode = 'tap';
      $('#mode-tap').checked = true;
      setMode('tap');
    }
  }

  newExercise();
  $('#btn-start').hidden = true;
  $('#btn-stop').hidden = false;
  updateStats();
}

function stopSession() {
  state.running = false;
  if (state.listener) { state.listener.stop(); state.listener = null; }
  const durationMs = performance.now() - state.startedAt;
  if (state.events.length) {
    saveSession({
      date: new Date().toISOString(),
      mode: state.mode,
      assisted: state.showKey, // con ayuda no cuenta para la puerta
      level: state.level,
      durationMs,
      events: state.events,
    });
  }
  $('#btn-start').hidden = false;
  $('#btn-stop').hidden = true;
  $('#mic-status').textContent = '';
  $('#level-bar').style.width = '0%';
  if (state.keyboard) state.keyboard.clear();
  renderGate();
  // Sube la sesión recién guardada si hay sesión en la nube (no bloquea la UI).
  if (isSignedIn()) runSync();
}

// ── Sincronización en la nube ─────────────────────────────────────────
function renderSyncUI() {
  const inside = isSignedIn();
  $('#sync-in').hidden = !inside;
  $('#sync-out').hidden = inside;
  if (inside) $('#sync-email-label').textContent = userEmail() ?? '';
}

async function runSync(quiet = true) {
  const status = $('#sync-status');
  if (!quiet) status.textContent = 'Sincronizando…';
  const r = await syncNow();
  if (r.ok) {
    status.textContent = `✓ ${r.pushed} subidas · ${r.pulled} bajadas`;
    if (r.pulled) renderGate();
  } else if (r.reason === 'offline') {
    status.textContent = 'Sin conexión — se sincroniza al volver';
  } else if (r.reason === 'error') {
    status.textContent = `Error: ${r.message}`;
  } else if (!quiet) {
    status.textContent = '';
  }
}

function wireSync() {
  const status = $('#sync-status');
  const email = () => $('#sync-email').value.trim();
  const pass = () => $('#sync-pass').value;

  $('#sync-signin').addEventListener('click', async () => {
    if (!email() || !pass()) { status.textContent = 'Correo y contraseña'; return; }
    status.textContent = 'Entrando…';
    try {
      await signIn(email(), pass());
      renderSyncUI();
      await runSync(false);
    } catch (e) { status.textContent = e.message; }
  });

  $('#sync-signup').addEventListener('click', async () => {
    if (!email() || !pass()) { status.textContent = 'Correo y contraseña'; return; }
    status.textContent = 'Creando cuenta…';
    try {
      await signUp(email(), pass());
      if (isSignedIn()) { renderSyncUI(); await runSync(false); }
      else status.textContent = 'Revisa tu correo para confirmar la cuenta';
    } catch (e) { status.textContent = e.message; }
  });

  $('#sync-now').addEventListener('click', () => runSync(false));
  $('#sync-out-btn').addEventListener('click', () => {
    signOut();
    renderSyncUI();
    status.textContent = '';
  });

  renderSyncUI();
  // Al abrir la app, si ya hay sesión, sincroniza en segundo plano.
  if (isSignedIn()) runSync();
  // Cuando vuelve la conexión, reintenta.
  window.addEventListener('online', () => { if (isSignedIn()) runSync(); });
}

// ── Modo de entrada ───────────────────────────────────────────────────
function setMode(mode) {
  state.mode = mode;
  $('#mic-panel').hidden = mode !== 'piano';
  // En modo micrófono el piano es solo guía; en táctil, es la entrada.
  buildKeyboard();
}

function buildKeyboard() {
  const onKey = state.mode === 'tap' ? (midi) => submit(midi) : null;
  state.keyboard = renderKeyboard($('#piano'), KB_LO, KB_HI, onKey);
  updateGuidance();
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
  $('#show-key').addEventListener('change', (e) => {
    state.showKey = e.target.checked;
    updateGuidance();
  });
  $('#btn-start').addEventListener('click', startSession);
  $('#btn-stop').addEventListener('click', stopSession);

  wireSync();

  // Enganche de depuración: simular sesiones sin micrófono ni clics.
  window.__piano = { state, submit };

  state.exercise = generateExercise(1, 12345);
  state.states = state.exercise.notes.map((_, i) => (i === 0 ? 'current' : 'pending'));
  buildKeyboard();
  draw();
  renderGate();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
