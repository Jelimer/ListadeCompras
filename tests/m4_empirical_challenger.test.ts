import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import { createApp } from '../server';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper para emular el entorno de Service Worker de forma pura y fidedigna
function createNavigateRequest(url: string): Request {
  const req = new Request(url, { method: 'GET' });
  Object.defineProperty(req, 'mode', { value: 'navigate', configurable: true });
  return req;
}

function normalizeKey(req: Request | string): string {
  const urlStr = typeof req === 'string' ? req : req.url;
  try {
    return new URL(urlStr, 'https://listadecompra.pro').href;
  } catch {
    return urlStr;
  }
}

interface MockCache {
  entries: Map<string, Response>;
  addAll(urls: string[]): Promise<void>;
  put(req: Request | string, res: Response): Promise<void>;
  match(req: Request | string): Promise<Response | undefined>;
}

function createMockCache(): MockCache {
  const entries = new Map<string, Response>();
  return {
    entries,
    async addAll(urls: string[]) {
      for (const url of urls) {
        const fullKey = normalizeKey(url);
        entries.set(fullKey, new Response(`Contenido pre-cacheado de ${url}`, {
          status: 200,
          headers: { 'Content-Type': url.endsWith('.html') || url === '/' ? 'text/html' : 'application/octet-stream' }
        }));
      }
    },
    async put(req: Request | string, res: Response) {
      const key = normalizeKey(req);
      entries.set(key, res.clone());
    },
    async match(req: Request | string) {
      const key = normalizeKey(req);
      if (entries.has(key)) return entries.get(key)!.clone();
      return undefined;
    }
  };
}

interface SWEnvironment {
  listeners: Record<string, ((event: any) => void)[]>;
  cachesStorage: Map<string, MockCache>;
  skipWaitingCalled: boolean;
  clientsClaimCalled: boolean;
  dispatchFetch(req: Request): Promise<{ handled: boolean; responsePromise?: Promise<Response> }>;
  dispatchInstall(): Promise<void>;
  dispatchActivate(): Promise<void>;
}

function setupSWEnvironment(networkFetchImpl?: (req: Request) => Promise<Response>): SWEnvironment {
  const listeners: Record<string, ((event: any) => void)[]> = {};
  const cachesStorage = new Map<string, MockCache>();
  cachesStorage.set('lista-compra-cache-v1', createMockCache());

  let skipWaitingCalled = false;
  let clientsClaimCalled = false;

  const cachesMock = {
    async open(name: string) {
      if (!cachesStorage.has(name)) {
        cachesStorage.set(name, createMockCache());
      }
      return cachesStorage.get(name)!;
    },
    async keys() {
      return Array.from(cachesStorage.keys());
    },
    async delete(name: string) {
      return cachesStorage.delete(name);
    },
    async match(req: Request | string) {
      for (const cache of cachesStorage.values()) {
        const found = await cache.match(req);
        if (found) return found;
      }
      return undefined;
    }
  };

  const sandbox: any = {
    console,
    URL,
    Response,
    Request,
    Headers,
    caches: cachesMock,
    fetch: networkFetchImpl || (async () => new Response('Network OK', { status: 200 })),
    addEventListener: (type: string, fn: (event: any) => void) => {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    skipWaiting: async () => {
      skipWaitingCalled = true;
    },
    clients: {
      claim: async () => {
        clientsClaimCalled = true;
      }
    }
  };
  sandbox.self = sandbox;

  const swPath = path.resolve(__dirname, '../public/sw.js');
  const swCode = fs.readFileSync(swPath, 'utf-8');

  vm.createContext(sandbox);
  vm.runInContext(swCode, sandbox);

  return {
    listeners,
    cachesStorage,
    get skipWaitingCalled() { return skipWaitingCalled; },
    get clientsClaimCalled() { return clientsClaimCalled; },
    async dispatchInstall() {
      let waitPromise: Promise<any> = Promise.resolve();
      const event = {
        waitUntil(p: Promise<any>) {
          waitPromise = p;
        }
      };
      for (const listener of listeners['install'] || []) {
        listener(event);
      }
      await waitPromise;
    },
    async dispatchActivate() {
      let waitPromise: Promise<any> = Promise.resolve();
      const event = {
        waitUntil(p: Promise<any>) {
          waitPromise = p;
        }
      };
      for (const listener of listeners['activate'] || []) {
        listener(event);
      }
      await waitPromise;
    },
    async dispatchFetch(req: Request) {
      let handled = false;
      let responsePromise: Promise<Response> | undefined = undefined;

      const event = {
        request: req,
        respondWith(promise: Promise<Response>) {
          handled = true;
          responsePromise = promise;
        }
      };

      for (const listener of listeners['fetch'] || []) {
        listener(event);
      }

      return { handled, responsePromise };
    }
  };
}

describe('Adversarial Challenge M4: Service Worker Execution & Offline Resilience', () => {
  const rootDir = path.resolve(__dirname, '..');

  describe('1. Desafío Adversarial: Exclusión Estricta de API y Métodos no-GET', () => {
    it('petición POST /api/parse-receipt NO debe ser interceptada por el Service Worker (handled: false)', async () => {
      const swEnv = setupSWEnvironment();
      const req = new Request('https://listadecompra.pro/api/parse-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: 'fake-data', mimeType: 'image/jpeg' })
      });

      const { handled, responsePromise } = await swEnv.dispatchFetch(req);
      assert.equal(handled, false, 'POST /api/parse-receipt no debe ser interceptado con event.respondWith');
      assert.equal(responsePromise, undefined);
    });

    it('peticiones GET a rutas /api/* NO deben ser interceptadas ni cacheadas (handled: false)', async () => {
      const swEnv = setupSWEnvironment();
      const apiEndpoints = [
        'https://listadecompra.pro/api/health',
        'https://listadecompra.pro/api/parse-receipt',
        'https://listadecompra.pro/api/items',
        'https://listadecompra.pro/api/v1/auth',
        'https://listadecompra.pro/api',
        'https://listadecompra.pro/api/',
        'https://listadecompra.pro/api/stats?from=2026-01-01&to=2026-11-01'
      ];

      for (const url of apiEndpoints) {
        const req = new Request(url, { method: 'GET' });
        const { handled } = await swEnv.dispatchFetch(req);
        assert.equal(handled, false, `Endpoint de API ${url} no debe ser interceptado por el Service Worker`);
      }
    });

    it('peticiones con métodos no-GET a cualquier ruta NO deben ser interceptadas (handled: false)', async () => {
      const swEnv = setupSWEnvironment();
      const nonGetRequests = [
        { url: 'https://listadecompra.pro/', method: 'POST' },
        { url: 'https://listadecompra.pro/rutas', method: 'PUT' },
        { url: 'https://listadecompra.pro/items/42', method: 'DELETE' },
        { url: 'https://listadecompra.pro/settings', method: 'PATCH' },
        { url: 'https://listadecompra.pro/manifest.json', method: 'HEAD' },
        { url: 'https://listadecompra.pro/sw.js', method: 'OPTIONS' }
      ];

      for (const { url, method } of nonGetRequests) {
        const req = new Request(url, { method });
        const { handled } = await swEnv.dispatchFetch(req);
        assert.equal(handled, false, `Método ${method} hacia ${url} no debe ser interceptado por el SW`);
      }
    });

    it('esquemas no-HTTP (chrome-extension, file, data, blob) NO deben ser interceptados', async () => {
      const swEnv = setupSWEnvironment();
      const nonHttpUrls = [
        'chrome-extension://abcdefghijklmnop/content.js',
        'file:///C:/Users/test/index.html',
        'data:image/svg+xml;utf8,<svg></svg>'
      ];

      for (const url of nonHttpUrls) {
        const req = new Request(url, { method: 'GET' });
        const { handled } = await swEnv.dispatchFetch(req);
        assert.equal(handled, false, `Esquema no-http ${url} no debe ser interceptado por el SW`);
      }
    });
  });

  describe('2. Desafío Adversarial: Simulación Offline / Modo Avión (Navigation Fallback)', () => {
    it('navegación online a / responde con respuesta de red 200 y actualiza caché', async () => {
      let networkFetchCalled = false;
      const swEnv = setupSWEnvironment(async (req) => {
        networkFetchCalled = true;
        return new Response('<!DOCTYPE html><html><body>Online App</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' }
        });
      });

      const req = createNavigateRequest('https://listadecompra.pro/');

      const { handled, responsePromise } = await swEnv.dispatchFetch(req);
      assert.equal(handled, true, 'La navegación debe ser manejada por event.respondWith');
      assert.ok(responsePromise, 'responsePromise debe existir');

      const response = await responsePromise;
      assert.equal(response.status, 200);
      assert.equal(networkFetchCalled, true, 'Debe haber llamado a la red en modo online');
      const body = await response.text();
      assert.ok(body.includes('Online App'));
    });

    it('modo avión / offline en navegación a / hace fallback al shell en caché con status 200', async () => {
      const swEnv = setupSWEnvironment(async () => {
        throw new TypeError('Failed to fetch (Simulación: Modo Avión / Sin Red)');
      });

      // Pre-cargar el shell en caché
      const cache = await swEnv.cachesStorage.get('lista-compra-cache-v1')!;
      await cache.put('https://listadecompra.pro/index.html', new Response('<!DOCTYPE html><html><body>Offline App Shell</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      }));

      const req = createNavigateRequest('https://listadecompra.pro/');

      const { handled, responsePromise } = await swEnv.dispatchFetch(req);
      assert.equal(handled, true);
      assert.ok(responsePromise);

      const response = await responsePromise;
      assert.equal(response.status, 200, 'Debe devolver status 200 con el shell');
      const text = await response.text();
      assert.ok(text.includes('Offline App Shell'), 'Debe retornar el shell offline precacheado');
    });

    it('modo avión / offline en navegación a deep routes (/rutas, /estadisticas) hace fallback a /index.html', async () => {
      const swEnv = setupSWEnvironment(async () => {
        throw new TypeError('Failed to fetch (Modo Avión)');
      });

      // Shell precacheado en /index.html
      const cache = await swEnv.cachesStorage.get('lista-compra-cache-v1')!;
      await cache.put('https://listadecompra.pro/index.html', new Response('<!DOCTYPE html><html><body>SPA Root Shell</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      }));

      const deepRoutes = [
        'https://listadecompra.pro/rutas',
        'https://listadecompra.pro/estadisticas',
        'https://listadecompra.pro/ajustes',
        'https://listadecompra.pro/viajes/2026-11-01'
      ];

      for (const route of deepRoutes) {
        const req = createNavigateRequest(route);

        const { handled, responsePromise } = await swEnv.dispatchFetch(req);
        assert.equal(handled, true);
        assert.ok(responsePromise);

        const response = await responsePromise;
        assert.equal(response.status, 200, `Deep route ${route} debe responder 200 offline`);
        const text = await response.text();
        assert.ok(text.includes('SPA Root Shell'), `Deep route ${route} debe recibir el SPA Shell`);
      }
    });

    it('modo avión catastrófico (sin red y sin caché) devuelve 503 Service Unavailable controlado', async () => {
      const swEnv = setupSWEnvironment(async () => {
        throw new TypeError('Failed to fetch');
      });

      // Asegurar que la caché está completamente vacía
      swEnv.cachesStorage.get('lista-compra-cache-v1')!.entries.clear();

      const req = createNavigateRequest('https://listadecompra.pro/desconocido');

      const { handled, responsePromise } = await swEnv.dispatchFetch(req);
      assert.equal(handled, true);
      assert.ok(responsePromise);

      const response = await responsePromise;
      assert.equal(response.status, 503, 'Debe devolver 503 ante ausencia total de red y caché');
      const text = await response.text();
      assert.ok(text.includes('Modo Offline: No hay conexión a red disponible.'));
    });
  });

  describe('3. Desafío Adversarial: Assets Estáticos, Cache-First / SWR', () => {
    it('asset existente en caché se devuelve inmediatamente (Cache-First) y dispara revalidación en background', async () => {
      let backgroundFetchCalled = false;
      const swEnv = setupSWEnvironment(async () => {
        backgroundFetchCalled = true;
        return new Response('icon-192-updated', { status: 200 });
      });

      const cache = swEnv.cachesStorage.get('lista-compra-cache-v1')!;
      await cache.put('https://listadecompra.pro/icons/icon-192.png', new Response('icon-192-cached', {
        status: 200,
        headers: { 'Content-Type': 'image/png' }
      }));

      const req = new Request('https://listadecompra.pro/icons/icon-192.png', { method: 'GET' });
      const { handled, responsePromise } = await swEnv.dispatchFetch(req);
      assert.equal(handled, true);
      assert.ok(responsePromise);

      const response = await responsePromise;
      assert.equal(response.status, 200);
      const text = await response.text();
      assert.equal(text, 'icon-192-cached', 'Debe responder inmediatamente desde caché');

      // Dar tiempo para que la promesa de fondo se ejecute
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(backgroundFetchCalled, true, 'Debe revalidar en segundo plano');
    });

    it('asset no existente en caché en modo avión devuelve 504 Gateway Timeout', async () => {
      const swEnv = setupSWEnvironment(async () => {
        throw new TypeError('Network down');
      });

      const req = new Request('https://listadecompra.pro/assets/missing-chunk.js', { method: 'GET' });
      const { handled, responsePromise } = await swEnv.dispatchFetch(req);
      assert.equal(handled, true);
      assert.ok(responsePromise);

      const response = await responsePromise;
      assert.equal(response.status, 504, 'Asset ausente en offline debe retornar 504');
      const text = await response.text();
      assert.ok(text.includes('Recurso no disponible en modo offline'));
    });
  });

  describe('4. Desafío Adversarial: Ciclo de Vida del Service Worker (Install & Activate)', () => {
    it('evento install pre-cachea los 6 activos nucleares del Shell e invoca skipWaiting()', async () => {
      const swEnv = setupSWEnvironment();
      await swEnv.dispatchInstall();

      assert.equal(swEnv.skipWaitingCalled, true, 'install debe invocar self.skipWaiting()');
      const cache = swEnv.cachesStorage.get('lista-compra-cache-v1')!;
      
      const expectedAssets = [
        '/',
        '/index.html',
        '/manifest.json',
        '/icons/icon-192.png',
        '/icons/icon-512.png',
        '/icons/icon.svg'
      ];

      for (const asset of expectedAssets) {
        assert.ok(await cache.match(asset), `Asset obligatorio "${asset}" debe estar pre-cacheado`);
      }
    });

    it('evento activate elimina cachés obsoletas y preserva lista-compra-cache-v1 e invoca clients.claim()', async () => {
      const swEnv = setupSWEnvironment();
      
      // Simular cachés residuales de versiones anteriores
      swEnv.cachesStorage.set('old-cache-v0', createMockCache());
      swEnv.cachesStorage.set('legacy-sw-cache', createMockCache());
      swEnv.cachesStorage.set('lista-compra-cache-v1', createMockCache());

      await swEnv.dispatchActivate();

      assert.equal(swEnv.clientsClaimCalled, true, 'activate debe invocar self.clients.claim()');
      assert.equal(swEnv.cachesStorage.has('old-cache-v0'), false, 'old-cache-v0 debe ser eliminada');
      assert.equal(swEnv.cachesStorage.has('legacy-sw-cache'), false, 'legacy-sw-cache debe ser eliminada');
      assert.equal(swEnv.cachesStorage.has('lista-compra-cache-v1'), true, 'lista-compra-cache-v1 debe conservarse');
    });
  });

  describe('5. Desafío Adversarial: Ausencia Total de Scripts Destructivos en index.html', () => {
    it('index.html no contiene unregister(), caches.delete ni getRegistrations', () => {
      const indexPath = path.join(rootDir, 'index.html');
      const indexContent = fs.readFileSync(indexPath, 'utf-8');

      assert.doesNotMatch(indexContent, /caches\.delete/, 'index.html no debe contener caches.delete');
      assert.doesNotMatch(indexContent, /navigator\.serviceWorker\.getRegistrations/, 'index.html no debe llamar a getRegistrations');
      assert.doesNotMatch(indexContent, /\.unregister\(\)/, 'index.html no debe llamar a unregister()');
    });

    it('index.html encapsula el registro de /sw.js en window.addEventListener("load", ...) y verifica protocolo http/https', () => {
      const indexPath = path.join(rootDir, 'index.html');
      const indexContent = fs.readFileSync(indexPath, 'utf-8');

      assert.match(indexContent, /'serviceWorker' in navigator/, 'Debe verificar soporte de serviceWorker');
      assert.match(indexContent, /window\.location\.protocol\.startsWith\(['"]http['"]\)/, 'Debe verificar protocolo http/https');
      assert.match(indexContent, /window\.addEventListener\(['"]load['"]/, 'Debe registrarse en el evento load para no penalizar LCP');
      assert.match(indexContent, /navigator\.serviceWorker\.register\(['"]\/sw\.js['"]\)/, 'Debe registrar /sw.js');
    });

    it('dist/index.html empaquetado conserva el registro de /sw.js y carece de scripts destructivos', () => {
      const distIndexPath = path.join(rootDir, 'dist/index.html');
      if (fs.existsSync(distIndexPath)) {
        const distIndexContent = fs.readFileSync(distIndexPath, 'utf-8');
        assert.doesNotMatch(distIndexContent, /caches\.delete/);
        assert.doesNotMatch(distIndexContent, /\.unregister\(\)/);
        assert.match(distIndexContent, /register\(['"]\/sw\.js['"]\)/);
      }
    });
  });

  describe('6. Desafío Adversarial: Integración E2E del Servidor Express en Producción', () => {
    let server: Server;
    let baseUrl: string;

    before(async () => {
      const app = await createApp({ mode: 'production' });
      await new Promise<void>((resolve, reject) => {
        server = app.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          if (addr && typeof addr === 'object') {
            baseUrl = `http://127.0.0.1:${addr.port}`;
            resolve();
          } else {
            reject(new Error('Fallo al obtener puerto'));
          }
        });
      });
    });

    after(async () => {
      await new Promise<void>((resolve) => {
        if (server) server.close(() => resolve());
        else resolve();
      });
    });

    it('servidor responde 200 a GET /sw.js con tipo de contenido javascript', async () => {
      const res = await fetch(`${baseUrl}/sw.js`);
      assert.equal(res.status, 200, '/sw.js debe ser servido con status 200');
      const contentType = res.headers.get('content-type') || '';
      assert.ok(contentType.includes('javascript'), `Content-Type debe ser javascript, recibido: ${contentType}`);
      const body = await res.text();
      assert.ok(body.includes('lista-compra-cache-v1'), 'El contenido debe ser el SW de producción');
    });

    it('servidor responde 200 a GET /manifest.json con tipo de contenido json', async () => {
      const res = await fetch(`${baseUrl}/manifest.json`);
      assert.equal(res.status, 200, '/manifest.json debe ser servido con status 200');
      const contentType = res.headers.get('content-type') || '';
      assert.ok(contentType.includes('json'), `Content-Type debe ser json, recibido: ${contentType}`);
      const manifest = await res.json() as any;
      assert.equal(manifest.name, 'Lista de Compra | PRO');
      assert.equal(manifest.start_url, '/');
      assert.equal(manifest.display, 'standalone');
    });

    it('servidor sirve todos los iconos referenciados en /icons/ con status 200 y tipos correctos', async () => {
      const icons = [
        { path: '/icons/icon-192.png', expectedType: 'image/png' },
        { path: '/icons/icon-512.png', expectedType: 'image/png' },
        { path: '/icons/icon.svg', expectedType: 'image/svg+xml' }
      ];

      for (const icon of icons) {
        const res = await fetch(`${baseUrl}${icon.path}`);
        assert.equal(res.status, 200, `El icono ${icon.path} debe retornar 200`);
        const contentType = res.headers.get('content-type') || '';
        assert.ok(contentType.includes(icon.expectedType), `El tipo de ${icon.path} debe contener ${icon.expectedType}`);
        const buf = await res.arrayBuffer();
        assert.ok(buf.byteLength > 0, `El icono ${icon.path} no debe estar vacío`);
      }
    });

    it('petición POST a /api/parse-receipt con cuerpo inválido responde 400 JSON estructurado (no 404 ni HTML)', async () => {
      const res = await fetch(`${baseUrl}/api/parse-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: 'invalido' })
      });

      assert.equal(res.status, 400, 'Debe devolver 400 Bad Request');
      const json = await res.json() as any;
      assert.equal(json.success, false);
      assert.ok(json.error.includes('Falta la imagen del ticket o el formato base64 es inválido.'));
    });

    it('petición GET a /api/health responde 200 JSON', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      assert.equal(res.status, 200);
      const json = await res.json() as any;
      assert.equal(json.status, 'ok');
      assert.equal(typeof json.uptime, 'number');
    });

    it('petición GET a deep route SPA /rutas responde 200 con index.html (SPA Fallback)', async () => {
      const res = await fetch(`${baseUrl}/rutas`);
      assert.equal(res.status, 200);
      const contentType = res.headers.get('content-type') || '';
      assert.ok(contentType.includes('text/html'));
      const text = await res.text();
      assert.ok(text.includes('<div id="root"></div>'));
    });
  });
});
