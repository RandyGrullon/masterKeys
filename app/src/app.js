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
import { describeDuration, timingError, inTime } from './music/rhythm.js';
import { PianoListener } from './audio/listener.js';
import { MidiListener } from './audio/midi.js';
import { Synth } from './audio/synth.js';
import { Metronome } from './audio/metronome.js';
import { saveSession, summarize, evaluateGate, loadSessions, markSeedUsed, GATE } from './store.js';
import { fullProgress, overallProgress, recommendedLevel, weeklyHistory, clefBreakdown } from './progress.js';
import { planStatus } from './plan.js';
import { signIn, signUp, signOut, isSignedIn, userEmail } from './cloud/supabase.js';
import { syncNow } from './cloud/sync.js';

const $ = (sel) => document.querySelector(sel);

// Rango del piano en pantalla: cubre todos los niveles con margen (DO2–DO6).
const KB_LO = 36;
const KB_HI = 84;

const state = {
  mode: 'tap',
  // Por defecto APAGADA: con la tecla iluminada la sesión no cuenta para el
  // progreso, y tener la ayuda encendida por defecto hacía que toda la
  // práctica se descartara en silencio.
  showKey: false,
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
  synth: new Synth(),
  // Ritmo
  metronome: null,
  bpm: 60,
  useMetronome: false,
  // Anticipación ojo-mano
  anticipate: false,
  // Notas ya acertadas del evento actual (para acordes y dos manos)
  pending: new Set(),
  autosaveTimer: null,
};

// ── Ejercicio ─────────────────────────────────────────────────────────
function newExercise() {
  const seed = Date.now() ^ Math.floor(Math.random() * 0xffff);
  markSeedUsed(seed);
  state.exercise = generateExercise(state.level, seed);
  state.states = state.exercise.events.map((_, i) => (i === 0 ? 'current' : 'pending'));
  state.index = 0;
  state.pending = new Set(); // notas ya acertadas del evento actual (acordes)
  state.noteShownAt = performance.now();
  draw();
}

/** Evento actual del ejercicio (una nota, un acorde, o dos manos). */
function currentEvent() {
  return state.exercise?.events[state.index] ?? null;
}

function draw() {
  // Modo anticipación: se oculta desde 2 eventos por delante, obligando a leer
  // adelantado — el mecanismo real de la lectura a primera vista.
  const occludeFrom = state.anticipate ? state.index + 2 : Infinity;
  const { xOfEvent } = renderExercise($('#score'), state.exercise, state.states, { occludeFrom });
  const scoreEl = $('#score');
  const x = xOfEvent(state.index);
  scoreEl.scrollTo({ left: Math.max(0, x - scoreEl.clientWidth / 2), behavior: 'smooth' });
  updateGuidance();
}

/** Actualiza el piano resaltado y el panel de lógica de lectura. */
function updateGuidance() {
  const event = currentEvent();
  const kb = state.keyboard;
  if (kb) {
    kb.clear();
    if (event) {
      // Con ayuda se iluminan TODAS las notas del evento (acorde incluido),
      // menos las que ya acertaste.
      if (state.showKey) {
        for (const n of event.notes) {
          if (!state.pending.has(n.midi)) kb.mark(n.midi, 'target');
        }
      }
      const first = event.notes[0];
      const x = first && kb.xOf(first.midi);
      if (x != null) {
        const el = $('#piano');
        el.scrollTo({ left: Math.max(0, x - el.clientWidth / 2), behavior: 'smooth' });
      }
    }
  }
  renderLiteracy(event);
}

/** Panel "lógica de lectura": explica el evento actual en palabras. */
function renderLiteracy(event) {
  const box = $('#literacy');
  if (!event) { box.hidden = true; return; }
  box.hidden = false;

  const notes = event.notes;
  const fig = describeDuration(event.duration);

  // En un acorde o dos manos se nombran todas las notas que faltan.
  const missing = notes.filter((n) => !state.pending.has(n.midi));
  const names = missing.map((n) => describeMidi(n.midi).nameEs);
  $('#lit-name').textContent = names.join(' + ') || '✓';

  if (notes.length > 1) {
    const hands = new Set(notes.map((n) => n.clef));
    $('#lit-anchor').textContent = hands.size > 1
      ? `${notes.length} notas · dos manos a la vez`
      : `acorde de ${notes.length} notas`;
  } else {
    const anc = nearestAnchor(notes[0].midi);
    $('#lit-anchor').textContent = anc.isAnchor
      ? '★ es una de tus 4 anclas'
      : `a ${anc.distance} ${anc.distance === 1 ? 'grado' : 'grados'} de ${describeMidi(anc.anchor.midi).nameEs} (ancla)`;
  }

  $('#lit-staff').textContent = missing.length
    ? describeStaffPosition(missing[0].midi, missing[0].clef)
    : 'evento completo';

  // Figura y conteo — la parte de ritmo, que antes no existía.
  $('#lit-key').textContent = `${fig.name}${fig.count ? ` · cuenta «${fig.count}»` : ''}`;

  // Intervalo desde el evento anterior — la Lección 3 del plan.
  const prevEvent = state.index > 0 ? state.exercise.events[state.index - 1] : null;
  if (prevEvent && notes.length === 1 && prevEvent.notes.length === 1) {
    const iv = describeInterval(prevEvent.notes[0].midi, notes[0].midi);
    $('#lit-interval').textContent = iv.steps === 0
      ? 'la misma nota que la anterior'
      : `${iv.number} ${iv.dir} desde ${describeMidi(prevEvent.notes[0].midi).nameEs} — ${iv.shape}`;
  } else if (prevEvent) {
    $('#lit-interval').textContent = `compás ${event.measure + 1}, tiempo ${event.beatInMeasure + 1}`;
  } else {
    $('#lit-interval').textContent = 'primera nota: nómbrala; las siguientes, léelas por distancia';
  }
}

/**
 * Registra una nota tocada.
 *
 * Con acordes o dos manos hay que acumular: el evento no avanza hasta que todas
 * sus notas estén tocadas. El orden dentro del evento no importa (un acorde no
 * tiene orden), y tocar dos veces la misma nota no cuenta doble.
 */
function submit(midi) {
  if (!state.running || !state.exercise) return;
  const event = currentEvent();
  if (!event) return;

  const targets = event.notes.map((n) => n.midi);
  const hit = targets.find((t) => matchesExpected(midi, t, false) && !state.pending.has(t));
  const correct = hit !== undefined;
  const latencyMs = performance.now() - state.noteShownAt;

  // Desviación rítmica: solo tiene sentido si el metrónomo va marcando.
  const rhythmError = state.metronome?.running
    ? timingError(event.absoluteBeat, performance.now(), state.metronome.startedAtMs, state.bpm)
    : null;

  state.events.push({
    expected: correct ? hit : targets[0],
    played: midi,
    correct,
    latencyMs,
    clef: (event.notes.find((n) => n.midi === hit) ?? event.notes[0]).clef,
    duration: event.duration,
    rhythmErrorMs: rhythmError,
    at: Date.now(),
  });

  if (state.keyboard) {
    state.keyboard.clearFeedback();
    state.keyboard.mark(midi, correct ? 'correct' : 'wrong');
    setTimeout(() => state.keyboard && state.keyboard.clearFeedback(), 450);
  }

  if (correct) {
    state.pending.add(hit);
    const complete = targets.every((t) => state.pending.has(t));
    if (complete) {
      state.states[state.index] = 'ok';
      state.index++;
      state.pending = new Set();
      if (state.index >= state.exercise.events.length) newExercise();
      else {
        state.states[state.index] = 'current';
        state.noteShownAt = performance.now();
        draw();
      }
      flash('ok');
    } else {
      // Acorde a medias: se refresca la guía para tachar lo ya tocado.
      updateGuidance();
      flash('partial', `faltan ${targets.length - state.pending.size}`);
    }
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
  // 'partial' es un acierto a medias (acorde incompleto), no un error: marcarlo
  // con ✕ haría creer que la nota estuvo mal.
  el.textContent = kind === 'ok' ? '✓' : kind === 'partial' ? `◓ ${text}` : `✕ ${text}`;
  clearTimeout(flash._t);
  flash._t = setTimeout(() => { el.className = 'feedback'; el.textContent = ''; }, 600);
}

// ── Estadísticas ──────────────────────────────────────────────────────

/**
 * Instantánea de la sesión en curso con el mismo formato que una guardada.
 * Permite que el progreso se calcule en vivo, incluyendo lo que llevas ahora
 * mismo, en vez de esperar a pulsar "Terminar".
 */
function liveSessionSnapshot() {
  if (!state.running || !state.events.length) return null;
  return {
    id: '__live__',
    date: new Date().toISOString(),
    mode: state.mode,
    assisted: state.showKey,
    level: state.level,
    durationMs: performance.now() - state.startedAt,
    events: state.events,
  };
}

/** Sesiones guardadas + la que está en curso, para métricas en vivo. */
function sessionsWithLive() {
  const live = liveSessionSnapshot();
  const saved = loadSessions();
  return live ? [...saved, live] : saved;
}

function updateStats() {
  const durationMs = state.startedAt ? performance.now() - state.startedAt : 0;
  const s = summarize({ events: state.events, durationMs });
  $('#stat-correct').textContent = s.correct;
  $('#stat-accuracy').textContent = s.attempted ? `${Math.round(s.accuracy * 100)}%` : '—';
  $('#stat-npm').textContent = s.notesPerMin ? s.notesPerMin.toFixed(0) : '—';
  $('#stat-p90').textContent = s.p90 ? `${(s.p90 / 1000).toFixed(2)} s` : '—';
  $('#stat-p90').className = s.p90 && s.p90 <= GATE.maxP90LatencyMs ? 'value good' : 'value';

  updateLiveBadge(s);
  // El progreso se recalcula en vivo: la barra debe moverse mientras tocas.
  renderProgress(sessionsWithLive());
}

/** Indicador claro de si hay sesión activa y si esa sesión cuenta. */
function updateLiveBadge(summary) {
  const el = $('#live-badge');
  if (!state.running) {
    el.className = 'live-badge idle';
    el.textContent = 'Sin sesión activa';
    return;
  }
  if (state.showKey) {
    el.className = 'live-badge warn';
    el.textContent = `● En curso · ${summary.attempted} notas — NO cuenta (ayuda activa)`;
  } else {
    el.className = 'live-badge good';
    el.textContent = `● En curso · ${summary.attempted} notas — cuenta para tu progreso`;
  }
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

  renderProgress(sessions);
}

/**
 * Pinta los 5 niveles con su estado: dominado, en curso o bloqueado.
 * Un nivel se bloquea hasta dominar el anterior — evita saltar a nivel 4
 * sin haber consolidado las anclas, que es donde se instalan malos hábitos.
 */
function renderProgress(sessions) {
  const prog = fullProgress(sessions);
  const overall = overallProgress(sessions);
  $('#progress-pct').textContent = `${overall.pct}%`;

  const list = $('#progress-levels');
  list.innerHTML = '';
  const rec = recommendedLevel(sessions);

  for (const p of prog) {
    const li = document.createElement('li');
    const isCurrent = p.id === rec && p.status !== 'mastered';
    li.className = `plevel ${p.status}${isCurrent ? ' current' : ''}`;

    const st = p.mastery.stats;
    const badge = p.status === 'mastered' ? '✓' : p.status === 'locked' ? '🔒' : p.id;
    const acc = st.attempted ? Math.round(st.accuracy * 100) : 0;

    // La barra muestra el ESLABÓN MÁS DÉBIL de los tres criterios, no solo
    // cuántas notas llevas: si tienes 50 notas pero 70% de precisión, estar
    // al 100% de muestra no significa estar cerca de dominarlo.
    let barPct = 0;
    if (p.status === 'mastered') barPct = 100;
    else if (p.status !== 'locked' && st.attempted) {
      const sample = Math.min(1, st.attempted / GATE.minNotes);
      const accuracy = Math.min(1, st.accuracy / GATE.minAccuracy);
      const speed = st.p90 ? Math.min(1, GATE.maxP90LatencyMs / st.p90) : 0;
      barPct = Math.round(Math.min(sample, accuracy, speed) * 100);
    }

    let detail;
    if (p.status === 'locked') detail = 'domina el nivel anterior primero';
    else if (p.status === 'mastered') detail = `dominado · ${acc}% de precisión`;
    else if (st.attempted === 0) detail = 'sin intentos todavía · practica sin ayuda';
    else if (st.attempted < GATE.minNotes) {
      detail = `${st.attempted}/${GATE.minNotes} notas · ${acc}% precisión` +
        (st.p90 ? ` · ${(st.p90 / 1000).toFixed(1)} s` : '');
    } else detail = `${st.attempted} notas · falta: ${p.mastery.reason}`;

    li.innerHTML = `
      <span class="plevel-badge">${badge}</span>
      <span class="plevel-body">
        <span class="plevel-name">${p.id}. ${p.name}</span>
        <span class="plevel-detail">${detail}</span>
      </span>
      <span class="plevel-bar"><span class="plevel-bar-fill" style="width:${barPct}%"></span></span>
    `;
    list.appendChild(li);
  }

  const next = prog.find((p) => p.id === rec);
  $('#progress-next').innerHTML = overall.mastered === overall.total
    ? '🎉 Dominas los 5 niveles de la Fase 1 del plan.'
    : `Siguiente objetivo: <strong>Nivel ${next.id} — ${next.name}</strong>`;
}

// ── Ciclo de sesión ───────────────────────────────────────────────────
async function startSession() {
  state.events = [];
  state.startedAt = performance.now();
  state.running = true;
  state.synth.resume(); // el clic en "Empezar" es el gesto que habilita el audio

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
  } else if (state.mode === 'midi') {
    try {
      state.listener = new MidiListener({
        onNote: ({ midi, velocity }) => { state.synth.play(midi, velocity); submit(midi); },
        onDevice: (names) => {
          $('#midi-status').textContent = names.length
            ? `Conectado: ${names.join(', ')}`
            : 'Ningún piano MIDI detectado — conéctalo por USB';
        },
      });
      const devices = await state.listener.start();
      $('#midi-status').textContent = devices.length
        ? `Conectado: ${devices.join(', ')}`
        : 'Ningún piano MIDI detectado — conéctalo por USB';
    } catch (err) {
      $('#midi-status').textContent = err.message;
      state.mode = 'tap';
      $('#mode-tap').checked = true;
      setMode('tap');
    }
  }

  newExercise();

  // Metrónomo: el plan lo llama obligatorio. Sin referencia externa de pulso,
  // el alumno ajusta el tempo a lo que le sale y fosiliza el error.
  if (state.useMetronome) {
    state.metronome = new Metronome({ bpm: state.bpm, beatsPerMeasure: state.exercise.beatsPerMeasure });
    state.metronome.start();
  }

  // Autoguardado: sin esto, cerrar la app sin pulsar "Terminar" perdía toda la
  // práctica. Se guarda un borrador cada 20 s y se limpia al terminar bien.
  state.autosaveTimer = setInterval(() => autosaveDraft(), 20000);

  $('#btn-start').hidden = true;
  $('#btn-stop').hidden = false;
  updateStats();
  updateLiveBadge({ attempted: 0 }); // visible desde la primera nota
}

const DRAFT_KEY = 'piano-trainer:draft:v1';

/** Guarda un borrador de la sesión en curso, por si la app se cierra. */
function autosaveDraft() {
  if (!state.running || !state.events.length) return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      date: new Date().toISOString(),
      mode: state.mode,
      assisted: state.showKey,
      level: state.level,
      durationMs: performance.now() - state.startedAt,
      events: state.events,
    }));
  } catch { /* cuota llena: no es crítico */ }
}

/**
 * Recupera un borrador de una sesión que quedó sin cerrar (la app se cerró a
 * media práctica). Se guarda como sesión real para no perder el trabajo.
 */
function recoverDraft() {
  let draft;
  try {
    draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
  } catch { draft = null; }
  localStorage.removeItem(DRAFT_KEY);
  if (draft?.events?.length) {
    saveSession(draft);
    return draft.events.length;
  }
  return 0;
}

function stopSession() {
  state.running = false;
  if (state.listener) { state.listener.stop(); state.listener = null; }
  if (state.metronome) { state.metronome.stop(); state.metronome = null; }
  if (state.autosaveTimer) { clearInterval(state.autosaveTimer); state.autosaveTimer = null; }
  localStorage.removeItem(DRAFT_KEY); // se cerró bien: el borrador ya no hace falta
  const durationMs = performance.now() - state.startedAt;
  const prevRecommended = recommendedLevel(loadSessions());
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
  updateLiveBadge({ attempted: 0 });
  renderGate();
  renderHistoryPanel(); // la evolución semanal y el desglose por clave cambiaron

  // Subida de nivel: si esta sesión (sin ayuda) hizo que se domine un nivel
  // nuevo, se avanza el selector y se celebra con un pequeño arpegio.
  const newRecommended = recommendedLevel(loadSessions());
  if (newRecommended > prevRecommended) celebrateLevelUp(newRecommended);

  // Sube la sesión recién guardada si hay sesión en la nube (no bloquea la UI).
  if (isSignedIn()) runSync();
}

function celebrateLevelUp(newLevel) {
  state.level = newLevel;
  $('#level').value = String(newLevel);
  if (state.synth.enabled) {
    // Arpegio ascendente breve como confirmación sonora del logro.
    [60, 64, 67, 72].forEach((m, i) => setTimeout(() => state.synth.play(m, 100), i * 90));
  }
  const el = $('#feedback');
  el.className = 'feedback ok';
  el.textContent = `🎉 Nivel ${newLevel}`;
  clearTimeout(flash._t);
  flash._t = setTimeout(() => { el.className = 'feedback'; el.textContent = ''; }, 2200);
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
    // "0 subidas · 0 bajadas" se leía como fallo cuando en realidad significa
    // que ya estaba todo al día. Se informa el estado, no solo el delta.
    const total = loadSessions().length;
    const movimiento = [];
    if (r.pushed) movimiento.push(`${r.pushed} subida${r.pushed > 1 ? 's' : ''}`);
    if (r.pulled) movimiento.push(`${r.pulled} bajada${r.pulled > 1 ? 's' : ''}`);
    status.textContent = movimiento.length
      ? `✓ ${movimiento.join(' · ')} · ${total} sesiones en total`
      : `✓ Todo al día · ${total} sesión${total === 1 ? '' : 'es'} guardada${total === 1 ? '' : 's'}`;
    if (r.pulled) renderGate();
  } else if (r.reason === 'offline') {
    status.textContent = 'Sin conexión — se sincroniza al volver';
  } else if (r.reason === 'error') {
    // El fallo más probable la primera vez: la tabla no existe todavía porque
    // no se corrió supabase-setup.sql. Decirlo explícitamente ahorra un rato
    // de desconcierto frente a un mensaje crudo de PostgREST.
    status.textContent = /Could not find the table|PGRST205|schema cache/i.test(r.message ?? '')
      ? 'Falta crear la tabla: corre supabase-setup.sql en Supabase → SQL Editor'
      : `Error: ${r.message}`;
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
  $('#midi-panel').hidden = mode !== 'midi';
  // Solo en táctil el piano es la entrada; en micrófono y MIDI es solo guía.
  buildKeyboard();
}

function buildKeyboard() {
  // En modo pantalla, tocar una tecla suena y cuenta como entrada.
  const onKey = state.mode === 'tap'
    ? (midi) => { state.synth.play(midi); submit(midi); }
    : null;
  state.keyboard = renderKeyboard($('#piano'), KB_LO, KB_HI, onKey);
  updateGuidance();
}

// ── Estado del plan e historial ───────────────────────────────────────

const PHASE_LABEL = { 1: 'Fase 1 · Alfabetización', 2: 'Fase 2 · Puente técnico', 3: 'Fase 3 · Bemoles' };

/** Cabecera con la semana del plan y la fase que toca hoy. */
function renderPlan() {
  const p = planStatus();
  const box = $('#plan-status');
  if (!box) return;
  if (p.after) {
    box.innerHTML = '<strong>Plan completado</strong><span>El 29 de noviembre ya pasó.</span>';
    return;
  }
  const name = p.phase?.name ?? '—';
  const goal = p.phase?.goal ?? '';
  box.className = `plan-status${p.noPiano ? ' no-piano' : ''}`;
  box.innerHTML =
    `<strong>Semana ${p.week} de ${p.totalWeeks} · ${name}</strong>` +
    `<span>${goal}${p.daysLeft >= 0 ? ` · ${p.daysLeft} días hasta el 29 nov` : ''}</span>` +
    (p.noPiano ? '<span class="plan-warn">Estás en el tramo sin piano: usa «Toco en pantalla», 15 min/día.</span>' : '');
}

/** Historial semanal + desglose por clave. */
function renderHistoryPanel() {
  const sessions = loadSessions();
  const weeks = weeklyHistory(sessions);
  const tbody = $('#hist-body');
  if (tbody) {
    tbody.innerHTML = weeks.length
      ? weeks.slice(-8).reverse().map((w) => `
          <tr>
            <td>${w.week}</td>
            <td>${w.sessions}</td>
            <td>${w.notes}</td>
            <td>${w.accuracy != null ? Math.round(w.accuracy * 100) + '%' : '—'}</td>
            <td>${w.p90 != null ? (w.p90 / 1000).toFixed(1) + ' s' : '—'}</td>
          </tr>`).join('')
      : '<tr><td colspan="5" class="muted">Sin semanas registradas (solo cuentan las sesiones sin ayuda)</td></tr>';
  }

  const cb = clefBreakdown(sessions);
  const fmt = (b) => b.attempted
    ? `${Math.round(b.accuracy * 100)}% · ${b.p90 != null ? (b.p90 / 1000).toFixed(1) + ' s' : '—'} · ${b.attempted} notas`
    : 'sin datos';
  const el = $('#clef-split');
  if (el) {
    el.innerHTML =
      `<div><span>Clave de sol</span><strong>${fmt(cb.treble)}</strong></div>` +
      `<div><span>Clave de fa</span><strong>${fmt(cb.bass)}</strong></div>`;
    // La clave de fa es donde casi todos flaquean; se señala si va peor.
    const worse = cb.treble.accuracy != null && cb.bass.accuracy != null && cb.bass.accuracy < cb.treble.accuracy - 0.08;
    if (worse) el.innerHTML += '<p class="hint">Tu clave de fa va por detrás — normal, y merece práctica extra.</p>';
  }
}

// ── Arranque ──────────────────────────────────────────────────────────
function init() {
  // Selector agrupado por fase del plan, no una lista plana de 12.
  const sel = $('#level');
  let currentPhase = null;
  let group = null;
  LEVELS.forEach((l) => {
    if (l.phase !== currentPhase) {
      currentPhase = l.phase;
      group = document.createElement('optgroup');
      group.label = PHASE_LABEL[l.phase] ?? `Fase ${l.phase}`;
      sel.appendChild(group);
    }
    const opt = document.createElement('option');
    opt.value = l.id;
    opt.textContent = `${l.id}. ${l.name}`;
    opt.title = l.description;
    group.appendChild(opt);
  });
  sel.addEventListener('change', () => {
    state.level = Number(sel.value);
    $('#level-desc').textContent = LEVELS.find((l) => l.id === state.level)?.description ?? '';
    if (state.running) newExercise();
  });

  $('#mode-tap').addEventListener('change', () => setMode('tap'));
  $('#mode-midi').addEventListener('change', () => setMode('midi'));
  $('#mode-piano').addEventListener('change', () => setMode('piano'));
  $('#show-key').addEventListener('change', (e) => {
    state.showKey = e.target.checked;
    updateGuidance();
    updateStats(); // el indicador debe reflejar al instante si la sesión cuenta
  });
  $('#sound-on').addEventListener('change', (e) => {
    state.synth.enabled = e.target.checked;
    if (e.target.checked) state.synth.resume();
  });
  $('#anticipate').addEventListener('change', (e) => {
    state.anticipate = e.target.checked;
    draw();
  });
  $('#metro-on').addEventListener('change', (e) => {
    state.useMetronome = e.target.checked;
    if (!e.target.checked && state.metronome) { state.metronome.stop(); state.metronome = null; }
    else if (e.target.checked && state.running) {
      state.metronome = new Metronome({ bpm: state.bpm, beatsPerMeasure: state.exercise.beatsPerMeasure });
      state.metronome.start();
    }
  });
  $('#bpm').addEventListener('input', (e) => {
    state.bpm = Number(e.target.value);
    $('#bpm-label').textContent = `${state.bpm} bpm`;
    if (state.metronome) state.metronome.bpm = state.bpm;
  });
  $('#btn-start').addEventListener('click', startSession);
  $('#btn-stop').addEventListener('click', stopSession);

  wireSync();

  // Enganche de depuración: simular sesiones sin micrófono ni clics.
  window.__piano = { state, submit };

  // Rescata práctica de una sesión que quedó sin cerrar.
  const recovered = recoverDraft();

  // Arranca en el nivel recomendado según el progreso guardado, no siempre en 1:
  // quien ya domina las anclas no debería tener que bajar el selector cada vez.
  state.level = recommendedLevel(loadSessions());
  sel.value = String(state.level);
  $('#level-desc').textContent = LEVELS.find((l) => l.id === state.level)?.description ?? '';

  state.exercise = generateExercise(state.level, Date.now());
  state.states = state.exercise.events.map((_, i) => (i === 0 ? 'current' : 'pending'));
  buildKeyboard();
  draw();
  renderGate();
  renderPlan();
  renderHistoryPanel();
  updateLiveBadge({ attempted: 0 });

  if (recovered) {
    const el = $('#feedback');
    el.className = 'feedback ok';
    el.textContent = `Recuperadas ${recovered} notas`;
    setTimeout(() => { el.className = 'feedback'; el.textContent = ''; }, 2500);
  }

  registerServiceWorker();
}

/**
 * Registra el service worker y avisa cuando hay una versión nueva.
 * Antes había que cerrar y reabrir la app a mano para ver los cambios, porque
 * la estrategia es cache-first y el SW viejo seguía sirviendo.
 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        // 'installed' con un SW ya controlando = hay versión nueva esperando.
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner(reg);
        }
      });
    });
  }).catch(() => {});

  // Cuando el SW nuevo toma el control, recargar una sola vez.
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}

function showUpdateBanner(reg) {
  const bar = $('#update-bar');
  if (!bar) return;
  bar.hidden = false;
  $('#update-now').onclick = () => {
    reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
    bar.hidden = true;
  };
}

document.addEventListener('DOMContentLoaded', init);
