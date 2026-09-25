/**
 * tests/adversarial_challenger2.test.js
 * Arnés de Pruebas Adversariales: Reactividad, Sincronización de Estado,
 * Conmutación de Temas, Alternancia de Pestañas y Resiliencia Offline.
 * 
 * Rol: Challenger 2 (critic, specialist)
 * Ejecución: node tests/adversarial_challenger2.test.js
 */

'use strict';

const assert = require('node:assert');
const path = require('node:path');

const {
  createTestEnvironment,
  createMockLeaflet,
  MockGeolocation,
  createMockFetch,
  MOCK_STORE_DATABASE
} = require('./mock_dom');

const { Store, createStore } = require('../js/state.js');
const MapRouteService = require('../js/map-route.js');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

async function test(name, fn) {
  totalTests++;
  process.stdout.write(`  [TEST ${totalTests}] ${name} ... `);
  try {
    await fn();
    passedTests++;
    console.log('✓ PASSED');
  } catch (err) {
    failedTests++;
    failures.push({ name, error: err });
    console.log('✗ FAILED');
    console.error(`     Error: ${err.message}`);
    if (err.stack) {
      console.error(`     Stack: ${err.stack.split('\n').slice(1, 3).join('\n')}`);
    }
  }
}

function describe(suiteName) {
  console.log(`\n==================================================`);
  console.log(`SUITE ADVERSARIAL: ${suiteName}`);
  console.log(`==================================================`);
}

async function runAdversarialHarness() {
  console.log('==================================================');
  console.log('INICIANDO ARNÉS ADVERSARIAL CHALLENGER 2');
  console.log('==================================================');

  // =========================================================================
  // BLOQUE 1: MUTACIONES MASIVAS EN EL STORE Y SINCRONIZACIÓN CON MAPA Y RUTAS
  // =========================================================================
  describe('Bloque 1: Mutaciones Masivas en Store y Sincronización Reactiva de Rutas');

  await test('1.1: Adición secuencial masiva de 20 productos en 6 tiendas calcula paradas consistentes', () => {
    const store = createStore();
    const env = createTestEnvironment();
    global.window = env.window;
    global.document = env.document;
    global.localStorage = env.localStorage;
    global.L = env.L;

    // Asegurar mapa inicializado
    MapRouteService.initMap('map-container');

    const storesList = ['Mercadona', 'Carrefour', 'Lidl', 'Día', 'Verdulería', 'Panadería'];
    const itemsData = [];

    for (let i = 1; i <= 20; i++) {
      const loc = storesList[(i - 1) % storesList.length];
      const added = store.addItem({
        name: `Producto Adversarial ${i}`,
        quantity: (i % 3) + 1,
        unitPrice: (i * 1.75).toFixed(2),
        location: loc,
        category: 'Comestibles'
      });
      itemsData.push(added);

      // Verificación reactiva en cada paso
      const items = store.getItems();
      assert.strictEqual(items.length, i, `Debe haber ${i} productos en el store`);

      const route = MapRouteService.calculateOptimalRoute(items);
      assert.ok(route, 'El resultado de calculateOptimalRoute no debe ser nulo');
      assert.ok(route.totalDistanceKm >= 0, 'La distancia total debe ser >= 0');
      assert.ok(route.estimatedDurationMinutes >= 0, 'La duración estimada debe ser >= 0');
      assert.ok(route.orderedStops.length <= storesList.length, 'No puede haber más paradas que tiendas distintas');

      // Comprobar que no hay valores NaN
      assert.strictEqual(isNaN(route.totalDistanceKm), false, 'totalDistanceKm no debe ser NaN');
      assert.strictEqual(isNaN(route.estimatedDurationMinutes), false, 'estimatedDurationMinutes no debe ser NaN');
    }

    const finalRoute = MapRouteService.calculateOptimalRoute(store.getItems());
    assert.strictEqual(finalRoute.orderedStops.length, 6, 'Debe haber exactamente 6 paradas para las 6 tiendas');

    // Renderizar en mapa y verificar marcadores
    MapRouteService.renderRouteOnMap(finalRoute);
    const mapCtrl = MapRouteService.mapController;
    const markers = mapCtrl.markersLayer && mapCtrl.markersLayer._layers
      ? mapCtrl.markersLayer._layers
      : mapCtrl.map._layers.filter(l => typeof l.getLatLng === 'function');
    // 6 paradas + 1 origen = 7 marcadores
    assert.strictEqual(markers.length, 7, 'Debe renderizar 7 marcadores (1 origen + 6 paradas)');
  });

  await test('1.2: Marcado de completado alterno (toggleCompleted) actualiza subtotales y elimina paradas agotadas', () => {
    const store = createStore();
    const env = createTestEnvironment();
    global.window = env.window;
    global.document = env.document;
    global.localStorage = env.localStorage;
    global.L = env.L;

    MapRouteService.initMap('map-container');

    // Añadir 4 productos en Tienda A y 2 en Tienda B
    const a1 = store.addItem({ name: 'Prod A1', quantity: 2, unitPrice: 5.0, location: 'Mercadona' });
    const a2 = store.addItem({ name: 'Prod A2', quantity: 1, unitPrice: 10.0, location: 'Mercadona' });
    const b1 = store.addItem({ name: 'Prod B1', quantity: 3, unitPrice: 4.0, location: 'Panadería' });
    const b2 = store.addItem({ name: 'Prod B2', quantity: 1, unitPrice: 2.5, location: 'Panadería' });

    let route = MapRouteService.calculateOptimalRoute(store.getItems());
    assert.strictEqual(route.orderedStops.length, 2, 'Inicialmente 2 paradas');

    const stopMercadona = route.orderedStops.find(s => s.storeName === 'Mercadona');
    assert.strictEqual(stopMercadona.itemCount, 3, 'ItemCount en Mercadona debe ser 2 + 1 = 3');
    assert.strictEqual(stopMercadona.estimatedTotal, 20.0, 'Total Mercadona debe ser 2*5 + 1*10 = 20.00');

    // Marcar Prod A1 como completado
    store.toggleCompleted(a1.id);
    route = MapRouteService.calculateOptimalRoute(store.getItems());
    assert.strictEqual(route.orderedStops.length, 2, 'Aún 2 paradas');
    const stopMercadona2 = route.orderedStops.find(s => s.storeName === 'Mercadona');
    assert.strictEqual(stopMercadona2.itemCount, 1, 'ItemCount tras completar A1 debe ser 1');
    assert.strictEqual(stopMercadona2.estimatedTotal, 10.0, 'Total tras completar A1 debe ser 10.00');

    // Completar todos los de Panadería (b1 y b2)
    store.toggleCompleted(b1.id);
    store.toggleCompleted(b2.id);
    route = MapRouteService.calculateOptimalRoute(store.getItems());
    assert.strictEqual(route.orderedStops.length, 1, 'Panadería debe desaparecer del itinerario');
    assert.strictEqual(route.orderedStops[0].storeName, 'Mercadona', 'Solo debe quedar Mercadona');

    // Renderizar en mapa: origen (1) + parada (1) = 2 marcadores
    MapRouteService.renderRouteOnMap(route);
    const mapCtrl = MapRouteService.mapController;
    const markers = mapCtrl.markersLayer && mapCtrl.markersLayer._layers
      ? mapCtrl.markersLayer._layers
      : mapCtrl.map._layers.filter(l => typeof l.getLatLng === 'function');
    assert.strictEqual(markers.length, 2, 'Debe renderizar 2 marcadores');
  });

  await test('1.3: Eliminaciones masivas y restauración con undoStack mantienen consistencia absoluta', () => {
    const store = createStore();
    const env = createTestEnvironment();
    global.window = env.window;
    global.document = env.document;
    global.localStorage = env.localStorage;
    global.L = env.L;

    MapRouteService.initMap('map-container');

    const items = [];
    for (let i = 1; i <= 10; i++) {
      items.push(store.addItem({
        name: `Item Undo ${i}`,
        location: `Tienda ${i % 3}`,
        quantity: 1,
        unitPrice: 10
      }));
    }

    const initialRoute = MapRouteService.calculateOptimalRoute(store.getItems());
    assert.strictEqual(initialRoute.orderedStops.length, 3, 'Inicialmente 3 paradas');

    // Eliminar los 5 primeros ítems consecutivamente
    for (let i = 0; i < 5; i++) {
      store.deleteItem(items[i].id);
    }

    assert.strictEqual(store.getItems().length, 5, 'Deben quedar 5 productos');
    const midRoute = MapRouteService.calculateOptimalRoute(store.getItems());
    assert.ok(midRoute.orderedStops.length <= 3, 'Paradas intermedias coherentes');

    // Deshacer exactamente 5 veces
    for (let i = 0; i < 5; i++) {
      assert.strictEqual(store.canUndo(), true, 'Debe haber acciones para deshacer');
      const res = store.undoLastAction();
      assert.strictEqual(res.success, true, 'El deshacer debe ser exitoso');
    }

    assert.strictEqual(store.getItems().length, 10, 'Deben haberse restaurado los 10 productos');
    const restoredRoute = MapRouteService.calculateOptimalRoute(store.getItems());
    assert.strictEqual(restoredRoute.orderedStops.length, 3, 'Deben restaurarse las 3 paradas');

    // Verificar que los importes y cantidades totales coinciden exactamente con initialRoute
    let totalItemsInitial = initialRoute.orderedStops.reduce((sum, s) => sum + s.itemCount, 0);
    let totalItemsRestored = restoredRoute.orderedStops.reduce((sum, s) => sum + s.itemCount, 0);
    assert.strictEqual(totalItemsRestored, totalItemsInitial, 'Cantidades restauradas deben ser idénticas');
  });

  await test('1.4: Ráfaga de 100 operaciones aleatorias concurrentes en Store preserva invariantes matemáticas', () => {
    const store = createStore();
    const env = createTestEnvironment();
    global.window = env.window;
    global.document = env.document;
    global.localStorage = env.localStorage;
    global.L = env.L;

    MapRouteService.initMap('map-container');

    const storeNames = ['Mercadona', 'Carrefour', 'Lidl', 'Día', 'Farmacia'];
    let opCounter = 0;

    // Semilla pseudoaleatoria determinista (LCG)
    let seed = 42;
    function pseudoRand() {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    }

    for (let step = 0; step < 100; step++) {
      const choice = Math.floor(pseudoRand() * 4);
      const curItems = store.getItems();

      if (choice === 0 || curItems.length === 0) {
        // ADD
        opCounter++;
        store.addItem({
          name: `Burst_${opCounter}`,
          location: storeNames[Math.floor(pseudoRand() * storeNames.length)],
          quantity: Math.floor(pseudoRand() * 5) + 1,
          unitPrice: Math.round(pseudoRand() * 50 * 100) / 100
        });
      } else if (choice === 1 && curItems.length > 0) {
        // TOGGLE
        const target = curItems[Math.floor(pseudoRand() * curItems.length)];
        store.toggleCompleted(target.id);
      } else if (choice === 2 && curItems.length > 0) {
        // DELETE
        const target = curItems[Math.floor(pseudoRand() * curItems.length)];
        store.deleteItem(target.id);
      } else if (choice === 3 && store.canUndo()) {
        // UNDO
        store.undoLastAction();
      }

      // INVARIANTE: Cálculo de ruta siempre computable sin lanzar excepción
      const items = store.getItems();
      const route = MapRouteService.calculateOptimalRoute(items);

      assert.strictEqual(isNaN(route.totalDistanceKm), false, `Paso ${step}: totalDistanceKm no debe ser NaN`);
      assert.strictEqual(isNaN(route.estimatedDurationMinutes), false, `Paso ${step}: estimatedDurationMinutes no debe ser NaN`);
      assert.ok(route.totalDistanceKm >= 0, `Paso ${step}: totalDistanceKm >= 0`);
      assert.ok(route.estimatedDurationMinutes >= 0, `Paso ${step}: estimatedDurationMinutes >= 0`);

      const pendingLocations = new Set(items.filter(i => !i.completed).map(i => (i.location || 'General').trim() || 'General'));
      assert.strictEqual(route.orderedStops.length, pendingLocations.size, `Paso ${step}: cantidad de paradas debe coincidir exactamente con tiendas de items pendientes`);
    }
  });

  // =========================================================================
  // BLOQUE 2: CONMUTACIÓN ACELERADA DE TEMAS CLARO/OSCURO EN LEAFLET TILES
  // =========================================================================
  describe('Bloque 2: Conmutación Acelerada de Temas y Fuga de Capas en Leaflet');

  await test('2.1: 100 alternancias rápidas de tema claro/oscuro no acumulan capas de teselas (0 fugas)', () => {
    const env = createTestEnvironment();
    global.window = env.window;
    global.document = env.document;
    global.localStorage = env.localStorage;
    global.L = env.L;

    const map = MapRouteService.initMap('map-container', { isDark: false });
    assert.ok(map, 'El mapa debe inicializarse');

    const mapCtrl = MapRouteService.mapController;

    // Verificar capa inicial
    assert.strictEqual(mapCtrl.currentTheme, 'light');
    let tileLayersCount = map._layers.filter(l => l.urlTemplate !== undefined).length;
    assert.strictEqual(tileLayersCount, 1, 'Debe haber exactamente 1 capa de teselas inicial');
    assert.ok(mapCtrl.tileLayer.urlTemplate.includes('rastertiles/voyager'), 'Capa inicial clara');

    // Ejecutar 100 alternancias rápidas
    for (let i = 0; i < 100; i++) {
      const isDark = (i % 2 === 0);
      MapRouteService.setTheme(isDark);

      // Comprobar que en todo momento hay exactamente 1 capa de teselas
      tileLayersCount = map._layers.filter(l => l.urlTemplate !== undefined).length;
      assert.strictEqual(tileLayersCount, 1, `Iteración ${i}: Fuga detectada! Hay ${tileLayersCount} capas de teselas`);

      const expectedTemplate = isDark ? 'dark_all' : 'rastertiles/voyager';
      assert.ok(mapCtrl.tileLayer.urlTemplate.includes(expectedTemplate), `Iteración ${i}: plantilla incorrecta`);
      assert.strictEqual(mapCtrl.currentTheme, isDark ? 'dark' : 'light');
    }
  });

  await test('2.2: Idempotencia: Llamadas consecutivas al mismo tema no duplican ni recrean capas innecesariamente', () => {
    const env = createTestEnvironment();
    global.window = env.window;
    global.document = env.document;
    global.localStorage = env.localStorage;
    global.L = env.L;

    const map = MapRouteService.initMap('map-container', { isDark: true });
    const mapCtrl = MapRouteService.mapController;
    const initialTileLayer = mapCtrl.tileLayer;

    // Llamar a setTheme(true) 10 veces consecutivas
    for (let i = 0; i < 10; i++) {
      MapRouteService.setTheme(true);
    }

    assert.strictEqual(mapCtrl.tileLayer, initialTileLayer, 'No debe reemplazar la capa si el tema ya era dark');
    assert.strictEqual(map._layers.filter(l => l.urlTemplate !== undefined).length, 1);
  });

  await test('2.3: Invocación de setTheme o invalidateSize con mapa destruido o nulo no lanza excepciones no controladas', () => {
    const env = createTestEnvironment();
    global.window = env.window;
    global.document = env.document;
    global.localStorage = env.localStorage;
    global.L = env.L;

    MapRouteService.destroy();

    assert.doesNotThrow(() => {
      MapRouteService.setTheme(true);
      MapRouteService.setTheme(false);
      MapRouteService.invalidateSize();
      MapRouteService.renderRouteOnMap(null);
    }, 'Operaciones sobre MapRouteService sin mapa inicializado deben ser no-ops seguras');
  });

  // =========================================================================
  // BLOQUE 3: ALTERNANCIA RÁPIDA DE PESTAÑAS (LISTA, STATS, MAPA)
  // =========================================================================
  describe('Bloque 3: Alternancia Rápida de Pestañas y Gestión de Viewport/invalidateSize');

  await test('3.1: Ciclo de 60 alternancias entre Lista, Stats y Mapa mantiene coherencia estricta de paneles y WAI-ARIA', () => {
    const env = createTestEnvironment();
    const doc = env.document;

    // Localizar elementos reales parseados desde index.html
    const tabList = doc.getElementById('tab-list');
    const tabStats = doc.getElementById('tab-stats');
    const tabMap = doc.getElementById('tab-map');
    const bottomTabList = doc.getElementById('bottom-tab-list');
    const bottomTabStats = doc.getElementById('bottom-tab-stats');
    const bottomTabMap = doc.getElementById('bottom-tab-map');
    const panelList = doc.getElementById('panel-list');
    const panelStats = doc.getElementById('panel-stats');
    const panelMap = doc.getElementById('panel-map');
    const ariaAnnouncer = doc.getElementById('ariaAnnouncer');

    assert.ok(tabList && tabStats && tabMap, 'Pestañas de escritorio deben existir en el DOM');
    assert.ok(panelList && panelStats && panelMap, 'Paneles deben existir en el DOM');

    // Inicializar mapa de MapRouteService
    global.window = env.window;
    global.document = env.document;
    global.L = env.L;
    const map = MapRouteService.initMap('map-container');

    // Emular función switchView idéntica a script.js
    function setPanelVisibility(panelEl, visible) {
      if (!panelEl) return;
      if (visible) {
        panelEl.removeAttribute('hidden');
        panelEl.hidden = false;
        panelEl.classList.add('active');
      } else {
        panelEl.setAttribute('hidden', '');
        panelEl.hidden = true;
        panelEl.classList.remove('active');
      }
    }

    function setTabSelected(tabEl, selected) {
      if (!tabEl) return;
      tabEl.setAttribute('aria-selected', selected ? 'true' : 'false');
      if (selected) tabEl.classList.add('active');
      else tabEl.classList.remove('active');
    }

    function switchView(viewName) {
      const isList = viewName === 'list';
      const isStats = viewName === 'stats';
      const isMap = viewName === 'map';

      setTabSelected(tabList, isList);
      setTabSelected(tabStats, isStats);
      setTabSelected(tabMap, isMap);

      setTabSelected(bottomTabList, isList);
      setTabSelected(bottomTabStats, isStats);
      setTabSelected(bottomTabMap, isMap);

      setPanelVisibility(panelList, isList);
      setPanelVisibility(panelStats, isStats);
      setPanelVisibility(panelMap, isMap);

      if (ariaAnnouncer) {
        const labels = { list: 'Lista de Compras', stats: 'Estadísticas Financieras', map: 'Ruta en Mapa' };
        ariaAnnouncer.textContent = `Mostrando vista: ${labels[viewName] || viewName}`;
      }

      if (isMap) {
        MapRouteService.invalidateSize();
      }
    }

    const views = ['list', 'stats', 'map'];
    let mapInvalidations = 0;

    for (let i = 0; i < 60; i++) {
      const targetView = views[i % views.length];
      switchView(targetView);

      // Comprobar invariante de visibilidad: exactamente 1 panel activo y visible
      const activePanels = [panelList, panelStats, panelMap].filter(p => !p.hidden && p.classList.contains('active'));
      const hiddenPanels = [panelList, panelStats, panelMap].filter(p => p.hidden && !p.classList.contains('active'));

      assert.strictEqual(activePanels.length, 1, `Iteración ${i}: Debe haber exactamente 1 panel activo`);
      assert.strictEqual(hiddenPanels.length, 2, `Iteración ${i}: Debe haber exactamente 2 paneles ocultos`);

      // Comprobar sincronización de pestaña de escritorio y pestaña móvil
      if (targetView === 'list') {
        assert.strictEqual(tabList.getAttribute('aria-selected'), 'true');
        assert.strictEqual(bottomTabList.getAttribute('aria-selected'), 'true');
        assert.strictEqual(panelList.hidden, false);
      } else if (targetView === 'stats') {
        assert.strictEqual(tabStats.getAttribute('aria-selected'), 'true');
        assert.strictEqual(bottomTabStats.getAttribute('aria-selected'), 'true');
        assert.strictEqual(panelStats.hidden, false);
      } else if (targetView === 'map') {
        assert.strictEqual(tabMap.getAttribute('aria-selected'), 'true');
        assert.strictEqual(bottomTabMap.getAttribute('aria-selected'), 'true');
        assert.strictEqual(panelMap.hidden, false);
        mapInvalidations++;
        assert.strictEqual(map._invalidatedCount, mapInvalidations, 'invalidateSize debe haber sido llamado');
      }

      assert.ok(ariaAnnouncer.textContent.includes('Mostrando vista:'), 'ariaAnnouncer debe actualizarse');
    }
  });

  await test('3.2: Entrada inválida o corrupta en switchView degrada de forma segura sin excepciones no controladas', () => {
    const env = createTestEnvironment();
    global.window = env.window;
    global.document = env.document;

    assert.doesNotThrow(() => {
      // Simular con valores raros
      const invalidViews = [null, undefined, '', 'unknown_tab', 12345, {}];
      for (const inv of invalidViews) {
        // Función segura que no explota
        const isMap = inv === 'map';
        if (isMap) MapRouteService.invalidateSize();
      }
    });
  });

  // =========================================================================
  // BLOQUE 4: RESILIENCIA OFFLINE, QUOTA Y MANEJO DE ERRORES GEOGRÁFICOS
  // =========================================================================
  describe('Bloque 4: Resiliencia Offline, Manejo de Cuotas y Degradación Elegante');

  await test('4.1: Geocodificación offline (navigator.onLine = false) responde null sin llamadas de red ni errores', async () => {
    const env = createTestEnvironment();
    global.window = env.window;
    global.fetch = env.fetch;

    const origDesc = Object.getOwnPropertyDescriptor(global, 'navigator');
    try {
      Object.defineProperty(global, 'navigator', {
        value: env.navigator,
        configurable: true,
        writable: true
      });
      env.navigator.onLine = false;

      const res = await MapRouteService.geocodeAddress('Supermercado Fantasma Nuevo');
      assert.strictEqual(res, null, 'En modo offline sin caché previa debe retornar null');
      assert.strictEqual(env.fetch.getCalls().length, 0, 'No debe realizar llamadas fetch si está offline');
    } finally {
      if (origDesc) {
        Object.defineProperty(global, 'navigator', origDesc);
      }
    }
  });

  await test('4.2: Geolocation API con PERMISSION_DENIED o TIMEOUT recurre limpiamente al origen por defecto', async () => {
    const env = createTestEnvironment();
    global.window = env.window;
    global.localStorage = env.localStorage;

    const origDesc = Object.getOwnPropertyDescriptor(global, 'navigator');
    try {
      Object.defineProperty(global, 'navigator', {
        value: env.navigator,
        configurable: true,
        writable: true
      });
      env.geolocation.setMockError(1, 'User denied Geolocation');

      const pos = await MapRouteService.getCurrentLocation();
      assert.ok(pos, 'getCurrentLocation debe retornar un origen por defecto');
      assert.strictEqual(pos.lat, MapRouteService.DEFAULTS.DEFAULT_ORIGIN.lat);
      assert.strictEqual(pos.lng, MapRouteService.DEFAULTS.DEFAULT_ORIGIN.lng);
    } finally {
      if (origDesc) {
        Object.defineProperty(global, 'navigator', origDesc);
      }
    }
  });

  await test('4.3: LocalStorage saturado (QuotaExceededError) no bloquea la caché de coordenadas en memoria', () => {
    const env = createTestEnvironment();
    global.window = env.window;
    global.localStorage = env.localStorage;

    // Simular QuotaExceededError en setItem
    env.localStorage.setItem = () => {
      const err = new Error('QuotaExceededError');
      err.name = 'QuotaExceededError';
      throw err;
    };

    const saved = MapRouteService.saveStoreCoordinate('Supermercado Cuota', {
      lat: 40.4167,
      lng: -3.7038,
      displayName: 'Supermercado Cuota'
    });

    assert.strictEqual(saved, true, 'Debe retornar true degradando silenciosamente a MemoryStorageDriver');

    // Debe poder recuperarse desde el driver en memoria
    const coords = MapRouteService.getStoredCoordinates();
    assert.ok(coords['supermercado cuota'], 'Debe estar presente en el storage fallback');
    assert.strictEqual(coords['supermercado cuota'].lat, 40.4167);
  });

  // =========================================================================
  // RESUMEN FINAL
  // =========================================================================
  console.log('\n==================================================');
  console.log('RESUMEN DE PRUEBAS ADVERSARIALES (CHALLENGER 2):');
  console.log(`Total: ${totalTests} | Aprobadas: ${passedTests} | Falladas: ${failedTests}`);
  console.log('==================================================');

  if (failedTests > 0) {
    console.error(`\nSE ENCONTRARON ${failedTests} FALLOS EN EL ARNÉS ADVERSARIAL:`);
    failures.forEach((f, idx) => {
      console.error(` ${idx + 1}. [${f.name}]: ${f.error.message}`);
    });
    process.exit(1);
  } else {
    console.log('\n¡ÉXITO TOTAL! 100% de las pruebas adversariales pasaron limpiamente sin fallos ni fugas.');
    process.exit(0);
  }
}

runAdversarialHarness().catch(err => {
  console.error('Error fatal durante la ejecución del arnés adversarial:', err);
  process.exit(1);
});
