import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createApp } from '../server';
import handler, {
  ALLOWED_RECEIPT_MIME_TYPES,
  getGenAIClient,
  parseReceiptWithGemini,
} from '../api/parse-receipt';

describe('Suite de Pruebas: Backend Express y API', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    process.env.NODE_ENV = 'test';
    const app = await createApp();
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        } else {
          reject(new Error('No se pudo obtener la dirección del servidor de pruebas.'));
        }
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      if (server) {
        server.close((err) => (err ? reject(err) : resolve()));
      } else {
        resolve();
      }
    });
  });

  describe('Seguridad y Cabeceras HTTP', () => {
    it('deshabilita la cabecera x-powered-by en todas las respuestas', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      assert.equal(response.headers.get('x-powered-by'), null);
    });

    it('emite cabeceras de seguridad nosniff, SAMEORIGIN y Referrer-Policy', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
      assert.equal(
        response.headers.get('referrer-policy'),
        'strict-origin-when-cross-origin'
      );
    });

    it('responde 200 OK con metadatos de salud en /api/health', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.status, 'ok');
      assert.equal(typeof data.uptime, 'number');
      assert.equal(typeof data.timestamp, 'number');
      assert.equal(typeof data.geminiConfigured, 'boolean');
    });
  });

  describe('Control de Rutas API No Existentes (404 JSON)', () => {
    it('responde 404 JSON estructurado ante /api/desconocido', async () => {
      const response = await fetch(`${baseUrl}/api/desconocido`);
      assert.equal(response.status, 404);
      assert.match(
        response.headers.get('content-type') || '',
        /application\/json/
      );
      const data = await response.json();
      assert.deepEqual(data, {
        success: false,
        error: 'Endpoint de API no encontrado.',
      });
    });

    it('responde 404 JSON estructurado ante /api raíz', async () => {
      const response = await fetch(`${baseUrl}/api`);
      assert.equal(response.status, 404);
      assert.match(
        response.headers.get('content-type') || '',
        /application\/json/
      );
      const data = await response.json();
      assert.deepEqual(data, {
        success: false,
        error: 'Endpoint de API no encontrado.',
      });
    });

    it('responde 404 JSON ante subrutas anidadas inexistentes /api/v1/tickets/invalido', async () => {
      const response = await fetch(`${baseUrl}/api/v1/tickets/invalido`, {
        method: 'POST',
      });
      assert.equal(response.status, 404);
      const data = await response.json();
      assert.equal(data.success, false);
      assert.equal(data.error, 'Endpoint de API no encontrado.');
    });
  });

  describe('Manejo Defensivo y Validaciones en /api/parse-receipt', () => {
    it('responde 400 ante payload vacío sin imageBase64', async () => {
      const response = await fetch(`${baseUrl}/api/parse-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(response.status, 400);
      const data = await response.json();
      assert.equal(data.success, false);
      assert.equal(
        data.error,
        'Falta la imagen del ticket o el formato base64 es inválido.'
      );
    });

    it('responde 400 si imageBase64 es un número o tipo no string', async () => {
      const response = await fetch(`${baseUrl}/api/parse-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: 123456789 }),
      });
      assert.equal(response.status, 400);
      const data = await response.json();
      assert.equal(data.success, false);
      assert.equal(
        data.error,
        'Falta la imagen del ticket o el formato base64 es inválido.'
      );
    });

    it('responde 400 si imageBase64 es una cadena demasiado corta o vacía', async () => {
      const response = await fetch(`${baseUrl}/api/parse-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: 'corta' }),
      });
      assert.equal(response.status, 400);
      const data = await response.json();
      assert.equal(data.success, false);
    });

    it('responde 400 estructurado ante JSON malformado en el cuerpo de la petición', async () => {
      const response = await fetch(`${baseUrl}/api/parse-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ "incompleto": true, "corrupto": ',
      });
      assert.equal(response.status, 400);
      const data = await response.json();
      assert.equal(data.success, false);
      assert.equal(
        data.error,
        'Sintaxis JSON inválida en el cuerpo de la petición.'
      );
    });
  });

  describe('Unidad: Módulo api/parse-receipt.ts', () => {
    it('valida que ALLOWED_RECEIPT_MIME_TYPES contenga los tipos MIME permitidos por Gemini Vision', () => {
      assert.ok(ALLOWED_RECEIPT_MIME_TYPES.includes('image/jpeg'));
      assert.ok(ALLOWED_RECEIPT_MIME_TYPES.includes('image/png'));
      assert.ok(ALLOWED_RECEIPT_MIME_TYPES.includes('image/webp'));
      assert.ok(ALLOWED_RECEIPT_MIME_TYPES.includes('image/heic'));
      assert.ok(ALLOWED_RECEIPT_MIME_TYPES.includes('image/heif'));
    });

    it('implementa el patrón singleton en getGenAIClient reutilizando la misma instancia', () => {
      const client1 = getGenAIClient('test_api_key_123');
      const client2 = getGenAIClient('test_api_key_123');
      assert.equal(client1, client2);
    });

    it('handler serverless responde 405 Method Not Allowed si el método no es POST', async () => {
      let statusCode = 0;
      let jsonBody: any = null;
      const fakeReq = { method: 'GET', body: {} };
      const fakeRes = {
        status: (code: number) => {
          statusCode = code;
          return {
            json: (payload: any) => {
              jsonBody = payload;
            },
          };
        },
      };

      await handler(fakeReq, fakeRes);
      assert.equal(statusCode, 405);
      assert.equal(jsonBody?.success, false);
      assert.equal(jsonBody?.error, 'Method Not Allowed');
    });

    it('handler serverless responde 400 si imageBase64 falta o no es string', async () => {
      let statusCode = 0;
      let jsonBody: any = null;
      const fakeReq = { method: 'POST', body: { imageBase64: null } };
      const fakeRes = {
        status: (code: number) => {
          statusCode = code;
          return {
            json: (payload: any) => {
              jsonBody = payload;
            },
          };
        },
      };

      await handler(fakeReq, fakeRes);
      assert.equal(statusCode, 400);
      assert.equal(jsonBody?.success, false);
    });

    it('parseReceiptWithGemini lanza INVALID_IMAGE_PAYLOAD ante entradas no string', async () => {
      const prevKey = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = 'dummy_key';
      try {
        await assert.rejects(
          async () => {
            await parseReceiptWithGemini(null as any, 'image/jpeg');
          },
          { message: 'INVALID_IMAGE_PAYLOAD' }
        );
      } finally {
        process.env.GEMINI_API_KEY = prevKey;
      }
    });

    it('parseReceiptWithGemini lanza GEMINI_API_KEY_NOT_CONFIGURED si falta la clave', async () => {
      const prevKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      try {
        await assert.rejects(
          async () => {
            await parseReceiptWithGemini('valido_pero_sin_clave', 'image/jpeg');
          },
          { message: 'GEMINI_API_KEY_NOT_CONFIGURED' }
        );
      } finally {
        process.env.GEMINI_API_KEY = prevKey;
      }
    });
  });

  describe('Modo Producción: Cabeceras de Caché y Compresión', () => {
    let prodServer: Server;
    let prodBaseUrl: string;

    before(async () => {
      const prodApp = await createApp({ mode: 'production' });
      await new Promise<void>((resolve, reject) => {
        prodServer = prodApp.listen(0, '127.0.0.1', () => {
          const addr = prodServer.address();
          if (addr && typeof addr === 'object') {
            prodBaseUrl = `http://127.0.0.1:${addr.port}`;
            resolve();
          } else {
            reject(new Error('No se pudo vincular servidor de producción.'));
          }
        });
      });
    });

    after(async () => {
      await new Promise<void>((resolve, reject) => {
        if (prodServer) {
          prodServer.close((err) => (err ? reject(err) : resolve()));
        } else {
          resolve();
        }
      });
    });

    it('sirve index.html con cabecera Cache-Control: no-cache', async () => {
      const response = await fetch(`${prodBaseUrl}/`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-cache');
    });

    it('sirve rutas SPA comodín entregando index.html con no-cache', async () => {
      const response = await fetch(`${prodBaseUrl}/viajes`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-cache');
    });

    it('sirve assets compilados con cabecera Cache-Control inmutable a largo plazo', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const assetsDir = path.join(process.cwd(), 'dist', 'assets');
      if (fs.existsSync(assetsDir)) {
        const files = fs.readdirSync(assetsDir);
        const sampleFile = files.find((f) => f.endsWith('.js') || f.endsWith('.css'));
        if (sampleFile) {
          const response = await fetch(`${prodBaseUrl}/assets/${sampleFile}`);
          assert.equal(response.status, 200);
          assert.equal(
            response.headers.get('cache-control'),
            'public, max-age=31536000, immutable'
          );
        }
      }
    });

    it('comprime respuestas grandes (> 1KB) con gzip cuando el cliente lo solicita', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const assetsDir = path.join(process.cwd(), 'dist', 'assets');
      if (fs.existsSync(assetsDir)) {
        const files = fs.readdirSync(assetsDir);
        const bigFile = files.find((f) => {
          const stat = fs.statSync(path.join(assetsDir, f));
          return stat.size > 2048 && (f.endsWith('.js') || f.endsWith('.css'));
        });
        if (bigFile) {
          const response = await fetch(`${prodBaseUrl}/assets/${bigFile}`, {
            headers: { 'Accept-Encoding': 'gzip' },
          });
          assert.equal(response.status, 200);
          assert.equal(response.headers.get('content-encoding'), 'gzip');
        }
      }
    });
  });
});
