/**
 * tests/adversarial_challenger2_m1.test.js
 * Arnés de Pruebas Adversariales y de Estrés Empírico — Challenger 2 (M1)
 *
 * Valida de forma exhaustiva e independiente:
 * 1. Delegación de eventos en shoppingListContainer (change, click, keydown, undo toast, mutaciones rápidas).
 * 2. Ciclo de vida persistente de SortableJS (0 destrucciones, 1 sola instancia viva en itinerario de paradas).
 * 3. Scoping estricto de lucide.createIcons ({ root: container }) y tolerancia a fallos cuando Lucide no está disponible.
 * 4. Integridad de directivas de red (preconnect, dns-prefetch) y versionado de caché (?v=2.4.0) en index.html.
 * 5. Eliminación completa de Store fallback obsoleto en script.js.
 * 6. Estrés de eventos masivos de interacción DOM sin fuga de listeners ni degradación.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const { performance } = require('node:perf_hooks');
const { createTestEnvironment } = require('./mock_dom.js');

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
  console.log(`CHALLENGER 2 SUITE: ${suiteTitle}`);
  console.log(`==================================================`);
}

async function runAdversarialM1Tests() {
  console.log('Iniciando Pruebas Adversariales M1 (Challenger 2 — Empirical Verification)...');

  // ---------------------------------------------------------------------------
  // SUITE 1: Verificación Estricta de Assets de Red y Cache-Busting (R4)
  // ---------------------------------------------------------------------------
  describe('Suite 1: Assets de Red y Limpieza de Código (R4)');

  const indexPath = path.resolve(__dirname, '../index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf8');

  await test('R4.1: index.html contiene directivas preconnect completas para todos los orígenes de CDN', () => {
    const requiredPreconnects = [
      'https://fonts.googleapis.com',
      'https://fonts.gstatic.com',
      'https://unpkg.com',
      'https://cdn.jsdelivr.net',
      'https://cdnjs.cloudflare.com',
      'https://www.gstatic.com'
    ];

    for (const origin of requiredPreconnects) {
      const regex = new RegExp(`<link[^>]*rel=["']preconnect["'][^>]*href=["']${origin.replace('.', '\\.')}["']`, 'i');
      assert.ok(regex.test(indexHtml), `Debe existir <link rel="preconnect" href="${origin}"> en index.html`);
    }
  });

  await test('R4.1: index.html contiene directivas dns-prefetch para los CDNs críticos', () => {
    const requiredDnsPrefetch = [
      'https://fonts.googleapis.com',
      'https://fonts.gstatic.com',
      'https://unpkg.com',
      'https://cdn.jsdelivr.net',
      'https://cdnjs.cloudflare.com',
      'https://www.gstatic.com'
    ];

    for (const origin of requiredDnsPrefetch) {
      const regex = new RegExp(`<link[^>]*rel=["']dns-prefetch["'][^>]*href=["']${origin.replace('.', '\\.')}["']`, 'i');
      assert.ok(regex.test(indexHtml), `Debe existir <link rel="dns-prefetch" href="${origin}"> en index.html`);
    }
  });

  await test('R4.2: Sincronización estricta de control de versiones de caché (?v=2.4.0) en assets locales', () => {
    assert.ok(indexHtml.includes('href="style.css?v=2.4.0"'), 'style.css debe tener query parameter ?v=2.4.0');
    assert.ok(indexHtml.includes('src="js/map-route.js?v=2.4.0"'), 'js/map-route.js debe tener query parameter ?v=2.4.0');
    assert.ok(indexHtml.includes('src="script.js?v=2.4.0"'), 'script.js debe tener query parameter ?v=2.4.0');
  });

  const scriptPath = path.resolve(__dirname, '../script.js');
  const scriptContent = fs.readFileSync(scriptPath, 'utf8');

  await test('R4.3: Eliminación absoluta del bloque Store fallback obsoleto en script.js', () => {
    assert.strictEqual(scriptContent.includes('class Store'), false, 'script.js no debe contener definición de class Store');
    assert.ok(scriptContent.includes('StoreClass'), 'script.js debe usar StoreClass proveniente de js/state.js');
  });

  // ---------------------------------------------------------------------------
  // Preparar Entorno Simulado de Navegador para Suites 2, 3, 4 y 5
  // ---------------------------------------------------------------------------
  const { Store: BaseStore } = require('../js/state.js');
  const MapRouteService = require('../js/map-route.js');
  const FeedbackModule = require('../js/ui-feedback.js');

  function setupTestHarness(options = {}) {
    const env = createTestEnvironment();

    // Soporte para window.scrollTo
    env.window.scrollTo = () => {};

    // Extender selector engine en MockElement para pseudo-clases compuestas estándar CSS (:not)
    const ElementClass = env.document.createElement('div').constructor;
    const origQuerySelectorAll = ElementClass.prototype.querySelectorAll;
    ElementClass.prototype.querySelectorAll = function(sel) {
      if (typeof sel === 'string' && sel.includes(':not(')) {
        const notClasses = (sel.match(/:not\(\.([^)]+)\)/g) || []).map(m => m.slice(6, -1));
        const allStopItems = origQuerySelectorAll.call(this, '.route-stop-item');
        return allStopItems.filter(el => {
          for (const nc of notClasses) {
            if (el.classList.contains(nc)) return false;
          }
          if (sel.includes('[data-location]') && !el.hasAttribute('data-location')) return false;
          return true;
        });
      }
      return origQuerySelectorAll.call(this, sel);
    };

    // Captura de la instancia del Store
    let capturedStore = null;
    class InstrumentedStore extends BaseStore {
      constructor(opts) {
        super(opts);
        capturedStore = this;
      }
    }
    env.window.Store = InstrumentedStore;
    global.Store = InstrumentedStore;

    // Vincular explícitamente MapRouteService al entorno actual
    env.window.MapRouteService = MapRouteService;
    env.window.MapRoute = MapRouteService;
    global.MapRouteService = MapRouteService;
    global.MapRoute = MapRouteService;

    // Configurar espía de Lucide
    const lucideCalls = [];
    if (options.disableLucide) {
      env.window.lucide = undefined;
    } else {
      env.window.lucide = {
        createIcons: (opt) => {
          lucideCalls.push(opt);
        }
      };
    }

    // Configurar espía de Sortable
    const sortableInstances = [];
    let sortableCreateCount = 0;
    class MockSortable {
      constructor(el, opts) {
        this.el = el;
        this.options = opts;
        this.destroyed = false;
        sortableInstances.push(this);
      }
      static create(el, opts) {
        sortableCreateCount++;
        const inst = new MockSortable(el, opts);
        return inst;
      }
      destroy() {
        this.destroyed = true;
      }
    }
    env.window.Sortable = MockSortable;
    global.Sortable = MockSortable;

    // Toast de deshacer simulado para captura
    let lastUndoCallback = null;
    let lastToastMessage = null;

    global.window = env.window;
    global.document = env.document;
    global.localStorage = env.localStorage;
    global.navigator = env.navigator;
    global.L = env.L;
    global.echarts = env.echarts;
    global.Swal = env.Swal;
    global.fetch = env.fetch;

    // Cargar módulos requeridos
    require('../firebase-config.js');
    require('../js/storage.js');
    require('../js/validation.js');
    require('../js/avatars.js');
    require('../js/analytics.js');
    require('../js/chart.js');
    require('../js/export-import.js');

    // Interceptar showUndoToast para capturar el callback
    FeedbackModule.showUndoToast = (msg, undoCb) => {
      lastToastMessage = msg;
      lastUndoCallback = undoCb;
    };

    // Evaluar script.js
    eval(scriptContent);

    // Disparar DOMContentLoaded
    const domLoadedEvt = new env.DOMEvent('DOMContentLoaded');
    env.document.dispatchEvent(domLoadedEvt);

    return {
      env,
      getStore: () => capturedStore,
      lucideCalls,
      sortableInstances,
      getSortableCreateCount: () => sortableCreateCount,
      getLastUndo: () => ({ message: lastToastMessage, callback: lastUndoCallback })
    };
  }

  // ---------------------------------------------------------------------------
  // SUITE 2: Delegación de Eventos en shoppingListContainer (R3)
  // ---------------------------------------------------------------------------
  describe('Suite 2: Delegación DOM en shoppingListContainer (R3)');

  await test('R3.1: Las tarjetas individuales se generan sin ningún listener directo (0 listeners en hijos)', async () => {
    const harness = setupTestHarness();
    const doc = harness.env.document;
    const itemInput = doc.getElementById('itemInput');
    const locInput = doc.getElementById('locationInput');
    const addBtn = doc.getElementById('addItemButton');

    // Añadir 3 productos
    for (let i = 1; i <= 3; i++) {
      itemInput.value = `Producto ${i}`;
      locInput.value = `Super ${i}`;
      addBtn.dispatchEvent(new harness.env.DOMEvent('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 10));
    }

    const container = doc.getElementById('shoppingListContainer');
    const cards = container.querySelectorAll('.shopping-item');
    assert.strictEqual(cards.length, 3, 'Debe haber 3 tarjetas renderizadas');

    // Comprobar que ninguna tarjeta ni sus botones internos tienen listeners individuales
    for (const card of cards) {
      assert.strictEqual(card.eventListeners.size, 0, 'La tarjeta no debe tener listeners directos');
      const editBtn = card.querySelector('.edit-btn');
      const delBtn = card.querySelector('.del-btn');
      const chk = card.querySelector('.item-checkbox');

      assert.strictEqual(editBtn.eventListeners.size, 0, 'edit-btn no debe tener listeners directos');
      assert.strictEqual(delBtn.eventListeners.size, 0, 'del-btn no debe tener listeners directos');
      assert.strictEqual(chk.eventListeners.size, 0, 'item-checkbox no debe tener listeners directos');
    }

    // Comprobar que el contenedor padre shoppingListContainer posee exactamente los listeners delegados
    assert.ok(container.eventListeners.has('change'), 'shoppingListContainer debe escuchar change');
    assert.ok(container.eventListeners.has('click'), 'shoppingListContainer debe escuchar click');
    assert.ok(container.eventListeners.has('keydown'), 'shoppingListContainer debe escuchar keydown');
  });

  await test('R3.2: Delegación de evento change en checkboxes conmuta estado en Store bajo ráfaga rápida', async () => {
    const harness = setupTestHarness();
    const doc = harness.env.document;
    const itemInput = doc.getElementById('itemInput');
    const locInput = doc.getElementById('locationInput');
    const addBtn = doc.getElementById('addItemButton');

    // Inyectar 10 productos en la lista
    for (let i = 1; i <= 10; i++) {
      itemInput.value = `Item Ráfaga ${i}`;
      locInput.value = `Tienda Alpha`;
      addBtn.dispatchEvent(new harness.env.DOMEvent('click', { bubbles: true }));
    }
    await new Promise(r => setTimeout(r, 30));

    const container = doc.getElementById('shoppingListContainer');
    const checkboxes = container.querySelectorAll('.item-checkbox');
    assert.strictEqual(checkboxes.length, 10, 'Debe haber 10 checkboxes generados');

    // Alternar los 10 checkboxes mediante evento burbujeante
    for (const chk of checkboxes) {
      chk.checked = true;
      chk.dispatchEvent(new harness.env.DOMEvent('change', { bubbles: true }));
    }
    await new Promise(r => setTimeout(r, 30));

    // Verificar en el Store global que todos los ítems fueron marcados como completados
    const store = harness.getStore();
    assert.ok(store, 'Store debe estar instanciado');
    const storeItems = store.getItems();
    assert.strictEqual(storeItems.length, 10);
    for (const it of storeItems) {
      assert.strictEqual(it.completed, true, `El ítem "${it.name}" debe estar completado`);
    }

    // Desmarcar los primeros 5
    for (let i = 0; i < 5; i++) {
      checkboxes[i].checked = false;
      checkboxes[i].dispatchEvent(new harness.env.DOMEvent('change', { bubbles: true }));
    }
    await new Promise(r => setTimeout(r, 30));

    const updatedItems = store.getItems();
    const completedCount = updatedItems.filter(it => it.completed).length;
    assert.strictEqual(completedCount, 5, 'Deben quedar exactamente 5 ítems completados');
  });

  await test('R3.3: Delegación de click en .edit-btn e íconos hijos activa correctamente el modo edición', async () => {
    const harness = setupTestHarness();
    const doc = harness.env.document;
    const itemInput = doc.getElementById('itemInput');
    const addBtn = doc.getElementById('addItemButton');

    itemInput.value = 'Queso Gouda';
    addBtn.dispatchEvent(new harness.env.DOMEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));

    const container = doc.getElementById('shoppingListContainer');
    const editBtn = container.querySelector('.edit-btn');
    assert.ok(editBtn, 'edit-btn debe existir');

    // Simular clic directo en el icono hijo dentro del botón
    const icon = editBtn.querySelector('i');
    assert.ok(icon, 'Icono data-lucide debe existir dentro del edit-btn');

    icon.dispatchEvent(new harness.env.DOMEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));

    // En modo edición, el input principal debe contener el nombre 'Queso Gouda' y el botón de añadir debe cambiar a 'Guardar'
    assert.strictEqual(itemInput.value, 'Queso Gouda', 'El input debe poblarse con el nombre del ítem a editar');
    assert.ok(addBtn.textContent.includes('Guardar'), 'El botón debe pasar a modo Guardar');
  });

  await test('R3.4: Delegación de click en .del-btn e ícono hijo elimina el ítem y habilita Undo Toast', async () => {
    const harness = setupTestHarness();
    const doc = harness.env.document;
    const itemInput = doc.getElementById('itemInput');
    const addBtn = doc.getElementById('addItemButton');

    itemInput.value = 'Café en Grano';
    addBtn.dispatchEvent(new harness.env.DOMEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));

    const container = doc.getElementById('shoppingListContainer');
    const delBtn = container.querySelector('.del-btn');
    const icon = delBtn.querySelector('i');

    // Clic en el icono hijo de eliminar
    icon.dispatchEvent(new harness.env.DOMEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));

    // Debe haberse eliminado del Store
    const store = harness.getStore();
    assert.strictEqual(store.getItems().length, 0, 'La lista debe quedar vacía');

    // Debe haberse emitido el toast de deshacer
    const undoInfo = harness.getLastUndo();
    assert.ok(undoInfo.message.includes('Café en Grano'), 'Toast debe mencionar el producto eliminado');
    assert.strictEqual(typeof undoInfo.callback, 'function', 'Toast debe contener un callback de deshacer');

    // Ejecutar el callback de deshacer
    await undoInfo.callback();
    await new Promise(r => setTimeout(r, 20));

    // El producto debe reaparecer tanto en el Store como en el DOM
    const restoredItems = store.getItems();
    assert.strictEqual(restoredItems.length, 1, 'El producto debe ser restaurado');
    assert.strictEqual(restoredItems[0].name, 'Café en Grano');

    const restoredCards = container.querySelectorAll('.shopping-item');
    assert.strictEqual(restoredCards.length, 1, 'La tarjeta debe renderizarse nuevamente');

    // Probar que el ítem restaurado sigue respondiendo inmediatamente a la delegación de eventos
    const restoredChk = restoredCards[0].querySelector('.item-checkbox');
    restoredChk.checked = true;
    restoredChk.dispatchEvent(new harness.env.DOMEvent('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));

    assert.strictEqual(store.getItems()[0].completed, true, 'El ítem restaurado responde al evento delegado');
  });

  await test('R3.5: Colapsar y expandir grupos mediante click y accesibilidad de teclado (Enter, Espacio)', async () => {
    const harness = setupTestHarness();
    const doc = harness.env.document;
    const itemInput = doc.getElementById('itemInput');
    const locInput = doc.getElementById('locationInput');
    const addBtn = doc.getElementById('addItemButton');

    itemInput.value = 'Manzanas';
    locInput.value = 'Frutería Central';
    addBtn.dispatchEvent(new harness.env.DOMEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));

    const container = doc.getElementById('shoppingListContainer');
    let groupHeader = container.querySelector('.group-header');
    assert.ok(groupHeader, 'group-header debe existir');

    // 1. Clic en el encabezado
    groupHeader.dispatchEvent(new harness.env.DOMEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));

    let groupDiv = container.querySelector('.location-group');
    assert.ok(groupDiv.classList.contains('collapsed'), 'El grupo debe colapsarse tras el click');

    // 2. Tecla Enter en el nuevo encabezado generado por el render
    groupHeader = container.querySelector('.group-header');
    const enterEvt = new harness.env.DOMEvent('keydown', { bubbles: true });
    enterEvt.key = 'Enter';
    groupHeader.dispatchEvent(enterEvt);
    await new Promise(r => setTimeout(r, 20));

    groupDiv = container.querySelector('.location-group');
    assert.strictEqual(groupDiv.classList.contains('collapsed'), false, 'El grupo debe expandirse con Enter');

    // 3. Tecla Espacio en el nuevo encabezado
    groupHeader = container.querySelector('.group-header');
    const spaceEvt = new harness.env.DOMEvent('keydown', { bubbles: true });
    spaceEvt.key = ' ';
    groupHeader.dispatchEvent(spaceEvt);
    await new Promise(r => setTimeout(r, 20));

    groupDiv = container.querySelector('.location-group');
    assert.ok(groupDiv.classList.contains('collapsed'), 'El grupo debe colapsarse con Espacio');
  });

  // ---------------------------------------------------------------------------
  // SUITE 3: Ciclo de Vida Persistente de SortableJS (R3)
  // ---------------------------------------------------------------------------
  describe('Suite 3: Ciclo de Vida Persistente de SortableJS (R3)');

  await test('R3.6: SortableJS en route-stops-list se inicializa una sola vez y no se destruye en re-renderizados', async () => {
    const harness = setupTestHarness();
    const doc = harness.env.document;
    const itemInput = doc.getElementById('itemInput');
    const locInput = doc.getElementById('locationInput');
    const addBtn = doc.getElementById('addItemButton');

    // Añadir 2 productos con tiendas distintas para que existan paradas activas
    itemInput.value = 'Leche Entera';
    locInput.value = 'Supermercado Central';
    addBtn.dispatchEvent(new harness.env.DOMEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));

    itemInput.value = 'Paracetamol';
    locInput.value = 'Farmacia Norte';
    addBtn.dispatchEvent(new harness.env.DOMEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));

    const tabMap = doc.getElementById('tab-map');
    const tabList = doc.getElementById('tab-list');
    const tabStats = doc.getElementById('tab-stats');

    // Conmutar a la vista de mapa por primera vez
    tabMap.dispatchEvent(new harness.env.DOMEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));

    // Sortable.create debe haberse invocado exactamente 1 vez para las paradas
    const initialCount = harness.getSortableCreateCount();
    assert.strictEqual(initialCount, 1, 'Sortable.create debe haberse llamado exactamente 1 vez para el itinerario');

    // Realizar 25 transiciones y actualizaciones de estado sucesivas
    for (let i = 0; i < 25; i++) {
      tabList.dispatchEvent(new harness.env.DOMEvent('click', { bubbles: true }));
      tabStats.dispatchEvent(new harness.env.DOMEvent('click', { bubbles: true }));
      tabMap.dispatchEvent(new harness.env.DOMEvent('click', { bubbles: true }));
    }
    await new Promise(r => setTimeout(r, 50));

    // Comprobar que Sortable.create NUNCA volvió a llamarse
    const finalCount = harness.getSortableCreateCount();
    assert.strictEqual(finalCount, 1, 'Sortable.create NO debe volverse a llamar tras re-renderizados de ruta');

    // Comprobar que la instancia existente nunca fue destruida
    const stopsInst = harness.sortableInstances.find(inst => inst.el.id === 'route-stops-list');
    assert.ok(stopsInst, 'La instancia de Sortable para route-stops-list debe existir');
    assert.strictEqual(stopsInst.destroyed, false, 'La instancia persistente de Sortable no debe destruirse');
  });

  await test('R3.7: Callback onEnd de Sortable actualiza el orden en MapRouteService', async () => {
    const harness = setupTestHarness();
    const doc = harness.env.document;
    const itemInput = doc.getElementById('itemInput');
    const locInput = doc.getElementById('locationInput');
    const addBtn = doc.getElementById('addItemButton');

    // Añadir tiendas
    itemInput.value = 'Café';
    locInput.value = 'Supermercado B';
    addBtn.dispatchEvent(new harness.env.DOMEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));

    itemInput.value = 'Aspirina';
    locInput.value = 'Farmacia A';
    addBtn.dispatchEvent(new harness.env.DOMEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));

    const tabMap = doc.getElementById('tab-map');
    tabMap.dispatchEvent(new harness.env.DOMEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));

    const stopsInst = harness.sortableInstances.find(inst => inst.el.id === 'route-stops-list');
    assert.ok(stopsInst, 'Instancia de Sortable debe estar viva');
    assert.strictEqual(typeof stopsInst.options.onEnd, 'function', 'Sortable debe tener callback onEnd');

    // El itinerario ya renderizó los items de Supermercado B y Farmacia A.
    // Simular que el usuario arrastró Farmacia A antes de Supermercado B en el DOM
    const stopsList = doc.getElementById('route-stops-list');
    const stopElements = stopsList.querySelectorAll('.route-stop-item:not(.route-origin-item)[data-location]');
    assert.ok(stopElements.length >= 2, 'Deben existir al menos 2 elementos de paradas en el DOM');

    // Invertir orden en el contenedor DOM (mover el primer elemento después del segundo)
    stopsList.appendChild(stopElements[0]);

    // Disparar onEnd simulando finalización de arrastre de SortableJS
    stopsInst.options.onEnd();

    // MapRouteService debe reflejar el nuevo orden invertido
    const currentOrder = MapRouteService.getCustomStopOrder();
    assert.ok(Array.isArray(currentOrder), 'El orden de paradas debe ser un array');
    assert.strictEqual(currentOrder[0], 'Farmacia A', 'La primera parada ahora debe ser Farmacia A');
    assert.strictEqual(currentOrder[1], 'Supermercado B', 'La segunda parada ahora debe ser Supermercado B');
  });

  // ---------------------------------------------------------------------------
  // SUITE 4: Lucide Icons Scoping y Resiliencia (R3)
  // ---------------------------------------------------------------------------
  describe('Suite 4: Lucide Icons Scoping y Resiliencia (R3)');

  await test('R3.8: lucide.createIcons en actualizaciones dinámicas siempre restringe el ámbito a { root }', async () => {
    const harness = setupTestHarness();
    const doc = harness.env.document;

    // Al inicio (DOMContentLoaded) se permite la llamada global inicial
    // Registrar llamadas después de la inicialización
    const initialCallsCount = harness.lucideCalls.length;

    // Provocar render de lista
    const itemInput = doc.getElementById('itemInput');
    const addBtn = doc.getElementById('addItemButton');
    itemInput.value = 'Pan';
    addBtn.dispatchEvent(new harness.env.DOMEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));

    // Provocar cambio de tema
    const themeBtn = doc.getElementById('themeToggle');
    themeBtn.dispatchEvent(new harness.env.DOMEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));

    // Conmutar a mapa
    const tabMap = doc.getElementById('tab-map');
    tabMap.dispatchEvent(new harness.env.DOMEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));

    const dynamicCalls = harness.lucideCalls.slice(initialCallsCount);
    assert.ok(dynamicCalls.length >= 3, 'Debe haber habido múltiples llamadas de lucide dinámicas');

    // Verificar que CADA UNA de las llamadas dinámicas tiene la propiedad root definida
    for (const callArg of dynamicCalls) {
      assert.ok(callArg && typeof callArg === 'object', 'Llamada dinámica de Lucide debe pasar un objeto de opciones');
      assert.ok(callArg.root, 'Llamada dinámica de Lucide debe especificar la propiedad root');
      assert.ok(callArg.root.id || callArg.root.className || callArg.root.tagName, 'El objeto root debe ser un nodo DOM válido');
    }
  });

  await test('R3.9: Tolerancia y resiliencia completa cuando window.lucide no está disponible (CDN offline)', async () => {
    // Configurar arnés donde window.lucide es undefined (simula CDN caído o bloqueado)
    const harnessNoLucide = setupTestHarness({ disableLucide: true });

    // La inicialización y renders de la aplicación deben operar sin errores
    assert.ok(harnessNoLucide, 'El arnés debe instanciarse limpiamente sin Lucide');
    const doc = harnessNoLucide.env.document;
    const itemInput = doc.getElementById('itemInput');
    const addBtn = doc.getElementById('addItemButton');

    // Añadir ítem debe completar exitosamente su lógica de estado y DOM
    itemInput.value = 'Leche Deslactosada';
    addBtn.dispatchEvent(new harnessNoLucide.env.DOMEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));

    const store = harnessNoLucide.getStore();
    const items = store.getItems();
    assert.strictEqual(items.length, 1, 'El producto debe añadirse a pesar de no estar disponible Lucide');
    assert.strictEqual(items[0].name, 'Leche Deslactosada');

    const container = doc.getElementById('shoppingListContainer');
    assert.ok(container.textContent.includes('Leche Deslactosada'), 'El DOM debe reflejar el ítem');
  });

  // ---------------------------------------------------------------------------
  // SUITE 5: Prueba de Estrés en Delegación de Eventos
  // ---------------------------------------------------------------------------
  describe('Suite 5: Estrés de Eventos Concurrentes en DOM');

  await test('R3.10: 200 eventos en ráfaga se resuelven de forma determinista con 0 fugas de listeners', async () => {
    const harness = setupTestHarness();
    const doc = harness.env.document;
    const itemInput = doc.getElementById('itemInput');
    const locInput = doc.getElementById('locationInput');
    const addBtn = doc.getElementById('addItemButton');

    // Crear 10 productos
    for (let i = 1; i <= 10; i++) {
      itemInput.value = `Producto Estrés ${i}`;
      locInput.value = `Tienda ${i % 3}`;
      addBtn.dispatchEvent(new harness.env.DOMEvent('click', { bubbles: true }));
    }
    await new Promise(r => setTimeout(r, 40));

    const container = doc.getElementById('shoppingListContainer');
    const checkboxes = container.querySelectorAll('.item-checkbox');
    assert.strictEqual(checkboxes.length, 10);

    const initialListenersCount = container.eventListeners.size;
    assert.strictEqual(initialListenersCount, 3, 'El contenedor debe tener exactamente 3 listeners (change, click, keydown)');

    // Disparar 200 eventos alternados
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) {
      const targetIdx = i % 10;
      const chk = checkboxes[targetIdx];
      chk.checked = !chk.checked;
      chk.dispatchEvent(new harness.env.DOMEvent('change', { bubbles: true }));
    }
    const duration = performance.now() - t0;

    // Verificar que los listeners del contenedor se mantuvieron invariantes
    assert.strictEqual(container.eventListeners.size, 3, 'No deben haberse acumulado listeners huérfanos');
    console.log(`    [Rendimiento]: 200 eventos procesados en ${duration.toFixed(2)}ms`);
    assert.ok(duration < 1000, `El procesamiento de 200 eventos debe ser rápido (<1000ms, actual: ${duration.toFixed(2)}ms)`);
  });

  console.log('\n==================================================');
  console.log('RESUMEN DE PRUEBAS ADVERSARIALES CHALLENGER 2:');
  console.log(`Total: ${totalTests} | Aprobadas: ${passedTests} | Falladas: ${failedTests}`);
  console.log('==================================================\n');

  if (failedTests > 0) {
    console.error('Fallas detectadas en la verificación adversarial:');
    for (const f of failures) {
      console.error(`- ${f.name}: ${f.error.message}`);
    }
    process.exit(1);
  }
}

runAdversarialM1Tests().catch(err => {
  console.error('Error fatal durante la ejecución adversarial:', err);
  process.exit(1);
});
