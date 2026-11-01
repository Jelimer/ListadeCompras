import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {
  formatCurrency,
  formatMoney,
  formatNumber,
  parseLocaleNumber,
} from '../src/utils/formatters';
import {
  haversineDistance,
  calculateUrbanDistance,
  calculateEstimatedMinutes,
  generateGoogleMapsUrl,
  calculateOptimalRoute,
  fetchOSRMRoute,
} from '../src/utils/mapRoute';
import {
  DEFAULT_ORIGIN,
  formatSkuCode,
  parseSeqFromSku,
  ensureSequentialSkus,
  getNextSequentialSku,
  sanitizeShoppingItem,
  loadStoredItems,
  saveStoredItems,
  loadStoredBudget,
  saveStoredBudget,
  loadStoredTheme,
  saveStoredTheme,
  loadStoredLayout,
  saveStoredLayout,
  loadStoredHideEmptyStores,
  saveStoredHideEmptyStores,
  loadStoredLocationOrder,
  saveStoredLocationOrder,
  loadStoredCollapsedGroups,
  saveStoredCollapsedGroups,
  normalizeStoreKey,
  loadStoredCoordinates,
  saveStoreCoordinate,
  removeStoreCoordinate,
  loadStoredOrigin,
  saveStoredOrigin,
  loadStoredTripsData,
  saveStoredTripsData,
  loadStoredReceipts,
  saveStoredReceipts,
} from '../src/utils/storage';
import { ShoppingItem, RouteOrigin, RouteStop } from '../src/types';

describe('M5 Final Empirical Challenger: Domain & PWA Stress Suite', () => {
  // =========================================================================
  // 1. ESTRÉS DE PERSISTENCIA OFFLINE (LOCALSTORAGE SATURADO O BLOQUEADO)
  // =========================================================================
  describe('1. Estrés de Persistencia Offline y Resiliencia de Almacenamiento', () => {
    const originalWindow = (globalThis as unknown as { window?: unknown }).window;

    afterEach(() => {
      if (originalWindow !== undefined) {
        (globalThis as unknown as { window: unknown }).window = originalWindow;
      } else {
        delete (globalThis as unknown as { window?: unknown }).window;
      }
    });

    it('1.1 Maneja QuotaExceededError en setItem degradando a fallback en memoria sin lanzar excepción', () => {
      const mockStorage = new Map<string, string>();
      const windowMock = {
        localStorage: {
          getItem: (key: string) => mockStorage.get(key) ?? null,
          setItem: () => {
            const err = new Error('The quota has been exceeded.');
            err.name = 'QuotaExceededError';
            throw err;
          },
          removeItem: (key: string) => mockStorage.delete(key),
          clear: () => mockStorage.clear(),
        },
      };

      (globalThis as unknown as { window: unknown }).window = windowMock;

      const items: ShoppingItem[] = [
        {
          id: 'item_quota_1',
          name: 'Café Grano 1kg',
          quantity: 2,
          unitPrice: 4500,
          location: 'Supermercado',
          category: 'Almacén',
          completed: false,
          timestamp: 1000,
          updatedAt: 1000,
        },
      ];

      // saveStoredItems no debe lanzar excepción a pesar de la saturación de cuota
      assert.doesNotThrow(() => {
        saveStoredItems(items);
      });

      // safeGet debe recuperar los datos desde memoryFallback
      const recovered = loadStoredItems();
      assert.strictEqual(recovered.length, 1);
      assert.strictEqual(recovered[0].name, 'Café Grano 1kg');
      assert.strictEqual(recovered[0].unitPrice, 4500);

      // Persistencia de presupuesto bajo cuota saturada
      assert.doesNotThrow(() => {
        saveStoredBudget(75000);
      });
      assert.strictEqual(loadStoredBudget(), 75000);
    });

    it('1.2 Sobrevive en modo estricto privado/sandbox donde todo acceso a localStorage arroja SecurityError', () => {
      const windowMock = {
        get localStorage(): Storage {
          const err = new Error('Access is denied for this document.');
          err.name = 'SecurityError';
          throw err;
        },
      };

      (globalThis as unknown as { window: unknown }).window = windowMock;

      // Lecturas seguras devuelven valores predeterminados sin fallar
      assert.doesNotThrow(() => {
        const items = loadStoredItems();
        assert.ok(Array.isArray(items));
        const origin = loadStoredOrigin();
        assert.strictEqual(origin.lat, DEFAULT_ORIGIN.lat);
        const trips = loadStoredTripsData();
        assert.ok(trips.trips.length > 0);
      });

      // Escrituras seguras redirigen a memoria sin propagar SecurityError
      assert.doesNotThrow(() => {
        saveStoredBudget(25000);
        saveStoredTheme('dark');
        saveStoredLayout('grid');
        saveStoredHideEmptyStores(true);
        saveStoredLocationOrder(['Comercio 1', 'Comercio 2']);
        saveStoredCollapsedGroups(['Comercio 1']);
      });

      assert.strictEqual(loadStoredBudget(), 25000);
      assert.strictEqual(loadStoredTheme(), 'dark');
      assert.strictEqual(loadStoredLayout(), 'grid');
      assert.strictEqual(loadStoredHideEmptyStores(), true);
      assert.deepStrictEqual(loadStoredLocationOrder(), ['Comercio 1', 'Comercio 2']);
      assert.deepStrictEqual(loadStoredCollapsedGroups(), ['Comercio 1']);
    });

    it('1.3 Neutraliza payloads corruptos, cadenas inválidas y ataques de prototipo en JSON almacenado', () => {
      const corruptPayloads = [
        '{"invalid": json',
        'null',
        '12345',
        '"just a string"',
        '{"__proto__": {"polluted": true}}',
        '[{"id": null, "name": ""}]',
        '[]',
      ];

      for (const payload of corruptPayloads) {
        const mockStorage = new Map<string, string>([['shopping_items', payload]]);
        const windowMock = {
          localStorage: {
            getItem: (key: string) => mockStorage.get(key) ?? null,
            setItem: (key: string, val: string) => mockStorage.set(key, val),
          },
        };
        (globalThis as unknown as { window: unknown }).window = windowMock;

        assert.doesNotThrow(() => {
          const loaded = loadStoredItems();
          assert.ok(Array.isArray(loaded));
        });
      }
    });

    it('1.4 Rendimiento y resiliencia de procesamiento con gran volumen de artículos (5.000 items)', () => {
      const largeItems: ShoppingItem[] = Array.from({ length: 5000 }, (_, i) => ({
        id: `bulk_${i}`,
        name: `Producto de prueba ${i}`,
        quantity: (i % 10) + 1,
        unitPrice: (i * 13.5) % 1000,
        location: `Tienda ${(i % 15) + 1}`,
        category: `Categoría ${(i % 8) + 1}`,
        completed: i % 2 === 0,
        timestamp: 1700000000000 + i,
        updatedAt: 1700000000000 + i,
      }));

      const start = performance.now();
      saveStoredItems(largeItems);
      const loaded = loadStoredItems();
      const elapsed = performance.now() - start;

      assert.strictEqual(loaded.length, 5000);
      assert.strictEqual(loaded[0].skuCode, '#001');
      assert.strictEqual(loaded[4999].skuCode, '#5000');
      assert.ok(elapsed < 200, `El procesamiento de 5000 items tardó ${elapsed}ms (límite: 200ms)`);
    });

    it('1.5 Garantiza consistencia en escrituras y lecturas de viajes y recibos con IDs duplicados o faltantes', () => {
      // Trips data con viajes vacíos o malformados
      const rawTripsData = {
        activeTripId: 'inexistente',
        trips: [
          null,
          { id: '', name: 'Viaje sin ID' },
          { id: 'trip_2', name: 'Viaje 2', includedStores: ['Tienda A'] },
        ],
      };

      const mockStorage = new Map<string, string>([
        ['shopping_trips_data', JSON.stringify(rawTripsData)],
      ]);
      const windowMock = {
        localStorage: {
          getItem: (key: string) => mockStorage.get(key) ?? null,
          setItem: (key: string, val: string) => mockStorage.set(key, val),
        },
      };
      (globalThis as unknown as { window: unknown }).window = windowMock;

      const trips = loadStoredTripsData();
      assert.ok(trips.trips.length > 0);
      assert.ok(trips.trips.some((t) => t.id === trips.activeTripId));
    });
  });

  // =========================================================================
  // 2. ESTRÉS DE CÁLCULO DE RUTAS TSP Y COORDENADAS
  // =========================================================================
  describe('2. Estrés de Cálculo de Rutas TSP y Casos Límite Geográficos', () => {
    const defaultOrigin = { ...DEFAULT_ORIGIN };

    it('2.1 Resuelve TSP determinísticamente ante múltiples comercios con coordenadas IDÉNTICAS', () => {
      // Simula 4 tiendas situadas exactamente en el mismo centro comercial o misma coordenada
      const identicalCoords = { lat: -27.468, lng: -58.832 };

      const items: ShoppingItem[] = [
        {
          id: '1',
          name: 'Remera',
          quantity: 1,
          unitPrice: 5000,
          location: 'Zara Mall',
          category: 'Ropa',
          completed: false,
          timestamp: 1,
          updatedAt: 1,
          storeCoords: identicalCoords,
        },
        {
          id: '2',
          name: 'Pantalón',
          quantity: 1,
          unitPrice: 8000,
          location: 'Levis Mall',
          category: 'Ropa',
          completed: false,
          timestamp: 2,
          updatedAt: 2,
          storeCoords: identicalCoords,
        },
        {
          id: '3',
          name: 'Zapatillas',
          quantity: 1,
          unitPrice: 15000,
          location: 'Adidas Mall',
          category: 'Calzado',
          completed: false,
          timestamp: 3,
          updatedAt: 3,
          storeCoords: identicalCoords,
        },
        {
          id: '4',
          name: 'Medias',
          quantity: 2,
          unitPrice: 800,
          location: 'Dexter Mall',
          category: 'Ropa',
          completed: false,
          timestamp: 4,
          updatedAt: 4,
          storeCoords: identicalCoords,
        },
      ];

      const result = calculateOptimalRoute(items, defaultOrigin);

      assert.strictEqual(result.orderedStops.length, 4);
      // Las paradas intermedias entre coordenadas idénticas deben tener distancia de tramo 0
      for (let i = 1; i < result.orderedStops.length; i++) {
        assert.strictEqual(
          result.orderedStops[i].stepDistanceKm,
          0,
          `El tramo ${i} entre tiendas con coords idénticas debe ser 0`
        );
      }

      // No debe generar distancias totales NaN ni infinitas
      assert.ok(!isNaN(result.totalDistanceKm));
      assert.ok(isFinite(result.totalDistanceKm));
      assert.ok(result.totalDistanceKm > 0);

      // Verificación de desempate alfabético determinista en paradas idénticas
      const stopNames = result.orderedStops.map((s) => s.storeName);
      assert.deepStrictEqual(stopNames, ['Adidas Mall', 'Dexter Mall', 'Levis Mall', 'Zara Mall']);
    });

    it('2.2 Maneja puntos geográficos extremos (polos norte/sur, antípodas y meridiano de 180°)', () => {
      // Polo Norte a Polo Sur: distancia debe aproximarse a semicircunferencia terrestre (~20.015 km)
      const northPole = { lat: 90, lng: 0 };
      const southPole = { lat: -90, lng: 0 };
      const poleDist = haversineDistance(northPole, southPole);
      assert.ok(
        Math.abs(poleDist - 20015) < 30,
        `Distancia entre polos esperada ~20.015km, obtenida: ${poleDist}`
      );

      // Cruce del Antimeridiano (+179.99999 a -179.99999 sobre el ecuador):
      // La distancia real es mínima (< 100 metros, no 40.000 km)
      const antimeridianWest = { lat: 0, lng: 179.9999 };
      const antimeridianEast = { lat: 0, lng: -179.9999 };
      const antiDist = haversineDistance(antimeridianWest, antimeridianEast);
      assert.ok(
        antiDist < 0.1,
        `Distancia a través del antimeridiano debe ser menor a 100m, obtenida: ${antiDist} km`
      );

      // Antípodas exactas (Ecuador lng 0 vs Ecuador lng 180): distancia debe ser ~20.015 km
      const antipodal1 = { lat: 0, lng: 0 };
      const antipodal2 = { lat: 0, lng: 180 };
      const antipodalDist = haversineDistance(antipodal1, antipodal2);
      assert.ok(
        Math.abs(antipodalDist - 20015) < 30,
        `Distancia antipodal esperada ~20.015km, obtenida: ${antipodalDist}`
      );

      // Comprobación de neutralización defensiva de entradas inválidas o nulas
      assert.strictEqual(haversineDistance({ lat: NaN, lng: 0 }, { lat: 0, lng: 0 }), 0);
      assert.strictEqual(haversineDistance(null as unknown as { lat: number; lng: number }, { lat: 0, lng: 0 }), 0);

      // Sanitización previa comprobada: sanitizeShoppingItem filtra coordenadas no finitas
      const badItem = sanitizeShoppingItem({
        name: 'Item Infinito',
        storeCoords: { lat: Infinity, lng: 0 },
      });
      assert.strictEqual(badItem?.storeCoords, undefined);
    });

    it('2.3 Resuelve rutas complejas con 50 tiendas en menos de 50ms (complejidad O(n^2))', () => {
      const items: ShoppingItem[] = Array.from({ length: 50 }, (_, i) => ({
        id: `stop_${i}`,
        name: `Artículo ${i}`,
        quantity: 1,
        unitPrice: 100,
        location: `Supermercado Local ${i + 1}`,
        category: 'Varios',
        completed: i % 4 === 0,
        timestamp: Date.now() + i,
        updatedAt: Date.now() + i,
      }));

      const start = performance.now();
      const result = calculateOptimalRoute(items, defaultOrigin);
      const duration = performance.now() - start;

      assert.strictEqual(result.allStops.length, 50);
      assert.ok(
        result.orderedStops.length > 0,
        'Debe haber paradas ordenadas para tiendas activas'
      );
      assert.ok(
        duration < 50,
        `El cálculo TSP para 50 tiendas tomó ${duration.toFixed(2)}ms (requisito < 50ms)`
      );
      assert.ok(result.totalDistanceKm > 0);
      assert.ok(result.estimatedDurationMinutes > 0);
      assert.ok(result.googleMapsUrl.includes('https://www.google.com/maps/dir/'));
    });

    it('2.4 Verificación de URL de Google Maps con límite de waypoints intermedias (máx 9)', () => {
      const manyStops: RouteStop[] = Array.from({ length: 15 }, (_, i) => ({
        storeName: `Tienda ${i + 1}`,
        lat: -27.46 - i * 0.001,
        lng: -58.83 - i * 0.001,
        address: `Calle ${i + 1}`,
        pendingItems: [],
        itemCount: 1,
        estimatedTotal: 100,
      }));

      const url = generateGoogleMapsUrl(defaultOrigin, manyStops);
      assert.ok(url.includes('origin='));
      assert.ok(url.includes('destination='));
      assert.ok(url.includes('waypoints='));

      const parsedUrl = new URL(url);
      const waypointsParam = parsedUrl.searchParams.get('waypoints') || '';
      const waypoints = waypointsParam.split('|');
      assert.ok(
        waypoints.length <= 9,
        `Google Maps no permite más de 9 waypoints en API estándar, obtenidas: ${waypoints.length}`
      );
    });

    it('2.5 fetchOSRMRoute ignora peticiones cuando todos los puntos son idénticos o lista está vacía', async () => {
      const emptyResult = await fetchOSRMRoute(defaultOrigin, []);
      assert.strictEqual(emptyResult, null);

      const identicalStop: RouteStop = {
        storeName: 'Misma Ubicación',
        lat: defaultOrigin.lat,
        lng: defaultOrigin.lng,
        address: 'Mismo lugar',
        pendingItems: [],
        itemCount: 1,
        estimatedTotal: 0,
      };
      const identicalResult = await fetchOSRMRoute(defaultOrigin, [identicalStop]);
      assert.strictEqual(identicalResult, null);
    });
  });

  // =========================================================================
  // 3. ESTRÉS DE FORMATEO MONETARIO (VALORES NULOS, NEGATIVOS Y BILLONES)
  // =========================================================================
  describe('3. Estrés de Formateo Monetario y Numérico', () => {
    it('3.1 Formatea de forma segura valores nulos, indefinidos, vacíos y no numéricos', () => {
      assert.strictEqual(formatMoney(null), '$0,00');
      assert.strictEqual(formatMoney(undefined), '$0,00');
      assert.strictEqual(formatMoney(''), '$0,00');
      assert.strictEqual(formatMoney('   '), '$0,00');
      assert.strictEqual(formatMoney(NaN), '$0,00');
      assert.strictEqual(formatMoney(Infinity), '$0,00');
      assert.strictEqual(formatMoney(-Infinity), '$0,00');
      assert.strictEqual(formatMoney('palabra_invalida'), '$0,00');

      assert.strictEqual(formatCurrency(null), '0,00');
      assert.strictEqual(formatCurrency(undefined), '0,00');
      assert.strictEqual(formatCurrency(NaN), '0,00');
      assert.strictEqual(formatCurrency(Infinity), '0,00');
    });

    it('3.2 Formatea valores negativos con signo anterior al símbolo peso (-$X.XXX,XX)', () => {
      // Cero estricto
      assert.strictEqual(formatMoney(0), '$0,00');

      // Negativos pequeños y decimales
      assert.strictEqual(formatMoney(-0.01), '-$0,01');
      assert.strictEqual(formatMoney(-0.5), '-$0,50');
      assert.strictEqual(formatMoney(-15.75), '-$15,75');

      // Negativos con miles
      assert.strictEqual(formatMoney(-1250.5), '-$1.250,50');
      assert.strictEqual(formatMoney(-9876543.21), '-$9.876.543,21');

      // Comprobación de que números negativos no duplican ni alteran el prefijo monetario
      const formatted = formatMoney(-500);
      assert.ok(!formatted.includes('$-'), 'No debe generar $-');
      assert.ok(!formatted.includes('--'), 'No debe generar --');
      assert.ok(formatted.startsWith('-$500,00'));
    });

    it('3.3 Formatea magnitudes extremas de miles de millones y billones (escala financiera)', () => {
      assert.strictEqual(formatMoney(1_000_000), '$1.000.000,00');
      assert.strictEqual(formatMoney(100_000_000.99), '$100.000.000,99');
      assert.strictEqual(formatMoney(1_000_000_000_000), '$1.000.000.000.000,00');
      assert.strictEqual(formatMoney(999_999_999_999_999.5), '$999.999.999.999.999,50');
    });

    it('3.4 Neutraliza de forma absoluta el bug visual de doble signo monetario ($$)', () => {
      const testValues = [0, 10, 1500, -250, 1000000];
      for (const val of testValues) {
        const out = formatMoney(val);
        assert.ok(!out.includes('$$'), `formatMoney(${val}) no debe contener doble '$$': ${out}`);
        const simulatedHeader = `${out}`;
        assert.ok(!simulatedHeader.includes('$$'));
      }
    });

    it('3.5 Parsea con robustez strings patológicos y formatos mezclados en parseLocaleNumber', () => {
      assert.strictEqual(parseLocaleNumber('1.250,50'), 1250.5);
      assert.strictEqual(parseLocaleNumber('  1.000.000,99  '), 1000000.99);
      assert.strictEqual(parseLocaleNumber('1,250.50'), 1250.5);
      assert.strictEqual(parseLocaleNumber('1250.50'), 1250.5);
      assert.strictEqual(parseLocaleNumber('$ 4.500,00'), 4500);
      assert.strictEqual(parseLocaleNumber('$$$ 750,25'), 750.25);
      assert.strictEqual(parseLocaleNumber('-$ 120,50'), -120.5);
      assert.strictEqual(parseLocaleNumber(''), 0);
      assert.strictEqual(parseLocaleNumber(null), 0);
      assert.strictEqual(parseLocaleNumber(undefined), 0);
      assert.strictEqual(parseLocaleNumber('invalido'), 0);
      assert.strictEqual(parseLocaleNumber('---'), 0);
    });
  });

  // =========================================================================
  // 4. VERIFICACIÓN DE AUSENCIA DE SCRIPTS DESTRUCTIVOS Y SHELL PWA
  // =========================================================================
  describe('4. Shell PWA Offline y Ausencia de Scripts Destructivos', () => {
    const rootDir = process.cwd();
    const indexHtmlPath = path.join(rootDir, 'index.html');
    const distIndexHtmlPath = path.join(rootDir, 'dist', 'index.html');
    const swPath = path.join(rootDir, 'public', 'sw.js');
    const manifestPath = path.join(rootDir, 'public', 'manifest.json');

    it('4.1 index.html y dist/index.html NO contienen scripts suicidas (caches.delete, unregister)', () => {
      assert.ok(fs.existsSync(indexHtmlPath), 'index.html debe existir en la raíz');
      const htmlContent = fs.readFileSync(indexHtmlPath, 'utf-8');

      assert.ok(!htmlContent.includes('caches.delete'), 'index.html NO debe invocar caches.delete');
      assert.ok(!htmlContent.includes('.unregister()'), 'index.html NO debe invocar .unregister()');
      assert.ok(
        !htmlContent.includes('getRegistrations'),
        'index.html NO debe eliminar registraciones de Service Worker'
      );

      assert.ok(
        htmlContent.includes("navigator.serviceWorker.register('/sw.js')"),
        'Debe registrar /sw.js'
      );
      assert.ok(
        htmlContent.includes("window.location.protocol.startsWith('http')"),
        'El registro de SW debe estar protegido contra protocolos no HTTP'
      );

      if (fs.existsSync(distIndexHtmlPath)) {
        const distHtml = fs.readFileSync(distIndexHtmlPath, 'utf-8');
        assert.ok(!distHtml.includes('caches.delete'), 'dist/index.html NO debe contener caches.delete');
        assert.ok(!distHtml.includes('.unregister()'), 'dist/index.html NO debe contener .unregister()');
      }
    });

    it('4.2 Todos los iconos y metadatos del manifest PWA están físicamente presentes y accesibles', () => {
      assert.ok(fs.existsSync(manifestPath), 'manifest.json debe existir');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

      assert.strictEqual(manifest.name, 'Lista de Compra | PRO');
      assert.strictEqual(manifest.display, 'standalone');
      assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3);

      for (const icon of manifest.icons) {
        const relativeIconPath = icon.src.replace(/^\//, '');
        const publicIconFile = path.join(rootDir, 'public', relativeIconPath);
        assert.ok(
          fs.existsSync(publicIconFile),
          `El archivo de icono ${icon.src} debe existir en public/`
        );
        const stats = fs.statSync(publicIconFile);
        assert.ok(stats.size > 0, `El icono ${icon.src} no debe estar vacío (tamaño: ${stats.size} bytes)`);
      }
    });

    it('4.3 Service Worker simula modo offline para navegación SPA y no intercepta rutas de API', async () => {
      assert.ok(fs.existsSync(swPath), 'public/sw.js debe existir');
      const swCode = fs.readFileSync(swPath, 'utf-8');

      const listeners: Record<string, Function> = {};
      const cacheStore = new Map<string, Response>();

      const mockCaches = {
        open: async () => ({
          addAll: async (assets: string[]) => {
            for (const asset of assets) {
              cacheStore.set(asset, new Response(`<!DOCTYPE html><html>Shell ${asset}</html>`, { status: 200 }));
            }
          },
          put: async (req: Request, res: Response) => {
            const url = typeof req === 'string' ? req : req.url;
            cacheStore.set(url, res);
          },
        }),
        match: async (req: { url?: string } | string) => {
          const urlStr = typeof req === 'string' ? req : req.url || '';
          const url = new URL(urlStr, 'http://127.0.0.1:3000');
          return cacheStore.get(url.pathname) || cacheStore.get(urlStr) || null;
        },
        keys: async () => ['old-cache-v0', 'lista-compra-cache-v1'],
        delete: async () => true,
      };

      const sandbox = {
        self: {
          addEventListener: (event: string, fn: Function) => {
            listeners[event] = fn;
          },
          skipWaiting: async () => {},
          clients: { claim: async () => {} },
        },
        caches: mockCaches,
        Response,
        URL,
        console,
        fetch: async (req: { url: string }) => {
          if (req.url.includes('offline-failure')) {
            throw new TypeError('Failed to fetch (offline)');
          }
          return new Response('Network OK', { status: 200 });
        },
      };

      vm.createContext(sandbox);
      vm.runInContext(swCode, sandbox);

      // 1. Simular evento install
      let installResolved = false;
      await new Promise<void>((resolve) => {
        listeners['install']({
          waitUntil: async (promise: Promise<unknown>) => {
            await promise;
            installResolved = true;
            resolve();
          },
        });
      });
      assert.ok(installResolved, 'El evento install del SW debe completar su pre-caching');

      // 2. Simular petición POST a /api/parse-receipt: debe ser ignorada por el SW
      let postIntercepted = false;
      listeners['fetch']({
        request: {
          method: 'POST',
          url: 'http://127.0.0.1:3000/api/parse-receipt',
          mode: 'cors',
        },
        respondWith: () => {
          postIntercepted = true;
        },
      });
      assert.strictEqual(postIntercepted, false, 'El SW NUNCA debe interceptar peticiones POST');

      // 3. Simular petición GET a /api/health: debe ser ignorada por el SW
      let apiGetIntercepted = false;
      listeners['fetch']({
        request: {
          method: 'GET',
          url: 'http://127.0.0.1:3000/api/health',
          mode: 'cors',
        },
        respondWith: () => {
          apiGetIntercepted = true;
        },
      });
      assert.strictEqual(apiGetIntercepted, false, 'El SW NUNCA debe interceptar rutas /api/*');

      // 4. Simular navegación SPA en modo avión (offline): debe responder con fallback 200 del shell
      let navigationResponse: Response | null = null;
      await new Promise<void>((resolve) => {
        listeners['fetch']({
          request: {
            method: 'GET',
            url: 'http://127.0.0.1:3000/offline-failure/rutas',
            mode: 'navigate',
          },
          respondWith: async (promise: Promise<Response>) => {
            navigationResponse = await promise;
            resolve();
          },
        });
      });

      assert.ok(navigationResponse !== null, 'Debe haber respondido con una respuesta');
      assert.strictEqual((navigationResponse as Response).status, 200);
      const text = await (navigationResponse as Response).text();
      assert.ok(text.includes('Shell /index.html') || text.includes('Shell /'));
    });
  });
});
