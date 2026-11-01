import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../server';

describe('Adversarial Challenge M3: Servidor Express, Seguridad, 404 JSON y Compresión', () => {
  let testServer: Server;
  let testBaseUrl: string;

  let prodServer: Server;
  let prodBaseUrl: string;

  before(async () => {
    // 1. Iniciar servidor en modo test para pruebas de API y seguridad
    const testApp = await createApp({ mode: 'test' });
    await new Promise<void>((resolve, reject) => {
      testServer = testApp.listen(0, '127.0.0.1', () => {
        const addr = testServer.address();
        if (addr && typeof addr === 'object') {
          testBaseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        } else {
          reject(new Error('Fallo al obtener la dirección del servidor de test'));
        }
      });
    });

    // 2. Iniciar servidor en modo producción para pruebas de estáticos, SPA y caché
    const prodApp = await createApp({ mode: 'production' });
    await new Promise<void>((resolve, reject) => {
      prodServer = prodApp.listen(0, '127.0.0.1', () => {
        const addr = prodServer.address();
        if (addr && typeof addr === 'object') {
          prodBaseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        } else {
          reject(new Error('Fallo al obtener la dirección del servidor de producción'));
        }
      });
    });
  });

  after(async () => {
    await Promise.all([
      new Promise<void>((resolve) => {
        if (testServer) testServer.close(() => resolve());
        else resolve();
      }),
      new Promise<void>((resolve) => {
        if (prodServer) prodServer.close(() => resolve());
        else resolve();
      }),
    ]);
  });

  describe('Desafío 1: Matriz Adversarial de Rutas Inexistentes /api/* y 404 JSON Estructurado', () => {
    const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

    for (const method of httpMethods) {
      it(`responde 404 JSON estructurado ante petición ${method} a /api/inexistente`, async () => {
        const res = await fetch(`${testBaseUrl}/api/inexistente`, { method });
        assert.equal(res.status, 404, `Status de ${method} debe ser 404`);
        assert.match(
          res.headers.get('content-type') || '',
          /application\/json/,
          'Content-Type debe ser application/json'
        );
        const data = await res.json();
        assert.deepEqual(data, {
          success: false,
          error: 'Endpoint de API no encontrado.',
        });
      });
    }

    it('responde 404 JSON en la raíz exacta /api (sin barra final)', async () => {
      const res = await fetch(`${testBaseUrl}/api`);
      assert.equal(res.status, 404);
      assert.match(res.headers.get('content-type') || '', /application\/json/);
      const data = await res.json();
      assert.deepEqual(data, {
        success: false,
        error: 'Endpoint de API no encontrado.',
      });
    });

    it('responde 404 JSON en la raíz /api/ (con barra final)', async () => {
      const res = await fetch(`${testBaseUrl}/api/`);
      assert.equal(res.status, 404);
      assert.match(res.headers.get('content-type') || '', /application\/json/);
      const data = await res.json();
      assert.deepEqual(data, {
        success: false,
        error: 'Endpoint de API no encontrado.',
      });
    });

    it('responde 404 JSON ante subrutas arbitrariamente profundas /api/v1/sub/deep/path', async () => {
      const res = await fetch(`${testBaseUrl}/api/v1/sub/deep/path`);
      assert.equal(res.status, 404);
      const data = await res.json();
      assert.deepEqual(data, {
        success: false,
        error: 'Endpoint de API no encontrado.',
      });
    });

    it('responde 404 JSON ante subrutas espurias bajo endpoints existentes (/api/health/subroute)', async () => {
      const res = await fetch(`${testBaseUrl}/api/health/subroute`);
      assert.equal(res.status, 404);
      const data = await res.json();
      assert.deepEqual(data, {
        success: false,
        error: 'Endpoint de API no encontrado.',
      });
    });

    it('responde 404 JSON ante método GET a /api/parse-receipt (solo permite POST)', async () => {
      const res = await fetch(`${testBaseUrl}/api/parse-receipt`, { method: 'GET' });
      assert.equal(res.status, 404);
      const data = await res.json();
      assert.deepEqual(data, {
        success: false,
        error: 'Endpoint de API no encontrado.',
      });
    });

    it('responde 404 JSON ante rutas con query params /api/desconocido?filter=active&sort=desc', async () => {
      const res = await fetch(
        `${testBaseUrl}/api/desconocido?filter=active&sort=desc`
      );
      assert.equal(res.status, 404);
      const data = await res.json();
      assert.deepEqual(data, {
        success: false,
        error: 'Endpoint de API no encontrado.',
      });
    });

    it('responde 404 JSON ante rutas con espacios codificados /api/ruta%20con%20espacio', async () => {
      const res = await fetch(`${testBaseUrl}/api/ruta%20con%20espacio`);
      assert.equal(res.status, 404);
      const data = await res.json();
      assert.deepEqual(data, {
        success: false,
        error: 'Endpoint de API no encontrado.',
      });
    });

    it('EN MODO PRODUCCIÓN: aísla estrictamente /api/* para que NUNCA devuelva HTML de SPA', async () => {
      const res = await fetch(`${prodBaseUrl}/api/desconocido-en-produccion`);
      assert.equal(res.status, 404);
      assert.match(
        res.headers.get('content-type') || '',
        /application\/json/,
        'Debe responder application/json en producción, no HTML de Vite SPA'
      );
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.error, 'Endpoint de API no encontrado.');

      // Verificar que una ruta normal de frontend SÍ entrega HTML con 200
      const resSpa = await fetch(`${prodBaseUrl}/viajes-frontend-route`);
      assert.equal(resSpa.status, 200);
      assert.match(
        resSpa.headers.get('content-type') || '',
        /text\/html/,
        'Rutas SPA deben devolver text/html'
      );
    });
  });

  describe('Desafío 2: Auditoría Adversarial de Cabeceras de Seguridad y Ofuscación', () => {
    it('ausencia absoluta de cabecera x-powered-by en respuestas 200, 400 y 404', async () => {
      // 200 OK
      const res200 = await fetch(`${testBaseUrl}/api/health`);
      assert.equal(res200.headers.get('x-powered-by'), null);

      // 404 Not Found
      const res404 = await fetch(`${testBaseUrl}/api/inexistente`);
      assert.equal(res404.headers.get('x-powered-by'), null);

      // 400 Bad Request
      const res400 = await fetch(`${testBaseUrl}/api/parse-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ "corrupto": ',
      });
      assert.equal(res400.headers.get('x-powered-by'), null);
    });

    it('ausencia de x-powered-by en activos estáticos y SPA de producción', async () => {
      const resSpa = await fetch(`${prodBaseUrl}/`);
      assert.equal(resSpa.headers.get('x-powered-by'), null);

      const assetsDir = path.join(process.cwd(), 'dist', 'assets');
      if (fs.existsSync(assetsDir)) {
        const files = fs.readdirSync(assetsDir);
        const sample = files.find((f) => f.endsWith('.js') || f.endsWith('.css'));
        if (sample) {
          const resAsset = await fetch(`${prodBaseUrl}/assets/${sample}`);
          assert.equal(resAsset.headers.get('x-powered-by'), null);
        }
      }
    });

    it('presencia uniforme de X-Content-Type-Options: nosniff en endpoints y activos', async () => {
      const paths = ['/api/health', '/api/desconocido', '/'];
      for (const p of paths) {
        const res = await fetch(`${prodBaseUrl}${p}`);
        assert.equal(
          res.headers.get('x-content-type-options'),
          'nosniff',
          `Falta nosniff en ${p}`
        );
      }
    });

    it('presencia uniforme de X-Frame-Options: SAMEORIGIN protegiendo contra Clickjacking', async () => {
      const paths = ['/api/health', '/api/desconocido', '/'];
      for (const p of paths) {
        const res = await fetch(`${prodBaseUrl}${p}`);
        assert.equal(
          res.headers.get('x-frame-options'),
          'SAMEORIGIN',
          `Falta SAMEORIGIN en ${p}`
        );
      }
    });

    it('presencia uniforme de Referrer-Policy: strict-origin-when-cross-origin', async () => {
      const res = await fetch(`${testBaseUrl}/api/health`);
      assert.equal(
        res.headers.get('referrer-policy'),
        'strict-origin-when-cross-origin'
      );
    });
  });

  describe('Desafío 3: Compresión HTTP Gzip y Estrategia de Caché PWA', () => {
    it('comprime con gzip activos pesados (> 1024 bytes) cuando Accept-Encoding lo solicita', async () => {
      const assetsDir = path.join(process.cwd(), 'dist', 'assets');
      assert.ok(fs.existsSync(assetsDir), 'Directorio dist/assets debe existir');
      const files = fs.readdirSync(assetsDir);
      const heavyFile = files.find((f) => {
        const stat = fs.statSync(path.join(assetsDir, f));
        return stat.size > 5000 && (f.endsWith('.js') || f.endsWith('.css'));
      });
      assert.ok(heavyFile, 'Debe haber al menos un asset pesado (> 5KB)');

      const res = await fetch(`${prodBaseUrl}/assets/${heavyFile}`, {
        headers: { 'Accept-Encoding': 'gzip' },
      });
      assert.equal(res.status, 200);
      assert.equal(
        res.headers.get('content-encoding'),
        'gzip',
        'El asset pesado debe servirse con compresión gzip'
      );
    });

    it('NO comprime cuando el cliente explícitamente pide Accept-Encoding: identity', async () => {
      const assetsDir = path.join(process.cwd(), 'dist', 'assets');
      const files = fs.readdirSync(assetsDir);
      const heavyFile = files.find((f) => f.endsWith('.js') || f.endsWith('.css'));
      if (heavyFile) {
        const res = await fetch(`${prodBaseUrl}/assets/${heavyFile}`, {
          headers: { 'Accept-Encoding': 'identity' },
        });
        assert.equal(res.status, 200);
        assert.notEqual(res.headers.get('content-encoding'), 'gzip');
      }
    });

    it('respeta el umbral y no comprime respuestas minúsculas (< 1024 bytes)', async () => {
      const res = await fetch(`${testBaseUrl}/api/health`, {
        headers: { 'Accept-Encoding': 'gzip' },
      });
      assert.equal(res.status, 200);
      // Para respuestas menores al threshold estándar de 1KB, compression no añade gzip
      assert.notEqual(res.headers.get('content-encoding'), 'gzip');
    });

    it('asigna Cache-Control: public, max-age=31536000, immutable a los assets en dist/assets', async () => {
      const assetsDir = path.join(process.cwd(), 'dist', 'assets');
      const files = fs.readdirSync(assetsDir);
      const jsOrCss = files.find((f) => f.endsWith('.js') || f.endsWith('.css'));
      assert.ok(jsOrCss, 'Debe existir un fichero JS o CSS en assets');

      const res = await fetch(`${prodBaseUrl}/assets/${jsOrCss}`);
      assert.equal(res.status, 200);
      assert.equal(
        res.headers.get('cache-control'),
        'public, max-age=31536000, immutable'
      );
    });

    it('asigna Cache-Control: no-cache a index.html y rutas SPA comodín', async () => {
      const resRoot = await fetch(`${prodBaseUrl}/`);
      assert.equal(resRoot.status, 200);
      assert.equal(resRoot.headers.get('cache-control'), 'no-cache');

      const resSpa = await fetch(`${prodBaseUrl}/rutas-spa-comodin`);
      assert.equal(resSpa.status, 200);
      assert.equal(resSpa.headers.get('cache-control'), 'no-cache');
    });
  });

  describe('Desafío 4: Robustez Defensiva y Manejo de Errores JSON Malformado', () => {
    it('captura JSON sintácticamente corrupto y responde 400 estructurado sin trazas internas', async () => {
      const malformedPayloads = [
        '{ "clave": ',
        '{"incompleto": [1, 2,',
        '<<< XML NO PERMITIDO >>>',
        'NaN',
      ];

      for (const body of malformedPayloads) {
        const res = await fetch(`${testBaseUrl}/api/parse-receipt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        assert.equal(res.status, 400, `Payload corrupto debe responder 400`);
        assert.match(
          res.headers.get('content-type') || '',
          /application\/json/,
          'Debe ser application/json'
        );
        const data = await res.json();
        assert.deepEqual(data, {
          success: false,
          error: 'Sintaxis JSON inválida en el cuerpo de la petición.',
        });
      }
    });

    it('rechaza con 400 payloads con tipos anómalos en imageBase64 (booleanos, arrays, objetos)', async () => {
      const invalidTypes = [
        true,
        false,
        [1, 2, 3],
        { nested: 'fake' },
        null,
      ];

      for (const val of invalidTypes) {
        const res = await fetch(`${testBaseUrl}/api/parse-receipt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: val }),
        });
        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.success, false);
      }
    });

    it('rechaza con 400 payloads con cadenas de solo espacios en blanco o longitud < 20', async () => {
      const invalidStrings = [
        '',
        '   ',
        'data:image/png;base', // 19 caracteres (< 20)
      ];

      for (const val of invalidStrings) {
        const res = await fetch(`${testBaseUrl}/api/parse-receipt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: val }),
        });
        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.success, false);
      }
    });
  });

  describe('Desafío 5: Comprobación Empírica de Puerto Dinámico', () => {
    it('soporta puerto dinámico vía variable de entorno PORT sin colisiones', async () => {
      const customPort = 48291;
      const prevPort = process.env.PORT;
      process.env.PORT = String(customPort);

      try {
        const app = await createApp({ mode: 'test' });
        const dynamicServer = await new Promise<Server>((resolve, reject) => {
          const s = app.listen(customPort, '127.0.0.1', () => resolve(s));
          s.on('error', reject);
        });

        try {
          const res = await fetch(`http://127.0.0.1:${customPort}/api/health`);
          assert.equal(res.status, 200);
          const data = await res.json();
          assert.equal(data.status, 'ok');
        } finally {
          await new Promise<void>((resolve) => dynamicServer.close(() => resolve()));
        }
      } finally {
        if (prevPort !== undefined) {
          process.env.PORT = prevPort;
        } else {
          delete process.env.PORT;
        }
      }
    });
  });
});
