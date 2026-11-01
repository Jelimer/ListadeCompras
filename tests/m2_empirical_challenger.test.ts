import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { formatMoney, formatCurrency } from '../src/utils/formatters.ts';
import { calculateDetailedAnalytics } from '../src/utils/analytics.ts';
import { ShoppingItem } from '../src/types/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Adversarial Challenge M2: Empaquetado Vite, Chunks y Resolución Dinámica', () => {
  const projectRoot = path.resolve(__dirname, '..');
  const distDir = path.join(projectRoot, 'dist');
  const assetsDir = path.join(distDir, 'assets');

  test('Desafío 1: Verificación de límite estricto de 500 kB por chunk', () => {
    assert.ok(fs.existsSync(assetsDir), 'El directorio dist/assets debe existir tras el build');
    const files = fs.readdirSync(assetsDir);
    const jsFiles = files.filter((f) => f.endsWith('.js'));
    assert.ok(jsFiles.length > 0, 'Debe haber chunks de JavaScript generados');

    const CHUNK_LIMIT_BYTES = 500 * 1024; // 512,000 bytes (500 KiB)
    const CHUNK_LIMIT_DECIMAL = 500 * 1000; // 500,000 bytes (500 kB métrico)

    const chunkSizes: Record<string, number> = {};

    for (const jsFile of jsFiles) {
      const stats = fs.statSync(path.join(assetsDir, jsFile));
      chunkSizes[jsFile] = stats.size;
      assert.ok(
        stats.size <= CHUNK_LIMIT_BYTES,
        `El chunk ${jsFile} (${(stats.size / 1024).toFixed(2)} KiB) excede el umbral de 500 KiB (${CHUNK_LIMIT_BYTES} B)`
      );
      assert.ok(
        stats.size <= CHUNK_LIMIT_DECIMAL,
        `El chunk ${jsFile} (${(stats.size / 1000).toFixed(2)} kB) excede el umbral de 500 kB decimal (${CHUNK_LIMIT_DECIMAL} B)`
      );
    }

    // Verificar que el vendor-echarts es el más pesado y no supera los 500 kB
    const echartsChunk = jsFiles.find((f) => f.startsWith('vendor-echarts-'));
    assert.ok(echartsChunk, 'Debe existir el chunk modularizado vendor-echarts');
    assert.ok(
      chunkSizes[echartsChunk!] < 500000,
      `vendor-echarts (${chunkSizes[echartsChunk!]} B) debe ser menor a 500 kB`
    );

    // Verificar que index.js (bundle principal de arranque) es liviano (< 150 kB)
    const indexChunk = jsFiles.find((f) => f.startsWith('index-'));
    assert.ok(indexChunk, 'Debe existir el chunk principal de entrada index-*');
    assert.ok(
      chunkSizes[indexChunk!] < 150000,
      `El chunk principal index (${chunkSizes[indexChunk!]} B) debe ser ligero para carga rápida FCP`
    );
  });

  test('Desafío 2: Integridad del grafo de dependencias y resolución de módulos dinámicos', () => {
    const files = fs.readdirSync(assetsDir);
    const jsFiles = files.filter((f) => f.endsWith('.js'));

    const dynamicImportsFound: { fromFile: string; target: string }[] = [];
    const staticImportsFound: { fromFile: string; target: string }[] = [];

    for (const jsFile of jsFiles) {
      const content = fs.readFileSync(path.join(assetsDir, jsFile), 'utf8');

      // Detectar imports dinámicos tipo import("./Nombre-hash.js") o import(`./Nombre-hash.js`)
      const dynRegex = /import\s*\(\s*['"`](\.[^'"`]+)['"`]\s*\)/g;
      let dynMatch;
      while ((dynMatch = dynRegex.exec(content)) !== null) {
        dynamicImportsFound.push({ fromFile: jsFile, target: dynMatch[1] });
      }

      // Detectar importaciones estáticas relativas emitidas por el bundler
      const staticRegex = /(?:import|from)\s*['"](\.[^'"]+)['"]/g;
      let staticMatch;
      while ((staticMatch = staticRegex.exec(content)) !== null) {
        staticImportsFound.push({ fromFile: jsFile, target: staticMatch[1] });
      }
    }

    assert.ok(dynamicImportsFound.length >= 5, 'Deben existir al menos 5 imports dinámicos en los bundles');

    // Comprobar que absolutamente todos los destinos relativos existen en disco
    for (const item of [...dynamicImportsFound, ...staticImportsFound]) {
      const targetAbs = path.resolve(assetsDir, item.target);
      const exists = fs.existsSync(targetAbs);
      assert.ok(
        exists,
        `Fallo de resolución de módulo: '${item.target}' referenciado en '${item.fromFile}' no existe en disco: ${targetAbs}`
      );
    }
  });

  test('Desafío 3: Simulación de servidor HTTP con verificación de Content-Type (MIME) y código 200 (sin 404)', async () => {
    // Servidor HTTP simple en memoria para servir los artefactos de dist/
    const server = http.createServer((req, res) => {
      let reqPath = (req.url || '/').split('?')[0];
      if (reqPath === '/') reqPath = '/index.html';
      const safePath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
      const filePath = path.join(distDir, safePath);

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      let contentType = 'application/octet-stream';
      if (ext === '.html') contentType = 'text/html; charset=utf-8';
      else if (ext === '.js') contentType = 'application/javascript; charset=utf-8';
      else if (ext === '.css') contentType = 'text/css; charset=utf-8';
      else if (ext === '.json') contentType = 'application/json';
      else if (ext === '.png') contentType = 'image/png';

      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      // 1. Verificar index.html
      const htmlRes = await fetch(`${baseUrl}/`);
      assert.equal(htmlRes.status, 200);
      assert.match(htmlRes.headers.get('content-type') || '', /text\/html/);
      const htmlText = await htmlRes.text();
      assert.ok(htmlText.includes('<script type="module"'), 'index.html debe contener el script principal type="module"');

      // 2. Extraer todos los assets referenciados en index.html
      const assetMatches = [...htmlText.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
      assert.ok(assetMatches.length >= 3, 'Deben existir scripts y stylesheets en index.html');

      for (const assetPath of assetMatches) {
        const assetRes = await fetch(`${baseUrl}${assetPath}`);
        assert.equal(assetRes.status, 200, `Asset ${assetPath} debe responder con 200 OK`);
        const ctype = assetRes.headers.get('content-type') || '';
        if (assetPath.endsWith('.js')) {
          assert.match(ctype, /javascript/, `Asset JS ${assetPath} debe servirse con MIME de JavaScript`);
        } else if (assetPath.endsWith('.css')) {
          assert.match(ctype, /css/, `Asset CSS ${assetPath} debe servirse con MIME de CSS`);
        }
      }

      // 3. Verificar que cada chunk lazy (StatsView, MapView, Scanner, Export, Share) responde con 200 y MIME válido
      const distAssets = fs.readdirSync(assetsDir);
      const lazyPrefixes = ['StatsView-', 'MapView-', 'ReceiptScannerModal-', 'ExportModal-', 'ShareModal-'];
      for (const prefix of lazyPrefixes) {
        const chunk = distAssets.find((f) => f.startsWith(prefix) && f.endsWith('.js'));
        assert.ok(chunk, `El chunk con prefijo ${prefix} debe existir en dist/assets`);
        const chunkRes = await fetch(`${baseUrl}/assets/${chunk}`);
        assert.equal(chunkRes.status, 200, `El chunk dinámico ${chunk} debe devolver HTTP 200`);
        assert.match(
          chunkRes.headers.get('content-type') || '',
          /javascript/,
          `El chunk ${chunk} debe tener MIME type application/javascript`
        );
      }
    } finally {
      server.close();
    }
  });

  test('Desafío 4: Contrato de exportaciones nombradas para carga perezosa React.lazy', () => {
    // Validar que los componentes TypeScript definan las exportaciones nombradas requeridas
    const componentsDir = path.join(projectRoot, 'src', 'components');

    const expectedExports = [
      { file: 'StatsView.tsx', exportName: 'StatsView' },
      { file: 'MapView.tsx', exportName: 'MapView' },
      { file: 'ReceiptScannerModal.tsx', exportName: 'ReceiptScannerModal' },
      { file: 'ExportModal.tsx', exportName: 'ExportModal' },
      { file: 'ShareModal.tsx', exportName: 'ShareModal' },
    ];

    for (const exp of expectedExports) {
      const srcCode = fs.readFileSync(path.join(componentsDir, exp.file), 'utf8');
      const hasNamedExport = new RegExp(`export\\s+(const|function)\\s+${exp.exportName}\\b`).test(srcCode);
      assert.ok(
        hasNamedExport,
        `El archivo src/components/${exp.file} debe tener la exportación nombrada '${exp.exportName}'`
      );
    }

    // Verificar adicionalmente que en los chunks compilados de dist/assets/ las exportaciones estén preservadas
    const distAssets = fs.readdirSync(assetsDir);
    for (const exp of expectedExports) {
      const chunkPrefix = exp.exportName + '-';
      const chunk = distAssets.find((f) => f.startsWith(chunkPrefix) && f.endsWith('.js'));
      assert.ok(chunk, `Debe existir el chunk compilado correspondiente para ${exp.exportName}`);
      const chunkContent = fs.readFileSync(path.join(assetsDir, chunk!), 'utf8');
      const exportRegex = new RegExp(`as\\s+${exp.exportName}\\b|\\b${exp.exportName}\\s*[,}]`);
      assert.ok(
        exportRegex.test(chunkContent),
        `El chunk ${chunk} debe contener el símbolo exportado '${exp.exportName}' para desestructuración en React.lazy`
      );
    }
  });

  test('Desafío 5: Formateo de moneda y eliminación de doble signo $$', () => {
    // formatMoney ya incluye el símbolo $
    const zero = formatMoney(0);
    assert.equal(zero, '$0,00', '0 debe formatearse como $0,00 con un solo símbolo $');

    const standard = formatMoney(1250);
    assert.equal(standard, '$1.250,00');

    const centavos = formatMoney(49.99);
    assert.equal(centavos, '$49,99');

    const grande = formatMoney(1000000.5);
    assert.equal(grande, '$1.000.000,50');

    // Asegurarse de que ninguna cadena resultante comience con '$$'
    const testCases = [0, -10, 1500, 999999.99, 0.01];
    for (const val of testCases) {
      const res = formatMoney(val);
      assert.ok(!res.startsWith('$$'), `formatMoney(${val}) no debe contener doble signo monetario: '${res}'`);
    }
  });

  test('Desafío 6: Estrés de cálculo analítico y reactividad sin bloqueos (10.000 items)', () => {
    const items: ShoppingItem[] = Array.from({ length: 10000 }, (_, i) => ({
      id: `item-${i}`,
      name: `Producto de Prueba ${i}`,
      quantity: (i % 5) + 1,
      unitPrice: (i % 100) * 10 + 0.5,
      category: i % 2 === 0 ? 'Almacén' : 'Verdulería',
      location: i % 3 === 0 ? 'Supermercado Central' : 'Mercado Norte',
      completed: i % 2 === 0,
      createdAt: new Date().toISOString(),
    }));

    const startTime = performance.now();
    const analytics = calculateDetailedAnalytics(items, 500000);
    const duration = performance.now() - startTime;

    assert.ok(duration < 100, `El cálculo de analytics con 10.000 items debe tardar < 100ms (tardó ${duration.toFixed(2)}ms)`);
    assert.ok(analytics.storeBreakdown.length > 0);
    assert.ok(analytics.categoryBreakdown.length > 0);
    assert.ok(analytics.topProducts.length > 0);
    assert.equal(analytics.totalProducts, 10000);
  });
});
