/**
 * tests/adversarial_challenger2_m2.test.js
 * Arnés de Pruebas Adversariales y de Estrés Empírico — Challenger 2 (Milestone 2)
 *
 * Valida de forma rigurosa:
 * 1. Conmutaciones rápidas (rapid switchView): 'list' -> 'stats' -> 'list' en 10ms antes de que
 *    resuelva la carga asíncrona de ECharts, verificando que statsDirty permanezca en true para
 *    redibujar correctamente al volver.
 * 2. Picker de ubicación en mapa: invocar startPickLocationOnMap("Tienda Test") cuando Leaflet
 *    aún NO está cargado en memoria, verificando que no arroje excepciones y dispare la carga diferida.
 * 3. Resiliencia de ChartController: lazy init cuando window.echarts se inyecta con posterioridad a
 *    la instanciación del objeto, verificando que chartController.render() no falle.
 * 4. Verificación empírica de regresión en ciclo de vida (llamadas a calculateOptimalRoute en switchView('map')).
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const { createTestEnvironment, createMockEcharts } = require('./mock_dom.js');

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

function describe(suiteTitle) {
  console.log(`\n==================================================`);
  console.log(`CHALLENGER 2 M2 SUITE: ${suiteTitle}`);
  console.log(`==================================================`);
}

async function runAdversarialM2LifecycleTests() {
  console.log('Iniciando Pruebas Adversariales M2: Ciclo de Vida, Transiciones de Vista y Carga Diferida...\n');

  // ---------------------------------------------------------------------------
  // SUITE 1: Resiliencia de ChartController ante inyección tardía de ECharts
  // ---------------------------------------------------------------------------
  describe('Suite 1: Resiliencia de ChartController (Lazy Init)');

  const ChartModule = require('../js/chart.js');

  await test('1.1: Instanciación sin window.echarts ni options.echarts no arroja error y deja instance en null', () => {
    const dummyDom = { id: 'chart-container', style: {} };
    // Sin echarts disponible inicialmente
    const ctrl = new ChartModule.ChartController(dummyDom, { echarts: null });
    assert.strictEqual(ctrl.instance, null, 'instance debe ser null antes de que echarts esté disponible');
    assert.strictEqual(ctrl.echartsLibrary, null, 'echartsLibrary debe ser null');
  });

  await test('1.2: Inyección posterior de window.echarts permite a chartController.render() inicializar perezosamente sin fallar', () => {
    const dummyDom = { id: 'chart-container', style: {} };
    const mockEcharts = createMockEcharts();

    // Guardar original si existiera
    const origGlobalEcharts = global.window ? global.window.echarts : undefined;
    if (!global.window) global.window = {};
    global.window.echarts = null;

    const ctrl = new ChartModule.ChartController(dummyDom, { echarts: null });
    assert.strictEqual(ctrl.instance, null);

    // Inyectar en window tras la creación del objeto
    global.window.echarts = mockEcharts;

    const dummyBreakdown = {
      'Super A': { 'Almacén': 1500, 'Lácteos': 800 },
      'Farmacia B': { 'Farmacia': 450 }
    };
    const dummyItems = [
      { name: 'Arroz', location: 'Super A', category: 'Almacén', price: 1500, completed: false },
      { name: 'Leche', location: 'Super A', category: 'Lácteos', price: 800, completed: false },
      { name: 'Ibuprofeno', location: 'Farmacia B', category: 'Farmacia', price: 450, completed: false }
    ];

    // render() debe detectar que echarts ya existe, auto-invocar init() y pintar
    assert.doesNotThrow(() => {
      ctrl.render(dummyBreakdown, dummyItems, false);
    }, 'render() debe inicializar perezosamente sin arrojar excepciones');

    assert.ok(ctrl.instance !== null, 'instance debe quedar inicializada tras render()');
    assert.ok(ctrl.instance.getOption() !== null, 'setOption debe haberse ejecutado con opciones');

    // Restaurar
    global.window.echarts = origGlobalEcharts;
  });

  await test('1.3: chartController.resize() con inyección tardía se inicializa perezosamente sin fallar', () => {
    const dummyDom = { id: 'chart-container', style: {} };
    const mockEcharts = createMockEcharts();

    if (!global.window) global.window = {};
    global.window.echarts = null;

    const ctrl = new ChartModule.ChartController(dummyDom, { echarts: null });
    assert.strictEqual(ctrl.instance, null);

    // Inyectar después
    global.window.echarts = mockEcharts;

    assert.doesNotThrow(() => {
      ctrl.resize();
    }, 'resize() debe auto-inicializar sin fallar');

    assert.ok(ctrl.instance !== null, 'instance debe estar inicializada');
    assert.strictEqual(ctrl.instance._resized, 1, 'resize() debe invocarse sobre la instancia');
  });

  // ---------------------------------------------------------------------------
  // SUITE 2: Conmutaciones Rápidas (Rapid switchView) y Preservación de dirty flags
  // ---------------------------------------------------------------------------
  describe('Suite 2: Conmutaciones Rápidas (Rapid switchView) y Estado de dirty flags');

  await test('2.1: switchView rápido de list -> stats -> list en 10ms antes de que ECharts resuelva preserva statsDirty=true', async () => {
    const env = createTestEnvironment();
    global.window = env.window;
    global.document = env.document;
    global.localStorage = env.localStorage;
    global.navigator = env.navigator;
    global.L = env.L;
    global.echarts = undefined; // ECharts NO en memoria al inicio
    env.window.echarts = undefined;
    global.Swal = env.Swal;
    global.fetch = env.fetch;
    env.window.scrollTo = () => {};
    global.scrollTo = () => {};

    // Configurar ResourceLoader simulando retardo asíncrono de red (60ms)
    let resolveEChartsLoad = null;
    const mockEChartsLib = createMockEcharts();
    const deferredPromise = new Promise((resolve) => {
      resolveEChartsLoad = resolve;
    });

    const mockResourceLoader = {
      loadECharts: () => deferredPromise,
      loadLeaflet: () => Promise.resolve(env.L),
      loadScript: () => Promise.resolve(),
      loadStyle: () => Promise.resolve()
    };
    env.window.ResourceLoader = mockResourceLoader;
    global.ResourceLoader = mockResourceLoader;

    // Cargar módulos necesarios
    require('../firebase-config.js');
    require('../js/map-route.js');
    require('../js/storage.js');
    require('../js/validation.js');
    require('../js/state.js');
    require('../js/avatars.js');
    require('../js/analytics.js');
    require('../js/chart.js');
    require('../js/export-import.js');
    require('../js/ui-feedback.js');

    const scriptPath = path.resolve(__dirname, '../script.js');
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');
    eval(scriptContent);

    env.document.dispatchEvent(new env.DOMEvent('DOMContentLoaded'));

    const tabList = env.document.getElementById('tab-list');
    const tabStats = env.document.getElementById('tab-stats');

    let state = env.window.__getRenderState();
    assert.strictEqual(state.currentView, 'list', 'Debe arrancar en vista list');
    assert.strictEqual(state.statsDirty, true, 'statsDirty debe ser true al inicio');

    // Paso 1: Usuario pulsa en Estadísticas Financieras
    tabStats.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));

    // A los 10ms, el usuario se arrepiente y vuelve de inmediato a Lista
    await new Promise(r => setTimeout(r, 10));
    tabList.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));

    // Comprobar que volvimos a vista 'list'
    state = env.window.__getRenderState();
    assert.strictEqual(state.currentView, 'list', 'Debe estar en vista list');

    // Paso 2: La descarga de red de ECharts termina después (a los 40ms)
    resolveEChartsLoad(mockEChartsLib);
    await new Promise(r => setTimeout(r, 50));

    // El callback asíncrono debe detectar que no estamos en stats y dejar statsDirty en true
    state = env.window.__getRenderState();
    assert.strictEqual(state.currentView, 'list', 'Debe seguir en vista list');
    assert.strictEqual(state.statsDirty, true, 'statsDirty DEBE permanecer en true tras resolver la descarga fuera de la vista');

    // Paso 3: Usuario vuelve a stats: debe renderizar y limpiar statsDirty a false
    tabStats.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 80));

    state = env.window.__getRenderState();
    assert.strictEqual(state.currentView, 'stats', 'Debe estar en vista stats');
    assert.strictEqual(state.statsDirty, false, 'statsDirty debe quedar en false tras renderizar con ECharts en memoria');
  });

  // ---------------------------------------------------------------------------
  // SUITE 3: Picker de Ubicación en Mapa sin Leaflet en memoria
  // ---------------------------------------------------------------------------
  describe('Suite 3: startPickLocationOnMap con Leaflet sin cargar');

  await test('3.1: startPickLocationOnMap activa la carga diferida sin lanzar excepciones', async () => {
    const env = createTestEnvironment();
    global.window = env.window;
    global.document = env.document;
    global.localStorage = env.localStorage;
    global.navigator = env.navigator;
    global.Swal = env.Swal;
    global.fetch = env.fetch;

    // Leaflet NO en memoria
    global.L = undefined;
    env.window.L = undefined;
    delete env.L;

    let leafletLoadCalled = false;
    const mockLeaflet = createTestEnvironment().L;

    const mockResourceLoader = {
      loadECharts: () => Promise.resolve(createMockEcharts()),
      loadLeaflet: () => {
        leafletLoadCalled = true;
        env.window.L = mockLeaflet;
        global.L = mockLeaflet;
        return Promise.resolve(mockLeaflet);
      },
      loadScript: () => Promise.resolve(),
      loadStyle: () => Promise.resolve()
    };
    env.window.ResourceLoader = mockResourceLoader;
    global.ResourceLoader = mockResourceLoader;

    const scriptPath = path.resolve(__dirname, '../script.js');
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');
    eval(scriptContent);

    env.document.dispatchEvent(new env.DOMEvent('DOMContentLoaded'));

    // Encontrar botón en modal para activar selección en mapa
    const btnPickModal = env.document.getElementById('btn-pick-map-modal');
    const modalInput = env.document.getElementById('modal-edit-store-name');
    if (modalInput) modalInput.value = 'Tienda Test';

    // Simular que el usuario abre el modal y pulsa "Seleccionar en mapa"
    // o llama a la función si está expuesta
    assert.doesNotThrow(() => {
      if (btnPickModal) {
        btnPickModal.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
      }
    }, 'Pulsar seleccionar en mapa sin Leaflet en memoria no debe arrojar error síncrono');

    // Esperar resolución de promesas
    await new Promise(r => setTimeout(r, 60));

    // Verificar que se haya solicitado Leaflet a ResourceLoader
    assert.strictEqual(leafletLoadCalled, true, 'ResourceLoader.loadLeaflet debe haberse invocado');
  });

  // ---------------------------------------------------------------------------
  // SUITE 4: Detección Empírica de Regresiones en Ciclo de Vida (TSP calls en switchView)
  // ---------------------------------------------------------------------------
  describe('Suite 4: Verificación Empírica de Rendimiento en switchView(map)');

  await test('4.1: [STRESS / REGRESSION] switchView a map con Leaflet en memoria debe llamar a calculateOptimalRoute exactamente 1 vez (no duplicar)', async () => {
    const env = createTestEnvironment();
    global.window = env.window;
    global.document = env.document;
    global.localStorage = env.localStorage;
    global.navigator = env.navigator;
    global.L = env.L;
    global.echarts = env.echarts;
    global.Swal = env.Swal;
    global.fetch = env.fetch;

    const MapRoute = require('../js/map-route.js');
    let calcRouteCalls = 0;
    const origCalc = MapRoute.calculateOptimalRoute;
    MapRoute.calculateOptimalRoute = function (...args) {
      calcRouteCalls++;
      return origCalc.apply(this, args);
    };

    const scriptPath = path.resolve(__dirname, '../script.js');
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');
    eval(scriptContent);

    env.document.dispatchEvent(new env.DOMEvent('DOMContentLoaded'));

    const tabMap = env.document.getElementById('tab-map');
    const calcBefore = calcRouteCalls;

    tabMap.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 80));

    const totalInvocations = calcRouteCalls - calcBefore;
    console.log(`    -> calculateOptimalRoute invocado: ${totalInvocations} vez/veces al conmutar a mapa`);

    // Restaurar
    MapRoute.calculateOptimalRoute = origCalc;

    // Regresión específica documentada: renderMapView llama a updateMapRouteUI dos veces (línea 783 y línea 788)
    if (totalInvocations === 2) {
      throw new Error(`[REGRESIÓN CONFIRMADA] calculateOptimalRoute se ejecutó 2 veces en lugar de 1. renderMapView() ejecuta updateMapRouteUI() síncronamente antes de ensureLeafletAndMapLoaded, y el callback síncrono lo vuelve a ejecutar.`);
    }

    assert.strictEqual(totalInvocations, 1, 'calculateOptimalRoute debe ejecutarse exactamente 1 vez');
  });

  // Resumen final
  console.log(`\n==================================================`);
  console.log(`RESUMEN CHALLENGER 2 M2:`);
  console.log(`Total: ${totalTests} | Aprobadas: ${passedTests} | Falladas: ${failedTests}`);
  console.log(`==================================================\n`);

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
  runAdversarialM2LifecycleTests().then(res => {
    process.exit(res.failedTests > 0 ? 1 : 0);
  }).catch(err => {
    console.error('Error fatal:', err);
    process.exit(1);
  });
}

module.exports = { runAdversarialM2LifecycleTests };
