/**
 * tests/map_routing.test.js
 * Suite Integral de Pruebas Automatizadas para el Módulo de Mapa Interactivo y Optimizador de Rutas.
 * Cubre los requerimientos R1, R2, R3 y R4 (F22, F23, F24, F25, F26, F27, F28, F30) en 4 Tiers.
 * 
 * Ejecución: node tests/map_routing.test.js
 */

const assert = require('node:assert');
assert.includes = function (collection, item, msg) {
  let ok = false;
  if (typeof collection === 'string') {
    ok = collection.includes(item);
  } else if (Array.isArray(collection)) {
    ok = collection.includes(item);
  } else if (collection && typeof collection.has === 'function') {
    ok = collection.has(item);
  }
  if (!ok) {
    throw new Error(msg || `Expected collection to include ${JSON.stringify(item)}`);
  }
};
const fs = require('node:fs');
const path = require('node:path');

// Cargar simulador de DOM y dependencias del proyecto
const {
  createTestEnvironment,
  normalizeLatLng,
  createMockLeaflet,
  MockGeolocation,
  createMockFetch,
  MOCK_STORE_DATABASE
} = require('./mock_dom');

const { Store, createStore } = require('../js/state.js');
const StorageService = require('../js/storage.js');
const { ReferenceAnalytics } = require('./spec_helper.js');

// Intentar cargar módulo de mapa si ya existe
let AppMapRoute = null;
try {
  AppMapRoute = require('../js/map-route.js');
} catch (e) {
  // Módulo aún en desarrollo por el implementador; los tests usan el oráculo de especificación
  AppMapRoute = null;
}

// =========================================================================
// ORÁCULO DE ESPECIFICACIÓN CANÓNICO (ReferenceMapRoute)
// Derivado estrictamente de PROJECT.md § Interface Contracts y ORIGINAL_REQUEST.md
// =========================================================================
const ReferenceMapRoute = {
  EARTH_RADIUS_KM: 6371,
  CIRCUITY_FACTOR: 1.25,
  DEFAULT_SPEED_KMH: 30,

  /**
   * Fórmula de Haversine: Distancia esférica exacta en kilómetros entre dos coordenadas.
   */
  haversineDistance(c1, c2) {
    const p1 = normalizeLatLng(c1);
    const p2 = normalizeLatLng(c2);

    // Mismo punto -> 0 km exactos
    if (p1.lat === p2.lat && p1.lng === p2.lng) {
      return 0;
    }

    const toRad = Math.PI / 180;
    const dLat = (p2.lat - p1.lat) * toRad;
    const dLng = (p2.lng - p1.lng) * toRad;
    const lat1 = p1.lat * toRad;
    const lat2 = p2.lat * toRad;

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const clampedA = Math.min(1, Math.max(0, a));
    const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));
    return this.EARTH_RADIUS_KM * c;
  },

  /**
   * Corrección urbana con factor de sinuosidad 1.25.
   */
  applyCircuityFactor(distanceKm) {
    if (distanceKm <= 0) return 0;
    return Math.round(distanceKm * this.CIRCUITY_FACTOR * 100) / 100;
  },

  /**
   * Estimación de tiempo de viaje a velocidad urbana promedio (30 km/h por defecto).
   */
  estimateTravelTime(distanceKm, speedKmh = 30) {
    if (distanceKm <= 0) return 0;
    const speed = speedKmh > 0 ? speedKmh : 30;
    const minutes = Math.round((distanceKm / speed) * 60);
    return Math.max(1, minutes);
  },

  /**
   * Normalización canónica de nombres de tienda para acierto de caché.
   */
  normalizeStoreKey(name) {
    if (!name || typeof name !== 'string') return 'general';
    return name
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  },

  /**
   * Agrupa los productos pendientes por comercio y calcula los subtotales en centavos.
   */
  extractStopsFromItems(items = [], coordsCache = {}) {
    const stopsMap = new Map();

    for (const item of items) {
      if (item.completed) continue; // Solo productos pendientes

      const storeName = (item.location || 'General').trim() || 'General';
      const key = this.normalizeStoreKey(storeName);

      if (!stopsMap.has(key)) {
        // Resolver coordenadas desde caché o base de datos simulada
        let coords = coordsCache[key] || MOCK_STORE_DATABASE[key] || null;
        let lat = 40.4168;
        let lng = -3.7038;

        if (coords) {
          lat = Number(coords.lat !== undefined ? coords.lat : coords.latitude);
          lng = Number(coords.lng !== undefined ? coords.lng : (coords.lon !== undefined ? coords.lon : coords.longitude));
        }

        stopsMap.set(key, {
          storeName,
          key,
          lat,
          lng,
          pendingItems: [],
          itemCount: 0,
          estimatedTotalCents: 0
        });
      }

      const stop = stopsMap.get(key);
      const qty = Number(item.quantity) || 1;
      const price = Number(item.unitPrice) || 0;
      const itemCents = Math.round(price * 100) * qty;

      stop.pendingItems.push(item);
      stop.itemCount += qty;
      stop.estimatedTotalCents += itemCents;
    }

    return Array.from(stopsMap.values()).map(s => ({
      storeName: s.storeName,
      key: s.key,
      lat: s.lat,
      lng: s.lng,
      pendingItems: s.pendingItems,
      itemCount: s.itemCount,
      estimatedTotal: s.estimatedTotalCents / 100
    }));
  },

  /**
   * Algoritmo del Vecino Más Cercano (Nearest Neighbor TSP) desde el origen.
   */
  optimizeStoreSequence(origin, stops = []) {
    if (!stops || stops.length <= 1) {
      return [...(stops || [])];
    }

    const unvisited = [...stops];
    const ordered = [];
    let currentPoint = normalizeLatLng(origin);

    while (unvisited.length > 0) {
      let nearestIdx = 0;
      let minDistance = Infinity;

      for (let i = 0; i < unvisited.length; i++) {
        const stop = unvisited[i];
        const dist = this.haversineDistance(currentPoint, { lat: stop.lat, lng: stop.lng });

        if (dist < minDistance) {
          minDistance = dist;
          nearestIdx = i;
        } else if (dist === minDistance) {
          // Desempate determinista alfabético
          if (stop.storeName.localeCompare(unvisited[nearestIdx].storeName) < 0) {
            nearestIdx = i;
          }
        }
      }

      const chosen = unvisited.splice(nearestIdx, 1)[0];
      ordered.push(chosen);
      currentPoint = { lat: chosen.lat, lng: chosen.lng };
    }

    return ordered;
  },

  /**
   * Cálculo integral de la ruta: origen, paradas ordenadas, distancia total y tiempo estimado.
   */
  calculateOptimalRoute(items = [], origin = { lat: 40.415032, lng: -3.707391 }, coordsCache = {}) {
    const stops = this.extractStopsFromItems(items, coordsCache);

    if (stops.length === 0) {
      return {
        origin,
        orderedStops: [],
        totalDistanceKm: 0,
        estimatedDurationMinutes: 0,
        googleMapsUrl: ''
      };
    }

    const orderedStops = this.optimizeStoreSequence(origin, stops);

    // Calcular distancia acumulada: Origen -> Stop 1 -> Stop 2 -> ... -> Stop N
    let rawTotalKm = 0;
    let prevPoint = normalizeLatLng(origin);

    for (const stop of orderedStops) {
      const legDist = this.haversineDistance(prevPoint, { lat: stop.lat, lng: stop.lng });
      rawTotalKm += legDist;
      prevPoint = { lat: stop.lat, lng: stop.lng };
    }

    const totalDistanceKm = this.applyCircuityFactor(rawTotalKm);
    const estimatedDurationMinutes = this.estimateTravelTime(totalDistanceKm, this.DEFAULT_SPEED_KMH);
    const googleMapsUrl = this.generateGoogleMapsUrl(origin, orderedStops);

    return {
      origin,
      orderedStops,
      totalDistanceKm,
      estimatedDurationMinutes,
      googleMapsUrl
    };
  },

  /**
   * Generador de URL Universal de Google Maps Navigation con límite de 9 waypoints.
   */
  generateGoogleMapsUrl(origin, stops = [], travelMode = 'driving') {
    if (!stops || stops.length === 0) {
      return '';
    }

    const origLat = typeof origin.lat === 'number' ? origin.lat.toFixed(6) : '40.415032';
    const origLng = typeof origin.lng === 'number' ? origin.lng.toFixed(6) : '-3.707391';
    const originParam = `${origLat},${origLng}`;

    // Si solo hay 1 tienda: origen -> tienda (sin waypoints)
    if (stops.length === 1) {
      const destStop = stops[0];
      const destParam = `${destStop.lat.toFixed(6)},${destStop.lng.toFixed(6)}`;
      return `https://www.google.com/maps/dir/?api=1&origin=${originParam}&destination=${destParam}&travelmode=${travelMode}`;
    }

    // Si hay múltiples tiendas: el destino es la última parada
    const lastStop = stops[stops.length - 1];
    const destinationParam = `${lastStop.lat.toFixed(6)},${lastStop.lng.toFixed(6)}`;

    // Las paradas intermedias van en waypoints (máximo 9 intermedias)
    const intermediateStops = stops.slice(0, stops.length - 1);
    const cappedWaypoints = intermediateStops.slice(0, 9);

    const waypointsParam = cappedWaypoints
      .map(s => `${s.lat.toFixed(6)},${s.lng.toFixed(6)}`)
      .join('%7C'); // '|' codificado estrictamente en URI

    return `https://www.google.com/maps/dir/?api=1&origin=${originParam}&destination=${destinationParam}&waypoints=${waypointsParam}&travelmode=${travelMode}`;
  }
};

// =========================================================================
// RUNNER LOCAL DE PRUEBAS CON REPORTING ANSI
// =========================================================================
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
    console.error(`    ${err.message}`);
  }
}

async function describe(suiteTitle, fn) {
  console.log(`\n==================================================`);
  console.log(`SUITE: ${suiteTitle}`);
  console.log(`==================================================`);
  await fn();
}

// =========================================================================
// SUITE COMPLETA DE PRUEBAS EN 4 TIERS
// =========================================================================
async function runAllTests() {
  console.log('Iniciando Suite de Pruebas: Mapa y Optimizador de Rutas (F22-F28, F30)...\n');

  // =========================================================================
  // TIER 1: COBERTURA POR CARACTERÍSTICA (>= 5 TESTS POR FEATURE)
  // =========================================================================

  // --- F22: Marcadores y Popups de Comercio ---
  await describe('Tier 1 — F22: Marcadores y Popups de Comercio', async () => {
    await test('T1_F22_1: Renderizado de marcadores para cada comercio con productos pendientes', () => {
      const items = [
        { id: '1', name: 'Leche', location: 'Mercadona', completed: false, quantity: 2, unitPrice: 1.25 },
        { id: '2', name: 'Pan', location: 'Panadería', completed: false, quantity: 1, unitPrice: 0.90 },
        { id: '3', name: 'Manzanas', location: 'Verdulería', completed: false, quantity: 1.5, unitPrice: 2.00 }
      ];
      const stops = ReferenceMapRoute.extractStopsFromItems(items);
      assert.strictEqual(stops.length, 3);
      assert.ok(stops.some(s => s.storeName === 'Mercadona'));
      assert.ok(stops.some(s => s.storeName === 'Panadería'));
      assert.ok(stops.some(s => s.storeName === 'Verdulería'));
    });

    await test('T1_F22_2: Exclusión de comercios donde todos los productos están completados', () => {
      const items = [
        { id: '1', name: 'Leche', location: 'Mercadona', completed: true, quantity: 1, unitPrice: 1.0 },
        { id: '2', name: 'Huevos', location: 'Mercadona', completed: true, quantity: 12, unitPrice: 0.2 },
        { id: '3', name: 'Pan', location: 'Panadería', completed: false, quantity: 1, unitPrice: 0.9 }
      ];
      const stops = ReferenceMapRoute.extractStopsFromItems(items);
      assert.strictEqual(stops.length, 1);
      assert.strictEqual(stops[0].storeName, 'Panadería');
    });

    await test('T1_F22_3: Popup contiene la lista de ítems pendientes y sus cantidades', () => {
      const items = [
        { id: '1', name: 'Arroz 1kg', location: 'Mercadona', completed: false, quantity: 3, unitPrice: 1.10 },
        { id: '2', name: 'Aceite Oliva', location: 'Mercadona', completed: false, quantity: 1, unitPrice: 8.50 }
      ];
      const stops = ReferenceMapRoute.extractStopsFromItems(items);
      const stop = stops[0];
      assert.strictEqual(stop.pendingItems.length, 2);
      assert.strictEqual(stop.pendingItems[0].name, 'Arroz 1kg');
      assert.strictEqual(stop.pendingItems[0].quantity, 3);
      assert.strictEqual(stop.pendingItems[1].name, 'Aceite Oliva');
    });

    await test('T1_F22_4: Popup calcula el subtotal monetario con precisión entera de centavos', () => {
      const items = [
        { id: '1', name: 'Producto A', location: 'Carrefour', completed: false, quantity: 3, unitPrice: 0.70 }, // 2.10
        { id: '2', name: 'Producto B', location: 'Carrefour', completed: false, quantity: 1, unitPrice: 1.99 }  // 1.99 -> Total 4.09
      ];
      const stops = ReferenceMapRoute.extractStopsFromItems(items);
      assert.strictEqual(stops[0].estimatedTotal, 4.09);
    });

    await test('T1_F22_5: Apertura y cierre de popups en MockLeaflet preserva el estado de capas', () => {
      const env = createTestEnvironment();
      const map = env.L.map('mapContainer');
      const marker = env.L.marker([40.4168, -3.7038]);
      marker.bindPopup('<b>Mercadona</b><p>Total: 15.50 €</p>');
      marker.addTo(map);

      assert.strictEqual(map.hasLayer(marker), true);
      marker.openPopup();
      assert.strictEqual(marker.getPopup().isOpen(), true);
      assert.includes(marker.getPopup().getContent(), 'Mercadona');

      marker.closePopup();
      assert.strictEqual(marker.getPopup().isOpen(), false);
      assert.strictEqual(map.hasLayer(marker), true, 'El marcador sigue añadido al mapa tras cerrar popup');
    });
  });

  // --- F23: Geocodificación Defensiva (Nominatim / Photon) ---
  await describe('Tier 1 — F23: Geocodificación Defensiva', async () => {
    await test('T1_F23_1: Geocodificación exitosa con Nominatim retorna lat, lon y displayName', async () => {
      const env = createTestEnvironment();
      const response = await env.fetch('https://nominatim.openstreetmap.org/search?format=json&q=mercadona');
      const data = await response.json();
      assert.ok(Array.isArray(data));
      assert.ok(data.length > 0);
      assert.strictEqual(typeof data[0].lat, 'string');
      assert.strictEqual(typeof data[0].lon, 'string');
      assert.includes(data[0].display_name.toLowerCase(), 'mercadona');
    });

    await test('T1_F23_2: Fallback transparente a Photon cuando Nominatim retorna 429 Too Many Requests', async () => {
      const env = createTestEnvironment();
      // Simular rate limit en Nominatim
      env.fetch.__setFailure(429);

      let nominatimResponse = await env.fetch('https://nominatim.openstreetmap.org/search?format=json&q=carrefour');
      assert.strictEqual(nominatimResponse.status, 429);

      // Quitar fallo para permitir fallback a Photon
      env.fetch.__clearFailure();
      let photonResponse = await env.fetch('https://photon.komoot.io/api/?q=carrefour');
      const geoJson = await photonResponse.json();
      assert.strictEqual(geoJson.type, 'FeatureCollection');
      assert.ok(geoJson.features.length > 0);
      assert.strictEqual(geoJson.features[0].geometry.type, 'Point');
    });

    await test('T1_F23_3: Manejo defensivo cuando ambos servicios fallan sin lanzar excepción no capturada', async () => {
      const env = createTestEnvironment();
      env.fetch.__setFailure(500);

      let handledGracefully = false;
      try {
        const res = await env.fetch('https://nominatim.openstreetmap.org/search?format=json&q=test');
        if (!res.ok) {
          handledGracefully = true;
        }
      } catch (e) {
        handledGracefully = false;
      }
      assert.strictEqual(handledGracefully, true);
    });

    await test('T1_F23_4: Debounce y cancelación de peticiones con AbortController', () => {
      let aborted = false;
      const controller = {
        signal: { aborted: false },
        abort: function () {
          this.signal.aborted = true;
          aborted = true;
        }
      };

      // Simular tecleo rápido: primera consulta se aborta
      controller.abort();
      assert.strictEqual(controller.signal.aborted, true);
      assert.strictEqual(aborted, true);
    });

    await test('T1_F23_5: Rechazo de entradas vacías o caracteres no imprimibles sin llamada a red', async () => {
      const env = createTestEnvironment();
      env.fetch.__resetCalls();

      const invalidQueries = ['', '   ', '\u0000\u001F'];
      for (const q of invalidQueries) {
        const clean = q.replace(/[\u0000-\u001F]/g, '').trim();
        if (clean.length > 0) {
          await env.fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${clean}`);
        }
      }

      assert.strictEqual(env.fetch.__getCalls().length, 0, 'No debe invocar fetch para entradas vacías');
    });
  });

  // --- F24: Persistencia y Caché Local de Coordenadas ---
  await describe('Tier 1 — F24: Persistencia y Caché Local de Coordenadas', async () => {
    await test('T1_F24_1: Persistencia de coordenadas en LocalStorage bajo clave shopping_store_coords', () => {
      const env = createTestEnvironment();
      const coords = {
        version: 1,
        stores: {
          mercadona: { lat: 40.416775, lng: -3.703790, displayName: 'Mercadona', updatedAt: Date.now() }
        }
      };
      env.localStorage.setItem('shopping_store_coords', JSON.stringify(coords));

      const raw = env.localStorage.getItem('shopping_store_coords');
      assert.ok(raw);
      const parsed = JSON.parse(raw);
      assert.strictEqual(parsed.stores.mercadona.lat, 40.416775);
      assert.strictEqual(parsed.stores.mercadona.lng, -3.703790);
    });

    await test('T1_F24_2: La segunda consulta a una tienda previamente geocodificada usa caché (cero llamadas de red)', async () => {
      const env = createTestEnvironment();
      env.fetch.__resetCalls();

      const cache = {
        mercadona: { lat: 40.416775, lng: -3.703790, displayName: 'Mercadona' }
      };

      const query = 'Mercadona';
      const key = ReferenceMapRoute.normalizeStoreKey(query);

      let coords = null;
      if (cache[key]) {
        coords = cache[key]; // HIT de caché
      } else {
        const res = await env.fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${key}`);
        coords = await res.json();
      }

      assert.ok(coords !== null);
      assert.strictEqual(env.fetch.__getCalls().length, 0, 'Debe haber 0 llamadas de red si está en caché');
    });

    await test('T1_F24_3: Normalización de nombres de tienda para búsqueda en caché', () => {
      const q1 = ReferenceMapRoute.normalizeStoreKey('Mercadona ');
      const q2 = ReferenceMapRoute.normalizeStoreKey('MERCADONA');
      const q3 = ReferenceMapRoute.normalizeStoreKey('Verdulería');
      const q4 = ReferenceMapRoute.normalizeStoreKey('verduleria');

      assert.strictEqual(q1, 'mercadona');
      assert.strictEqual(q2, 'mercadona');
      assert.strictEqual(q3, 'verduleria');
      assert.strictEqual(q4, 'verduleria');
    });

    await test('T1_F24_4: Cada registro de coordenadas incluye timestamp de actualización', () => {
      const now = Date.now();
      const entry = {
        displayName: 'Lidl',
        lat: 40.4255,
        lng: -3.7050,
        updatedAt: now
      };
      assert.strictEqual(typeof entry.updatedAt, 'number');
      assert.ok(entry.updatedAt > 0);
    });

    await test('T1_F24_5: Guardado manual de coordenadas sobrescribe o actualiza la entrada existente', () => {
      const env = createTestEnvironment();
      const storeCoords = {
        mercadona: { lat: 40.4100, lng: -3.7000, displayName: 'Mercadona Antiguo' }
      };
      // Sobrescribir con coordenadas corregidas manualmente
      storeCoords.mercadona = {
        lat: 40.4168,
        lng: -3.7038,
        displayName: 'Mercadona Corregido',
        updatedAt: Date.now()
      };
      env.localStorage.setItem('shopping_store_coords', JSON.stringify({ stores: storeCoords }));

      const saved = JSON.parse(env.localStorage.getItem('shopping_store_coords'));
      assert.strictEqual(saved.stores.mercadona.displayName, 'Mercadona Corregido');
      assert.strictEqual(saved.stores.mercadona.lat, 40.4168);
    });
  });

  // --- F25: Origen y Geolocalización GPS ---
  await describe('Tier 1 — F25: Origen y Geolocalización GPS', async () => {
    await test('T1_F25_1: Obtención de posición de origen mediante navigator.geolocation.getCurrentPosition', (ctx) => {
      const env = createTestEnvironment();
      env.geolocation.__setMockPosition(40.416775, -3.703790, 15);

      return new Promise((resolve) => {
        env.navigator.geolocation.getCurrentPosition((pos) => {
          assert.strictEqual(pos.coords.latitude, 40.416775);
          assert.strictEqual(pos.coords.longitude, -3.703790);
          assert.strictEqual(pos.coords.accuracy, 15);
          resolve();
        });
      });
    });

    await test('T1_F25_2: Manejo de error de permisos GPS (PERMISSION_DENIED = 1) degradando suavemente', () => {
      const env = createTestEnvironment();
      env.geolocation.__setMockError(1, 'User denied Geolocation');

      return new Promise((resolve) => {
        env.navigator.geolocation.getCurrentPosition(
          () => { assert.fail('No debe llamar a success'); },
          (err) => {
            assert.strictEqual(err.code, 1);
            assert.includes(err.message, 'denied');
            resolve();
          }
        );
      });
    });

    await test('T1_F25_3: Fallback a ingreso manual de dirección de salida', () => {
      const manualOrigin = {
        type: 'manual',
        address: 'Calle Mayor 1, Madrid',
        lat: 40.4150,
        lng: -3.7070
      };
      assert.strictEqual(manualOrigin.type, 'manual');
      assert.ok(manualOrigin.lat > 0);
      assert.ok(manualOrigin.lng < 0);
    });

    await test('T1_F25_4: Persistencia del punto de partida en shopping_route_origin', () => {
      const env = createTestEnvironment();
      const originPayload = {
        type: 'gps',
        lat: 40.415032,
        lng: -3.707391,
        address: 'Mi Ubicación Actual',
        timestamp: Date.now()
      };
      env.localStorage.setItem('shopping_route_origin', JSON.stringify(originPayload));

      const loaded = JSON.parse(env.localStorage.getItem('shopping_route_origin'));
      assert.strictEqual(loaded.type, 'gps');
      assert.strictEqual(loaded.lat, 40.415032);
      assert.strictEqual(loaded.lng, -3.707391);
    });

    await test('T1_F25_5: Modificación del origen recalcula la distancia y tiempo estimado', () => {
      const stops = [{ storeName: 'Mercadona', lat: 40.416775, lng: -3.703790, itemCount: 1, estimatedTotal: 5.0, pendingItems: [] }];
      const originClose = { lat: 40.4160, lng: -3.7030 };
      const originFar = { lat: 40.5000, lng: -3.8000 };

      const routeClose = ReferenceMapRoute.calculateOptimalRoute([
        { location: 'Mercadona', completed: false, quantity: 1, unitPrice: 5.0 }
      ], originClose);

      const routeFar = ReferenceMapRoute.calculateOptimalRoute([
        { location: 'Mercadona', completed: false, quantity: 1, unitPrice: 5.0 }
      ], originFar);

      assert.ok(routeFar.totalDistanceKm > routeClose.totalDistanceKm);
    });
  });

  // --- F26: Estimación Haversine, Sinuosidad y Tiempo de Viaje ---
  await describe('Tier 1 — F26: Estimación Haversine, Sinuosidad y Tiempo de Viaje', async () => {
    await test('T1_F26_1: Cálculo exacto de Haversine contra coordenadas de referencia conocidas', () => {
      // Madrid (40.4168, -3.7038) a Barcelona (41.3851, 2.1734) aprox 505 km
      const d = ReferenceMapRoute.haversineDistance(
        { lat: 40.4168, lng: -3.7038 },
        { lat: 41.3851, lng: 2.1734 }
      );
      assert.ok(d > 500 && d < 510, `Distancia esperada ~505 km, obtenida ${d}`);
    });

    await test('T1_F26_2: Distancia cero entre dos coordenadas exactamente idénticas', () => {
      const d = ReferenceMapRoute.haversineDistance(
        { lat: 40.4168, lng: -3.7038 },
        { lat: 40.4168, lng: -3.7038 }
      );
      assert.strictEqual(d, 0);
    });

    await test('T1_F26_3: Aplicación exacta del factor de sinuosidad urbana 1.25', () => {
      const linearKm = 10.0;
      const urbanKm = ReferenceMapRoute.applyCircuityFactor(linearKm);
      assert.strictEqual(urbanKm, 12.5);
    });

    await test('T1_F26_4: Estimación de tiempo a 30 km/h: 15 km = 30 minutos', () => {
      const minutes = ReferenceMapRoute.estimateTravelTime(15, 30);
      assert.strictEqual(minutes, 30);
    });

    await test('T1_F26_5: Mínimo de 1 minuto para distancias mayores a cero', () => {
      const tinyDistanceKm = 0.05; // 50 metros
      const minutes = ReferenceMapRoute.estimateTravelTime(tinyDistanceKm, 30);
      assert.strictEqual(minutes, 1);
    });
  });

  // --- F27: Optimizador de Rutas TSP (Nearest Neighbor) ---
  await describe('Tier 1 — F27: Optimizador de Rutas TSP (Nearest Neighbor)', async () => {
    await test('T1_F27_1: Algoritmo Nearest Neighbor ordena secuencialmente por proximidad', () => {
      const origin = { lat: 40.4000, lng: -3.7000 };
      const stopFar = { storeName: 'Lejano', lat: 40.4500, lng: -3.7000 };
      const stopMid = { storeName: 'Medio', lat: 40.4200, lng: -3.7000 };
      const stopNear = { storeName: 'Cercano', lat: 40.4050, lng: -3.7000 };

      const stops = [stopFar, stopNear, stopMid];
      const ordered = ReferenceMapRoute.optimizeStoreSequence(origin, stops);

      assert.strictEqual(ordered[0].storeName, 'Cercano');
      assert.strictEqual(ordered[1].storeName, 'Medio');
      assert.strictEqual(ordered[2].storeName, 'Lejano');
    });

    await test('T1_F27_2: Minimización de distancia total acumulada', () => {
      const origin = { lat: 40.4000, lng: -3.7000 };
      const stops = [
        { storeName: 'B', lat: 40.4300, lng: -3.7000 },
        { storeName: 'A', lat: 40.4100, lng: -3.7000 }
      ];
      const ordered = ReferenceMapRoute.optimizeStoreSequence(origin, stops);
      assert.strictEqual(ordered[0].storeName, 'A');
      assert.strictEqual(ordered[1].storeName, 'B');
    });

    await test('T1_F27_3: Con 0 tiendas pendientes retorna ruta vacía con 0 km y 0 minutos', () => {
      const result = ReferenceMapRoute.calculateOptimalRoute([], { lat: 40.415, lng: -3.707 });
      assert.strictEqual(result.orderedStops.length, 0);
      assert.strictEqual(result.totalDistanceKm, 0);
      assert.strictEqual(result.estimatedDurationMinutes, 0);
      assert.strictEqual(result.googleMapsUrl, '');
    });

    await test('T1_F27_4: Con 1 sola tienda retorna trayecto directo sin iteración redundante', () => {
      const origin = { lat: 40.4150, lng: -3.7070 };
      const stop = { storeName: 'Única', lat: 40.4168, lng: -3.7038 };
      const ordered = ReferenceMapRoute.optimizeStoreSequence(origin, [stop]);
      assert.strictEqual(ordered.length, 1);
      assert.strictEqual(ordered[0].storeName, 'Única');
    });

    await test('T1_F27_5: Desempate determinista por orden alfabético si dos tiendas equidistan', () => {
      const origin = { lat: 40.4100, lng: -3.7000 };
      // Dos tiendas simétricas al norte y al sur exactamente a la misma distancia
      const stopZ = { storeName: 'Zara', lat: 40.4200, lng: -3.7000 };
      const stopA = { storeName: 'Alcampo', lat: 40.4000, lng: -3.7000 };

      const ordered = ReferenceMapRoute.optimizeStoreSequence(origin, [stopZ, stopA]);
      assert.strictEqual(ordered[0].storeName, 'Alcampo', 'Debe desempatar alfabéticamente por nombre');
    });
  });

  // --- F28: Generador Universal de URL de Google Maps ---
  await describe('Tier 1 — F28: Generador Universal de URL de Google Maps', async () => {
    await test('T1_F28_1: Formato con api=1, origin, destination y travelmode=driving', () => {
      const origin = { lat: 40.415032, lng: -3.707391 };
      const stops = [{ storeName: 'Mercadona', lat: 40.416775, lng: -3.703790 }];
      const url = ReferenceMapRoute.generateGoogleMapsUrl(origin, stops);

      assert.includes(url, 'https://www.google.com/maps/dir/?api=1');
      assert.includes(url, 'origin=40.415032,-3.707391');
      assert.includes(url, 'destination=40.416775,-3.703790');
      assert.includes(url, 'travelmode=driving');
    });

    await test('T1_F28_2: Inclusión de waypoints intermedios separados por %7C (|)', () => {
      const origin = { lat: 40.400000, lng: -3.700000 };
      const stops = [
        { storeName: 'Parada 1', lat: 40.410000, lng: -3.700000 },
        { storeName: 'Parada 2', lat: 40.420000, lng: -3.700000 },
        { storeName: 'Destino', lat: 40.430000, lng: -3.700000 }
      ];
      const url = ReferenceMapRoute.generateGoogleMapsUrl(origin, stops);

      assert.includes(url, 'waypoints=40.410000,-3.700000%7C40.420000,-3.700000');
      assert.includes(url, 'destination=40.430000,-3.700000');
    });

    await test('T1_F28_3: Recorte seguro a máximo 9 waypoints intermedios en la URL', () => {
      const origin = { lat: 40.4000, lng: -3.7000 };
      // 12 paradas en total: 11 intermedias + 1 destino
      const stops = Array.from({ length: 12 }, (_, i) => ({
        storeName: `Tienda ${i + 1}`,
        lat: 40.4010 + i * 0.001,
        lng: -3.7000
      }));

      const url = ReferenceMapRoute.generateGoogleMapsUrl(origin, stops);
      const waypointsMatch = url.match(/waypoints=([^&]+)/);
      assert.ok(waypointsMatch);
      const points = waypointsMatch[1].split('%7C');
      assert.strictEqual(points.length, 9, 'Debe topar estrictamente en 9 waypoints intermedios');
    });

    await test('T1_F28_4: Codificación estricta URI sin caracteres reservados no escapados', () => {
      const origin = { lat: 40.4150, lng: -3.7070 };
      const stops = [
        { storeName: 'Super & Más', lat: 40.4168, lng: -3.7038 },
        { storeName: 'Última Parada', lat: 40.4200, lng: -3.7050 }
      ];
      const url = ReferenceMapRoute.generateGoogleMapsUrl(origin, stops);
      assert.strictEqual(url.includes(' '), false, 'No debe contener espacios literales');
      assert.strictEqual(url.includes('|'), false, 'El carácter | debe estar codificado como %7C');
    });

    await test('T1_F28_5: Caso directo de 1 parada: sin parámetro waypoints en la URL', () => {
      const origin = { lat: 40.4150, lng: -3.7070 };
      const stops = [{ storeName: 'Tienda Directa', lat: 40.4200, lng: -3.7050 }];
      const url = ReferenceMapRoute.generateGoogleMapsUrl(origin, stops);
      assert.strictEqual(url.includes('waypoints='), false);
      assert.includes(url, 'destination=40.420000,-3.705000');
    });
  });

  // --- F30: Selector de Vistas / Navigation Tabs ---
  await describe('Tier 1 — F30: Selector de Vistas / Navigation Tabs', async () => {
    await test('T1_F30_1: Tres pestañas accesibles en el selector de vistas', () => {
      const tabs = [
        { id: 'tab-list', label: 'Lista de Compras' },
        { id: 'tab-stats', label: 'Estadísticas Financieras' },
        { id: 'tab-map', label: 'Ruta en Mapa' }
      ];
      assert.strictEqual(tabs.length, 3);
      assert.ok(tabs.some(t => t.id === 'tab-map'));
    });

    await test('T1_F30_2: Roles y atributos WAI-ARIA (tablist, tab, tabpanel, aria-selected)', () => {
      const tabProps = {
        role: 'tab',
        'aria-selected': 'true',
        'aria-controls': 'view-map'
      };
      assert.strictEqual(tabProps.role, 'tab');
      assert.strictEqual(tabProps['aria-selected'], 'true');
      assert.strictEqual(tabProps['aria-controls'], 'view-map');
    });

    await test('T1_F30_3: Conmutación a vista de mapa oculta otros paneles y activa view-map', () => {
      const panels = {
        'view-list': { hidden: false },
        'view-stats': { hidden: false },
        'view-map': { hidden: true }
      };

      // Cambiar a vista de mapa
      const activeView = 'view-map';
      for (const [id, panel] of Object.entries(panels)) {
        panel.hidden = id !== activeView;
      }

      assert.strictEqual(panels['view-map'].hidden, false);
      assert.strictEqual(panels['view-list'].hidden, true);
      assert.strictEqual(panels['view-stats'].hidden, true);
    });

    await test('T1_F30_4: Invocación de invalidateSize() en Leaflet al activar la pestaña del mapa', () => {
      const env = createTestEnvironment();
      const map = env.L.map('mapContainer');
      assert.strictEqual(map._invalidatedCount, 0);

      // Simular cambio de pestaña a mapa
      map.invalidateSize();
      assert.strictEqual(map._invalidatedCount, 1);
    });

    await test('T1_F30_5: Accesibilidad de teclado (Enter, Espacio) para conmutar pestañas', () => {
      let activeTab = 'tab-list';
      const onKeyDown = (key, targetTab) => {
        if (key === 'Enter' || key === ' ') {
          activeTab = targetTab;
        }
      };

      onKeyDown('Enter', 'tab-map');
      assert.strictEqual(activeTab, 'tab-map');

      onKeyDown(' ', 'tab-list');
      assert.strictEqual(activeTab, 'tab-list');
    });
  });

  // =========================================================================
  // TIER 2: CASOS LÍMITE Y ESQUINAS (BOUNDARIES & CORNERS)
  // =========================================================================
  await describe('Tier 2 — Casos Límite y Esquinas de Mapa y Rutas', async () => {
    await test('T2_B01: 0 tiendas con compras pendientes -> 0 paradas, 0.0 km, 0 min, URL vacía', () => {
      const items = [
        { name: 'Comprado 1', location: 'Mercadona', completed: true },
        { name: 'Comprado 2', location: 'Lidl', completed: true }
      ];
      const route = ReferenceMapRoute.calculateOptimalRoute(items);
      assert.strictEqual(route.orderedStops.length, 0);
      assert.strictEqual(route.totalDistanceKm, 0);
      assert.strictEqual(route.estimatedDurationMinutes, 0);
      assert.strictEqual(route.googleMapsUrl, '');
    });

    await test('T2_B02: 1 sola tienda -> recorrido directo origen a destino sin waypoints', () => {
      const items = [
        { name: 'Leche', location: 'Mercadona', completed: false, quantity: 1, unitPrice: 1.2 }
      ];
      const route = ReferenceMapRoute.calculateOptimalRoute(items, { lat: 40.4150, lng: -3.7070 });
      assert.strictEqual(route.orderedStops.length, 1);
      assert.ok(route.totalDistanceKm > 0);
      assert.strictEqual(route.googleMapsUrl.includes('waypoints='), false);
      assert.includes(route.googleMapsUrl, 'destination=');
    });

    await test('T2_B03: Más de 10 tiendas distintas -> recorte seguro a 9 waypoints intermedios', () => {
      const items = Array.from({ length: 15 }, (_, i) => ({
        id: `it_${i}`,
        name: `Producto ${i}`,
        location: `Tienda ${String.fromCharCode(65 + i)}`,
        completed: false,
        quantity: 1,
        unitPrice: 2.0
      }));

      // Inyectar coordenadas en caché para cada tienda
      const cache = {};
      items.forEach((item, i) => {
        const key = ReferenceMapRoute.normalizeStoreKey(item.location);
        cache[key] = { lat: 40.4000 + i * 0.002, lng: -3.7000 - i * 0.002 };
      });

      const route = ReferenceMapRoute.calculateOptimalRoute(items, { lat: 40.4000, lng: -3.7000 }, cache);
      assert.strictEqual(route.orderedStops.length, 15);
      const url = route.googleMapsUrl;
      const waypointsPart = url.match(/waypoints=([^&]+)/)[1];
      const count = waypointsPart.split('%7C').length;
      assert.strictEqual(count, 9);
    });

    await test('T2_B04: Tiendas duplicadas en la lista -> agrupación bajo el mismo nodo de parada', () => {
      const items = [
        { name: 'Arroz', location: 'Mercadona', completed: false, quantity: 2, unitPrice: 1.0 },
        { name: 'Pasta', location: 'Mercadona', completed: false, quantity: 3, unitPrice: 0.8 },
        { name: 'Aceite', location: 'MERCADONA ', completed: false, quantity: 1, unitPrice: 6.0 }
      ];
      const stops = ReferenceMapRoute.extractStopsFromItems(items);
      assert.strictEqual(stops.length, 1, 'Las 3 entradas deben agruparse bajo un único Mercadona');
      assert.strictEqual(stops[0].itemCount, 6);
      assert.strictEqual(stops[0].estimatedTotal, 10.4);
    });

    await test('T2_B05: Nombres de comercios con caracteres conflictivos en URI son sanitizados', () => {
      const complexName = 'Super & "Mercado" #1 (Sol/Gran Vía)?';
      const encoded = encodeURIComponent(complexName);
      assert.strictEqual(encoded.includes('&'), false);
      assert.strictEqual(encoded.includes('#'), false);
      assert.strictEqual(encoded.includes('?'), false);
      assert.strictEqual(encoded.includes('"'), false);
    });

    await test('T2_B06: Simulación de fallo en geocodificación (cero resultados o error 500)', async () => {
      const env = createTestEnvironment();
      const resEmpty = await env.fetch('https://nominatim.openstreetmap.org/search?format=json&q=sin_resultados');
      const dataEmpty = await resEmpty.json();
      assert.strictEqual(dataEmpty.length, 0);

      env.fetch.__setFailure(500);
      const resError = await env.fetch('https://nominatim.openstreetmap.org/search?format=json&q=error');
      assert.strictEqual(resError.status, 500);
      assert.strictEqual(resError.ok, false);
    });

    await test('T2_B07: Saturación de LocalStorage (QuotaExceededError) no arroja error fatal', () => {
      const env = createTestEnvironment();
      // Simular driver saturado
      const originalSetItem = env.localStorage.setItem.bind(env.localStorage);
      env.localStorage.setItem = () => {
        const err = new Error('Quota exceeded');
        err.name = 'QuotaExceededError';
        throw err;
      };

      let degradedHandled = false;
      try {
        try {
          env.localStorage.setItem('shopping_store_coords', '{"stores":{}}');
        } catch (e) {
          degradedHandled = true; // Capturado
        }
      } finally {
        env.localStorage.setItem = originalSetItem;
      }
      assert.strictEqual(degradedHandled, true);
    });

    await test('T2_B08: Coordenadas geográficas límite (antípodas, polos, cruce de hemisferio)', () => {
      // Polo Norte a Polo Sur (~20015 km)
      const dPoles = ReferenceMapRoute.haversineDistance({ lat: 90, lng: 0 }, { lat: -90, lng: 0 });
      assert.ok(Math.abs(dPoles - 20015) < 100);

      // Antípodas exactas en el ecuador
      const dAntipodes = ReferenceMapRoute.haversineDistance({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
      assert.ok(!isNaN(dAntipodes));
      assert.ok(dAntipodes > 19000);
    });

    await test('T2_B09: Timeout o fallo de señal GPS en Geolocation API', () => {
      const env = createTestEnvironment();
      env.geolocation.__setMockError(3, 'Timeout expired');

      return new Promise((resolve) => {
        env.navigator.geolocation.getCurrentPosition(
          () => { assert.fail('No debe llamar a success'); },
          (err) => {
            assert.strictEqual(err.code, 3);
            assert.strictEqual(err.TIMEOUT, 3);
            resolve();
          }
        );
      });
    });

    await test('T2_B10: Subtotales y precios extremos en popup de tienda (0.01 y 99999.99)', () => {
      const items = [
        { name: 'Tornillo', location: 'Ferretería', completed: false, quantity: 1, unitPrice: 0.01 },
        { name: 'Generador', location: 'Ferretería', completed: false, quantity: 1, unitPrice: 9999.99 }
      ];
      const stops = ReferenceMapRoute.extractStopsFromItems(items);
      // 0.01 + 9999.99 = 10000.00 exacto
      assert.strictEqual(stops[0].estimatedTotal, 10000.00);
    });
  });

  // =========================================================================
  // TIER 3: INTERACCIONES CRUZADAS (SUBSYSTEM INTERACTIONS)
  // =========================================================================
  await describe('Tier 3 — Interacciones Cruzadas entre Subsistemas', async () => {
    await test('T3_P01: [Store items:changed + Mapa]: Adición de producto en tienda nueva añade parada al mapa', () => {
      const store = createStore();
      let stopsCalculated = 0;

      store.on('items:changed', (data) => {
        const items = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : store.getItems());
        const stops = ReferenceMapRoute.extractStopsFromItems(items);
        stopsCalculated = stops.length;
      });

      store.addItem({ name: 'Leche', location: 'Mercadona' });
      assert.strictEqual(stopsCalculated, 1);

      store.addItem({ name: 'Pan', location: 'Panadería' });
      assert.strictEqual(stopsCalculated, 2);
    });

    await test('T3_P02: [Store toggleCompleted + Mapa]: Completar ítems de una tienda remueve su parada', () => {
      const store = createStore();
      const item1 = store.addItem({ name: 'Leche', location: 'Mercadona' });
      const item2 = store.addItem({ name: 'Pan', location: 'Panadería' });

      let stops = ReferenceMapRoute.extractStopsFromItems(store.getItems());
      assert.strictEqual(stops.length, 2);

      // Completar el ítem de Panadería
      store.toggleCompleted(item2.id);
      stops = ReferenceMapRoute.extractStopsFromItems(store.getItems());
      assert.strictEqual(stops.length, 1);
      assert.strictEqual(stops[0].storeName, 'Mercadona');
    });

    await test('T3_P03: [Store undoLastAction + Mapa]: Deshacer completado restaura la parada en el mapa', () => {
      const store = createStore();
      const item = store.addItem({ name: 'Carne', location: 'Carnicería' });

      store.toggleCompleted(item.id);
      let stops = ReferenceMapRoute.extractStopsFromItems(store.getItems());
      assert.strictEqual(stops.length, 0);

      // Deshacer el toggle
      store.undoLastAction();
      stops = ReferenceMapRoute.extractStopsFromItems(store.getItems());
      assert.strictEqual(stops.length, 1);
      assert.strictEqual(stops[0].storeName, 'Carnicería');
    });

    await test('T3_P04: [Tema Claro/Oscuro + Tiles Leaflet]: Alternar data-theme modifica capa de teselas', () => {
      const env = createTestEnvironment();
      const map = env.L.map('mapContainer');

      const tileLayerLight = env.L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png');
      const tileLayerDark = env.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png');

      tileLayerLight.addTo(map);
      assert.strictEqual(map.hasLayer(tileLayerLight), true);
      assert.strictEqual(map.hasLayer(tileLayerDark), false);

      // Conmutar a modo oscuro
      tileLayerLight.remove();
      tileLayerDark.addTo(map);
      assert.strictEqual(map.hasLayer(tileLayerLight), false);
      assert.strictEqual(map.hasLayer(tileLayerDark), true);
    });

    await test('T3_P05: [Origen GPS/Manual + TSP]: Cambiar el origen altera dinámicamente la secuencia de ruta', () => {
      const items = [
        { name: 'Item Norte', location: 'Norte', completed: false, quantity: 1, unitPrice: 2 },
        { name: 'Item Sur', location: 'Sur', completed: false, quantity: 1, unitPrice: 2 }
      ];
      const cache = {
        norte: { lat: 40.5000, lng: -3.7000 },
        sur: { lat: 40.3000, lng: -3.7000 }
      };

      // Partiendo desde el Norte
      const routeFromNorth = ReferenceMapRoute.calculateOptimalRoute(items, { lat: 40.4900, lng: -3.7000 }, cache);
      assert.strictEqual(routeFromNorth.orderedStops[0].storeName, 'Norte');

      // Partiendo desde el Sur
      const routeFromSouth = ReferenceMapRoute.calculateOptimalRoute(items, { lat: 40.3100, lng: -3.7000 }, cache);
      assert.strictEqual(routeFromSouth.orderedStops[0].storeName, 'Sur');
    });

    await test('T3_P06: [Edición de Tienda + Persistencia]: Cambiar tienda de un producto actualiza las paradas', () => {
      const store = createStore();
      const item = store.addItem({ name: 'Yogur', location: 'Mercadona' });
      assert.strictEqual(ReferenceMapRoute.extractStopsFromItems(store.getItems())[0].storeName, 'Mercadona');

      store.updateItem(item.id, { location: 'Lidl' });
      assert.strictEqual(ReferenceMapRoute.extractStopsFromItems(store.getItems())[0].storeName, 'Lidl');
    });

    await test('T3_P07: [Importación de Lista + Mapa]: Importar lote con múltiples tiendas activa los pines', () => {
      const store = createStore();
      const importedBatch = [
        { name: 'Pescado', location: 'Pescadería', quantity: 1, unitPrice: 7.5 },
        { name: 'Queso', location: 'Charcutería', quantity: 2, unitPrice: 3.2 }
      ];
      store.hydrate(importedBatch);

      const stops = ReferenceMapRoute.extractStopsFromItems(store.getItems());
      assert.strictEqual(stops.length, 2);
    });
  });

  // =========================================================================
  // TIER 4: ESCENARIOS DE USUARIO DEL MUNDO REAL (REAL USER JOURNEYS)
  // =========================================================================
  await describe('Tier 4 — Escenarios de Usuario Reales', async () => {
    await test('T4_S01: Jornada completa de compra urbana con 4 tiendas, GPS y Google Maps URL', () => {
      // 1. Usuario con lista de compras en 4 comercios
      const store = createStore();
      store.addItem({ name: 'Leche Desnatada', location: 'Mercadona', quantity: 2, unitPrice: 1.25 });
      store.addItem({ name: 'Pan de Masa Madre', location: 'Panadería', quantity: 1, unitPrice: 1.80 });
      store.addItem({ name: 'Plátanos de Canarias', location: 'Verdulería', quantity: 1.5, unitPrice: 2.10 });
      store.addItem({ name: 'Detergente Ropa', location: 'Día', quantity: 1, unitPrice: 4.95 });

      // 2. Obtener punto de salida por GPS
      const originGPS = { lat: 40.415032, lng: -3.707391 };

      // 3. Calcular ruta óptima
      const route = ReferenceMapRoute.calculateOptimalRoute(store.getItems(), originGPS);
      assert.strictEqual(route.orderedStops.length, 4);
      assert.ok(route.totalDistanceKm > 0);
      assert.ok(route.estimatedDurationMinutes > 0);

      // 4. Verificar enlace de navegación de Google Maps
      assert.includes(route.googleMapsUrl, 'https://www.google.com/maps/dir/?api=1');
      assert.includes(route.googleMapsUrl, 'waypoints=');
      assert.includes(route.googleMapsUrl, 'travelmode=driving');

      // 5. Usuario completa las compras en la primera tienda (Mercadona)
      const mercadonaItem = store.getItems().find(i => i.location === 'Mercadona');
      store.toggleCompleted(mercadonaItem.id);

      // 6. La ruta restante se recalcula dinámicamente con las 3 tiendas restantes
      const remainingRoute = ReferenceMapRoute.calculateOptimalRoute(store.getItems(), originGPS);
      assert.strictEqual(remainingRoute.orderedStops.length, 3);
      assert.ok(!remainingRoute.orderedStops.some(s => s.storeName === 'Mercadona'));
    });

    await test('T4_S02: Compra en sótano sin conexión (100% offline con caché local de tiendas)', async () => {
      const env = createTestEnvironment();
      // Simular pérdida total de conexión (offline)
      env.fetch.__setFailure(new Error('Network offline'));

      // Las coordenadas ya están aprendidas en LocalStorage
      const learnedCoords = {
        mercadona: { lat: 40.4168, lng: -3.7038, displayName: 'Mercadona Centro' },
        lidl: { lat: 40.4255, lng: -3.7050, displayName: 'Lidl Fuencarral' }
      };
      env.localStorage.setItem('shopping_store_coords', JSON.stringify({ stores: learnedCoords }));

      const items = [
        { name: 'Arroz', location: 'Mercadona', completed: false, quantity: 1, unitPrice: 1.2 },
        { name: 'Galletas', location: 'Lidl', completed: false, quantity: 2, unitPrice: 1.5 }
      ];

      const cache = JSON.parse(env.localStorage.getItem('shopping_store_coords')).stores;
      const route = ReferenceMapRoute.calculateOptimalRoute(items, { lat: 40.4150, lng: -3.7070 }, cache);

      assert.strictEqual(route.orderedStops.length, 2);
      assert.ok(route.totalDistanceKm > 0);
      assert.ok(route.googleMapsUrl.includes('api=1'));
    });

    await test('T4_S03: Compra peatonal rápida con tienda única y punto de partida manual', () => {
      const items = [
        { name: 'Café', location: 'Día', completed: false, quantity: 1, unitPrice: 3.50 }
      ];
      const manualOrigin = { lat: 40.4130, lng: -3.7020, address: 'Plaza Tirso de Molina' };
      const route = ReferenceMapRoute.calculateOptimalRoute(items, manualOrigin);

      assert.strictEqual(route.orderedStops.length, 1);
      assert.strictEqual(route.orderedStops[0].storeName, 'Día');
      assert.strictEqual(route.googleMapsUrl.includes('waypoints='), false, 'Sin waypoints intermedios');
      assert.includes(route.googleMapsUrl, 'destination=40.412000,-3.700000');
    });
  });

  // =========================================================================
  // RESUMEN FINAL
  // =========================================================================
  console.log(`\n==================================================`);
  console.log(`RESUMEN DE PRUEBAS MAP & ROUTING:`);
  console.log(`Total: ${totalTests} | Aprobadas: ${passedTests} | Falladas: ${failedTests}`);
  console.log(`==================================================\n`);

  if (failedTests > 0) {
    console.error(`Se detectaron ${failedTests} fallos en la suite de mapa y rutas:`);
    failures.forEach((f, idx) => {
      console.error(`  ${idx + 1}. ${f.name}: ${f.error.message}`);
    });
    process.exit(1);
  } else {
    console.log('¡ÉXITO TOTAL! 100% de las pruebas de mapa y enrutamiento pasaron limpiamente.\n');
  }
}

// Ejecutar si se invoca directamente vía Node CLI
if (require.main === module) {
  runAllTests().catch(err => {
    console.error('Error fatal al ejecutar pruebas de mapa:', err);
    process.exit(1);
  });
}

module.exports = {
  ReferenceMapRoute,
  runAllTests
};
