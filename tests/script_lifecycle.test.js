/**
 * tests/script_lifecycle.test.js
 * Prueba integral del ciclo de vida de script.js, carga de DOMContentLoaded,
 * adición de productos, y navegación fluida entre pestañas.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const { createTestEnvironment } = require('./mock_dom.js');

async function runScriptLifecycleTests() {
  console.log('Iniciando Suite de Pruebas: Ciclo de Vida y UI de script.js...');

  const env = createTestEnvironment();

  global.window = env.window;
  global.document = env.document;
  global.localStorage = env.localStorage;
  global.navigator = env.navigator;
  global.L = env.L;
  global.echarts = env.echarts;
  global.Swal = env.Swal;
  global.fetch = env.fetch;

  // Cargar módulos requeridos por script.js
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

  // Ejecutar script.js dentro del contexto global
  let executionError = null;
  try {
    eval(scriptContent);
  } catch (err) {
    executionError = err;
  }
  assert.strictEqual(executionError, null, `script.js no debe lanzar errores sintácticos o de evaluación: ${executionError ? executionError.message : ''}`);

  // Disparar DOMContentLoaded
  let domContentLoadedError = null;
  try {
    const evt = new env.DOMEvent('DOMContentLoaded');
    env.document.dispatchEvent(evt);
  } catch (err) {
    domContentLoadedError = err;
  }
  assert.strictEqual(domContentLoadedError, null, `DOMContentLoaded no debe fallar por TDZ o ReferenceError: ${domContentLoadedError ? domContentLoadedError.message : ''}`);
  console.log('  ✓ Test 1: DOMContentLoaded inicializa limpiamente sin excepciones por hoisting ni TDZ');

  // Verificar vinculación de listeners de botones principales
  const addItemBtn = env.document.getElementById('addItemButton');
  const tabList = env.document.getElementById('tab-list');
  const tabStats = env.document.getElementById('tab-stats');
  const tabMap = env.document.getElementById('tab-map');

  assert.ok(addItemBtn.eventListeners.get('click')?.length >= 1, 'addItemButton debe tener event listener de click registrado');
  assert.ok(tabList.eventListeners.get('click')?.length >= 1, 'tab-list debe tener event listener de click');
  assert.ok(tabStats.eventListeners.get('click')?.length >= 1, 'tab-stats debe tener event listener de click');
  assert.ok(tabMap.eventListeners.get('click')?.length >= 1, 'tab-map debe tener event listener de click');
  console.log('  ✓ Test 2: Listeners de eventos de Añadir y Pestañas registrados correctamente');

  // Probar añadir producto
  const itemInput = env.document.getElementById('itemInput');
  const quantityInput = env.document.getElementById('quantityInput');
  const unitPriceInput = env.document.getElementById('unitPriceInput');
  const locationInput = env.document.getElementById('locationInput');
  const categoryInput = env.document.getElementById('categoryInput');

  itemInput.value = 'Gas';
  quantityInput.value = '1';
  unitPriceInput.value = '26000';
  locationInput.value = 'Amarilla Gas';
  categoryInput.value = 'Hogar';

  addItemBtn.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));

  // Dar tiempo a microtareas async
  await new Promise(r => setTimeout(r, 60));

  const container = env.document.getElementById('shoppingListContainer');
  const containerText = container.textContent;
  assert.ok(containerText.includes('Gas'), 'El producto "Gas" debe aparecer en la lista');
  assert.ok(containerText.includes('26000'), 'El precio "$26000" debe aparecer en la lista');
  assert.ok(containerText.includes('Amarilla Gas'), 'La tienda "Amarilla Gas" debe ser el encabezado de grupo');
  console.log('  ✓ Test 3: Añadir producto inserta la tarjeta en el DOM y calcula subtotales');

  // Probar alternancia de pestañas
  const panelList = env.document.getElementById('panel-list');
  const panelStats = env.document.getElementById('panel-stats');
  const panelMap = env.document.getElementById('panel-map');

  assert.strictEqual(panelList.classList.contains('active'), true, 'panel-list debe estar activo inicialmente');

  // Click en Ruta en Mapa
  tabMap.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
  assert.strictEqual(panelMap.classList.contains('active'), true, 'panel-map debe activarse al presionar tab-map');
  assert.strictEqual(panelList.classList.contains('active'), false, 'panel-list debe desactivarse');
  console.log('  ✓ Test 4: Conmutación a pestaña "Ruta en Mapa" exitosa');

  // Click en Estadísticas Financieras
  tabStats.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
  assert.strictEqual(panelStats.classList.contains('active'), true, 'panel-stats debe activarse al presionar tab-stats');
  assert.strictEqual(panelMap.classList.contains('active'), false, 'panel-map debe desactivarse');
  console.log('  ✓ Test 5: Conmutación a pestaña "Estadísticas Financieras" exitosa');

  // Click de vuelta en Lista de Compras
  tabList.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
  assert.strictEqual(panelList.classList.contains('active'), true, 'panel-list debe activarse al presionar tab-list');
  assert.strictEqual(panelStats.classList.contains('active'), false, 'panel-stats debe desactivarse');
  console.log('  ✓ Test 6: Retorno a pestaña "Lista de Compras" exitoso');

  console.log('\n==================================================');
  console.log('RESUMEN DE PRUEBAS LIFECYCLE DE SCRIPT.JS:');
  console.log('Total: 6 | Aprobadas: 6 | Falladas: 0');
  console.log('==================================================\n');
}

runScriptLifecycleTests().catch(err => {
  console.error('Fallo en pruebas de script_lifecycle:', err);
  process.exit(1);
});
