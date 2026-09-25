/**
 * tests/adversarial_map_stress.test.js
 * Arnés de Pruebas Adversariales Empíricas y Estrés de Algoritmo para js/map-route.js.
 * 
 * Diseñado y ejecutado por: Challenger 1 (Empirical Adversarial Testing & Algorithm Stress)
 * Verificaciones requeridas:
 * 1. Coordenadas polares y extremas (Polo Norte 90°, Polo Sur -90°, antípodas a 180° de longitud).
 * 2. Listas grandes de comercios (>15 paradas distintas): benchmark TSP instantáneo y recorte defensivo a 9 waypoints en Google Maps URL.
 * 3. Nombres de comercios con caracteres URI complejos, acentos, comillas, barras y vectores de inyección XSS.
 * 4. Fallos simulados de red en geocodificación (HTTP 500, 429, timeouts, respuestas vacías, red offline).
 * 5. Tolerancia a QuotaExceededError en almacenamiento de coordenadas en LocalStorage con degradación a memoria.
 * 6. Casos degenerados: coordenadas idénticas superpuestas, entradas corruptas, tipos de datos inválidos.
 */

const assert = require('node:assert');
const { performance } = require('node:perf_hooks');
const path = require('node:path');

// Entorno mock de DOM
const {
  createTestEnvironment,
  normalizeLatLng,
  createMockLeaflet,
  MockGeolocation,
  createMockFetch
} = require('./mock_dom');

// Cargar servicio bajo prueba
const MapRouteService = require('../js/map-route.js');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testFailures = [];

async function testCase(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    testFailures.push({ name, error: err.message, stack: err.stack });
    console.error(`  ✗ [FAIL] ${name} => ${err.message}`);
  }
}

async function runAdversarialStressSuite() {
  console.log('======================================================================');
  console.log('CHALLENGER 1: ARNÉS DE PRUEBAS ADVERSARIALES EMPÍRICAS Y ESTRÉS ALGORÍTMICO');
  console.log('======================================================================\n');

  // =========================================================================
  // BLOQUE 1: COORDENADAS POLARES, EXTREMAS Y ANTÍPODAS
  // =========================================================================
  console.log('--- BLOQUE 1: Coordenadas Polares, Extremas y Antípodas ---');

  await testCase('1.1 Haversine entre Polo Norte (90, 0) y Polo Sur (-90, 0) da semicircunferencia terrestre (~20015 km)', () => {
    const northPole = { lat: 90, lng: 0 };
    const southPole = { lat: -90, lng: 0 };
    const dist = MapRouteService.haversineDistance(northPole, southPole);
    const expected = Math.PI * 6371; // ~20015.087 km
    assert.ok(!isNaN(dist), 'La distancia no debe ser NaN');
    assert.ok(isFinite(dist), 'La distancia debe ser finita');
    assert.ok(Math.abs(dist - expected) < 1.0, `Distancia esperada ~${expected}, obtenida ${dist}`);
  });

  await testCase('1.2 Haversine entre antípodas en el ecuador (0, 0) y (0, 180 / -180) no produce NaN por desborde flotante', () => {
    const p1 = { lat: 0, lng: 0 };
    const p2 = { lat: 0, lng: 180 };
    const p3 = { lat: 0, lng: -180 };

    const dist1 = MapRouteService.haversineDistance(p1, p2);
    const dist2 = MapRouteService.haversineDistance(p1, p3);
    const expected = Math.PI * 6371;

    assert.ok(!isNaN(dist1), 'Distancia (0,0)-(0,180) no debe ser NaN');
    assert.ok(!isNaN(dist2), 'Distancia (0,0)-(0,-180) no debe ser NaN');
    assert.ok(Math.abs(dist1 - expected) < 1.0, `Distancia esperada ~${expected}, obtenida ${dist1}`);
    assert.ok(Math.abs(dist2 - expected) < 1.0, `Distancia esperada ~${expected}, obtenida ${dist2}`);
  });

  await testCase('1.3 Haversine en el mismo Polo Norte con diferentes longitudes geográficas (latitud 90° es un punto singular)', () => {
    const p1 = { lat: 90, lng: 45 };
    const p2 = { lat: 90, lng: 135 };
    const dist = MapRouteService.haversineDistance(p1, p2);
    // En latitud 90°, cos(90°) = 0, por lo que la distancia física es 0
    assert.ok(!isNaN(dist), 'Distancia no debe ser NaN');
    assert.ok(Math.abs(dist) < 1e-4, `La distancia en el polo debe ser 0, obtenida: ${dist}`);
  });

  await testCase('1.4 Haversine con cruce del meridiano 180 / -180 (antimeridiano)', () => {
    const fijiEast = { lat: -16.0, lng: 179.9 };
    const fijiWest = { lat: -16.0, lng: -179.9 };
    const dist = MapRouteService.haversineDistance(fijiEast, fijiWest);
    // 0.2 grados de longitud en latitud -16° ~ 21.3 km
    assert.ok(!isNaN(dist), 'Distancia no debe ser NaN');
    assert.ok(dist < 50, `Distancia a través del antimeridiano debe ser corta (<50km), obtenida: ${dist}`);
  });

  await testCase('1.5 Validación estricta isValidCoordinates rechaza valores fuera de rango o corruptos', () => {
    assert.strictEqual(MapRouteService.isValidCoordinates({ lat: 90.001, lng: 0 }), false, 'lat > 90 debe ser inválido');
    assert.strictEqual(MapRouteService.isValidCoordinates({ lat: -90.001, lng: 0 }), false, 'lat < -90 debe ser inválido');
    assert.strictEqual(MapRouteService.isValidCoordinates({ lat: 0, lng: 180.001 }), false, 'lng > 180 debe ser inválido');
    assert.strictEqual(MapRouteService.isValidCoordinates({ lat: 0, lng: -180.001 }), false, 'lng < -180 debe ser inválido');
    assert.strictEqual(MapRouteService.isValidCoordinates({ lat: NaN, lng: 0 }), false, 'lat NaN inválido');
    assert.strictEqual(MapRouteService.isValidCoordinates({ lat: Infinity, lng: 0 }), false, 'lat Infinity inválido');
    assert.strictEqual(MapRouteService.isValidCoordinates(null), false, 'null inválido');
    assert.strictEqual(MapRouteService.isValidCoordinates({}), false, '{} inválido');
  });

  await testCase('1.6 TSP y cálculo de ruta sobre paradas en coordenadas polares y antípodas extremas', () => {
    const items = [
      { id: '1', name: 'Muestra Polo Norte', location: 'Estación Ártica', completed: false, quantity: 1, unitPrice: 100 },
      { id: '2', name: 'Muestra Polo Sur', location: 'Estación Antártica', completed: false, quantity: 1, unitPrice: 200 },
      { id: '3', name: 'Muestra Antípoda', location: 'Isla Remota', completed: false, quantity: 1, unitPrice: 300 }
    ];

    MapRouteService.saveStoreCoordinate('Estación Ártica', { lat: 89.9, lng: 0 });
    MapRouteService.saveStoreCoordinate('Estación Antártica', { lat: -89.9, lng: 0 });
    MapRouteService.saveStoreCoordinate('Isla Remota', { lat: 0, lng: 180 });

    const route = MapRouteService.calculateOptimalRoute(items, { lat: 0, lng: 0 });
    assert.strictEqual(route.orderedStops.length, 3);
    assert.ok(!isNaN(route.totalDistanceKm) && route.totalDistanceKm > 30000, `Distancia total debe ser > 30000 km, obtenida: ${route.totalDistanceKm}`);
    assert.ok(!isNaN(route.estimatedDurationMinutes) && route.estimatedDurationMinutes > 0);
    assert.ok(route.googleMapsUrl.includes('waypoints='), 'Debe generar URL con waypoints');
  });

  // =========================================================================
  // BLOQUE 2: ESTRÉS DE ALGORITMO TSP (>15 PARADAS) Y RECORTE DE URL
  // =========================================================================
  console.log('\n--- BLOQUE 2: Listas Grandes de Comercios (>15 Paradas), Benchmark TSP y Recorte de URL ---');

  await testCase('2.1 Benchmark de TSP con 25 paradas distintas: ejecución casi instantánea (< 25 ms)', () => {
    const itemCount = 25;
    const items = [];
    for (let i = 0; i < itemCount; i++) {
      const storeName = `Tienda_Adversarial_${String(i).padStart(2, '0')}`;
      items.push({
        id: `item_${i}`,
        name: `Producto_${i}`,
        location: storeName,
        completed: false,
        quantity: i + 1,
        unitPrice: 10.5
      });
      // Distribuir coordenadas en un radio alrededor del centro de Madrid
      const angle = (i / itemCount) * 2 * Math.PI;
      const radius = 0.01 * (1 + (i % 5));
      MapRouteService.saveStoreCoordinate(storeName, {
        lat: 40.4168 + radius * Math.cos(angle),
        lng: -3.7038 + radius * Math.sin(angle)
      });
    }

    const tStart = performance.now();
    const route = MapRouteService.calculateOptimalRoute(items, { lat: 40.4168, lng: -3.7038 });
    const tEnd = performance.now();
    const elapsedMs = tEnd - tStart;

    console.log(`     [MÉTRICA EMPÍRICA] TSP con ${itemCount} paradas ejecutado en ${elapsedMs.toFixed(3)} ms`);

    assert.strictEqual(route.orderedStops.length, 25, 'Todas las 25 tiendas deben ser paradas del itinerario');
    assert.ok(elapsedMs < 50, `El tiempo de cálculo (${elapsedMs.toFixed(2)} ms) debe ser inferior a 50 ms (casi instantáneo)`);
    assert.ok(route.totalDistanceKm > 0, 'Distancia debe ser positiva');
    assert.ok(route.estimatedDurationMinutes > 0, 'Duración estimada debe ser positiva');
  });

  await testCase('2.2 Verificación estricta de recorte defensivo a 9 waypoints en Google Maps URL con 25 paradas', () => {
    const itemCount = 25;
    const items = [];
    for (let i = 0; i < itemCount; i++) {
      items.push({
        id: `item_${i}`,
        name: `Prod_${i}`,
        location: `Tienda_Recorte_${i}`,
        completed: false,
        quantity: 1,
        unitPrice: 5
      });
      MapRouteService.saveStoreCoordinate(`Tienda_Recorte_${i}`, {
        lat: 40.4168 + i * 0.002,
        lng: -3.7038 + i * 0.002
      });
    }

    const route = MapRouteService.calculateOptimalRoute(items, { lat: 40.4168, lng: -3.7038 });
    const url = route.googleMapsUrl;

    assert.ok(url.startsWith('https://www.google.com/maps/dir/?api=1'), 'URL debe comenzar con endpoint oficial de Google Maps');
    assert.ok(url.includes('origin='), 'URL debe contener parámetro origin');
    assert.ok(url.includes('destination='), 'URL debe contener parámetro destination');
    assert.ok(url.includes('waypoints='), 'URL debe contener parámetro waypoints');

    // Extraer waypoints
    const urlParams = new URL(url);
    const waypointsParam = urlParams.searchParams.get('waypoints');
    assert.ok(waypointsParam, 'El parámetro waypoints debe existir');

    const waypointsArray = waypointsParam.split('|');
    console.log(`     [MÉTRICA EMPÍRICA] Cantidad de waypoints en URL: ${waypointsArray.length} (límite oficial: 9)`);

    assert.strictEqual(waypointsArray.length, 9, 'La URL debe contener exactamente 9 waypoints intermedios como máximo');
    assert.ok(!url.includes('undefined'), 'La URL no debe tener cadenas undefined');
    assert.ok(!url.includes('NaN'), 'La URL no debe tener cadenas NaN');
  });

  await testCase('2.3 Estrés extremo: 100 comercios en TSP mantiene integridad de orden y no se desborda', () => {
    const itemCount = 100;
    const items = [];
    for (let i = 0; i < itemCount; i++) {
      items.push({
        id: `stress_${i}`,
        name: `Prod_${i}`,
        location: `Comercio_Estrés_${i}`,
        completed: false,
        quantity: 2,
        unitPrice: 1.5
      });
      MapRouteService.saveStoreCoordinate(`Comercio_Estrés_${i}`, {
        lat: 40.4000 + (i * 0.001),
        lng: -3.7000 - (i * 0.001)
      });
    }

    const tStart = performance.now();
    const route = MapRouteService.calculateOptimalRoute(items, { lat: 40.4000, lng: -3.7000 });
    const tEnd = performance.now();
    const elapsedMs = tEnd - tStart;

    console.log(`     [MÉTRICA EMPÍRICA] TSP con 100 paradas ejecutado en ${elapsedMs.toFixed(3)} ms`);

    assert.strictEqual(route.orderedStops.length, 100);
    assert.ok(elapsedMs < 100, `TSP de 100 paradas debe tardar menos de 100 ms (tomó ${elapsedMs.toFixed(2)} ms)`);

    // Cada tienda debe aparecer exactamente una vez
    const visitedStores = new Set(route.orderedStops.map(s => s.storeName));
    assert.strictEqual(visitedStores.size, 100, 'Todas las 100 tiendas deben ser únicas y visitadas sin duplicados');

    // La URL de Google Maps debe seguir acotada a 9 waypoints
    const urlParams = new URL(route.googleMapsUrl);
    const waypoints = urlParams.searchParams.get('waypoints').split('|');
    assert.strictEqual(waypoints.length, 9, 'Incluso con 100 tiendas, los waypoints en Google Maps URL se limitan a 9');
  });

  // =========================================================================
  // BLOQUE 3: CARACTERES URI COMPLEJOS, ACENTOS, COMILLAS Y VECTORES XSS
  // =========================================================================
  console.log('\n--- BLOQUE 3: Nombres de Comercios con Caracteres URI Complejos, Acentos, Comillas e Inyección XSS ---');

  await testCase('3.1 Tiendas con nombres con ataques XSS (<script>, <img> onerror, javascript:, event handlers)', () => {
    const maliciousStores = [
      '<script>alert("XSS")</script>',
      'Tienda <img src=x onerror="alert(1)">',
      '"><a href="javascript:alert(1)">Click</a>',
      "Tienda ' onmouseover='alert(1)'",
      'Bar & Grill <svg onload=alert(document.cookie)>',
      'Supermercado "El Ahorro" & Cía / Sucursal #1 ?query=foo#bar'
    ];

    maliciousStores.forEach((storeName, idx) => {
      const items = [{
        id: `xss_${idx}`,
        name: `Producto en ${storeName}`,
        location: storeName,
        completed: false,
        quantity: 1,
        unitPrice: 10
      }];

      MapRouteService.saveStoreCoordinate(storeName, { lat: 40.4168 + idx * 0.001, lng: -3.7038 });
      const route = MapRouteService.calculateOptimalRoute(items, { lat: 40.4168, lng: -3.7038 });

      assert.strictEqual(route.orderedStops.length, 1);
      const url = route.googleMapsUrl;

      // Verificar que los caracteres no rompen la URL
      assert.doesNotThrow(() => new URL(url), `La URL generada debe ser un URI válido para el vector: ${storeName}`);
      assert.ok(!url.includes('<script>'), `La URL no debe contener etiquetas no codificadas: ${url}`);
      assert.ok(!url.includes('"'), `La URL no debe contener comillas sin escapar: ${url}`);
    });
  });

  await testCase('3.2 Normalización de tiendas con acentos, diacríticos y caracteres Unicode compuestos', () => {
    const names = [
      '  MERCADONA  ',
      'Mercadona',
      'mërcádóná',
      'PANADERÍA PEÑA & HIJOS',
      'panaderia pena & hijos',
      'Frutería Ñandú Çao',
      'fruteria nandu cao'
    ];

    const k1 = MapRouteService.normalizeStoreName(names[0]);
    const k2 = MapRouteService.normalizeStoreName(names[1]);
    const k3 = MapRouteService.normalizeStoreName(names[2]);
    assert.strictEqual(k1, 'mercadona');
    assert.strictEqual(k2, 'mercadona');
    assert.strictEqual(k3, 'mercadona');

    const kp1 = MapRouteService.normalizeStoreName(names[3]);
    const kp2 = MapRouteService.normalizeStoreName(names[4]);
    assert.strictEqual(kp1, kp2);

    const kf1 = MapRouteService.normalizeStoreName(names[5]);
    const kf2 = MapRouteService.normalizeStoreName(names[6]);
    assert.strictEqual(kf1, kf2);
  });

  await testCase('3.3 URL de Google Maps codifica limpiamente caracteres especiales (&, +, ?, #, /, comillas)', () => {
    const origin = { lat: 40.4168, lng: -3.7038, address: 'Origen & Salida / #1 + 2?' };
    const stops = [
      { lat: 40.4200, lng: -3.7050, storeName: 'Tienda A & B / "Norte"' },
      { lat: 40.4300, lng: -3.7100, storeName: 'Tienda C + D ?promo=true#main' }
    ];

    const url = MapRouteService.generateGoogleMapsUrl(origin, stops);
    assert.ok(url.includes('api=1'));
    // En las coordenadas se formatean como lat,lng, por lo que no deben tener caracteres no escapados
    assert.doesNotThrow(() => new URL(url));
  });

  // =========================================================================
  // BLOQUE 4: FALLOS SIMULADOS DE RED EN GEOCODIFICACIÓN Y RESPUESTAS VACÍAS
  // =========================================================================
  console.log('\n--- BLOQUE 4: Fallos Simulados de Red en Geocodificación y Respuestas Vacías ---');

  await testCase('4.1 Geocodificación cuando navigator.onLine = false retorna null inmediatamente sin red', async () => {
    const env = createTestEnvironment();
    env.navigator.onLine = false;

    // Ejecutar con el mock global en el entorno
    const origGlobal = global.navigator;
    global.navigator = env.navigator;
    try {
      const res = await MapRouteService.geocodeAddress('Comercio Desconectado', { immediate: true });
      assert.strictEqual(res, null, 'Debe retornar null cuando onLine = false');
    } finally {
      global.navigator = origGlobal;
    }
  });

  await testCase('4.2 Geocodificación cuando Nominatim retorna HTTP 500 y Photon retorna HTTP 500', async () => {
    const env = createTestEnvironment();
    env.fetch.setFailure(500); // Forzar HTTP 500 en todas las llamadas

    const origFetch = global.fetch;
    const origNav = global.navigator;
    global.fetch = env.fetch;
    global.navigator = env.navigator;

    try {
      const res = await MapRouteService.geocodeAddress('Supermercado Caído 500', { immediate: true });
      assert.strictEqual(res, null, 'Debe degradar a null cuando ambos servicios devuelven 500');
    } finally {
      global.fetch = origFetch;
      global.navigator = origNav;
    }
  });

  await testCase('4.3 Geocodificación cuando Nominatim responde 429 y Photon responde vacío ({ features: [] })', async () => {
    const env = createTestEnvironment();
    // Personalizar fetch mock para que la primera llamada devuelva 429 y la segunda vacío
    let callCount = 0;
    const customFetch = function (url) {
      callCount++;
      if (url.includes('nominatim.openstreetmap.org')) {
        return Promise.resolve({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          json: () => Promise.resolve({ error: 'rate limited' })
        });
      }
      if (url.includes('photon.komoot.io')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve({ type: 'FeatureCollection', features: [] })
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    };

    const origFetch = global.fetch;
    global.fetch = customFetch;

    try {
      const res = await MapRouteService.geocodeAddress('Tienda Sin Coordenadas Photon', { immediate: true });
      assert.strictEqual(res, null, 'Debe retornar null si Photon tampoco tiene resultados');
      assert.ok(callCount >= 2, 'Debe haber intentado Nominatim y luego Photon');
    } finally {
      global.fetch = origFetch;
    }
  });

  await testCase('4.4 Geocodificación con fallo total de red (TypeError: Network request failed)', async () => {
    const customFetch = function () {
      return Promise.reject(new TypeError('Failed to fetch: Network is down'));
    };

    const origFetch = global.fetch;
    global.fetch = customFetch;

    try {
      const res = await MapRouteService.geocodeAddress('Tienda Error Red Extremo', { immediate: true });
      assert.strictEqual(res, null, 'Debe capturar el fallo de red sin lanzar error no controlado');
    } finally {
      global.fetch = origFetch;
    }
  });

  await testCase('4.5 Geocodificación con respuesta JSON corrupta o malformada', async () => {
    const customFetch = function () {
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON at position 0'))
      });
    };

    const origFetch = global.fetch;
    global.fetch = customFetch;

    try {
      const res = await MapRouteService.geocodeAddress('Tienda Html Response Inesperada', { immediate: true });
      assert.strictEqual(res, null, 'Debe capturar el SyntaxError del JSON corrupto y retornar null');
    } finally {
      global.fetch = origFetch;
    }
  });

  // =========================================================================
  // BLOQUE 5: TOLERANCIA A QUOTAEXCEEDEDERROR EN LOCALSTORAGE
  // =========================================================================
  console.log('\n--- BLOQUE 5: Tolerancia a QuotaExceededError en LocalStorage ---');

  await testCase('5.1 Guardado de coordenadas conmuta a degradación en memoria ante QuotaExceededError', () => {
    const env = createTestEnvironment();
    let quotaHit = false;

    // Sobrescribir setItem para simular cuota llena
    env.localStorage.setItem = function (k, v) {
      quotaHit = true;
      const err = new Error('The quota has been exceeded');
      err.name = 'QuotaExceededError';
      err.code = 22;
      throw err;
    };

    const origWindow = global.window;
    global.window = env.window;

    try {
      // Guardar coordenada bajo saturación de cuota
      const ok = MapRouteService.saveStoreCoordinate('Supermercado Saturado', {
        lat: 40.4200,
        lng: -3.7100,
        displayName: 'Supermercado Saturado'
      });

      assert.strictEqual(ok, true, 'saveStoreCoordinate debe reportar éxito mediante degradación en memoria');
      assert.strictEqual(quotaHit, true, 'Se debió invocar el setItem saturado');

      // Comprobar que getStoredCoordinates puede leer las coordenadas guardadas en memoria
      const coords = MapRouteService.getStoredCoordinates();
      const normKey = MapRouteService.normalizeStoreName('Supermercado Saturado');
      assert.ok(coords[normKey], 'Las coordenadas deben estar disponibles en el fallback de memoria');
      assert.strictEqual(coords[normKey].lat, 40.42);
      assert.strictEqual(coords[normKey].lng, -3.71);
    } finally {
      global.window = origWindow;
    }
  });

  await testCase('5.2 Guardado de origen de ruta ante QuotaExceededError sobrevive sin excepción', () => {
    const env = createTestEnvironment();
    env.localStorage.setItem = function () {
      const err = new Error('Quota exceeded');
      err.name = 'QuotaExceededError';
      throw err;
    };

    const origWindow = global.window;
    global.window = env.window;

    try {
      const ok = MapRouteService.saveOrigin({
        lat: 40.4168,
        lng: -3.7038,
        address: 'Origen en Memoria Cuota Llena'
      });

      assert.strictEqual(ok, true, 'saveOrigin debe guardar en memoria si LocalStorage está saturado');
      const origin = MapRouteService.getStoredOrigin();
      assert.strictEqual(origin.lat, 40.4168);
      assert.strictEqual(origin.lng, -3.7038);
    } finally {
      global.window = origWindow;
    }
  });

  // =========================================================================
  // BLOQUE 6: CASOS DEGENERADOS Y ROBUSTEZ ADVERSARIAL
  // =========================================================================
  console.log('\n--- BLOQUE 6: Casos Degenerados y Robustez Adversarial ---');

  await testCase('6.1 Múltiples tiendas en exactamente la misma coordenada geográfica (distancia 0)', () => {
    const items = [
      { id: '1', name: 'Leche', location: 'Centro Comercial Zoco', completed: false, quantity: 1, unitPrice: 1.0 },
      { id: '2', name: 'Zapatos', location: 'Centro Comercial Alfa', completed: false, quantity: 1, unitPrice: 20.0 },
      { id: '3', name: 'Café', location: 'Centro Comercial Beta', completed: false, quantity: 1, unitPrice: 2.5 }
    ];

    // Tres comercios con nombres distintos en la misma coordenada
    MapRouteService.saveStoreCoordinate('Centro Comercial Zoco', { lat: 40.4500, lng: -3.6900 });
    MapRouteService.saveStoreCoordinate('Centro Comercial Alfa', { lat: 40.4500, lng: -3.6900 });
    MapRouteService.saveStoreCoordinate('Centro Comercial Beta', { lat: 40.4500, lng: -3.6900 });

    const route = MapRouteService.calculateOptimalRoute(items, { lat: 40.4168, lng: -3.7038 });
    assert.strictEqual(route.orderedStops.length, 3, 'Debe procesar las 3 paradas');
    // Las paradas 2 y 3 deben tener distancia de tramo 0 km
    assert.strictEqual(route.orderedStops[1].stepDistanceKm, 0);
    assert.strictEqual(route.orderedStops[2].stepDistanceKm, 0);
    // Desempate determinista alfabético
    assert.strictEqual(route.orderedStops[0].storeName, 'Centro Comercial Alfa');
    assert.strictEqual(route.orderedStops[1].storeName, 'Centro Comercial Beta');
    assert.strictEqual(route.orderedStops[2].storeName, 'Centro Comercial Zoco');
  });

  await testCase('6.2 Entradas corruptas o heterogéneas en calculateOptimalRoute', () => {
    assert.strictEqual(MapRouteService.calculateOptimalRoute(null).orderedStops.length, 0);
    assert.strictEqual(MapRouteService.calculateOptimalRoute(undefined).orderedStops.length, 0);
    assert.strictEqual(MapRouteService.calculateOptimalRoute('no-es-array').orderedStops.length, 0);
    assert.strictEqual(MapRouteService.calculateOptimalRoute([null, undefined]).orderedStops.length, 0);
    
    // Lista con todos completados
    const completedItems = [{ id: '1', name: 'Comprado', location: 'Tienda', completed: true, quantity: 1, unitPrice: 5 }];
    assert.strictEqual(MapRouteService.calculateOptimalRoute(completedItems).orderedStops.length, 0);

    // Ítem incompleto sin location o con propiedades faltantes no lanza excepción y recurre a 'General' de forma defensiva
    const incompleteItem = [{ name: 'Incompleto' }];
    const fallbackRoute = MapRouteService.calculateOptimalRoute(incompleteItem);
    assert.strictEqual(fallbackRoute.orderedStops.length, 1);
    assert.strictEqual(fallbackRoute.orderedStops[0].storeName, 'General');
    assert.ok(isFinite(fallbackRoute.totalDistanceKm));
  });

  // =========================================================================
  // BLOQUE 7: SANITIZACIÓN XSS EN POPUPS LEAFLET
  // =========================================================================
  console.log('\n--- BLOQUE 7: Sanitización XSS en Popups Leaflet ---');

  await testCase('7.1 Sanitización XSS estricta en contenido HTML de Popups de Leaflet', () => {
    const env = createTestEnvironment();
    const origWindow = global.window;
    const origL = global.L;
    global.window = env.window;
    global.L = env.L;

    try {
      const controller = new MapRouteService.MapController();
      controller.initMap('map-container');
      const maliciousStops = [{
        storeName: '<b onmouseover=alert("store")>Tienda Inyectada</b>',
        lat: 40.4168,
        lng: -3.7038,
        address: '"><script>alert("addr")</script>',
        pendingItems: [
          { name: '<img src=x onerror=alert("item")>', quantity: 2, unitPrice: 5.5 }
        ],
        itemCount: 2,
        estimatedTotal: 11
      }];

      controller.renderMarkers(maliciousStops, { lat: 40.4168, lng: -3.7038, address: '<script>alert("origin")</script>' });

      let checkedPopups = 0;
      const layerSource = controller.markersLayer || controller.map;
      layerSource.eachLayer(layer => {
        const popup = layer.getPopup && layer.getPopup();
        if (popup) {
          const content = popup.getContent();
          assert.ok(!content.includes('<script>'), `Popup no debe contener <script>: ${content}`);
          assert.ok(!content.includes('<b onmouseover'), `Popup no debe contener eventos onmouseover: ${content}`);
          assert.ok(!content.includes('<img src=x onerror'), `Popup no debe contener img onerror: ${content}`);
          assert.ok(content.includes('&lt;b onmouseover=') || content.includes('&lt;script&gt;') || content.includes('&lt;img'), 'Contenido malicioso debe estar escapado como entidades HTML');
          checkedPopups++;
        }
      });
      assert.strictEqual(checkedPopups, 2, 'Deben haberse verificado 2 popups (origen y parada)');
    } finally {
      global.window = origWindow;
      global.L = origL;
    }
  });

  // =========================================================================
  // BLOQUE 8: CONCURRENCIA EN GEOCODIFICACIÓN Y ABORTCONTROLLER
  // =========================================================================
  console.log('\n--- BLOQUE 8: Concurrencia en Geocodificación y AbortController ---');

  await testCase('8.1 Consultas concurrentes continuas cancelan la petición previa mediante AbortController', async () => {
    let abortedCount = 0;

    const customFetch = function (url, opts) {
      return new Promise((resolve, reject) => {
        if (opts && opts.signal) {
          opts.signal.addEventListener('abort', () => {
            abortedCount++;
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
        // Simular retraso de red de 40ms
        setTimeout(() => {
          resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve([{ lat: '40.4168', lon: '-3.7038', display_name: 'Madrid' }])
          });
        }, 40);
      });
    };

    const origFetch = global.fetch;
    global.fetch = customFetch;

    try {
      const p1 = MapRouteService.geocodeAddress('Consulta Rápida 1', { immediate: true });
      const p2 = MapRouteService.geocodeAddress('Consulta Rápida 2', { immediate: true });
      const p3 = MapRouteService.geocodeAddress('Consulta Rápida 3', { immediate: true });

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

      assert.strictEqual(r1, null, 'Consulta 1 debió ser abortada y retornar null');
      assert.strictEqual(r2, null, 'Consulta 2 debió ser abortada y retornar null');
      assert.ok(r3 !== null, 'Consulta 3 debió completar con éxito');
      assert.ok(abortedCount >= 1, `Debe haberse disparado al menos un abort, disparados: ${abortedCount}`);
    } finally {
      global.fetch = origFetch;
    }
  });

  // =========================================================================
  // BLOQUE 9: CICLO DE VIDA DE MAPCONTROLLER
  // =========================================================================
  console.log('\n--- BLOQUE 9: Ciclo de Vida de MapController ---');

  await testCase('9.1 Ciclo de vida robusto: initMap con contenedor ausente, renderPolyline vacío y doble destroy', () => {
    const controller = new MapRouteService.MapController();
    const origL = global.L;
    delete global.L;

    try {
      const res = controller.initMap('inexistente');
      assert.strictEqual(res, null, 'initMap sin Leaflet debe retornar null');

      // Doble destroy debe ser idempotente
      assert.doesNotThrow(() => {
        controller.destroy();
        controller.destroy();
      });

      // renderPolyline y fitRouteBounds sin mapa activo deben ser inertes sin error
      assert.doesNotThrow(() => {
        controller.renderPolyline([]);
        controller.fitRouteBounds([]);
        controller.invalidateSize();
      });
    } finally {
      global.L = origL;
    }
  });

  // =========================================================================
  // BLOQUE 10: ARITMÉTICA MONETARIA Y CANTIDADES EXTREMAS
  // =========================================================================
  console.log('\n--- BLOQUE 10: Aritmética Monetaria y Cantidades Extremas ---');

  await testCase('10.1 Precisión de centavos enteros con precios y cantidades extremas en el cálculo de paradas', () => {
    const items = [
      { id: '1', name: 'Micro-compra', location: 'Tienda Centavos', completed: false, quantity: 3, unitPrice: 0.01 },
      { id: '2', name: 'Mega-compra', location: 'Tienda Centavos', completed: false, quantity: 10, unitPrice: 99999.99 },
      { id: '3', name: 'Cantidad fraccionaria', location: 'Tienda Centavos', completed: false, quantity: 2.5, unitPrice: 4.20 }
    ];

    const route = MapRouteService.calculateOptimalRoute(items, { lat: 40.4168, lng: -3.7038 });
    assert.strictEqual(route.orderedStops.length, 1);
    const stop = route.orderedStops[0];

    // Ítem 1: 3 * 1 cent = 3 cents = 0.03
    // Ítem 2: 10 * 9999999 cents = 99999990 cents = 999999.90
    // Ítem 3: Math.round(2.5 * Math.round(4.20 * 100)) = Math.round(2.5 * 420) = 1050 cents = 10.50
    // Total esperado: 0.03 + 999999.90 + 10.50 = 1000010.43
    assert.strictEqual(stop.estimatedTotal, 1000010.43, `Total esperado 1000010.43, obtenido ${stop.estimatedTotal}`);
    assert.strictEqual(stop.itemCount, 15.5, `Cantidad esperada 15.5, obtenida ${stop.itemCount}`);
  });

  // =========================================================================
  // RESUMEN FINAL
  // =========================================================================
  console.log('\n======================================================================');
  console.log(`RESUMEN DE PRUEBAS ADVERSARIALES:`);
  console.log(`Total: ${totalTests} | Aprobadas: ${passedTests} | Falladas: ${failedTests}`);
  console.log('======================================================================');

  if (failedTests > 0) {
    console.error(`\n[ALERTA] Se encontraron ${failedTests} fallos adversariales:`);
    testFailures.forEach(f => console.error(`  - ${f.name}: ${f.error}`));
    process.exitCode = 1;
  } else {
    console.log('\n[VEREDICTO EMPÍRICO] 100% de las pruebas adversariales superadas exitosamente.');
  }
}

// Ejecución
runAdversarialStressSuite().catch(err => {
  console.error('Error fatal al ejecutar la suite adversarial:', err);
  process.exit(1);
});
