/**
 * Service worker: la app debe abrir sin red, en el atril del piano.
 * Estrategia cache-first sobre una lista explícita — son pocos archivos y
 * ninguno cambia sin que se suba la versión.
 */
// Subir esta version en CADA cambio de los archivos cacheados: la estrategia
// es cache-first y si no, el navegador sigue sirviendo la version vieja.
const CACHE = 'piano-trainer-v10';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './src/app.js',
  './src/store.js',
  './src/progress.js',
  './src/audio/yin.js',
  './src/audio/listener.js',
  './src/audio/midi.js',
  './src/audio/synth.js',
  './src/audio/metronome.js',
  './src/plan.js',
  './src/music/rhythm.js',
  './src/music/theory.js',
  './src/music/staff.js',
  './src/music/generator.js',
  './src/music/keyboard.js',
  './src/cloud/config.js',
  './src/cloud/supabase.js',
  './src/cloud/sync.js',
  './icons/icon.svg',
];

self.addEventListener('install', (e) => {
  // NO se llama skipWaiting aquí: el SW nuevo espera a que la app avise. Así la
  // app puede mostrar "hay versión nueva" en vez de cambiar el código bajo los
  // pies del usuario a media sesión de práctica.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

// La app pide activar la versión nueva cuando el usuario acepta.
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** En desarrollo (localhost) la caché estorba: sirve código viejo tras cada edición. */
const IS_DEV = ['localhost', '127.0.0.1'].includes(self.location.hostname);

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  if (IS_DEV) {
    // Network-first en local: la red manda y la caché es solo respaldo offline.
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(e.request).then((hit) => hit ?? caches.match('./index.html'))),
    );
    return;
  }

  // En producción, cache-first: la app abre al instante y funciona sin red.
  e.respondWith(
    caches.match(e.request).then((hit) => hit ?? fetch(e.request).catch(() => caches.match('./index.html'))),
  );
});
