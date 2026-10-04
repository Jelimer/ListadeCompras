/**
 * tests/adversarial_reactivity_stress.test.js
 * Arnés de Pruebas Adversariales y de Estrés Empírico para Reactividad Selectiva (R1) y Debounce/Deduplicación (R2).
 *
 * Ejecución: node tests/adversarial_reactivity_stress.test.js
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const { createTestEnvironment } = require('./mock_dom.js');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

async function test(description, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${description}`);
  } catch (err) {
    failedTests++;
    failures.push({ description, error: err });
    console.error(`  ✗ [FAIL] ${description}`);
    console.error(`     Error: ${err.message}`);
    if (err.stack) {
      const firstLines = err.stack.split('\n').slice(1, 4).join('\n');
      console.error(`     Stack: ${firstLines}`);
    }
  }
}

async function describe(suiteName, fn) {
  console.log(`\n==================================================`);
  console.log(`SUITE ADVERSARIAL: ${suiteName}`);
  console.log(`==================================================`);
  await fn();
}

// Spies globales
let spyCalcRouteCount = 0;
let spyChartRenderCount = 0;
let spyChartResizeCount = 0;
let spyMapInvalidateSizeCount = 0;
let spyLucideCalls = [];
let sortableCreateCount = 0;

function resetSpies() {
  spyCalcRouteCount = 0;
  spyChartRenderCount = 0;
  spyChartResizeCount = 0;
  spyMapInvalidateSizeCount = 0;
  spyLucideCalls = [];
  sortableCreateCount = 0;
}

// Cargar módulos e instalar Spies una sola vez a nivel de proceso
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

const realCalcRoute = MapRoute.calculateOptimalRoute;
MapRoute.calculateOptimalRoute = function (...args) {
  spyCalcRouteCount++;
  return realCalcRoute.apply(this, args);
};

const realChartRender = ChartModule.ChartController.prototype.render;
ChartModule.ChartController.prototype.render = function (...args) {
  spyChartRenderCount++;
  return realChartRender.apply(this, args);
};

const realChartResize = ChartModule.ChartController.prototype.resize;
ChartModule.ChartController.prototype.resize = function (...args) {
  spyChartResizeCount++;
  if (typeof realChartResize === 'function') {
    return realChartResize.apply(this, args);
  }
};

const realInvalidateSize = MapRoute.invalidateSize;
MapRoute.invalidateSize = function (...args) {
  spyMapInvalidateSizeCount++;
  if (typeof realInvalidateSize === 'function') {
    return realInvalidateSize.apply(this, args);
  }
};

async function setupFreshEnvironment() {
  resetSpies();
  const env = createTestEnvironment();

  global.window = env.window;
  global.document = env.document;
  global.localStorage = env.localStorage;
  global.navigator = env.navigator;
  global.L = env.L;
  global.echarts = env.echarts;
  global.Swal = env.Swal;
  global.fetch = env.fetch;

  // Garantizar presencia de MapRouteService en el objeto window y global del entorno
  env.window.MapRouteService = MapRoute;
  env.window.MapRoute = MapRoute;
  global.MapRouteService = MapRoute;
  global.MapRoute = MapRoute;

  env.window.ShoppingChart = ChartModule;
  global.ShoppingChart = ChartModule;

  // Mock Lucide con rastreo de argumentos
  env.window.lucide = {
    createIcons: (options) => {
      spyLucideCalls.push(options);
    }
  };
  global.lucide = env.window.lucide;

  // Mock Sortable con constructor y método .create
  function MockSortable(container, options) {
    this.container = container;
    this.options = options;
  }
  MockSortable.create = function (container, options) {
    sortableCreateCount++;
    return new MockSortable(container, options);
  };
  MockSortable.prototype.destroy = function () {};
  MockSortable.prototype.option = function () {};

  env.window.Sortable = MockSortable;
  global.Sortable = MockSortable;

  // Cargar y evaluar script.js
  const scriptPath = path.resolve(__dirname, '../script.js');
  const scriptContent = fs.readFileSync(scriptPath, 'utf8');
  eval(scriptContent);

  // Disparar DOMContentLoaded
  env.document.dispatchEvent(new env.DOMEvent('DOMContentLoaded'));

  return env;
}

async function runAdversarialReactivityTests() {
  console.log('Iniciando Batería de Pruebas Adversariales de Reactividad y Rendimiento (R1 y R2)...\n');

  // =========================================================================
  // SUITE 1: VERIFICACIÓN DE REACTIVIDAD SELECTIVA EN VISTA 'list' (R1)
  // =========================================================================
  await describe('1. Aislamiento Estricto de Cálculos Pesados en Vista "list"', async () => {
    const env = await setupFreshEnvironment();

    await test('1.1 Inicialización: arranque en vista list no debe calcular ruta ni renderizar gráfico ECharts', () => {
      const renderState = env.window.__getRenderState();
      assert.strictEqual(renderState.currentView, 'list', 'Debe iniciar en vista "list"');
      assert.strictEqual(renderState.listDirty, false, 'listDirty debe ser false tras render');
      assert.strictEqual(renderState.statsDirty, true, 'statsDirty debe estar marcado como true');
      assert.strictEqual(renderState.mapDirty, true, 'mapDirty debe estar marcado como true');

      assert.strictEqual(spyCalcRouteCount, 0, 'calculateOptimalRoute no debe llamarse en el arranque de vista list');
      assert.strictEqual(spyChartRenderCount, 0, 'chartController.render no debe llamarse en el arranque de vista list');
    });

    await test('1.2 Estrés de Inserción: añadir 20 productos consecutivos en vista list mantiene CERO cálculos en mapa y gráfico', async () => {
      const itemInput = env.document.getElementById('itemInput');
      const quantityInput = env.document.getElementById('quantityInput');
      const unitPriceInput = env.document.getElementById('unitPriceInput');
      const locationInput = env.document.getElementById('locationInput');
      const categoryInput = env.document.getElementById('categoryInput');
      const addItemBtn = env.document.getElementById('addItemButton');

      const calcBefore = spyCalcRouteCount;
      const chartBefore = spyChartRenderCount;

      for (let i = 1; i <= 20; i++) {
        itemInput.value = `Producto Test ${i}`;
        quantityInput.value = String(i % 5 + 1);
        unitPriceInput.value = String(10.5 * i);
        locationInput.value = `Supermercado ${(i % 3) + 1}`;
        categoryInput.value = i % 2 === 0 ? 'Almacén' : 'Limpieza';
        addItemBtn.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
      }

      await new Promise(r => setTimeout(r, 80));

      const calcAfter = spyCalcRouteCount;
      const chartAfter = spyChartRenderCount;

      assert.strictEqual(calcAfter - calcBefore, 0, `calculateOptimalRoute fue invocado ${calcAfter - calcBefore} veces durante 20 adiciones (debe ser 0)`);
      assert.strictEqual(chartAfter - chartBefore, 0, `chartController.render fue invocado ${chartAfter - chartBefore} veces durante 20 adiciones (debe ser 0)`);

      const state = env.window.__getRenderState();
      assert.strictEqual(state.currentView, 'list');
      assert.strictEqual(state.statsDirty, true, 'statsDirty debe persistir en true para renderizar bajo demanda al conmutar');
      assert.strictEqual(state.mapDirty, true, 'mapDirty debe persistir en true para renderizar bajo demanda al conmutar');
    });

    await test('1.3 Estrés de Mutación: tildar 10 checkboxes mediante delegación DOM no dispara cálculos en mapa ni gráfico', async () => {
      const container = env.document.getElementById('shoppingListContainer');
      const checkboxes = container.querySelectorAll('.item-checkbox');
      assert.ok(checkboxes.length >= 10, 'Deben existir al menos 10 checkboxes para la prueba');

      const calcBefore = spyCalcRouteCount;
      const chartBefore = spyChartRenderCount;

      for (let i = 0; i < 10; i++) {
        const chk = checkboxes[i];
        chk.checked = true;
        chk.dispatchEvent(new env.DOMEvent('change', { bubbles: true }));
      }

      await new Promise(r => setTimeout(r, 60));

      assert.strictEqual(spyCalcRouteCount - calcBefore, 0, 'calculateOptimalRoute no debe ejecutarse en toggleCompleted');
      assert.strictEqual(spyChartRenderCount - chartBefore, 0, 'chartController.render no debe ejecutarse en toggleCompleted');
    });

    await test('1.4 Estrés de Eliminación y Deshacer: borrar productos mediante delegación no dispara cálculos pesados', async () => {
      const container = env.document.getElementById('shoppingListContainer');
      const delButtons = container.querySelectorAll('.del-btn');
      assert.ok(delButtons.length >= 2, 'Deben existir botones de eliminar');

      const calcBefore = spyCalcRouteCount;
      const chartBefore = spyChartRenderCount;

      delButtons[0].dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 50));

      assert.strictEqual(spyCalcRouteCount - calcBefore, 0, 'calculateOptimalRoute no debe llamarse al borrar producto');
      assert.strictEqual(spyChartRenderCount - chartBefore, 0, 'chartController.render no debe llamarse al borrar producto');
    });

    await test('1.5 Presupuesto y Filtro de ocultar comprados: modificaciones reactivas no tocan mapa ni gráfico', async () => {
      const budgetInput = env.document.getElementById('budgetInput');
      const hideCompleted = env.document.getElementById('hideCompletedSwitch');

      const calcBefore = spyCalcRouteCount;
      const chartBefore = spyChartRenderCount;

      budgetInput.value = '750.50';
      budgetInput.dispatchEvent(new env.DOMEvent('input', { bubbles: true }));

      hideCompleted.checked = true;
      hideCompleted.dispatchEvent(new env.DOMEvent('change', { bubbles: true }));

      await new Promise(r => setTimeout(r, 50));

      assert.strictEqual(spyCalcRouteCount - calcBefore, 0, 'calculateOptimalRoute no debe llamarse al modificar presupuesto o filtros');
      assert.strictEqual(spyChartRenderCount - chartBefore, 0, 'chartController.render no debe llamarse al modificar presupuesto o filtros');
    });
  });

  // =========================================================================
  // SUITE 2: MÁQUINA DE ESTADOS Y TRANSICIÓN DE DIRTY FLAGS (R1)
  // =========================================================================
  await describe('2. Máquina de Estados FSM: Transiciones de Dirty Flags y Renderizado Quirúrgico', async () => {
    const env = await setupFreshEnvironment();

    // Añadir 3 productos de prueba para tener datos en las 3 vistas
    const itemInput = env.document.getElementById('itemInput');
    const unitPriceInput = env.document.getElementById('unitPriceInput');
    const locationInput = env.document.getElementById('locationInput');
    const addItemBtn = env.document.getElementById('addItemButton');

    itemInput.value = 'Manzanas';
    unitPriceInput.value = '150';
    locationInput.value = 'Frutería Sol';
    addItemBtn.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));

    itemInput.value = 'Detergente';
    unitPriceInput.value = '320';
    locationInput.value = 'Super Clean';
    addItemBtn.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));

    await new Promise(r => setTimeout(r, 50));

    await test('2.1 Estado inicial en vista list: statsDirty=true y mapDirty=true', () => {
      const state = env.window.__getRenderState();
      assert.strictEqual(state.currentView, 'list');
      assert.strictEqual(state.listDirty, false);
      assert.strictEqual(state.statsDirty, true);
      assert.strictEqual(state.mapDirty, true);
    });

    await test('2.2 Transición list -> stats: activa panel, limpia statsDirty a false e invoca chartController.render exactamente una vez', async () => {
      const chartBefore = spyChartRenderCount;
      const calcBefore = spyCalcRouteCount;

      env.window.switchAppView('stats');
      await new Promise(r => setTimeout(r, 80));

      const state = env.window.__getRenderState();
      assert.strictEqual(state.currentView, 'stats');
      assert.strictEqual(state.statsDirty, false, 'statsDirty debe transicionar a false al visitar stats');
      assert.strictEqual(state.mapDirty, true, 'mapDirty debe permanecer true');
      assert.strictEqual(spyChartRenderCount - chartBefore, 1, 'chartController.render debe haberse ejecutado exactamente 1 vez');
      assert.strictEqual(spyCalcRouteCount - calcBefore, 0, 'calculateOptimalRoute no debe ejecutarse al conmutar a stats');
      assert.ok(spyChartResizeCount >= 1, 'chartController.resize debe haberse programado/ejecutado');
    });

    await test('2.3 Conmutación idempotente: llamar switchView("stats") repetidamente con statsDirty=false NO vuelve a renderizar el gráfico', async () => {
      const chartBefore = spyChartRenderCount;

      env.window.switchAppView('stats');
      env.window.switchAppView('stats');
      env.window.switchAppView('stats');
      await new Promise(r => setTimeout(r, 80));

      assert.strictEqual(spyChartRenderCount - chartBefore, 0, 'No debe haber re-renderizados redundantes de gráfico si statsDirty ya era false');
    });

    await test('2.4 Modificación de datos mientras la vista activa es "stats": actualiza gráfico y ensucia listDirty y mapDirty', async () => {
      const chartBefore = spyChartRenderCount;
      const calcBefore = spyCalcRouteCount;

      itemInput.value = 'Pan';
      unitPriceInput.value = '80';
      locationInput.value = 'Panadería Sol';
      addItemBtn.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 60));

      const state = env.window.__getRenderState();
      assert.strictEqual(state.currentView, 'stats');
      assert.strictEqual(state.statsDirty, false, 'statsDirty debe ser false porque la vista activa es stats y se refrescó');
      assert.strictEqual(state.listDirty, true, 'listDirty debe marcarse como true al mutar datos en otra vista');
      assert.strictEqual(state.mapDirty, true, 'mapDirty debe marcarse como true al mutar datos en otra vista');
      assert.strictEqual(spyChartRenderCount - chartBefore, 1, 'El gráfico se actualizó inmediatamente porque stats era la vista activa');
      assert.strictEqual(spyCalcRouteCount - calcBefore, 0, 'El mapa no se calculó');
    });

    await test('2.5 Transición stats -> map: activa panel, limpia mapDirty a false e invoca calculateOptimalRoute exactamente una vez', async () => {
      const calcBefore = spyCalcRouteCount;
      const chartBefore = spyChartRenderCount;

      env.window.switchAppView('map');
      await new Promise(r => setTimeout(r, 80));

      const state = env.window.__getRenderState();
      assert.strictEqual(state.currentView, 'map');
      assert.strictEqual(state.mapDirty, false, 'mapDirty debe transicionar a false al visitar map');
      assert.strictEqual(state.listDirty, true, 'listDirty debe continuar en true');
      assert.strictEqual(state.statsDirty, false, 'statsDirty continúa en false porque se renderizó en stats y no hubo mutación desde entonces');
      assert.strictEqual(spyCalcRouteCount - calcBefore, 1, 'calculateOptimalRoute debe haberse ejecutado exactamente 1 vez');
      assert.strictEqual(spyChartRenderCount - chartBefore, 0, 'El gráfico no debe renderizarse al ir a map');
      assert.ok(spyMapInvalidateSizeCount >= 1, 'MapRouteService.invalidateSize debe haberse invocado');
    });

    await test('2.6 Conmutación idempotente en mapa: llamar switchView("map") sin cambios no recalcula la ruta TSP', async () => {
      const calcBefore = spyCalcRouteCount;

      env.window.switchAppView('map');
      env.window.switchAppView('map');
      await new Promise(r => setTimeout(r, 80));

      assert.strictEqual(spyCalcRouteCount - calcBefore, 0, 'No debe haber recálculos de ruta si mapDirty ya era false');
    });

    await test('2.6b Modificación de datos mientras la vista activa es "map": recalcula ruta y ensucia listDirty y statsDirty', async () => {
      const calcBefore = spyCalcRouteCount;
      const chartBefore = spyChartRenderCount;

      itemInput.value = 'Queso';
      unitPriceInput.value = '250';
      locationInput.value = 'Quesería Los Alpes';
      addItemBtn.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 60));

      const state = env.window.__getRenderState();
      assert.strictEqual(state.currentView, 'map');
      assert.strictEqual(state.mapDirty, false, 'mapDirty es false porque la vista activa es map');
      assert.strictEqual(state.listDirty, true, 'listDirty debe ser true');
      assert.strictEqual(state.statsDirty, true, 'statsDirty debe pasar a true tras mutación en mapa');
      assert.strictEqual(spyCalcRouteCount - calcBefore, 1, 'La ruta se actualizó inmediatamente en vista mapa');
      assert.strictEqual(spyChartRenderCount - chartBefore, 0, 'El gráfico no se ejecutó');
    });

    await test('2.7 Transición map -> list: limpia listDirty a false y renderiza el DOM de compras con datos frescos', async () => {
      env.window.switchAppView('list');
      await new Promise(r => setTimeout(r, 60));

      const state = env.window.__getRenderState();
      assert.strictEqual(state.currentView, 'list');
      assert.strictEqual(state.listDirty, false, 'listDirty debe haber transicionado a false');

      const container = env.document.getElementById('shoppingListContainer');
      assert.ok(container.textContent.includes('Pan'), 'El nuevo ítem "Pan" añadido en stats debe aparecer en la lista');
      assert.ok(container.textContent.includes('Queso'), 'El nuevo ítem "Queso" añadido en map debe aparecer en la lista');
    });

    await test('2.8 Invocación forzada renderUI({ forceAll: true }): renderiza las 3 vistas y limpia todas las dirty flags a false', () => {
      const calcBefore = spyCalcRouteCount;
      const chartBefore = spyChartRenderCount;

      env.window.renderAppUI({ forceAll: true });

      const state = env.window.__getRenderState();
      assert.strictEqual(state.listDirty, false, 'listDirty debe ser false tras forceAll');
      assert.strictEqual(state.statsDirty, false, 'statsDirty debe ser false tras forceAll');
      assert.strictEqual(state.mapDirty, false, 'mapDirty debe ser false tras forceAll');
      assert.strictEqual(spyCalcRouteCount - calcBefore, 1, 'Ruta debe haberse forzado');
      assert.strictEqual(spyChartRenderCount - chartBefore, 1, 'Gráfico debe haberse forzado');
    });

    await test('2.9 Resiliencia: switchView con nombres de vista inválidos o nulos degrada suavemente sin romper estado', () => {
      const stateBefore = env.window.__getRenderState();

      env.window.switchAppView('nonexistent');
      env.window.switchAppView('');
      env.window.switchAppView(null);
      env.window.switchAppView(undefined);

      const stateAfter = env.window.__getRenderState();
      assert.strictEqual(stateAfter.currentView, stateBefore.currentView, 'No debe cambiar la vista activa ante inputs inválidos');
    });
  });

  // =========================================================================
  // SUITE 3: DEBOUNCE DE ENTRADA Y BYPASS INMEDIATO EN BÚSQUEDA (R2)
  // =========================================================================
  await describe('3. Verificación Adversarial de Debounce en Búsqueda (150ms) y Bypass Inmediato (0ms)', async () => {
    const env = await setupFreshEnvironment();

    // Añadir ítems para que la búsqueda tenga contenido
    const itemInput = env.document.getElementById('itemInput');
    const addItemBtn = env.document.getElementById('addItemButton');
    ['Leche Entera', 'Leche Descremada', 'Yogur Frutilla', 'Queso Crema'].forEach(n => {
      itemInput.value = n;
      addItemBtn.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
    });
    await new Promise(r => setTimeout(r, 60));

    const searchInput = env.document.getElementById('searchInput');
    const container = env.document.getElementById('shoppingListContainer');

    await test('3.1 Ráfaga de mecanografía rápida (10 pulsaciones cada 25ms): colapsa en un solo refresco tras 150ms de inactividad', async () => {
      const keystrokes = ['l', 'le', 'lec', 'lech', 'leche', 'leche ', 'leche d', 'leche de', 'leche des', 'leche desc'];

      for (const str of keystrokes) {
        searchInput.value = str;
        searchInput.dispatchEvent(new env.DOMEvent('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 25)); // 25ms < 150ms: el temporizador debe cancelarse y reiniciarse en cada pulsación
      }

      // En este instante (25ms tras la última tecla), aún NO han pasado los 150ms
      // El contenedor aún debe tener los 4 ítems porque el filtro no se ha consolidado
      assert.ok(container.textContent.includes('Queso Crema'), 'A los 25ms de la última pulsación el filtro NO debe haberse aplicado aún');

      // Esperamos 170ms adicionales para que el debounce de 150ms expire
      await new Promise(r => setTimeout(r, 170));

      // Ahora sí debe haberse filtrado
      assert.ok(container.textContent.includes('Leche Descremada'), 'Debe mostrar Leche Descremada');
      assert.strictEqual(container.textContent.includes('Queso Crema'), false, 'Queso Crema debe haber sido filtrado');
      assert.strictEqual(container.textContent.includes('Yogur Frutilla'), false, 'Yogur Frutilla debe haber sido filtrado');
    });

    await test('3.2 Bypass Inmediato al vaciar el campo de búsqueda: aplica filtro en 0ms sin esperar 150ms', async () => {
      // Iniciar tipeo para activar el temporizador
      searchInput.value = 'xyz';
      searchInput.dispatchEvent(new env.DOMEvent('input', { bubbles: true }));

      // Inmediatamente vaciar el input
      searchInput.value = '';
      searchInput.dispatchEvent(new env.DOMEvent('input', { bubbles: true }));

      // Inmediatamente (sin esperar 150ms), todos los productos deben reaparecer
      await new Promise(r => setTimeout(r, 15)); // solo 15ms
      assert.ok(container.textContent.includes('Queso Crema'), 'Vaciar el campo debe restaurar la lista de inmediato (0ms bypass)');
      assert.ok(container.textContent.includes('Yogur Frutilla'), 'Vaciar el campo debe restaurar la lista de inmediato');
    });

    await test('3.3 Bypass Inmediato en tecla "Escape": limpia el input y restaura resultados sin retardo', async () => {
      // Filtrar por yogur y esperar consolidación
      searchInput.value = 'Yogur';
      searchInput.dispatchEvent(new env.DOMEvent('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 180));
      assert.strictEqual(container.textContent.includes('Leche Entera'), false);

      // Presionar Escape
      const escEvent = new env.DOMEvent('keydown', { bubbles: true });
      escEvent.key = 'Escape';
      searchInput.dispatchEvent(escEvent);

      await new Promise(r => setTimeout(r, 15));
      assert.strictEqual(searchInput.value, '', 'Escape debe vaciar searchInput.value');
      assert.ok(container.textContent.includes('Leche Entera'), 'Escape debe restaurar todos los productos de inmediato (0ms)');
    });

    await test('3.4 Bypass Inmediato en tecla "Enter": fuerza aplicación instantánea sin agotar los 150ms', async () => {
      searchInput.value = 'Queso';
      searchInput.dispatchEvent(new env.DOMEvent('input', { bubbles: true }));

      // Presionar Enter inmediatamente (a los 10ms, antes de los 150ms)
      await new Promise(r => setTimeout(r, 10));
      const enterEvent = new env.DOMEvent('keydown', { bubbles: true });
      enterEvent.key = 'Enter';
      searchInput.dispatchEvent(enterEvent);

      await new Promise(r => setTimeout(r, 15));
      assert.ok(container.textContent.includes('Queso Crema'), 'Enter debe aplicar el filtro de inmediato');
      assert.strictEqual(container.textContent.includes('Leche Entera'), false, 'Leche Entera debe ser excluida de inmediato');
    });

    await test('3.5 Bypass en evento nativo "search" (limpieza mediante UI del navegador)', async () => {
      searchInput.value = '';
      searchInput.dispatchEvent(new env.DOMEvent('search', { bubbles: true }));

      await new Promise(r => setTimeout(r, 15));
      assert.ok(container.textContent.includes('Leche Entera'), 'Evento search debe procesar el cambio de inmediato');
    });
  });

  // =========================================================================
  // SUITE 4: DEDUPLICACIÓN DE RENDERS Y DELEGACIÓN DOM EFICIENTE (R2, R3)
  // =========================================================================
  await describe('4. Deduplicación de Renderizados y Optimización DOM', async () => {
    const env = await setupFreshEnvironment();

    await test('4.1 Delegación DOM en clics anidados sobre iconos internos de botones de acción', async () => {
      const itemInput = env.document.getElementById('itemInput');
      const addItemBtn = env.document.getElementById('addItemButton');
      itemInput.value = 'Cereal de Avena';
      addItemBtn.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 60));

      const container = env.document.getElementById('shoppingListContainer');
      const delBtn = container.querySelector('.del-btn');
      assert.ok(delBtn, 'Debe existir el botón de eliminar');

      // Crear un nodo hijo simulado dentro del botón (como un <i> o <svg>)
      const iconChild = env.document.createElement('i');
      delBtn.appendChild(iconChild);

      // Disparar click en el hijo profundo
      iconChild.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 60));

      assert.strictEqual(container.textContent.includes('Cereal de Avena'), false, 'El producto debe haber sido eliminado al hacer click en el hijo anidado');
    });

    await test('4.2 Reutilización de SortableJS: conmutar a la vista mapa 5 veces no destruye ni recrea la instancia en bucle', async () => {
      const initialCount = sortableCreateCount;

      for (let i = 0; i < 5; i++) {
        env.window.switchAppView('map');
        await new Promise(r => setTimeout(r, 40));
      }

      // Debe haberse creado como máximo 1 instancia
      const createdCount = sortableCreateCount - initialCount;
      assert.ok(createdCount <= 1, `Sortable.create se invocó ${createdCount} veces en 5 visitas a la pestaña mapa (debe ser <= 1)`);
    });

    await test('4.3 Ámbito acotado de Lucide Icons: llamadas localizadas especifican { root } en vez de escanear document completo', async () => {
      // Conmutar a vista list para asegurar que renderListView sea activo
      env.window.switchAppView('list');
      await new Promise(r => setTimeout(r, 40));

      // Limpiar registro de llamadas
      spyLucideCalls = [];

      const itemInput = env.document.getElementById('itemInput');
      const addItemBtn = env.document.getElementById('addItemButton');
      itemInput.value = 'Mantequilla';
      addItemBtn.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 60));

      // Verificar que las llamadas a lucide durante el renderizado localizado hayan incluido { root: ... }
      const localizedCalls = spyLucideCalls.filter(call => call && call.root);
      assert.ok(localizedCalls.length >= 1, 'Debe existir al menos una llamada a lucide con root delimitado');
    });

    await test('4.4 Aislamiento DOM: mutaciones en mapa NO ejecutan llamadas a lucide en shoppingListContainer', async () => {
      env.window.switchAppView('map');
      await new Promise(r => setTimeout(r, 40));

      spyLucideCalls = [];

      const itemInput = env.document.getElementById('itemInput');
      const addItemBtn = env.document.getElementById('addItemButton');
      itemInput.value = 'Pimienta';
      addItemBtn.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 60));

      const container = env.document.getElementById('shoppingListContainer');
      const listCalls = spyLucideCalls.filter(call => call && call.root === container);
      assert.strictEqual(listCalls.length, 0, 'No debe llamarse lucide en shoppingListContainer cuando la vista activa es mapa');
    });
  });

  // =========================================================================
  // RESUMEN Y RESULTADOS
  // =========================================================================
  console.log(`\n==================================================`);
  console.log(`RESUMEN DE PRUEBAS ADVERSARIALES (R1 y R2):`);
  console.log(`Total: ${totalTests} | Aprobadas: ${passedTests} | Falladas: ${failedTests}`);
  console.log(`==================================================\n`);

  if (failedTests > 0) {
    console.error('ALERTA: Se detectaron fallas adversariales:');
    failures.forEach(f => console.error(` - ${f.description}: ${f.error.message}`));
    process.exit(1);
  } else {
    console.log('¡TODAS LAS PRUEBAS ADVERSARIALES PASARON CON ÉXITO AL 100%!');
    process.exit(0);
  }
}

runAdversarialReactivityTests().catch(err => {
  console.error('Error fatal no capturado en la suite adversarial:', err);
  process.exit(1);
});
