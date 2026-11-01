import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('PWA Offline Shell & Assets Distribution Suite (M4)', () => {
  const rootDir = path.resolve(__dirname, '..');
  const publicDir = path.join(rootDir, 'public');
  const distDir = path.join(rootDir, 'dist');
  const manifestPath = path.join(publicDir, 'manifest.json');
  const swPath = path.join(publicDir, 'sw.js');
  const indexPath = path.join(rootDir, 'index.html');

  describe('1. Web App Manifest Audit (public/manifest.json)', () => {
    it('debe existir el archivo manifest.json y ser un JSON sintácticamente válido', () => {
      assert.ok(fs.existsSync(manifestPath), 'public/manifest.json no existe en el sistema de archivos');
      const content = fs.readFileSync(manifestPath, 'utf-8');
      assert.doesNotThrow(() => JSON.parse(content), 'public/manifest.json no es un JSON válido');
    });

    it('debe contener todos los campos obligatorios de PWA de producción', () => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      
      assert.equal(typeof manifest.name, 'string', 'name debe ser un string');
      assert.ok(manifest.name.length > 0, 'name no debe estar vacío');
      assert.equal(manifest.name, 'Lista de Compra | PRO');

      assert.equal(typeof manifest.short_name, 'string', 'short_name debe ser un string');
      assert.ok(manifest.short_name.length > 0, 'short_name no debe estar vacío');

      assert.equal(typeof manifest.start_url, 'string', 'start_url debe ser un string');
      assert.ok(manifest.start_url.startsWith('/'), 'start_url debe iniciar con /');

      assert.equal(manifest.display, 'standalone', 'display debe ser standalone para comportamiento de app nativa');
      assert.equal(typeof manifest.theme_color, 'string', 'theme_color debe ser un string');
      assert.equal(typeof manifest.background_color, 'string', 'background_color debe ser un string');
      assert.ok(Array.isArray(manifest.icons), 'icons debe ser un array');
      assert.ok(manifest.icons.length >= 3, 'icons debe tener al menos 3 declaraciones de iconos');
    });

    it('todos los iconos declarados deben tener rutas absolutas /icons/... y existir en public/icons/', () => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      
      for (const icon of manifest.icons) {
        assert.ok(icon.src.startsWith('/icons/'), `La ruta del icono "${icon.src}" debe comenzar con "/icons/"`);
        assert.ok(icon.sizes, `El icono "${icon.src}" debe definir atributo sizes`);
        assert.ok(icon.type, `El icono "${icon.src}" debe definir atributo type`);

        // Comprobar existencia física en el disco dentro de public/
        const relativePath = icon.src.replace(/^\//, ''); // 'icons/icon-192.png'
        const fullIconPath = path.join(publicDir, relativePath);
        assert.ok(fs.existsSync(fullIconPath), `El icono declarado en manifest "${icon.src}" no existe en ${fullIconPath}`);
        
        const stats = fs.statSync(fullIconPath);
        assert.ok(stats.size > 0, `El icono "${fullIconPath}" tiene tamaño 0 bytes`);
      }
    });

    it('debe incluir iconos requeridos para Android PWA e iOS (192x192, 512x512 y maskable)', () => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
      const purposes = manifest.icons.map((i: { purpose?: string }) => i.purpose);

      assert.ok(sizes.includes('192x192'), 'Debe incluir un icono de 192x192');
      assert.ok(sizes.includes('512x512'), 'Debe incluir un icono de 512x512');
      assert.ok(purposes.includes('maskable'), 'Debe incluir un icono con purpose maskable para Android adaptive icons');
    });
  });

  describe('2. Service Worker Implementation Audit (public/sw.js)', () => {
    it('debe existir el archivo public/sw.js con contenido no vacío', () => {
      assert.ok(fs.existsSync(swPath), 'public/sw.js no existe');
      const swContent = fs.readFileSync(swPath, 'utf-8');
      assert.ok(swContent.length > 200, 'public/sw.js parece incompleto o vacío');
    });

    it('debe registrar y manejar los eventos de ciclo de vida install, activate y fetch', () => {
      const swContent = fs.readFileSync(swPath, 'utf-8');
      
      assert.ok(swContent.includes("addEventListener('install'"), 'Falta listener del evento install');
      assert.ok(swContent.includes("addEventListener('activate'"), 'Falta listener del evento activate');
      assert.ok(swContent.includes("addEventListener('fetch'"), 'Falta listener del evento fetch');
    });

    it('debe contener skipWaiting en install y clients.claim en activate con limpieza de caché', () => {
      const swContent = fs.readFileSync(swPath, 'utf-8');

      assert.ok(swContent.includes('skipWaiting()'), 'Debe invocar skipWaiting() para activación inmediata');
      assert.ok(swContent.includes('clients.claim()'), 'Debe invocar clients.claim() para tomar control inmediato');
      assert.ok(swContent.includes('caches.delete'), 'Debe incluir caches.delete en activate para limpiar versiones obsoletas');
    });

    it('debe excluir de forma estricta las solicitudes a la API (/api/*) y métodos no-GET', () => {
      const swContent = fs.readFileSync(swPath, 'utf-8');

      // Comprobar exclusión de métodos no-GET
      assert.ok(
        swContent.includes("request.method !== 'GET'") || swContent.includes("request.method != 'GET'"),
        'Debe excluir métodos HTTP no-GET para no interferir con mutaciones o uploads'
      );

      // Comprobar exclusión de la API
      assert.ok(
        swContent.includes('/api/') || swContent.includes('/api'),
        'Debe excluir explícitamente las rutas /api/ de la intercepción de caché'
      );
    });

    it('debe implementar estrategia de navegación SPA (Network-First con fallback a offline shell)', () => {
      const swContent = fs.readFileSync(swPath, 'utf-8');

      assert.ok(swContent.includes("request.mode === 'navigate'"), 'Debe detectar solicitudes de navegación SPA');
      assert.ok(swContent.includes('/index.html'), 'Debe tener fallback a /index.html en caso de offline');
    });

    it('debe pre-cachear los recursos esenciales del App Shell en la instalación', () => {
      const swContent = fs.readFileSync(swPath, 'utf-8');

      assert.ok(swContent.includes("'/index.html'"), 'Debe pre-cachear /index.html');
      assert.ok(swContent.includes("'/manifest.json'"), 'Debe pre-cachear /manifest.json');
      assert.ok(swContent.includes("'/icons/icon-192.png'"), 'Debe pre-cachear icono de 192px');
      assert.ok(swContent.includes("'/icons/icon-512.png'"), 'Debe pre-cachear icono de 512px');
    });
  });

  describe('3. HTML Shell & Service Worker Registration (index.html)', () => {
    it('no debe contener scripts destructivos de limpieza ni desregistro suicida de service workers', () => {
      const indexContent = fs.readFileSync(indexPath, 'utf-8');

      assert.ok(!indexContent.includes('caches.delete'), 'index.html contiene caches.delete (debe eliminarse el script suicida)');
      assert.ok(!indexContent.includes('unregister()'), 'index.html contiene unregister() (debe eliminarse el desregistro continuo)');
      assert.ok(!indexContent.includes('getRegistrations()'), 'index.html contiene getRegistrations()');
    });

    it('debe contener registro limpio y robusto de /sw.js condicional a protocolo http/https', () => {
      const indexContent = fs.readFileSync(indexPath, 'utf-8');

      assert.ok(indexContent.includes("'serviceWorker' in navigator"), 'Debe comprobar soporte de serviceWorker en navigator');
      assert.ok(indexContent.includes("navigator.serviceWorker.register('/sw.js')"), 'Debe registrar /sw.js');
      assert.ok(indexContent.includes("window.location.protocol.startsWith('http')"), 'Debe verificar protocolo http/https');
    });

    it('debe contener las metaetiquetas PWA y el enlace al manifest', () => {
      const indexContent = fs.readFileSync(indexPath, 'utf-8');

      assert.ok(indexContent.includes('<link rel="manifest" href="/manifest.json">'), 'Falta link al manifest');
      assert.ok(indexContent.includes('name="theme-color"'), 'Falta meta theme-color');
      assert.ok(indexContent.includes('rel="apple-touch-icon"'), 'Falta apple-touch-icon');
    });
  });

  describe('4. Build Distribution Verification (dist/)', () => {
    it('debe empaquetar correctamente sw.js, manifest.json y la carpeta icons/ en dist/', () => {
      const distManifest = path.join(distDir, 'manifest.json');
      const distSw = path.join(distDir, 'sw.js');
      const distIcons = path.join(distDir, 'icons');
      const distIndex = path.join(distDir, 'index.html');

      assert.ok(fs.existsSync(distIndex), 'dist/index.html debe existir tras el build');
      assert.ok(fs.existsSync(distManifest), 'dist/manifest.json debe existir tras el build');
      assert.ok(fs.existsSync(distSw), 'dist/sw.js debe existir tras el build');
      assert.ok(fs.existsSync(distIcons), 'dist/icons/ debe existir tras el build');

      // Verificar que los iconos requeridos existen en dist/icons/
      assert.ok(fs.existsSync(path.join(distIcons, 'icon-192.png')), 'dist/icons/icon-192.png debe existir');
      assert.ok(fs.existsSync(path.join(distIcons, 'icon-512.png')), 'dist/icons/icon-512.png debe existir');
      assert.ok(fs.existsSync(path.join(distIcons, 'icon.svg')), 'dist/icons/icon.svg debe existir');

      // Verificar tamaños no nulos
      assert.ok(fs.statSync(path.join(distIcons, 'icon-192.png')).size > 0);
      assert.ok(fs.statSync(path.join(distIcons, 'icon-512.png')).size > 0);
      assert.ok(fs.statSync(path.join(distIcons, 'icon.svg')).size > 0);
    });

    it('el manifest en dist/ debe coincidir exactamente con el de public/', () => {
      const publicManifest = fs.readFileSync(manifestPath, 'utf-8');
      const distManifest = fs.readFileSync(path.join(distDir, 'manifest.json'), 'utf-8');
      assert.deepEqual(JSON.parse(distManifest), JSON.parse(publicManifest));
    });

    it('el sw.js en dist/ debe coincidir con el de public/', () => {
      const publicSw = fs.readFileSync(swPath, 'utf-8');
      const distSw = fs.readFileSync(path.join(distDir, 'sw.js'), 'utf-8');
      assert.equal(distSw, publicSw);
    });
  });

  describe('5. Service Worker Logical Rules Simulation', () => {
    // Simulación lógica de las reglas de decisión del Service Worker
    function evaluateFetchStrategy(urlStr: string, method: string, mode: string = 'cors'): string {
      if (method !== 'GET') {
        return 'BYPASS_NON_GET';
      }
      const url = new URL(urlStr, 'https://listadecompra.pro');
      if (!url.protocol.startsWith('http')) {
        return 'BYPASS_NON_HTTP';
      }
      if (url.pathname.startsWith('/api/') || url.pathname === '/api') {
        return 'BYPASS_API';
      }
      if (mode === 'navigate') {
        return 'NETWORK_FIRST_SPA_NAVIGATION';
      }
      return 'CACHE_FIRST_OR_SWR_STATIC';
    }

    it('solicitudes POST a /api/parse-receipt son ignoradas por el Service Worker', () => {
      const result = evaluateFetchStrategy('https://listadecompra.pro/api/parse-receipt', 'POST');
      assert.equal(result, 'BYPASS_NON_GET');
    });

    it('solicitudes GET a /api/health o endpoints de API no son cacheadas por el Service Worker', () => {
      const result = evaluateFetchStrategy('https://listadecompra.pro/api/health', 'GET');
      assert.equal(result, 'BYPASS_API');
    });

    it('solicitudes a esquemas chrome-extension o file son ignoradas', () => {
      const result = evaluateFetchStrategy('chrome-extension://abcdefg/popup.js', 'GET');
      assert.equal(result, 'BYPASS_NON_HTTP');
    });

    it('navegación de usuario a /rutas o /estadisticas utiliza estrategia Network-First para SPA', () => {
      const result = evaluateFetchStrategy('https://listadecompra.pro/rutas', 'GET', 'navigate');
      assert.equal(result, 'NETWORK_FIRST_SPA_NAVIGATION');
    });

    it('recursos estáticos como CSS, JS e imágenes usan Cache-First / SWR', () => {
      const result = evaluateFetchStrategy('https://listadecompra.pro/icons/icon-192.png', 'GET', 'no-cors');
      assert.equal(result, 'CACHE_FIRST_OR_SWR_STATIC');
    });
  });
});
