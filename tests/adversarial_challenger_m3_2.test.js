/**
 * tests/adversarial_challenger_m3_2.test.js
 * Arnés de Pruebas Adversariales y de Estrés Empírico — Challenger M3-2 (Modo Impresión / PDF y Reactividad DOM)
 *
 * Cobertura de verificación empírica:
 * 1. Reglas @media print en style.css:
 *    - Neutralización de modo oscuro ([data-theme="dark"] forzado a fondo blanco y texto negro).
 *    - Ocultamiento de controles interactivos, navegación, formularios y badges.
 *    - Despliegue incondicional de tiendas colapsadas (.location-group.collapsed).
 *    - Prevención de cortes de página y saltos huérfanos (break-inside / break-after avoid).
 *    - Checkboxes físicos nítidos vectoriales con marca de verificación.
 *    - Aislamiento del resumen de totales (oculto en pantalla, visible en impresión).
 * 2. Ciclo de vida y eventos DOM en script.js:
 *    - #printButton con lista vacía: no invoca window.print() y muestra Toast warning.
 *    - #printButton desde pestañas "stats" y "map": conmuta a "list" antes de imprimir.
 *    - Disparo de evento beforeprint: sincroniza la lista y actualiza #printGrandTotalValue.
 *    - Simulación de entorno sin window.print: ausencia de TypeErrors o fallos no controlados.
 *    - Ráfaga de clics repetitivos (rapid fire) y precisión decimal sin desvío IEEE 754.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const { createTestEnvironment } = require('./mock_dom.js');
const { createStore } = require('../js/state.js');

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
  console.log(`CHALLENGER M3-2 SUITE: ${suiteTitle}`);
  console.log(`==================================================`);
}

async function runAdversarialM3PrintLifecycleTests() {
  console.log('Iniciando Pruebas Adversariales M3-2: Modo Impresión / PDF y Eventos DOM...\n');

  // ===========================================================================
  // SUITE 1: Verificación Empírica de Reglas @media print en style.css
  // ===========================================================================
  describe('Suite 1: Análisis Estático y Semántico de @media print en style.css');

  const cssPath = path.resolve(__dirname, '../style.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  await test('1.1: Existe bloque @media print formalmente definido', () => {
    assert.ok(cssContent.includes('@media print'), 'style.css debe contener bloque @media print');
    const mediaPrintBlock = cssContent.slice(cssContent.indexOf('@media print'));
    assert.ok(mediaPrintBlock.length > 500, 'El bloque @media print debe contener una configuración substancial');
  });

  await test('1.2: Reseteo universal y neutralización total de tema oscuro [data-theme="dark"]', () => {
    const printBlock = cssContent.slice(cssContent.indexOf('@media print'));
    assert.ok(printBlock.includes('[data-theme="dark"]'), 'Debe neutralizar explícitamente [data-theme="dark"]');
    assert.ok(printBlock.includes('--bg-body: #ffffff !important;'), '--bg-body debe forzarse a #ffffff !important');
    assert.ok(printBlock.includes('--text-main: #000000 !important;'), '--text-main debe forzarse a #000000 !important');
    assert.ok(printBlock.includes('background: #ffffff !important;'), 'background de body/html debe forzarse a blanco');
    assert.ok(printBlock.includes('color: #000000 !important;'), 'color de body/html debe forzarse a negro');
    assert.ok(printBlock.includes('print-color-adjust: exact !important;'), 'Debe forzar print-color-adjust exact');
  });

  await test('1.3: Ocultamiento garantizado de controles interactivos, tabs, red y filtros', () => {
    const printBlock = cssContent.slice(cssContent.indexOf('@media print'));
    const requiredHiddenSelectors = [
      '.skip-link',
      '#networkStatusBadge',
      '.header-actions',
      '.view-tabs',
      '.bottom-nav',
      '.input-section',
      '.toolbar-section',
      '#panel-stats',
      '#panel-map',
      '.item-actions',
      '.collapse-icon',
      '.modal-backdrop',
      '.swal2-container',
      '.toast-container',
      '#ariaAnnouncer',
      '.product-avatar',
      '.product-img',
      '.btn'
    ];

    for (const sel of requiredHiddenSelectors) {
      assert.ok(printBlock.includes(sel), `El selector ${sel} debe estar incluido en la regla de ocultamiento para impresión`);
    }
  });

  await test('1.4: Despliegue incondicional forzado de tiendas colapsadas (.location-group.collapsed)', () => {
    const printBlock = cssContent.slice(cssContent.indexOf('@media print'));
    assert.ok(
      printBlock.includes('.location-group.collapsed .shopping-list'),
      'Debe existir regla específica para .location-group.collapsed .shopping-list'
    );
    assert.ok(
      printBlock.includes('display: grid !important;'),
      'Las tiendas colapsadas deben forzarse a display: grid !important para visibilidad completa en papel/PDF'
    );
  });

  await test('1.5: Prevención de cortes de página (break-inside avoid y break-after avoid)', () => {
    const printBlock = cssContent.slice(cssContent.indexOf('@media print'));
    assert.ok(printBlock.includes('break-inside: avoid !important;'), 'Debe incluir break-inside: avoid !important');
    assert.ok(printBlock.includes('page-break-inside: avoid !important;'), 'Debe incluir page-break-inside: avoid para navegadores heredados');
    assert.ok(printBlock.includes('break-after: avoid !important;'), 'Debe incluir break-after: avoid en encabezados para evitar huérfanos');
  });

  await test('1.6: Checkboxes físicos nítidos con marca de verificación vectorial', () => {
    const printBlock = cssContent.slice(cssContent.indexOf('@media print'));
    assert.ok(printBlock.includes('.item-checkbox'), 'Debe estilizar .item-checkbox en print');
    assert.ok(printBlock.includes('border: 1.5px solid #000000 !important;'), 'Debe tener borde negro nítido');
    assert.ok(printBlock.includes('.item-checkbox:checked::after'), 'Debe definir pseudo-elemento para checkbox tildado');
    assert.ok(printBlock.includes('content: "✓" !important;'), 'Debe renderizar marca ✓ clara en impresión');
  });

  await test('1.7: Aislamiento del resumen de impresión (#printListSummary)', () => {
    // Fuera de media print debe estar display: none
    const prePrint = cssContent.slice(0, cssContent.indexOf('@media print'));
    assert.ok(prePrint.includes('.print-list-summary'), 'Debe declarar .print-list-summary antes de @media print');
    assert.ok(prePrint.includes('display: none;'), '.print-list-summary debe estar oculto en pantalla');

    // Dentro de media print debe ser display: block
    const printBlock = cssContent.slice(cssContent.indexOf('@media print'));
    assert.ok(printBlock.includes('.print-list-summary'), 'Debe estilizar .print-list-summary en @media print');
    assert.ok(printBlock.includes('display: block !important;'), '.print-list-summary debe desplegarse en @media print');
  });

  // ===========================================================================
  // SUITE 2: Simulación de Ciclo de Vida y Eventos DOM en script.js
  // ===========================================================================
  describe('Suite 2: Simulación de Eventos DOM y Ciclo de Vida en script.js');

  const env = createTestEnvironment();
  global.window = env.window;
  global.document = env.document;
  global.localStorage = env.localStorage;
  global.navigator = env.navigator;
  global.L = env.L;
  global.echarts = env.echarts;
  global.Swal = env.Swal;
  global.fetch = env.fetch;
  env.window.scrollTo = () => {};
  global.scrollTo = () => {};

  // Mock modules
  require('../firebase-config.js');
  require('../js/map-route.js');
  require('../js/storage.js');
  require('../js/validation.js');
  require('../js/state.js');
  require('../js/avatars.js');
  const AnalyticsModule = require('../js/analytics.js');
  require('../js/chart.js');
  require('../js/export-import.js');
  const FeedbackModule = require('../js/ui-feedback.js');
  require('../js/share.js');

  let toastLog = [];
  FeedbackModule.showToast = function (msg, type) {
    toastLog.push({ msg, type });
  };

  let printCalls = 0;
  env.window.print = function () {
    printCalls++;
  };

  const scriptPath = path.resolve(__dirname, '../script.js');
  const scriptContent = fs.readFileSync(scriptPath, 'utf8');

  // Evaluar script.js
  eval(scriptContent);

  // Disparar DOMContentLoaded
  const dclEvent = new env.DOMEvent('DOMContentLoaded');
  env.document.dispatchEvent(dclEvent);

  const printBtn = env.document.getElementById('printButton');
  const tabList = env.document.getElementById('tab-list');
  const tabStats = env.document.getElementById('tab-stats');
  const tabMap = env.document.getElementById('tab-map');
  const panelList = env.document.getElementById('panel-list');
  const panelStats = env.document.getElementById('panel-stats');
  const panelMap = env.document.getElementById('panel-map');
  const printGrandTotal = env.document.getElementById('printGrandTotalValue');

  await test('2.1: Pulsar #printButton con lista vacía NO invoca window.print() y genera Toast de advertencia', () => {
    printCalls = 0;
    toastLog = [];

    // Asegurar lista vacía
    if (global.ShoppingStore && global.ShoppingStore.store) {
      global.ShoppingStore.store.state.items = [];
    }

    assert.ok(printBtn, '#printButton debe existir en el DOM');
    printBtn.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));

    assert.strictEqual(printCalls, 0, 'window.print() NO debe ser invocado si la lista está vacía');
    assert.ok(toastLog.length >= 1, 'Debe emitirse un toast de aviso');
    assert.strictEqual(toastLog[0].type, 'warning', 'El toast debe ser de tipo warning');
    assert.ok(
      toastLog[0].msg.includes('vacía') || toastLog[0].msg.includes('nada para imprimir'),
      `Mensaje esperado debe alertar de lista vacía: "${toastLog[0].msg}"`
    );
  });

  await test('2.2: Con productos cargados, pulsar #printButton desde pestaña Estadísticas conmuta a vista "list" antes de imprimir', async () => {
    printCalls = 0;
    toastLog = [];

    // Poblar productos en el store
    const store = global.ShoppingStore ? global.ShoppingStore.store : null;
    if (store) {
      store.state.items = [
        { id: 'item-1', name: 'Leche Descremada', location: 'Super A', unitPrice: 1200, quantity: 2, completed: false },
        { id: 'item-2', name: 'Pan Integral', location: 'Panadería B', unitPrice: 800, quantity: 1, completed: false }
      ];
      if (typeof store.emit === 'function') store.emit('state:changed', store.state);
    }

    // Cambiar a pestaña Stats
    tabStats.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
    assert.strictEqual(panelStats.hasAttribute('hidden'), false, 'panelStats debe estar visible');
    assert.strictEqual(panelList.hasAttribute('hidden'), true, 'panelList debe estar oculto antes del print');

    // Pulsar botón de imprimir
    printBtn.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));

    // Debe haber conmutado a lista
    assert.strictEqual(panelList.hasAttribute('hidden'), false, 'panelList debe haberse vuelto visible al solicitar imprimir');
    assert.strictEqual(panelStats.hasAttribute('hidden'), true, 'panelStats debe haberse ocultado');
    assert.strictEqual(printCalls, 1, 'window.print() debe haberse invocado exactamente 1 vez');
  });

  await test('2.3: Con productos cargados, pulsar #printButton desde pestaña Mapa conmuta a vista "list" antes de imprimir', async () => {
    printCalls = 0;

    // Cambiar a pestaña Map
    tabMap.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
    assert.strictEqual(panelMap.hasAttribute('hidden'), false, 'panelMap debe estar visible');
    assert.strictEqual(panelList.hasAttribute('hidden'), true, 'panelList debe estar oculto');

    // Pulsar botón de imprimir
    printBtn.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));

    // Debe haber conmutado a lista
    assert.strictEqual(panelList.hasAttribute('hidden'), false, 'panelList debe estar visible al imprimir');
    assert.strictEqual(panelMap.hasAttribute('hidden'), true, 'panelMap debe estar oculto al imprimir');
    assert.strictEqual(printCalls, 1, 'window.print() debe haberse invocado exactamente 1 vez');
  });

  await test('2.4: Disparar evento beforeprint sincroniza el DOM y actualiza #printGrandTotalValue', () => {
    const store = global.ShoppingStore ? global.ShoppingStore.store : null;
    if (store) {
      store.state.items = [
        { id: 'item-a', name: 'Café de Grano', location: 'Super', unitPrice: 4500.50, quantity: 2, completed: false }, // 9001.00
        { id: 'item-b', name: 'Azúcar Mascabo', location: 'Dietética', unitPrice: 1200, quantity: 1, completed: true }  // completado (no pendiente)
      ];
    }

    // Disparar beforeprint
    const beforePrintEvt = new env.DOMEvent('beforeprint');
    env.window.dispatchEvent(beforePrintEvt);

    assert.ok(printGrandTotal, '#printGrandTotalValue debe existir en el DOM');
    assert.strictEqual(
      printGrandTotal.textContent.trim(),
      '$9001.00',
      `El total pendiente impreso debe actualizarse exactamente a $9001.00; actual: "${printGrandTotal.textContent.trim()}"`
    );
  });

  await test('2.5: Simulación de entorno sin window.print no arroja TypeError ni excepción no controlada', () => {
    const originalPrint = env.window.print;
    delete env.window.print;

    let thrownError = null;
    try {
      printBtn.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
    } catch (err) {
      thrownError = err;
    }

    assert.strictEqual(thrownError, null, 'No debe arrojar ninguna excepción cuando window.print no existe');

    // Restaurar
    env.window.print = originalPrint;
  });

  await test('2.6: Ráfaga de clics repetitivos (rapid-fire 50 clics) no desborda ni rompe el estado', () => {
    printCalls = 0;
    assert.doesNotThrow(() => {
      for (let i = 0; i < 50; i++) {
        printBtn.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
      }
    }, 'Múltiples clics concurrentes deben manejarse de forma idempotente y sin fugas');

    assert.strictEqual(printCalls, 50, 'Cada pulsación válida debe invocar el diálogo de impresión');
  });

  await test('2.7: Sincronización dual de total de impresión: renderUniversalMetrics y beforeprint son consistentes', () => {
    const store = global.ShoppingStore ? global.ShoppingStore.store : null;
    if (store) {
      // 0.10 + 0.20 = 0.30
      store.state.items = [
        { id: 'i1', name: 'Chicle 1', location: 'Kiosco', unitPrice: 0.10, quantity: 1, completed: false },
        { id: 'i2', name: 'Chicle 2', location: 'Kiosco', unitPrice: 0.20, quantity: 1, completed: false }
      ];
      if (typeof store.emit === 'function') store.emit('state:changed', store.state);
    }

    // Comprobar actualización tras state:changed
    assert.strictEqual(printGrandTotal.textContent.trim(), '$0.30', 'renderUniversalMetrics debe formatear $0.30 sin error flotante');

    // Comprobar actualización tras beforeprint
    const beforePrintEvt = new env.DOMEvent('beforeprint');
    env.window.dispatchEvent(beforePrintEvt);
    assert.strictEqual(printGrandTotal.textContent.trim(), '$0.30', 'beforeprint debe mantener consistencia estricta');
  });

  // ===========================================================================
  // RESUMEN FINAL
  // ===========================================================================
  console.log('\n==================================================');
  console.log(`RESUMEN CHALLENGER M3-2:`);
  console.log(`Total Pruebas: ${totalTests}`);
  console.log(`Aprobadas:     ${passedTests}`);
  console.log(`Fallidas:      ${failedTests}`);
  console.log('==================================================');

  if (failedTests > 0) {
    console.error(`\nFALLOS DETECTADOS (${failedTests}):`);
    failures.forEach((f, idx) => {
      console.error(`${idx + 1}. ${f.name}: ${f.error.message}`);
    });
    return false;
  } else {
    console.log('\n✅ 100% DE PRUEBAS ADVERSARIALES M3-2 APROBADAS (Cero Fallos).');
    return true;
  }
}

if (require.main === module) {
  runAdversarialM3PrintLifecycleTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runAdversarialM3PrintLifecycleTests };
