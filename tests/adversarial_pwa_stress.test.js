/**
 * tests/adversarial_pwa_stress.test.js
 * Arnés de Pruebas Adversariales y de Estrés Empírico — Challenger 1 (Milestone 1)
 *
 * Somete a prueba adversarial estricta e independiente las características F01 a F06:
 * 1. Conmutación rápida entre estados online y offline (eventos repetidos, transiciones espurias, burst switching).
 * 2. Resiliencia de sw.js ante query strings variantes en URLs locales (?v=2.4.0, ?v=2.5.0, ?foo=bar, navigation fallback).
 * 3. Comportamiento de sw.js ante peticiones POST/PUT, protocolos no HTTP, Firebase/Firestore y URLs externas no cacheadas.
 * 4. Integridad de metadatos PWA (manifest.json, iconos binarios PNG e index.html).
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const { createTestEnvironment } = require('./mock_dom.js');

let total = 0;
let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err });
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.stack || err.message}`);
  }
}

function describe(suiteTitle) {
  console.log(`\n==================================================`);
  console.log(`CHALLENGER 1 SUITE: ${suiteTitle}`);
  console.log(`==================================================`);
}

/**
 * Simulador de Entorno de Service Worker de Alta Fidelidad
 */
function createServiceWorkerHarness(swCode, options = {}) {
  const origin = options.origin || 'https://lista-compra-pro.vercel.app';

  class MockResponse {
    constructor(body = '', init = {}) {
      this.body = body;
      this.status = init.status !== undefined ? init.status : 200;
      this.statusText = init.statusText || 'OK';
      this.type = init.type || 'basic';
      this.headers = new Map(Object.entries(init.headers || {}));
      this.ok = this.status >= 200 && this.status < 300;
    }
    clone() {
      return new MockResponse(this.body, {
        status: this.status,
        statusText: this.statusText,
        type: this.type,
        headers: Object.fromEntries(this.headers.entries())
      });
    }
    static error() {
      return new MockResponse('', { status: 0, statusText: 'Network Error', type: 'error' });
    }
  }

  class MockCache {
    constructor(name) {
      this.name = name;
      this.entries = new Map(); // key: full URL string -> MockResponse
    }

    _normalizeUrl(input) {
      if (typeof input === 'string') {
        if (input.startsWith('/')) {
          return new URL(input, origin).href;
        }
        return new URL(input).href;
      }
      return new URL(input.url, origin).href;
    }

    async add(url) {
      const fullUrl = this._normalizeUrl(url);
      const urlObj = new URL(fullUrl);
      this.entries.set(fullUrl, new MockResponse(`Precached content for ${urlObj.pathname}`));
    }

    async put(request, response) {
      const fullUrl = this._normalizeUrl(request);
      this.entries.set(fullUrl, response.clone ? response.clone() : response);
    }

    async match(request, matchOptions = {}) {
      const fullUrl = this._normalizeUrl(request);
      const reqUrlObj = new URL(fullUrl);

      if (matchOptions && matchOptions.ignoreSearch) {
        for (const [storedUrl, resp] of this.entries.entries()) {
          const storedObj = new URL(storedUrl);
          if (storedObj.origin === reqUrlObj.origin && storedObj.pathname === reqUrlObj.pathname) {
            return resp.clone();
          }
        }
        return undefined;
      }

      const match = this.entries.get(fullUrl);
      return match ? match.clone() : undefined;
    }

    async delete(request) {
      const fullUrl = this._normalizeUrl(request);
      return this.entries.delete(fullUrl);
    }

    async keys() {
      return Array.from(this.entries.keys()).map(url => ({ url }));
    }
  }

  const cacheStore = new Map();
  const caches = {
    async open(name) {
      if (!cacheStore.has(name)) {
        cacheStore.set(name, new MockCache(name));
      }
      return cacheStore.get(name);
    },
    async match(request, matchOptions) {
      for (const cache of cacheStore.values()) {
        const found = await cache.match(request, matchOptions);
        if (found) return found;
      }
      return undefined;
    },
    async has(name) {
      return cacheStore.has(name);
    },
    async delete(name) {
      return cacheStore.delete(name);
    },
    async keys() {
      return Array.from(cacheStore.keys());
    }
  };

  const listeners = {
    install: [],
    activate: [],
    fetch: []
  };

  let skipWaitingCalled = false;
  let clientsClaimCalled = false;

  const mockSelf = {
    location: {
      origin: origin,
      href: `${origin}/sw.js`
    },
    addEventListener(type, fn) {
      if (listeners[type]) listeners[type].push(fn);
    },
    skipWaiting() {
      skipWaitingCalled = true;
    },
    clients: {
      async claim() {
        clientsClaimCalled = true;
      }
    }
  };

  let mockNetworkOnline = true;
  const mockFetch = async (request) => {
    if (!mockNetworkOnline) {
      throw new Error('Failed to fetch: Network is offline');
    }
    const fullUrl = typeof request === 'string' ? request : request.url;
    const urlObj = new URL(fullUrl, origin);

    // Si es CDN conocido, devolver respuesta simulada
    if (urlObj.hostname.includes('unpkg.com') || urlObj.hostname.includes('cdnjs') || urlObj.hostname.includes('googleapis')) {
      return new MockResponse(`/* CDN response for ${urlObj.pathname} */`, { status: 200 });
    }

    return new MockResponse(`Network response for ${urlObj.pathname}`, { status: 200 });
  };

  // Evaluar sw.js dentro del contexto simulado
  const fn = new Function('self', 'caches', 'fetch', 'Response', 'URL', swCode);
  fn(mockSelf, caches, mockFetch, MockResponse, URL);

  return {
    caches,
    cacheStore,
    listeners,
    setNetworkOnline(isOnline) {
      mockNetworkOnline = isOnline;
    },
    get skipWaitingCalled() {
      return skipWaitingCalled;
    },
    get clientsClaimCalled() {
      return clientsClaimCalled;
    },

    async triggerInstall() {
      let waitUntilPromise = null;
      const event = {
        waitUntil(p) {
          waitUntilPromise = p;
        }
      };
      for (const handler of listeners.install) {
        handler(event);
      }
      if (waitUntilPromise) await waitUntilPromise;
    },

    async triggerActivate() {
      let waitUntilPromise = null;
      const event = {
        waitUntil(p) {
          waitUntilPromise = p;
        }
      };
      for (const handler of listeners.activate) {
        handler(event);
      }
      if (waitUntilPromise) await waitUntilPromise;
    },

    async dispatchFetch(requestUrl, reqOptions = {}) {
      const fullUrl = requestUrl.startsWith('/') ? `${origin}${requestUrl}` : requestUrl;
      const request = {
        url: fullUrl,
        method: reqOptions.method || 'GET',
        mode: reqOptions.mode || 'cors',
        headers: reqOptions.headers || {}
      };

      let respondWithCalled = false;
      let respondWithPromise = null;

      const event = {
        request,
        respondWith(p) {
          respondWithCalled = true;
          respondWithPromise = p;
        }
      };

      for (const handler of listeners.fetch) {
        handler(event);
      }

      let response = null;
      if (respondWithCalled && respondWithPromise) {
        try {
          response = await respondWithPromise;
        } catch (err) {
          response = { error: err };
        }
      }

      return {
        respondWithCalled,
        response
      };
    }
  };
}

async function runAdversarialPwaStressTests() {
  console.log('\n================================================================');
  console.log('CHALLENGER 1: SUITE DE ESTRÉS ADVERSARIAL PWA & RESILIENCIA OFFLINE');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // SUITE 1: Conmutación Rápida Online/Offline y Estrés de Eventos en DOM
  // ---------------------------------------------------------------------------
  describe('Suite 1: Conmutación Rápida Online/Offline y Estrés de Eventos en DOM');

  await test('1.1: Conmutación en ráfaga (Burst Switching: 100 alternancias ultra-rápidas preservan consistencia)', () => {
    const env = createTestEnvironment();
    global.window = env.window;
    global.document = env.document;
    global.navigator = env.navigator;

    const scriptPath = path.resolve(__dirname, '../script.js');
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');
    eval(scriptContent);

    env.document.dispatchEvent(new env.DOMEvent('DOMContentLoaded'));
    const badge = env.document.getElementById('networkStatusBadge');
    assert.ok(badge, '#networkStatusBadge debe existir');

    // Disparar 100 transiciones alternadas
    for (let i = 0; i < 100; i++) {
      const isOnline = i % 2 === 1;
      env.window.dispatchEvent(new env.DOMEvent(isOnline ? 'online' : 'offline'));
    }

    // El último evento fue i=99 => isOnline = true ('online')
    assert.ok(badge.classList.contains('online'), 'Debe terminar en clase online');
    assert.strictEqual(badge.classList.contains('offline'), false, 'No debe retener clase offline');
    assert.strictEqual(badge.querySelector('.badge-text').textContent, 'Online');

    // Despachar un offline adicional
    env.window.dispatchEvent(new env.DOMEvent('offline'));
    assert.ok(badge.classList.contains('offline'), 'Debe conmutar inmediatamente a offline');
    assert.strictEqual(badge.classList.contains('online'), false, 'No debe retener clase online');
    assert.strictEqual(badge.querySelector('.badge-text').textContent, 'Offline');
    assert.ok(badge.getAttribute('aria-label').includes('offline'), 'aria-label debe reflejar modo offline');
  });

  await test('1.2: Idempotencia ante ráfagas espurias repetidas (50 eventos offline consecutivos)', () => {
    const env = createTestEnvironment();
    global.window = env.window;
    global.document = env.document;
    global.navigator = env.navigator;

    const scriptPath = path.resolve(__dirname, '../script.js');
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');
    eval(scriptContent);

    env.document.dispatchEvent(new env.DOMEvent('DOMContentLoaded'));
    const badge = env.document.getElementById('networkStatusBadge');

    for (let i = 0; i < 50; i++) {
      env.window.dispatchEvent(new env.DOMEvent('offline'));
    }

    assert.ok(badge.classList.contains('offline'));
    assert.strictEqual(badge.classList.contains('online'), false);
    assert.strictEqual(badge.querySelector('.badge-text').textContent, 'Offline');

    for (let i = 0; i < 50; i++) {
      env.window.dispatchEvent(new env.DOMEvent('online'));
    }

    assert.ok(badge.classList.contains('online'));
    assert.strictEqual(badge.classList.contains('offline'), false);
    assert.strictEqual(badge.querySelector('.badge-text').textContent, 'Online');
  });

  await test('1.3: Tolerancia defensiva ante manipulación o ausencia de elementos hijos en el badge', () => {
    const env = createTestEnvironment();
    global.window = env.window;
    global.document = env.document;
    global.navigator = env.navigator;

    const scriptPath = path.resolve(__dirname, '../script.js');
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');
    eval(scriptContent);
    env.document.dispatchEvent(new env.DOMEvent('DOMContentLoaded'));

    const badge = env.document.getElementById('networkStatusBadge');
    const textEl = badge.querySelector('.badge-text');
    // Eliminar intencionalmente el hijo de texto para probar robustez
    badge.removeChild(textEl);

    // No debe lanzar TypeError al despachar eventos
    assert.doesNotThrow(() => {
      env.window.dispatchEvent(new env.DOMEvent('offline'));
      env.window.dispatchEvent(new env.DOMEvent('online'));
    }, 'Manipulación sin .badge-text debe ser tolerada sin excepciones');
  });

  await test('1.4: Inicialización respetando navigator.onLine en false (arranque en modo avión)', () => {
    const env = createTestEnvironment();
    env.navigator.onLine = false; // Simular dispositivo offline desde el inicio
    global.window = env.window;
    global.document = env.document;
    global.navigator = env.navigator;

    const scriptPath = path.resolve(__dirname, '../script.js');
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');
    eval(scriptContent);

    env.document.dispatchEvent(new env.DOMEvent('DOMContentLoaded'));
    const badge = env.document.getElementById('networkStatusBadge');

    assert.ok(badge.classList.contains('offline'), 'Debe arrancar directamente con clase offline si navigator.onLine es false');
    assert.strictEqual(badge.classList.contains('online'), false);
    assert.strictEqual(badge.querySelector('.badge-text').textContent, 'Offline');
  });

  await test('1.5: Re-ejecuciones múltiples de initNetworkConnectivity no generan inconsistencias', () => {
    const env = createTestEnvironment();
    global.window = env.window;
    global.document = env.document;
    global.navigator = env.navigator;

    const scriptPath = path.resolve(__dirname, '../script.js');
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');
    eval(scriptContent);

    // Invocar 5 veces seguidas
    window.initNetworkConnectivity();
    window.initNetworkConnectivity();
    window.initNetworkConnectivity();
    window.initNetworkConnectivity();
    window.initNetworkConnectivity();

    const badge = env.document.getElementById('networkStatusBadge');
    env.window.dispatchEvent(new env.DOMEvent('offline'));
    assert.ok(badge.classList.contains('offline'));
    assert.strictEqual(badge.querySelector('.badge-text').textContent, 'Offline');

    env.window.dispatchEvent(new env.DOMEvent('online'));
    assert.ok(badge.classList.contains('online'));
    assert.strictEqual(badge.querySelector('.badge-text').textContent, 'Online');
  });

  // ---------------------------------------------------------------------------
  // SUITE 2: Resiliencia de sw.js ante Query Strings Variantes en URLs Locales
  // ---------------------------------------------------------------------------
  describe('Suite 2: Resiliencia de sw.js ante Query Strings Variantes en URLs Locales');

  const swPath = path.resolve(__dirname, '../sw.js');
  const swCode = fs.readFileSync(swPath, 'utf8');

  await test('2.1: Ciclo de vida sw.js: install puebla precache core y activate purga versiones obsoletas', async () => {
    const harness = createServiceWorkerHarness(swCode);

    // Precargar una versión vieja en cacheStore para verificar purga
    await harness.caches.open('lista-compra-pro-v1.0.0-obsolete');
    const initialKeys = await harness.caches.keys();
    assert.ok(initialKeys.includes('lista-compra-pro-v1.0.0-obsolete'));

    // Ejecutar install
    await harness.triggerInstall();
    assert.strictEqual(harness.skipWaitingCalled, true, 'sw.js debe llamar a self.skipWaiting()');

    const cacheV25 = await harness.caches.open('lista-compra-pro-v2.5.0-cache');
    const cachedEntries = await cacheV25.keys();
    assert.ok(cachedEntries.length >= 15, `Debe precachear al menos 15 activos core (encontrados: ${cachedEntries.length})`);

    // Ejecutar activate
    await harness.triggerActivate();
    assert.strictEqual(harness.clientsClaimCalled, true, 'sw.js debe llamar a clients.claim()');

    const activeCaches = await harness.caches.keys();
    assert.ok(activeCaches.includes('lista-compra-pro-v2.5.0-cache'), 'Debe conservar la caché actual');
    assert.strictEqual(activeCaches.includes('lista-compra-pro-v1.0.0-obsolete'), false, 'Debe purgar cachés anteriores');
  });

  await test('2.2: Resiliencia ante query strings sincronizados del proyecto (?v=2.4.0) en modo offline', async () => {
    const harness = createServiceWorkerHarness(swCode);
    await harness.triggerInstall();
    await harness.triggerActivate();
    harness.setNetworkOnline(false); // Simular modo offline total

    // Petición a /style.css?v=2.4.0
    const resStyle = await harness.dispatchFetch('/style.css?v=2.4.0');
    assert.strictEqual(resStyle.respondWithCalled, true, 'Debe interceptar con respondWith');
    assert.ok(resStyle.response, 'Debe resolver respuesta');
    assert.strictEqual(resStyle.response.status, 200, 'Debe resolver status 200 desde caché ignorando search');

    // Petición a /script.js?v=2.4.0
    const resScript = await harness.dispatchFetch('/script.js?v=2.4.0');
    assert.strictEqual(resScript.respondWithCalled, true);
    assert.strictEqual(resScript.response.status, 200);

    // Petición a /js/map-route.js?v=2.4.0
    const resMap = await harness.dispatchFetch('/js/map-route.js?v=2.4.0');
    assert.strictEqual(resMap.respondWithCalled, true);
    assert.strictEqual(resMap.response.status, 200);
  });

  await test('2.3: Resiliencia ante query strings variantes o dinámicos (?v=2.5.0, ?foo=bar, ?utm_source=pwa)', async () => {
    const harness = createServiceWorkerHarness(swCode);
    await harness.triggerInstall();
    await harness.triggerActivate();
    harness.setNetworkOnline(false);

    const testQueries = [
      '/style.css?v=2.5.0',
      '/style.css?foo=bar&baz=123',
      '/script.js?timestamp=1728445000',
      '/manifest.json?v=2.4.0',
      '/?utm_source=homescreen&utm_medium=pwa',
      '/index.html?mode=standalone&theme=dark'
    ];

    for (const q of testQueries) {
      const res = await harness.dispatchFetch(q);
      assert.strictEqual(res.respondWithCalled, true, `Debe interceptar ${q}`);
      assert.ok(res.response, `Debe responder para ${q}`);
      assert.strictEqual(res.response.status, 200, `Debe resolver con status 200 para ${q}`);
    }
  });

  await test('2.4: Fallback SPA offline para peticiones de navegación a rutas no cacheadas', async () => {
    const harness = createServiceWorkerHarness(swCode);
    await harness.triggerInstall();
    await harness.triggerActivate();
    harness.setNetworkOnline(false); // Offline

    // Petición de navegación desconocida
    const navResult = await harness.dispatchFetch('/ruta-desconocida-offline', {
      mode: 'navigate'
    });

    assert.strictEqual(navResult.respondWithCalled, true);
    assert.ok(navResult.response, 'Debe devolver respuesta de fallback');
    assert.strictEqual(navResult.response.status, 200, 'El fallback de navegación offline debe responder status 200');
  });

  await test('2.5: Petición a recurso local inexistente (no navegación) en offline retorna Response.error()', async () => {
    const harness = createServiceWorkerHarness(swCode);
    await harness.triggerInstall();
    await harness.triggerActivate();
    harness.setNetworkOnline(false);

    const missingResult = await harness.dispatchFetch('/imagen-inexistente.png', {
      mode: 'no-cors'
    });

    assert.strictEqual(missingResult.respondWithCalled, true);
    assert.ok(missingResult.response);
    assert.strictEqual(missingResult.response.status, 0, 'Debe devolver status 0 (Response.error) ante recurso no navegable faltante');
  });

  // ---------------------------------------------------------------------------
  // SUITE 3: Manejo de Métodos no GET, Protocolos y URLs Externas / Firebase
  // ---------------------------------------------------------------------------
  describe('Suite 3: Manejo de Métodos no GET, Protocolos y URLs Externas / Firebase');

  await test('3.1: sw.js NO intercepta métodos que no sean GET (POST, PUT, DELETE, PATCH)', async () => {
    const harness = createServiceWorkerHarness(swCode);
    await harness.triggerInstall();
    await harness.triggerActivate();

    const nonGetMethods = ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'];
    for (const method of nonGetMethods) {
      const res = await harness.dispatchFetch('/api/datos', { method });
      assert.strictEqual(res.respondWithCalled, false, `sw.js NO debe invocar respondWith para método ${method}`);
    }
  });

  await test('3.2: sw.js NO intercepta esquemas no HTTP/HTTPS (chrome-extension, file, data)', async () => {
    const harness = createServiceWorkerHarness(swCode);
    await harness.triggerInstall();
    await harness.triggerActivate();

    const nonHttpUrls = [
      'chrome-extension://abcdefghijklmnop/content.js',
      'file:///C:/Users/jelim/ProyectosVercel/archivo.txt',
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='
    ];

    for (const url of nonHttpUrls) {
      const res = await harness.dispatchFetch(url);
      assert.strictEqual(res.respondWithCalled, false, `sw.js NO debe invocar respondWith para esquema de ${url}`);
    }
  });

  await test('3.3: sw.js NO intercepta llamadas a Firebase ni Firestore (Network-Only transparente)', async () => {
    const harness = createServiceWorkerHarness(swCode);
    await harness.triggerInstall();
    await harness.triggerActivate();

    const firebaseUrls = [
      'https://firestore.googleapis.com/v1/projects/lista-compra-pro/databases/(default)/documents/shopping-trips',
      'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword',
      'https://lista-compra-pro.firebaseio.com/.json'
    ];

    for (const url of firebaseUrls) {
      const res = await harness.dispatchFetch(url);
      assert.strictEqual(res.respondWithCalled, false, `sw.js NO debe invocar respondWith para URL de Firebase: ${url}`);
    }
  });

  await test('3.4: sw.js aplica Cache-First para CDNs reconocidos y guarda en caché al resolver', async () => {
    const harness = createServiceWorkerHarness(swCode);
    await harness.triggerInstall();
    await harness.triggerActivate();

    const cdnUrl = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

    // Primera petición: online, debe descargar de red y almacenar en caché
    harness.setNetworkOnline(true);
    const resOnline = await harness.dispatchFetch(cdnUrl);
    assert.strictEqual(resOnline.respondWithCalled, true, 'Debe interceptar URL de CDN');
    assert.strictEqual(resOnline.response.status, 200);

    // Comprobar que quedó almacenada en cache
    const cache = await harness.caches.open('lista-compra-pro-v2.5.0-cache');
    const matched = await cache.match(cdnUrl);
    assert.ok(matched, 'El recurso de CDN debe guardarse en la caché');

    // Segunda petición: offline, debe servir desde caché instantáneamente
    harness.setNetworkOnline(false);
    const resOffline = await harness.dispatchFetch(cdnUrl);
    assert.strictEqual(resOffline.respondWithCalled, true);
    assert.strictEqual(resOffline.response.status, 200, 'Debe servir status 200 offline desde caché');
  });

  await test('3.5: sw.js NO intercepta dominios externos que no pertenecen a CDN_DOMAINS', async () => {
    const harness = createServiceWorkerHarness(swCode);
    await harness.triggerInstall();
    await harness.triggerActivate();

    const externalUrls = [
      'https://api.github.com/repos/jelim/lista-compra',
      'https://router.project-osrm.org/route/v1/driving/-3.70,40.40;-3.68,40.42',
      'https://nominatim.openstreetmap.org/search?q=Mercadona&format=json'
    ];

    for (const url of externalUrls) {
      const res = await harness.dispatchFetch(url);
      assert.strictEqual(res.respondWithCalled, false, `sw.js NO debe interceptar dominio externo genérico: ${url}`);
    }
  });

  // ---------------------------------------------------------------------------
  // SUITE 4: Integridad de Metadatos PWA y Compatibilidad de Despliegue
  // ---------------------------------------------------------------------------
  describe('Suite 4: Integridad de Metadatos PWA y Compatibilidad de Despliegue');

  await test('4.1: manifest.json cumple especificación W3C y coherencia con index.html', () => {
    const manifestPath = path.resolve(__dirname, '../manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'manifest.json debe existir');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.strictEqual(manifest.name, 'Lista de Compra | PRO');
    assert.strictEqual(manifest.short_name, 'Lista PRO');
    assert.strictEqual(manifest.theme_color, '#4f46e5');
    assert.strictEqual(manifest.background_color, '#0f172a');
    assert.strictEqual(manifest.display, 'standalone');
    assert.strictEqual(manifest.scope, '/');
    assert.strictEqual(manifest.start_url, '/');

    const indexPath = path.resolve(__dirname, '../index.html');
    const indexHtml = fs.readFileSync(indexPath, 'utf8');
    assert.ok(indexHtml.includes('content="#4f46e5"'), 'theme-color de index.html debe coincidir con manifest.json');
  });

  await test('4.2: Iconos PWA poseen cabeceras binarias y formatos válidos', () => {
    const iconsDir = path.resolve(__dirname, '../icons');
    const svgPath = path.join(iconsDir, 'icon.svg');
    const p192Path = path.join(iconsDir, 'icon-192.png');
    const p512Path = path.join(iconsDir, 'icon-512.png');

    assert.ok(fs.existsSync(svgPath) && fs.statSync(svgPath).size > 100);
    assert.ok(fs.existsSync(p192Path) && fs.statSync(p192Path).size > 100);
    assert.ok(fs.existsSync(p512Path) && fs.statSync(p512Path).size > 100);

    const p192Buf = fs.readFileSync(p192Path);
    const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let i = 0; i < 8; i++) {
      assert.strictEqual(p192Buf[i], pngMagic[i]);
    }
  });

  await test('4.3: registerServiceWorker() en script.js es seguro y no arroja excepciones en Node.js', () => {
    const env = createTestEnvironment();
    global.window = env.window;
    global.document = env.document;
    global.navigator = env.navigator; // sin navigator.serviceWorker

    const scriptPath = path.resolve(__dirname, '../script.js');
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');

    assert.doesNotThrow(() => {
      eval(scriptContent);
      window.registerServiceWorker();
    }, 'registerServiceWorker debe ser seguro en entornos sin soporte nativo de SW');
  });

  console.log('\n================================================================');
  console.log(`RESUMEN CHALLENGER 1: Total: ${total} | Aprobadas: ${passed} | Falladas: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    console.error('ERRORES ENCONTRADOS:', failures);
    process.exit(1);
  }
}

if (require.main === module) {
  runAdversarialPwaStressTests().catch(err => {
    console.error('Fallo no controlado en suite adversarial:', err);
    process.exit(1);
  });
}

module.exports = { runAdversarialPwaStressTests, createServiceWorkerHarness };
