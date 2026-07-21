/**
 * Banco de pruebas del detector, SIN micrófono.
 *
 * Genera señales sintéticas de frecuencia conocida y comprueba que YIN
 * devuelve la nota correcta. Incluye un timbre tipo piano (fundamental débil,
 * armónicos fuertes) porque es justo ahí donde los detectores ingenuos
 * reportan la octava equivocada.
 *
 *   node test-yin.mjs
 */

const SAMPLE_RATE = 44100;
const BUFFER = 4096;

/** Timbre de piano: armónicos con la envolvente espectral típica. */
function pianoTone(freq, n = BUFFER, sr = SAMPLE_RATE) {
  const buf = new Float32Array(n);
  // Fundamental deliberadamente débil (0.35) frente al 2º armónico (1.0):
  // este es el caso que rompe la autocorrelación simple.
  const partials = [
    { mult: 1, amp: 0.35 },
    { mult: 2, amp: 1.0 },
    { mult: 3, amp: 0.6 },
    { mult: 4, amp: 0.4 },
    { mult: 5, amp: 0.22 },
    { mult: 6, amp: 0.12 },
    { mult: 7, amp: 0.08 },
  ];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let s = 0;
    for (const p of partials) s += p.amp * Math.sin(2 * Math.PI * freq * p.mult * t);
    buf[i] = s * Math.exp(-2.0 * t) * 0.25; // decaimiento tipo cuerda pulsada
  }
  return buf;
}

function sineTone(freq, n = BUFFER, sr = SAMPLE_RATE) {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / sr);
  return buf;
}

function addNoise(buf, amount) {
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] + (Math.random() * 2 - 1) * amount;
  return out;
}

// ── import de los módulos reales que usa la app ───────────────────────
const { detectPitch } = await import('./src/audio/yin.js');
const { frequencyToNote, midiToFrequency } = await import('./src/music/theory.js');

// Las 4 anclas del plan + el rango de trabajo de las dos piezas.
const CASES = [
  { midi: 53, label: 'FA3  (ancla)' },
  { midi: 60, label: 'DO4  (ancla, do central)' },
  { midi: 67, label: 'SOL4 (ancla)' },
  { midi: 72, label: 'DO5  (ancla)' },
  { midi: 40, label: 'MI2  (grave, mano izquierda)' },
  { midi: 84, label: 'DO6  (agudo)' },
];

let pass = 0;
let fail = 0;

function check(label, buf, expectedMidi, tag) {
  const { frequency, confidence } = detectPitch(buf, { sampleRate: SAMPLE_RATE });
  if (frequency === null) {
    console.log(`  FALLA ${tag.padEnd(12)} ${label} -> sin deteccion`);
    fail++;
    return;
  }
  const note = frequencyToNote(frequency);
  const ok = note.midi === expectedMidi;
  const octaveErr = !ok && Math.abs(note.midi - expectedMidi) % 12 === 0;
  if (ok) {
    console.log(
      `  ok    ${tag.padEnd(12)} ${label} -> ${note.nameEs} ` +
        `(${frequency.toFixed(1)} Hz, ${note.cents >= 0 ? '+' : ''}${note.cents}c, conf ${confidence.toFixed(2)})`,
    );
    pass++;
  } else {
    console.log(
      `  FALLA ${tag.padEnd(12)} ${label} -> ${note.nameEs} ` +
        `${octaveErr ? '[ERROR DE OCTAVA]' : ''} (${frequency.toFixed(1)} Hz)`,
    );
    fail++;
  }
}

console.log('\n=== Tono puro (caso facil) ===');
for (const c of CASES) check(c.label, sineTone(midiToFrequency(c.midi)), c.midi, 'seno');

console.log('\n=== Timbre de piano (fundamental debil) ===');
for (const c of CASES) check(c.label, pianoTone(midiToFrequency(c.midi)), c.midi, 'piano');

console.log('\n=== Piano + ruido de sala ===');
for (const c of CASES)
  check(c.label, addNoise(pianoTone(midiToFrequency(c.midi)), 0.02), c.midi, 'piano+ruido');

console.log('\n=== Desafinacion (piano sin afinar, +30 cents) ===');
for (const c of CASES) {
  const detuned = midiToFrequency(c.midi) * Math.pow(2, 30 / 1200);
  check(c.label, pianoTone(detuned), c.midi, 'desafinado');
}

// ── Los casos DIFICILES. No son fallos del codigo: son el limite real de
//    cualquier detector monofonico. Se miden para saber donde NO confiar.
console.log('\n=== LIMITE: acordes (se espera que falle) ===');
{
  const mix = (midis) => {
    const bufs = midis.map((m) => pianoTone(midiToFrequency(m)));
    const out = new Float32Array(BUFFER);
    for (let i = 0; i < BUFFER; i++) {
      for (const b of bufs) out[i] += b[i] / bufs.length;
    }
    return out;
  };
  const chords = [
    { midis: [60, 64, 67], label: 'DO mayor (DO4-MI4-SOL4)' },
    { midis: [48, 55, 64], label: 'vals mano izq (DO3-SOL3-MI4)' },
  ];
  for (const c of chords) {
    const { frequency, confidence } = detectPitch(mix(c.midis), { sampleRate: SAMPLE_RATE });
    const got = frequency ? frequencyToNote(frequency).nameEs : 'nada';
    const expected = c.midis.map((m) => frequencyToNote(midiToFrequency(m)).nameEs).join('+');
    console.log(`  info  acorde       ${c.label}`);
    console.log(`        tocado: ${expected}  ->  detectado: ${got} (conf ${confidence.toFixed(2)})`);
  }
  console.log('        => monofonico: solo puede reportar UNA nota. Limitacion conocida.');
}

console.log('\n=== LIMITE: pedal de resonancia (nota anterior sonando) ===');
{
  // DO4 sostenida por el pedal mientras entra MI4 nueva.
  const held = pianoTone(midiToFrequency(60));
  const fresh = pianoTone(midiToFrequency(64));
  const out = new Float32Array(BUFFER);
  // La sostenida ya decayo un poco; la nueva entra a volumen pleno.
  for (let i = 0; i < BUFFER; i++) out[i] = held[i] * 0.45 + fresh[i];
  const { frequency, confidence } = detectPitch(out, { sampleRate: SAMPLE_RATE });
  const got = frequency ? frequencyToNote(frequency).nameEs : 'nada';
  console.log(`  info  pedal        DO4 sostenida + MI4 nueva -> detectado: ${got} (conf ${confidence.toFixed(2)})`);
  console.log(`        => esperado MI4. Si sale DO4, el seguimiento se atasca con pedal.`);
}

console.log('\n=== Silencio (no debe detectar nada) ===');
{
  const silence = addNoise(new Float32Array(BUFFER), 0.001);
  const { frequency } = detectPitch(silence, { sampleRate: SAMPLE_RATE });
  if (frequency === null) {
    console.log('  ok    silencio      -> sin deteccion (correcto)');
    pass++;
  } else {
    console.log(`  FALLA silencio      -> detecto ${frequency.toFixed(1)} Hz`);
    fail++;
  }
}

console.log(`\n${pass} ok, ${fail} fallan\n`);
process.exit(fail > 0 ? 1 : 0);
