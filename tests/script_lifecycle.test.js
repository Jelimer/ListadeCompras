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

  process.on('unhandledRejection', (err) => {
    console.error('ERROR DENTRO DE DOMContentLoaded:', err);
  });

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

  // Test 7: Modo panorámico en .container
  const appContainer = env.document.querySelector('.container');
  tabMap.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
  assert.strictEqual(appContainer.classList.contains('map-panoramic-mode'), true, '.container debe tener clase map-panoramic-mode al activar mapa');
  tabList.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
  assert.strictEqual(appContainer.classList.contains('map-panoramic-mode'), false, '.container debe remover map-panoramic-mode al salir del mapa');
  console.log('  ✓ Test 7: Modo panorámico activa y desactiva expansión de pantalla completa');

  // Test 8: Renderizado del Itinerario de Paradas
  tabMap.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
  const stopsList = env.document.getElementById('route-stops-list');
  assert.ok(stopsList, 'route-stops-list debe existir en el DOM');
  assert.ok(stopsList.textContent.includes('Amarilla Gas'), 'El itinerario debe incluir la parada de Amarilla Gas');
  assert.ok(stopsList.textContent.includes('Origen:'), 'El itinerario debe incluir el Punto de Partida');
  console.log('  ✓ Test 8: El itinerario de paradas reordenables se renderiza con origen y tiendas');

  // Test 9: Botones flotantes de Zoom y Optimizar
  const btnZoomIn = env.document.getElementById('btn-map-zoom-in');
  const btnZoomOut = env.document.getElementById('btn-map-zoom-out');
  const btnFitBounds = env.document.getElementById('btn-map-fit-bounds');
  const btnResetOrder = env.document.getElementById('btn-reset-route-order');

  assert.ok(btnZoomIn, 'btn-map-zoom-in debe existir');
  assert.ok(btnZoomOut, 'btn-map-zoom-out debe existir');
  assert.ok(btnFitBounds, 'btn-map-fit-bounds debe existir');
  assert.ok(btnResetOrder, 'btn-reset-route-order debe existir');

  // Disparar clics sin errores
  btnZoomIn.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
  btnZoomOut.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
  btnFitBounds.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
  btnResetOrder.dispatchEvent(new env.DOMEvent('click', { bubbles: true }));
  console.log('  ✓ Test 9: Botones flotantes de Zoom In, Zoom Out, Encuadre y Optimizar responden a clics');

  // Test 10: Reordenamiento y persistencia de orden manual
  const mapService = env.window.MapRouteService;
  mapService.setCustomStopOrder(['Tienda B', 'Tienda A']);
  assert.deepStrictEqual(mapService.getCustomStopOrder(), ['Tienda B', 'Tienda A'], 'getCustomStopOrder debe retornar el orden manual');
  mapService.resetCustomStopOrder();
  assert.strictEqual(mapService.getCustomStopOrder(), null, 'resetCustomStopOrder debe limpiar el orden');
  console.log('  ✓ Test 10: Persistencia de orden manual de paradas y reseteo automático validados');

  // Test 11: Gestor de Viajes (Crear, Renombrar, Eliminar, Conmutar)
  const tripSelect = env.document.getElementById('trip-select');
  assert.ok(tripSelect, 'trip-select debe existir en el DOM');
  const initialTrips = mapService.getTripsData();
  assert.ok(Array.isArray(initialTrips.trips), 'getTripsData debe retornar array de viajes');
  assert.ok(initialTrips.trips.length >= 1, 'Debe haber al menos 1 viaje');

  // Crear nuevo viaje
  const createdTrip = mapService.createTrip('Viaje Fin de Semana');
  assert.strictEqual(createdTrip.name, 'Viaje Fin de Semana');
  assert.strictEqual(mapService.getActiveTrip().id, createdTrip.id, 'El nuevo viaje debe quedar activo');

  // Renombrar viaje
  mapService.renameTrip(createdTrip.id, 'Viaje Express');
  assert.strictEqual(mapService.getActiveTrip().name, 'Viaje Express');

  // Eliminar viaje
  mapService.deleteTrip(createdTrip.id);
  assert.notStrictEqual(mapService.getActiveTrip().id, createdTrip.id, 'Tras eliminar, el viaje activo debe cambiar');
  console.log('  ✓ Test 11: Gestor de Viajes (crear, renombrar, eliminar y conmutar) validado');

  // Test 12: Checkboxes de Paradas e Inclusión/Exclusión
  const sampleItems = [
    { id: '1', name: 'Leche', quantity: 2, unitPrice: 100, location: 'Super A', completed: false },
    { id: '2', name: 'Pan', quantity: 1, unitPrice: 50, location: 'Panadería B', completed: false }
  ];
  // Ambas incluidas
  const routeAll = mapService.calculateOptimalRoute(sampleItems, null, { includedStores: ['Super A', 'Panadería B'] });
  assert.strictEqual(routeAll.orderedStops.length, 2, 'Ruta con ambas tiendas debe tener 2 paradas');
  assert.strictEqual(routeAll.allStops.length, 2);

  // Solo Super A incluida (Panadería B destildada)
  const routeOne = mapService.calculateOptimalRoute(sampleItems, null, { includedStores: ['Super A'] });
  assert.strictEqual(routeOne.orderedStops.length, 1, 'Ruta filtrada debe tener solo 1 parada');
  assert.strictEqual(routeOne.orderedStops[0].storeName, 'Super A');
  assert.strictEqual(routeOne.allStops.length, 2, 'allStops debe conservar las 2 tiendas');
  assert.strictEqual(routeOne.allStops.find(s => s.storeName === 'Super A').isIncluded, true);
  assert.strictEqual(routeOne.allStops.find(s => s.storeName === 'Panadería B').isIncluded, false);
  assert.ok(!routeOne.googleMapsUrl.includes('Panader%C3%ADa') && !routeOne.googleMapsUrl.includes('Panaderia'), 'Google Maps URL no debe incluir paradas excluidas');
  console.log('  ✓ Test 12: Checkboxes de paradas y exclusión/inclusión en ruta validados');

  // Test 13: Ajuste de dirección manual y guardado de coordenadas
  const savedOk = mapService.saveStoreCoordinate('Super A', {
    lat: -27.4698,
    lng: -58.8341,
    address: 'Av. 3 de Abril 1200, Corrientes',
    source: 'manual'
  });
  assert.strictEqual(savedOk, true);
  const coords = mapService.getStoredCoordinates();
  const normKey = mapService.normalizeStoreName('Super A');
  assert.strictEqual(coords[normKey].lat, -27.4698);
  assert.strictEqual(coords[normKey].address, 'Av. 3 de Abril 1200, Corrientes');

  // Remover coordenadas
  const removeOk = mapService.removeStoreCoordinate('Super A');
  assert.strictEqual(removeOk, true);
  assert.strictEqual(mapService.getStoredCoordinates()[normKey], undefined);
  console.log('  ✓ Test 13: Ajuste de dirección manual exacta y remoción de coordenadas validados');

  // Test 14: Modo de selección interactiva directa en el mapa
  let pickedResult = null;
  mapService.enablePickLocationMode('Farmacia C', (res) => {
    pickedResult = res;
  });
  // Simular clic en el mapa de Leaflet
  assert.ok(mapService.mapController && mapService.mapController.map, 'mapController debe tener instancia de mapa');
  mapService.mapController.map.fire('click', { latlng: { lat: -27.45, lng: -58.82 } });
  assert.ok(pickedResult, 'Callback de selección en mapa debe recibir las coordenadas');
  assert.strictEqual(pickedResult.storeName, 'Farmacia C');
  assert.strictEqual(pickedResult.lat, -27.45);
  assert.strictEqual(pickedResult.lng, -58.82);

  // Desactivar sin errores
  mapService.disablePickLocationMode();
  console.log('  ✓ Test 14: Modo de selección directa en el mapa interactivo validado');

  // Test 15: Elementos UI del gestor de viajes, modal y picker en el DOM
  const modal = env.document.getElementById('modal-edit-store-location');
  const pickerBanner = env.document.getElementById('map-picker-banner');
  const btnNewTrip = env.document.getElementById('btn-new-trip');
  const btnSelectAll = env.document.getElementById('btn-select-all-trip-stops');
  const btnDeselectAll = env.document.getElementById('btn-deselect-all-trip-stops');

  assert.ok(modal, 'Modal de edición de tienda debe existir en el DOM');
  assert.ok(pickerBanner, 'Banner flotante de selección en mapa debe existir en el DOM');
  assert.ok(btnNewTrip, 'Botón de nuevo viaje debe existir');
  assert.ok(btnSelectAll, 'Botón seleccionar todos debe existir');
  assert.ok(btnDeselectAll, 'Botón deseleccionar todos debe existir');
  console.log('  ✓ Test 15: Componentes DOM del gestor de viajes, modal y picker verificados');

  console.log('\n==================================================');
  console.log('RESUMEN DE PRUEBAS LIFECYCLE DE SCRIPT.JS:');
  console.log('Total: 15 | Aprobadas: 15 | Falladas: 0');
  console.log('==================================================\n');
}

runScriptLifecycleTests().catch(err => {
  console.error('Fallo en pruebas de script_lifecycle:', err);
  process.exit(1);
});

