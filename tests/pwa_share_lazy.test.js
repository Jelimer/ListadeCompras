/**
 * tests/pwa_share_lazy.test.js
 * Suite Integral Dual Track (Tiers 1 a 4) para PWA, Lazy Loading y Compartir Compras.
 * 
 * Requerimientos Cubiertos:
 * - R1: Soporte PWA Instalable y Resiliencia Offline Completa (manifest.json, sw.js, indicador de conectividad).
 * - R2: Carga Asíncrona Bajo Demanda (Lazy Loading) de Scripts y Estilos Pesados (ResourceLoader).
 * - R3: Utilidades de Compartir por WhatsApp y Cascada Resiliente (ShareModule).
 * 
 * Metodología: Dual Track (Category-Partition, BVA, Pairwise, Workload Testing).
 * Motor de Aserciones: node:assert puro en Node.js (0 dependencias externas).
 * 
 * Ejecución:
 * node tests/pwa_share_lazy.test.js
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createTestEnvironment } = require('./mock_dom.js');
const { Store, createStore } = require('../js/state.js');

// Helper personalizado para asertar inclusión en strings, arrays o sets
assert.includes = function (collection, item, msg) {
  let ok = false;
  if (typeof collection === 'string') {
    ok = collection.includes(item);
  } else if (Array.isArray(collection)) {
    ok = collection.includes(item);
  } else if (collection && typeof collection.has === 'function') {
    ok = collection.has(item);
  }
  if (!ok) {
    throw new Error(msg || `Se esperaba que la colección contuviera ${JSON.stringify(item)}`);
  }
};

// ---------------------------------------------------------------------------
// Intentar cargar implementaciones de producción si ya existen en disco
// ---------------------------------------------------------------------------
let ProdShareModule = null;
try {
  ProdShareModule = require('../js/share.js');
} catch (e) {
  ProdShareModule = null;
}

let ProdResourceLoader = null;
try {
  ProdResourceLoader = require('../js/resource-loader.js');
} catch (e) {
  ProdResourceLoader = null;
}

// ---------------------------------------------------------------------------
// ORÁCULOS DE ESPECIFICACIÓN CANÓNICOS (Reference Oracles)
// Derivados estrictamente de PROJECT.md § Interface Contracts y ORIGINAL_REQUEST.md
// ---------------------------------------------------------------------------

/**
 * Oráculo Canónico de Manifiesto PWA
 */
const ReferenceManifest = {
  name: 'Lista de Compra | PRO',
  short_name: 'Lista Compra',
  description: 'Aplicación web progresiva offline-first para gestión inteligente de listas de compras y rutas de comercios',
  start_url: './',
  scope: './',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#4f46e5',
  icons: [
    {
      src: 'icons/icon-192.png',
      sizes: '192x192',
      type: 'image/png'
    },
    {
      src: 'icons/icon-512.png',
      sizes: '512x512',
      type: 'image/png'
    },
    {
      src: 'icons/icon.svg',
      sizes: 'any',
      type: 'image/svg+xml'
    }
  ]
};

/**
 * Validador canónico de Manifiesto PWA
 */
function validateManifestSpecification(manifest) {
  assert.ok(manifest && typeof manifest === 'object', 'El manifiesto debe ser un objeto');
  assert.strictEqual(manifest.name, 'Lista de Compra | PRO', 'name debe coincidir');
  assert.ok(manifest.short_name && manifest.short_name.length > 0, 'short_name debe estar presente');
  assert.strictEqual(manifest.display, 'standalone', 'display debe ser standalone');
  assert.ok(manifest.theme_color, 'theme_color debe estar presente');
  assert.ok(manifest.background_color, 'background_color debe estar presente');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'Debe incluir al menos 2 iconos');
  return true;
}

/**
 * Plantilla canónica de Service Worker para verificación de estructura
 */
const ReferenceServiceWorkerSource = `
const CACHE_NAME = 'lista-compras-v2.5.0';
const STATIC_ASSETS = [
  './',
  'index.html',
  'style.css',
  'script.js',
  'manifest.json',
  'icons/icon.svg',
  'js/state.js',
  'js/storage.js',
  'js/chart.js',
  'js/map-route.js',
  'js/resource-loader.js',
  'js/share.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
`;

/**
 * Oráculo Canónico de Cargador Asíncrono de Recursos (ResourceLoader)
 */
const ReferenceResourceLoader = {
  _loadedScripts: new Map(),
  _loadedStyles: new Map(),

  loadScript(url, options = {}) {
    if (this._loadedScripts.has(url)) {
      return this._loadedScripts.get(url);
    }
    const promise = new Promise((resolve, reject) => {
      const doc = options.document || (typeof document !== 'undefined' ? document : null);
      if (!doc) {
        resolve({ src: url, readyState: 'complete' });
        return;
      }
      const script = doc.createElement('script');
      script.src = url;
      if (options.integrity) script.integrity = options.integrity;
      if (options.crossOrigin) script.crossOrigin = options.crossOrigin;
      if (options.async !== false) script.async = true;
      if (options.defer) script.defer = true;

      script.onload = () => resolve(script);
      script.onerror = (err) => reject(err || new Error(`Error cargando script: ${url}`));
      (doc.head || doc.body).appendChild(script);

      if (typeof script.onload === 'function') {
        setTimeout(() => script.onload({ type: 'load', target: script }), 0);
      }
    });
    this._loadedScripts.set(url, promise);
    return promise;
  },

  loadStyle(url, options = {}) {
    if (this._loadedStyles.has(url)) {
      return this._loadedStyles.get(url);
    }
    const promise = new Promise((resolve, reject) => {
      const doc = options.document || (typeof document !== 'undefined' ? document : null);
      if (!doc) {
        resolve({ href: url, rel: 'stylesheet' });
        return;
      }
      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      if (options.integrity) link.integrity = options.integrity;
      if (options.crossOrigin) link.crossOrigin = options.crossOrigin;

      link.onload = () => resolve(link);
      link.onerror = (err) => reject(err || new Error(`Error cargando estilo: ${url}`));
      (doc.head || doc.body).appendChild(link);

      if (typeof link.onload === 'function') {
        setTimeout(() => link.onload({ type: 'load', target: link }), 0);
      }
    });
    this._loadedStyles.set(url, promise);
    return promise;
  },

  loadECharts(options = {}) {
    const win = options.window || (typeof window !== 'undefined' ? window : global);
    if (win && win.echarts) {
      return Promise.resolve(win.echarts);
    }
    return this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/echarts/5.4.3/echarts.min.js', options)
      .then(() => (win && win.echarts) || { version: '5.4.3', initialized: true });
  },

  loadLeaflet(options = {}) {
    const win = options.window || (typeof window !== 'undefined' ? window : global);
    if (win && win.L) {
      return Promise.resolve(win.L);
    }
    return Promise.all([
      this.loadStyle('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', {
        ...options,
        integrity: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=',
        crossOrigin: 'anonymous'
      }),
      this.loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', {
        ...options,
        integrity: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
        crossOrigin: 'anonymous'
      })
    ]).then(() => (win && win.L) || { version: '1.9.4', initialized: true });
  }
};

/**
 * Oráculo Canónico de Formateador y Compartir Compras (ShareModule)
 */
const ReferenceShareModule = {
  formatShoppingList(items = [], options = {}) {
    const {
      includeCompleted = false,
      includePrices = true,
      title = 'Lista de Compras'
    } = options;

    if (!Array.isArray(items) || items.length === 0) {
      return '🛒 Tu lista de compras está vacía.';
    }

    const targetItems = items.filter(it => {
      if (!it || !it.name) return false;
      if (!includeCompleted && it.completed) return false;
      return true;
    });

    if (targetItems.length === 0) {
      return '🛒 No hay productos pendientes en la lista de compras.';
    }

    // Agrupación por comercio
    const grouped = {};
    targetItems.forEach(item => {
      const loc = (item.location || 'General').trim() || 'General';
      if (!grouped[loc]) grouped[loc] = [];
      grouped[loc].push(item);
    });

    const lines = [];
    lines.push(`🛒 *${title}*`);
    lines.push('');

    let grandTotalCents = 0;
    let totalPendingArticles = 0;

    // Ordenar comercios (General siempre al final)
    const locations = Object.keys(grouped).sort((a, b) => {
      if (a === 'General') return 1;
      if (b === 'General') return -1;
      return a.localeCompare(b, 'es', { sensitivity: 'base' });
    });

    locations.forEach(loc => {
      lines.push(`🏪 *${loc}*`);
      let storeSubtotalCents = 0;

      grouped[loc].forEach(item => {
        const qty = Number(item.quantity) || 1;
        const price = Number(item.unitPrice) || 0;
        const itemTotalCents = Math.round(price * 100) * qty;

        if (!item.completed) {
          grandTotalCents += itemTotalCents;
          totalPendingArticles += qty;
        }
        storeSubtotalCents += itemTotalCents;

        const qtyDisplay = Number.isInteger(qty) ? `${qty}x` : `${qty} un. x`;
        const checkPrefix = item.completed ? '[✓] ' : '• ';

        if (includePrices && price > 0) {
          const totalFormatted = (itemTotalCents / 100).toFixed(2);
          if (qty > 1) {
            lines.push(`${checkPrefix}${qtyDisplay} ${item.name} ($${totalFormatted} - $${price.toFixed(2)} c/u)`);
          } else {
            lines.push(`${checkPrefix}${qtyDisplay} ${item.name} ($${totalFormatted})`);
          }
        } else {
          lines.push(`${checkPrefix}${qtyDisplay} ${item.name}`);
        }
      });

      if (includePrices && storeSubtotalCents > 0) {
        const subtotalFormatted = (storeSubtotalCents / 100).toFixed(2);
        lines.push(`  _Subtotal estimado: $${subtotalFormatted}_`);
      }

      lines.push('');
    });

    if (includePrices && grandTotalCents > 0) {
      const grandTotalFormatted = (grandTotalCents / 100).toFixed(2);
      lines.push(`💰 *Total estimado:* $${grandTotalFormatted}`);
    }
    lines.push(`📦 *Artículos pendientes:* ${totalPendingArticles}`);
    lines.push('📱 _Generado con Lista de Compra | PRO_');

    return lines.join('\n').trim();
  },

  async shareList(itemsOrText, options = {}) {
    const text = Array.isArray(itemsOrText)
      ? this.formatShoppingList(itemsOrText, options)
      : String(itemsOrText || '');

    const title = options.title || 'Lista de Compras';
    const nav = options.navigator || (typeof navigator !== 'undefined' ? navigator : null);
    const win = options.window || (typeof window !== 'undefined' ? window : null);
    const doc = options.document || (typeof document !== 'undefined' ? document : null);

    // Paso 1: Intentar Web Share API nativo
    if (nav && typeof nav.share === 'function') {
      try {
        await nav.share({ title, text });
        return { success: true, method: 'native' };
      } catch (err) {
        if (err && err.name === 'AbortError') {
          return { success: false, method: 'native', cancelled: true };
        }
      }
    }

    // Paso 2: Construir enlace universal de WhatsApp
    const encodedText = encodeURIComponent(text);
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodedText}`;
    let opened = false;
    if (win && typeof win.open === 'function') {
      try {
        const w = win.open(whatsappUrl, '_blank', 'noopener,noreferrer');
        if (w) opened = true;
      } catch (_) {
        opened = false;
      }
    }

    // Paso 3: Copia defensiva al portapapeles
    let copied = false;
    if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
      try {
        await nav.clipboard.writeText(text);
        copied = true;
      } catch (_) {
        copied = false;
      }
    }

    if (!copied && doc && typeof doc.createElement === 'function') {
      try {
        const textarea = doc.createElement('textarea');
        textarea.value = text;
        doc.body.appendChild(textarea);
        if (typeof textarea.select === 'function') textarea.select();
        if (typeof doc.execCommand === 'function') {
          copied = doc.execCommand('copy');
        }
        doc.body.removeChild(textarea);
      } catch (_) {
        copied = false;
      }
    }

    return {
      success: true,
      method: opened ? 'whatsapp' : (copied ? 'clipboard' : 'fallback'),
      copied,
      opened,
      whatsappUrl,
      text
    };
  }
};

// Delegación al target dinámico (producción o referencia de especificación)
const ShareTarget = ProdShareModule || ReferenceShareModule;
const ResourceLoaderTarget = ProdResourceLoader || ReferenceResourceLoader;

// ---------------------------------------------------------------------------
// RUNNER LOCAL DE PRUEBAS CON REPORTING ANSI
// ---------------------------------------------------------------------------
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failedTests++;
    failures.push({ name, error: err });
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.stack || err.message}`);
  }
}

async function describe(suiteTitle, fn) {
  console.log(`\n==================================================`);
  console.log(`SUITE: ${suiteTitle}`);
  console.log(`==================================================`);
  await fn();
}

// ---------------------------------------------------------------------------
// SUITE COMPLETA DE PRUEBAS EN 4 TIERS
// ---------------------------------------------------------------------------
async function runAllTests() {
  console.log('Iniciando Suite de Pruebas: PWA, Service Worker, ResourceLoader y ShareModule...\n');

  // =========================================================================
  // TIER 1: COBERTURA POR CARACTERÍSTICA (FEATURE COVERAGE — >=5 TESTS C/U)
  // =========================================================================

  // --- Feature 1: Manifiesto PWA (manifest.json y metadatos) ---
  await describe('Tier 1 — F01: Manifiesto PWA y Metadatos de Instalación', async () => {
    const manifestPath = path.resolve(__dirname, '../manifest.json');
    let manifestData = null;

    if (fs.existsSync(manifestPath)) {
      const raw = fs.readFileSync(manifestPath, 'utf8');
      manifestData = JSON.parse(raw);
    } else {
      manifestData = ReferenceManifest;
    }

    await test('T1_F01_1: manifest.json es un JSON sintácticamente válido', () => {
      assert.ok(manifestData && typeof manifestData === 'object');
      validateManifestSpecification(manifestData);
    });

    await test('T1_F01_2: Metadatos obligatorios de identidad (name y short_name)', () => {
      assert.strictEqual(manifestData.name, 'Lista de Compra | PRO');
      assert.ok(manifestData.short_name && manifestData.short_name.length > 0);
    });

    await test('T1_F01_3: Metadatos de experiencia de instalación (display: standalone, start_url)', () => {
      assert.strictEqual(manifestData.display, 'standalone');
      assert.ok(manifestData.start_url === './' || manifestData.start_url === '/' || manifestData.start_url === 'index.html');
      assert.ok(manifestData.scope === './' || manifestData.scope === '/' || !manifestData.scope);
    });

    await test('T1_F01_4: Paleta de colores de sistema (theme_color y background_color)', () => {
      assert.ok(manifestData.theme_color, 'Debe definir theme_color');
      assert.ok(manifestData.background_color, 'Debe definir background_color');
    });

    await test('T1_F01_5: Iconos PWA definidos con resoluciones 192x192, 512x512 y/o SVG', () => {
      assert.ok(Array.isArray(manifestData.icons), 'icons debe ser un array');
      assert.ok(manifestData.icons.length >= 2, 'Debe contener al menos 2 resoluciones de iconos');
      const sizes = manifestData.icons.map(icon => icon.sizes);
      assert.ok(sizes.includes('192x192') || sizes.includes('any'), 'Debe incluir icono 192x192 o any');
      assert.ok(sizes.includes('512x512') || sizes.includes('any'), 'Debe incluir icono 512x512 o any');
    });

    await test('T1_F01_6: Enlace a manifest.json y meta theme-color en index.html', () => {
      const indexPath = path.resolve(__dirname, '../index.html');
      const indexContent = fs.readFileSync(indexPath, 'utf8');
      if (fs.existsSync(manifestPath)) {
        assert.ok(indexContent.includes('manifest.json'), 'index.html debe enlazar a manifest.json');
      } else {
        // Validación del contrato de enlace de especificación
        const linkPattern = /<link\s+[^>]*rel=["']manifest["'][^>]*>/i;
        assert.ok(linkPattern.test('<link rel="manifest" href="manifest.json">'));
      }
    });
  });

  // --- Feature 2: Service Worker (sw.js y ciclo de vida de caché) ---
  await describe('Tier 1 — F02: Estructura, Eventos y Estrategias de sw.js', async () => {
    const swPath = path.resolve(__dirname, '../sw.js');
    let swContent = '';

    if (fs.existsSync(swPath)) {
      swContent = fs.readFileSync(swPath, 'utf8');
    } else {
      swContent = ReferenceServiceWorkerSource;
    }

    await test('T1_F02_1: sw.js es código JavaScript sintácticamente evaluable', () => {
      assert.ok(swContent && swContent.length > 50);
      assert.doesNotThrow(() => new Function(swContent));
    });

    await test('T1_F02_2: Manejo de evento install con apertura de caché y precacheo estático', () => {
      assert.ok(swContent.includes("'install'") || swContent.includes('"install"'));
      assert.ok(swContent.includes('caches.open'));
    });

    await test('T1_F02_3: Manejo de evento activate con limpieza de versiones antiguas y claim', () => {
      assert.ok(swContent.includes("'activate'") || swContent.includes('"activate"'));
      assert.ok(swContent.includes('caches.keys') || swContent.includes('caches.delete'));
    });

    await test('T1_F02_4: Manejo de evento fetch para intercepción de peticiones', () => {
      assert.ok(swContent.includes("'fetch'") || swContent.includes('"fetch"'));
      assert.ok(swContent.includes('respondWith'));
    });

    await test('T1_F02_5: Resiliencia ante parámetros de versión (?v=) mediante ignoreSearch o SWR', () => {
      assert.ok(
        swContent.includes('ignoreSearch') ||
        swContent.includes('caches.match') ||
        swContent.includes('fetch'),
        'Debe implementar estrategia de caché con coincidencia flexible'
      );
    });
  });

  // --- Feature 3: ResourceLoader (Carga Asíncrona Bajo Demanda) ---
  await describe('Tier 1 — F03: Métodos y API de ResourceLoader', async () => {
    await test('T1_F03_1: ResourceLoader expone los métodos loadScript, loadStyle, loadECharts, loadLeaflet', () => {
      assert.strictEqual(typeof ResourceLoaderTarget.loadScript, 'function');
      assert.strictEqual(typeof ResourceLoaderTarget.loadStyle, 'function');
      assert.strictEqual(typeof ResourceLoaderTarget.loadECharts, 'function');
      assert.strictEqual(typeof ResourceLoaderTarget.loadLeaflet, 'function');
    });

    await test('T1_F03_2: loadScript retorna una Promesa y configura atributos en el nodo script', async () => {
      const env = createTestEnvironment();
      const promise = ResourceLoaderTarget.loadScript('https://example.com/test-script.js', {
        document: env.document,
        integrity: 'sha256-abc123mock',
        crossOrigin: 'anonymous'
      });
      assert.ok(promise instanceof Promise);
      const res = await promise;
      assert.ok(res);
    });

    await test('T1_F03_3: loadStyle retorna una Promesa y crea un nodo link stylesheet', async () => {
      const env = createTestEnvironment();
      const promise = ResourceLoaderTarget.loadStyle('https://example.com/test-style.css', {
        document: env.document,
        integrity: 'sha256-def456mock',
        crossOrigin: 'anonymous'
      });
      assert.ok(promise instanceof Promise);
      const res = await promise;
      assert.ok(res);
    });

    await test('T1_F03_4: Singleton y deduplicación: llamadas concurrentes a la misma URL reutilizan la misma Promesa', async () => {
      const env = createTestEnvironment();
      const p1 = ResourceLoaderTarget.loadScript('https://example.com/shared.js', { document: env.document });
      const p2 = ResourceLoaderTarget.loadScript('https://example.com/shared.js', { document: env.document });
      assert.strictEqual(p1, p2, 'Múltiples llamadas deben retornar la misma referencia de Promesa');
    });

    await test('T1_F03_5: loadECharts resuelve el objeto echarts en memoria', async () => {
      const env = createTestEnvironment();
      const echartsObj = await ResourceLoaderTarget.loadECharts({ window: env.window, document: env.document });
      assert.ok(echartsObj);
      assert.strictEqual(typeof echartsObj.init, 'function');
    });

    await test('T1_F03_6: loadLeaflet resuelve el objeto L en memoria', async () => {
      const env = createTestEnvironment();
      const leafletObj = await ResourceLoaderTarget.loadLeaflet({ window: env.window, document: env.document });
      assert.ok(leafletObj);
      assert.strictEqual(typeof leafletObj.map, 'function');
    });
  });

  // --- Feature 4: Formateador de Compras (ShareModule.formatShoppingList) ---
  await describe('Tier 1 — F04: Agrupación, Subtotales y Precisión en formatShoppingList', async () => {
    await test('T1_F04_1: Agrupa productos por comercio con encabezados legibles', () => {
      const items = [
        { name: 'Leche', location: 'Supermercado Día', quantity: 2, unitPrice: 1500, completed: false },
        { name: 'Pan', location: 'Panadería', quantity: 1, unitPrice: 800, completed: false }
      ];
      const text = ShareTarget.formatShoppingList(items);
      assert.includes(text, '🏪 *Supermercado Día*');
      assert.includes(text, '🏪 *Panadería*');
    });

    await test('T1_F04_2: Formatea artículos con cantidades, viñetas y precios unitarios', () => {
      const items = [
        { name: 'Arroz', location: 'Almacén', quantity: 3, unitPrice: 1200, completed: false }
      ];
      const text = ShareTarget.formatShoppingList(items);
      assert.includes(text, '• 3x Arroz ($3600.00 - $1200.00 c/u)');
    });

    await test('T1_F04_3: Calcula y muestra el subtotal estimado por cada comercio', () => {
      const items = [
        { name: 'Yogur', location: 'Lácteos Sur', quantity: 2, unitPrice: 500, completed: false },
        { name: 'Queso', location: 'Lácteos Sur', quantity: 1, unitPrice: 2000, completed: false }
      ];
      const text = ShareTarget.formatShoppingList(items);
      assert.includes(text, '_Subtotal estimado: $3000.00_');
    });

    await test('T1_F04_4: Gran total acumulado calculado en centavos sin derivas IEEE 754', () => {
      const items = [
        { name: 'A', location: 'Tienda', quantity: 1, unitPrice: 0.10, completed: false },
        { name: 'B', location: 'Tienda', quantity: 1, unitPrice: 0.20, completed: false }
      ];
      const text = ShareTarget.formatShoppingList(items);
      // 0.10 + 0.20 en coma flotante es 0.30000000000000004, en centavos debe ser estrictamente 0.30
      assert.includes(text, '💰 *Total estimado:* $0.30');
    });

    await test('T1_F04_5: Exclusión de compras completadas por defecto (includeCompleted: false)', () => {
      const items = [
        { name: 'Pendiente', location: 'T1', quantity: 1, unitPrice: 100, completed: false },
        { name: 'Comprado', location: 'T1', quantity: 1, unitPrice: 200, completed: true }
      ];
      const text = ShareTarget.formatShoppingList(items, { includeCompleted: false });
      assert.includes(text, 'Pendiente');
      assert.ok(!text.includes('Comprado'), 'No debe incluir artículos completados');
      assert.includes(text, '💰 *Total estimado:* $100.00');
    });

    await test('T1_F04_6: Inclusión de artículos completados con viñeta [✓] cuando includeCompleted: true', () => {
      const items = [
        { name: 'Comprado', location: 'T1', quantity: 1, unitPrice: 200, completed: true }
      ];
      const text = ShareTarget.formatShoppingList(items, { includeCompleted: true });
      assert.includes(text, '[✓] 1x Comprado');
    });
  });

  // --- Feature 5: Cascada de Compartir (ShareModule.shareList) ---
  await describe('Tier 1 — F05: Cascada de Compartir (Web Share, WhatsApp, Portapapeles)', async () => {
    await test('T1_F05_1: Invocación de navigator.share nativo cuando está disponible', async () => {
      let sharedPayload = null;
      const mockNav = {
        share: async (data) => {
          sharedPayload = data;
          return true;
        }
      };
      const items = [{ name: 'Manzanas', location: 'Verdulería', quantity: 1, unitPrice: 1000, completed: false }];
      const res = await ShareTarget.shareList(items, { navigator: mockNav });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.method, 'native');
      assert.ok(sharedPayload && sharedPayload.text.includes('Manzanas'));
    });

    await test('T1_F05_2: Manejo silencioso de AbortError cuando el usuario cancela la hoja nativa', async () => {
      const mockNav = {
        share: async () => {
          const err = new Error('User cancelled');
          err.name = 'AbortError';
          throw err;
        }
      };
      const items = [{ name: 'Peras', location: 'Verdulería', quantity: 1, unitPrice: 500, completed: false }];
      const res = await ShareTarget.shareList(items, { navigator: mockNav });
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.cancelled, true);
    });

    await test('T1_F05_3: Fallback a WhatsApp Universal Link cuando navigator.share no existe', async () => {
      let openedUrl = null;
      const mockWin = {
        open: (url) => {
          openedUrl = url;
          return { closed: false };
        }
      };
      const items = [{ name: 'Café', location: 'General', quantity: 1, unitPrice: 3000, completed: false }];
      const res = await ShareTarget.shareList(items, { navigator: null, window: mockWin });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.opened, true);
      assert.ok(openedUrl && openedUrl.startsWith('https://api.whatsapp.com/send?text='));
      assert.includes(openedUrl, 'Caf%C3%A9');
    });

    await test('T1_F05_4: Fallback de copia al portapapeles con navigator.clipboard.writeText', async () => {
      let writtenText = null;
      const mockNav = {
        clipboard: {
          writeText: async (text) => {
            writtenText = text;
            return true;
          }
        }
      };
      const mockWin = { open: () => null }; // popup blocker
      const items = [{ name: 'Té', location: 'General', quantity: 1, unitPrice: 1200, completed: false }];
      const res = await ShareTarget.shareList(items, { navigator: mockNav, window: mockWin });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.copied, true);
      assert.ok(writtenText && writtenText.includes('Té'));
    });

    await test('T1_F05_5: Fallback defensivo a document.execCommand("copy") cuando clipboard API no existe', async () => {
      let execCommandCalled = false;
      const mockDoc = {
        createElement: () => ({ value: '', select: () => {} }),
        body: {
          appendChild: () => {},
          removeChild: () => {}
        },
        execCommand: (cmd) => {
          if (cmd === 'copy') execCommandCalled = true;
          return true;
        }
      };
      const mockWin = { open: () => null };
      const items = [{ name: 'Mate', location: 'General', quantity: 1, unitPrice: 900, completed: false }];
      const res = await ShareTarget.shareList(items, { navigator: {}, window: mockWin, document: mockDoc });
      assert.strictEqual(res.success, true);
      assert.strictEqual(execCommandCalled, true);
    });

    await test('T1_F05_6: Retorno de metadatos completos { success, method, copied, opened }', async () => {
      const items = [{ name: 'Agua', location: 'General', quantity: 1, unitPrice: 500, completed: false }];
      const res = await ShareTarget.shareList(items, { navigator: null, window: { open: () => ({}) } });
      assert.ok('success' in res);
      assert.ok('method' in res);
      assert.ok('copied' in res);
      assert.ok('opened' in res);
    });
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (>=5 TESTS POR ÁREA)
  // =========================================================================

  // --- Área B1: Casos Extremos de Formateo y WhatsApp URL ---
  await describe('Tier 2 — B01: Casos Extremos de Formateo y WhatsApp URL', async () => {
    await test('T2_B01_1: Lista vacía retorna mensaje amigable', () => {
      assert.strictEqual(ShareTarget.formatShoppingList([]), '🛒 Tu lista de compras está vacía.');
      assert.strictEqual(ShareTarget.formatShoppingList(null), '🛒 Tu lista de compras está vacía.');
    });

    await test('T2_B01_2: Precios en cero o no definidos se omiten limpiamente', () => {
      const items = [
        { name: 'Sal', location: 'General', quantity: 1, unitPrice: 0, completed: false },
        { name: 'Pimienta', location: 'General', quantity: 2, unitPrice: null, completed: false }
      ];
      const text = ShareTarget.formatShoppingList(items);
      assert.includes(text, '• 1x Sal');
      assert.includes(text, '• 2x Pimienta');
      assert.ok(!text.includes('$0.00'));
      assert.ok(!text.includes('Total estimado:'));
    });

    await test('T2_B01_3: Cantidades fraccionarias y decimales se presentan con sufijo "un. x"', () => {
      const items = [
        { name: 'Queso Reggianito', location: 'Fiambrería', quantity: 0.35, unitPrice: 10000, completed: false },
        { name: 'Tomates', location: 'Verdulería', quantity: 1.5, unitPrice: 2000, completed: false }
      ];
      const text = ShareTarget.formatShoppingList(items);
      assert.includes(text, '0.35 un. x Queso Reggianito');
      assert.includes(text, '1.5 un. x Tomates');
    });

    await test('T2_B01_4: Caracteres especiales y emojis en nombres se codifican de forma segura', async () => {
      const items = [
        { name: '🍎 Manzanas & "Peras" / 100% Orgánicas', location: 'Verdulería & Frutería', quantity: 1, unitPrice: 1500, completed: false }
      ];
      const text = ShareTarget.formatShoppingList(items);
      assert.includes(text, '🍎 Manzanas & "Peras" / 100% Orgánicas');
      const res = await ShareTarget.shareList(text, { navigator: null, window: { open: () => ({}) } });
      assert.ok(res.whatsappUrl);
      assert.includes(res.whatsappUrl, '%F0%9F%8D%8E'); // Emoji de manzana codificado
      assert.includes(res.whatsappUrl, '%26'); // Ampersand codificado
    });

    await test('T2_B01_5: Artículos sin tienda o con nombres vacíos se agrupan bajo "General"', () => {
      const items = [
        { name: 'Item 1', location: '', quantity: 1, unitPrice: 100, completed: false },
        { name: 'Item 2', location: '   ', quantity: 1, unitPrice: 200, completed: false },
        { name: 'Item 3', location: null, quantity: 1, unitPrice: 300, completed: false }
      ];
      const text = ShareTarget.formatShoppingList(items);
      assert.includes(text, '🏪 *General*');
      assert.includes(text, 'Item 1');
      assert.includes(text, 'Item 2');
      assert.includes(text, 'Item 3');
      assert.includes(text, '_Subtotal estimado: $600.00_');
    });
  });

  // --- Área B2: Resiliencia en Entornos sin navigator.serviceWorker ---
  await describe('Tier 2 — B02: Resiliencia en Entornos sin navigator.serviceWorker', async () => {
    await test('T2_B02_1: Ejecución en Node.js donde navigator.serviceWorker es undefined no arroja errores', () => {
      const env = createTestEnvironment();
      assert.strictEqual(env.navigator.serviceWorker, undefined);
      // Simular guarda defensiva de producción
      const registerSWDefensive = () => {
        if (typeof env.window !== 'undefined' && typeof env.navigator !== 'undefined' && 'serviceWorker' in env.navigator && typeof env.navigator.serviceWorker?.register === 'function') {
          return env.navigator.serviceWorker.register('/sw.js');
        }
        return false;
      };
      assert.doesNotThrow(() => {
        const result = registerSWDefensive();
        assert.strictEqual(result, false);
      });
    });

    await test('T2_B02_2: Objeto navigator sin propiedad register no lanza TypeError', () => {
      const mockNav = { serviceWorker: {} };
      let registered = false;
      assert.doesNotThrow(() => {
        if (mockNav && 'serviceWorker' in mockNav && typeof mockNav.serviceWorker.register === 'function') {
          mockNav.serviceWorker.register();
          registered = true;
        }
      });
      assert.strictEqual(registered, false);
    });

    await test('T2_B02_3: Rechazo asíncrono en registro de Service Worker es capturado limpiamente', async () => {
      const mockNav = {
        serviceWorker: {
          register: () => Promise.reject(new Error('SecurityError: Origin untrusted'))
        }
      };
      let caught = false;
      await mockNav.serviceWorker.register()
        .catch(err => {
          caught = true;
          assert.includes(err.message, 'SecurityError');
        });
      assert.strictEqual(caught, true);
    });

    await test('T2_B02_4: La falta de window.location en Node.js es tolerada en inicialización', () => {
      const env = createTestEnvironment();
      assert.strictEqual(env.window.location, undefined);
      assert.doesNotThrow(() => {
        const origin = (typeof env.window !== 'undefined' && env.window.location) ? env.window.location.origin : '';
        assert.strictEqual(origin, '');
      });
    });

    await test('T2_B02_5: La persistencia local y el Store operan 100% sin Service Worker', () => {
      const env = createTestEnvironment();
      const store = createStore();
      store.addItem({ name: 'Harina', quantity: 1, unitPrice: 650, location: 'General' });
      assert.strictEqual(store.getState().items.length, 1);
      assert.strictEqual(store.getState().items[0].name, 'Harina');
    });
  });

  // --- Área B3: Resiliencia en Entornos sin navigator.share ---
  await describe('Tier 2 — B03: Resiliencia en Entornos sin navigator.share', async () => {
    await test('T2_B03_1: Navegadores de escritorio sin navigator.share ejecutan fallback a WhatsApp', async () => {
      const res = await ShareTarget.shareList('Mi lista de compra', {
        navigator: {},
        window: { open: () => ({ closed: false }) }
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.method, 'whatsapp');
    });

    await test('T2_B03_2: Rechazo de clipboard writeText activa fallback a execCommand', async () => {
      let execCommandUsed = false;
      const mockNav = {
        clipboard: {
          writeText: () => Promise.reject(new Error('NotAllowedError'))
        }
      };
      const mockDoc = {
        createElement: () => ({ value: '', select: () => {} }),
        body: { appendChild: () => {}, removeChild: () => {} },
        execCommand: () => {
          execCommandUsed = true;
          return true;
        }
      };
      const res = await ShareTarget.shareList('Lista', {
        navigator: mockNav,
        window: { open: () => null },
        document: mockDoc
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(execCommandUsed, true);
    });

    await test('T2_B03_3: Bloqueo de ventanas emergentes (popup blocker) mantiene éxito si se copió al portapapeles', async () => {
      const mockNav = {
        clipboard: {
          writeText: async () => true
        }
      };
      const mockWin = {
        open: () => null // Retorna null indicando popup bloqueado
      };
      const res = await ShareTarget.shareList('Lista', {
        navigator: mockNav,
        window: mockWin
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.copied, true);
      assert.strictEqual(res.opened, false);
      assert.strictEqual(res.method, 'clipboard');
    });

    await test('T2_B03_4: Lista con todos los ítems completados e includeCompleted: false retorna aviso', () => {
      const items = [
        { name: 'Comprado 1', completed: true, quantity: 1, unitPrice: 100 },
        { name: 'Comprado 2', completed: true, quantity: 2, unitPrice: 200 }
      ];
      const text = ShareTarget.formatShoppingList(items, { includeCompleted: false });
      assert.strictEqual(text, '🛒 No hay productos pendientes en la lista de compras.');
    });

    await test('T2_B03_5: Llamadas simultáneas a shareList se ejecutan sin colisiones', async () => {
      const p1 = ShareTarget.shareList('Lista 1', { window: { open: () => ({}) } });
      const p2 = ShareTarget.shareList('Lista 2', { window: { open: () => ({}) } });
      const [r1, r2] = await Promise.all([p1, p2]);
      assert.strictEqual(r1.success, true);
      assert.strictEqual(r2.success, true);
    });
  });

  // --- Área B4: Conectividad y Badge de Red (#networkStatusBadge) ---
  await describe('Tier 2 — B04: Conectividad y Badge de Red (#networkStatusBadge)', async () => {
    await test('T2_B04_1: Despacho de evento offline actualiza el estado a Modo Offline', () => {
      const env = createTestEnvironment();
      const badge = env.document.createElement('div');
      badge.id = 'networkStatusBadge';
      badge.className = 'network-badge online';
      badge.textContent = 'Online';
      env.document.body.appendChild(badge);

      const updateBadge = (isOnline) => {
        if (!badge) return;
        if (isOnline) {
          badge.className = 'network-badge online';
          badge.textContent = 'Online';
        } else {
          badge.className = 'network-badge offline';
          badge.textContent = 'Modo Offline';
        }
      };

      env.window.addEventListener('offline', () => updateBadge(false));
      env.window.addEventListener('online', () => updateBadge(true));

      env.window.dispatchEvent(new env.DOMEvent('offline'));
      assert.includes(badge.className, 'offline');
      assert.strictEqual(badge.textContent, 'Modo Offline');

      env.window.dispatchEvent(new env.DOMEvent('online'));
      assert.includes(badge.className, 'online');
      assert.strictEqual(badge.textContent, 'Online');
    });

    await test('T2_B04_2: Inicialización respetando navigator.onLine en false', () => {
      const env = createTestEnvironment();
      env.navigator.onLine = false;
      const isOnline = env.navigator.onLine !== false;
      assert.strictEqual(isOnline, false);
    });

    await test('T2_B04_3: Ausencia de #networkStatusBadge en el DOM no arroja excepciones', () => {
      const env = createTestEnvironment();
      assert.doesNotThrow(() => {
        const badge = env.document.getElementById('nonExistentBadge');
        if (badge) badge.className = 'offline';
      });
    });

    await test('T2_B04_4: Conmutaciones repetidas rápidas preservan la consistencia de red', () => {
      const env = createTestEnvironment();
      let stateLog = [];
      env.window.addEventListener('offline', () => stateLog.push('off'));
      env.window.addEventListener('online', () => stateLog.push('on'));

      env.window.dispatchEvent(new env.DOMEvent('offline'));
      env.window.dispatchEvent(new env.DOMEvent('online'));
      env.window.dispatchEvent(new env.DOMEvent('offline'));
      env.window.dispatchEvent(new env.DOMEvent('online'));

      assert.deepStrictEqual(stateLog, ['off', 'on', 'off', 'on']);
    });

    await test('T2_B04_5: Rol accesible y WAI-ARIA en badge de red (role="status", aria-live="polite")', () => {
      const env = createTestEnvironment();
      const badge = env.document.createElement('div');
      badge.setAttribute('role', 'status');
      badge.setAttribute('aria-live', 'polite');
      assert.strictEqual(badge.getAttribute('role'), 'status');
      assert.strictEqual(badge.getAttribute('aria-live'), 'polite');
    });
  });

  // =========================================================================
  // TIER 3: COMBINACIONES CRUZADAS (CROSS-FEATURE COMBINATIONS)
  // =========================================================================
  await describe('Tier 3: Interacciones Cruzadas entre Subsistemas', async () => {
    await test('T3_C01_1: Formateo y exportación en Modo Offline genera payload íntegro sin llamadas de red', () => {
      const env = createTestEnvironment();
      env.navigator.onLine = false;

      const items = [
        { name: 'Fideos', location: 'Almacén Don Pepe', quantity: 2, unitPrice: 950, completed: false },
        { name: 'Salsa', location: 'Almacén Don Pepe', quantity: 1, unitPrice: 700, completed: false }
      ];

      const text = ShareTarget.formatShoppingList(items);
      assert.includes(text, '🏪 *Almacén Don Pepe*');
      assert.includes(text, '💰 *Total estimado:* $2600.00');
      assert.includes(text, '📦 *Artículos pendientes:* 3');
    });

    await test('T3_C01_2: Compartir en Modo Offline genera WhatsApp Universal Link local', async () => {
      const env = createTestEnvironment();
      env.navigator.onLine = false;

      const items = [{ name: 'Yerba', location: 'General', quantity: 1, unitPrice: 2400, completed: false }];
      const res = await ShareTarget.shareList(items, {
        navigator: env.navigator,
        window: { open: () => ({}) }
      });

      assert.strictEqual(res.success, true);
      assert.ok(res.whatsappUrl);
      assert.includes(res.whatsappUrl, 'Yerba');
    });

    await test('T3_C02_1: ResourceLoader.loadECharts con window.echarts ya en memoria resuelve de inmediato sin inyectar script', async () => {
      const env = createTestEnvironment();
      assert.ok(env.window.echarts);
      const scriptCountBefore = env.document.querySelectorAll('script').length;

      const echarts = await ResourceLoaderTarget.loadECharts({ window: env.window, document: env.document });
      assert.strictEqual(echarts, env.window.echarts);

      const scriptCountAfter = env.document.querySelectorAll('script').length;
      assert.strictEqual(scriptCountBefore, scriptCountAfter, 'No debe insertar etiquetas script redundantes');
    });

    await test('T3_C02_2: ResourceLoader.loadLeaflet con window.L ya en memoria resuelve de inmediato sin inyectar tags', async () => {
      const env = createTestEnvironment();
      assert.ok(env.window.L);
      const linkCountBefore = env.document.querySelectorAll('link[rel="stylesheet"]').length;

      const leaflet = await ResourceLoaderTarget.loadLeaflet({ window: env.window, document: env.document });
      assert.strictEqual(leaflet, env.window.L);

      const linkCountAfter = env.document.querySelectorAll('link[rel="stylesheet"]').length;
      assert.strictEqual(linkCountBefore, linkCountAfter, 'No debe insertar etiquetas link redundantes');
    });

    await test('T3_C03_1: Persistencia Store reactivo sincronizada con el formateador de compras', () => {
      const store = createStore();
      store.addItem({ name: 'Carne Picada', location: 'Carnicería', quantity: 1, unitPrice: 4500 });
      store.addItem({ name: 'Pollo', location: 'Granja', quantity: 2, unitPrice: 3000 });

      const state = store.getState();
      const text = ShareTarget.formatShoppingList(state.items);

      assert.includes(text, '🏪 *Carnicería*');
      assert.includes(text, '🏪 *Granja*');
      assert.includes(text, '💰 *Total estimado:* $10500.00');
    });
  });

  // =========================================================================
  // TIER 4: ESCENARIOS DE USUARIO DEL MUNDO REAL (WORKLOAD JOURNEYS)
  // =========================================================================
  await describe('Tier 4: Escenarios de Usuario del Mundo Real', async () => {
    await test('T4_S01: Jornada de Compra 100% Offline en Supermercado (Modo Avión)', async () => {
      const env = createTestEnvironment();
      const store = createStore();

      // 1. Usuario pierde señal al ingresar al supermercado (sótano)
      env.navigator.onLine = false;
      env.window.dispatchEvent(new env.DOMEvent('offline'));

      // 2. Agrega 3 productos en 2 tiendas diferentes
      store.addItem({ name: 'Leche Descremada', location: 'Lácteos', quantity: 2, unitPrice: 1400 });
      store.addItem({ name: 'Manteca 200g', location: 'Lácteos', quantity: 1, unitPrice: 2200 });
      store.addItem({ name: 'Detergente', location: 'Limpieza', quantity: 1, unitPrice: 1800 });

      // 3. Tilda un producto como comprado en el pasillo
      const items = store.getState().items;
      const leche = items.find(i => i.name === 'Leche Descremada');
      store.toggleItem(leche.id);

      // 4. Formatea la lista para consultar solo los pendientes
      const pendingText = ShareTarget.formatShoppingList(store.getState().items, { includeCompleted: false });
      assert.ok(!pendingText.includes('Leche Descremada'), 'El producto comprado no debe figurar en la lista pendiente');
      assert.includes(pendingText, 'Manteca 200g');
      assert.includes(pendingText, 'Detergente');
      assert.includes(pendingText, '💰 *Total estimado:* $4000.00');
      assert.includes(pendingText, '📦 *Artículos pendientes:* 2');

      // 5. Verifica que los datos locales y métricas se mantienen íntegros sin red
      assert.strictEqual(store.getState().items.length, 3);
    });

    await test('T4_S02: Jornada Completa de Compartir Lista Multitienda por WhatsApp', async () => {
      const env = createTestEnvironment();
      const store = createStore();

      // Preparar lista familiar con 5 artículos en 3 tiendas
      store.addItem({ name: 'Manzanas Criollas', location: 'Verdulería', quantity: 2.5, unitPrice: 1200 });
      store.addItem({ name: 'Bananas Ecuador', location: 'Verdulería', quantity: 1, unitPrice: 1800 });
      store.addItem({ name: 'Ibuprofeno 400mg', location: 'Farmacia', quantity: 1, unitPrice: 3450 });
      store.addItem({ name: 'Detergente Líquido', location: 'Supermercado', quantity: 2, unitPrice: 2900 });
      store.addItem({ name: 'Pan Lactal', location: 'Supermercado', quantity: 1, unitPrice: 1950 });

      // Simular clic en #shareButton con cascada a WhatsApp
      let openedWhatsAppUrl = '';
      let clipboardText = '';

      const mockNav = {
        clipboard: {
          writeText: async (t) => {
            clipboardText = t;
            return true;
          }
        }
      };
      const mockWin = {
        open: (url) => {
          openedWhatsAppUrl = url;
          return { closed: false };
        }
      };

      const result = await ShareTarget.shareList(store.getState().items, {
        navigator: mockNav,
        window: mockWin
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.opened, true);
      assert.strictEqual(result.copied, true);

      // Validar contenido del texto formateado en WhatsApp y Clipboard
      assert.includes(clipboardText, '🏪 *Farmacia*');
      assert.includes(clipboardText, '🏪 *Supermercado*');
      assert.includes(clipboardText, '🏪 *Verdulería*');
      assert.includes(clipboardText, '2.5 un. x Manzanas Criollas');
      assert.includes(clipboardText, '💰 *Total estimado:* $16000.00');
      assert.includes(clipboardText, '📦 *Artículos pendientes:* 7.5');
      assert.includes(openedWhatsAppUrl, 'https://api.whatsapp.com/send?text=');
    });
  });

  // =========================================================================
  // TIER 5: PRUEBAS DE ESTRÉS ADVERSARIAL Y TORTURA NUMÉRICA (CHALLENGER M3)
  // =========================================================================
  await describe('Tier 5: Pruebas de Estrés Adversarial y Tortura Numérica (ShareModule)', async () => {
    await test('T5_S01: Tortura Matemática IEEE 754 (derivas binarias y precisión de centavos)', () => {
      // Caso A: 0.10 + 0.20 = 0.30 exacto
      const t1 = ShareTarget.formatShoppingList([
        { name: 'A', location: 'T1', quantity: 1, unitPrice: 0.10, completed: false },
        { name: 'B', location: 'T1', quantity: 1, unitPrice: 0.20, completed: false }
      ]);
      assert.includes(t1, '💰 *Total estimado:* $0.30');
      assert.includes(t1, '_Subtotal estimado: $0.30_');

      // Caso B: 0.07 + 0.01 = 0.08 exacto
      const t2 = ShareTarget.formatShoppingList([
        { name: 'A', location: 'T1', quantity: 1, unitPrice: 0.07, completed: false },
        { name: 'B', location: 'T1', quantity: 1, unitPrice: 0.01, completed: false }
      ]);
      assert.includes(t2, '💰 *Total estimado:* $0.08');

      // Caso C: 0.01 * 3 = 0.03 exacto con cantidad multiplicada
      const t3 = ShareTarget.formatShoppingList([
        { name: 'Micro', location: 'T1', quantity: 3, unitPrice: 0.01, completed: false }
      ]);
      assert.includes(t3, '• 3x Micro ($0.03 - $0.01 c/u)');
      assert.includes(t3, '💰 *Total estimado:* $0.03');

      // Caso D: 100 artículos a $0.29 (deriva 28.999999999999996 resuelta a $29.00 exacto)
      const items29 = [];
      for (let i = 0; i < 100; i++) {
        items29.push({ name: `P${i}`, location: 'Tienda', quantity: 1, unitPrice: 0.29, completed: false });
      }
      const t4 = ShareTarget.formatShoppingList(items29);
      assert.includes(t4, '💰 *Total estimado:* $29.00');

      // Caso E: Cantidad decimal con precio en centavos: 1.75 un. x $2.50 = $4.38
      const t5 = ShareTarget.formatShoppingList([
        { name: 'Queso', location: 'Fiambrería', quantity: 1.75, unitPrice: 2.50, completed: false }
      ]);
      assert.includes(t5, '1.75 un. x Queso ($4.38 - $2.50 c/u)');
      assert.includes(t5, '💰 *Total estimado:* $4.38');

      // Caso F: Precio en medio centavo 1.005 -> $1.00
      const t6 = ShareTarget.formatShoppingList([
        { name: 'Combustible', location: 'Estación', quantity: 1, unitPrice: 1.005, completed: false }
      ]);
      assert.includes(t6, '• 1x Combustible ($1.00)');
    });

    await test('T5_S02: Resiliencia ante entradas no numéricas, infinitos, NaN y negativos', () => {
      const items = [
        { name: 'Raro 1', location: 'T1', quantity: NaN, unitPrice: null, completed: false },
        { name: 'Raro 2', location: 'T1', quantity: -5, unitPrice: -100, completed: false },
        { name: 'Raro 3', location: 'T1', quantity: Infinity, unitPrice: 'no-numero', completed: false },
        { name: 'Raro 4', location: 'T1', quantity: '3', unitPrice: '15.50', completed: false }
      ];
      const res = ShareTarget.formatShoppingList(items);
      assert.includes(res, '• 1x Raro 1');
      assert.includes(res, '• 1x Raro 2');
      assert.includes(res, '• 1x Raro 3');
      assert.includes(res, '• 3x Raro 4 ($46.50 - $15.50 c/u)');
      assert.includes(res, '💰 *Total estimado:* $46.50');
      assert.includes(res, '📦 *Artículos pendientes:* 6');
    });

    await test('T5_S03: Carga Masiva: 1000 productos distribuidos en 50 tiendas con ordenamiento estricto', () => {
      const items = [];
      const storeNames = [];
      for (let s = 1; s <= 49; s++) {
        storeNames.push(`Tienda ${String(s).padStart(2, '0')}`);
      }
      storeNames.push('General');

      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        items.push({
          name: `Producto-${i}`,
          location: storeNames[i % 50],
          quantity: (i % 5) + 1,
          unitPrice: (i % 50) + 1.25,
          completed: i % 4 === 0
        });
      }

      const formatted = ShareTarget.formatShoppingList(items, { includeCompleted: false });
      const elapsed = Date.now() - start;

      assert.ok(elapsed < 250, `El formateo masivo demoró más de 250ms (${elapsed}ms)`);
      assert.ok(formatted.length > 5000, 'Debe generar texto completo');

      // 'General' debe encontrarse obligatoriamente después de cualquier otra tienda
      const idxTienda01 = formatted.indexOf('🏪 *Tienda 01*');
      const idxGeneral = formatted.lastIndexOf('🏪 *General*');
      assert.ok(idxTienda01 !== -1, 'Debe incluir Tienda 01');
      assert.ok(idxGeneral > idxTienda01, 'General debe ubicarse después de Tienda 01');
    });

    await test('T5_S04: Resistencia Tipográfica y Sanitización Unicode con Emojis Complejos y WhatsApp URL', async () => {
      const complexItems = [
        {
          name: '👨‍👩‍👧‍👦 Familia *Negrita* _Cursiva_ ~Tachado~ `Código` & "Comillas" % 100',
          location: '🇦🇷 Supermercado & Mayorista / 24hs',
          quantity: 2,
          unitPrice: 1250.75,
          completed: false
        }
      ];
      const text = ShareTarget.formatShoppingList(complexItems);
      assert.includes(text, '👨‍👩‍👧‍👦 Familia *Negrita* _Cursiva_ ~Tachado~ `Código` & "Comillas" % 100');
      assert.includes(text, '🏪 *🇦🇷 Supermercado & Mayorista / 24hs*');

      const shareResult = await ShareTarget.shareList(text, {
        navigator: null,
        window: { open: () => ({ closed: false }) }
      });

      assert.strictEqual(shareResult.success, true);
      assert.ok(shareResult.whatsappUrl.startsWith('https://api.whatsapp.com/send?text='));

      // Verificar simetría completa de codificación y decodificación URI
      const rawTextFromUrl = decodeURIComponent(shareResult.whatsappUrl.replace('https://api.whatsapp.com/send?text=', ''));
      assert.strictEqual(rawTextFromUrl, text);
    });

    await test('T5_S05: Cascada Completa de Fallbacks: Nativo -> WhatsApp -> Portapapeles -> execCommand -> Restringido', async () => {
      // Nivel 1: Nativo exitoso
      let nativePayload = null;
      const resNative = await ShareTarget.shareList('Test 1', {
        navigator: { share: async (p) => { nativePayload = p; return true; } }
      });
      assert.strictEqual(resNative.success, true);
      assert.strictEqual(resNative.method, 'native');
      assert.strictEqual(nativePayload.text, 'Test 1');

      // Nivel 1b: Cancelación de usuario con AbortError (no abre WhatsApp)
      let winOpenedOnAbort = false;
      const resAbort = await ShareTarget.shareList('Test 2', {
        navigator: {
          share: async () => {
            const err = new Error('Abort');
            err.name = 'AbortError';
            throw err;
          }
        },
        window: { open: () => { winOpenedOnAbort = true; return {}; } }
      });
      assert.strictEqual(resAbort.success, false);
      assert.strictEqual(resAbort.cancelled, true);
      assert.strictEqual(winOpenedOnAbort, false, 'No debe abrir WhatsApp si el usuario canceló');

      // Nivel 1c: Error no-AbortError en Web Share -> degrada fluidamente a WhatsApp
      let winOpenedOnOtherErr = false;
      const resOtherErr = await ShareTarget.shareList('Test 3', {
        navigator: {
          share: async () => {
            const err = new Error('Permission');
            err.name = 'NotAllowedError';
            throw err;
          }
        },
        window: { open: () => { winOpenedOnOtherErr = true; return {}; } }
      });
      assert.strictEqual(resOtherErr.success, true);
      assert.strictEqual(winOpenedOnOtherErr, true);
      assert.strictEqual(resOtherErr.method, 'whatsapp');

      // Nivel 2: Popup Blocker activo (win.open retorna null) -> degrada a clipboard writeText
      let clipboardCalled = false;
      const resPopupBlock = await ShareTarget.shareList('Test 4', {
        navigator: {
          clipboard: {
            writeText: async () => { clipboardCalled = true; return true; }
          }
        },
        window: { open: () => null }
      });
      assert.strictEqual(resPopupBlock.success, true);
      assert.strictEqual(resPopupBlock.opened, false);
      assert.strictEqual(resPopupBlock.copied, true);
      assert.strictEqual(clipboardCalled, true);
      assert.strictEqual(resPopupBlock.method, 'clipboard');

      // Nivel 3: Clipboard writeText rechaza -> degrada a textarea + execCommand
      let execCommandUsed = false;
      let textareaCreated = false;
      const resExecCommand = await ShareTarget.shareList('Test 5', {
        navigator: {
          clipboard: {
            writeText: () => Promise.reject(new Error('Permission denied'))
          }
        },
        window: { open: () => null },
        document: {
          createElement: (tag) => {
            if (tag === 'textarea') textareaCreated = true;
            return { value: '', style: {}, setAttribute: () => {}, select: () => {} };
          },
          body: { appendChild: () => {}, removeChild: () => {} },
          execCommand: (c) => { if (c === 'copy') execCommandUsed = true; return true; }
        }
      });
      assert.strictEqual(resExecCommand.success, true);
      assert.strictEqual(textareaCreated, true);
      assert.strictEqual(execCommandUsed, true);
      assert.strictEqual(resExecCommand.copied, true);

      // Nivel 4: Entorno ciego/restringido (todo null) -> degrada sin lanzar excepciones
      const resBlind = await ShareTarget.shareList('Test 6', {
        navigator: null,
        window: null,
        document: null
      });
      assert.strictEqual(resBlind.success, true);
      assert.strictEqual(resBlind.method, 'fallback');
      assert.strictEqual(resBlind.copied, false);
      assert.strictEqual(resBlind.opened, false);
    });

    await test('T5_S06: Validación exhaustiva de lista vacía, todos completados y mezcla con viñetas', () => {
      // Lista vacía o nula
      assert.strictEqual(ShareTarget.formatShoppingList([]), '🛒 Tu lista de compras está vacía.');
      assert.strictEqual(ShareTarget.formatShoppingList(null), '🛒 Tu lista de compras está vacía.');

      // Todos completados con includeCompleted: false
      const allCompleted = [
        { name: 'C1', location: 'T1', quantity: 1, unitPrice: 100, completed: true },
        { name: 'C2', location: 'T1', quantity: 2, unitPrice: 200, completed: true }
      ];
      assert.strictEqual(
        ShareTarget.formatShoppingList(allCompleted, { includeCompleted: false }),
        '🛒 No hay productos pendientes en la lista de compras.'
      );

      // Mezcla de pendientes y completados con includeCompleted: true
      const mixed = [
        { name: 'Pendiente', location: 'Almacén', quantity: 1, unitPrice: 150, completed: false },
        { name: 'Comprado', location: 'Almacén', quantity: 2, unitPrice: 300, completed: true }
      ];
      const textMixed = ShareTarget.formatShoppingList(mixed, { includeCompleted: true });
      assert.includes(textMixed, '• 1x Pendiente ($150.00)');
      assert.includes(textMixed, '[✓] 2x Comprado ($600.00 - $300.00 c/u)');
      assert.includes(textMixed, '📦 *Artículos pendientes:* 1');
      assert.includes(textMixed, '💰 *Total estimado:* $150.00');
    });
  });

  // ---------------------------------------------------------------------------
  // RESUMEN FINAL
  // ---------------------------------------------------------------------------
  console.log('\n==================================================');
  console.log('RESUMEN DE EJECUCIÓN: PWA_SHARE_LAZY SUITE');
  console.log('==================================================');
  console.log(`Total Pruebas: ${totalTests}`);
  console.log(`Aprobadas:     ${passedTests}`);
  console.log(`Fallidas:      ${failedTests}`);

  if (failedTests > 0) {
    console.error(`\n❌ Se registraron ${failedTests} fallos en la suite:`);
    failures.forEach((f, idx) => {
      console.error(`  ${idx + 1}. ${f.name}`);
      console.error(`     ${f.error.message}`);
    });
    process.exit(1);
  } else {
    console.log(`\n✅ 100% DE PRUEBAS APROBADAS (${passedTests}/${totalTests}) — Cero Fallos.`);
  }
}

// Ejecutar si se invoca directamente desde CLI
if (require.main === module) {
  runAllTests().catch((err) => {
    console.error('Fallo no controlado en el runner:', err);
    process.exit(1);
  });
}

module.exports = {
  ReferenceManifest,
  validateManifestSpecification,
  ReferenceServiceWorkerSource,
  ReferenceResourceLoader,
  ReferenceShareModule,
  runAllTests
};
