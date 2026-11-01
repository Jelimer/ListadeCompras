// Service Worker de producción para "Lista de Compra | PRO"
// Estrategias de resiliencia Offline Shell, Cache-First/SWR y exclusión de API

const CACHE_NAME = 'lista-compra-cache-v1';

// Recursos mínimos del Shell pre-cacheados en la instalación
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon.svg'
];

// Evento Install: Pre-cachear el App Shell y activar de inmediato con skipWaiting
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Evento Activate: Limpieza de cachés obsoletas y control de clientes con clients.claim()
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Evento Fetch: Estrategias según el tipo de solicitud
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // 1. Excluir métodos no-GET (POST, PUT, DELETE, etc.)
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // 2. Excluir esquemas que no sean http o https
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // 3. Exclusión estricta de rutas de API (nunca interceptar ni cachear /api/*)
  if (url.pathname.startsWith('/api/') || url.pathname === '/api') {
    return;
  }

  // 4. Peticiones de navegación SPA (Network-First con fallback a shell en caché)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          const fallback = await caches.match('/index.html') || await caches.match('/');
          if (fallback) {
            return fallback;
          }
          return new Response('Modo Offline: No hay conexión a red disponible.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        })
    );
    return;
  }

  // 5. Recursos estáticos y assets (Cache-First / Stale-While-Revalidate)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => null);

      // Si existe en caché, retornamos inmediatamente (SWR actualiza en segundo plano)
      if (cachedResponse) {
        return cachedResponse;
      }

      // Si no existe en caché, esperamos la respuesta de red
      return fetchPromise.then((networkResponse) => {
        if (networkResponse) {
          return networkResponse;
        }
        return new Response('Recurso no disponible en modo offline', {
          status: 504,
          statusText: 'Gateway Timeout',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      });
    })
  );
});
