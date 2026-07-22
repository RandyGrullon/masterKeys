/**
 * Service worker: la app debe abrir sin red, en el atril del piano.
 * Estrategia cache-first sobre una lista explícita — son pocos archivos y
 * ninguno cambia sin que se suba la versión.
 */
// Subir esta version en CADA cambio de los archivos cacheados: la estrategia
// es cache-first y si no, el navegador sigue sirviendo la version vieja.
const CACHE = 'piano-trainer-v5';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './src/app.js',
  './src/store.js',
  './src/audio/yin.js',
  './src/audio/listener.js',
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
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit ?? fetch(e.request).catch(() => caches.match('./index.html'))),
  );
});
