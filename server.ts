import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import compression from 'compression';
import {
  parseReceiptWithGemini,
  ALLOWED_RECEIPT_MIME_TYPES,
  AllowedReceiptMimeType,
} from './api/parse-receipt';

// Carga automática de .env en Node 20.6+ / 22+
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch {
    // Si no existe .env local, continúa sin error
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createApp(options?: {
  mode?: 'development' | 'production' | 'test';
}) {
  const app = express();
  const effectiveMode =
    options?.mode ||
    (process.env.NODE_ENV as 'development' | 'production' | 'test') ||
    'development';

  // Deshabilitar cabecera x-powered-by
  app.disable('x-powered-by');

  // Cabeceras de seguridad HTTP
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Compresión de respuestas (gzip/deflate)
  app.use(compression());

  // Parser JSON con límite ajustado para imágenes de ticket
  app.use(express.json({ limit: '15mb' }));

  // Endpoint de comprobación de salud del servidor
  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: Date.now(),
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  // Server-side Gemini Vision receipt extraction endpoint
  app.post('/api/parse-receipt', async (req: Request, res: Response) => {
    try {
      const { imageBase64, mimeType } = req.body || {};
      if (!imageBase64 || typeof imageBase64 !== 'string' || imageBase64.trim().length < 20) {
        res.status(400).json({
          success: false,
          error: 'Falta la imagen del ticket o el formato base64 es inválido.',
        });
        return;
      }

      const cleanMime =
        typeof mimeType === 'string' &&
        ALLOWED_RECEIPT_MIME_TYPES.includes(mimeType as AllowedReceiptMimeType)
          ? mimeType
          : 'image/jpeg';

      const parsed = await parseReceiptWithGemini(imageBase64, cleanMime);
      res.status(200).json({ success: true, source: 'gemini', data: parsed });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({
        success: false,
        error: message,
      });
    }
  });

  // Manejador 404 para cualquier ruta API no reconocida (evita responder con index.html)
  app.all('/api', (_req: Request, res: Response) => {
    res.status(404).json({ success: false, error: 'Endpoint de API no encontrado.' });
  });
  app.all('/api/*all', (_req: Request, res: Response) => {
    res.status(404).json({ success: false, error: 'Endpoint de API no encontrado.' });
  });

  // Manejador global de errores (por ejemplo si express.json recibe payload corrupto)
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (
      err &&
      (err.type === 'entity.parse.failed' ||
        (err instanceof SyntaxError && 'body' in err))
    ) {
      res.status(400).json({
        success: false,
        error: 'Sintaxis JSON inválida en el cuerpo de la petición.',
      });
      return;
    }
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    res.status(500).json({ success: false, error: message });
  });

  // Servir frontend según entorno
  if (effectiveMode === 'test') {
    // Entorno de pruebas: omitir servidor de desarrollo Vite
  } else if (effectiveMode === 'production') {
    const distPath = path.join(__dirname, 'dist');
    // Servir assets compilados con cabeceras de caché inmutable
    app.use(
      express.static(distPath, {
        setHeaders: (res: Response, filePath: string) => {
          const normalizedPath = filePath.replace(/\\/g, '/');
          if (normalizedPath.includes('/assets/')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else if (
            normalizedPath.endsWith('/index.html') ||
            normalizedPath.endsWith('index.html')
          ) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );
    app.get('*all', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  return app;
}

export async function startServer() {
  const app = await createApp();
  const PORT = Number(process.env.PORT) || 3000;

  return app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

const isDirectRun =
  process.argv[1] &&
  (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) ||
    process.argv[1].endsWith('server.ts') ||
    process.argv[1].endsWith('server.js'));

if (isDirectRun && process.env.NODE_ENV !== 'test') {
  startServer();
}
