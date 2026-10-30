/* Service worker generado por scripts/generate-sw.mjs. No editar out/sw.js a mano. */
const VERSION = __VERSION__;
const CACHE = `sightread-${VERSION}`;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Solo mismo origen y GET: Spotify y otros servicios van siempre a la red.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Red primero para recibir versiones nuevas; sin conexión, la copia en caché.
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE);
        const path = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
        return (await cache.match(path)) ?? (await cache.match('/')) ?? Response.error();
      }),
    );
    return;
  }

  // Recursos estáticos (con hash en el nombre): caché primero.
  event.respondWith(
    caches.match(request, { ignoreSearch: url.pathname.startsWith('/_next/static/') }).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok && url.pathname.startsWith('/_next/static/')) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
