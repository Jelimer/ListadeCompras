/**
 * tests/adversarial_challenger_m2_2_r2.test.js
 * ============================================================================
 * Arnés de Pruebas Adversarial, de Estrés y Validación Empírica
 * Challenger M2 Iteración 2 — Ciclo de Vida, Ejecución Única & Concurrencia
 *
 * Verificaciones Clave:
 * 1. renderMapView() ejecuta calculateOptimalRoute EXACTAMENTE 1 vez al conmutar
 *    con switchView('map') (Fast-Path en memoria y Slow-Path asíncrono).
 * 2. Conmutaciones rápidas (rapid view switching): list -> map -> list y
 *    coherencia reactiva de mapDirty y statsDirty ante resolución tardía.
 * 3. Peticiones concurrentes a ensureLeafletAndMapLoaded():
 *    - Reutilización de leafletLoadPromise (singleton de carga).
 *    - Cero callbacks descartados ante múltiples consumidores.
 *    - Resiliencia y desalojo ante fallos de red con reintento exitoso.
 *    - Integración real: switchView('map') concurrente con startPickLocationOnMap().
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const { createTestEnvironment, createMockEcharts, createMockLeaflet } = require('./mock_dom.js');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    failures.push({ name, error: err });
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    if (err.stack) {
      const trace = err.stack.split('\n').slice(1, 4).join('\n');
      console.error(`     Stack: ${trace}`);
    }
  }
}

function describe(suiteTitle) {
  console.log(`\n============================================================`);
  console.log(`CHALLENGER M2 ITER 2: ${suiteTitle}`);
  console.log(`============================================================`);
}

// Cargar módulos comunes una sola vez
require('../firebase-config.js');
const MapRoute = require('../js/map-route.js');
require('../js/storage.js');
require('../js/validation.js');
require('../js/state.js');
require('../js/avatars.js');
require('../js/analytics.js');
const ChartModule = require('../js/chart.js');
require('../js/export-import.js');
require('../js/ui-feedback.js');
const ResourceLoader = require('../js/resource-loader.js');

/**
 * Función auxiliar para inicializar un entorno simulado limpio con script.js
 */
function createIsolatedAppEnvironment(options = {}) {
  const env = createTestEnvironment();

  global.window = env.window;
  global.document = env.document;
  global.localStorage = env.localStorage;
  global.sessionStorage = env.sessionStorage;
  global.navigator = env.navigator;
  global.fetch = env.fetch;
  global.Swal = env.Swal;
  env.window.scrollTo = () => {};
  global.scrollTo = () => {};

  if (options.hasLeafletInitially !== false) {
    global.L = env.L;
    env.window.L = env.L;
  } else {
    global.L = undefined;
    env.window.L = undefined;
    delete env.L;
  }

  if (options.hasEChartsInitially !== false) {
    global.echarts = env.echarts;
    env.window.echarts = env.echarts;
  } else {
    global.echarts = undefined;
    env.window.echarts = undefined;
    delete env.echarts;
  }

  env.window.MapRouteService = MapRoute;
  env.window.MapRoute = MapRoute;
  global.MapRouteService = MapRoute;
  global.MapRoute = MapRoute;

  env.window.ShoppingChart = ChartModule;
  global.ShoppingChart = ChartModule;

  if (options.resourceLoader) {
    env.window.ResourceLoader = options.resourceLoader;
    global.ResourceLoader = options.resourceLoader;
  } else {
    env.window.ResourceLoader = ResourceLoader;
    global.ResourceLoader = ResourceLoader;
  }

  // Leer script.js e inyectar gancho seguro de depuración si se requiere
  const scriptPath = path.resolve(__dirname, '../script.js');
  let scriptContent = fs.readFileSync(scriptPath, 'utf8');

  if (options.exposeInternalEnsureLeaflet) {
    // Exponer gancho de introspección sin alterar el archivo físico en disco
    scriptContent = scriptContent.replace(
      'window.__getRenderState = () => ({',
      'window.__ensureLeafletAndMapLoaded = ensureLeafletAndMapLoaded;\n  window.__getRenderState = () => ({'
    );
  }

  eval(scriptContent);

  // Disparar DOMContentLoaded para completar inicialización
  env.document.dispatchEvent(new env.DOMEvent('DOMContentLoaded'));

  return env;
}

async function runAdversarialLifecycleSuite() {
  console.log('Iniciando Evaluación Empírica de Ciclo de Vida y Estrés — Challenger M2 Iteración 2...\n');

  // =========================================================================
  // PILAR 1: EJECUCIÓN EXACTA DE calculateOptimalRoute (FAST-PATH & SLOW-PATH)
  // =========================================================================
  describe('Pilar 1 — Ejecución Única de calculateOptimalRoute (Single Execution)');

  await test('1.1: Fast-Path — switchView("map") con Leaflet en memoria ejecuta calculateOptimalRoute EXACTAMENTE 1 vez (no 2)', async () => {
    let calcRouteInvocations = 0;
    const origCalc = MapRoute.calculateOptimalRoute;
    MapRoute.calculateOptimalRoute = function (...args) {
      calcRouteInvocations++;
      return origCalc.apply(this, args);
    };

    try {
      const env = createIsolatedAppEnvironment({ hasLeafletInitially: true });

      const stateInitial = env.window.__getRenderState();
      assert.strictEqual(stateInitial.currentView, 'list', 'Debe arrancar en vista list');
      assert.strictEqual(stateInitial.mapDirty, true, 'mapDirty debe ser true al inicio');

      const countBefore = calcRouteInvocations;

      // Acción: Conmutar a mapa mediante switchView('map')
      env.window.switchView('map');
      await new Promise(r => setTimeout(r, 70));

      const deltaCalls = calcRouteInvocations - countBefore;
      console.log(`      -> calculateOptimalRoute invocado: ${deltaCalls} vez/veces`);

      assert.strictEqual(
        deltaCalls,
        1,
        `calculateOptimalRoute debe ejecutarse EXACTAMENTE 1 vez (detectado: ${deltaCalls})`
      );

      const stateAfter = env.window.__getRenderState();
      assert.strictEqual(stateAfter.currentView, 'map', 'Debe estar en vista map');
      assert.strictEqual(stateAfter.mapDirty, false, 'mapDirty debe quedar en false tras renderizar');
    } finally {
      MapRoute.calculateOptimalRoute = origCalc;
    }
  });

  await test('1.2: Slow-Path — switchView("map") sin Leaflet en memoria (carga asíncrona) ejecuta calculateOptimalRoute EXACTAMENTE 1 vez al resolver', async () => {
    let calcRouteInvocations = 0;
    const origCalc = MapRoute.calculateOptimalRoute;
    MapRoute.calculateOptimalRoute = function (...args) {
      calcRouteInvocations++;
      return origCalc.apply(this, args);
    };

    let resolveLeafletPromise = null;
    let loadLeafletCalledCount = 0;
    const mockL = createMockLeaflet();

    const mockResourceLoader = {
      loadECharts: () => Promise.resolve(createMockEcharts()),
      loadLeaflet: () => {
        loadLeafletCalledCount++;
        return new Promise((resolve) => {
          resolveLeafletPromise = () => resolve(mockL);
        });
      },
      loadScript: () => Promise.resolve(),
      loadStyle: () => Promise.resolve()
    };

    try {
      const env = createIsolatedAppEnvironment({
        hasLeafletInitially: false,
        resourceLoader: mockResourceLoader
      });

      const countBefore = calcRouteInvocations;

      // Paso 1: Usuario pulsa en pestaña mapa
      env.window.switchView('map');

      // Mientras la descarga está pendiente en la red:
      assert.strictEqual(loadLeafletCalledCount, 1, 'ResourceLoader.loadLeaflet debe haberse llamado 1 vez');
      assert.strictEqual(calcRouteInvocations - countBefore, 0, 'No debe ejecutarse calculateOptimalRoute mientras Leaflet no haya cargado');

      // Paso 2: La red responde y resuelve Leaflet
      resolveLeafletPromise();
      await new Promise(r => setTimeout(r, 60));

      const deltaCalls = calcRouteInvocations - countBefore;
      console.log(`      -> calculateOptimalRoute tras resolución diferida: ${deltaCalls} vez/veces`);

      assert.strictEqual(
        deltaCalls,
        1,
        `calculateOptimalRoute debe ejecutarse EXACTAMENTE 1 vez al resolver Leaflet bajo demanda (detectado: ${deltaCalls})`
      );

      const stateFinal = env.window.__getRenderState();
      assert.strictEqual(stateFinal.currentView, 'map');
      assert.strictEqual(stateFinal.mapDirty, false);
    } finally {
      MapRoute.calculateOptimalRoute = origCalc;
    }
  });

  await test('1.3: Idempotencia — switchView("map") consecutivo cuando ya está en vista "map" y mapDirty=false NO re-ejecuta calculateOptimalRoute (0 llamadas)', async () => {
    let calcRouteInvocations = 0;
    const origCalc = MapRoute.calculateOptimalRoute;
    MapRoute.calculateOptimalRoute = function (...args) {
      calcRouteInvocations++;
      return origCalc.apply(this, args);
    };

    try {
      const env = createIsolatedAppEnvironment({ hasLeafletInitially: true });

      // Primera conmutación a mapa
      env.window.switchView('map');
      await new Promise(r => setTimeout(r, 60));
      assert.strictEqual(calcRouteInvocations, 1);

      // Segunda conmutación inmediata a mapa sin cambios en el estado
      const countBeforeSecond = calcRouteInvocations;
      env.window.switchView('map');
      await new Promise(r => setTimeout(r, 60));

      const deltaSecond = calcRouteInvocations - countBeforeSecond;
      assert.strictEqual(
        deltaSecond,
        0,
        `No debe recalcular ruta si la vista ya es "map" y mapDirty=false (detectado: ${deltaSecond} llamadas)`
      );
    } finally {
      MapRoute.calculateOptimalRoute = origCalc;
    }
  });

  await test('1.4: renderUI({ forceAll: true }) ejecuta calculateOptimalRoute exactamente 1 vez y limpia mapDirty a false', async () => {
    let calcRouteInvocations = 0;
    const origCalc = MapRoute.calculateOptimalRoute;
    MapRoute.calculateOptimalRoute = function (...args) {
      calcRouteInvocations++;
      return origCalc.apply(this, args);
    };

    try {
      const env = createIsolatedAppEnvironment({ hasLeafletInitially: true });

      assert.strictEqual(calcRouteInvocations, 0);

      // Invocación forzada
      env.window.renderAppUI({ forceAll: true });
      await new Promise(r => setTimeout(r, 50));

      assert.strictEqual(calcRouteInvocations, 1, 'renderAppUI({ forceAll: true }) debe invocar calculateOptimalRoute exactamente 1 vez');
      const state = env.window.__getRenderState();
      assert.strictEqual(state.mapDirty, false, 'mapDirty debe quedar false tras forceAll');
    } finally {
      MapRoute.calculateOptimalRoute = origCalc;
    }
  });

  // =========================================================================
  // PILAR 2: CONMUTACIONES RÁPIDAS Y COHERENCIA REACTIVA (DIRTY FLAGS)
  // =========================================================================
  describe('Pilar 2 — Conmutaciones Rápidas y Coherencia Reactiva (Dirty Flags)');

  await test('2.1: Conmutación rápida list -> map -> list en 10ms antes de resolver Leaflet: mapDirty DEBE permanecer true al volver a list', async () => {
    let resolveLeaflet = null;
    const mockL = createMockLeaflet();

    const mockResourceLoader = {
      loadECharts: () => Promise.resolve(createMockEcharts()),
      loadLeaflet: () => new Promise((res) => { resolveLeaflet = () => res(mockL); }),
      loadScript: () => Promise.resolve(),
      loadStyle: () => Promise.resolve()
    };

    const env = createIsolatedAppEnvironment({
      hasLeafletInitially: false,
      resourceLoader: mockResourceLoader
    });

    let state = env.window.__getRenderState();
    assert.strictEqual(state.currentView, 'list');
    assert.strictEqual(state.mapDirty, true);

    // Paso 1: Usuario conmuta a map
    env.window.switchView('map');
    await new Promise(r => setTimeout(r, 10));

    // Paso 2: Usuario se arrepiente rápidamente y vuelve a list antes de que termine la descarga
    env.window.switchView('list');
    state = env.window.__getRenderState();
    assert.strictEqual(state.currentView, 'list');

    // Paso 3: Termina la descarga de Leaflet en segundo plano
    resolveLeaflet();
    await new Promise(r => setTimeout(r, 60));

    // El callback diferido debe detectar que currentView ya no es 'map' y dejar mapDirty = true
    state = env.window.__getRenderState();
    assert.strictEqual(state.currentView, 'list');
    assert.strictEqual(
      state.mapDirty,
      true,
      'mapDirty DEBE permanecer en true porque la vista activa es "list" y el mapa quedó pendiente de renderizar'
    );

    // Paso 4: Usuario vuelve a map -> debe renderizar inmediatamente y dejar mapDirty = false
    env.window.switchView('map');
    await new Promise(r => setTimeout(r, 60));

    state = env.window.__getRenderState();
    assert.strictEqual(state.currentView, 'map');
    assert.strictEqual(state.mapDirty, false, 'mapDirty debe pasar a false al ingresar a la vista con Leaflet ya listo');
  });

  await test('2.2: Conmutación en cascada rápida list -> stats -> map -> stats -> list mantiene coherencia limpia sin excepciones', async () => {
    const env = createIsolatedAppEnvironment({ hasLeafletInitially: true, hasEChartsInitially: true });

    assert.doesNotThrow(() => {
      env.window.switchView('stats');
      env.window.switchView('map');
      env.window.switchView('stats');
      env.window.switchView('list');
    }, 'La secuencia rápida de cambios de pestaña no debe lanzar excepciones');

    await new Promise(r => setTimeout(r, 80));

    const state = env.window.__getRenderState();
    assert.strictEqual(state.currentView, 'list', 'La vista final debe ser list');
  });

  await test('2.3: Doble clic rápido en tabMap (< 5ms) ejecuta calculateOptimalRoute exactamente 1 vez (sin llamadas redundantes)', async () => {
    let calcRouteInvocations = 0;
    const origCalc = MapRoute.calculateOptimalRoute;
    MapRoute.calculateOptimalRoute = function (...args) {
      calcRouteInvocations++;
      return origCalc.apply(this, args);
    };

    try {
      const env = createIsolatedAppEnvironment({ hasLeafletInitially: true });

      const tabMap = env.document.getElementById('tab-map');

      // Simular dos clics ultrarrápidos consecutivos
      tabMap.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
      tabMap.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));

      await new Promise(r => setTimeout(r, 80));

      assert.strictEqual(
        calcRouteInvocations,
        1,
        `Doble clic rápido debe resultar en exactamente 1 cálculo de ruta (detectado: ${calcRouteInvocations})`
      );
    } finally {
      MapRoute.calculateOptimalRoute = origCalc;
    }
  });

  // =========================================================================
  // PILAR 3: CONCURRENCIA Y PRESERVACIÓN DE CALLBACKS EN ensureLeafletAndMapLoaded
  // =========================================================================
  describe('Pilar 3 — Concurrencia y Cero Callbacks Descartados en ensureLeafletAndMapLoaded');

  await test('3.1: 10 llamadas concurrentes a ensureLeafletAndMapLoaded() comparten 1 sola Promesa y ejecutan los 10 callbacks', async () => {
    let loadLeafletCalls = 0;
    let resolveLeaflet = null;
    const mockL = createMockLeaflet();

    const mockResourceLoader = {
      loadECharts: () => Promise.resolve(createMockEcharts()),
      loadLeaflet: () => {
        loadLeafletCalls++;
        return new Promise((resolve) => {
          resolveLeaflet = () => resolve(mockL);
        });
      },
      loadScript: () => Promise.resolve(),
      loadStyle: () => Promise.resolve()
    };

    const env = createIsolatedAppEnvironment({
      hasLeafletInitially: false,
      resourceLoader: mockResourceLoader,
      exposeInternalEnsureLeaflet: true
    });

    const ensureFn = env.window.__ensureLeafletAndMapLoaded;
    assert.strictEqual(typeof ensureFn, 'function', 'Función ensureLeafletAndMapLoaded debe estar disponible');

    const executedCallbacks = [];
    const CALL_COUNT = 10;

    // Disparar 10 llamadas concurrentes
    for (let i = 0; i < CALL_COUNT; i++) {
      ensureFn((lib) => {
        executedCallbacks.push({ id: i, lib });
      });
    }

    // Verificar que mientras está en vuelo, solo se llamó a ResourceLoader 1 vez
    assert.strictEqual(
      loadLeafletCalls,
      1,
      `ResourceLoader.loadLeaflet debe invocarse EXACTAMENTE 1 vez para 10 llamadas concurrentes (detectado: ${loadLeafletCalls})`
    );
    assert.strictEqual(executedCallbacks.length, 0, 'Ningún callback debe ejecutarse antes de que resuelva la promesa');

    // Resolver la descarga
    resolveLeaflet();
    await new Promise(r => setTimeout(r, 60));

    // Verificación rigurosa: TODOS los 10 callbacks deben haberse ejecutado
    assert.strictEqual(
      executedCallbacks.length,
      CALL_COUNT,
      `Se esperaba la ejecución de todos los ${CALL_COUNT} callbacks, pero se ejecutaron ${executedCallbacks.length}`
    );

    // Verificar que cada uno recibió la librería Leaflet correcta
    for (let i = 0; i < CALL_COUNT; i++) {
      const match = executedCallbacks.find(c => c.id === i);
      assert.ok(match, `El callback #${i} debe haberse ejecutado`);
      assert.strictEqual(match.lib, mockL, `El callback #${i} debe recibir la instancia resuelta de Leaflet`);
    }
  });

  await test('3.2: Fallo de red en ensureLeafletAndMapLoaded() notifica a TODOS los callbacks de error y desaloja leafletLoadPromise para reintento', async () => {
    let loadLeafletCalls = 0;
    let rejectLeaflet = null;
    const networkError = new Error('ERR_CONNECTION_TIMED_OUT');

    const mockResourceLoader = {
      loadECharts: () => Promise.resolve(createMockEcharts()),
      loadLeaflet: () => {
        loadLeafletCalls++;
        return new Promise((_, reject) => {
          rejectLeaflet = () => reject(networkError);
        });
      },
      loadScript: () => Promise.resolve(),
      loadStyle: () => Promise.resolve()
    };

    const env = createIsolatedAppEnvironment({
      hasLeafletInitially: false,
      resourceLoader: mockResourceLoader,
      exposeInternalEnsureLeaflet: true
    });

    const ensureFn = env.window.__ensureLeafletAndMapLoaded;
    const errorCallbacks = [];
    const CALL_COUNT = 5;

    // Disparar 5 llamadas concurrentes con onError
    for (let i = 0; i < CALL_COUNT; i++) {
      ensureFn(
        () => assert.fail('onSuccess no debe invocarse en caso de fallo'),
        (err) => { errorCallbacks.push({ id: i, error: err }); }
      ).catch(() => {}); // Absorber rechazo de la promesa retornada
    }

    assert.strictEqual(loadLeafletCalls, 1);

    // Rechazar con error de red
    rejectLeaflet();
    await new Promise(r => setTimeout(r, 60));

    // Todos los callbacks de error deben haberse ejecutado
    assert.strictEqual(
      errorCallbacks.length,
      CALL_COUNT,
      `Todos los ${CALL_COUNT} callbacks de error deben haberse invocado (detectado: ${errorCallbacks.length})`
    );
    for (let i = 0; i < CALL_COUNT; i++) {
      assert.strictEqual(errorCallbacks[i].error, networkError);
    }

    // Comprobar resiliencia y reintento: la siguiente llamada debe intentar descargar nuevamente
    const mockSuccessL = createMockLeaflet();
    mockResourceLoader.loadLeaflet = () => Promise.resolve(mockSuccessL);

    let retrySuccess = false;
    await ensureFn((lib) => {
      retrySuccess = true;
      assert.strictEqual(lib, mockSuccessL);
    });

    assert.strictEqual(retrySuccess, true, 'Tras el fallo, el reintento debe completarse exitosamente');
  });

  await test('3.3: Integración Real — switchView("map") y startPickLocationOnMap() concurrentes sin Leaflet en memoria ejecutan ambos flujos sin perder callbacks', async () => {
    let calcRouteInvocations = 0;
    const origCalc = MapRoute.calculateOptimalRoute;
    MapRoute.calculateOptimalRoute = function (...args) {
      calcRouteInvocations++;
      return origCalc.apply(this, args);
    };

    let pickModeStoreName = null;
    let pickModeCallback = null;
    const origEnablePick = MapRoute.enablePickLocationMode;
    MapRoute.enablePickLocationMode = function (name, cb) {
      pickModeStoreName = name;
      pickModeCallback = cb;
    };

    let resolveLeaflet = null;
    let loadLeafletCalls = 0;
    const mockL = createMockLeaflet();

    const mockResourceLoader = {
      loadECharts: () => Promise.resolve(createMockEcharts()),
      loadLeaflet: () => {
        loadLeafletCalls++;
        return new Promise((resolve) => {
          resolveLeaflet = () => resolve(mockL);
        });
      },
      loadScript: () => Promise.resolve(),
      loadStyle: () => Promise.resolve()
    };

    try {
      const env = createIsolatedAppEnvironment({
        hasLeafletInitially: false,
        resourceLoader: mockResourceLoader
      });

      // Simular apertura de modal y clic en "Seleccionar en mapa" para "Supermercado Concurrente"
      const modal = env.document.getElementById('modal-edit-store-location');
      const storeTitle = env.document.getElementById('modal-store-title');
      const btnPick = env.document.getElementById('btn-pick-on-map-from-modal');

      if (storeTitle) storeTitle.textContent = 'Editar ubicación: Supermercado Concurrente';

      // Al hacer clic en btnPick, el controlador llama a:
      // 1. switchView('map') -> que dispara renderMapView() -> ensureLeafletAndMapLoaded(cbRender)
      // 2. ensureLeafletAndMapLoaded(cbPickMode)
      // Ambos suceden de forma síncrona mientras Leaflet aún no está cargado!
      btnPick.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));

      assert.strictEqual(loadLeafletCalls, 1, 'ResourceLoader.loadLeaflet debe invocarse una sola vez');
      assert.strictEqual(calcRouteInvocations, 0, 'No debe calcular ruta antes de que Leaflet resuelva');
      assert.strictEqual(pickModeStoreName, null, 'No debe activar modo picker antes de que Leaflet resuelva');

      // Ahora la red resuelve Leaflet
      resolveLeaflet();
      await new Promise(r => setTimeout(r, 80));

      // Verificaciones:
      // A. La ruta se calculó exactamente 1 vez
      console.log(`      -> calculateOptimalRoute en flujo combinado: ${calcRouteInvocations} vez/veces`);
      assert.strictEqual(
        calcRouteInvocations,
        1,
        `calculateOptimalRoute debe haberse ejecutado exactamente 1 vez (detectado: ${calcRouteInvocations})`
      );

      // B. El modo picker se activó correctamente para la tienda solicitada (cbPickMode NO fue descartado)
      assert.strictEqual(
        pickModeStoreName,
        'Supermercado Concurrente',
        `El modo picker debió activarse para "Supermercado Concurrente" (detectado: "${pickModeStoreName}")`
      );
      assert.strictEqual(typeof pickModeCallback, 'function', 'El callback del picker debe estar registrado');

      // C. El banner del picker en el DOM debe estar visible
      const banner = env.document.getElementById('map-picker-banner');
      assert.strictEqual(banner.hasAttribute('hidden'), false, 'El banner del picker debe ser visible');

      // D. Simular que el usuario hace clic en el mapa para fijar coordenadas
      pickModeCallback({
        storeName: 'Supermercado Concurrente',
        lat: 40.42,
        lng: -3.70
      });

      assert.strictEqual(banner.hasAttribute('hidden'), true, 'El banner debe ocultarse tras seleccionar coordenadas');
    } finally {
      MapRoute.calculateOptimalRoute = origCalc;
      MapRoute.enablePickLocationMode = origEnablePick;
    }
  });

  // =========================================================================
  // RESUMEN FINAL DE LA SUITE
  // =========================================================================
  console.log(`\n============================================================`);
  console.log(`RESUMEN CHALLENGER M2 ITERACIÓN 2:`);
  console.log(`Total Pruebas: ${totalTests} | Aprobadas: ${passedTests} | Falladas: ${failedTests}`);
  console.log(`============================================================\n`);

  if (failedTests > 0) {
    console.log('Fallas detectadas:');
    failures.forEach((f, i) => {
      console.log(`  ${i + 1}. ${f.name}`);
      console.log(`     -> ${f.error.message}\n`);
    });
  }

  return { totalTests, passedTests, failedTests, failures };
}

if (require.main === module) {
  runAdversarialLifecycleSuite().then(res => {
    process.exit(res.failedTests > 0 ? 1 : 0);
  }).catch(err => {
    console.error('Error fatal durante ejecución de la suite:', err);
    process.exit(1);
  });
}

module.exports = { runAdversarialLifecycleSuite };
