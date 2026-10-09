/**
 * sw.js - Service Worker para Lista de Compra | PRO
 * Estrategia de Caché y Resiliencia Offline (PWA):
 * 1. Stale-While-Revalidate (SWR) con { ignoreSearch: true } para peticiones GET locales del mismo origen.
 * 2. Cache-First con runtime caching para CDNs externos y fuentes web.
 * 3. Network-Only / Bypass para peticiones no GET, Firestore, Firebase y esquemas no HTTP(S).
 */

const CACHE_NAME = 'lista-compra-pro-v2.5.0-cache';

// Activos Core esenciales pre-cacheados en la instalación
const CORE_PRECACHE_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/js/state.js',
  '/js/storage.js',
  '/js/analytics.js',
  '/js/feedback.js',
  '/js/ui-feedback.js',
  '/js/map-route.js',
  '/js/validation.js',
  '/js/avatars.js',
  '/js/chart.js',
  '/js/export-import.js',
  '/js/resource-loader.js',
  '/js/share.js',
  '/firebase-config.js'
];

// Dominios de CDNs externos elegibles para Cache-First
const CDN_DOMAINS = [
  'unpkg.com',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net'
];

// 1. Evento Install: Pre-caché de activos core y skipWaiting
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        CORE_PRECACHE_URLS.map(async (url) => {
          try {
            await cache.add(url);
          } catch (err) {
            // Silencioso ante recursos opcionales o variantes de entorno
          }
        })
      );
    })
  );
});

// 2. Evento Activate: Eliminación de cachés antiguas y clients.claim()
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      if (self.clients && typeof self.clients.claim === 'function') {
        return self.clients.claim();
      }
    })
  );
});

// 3. Evento Fetch: Estrategia de enrutamiento y caché diferenciada
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // A. No interceptar peticiones que no sean GET
  if (request.method !== 'GET') {
    return;
  }

  // B. No interceptar esquemas no HTTP/HTTPS (extensiones, file://, data:)
  const url = new URL(request.url);
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // C. No interceptar peticiones a Firebase / Firestore
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('googleapis.com/v1/projects') ||
    url.hostname.includes('identitytoolkit')
  ) {
    return;
  }

  // D. Recursos CDN externos: Cache-First con Runtime Cache
  const isCdn = CDN_DOMAINS.some((domain) => url.hostname.includes(domain));
  if (isCdn) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }

        try {
          const networkResponse = await fetch(request);
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch (fetchErr) {
          return cachedResponse || Response.error();
        }
      })
    );
    return;
  }

  // E. Recursos locales del mismo origen: Stale-While-Revalidate (SWR) con { ignoreSearch: true }
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request, { ignoreSearch: true });

        // Actualización asíncrona en segundo plano desde la red
        const revalidatePromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => {
            if (request.mode === 'navigate') {
              return cache.match('/index.html', { ignoreSearch: true }) ||
                     cache.match('/', { ignoreSearch: true });
            }
            return null;
          });

        // Si ya está en caché, resolver instantáneamente
        if (cachedResponse) {
          return cachedResponse;
        }

        // Si no está en caché, esperar la respuesta de red
        const networkResult = await revalidatePromise;
        if (networkResult) {
          return networkResult;
        }

        // Fallback offline para navegación de página
        if (request.mode === 'navigate') {
          const fallback = await cache.match('/index.html', { ignoreSearch: true }) ||
                           await cache.match('/', { ignoreSearch: true });
          if (fallback) return fallback;
        }

        return Response.error();
      })
    );
  }
});
