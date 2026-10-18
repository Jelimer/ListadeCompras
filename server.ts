import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseReceiptWithGemini } from './api/parse-receipt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '15mb' }));

  // Server-side Gemini Vision receipt extraction endpoint
  app.post('/api/parse-receipt', async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body || {};
      if (!imageBase64) {
        res.status(400).json({ success: false, error: 'Falta la imagen del ticket (imageBase64).' });
        return;
      }

      const parsed = await parseReceiptWithGemini(imageBase64, mimeType || 'image/jpeg');
      res.status(200).json({ success: true, source: 'gemini', data: parsed });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({
        success: false,
        error: message,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
