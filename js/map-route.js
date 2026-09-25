/**
 * js/map-route.js
 * Módulo Desacoplado de Mapas, Geocodificación Defensiva, Ruteo TSP y Navegación Google Maps.
 * Lista de Compra | PRO
 * 
 * Compatible con entornos UMD (Navegadores y Node.js).
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    root.MapRouteService = exports;
    root.MapRoute = exports;
    if (typeof window !== 'undefined') {
      window.MapRouteService = exports;
      window.MapRoute = exports;
    }
  }
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  // ==========================================
  // 1. CONSTANTES DE CONFIGURACIÓN Y MODELO
  // ==========================================

  const STORAGE_KEYS = {
    STORE_COORDS: 'shopping_store_coords',
    ROUTE_ORIGIN: 'shopping_route_origin'
  };

  const DEFAULTS = {
    CIRCUITY_FACTOR: 1.25,           // Factor de sinuosidad urbana promedio
    AVERAGE_SPEED_KMH: 30,           // Velocidad media urbana en automóvil (30 km/h = 0.5 km/min)
    EARTH_RADIUS_KM: 6371,           // Radio medio esférico de la Tierra en km
    GEOCODE_DEBOUNCE_MS: 450,        // Ventana de debounce para consultas de geocodificación
    MAX_GOOGLE_MAPS_WAYPOINTS: 9,    // Límite oficial de waypoints intermedios en URLs de Google Maps
    DEFAULT_ORIGIN: {
      lat: 40.416775,
      lng: -3.703790,
      address: 'Puerta del Sol, Madrid (Referencia)',
      type: 'default',
      accuracy: null
    }
  };

  const TILE_PROVIDERS = {
    LIGHT: {
      url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      options: {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
      }
    },
    DARK: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      options: {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
      }
    }
  };

  // ==========================================
  // 2. UTILIDADES PURAS Y ALMACENAMIENTO DEFENSIVO
  // ==========================================

  /**
   * Controlador de almacenamiento en memoria para entornos Node.js,
   * modo incógnito estricto o fallos de cuota (QuotaExceededError).
   */
  class MemoryStorageDriver {
    constructor() {
      this._map = new Map();
    }
    getItem(key) {
      return this._map.has(key) ? this._map.get(key) : null;
    }
    setItem(key, val) {
      this._map.set(key, String(val));
    }
    removeItem(key) {
      this._map.delete(key);
    }
    clear() {
      this._map.clear();
    }
  }

  const memoryFallback = new MemoryStorageDriver();

  function getStorageDriver() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const probeKey = '__map_route_probe__';
        window.localStorage.setItem(probeKey, '1');
        window.localStorage.removeItem(probeKey);
        return window.localStorage;
      }
    } catch (_) {
      // Ignorado, retornará fallback en memoria
    }
    return memoryFallback;
  }

  function safeStorageGet(key) {
    try {
      const driver = getStorageDriver();
      const val = driver.getItem(key);
      if (val !== null) return val;
    } catch (_) {
      // Intentar fallback en memoria
    }
    return memoryFallback.getItem(key);
  }

  function safeStorageSet(key, value) {
    const str = String(value);
    try {
      const driver = getStorageDriver();
      driver.setItem(key, str);
    } catch (_) {
      memoryFallback.setItem(key, str);
    }
  }

  /**
   * Sanitización anti-XSS para inyecciones HTML en popups y tooltips del mapa.
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Normaliza el nombre de un comercio para indexación y caché insensible a mayúsculas y acentos.
   */
  function normalizeStoreName(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Valida si un objeto posee coordenadas geográficas finitas y en rango válido.
   */
  function isValidCoordinates(coord) {
    if (!coord || typeof coord !== 'object') return false;
    const lat = Number(coord.lat !== undefined ? coord.lat : coord.latitude);
    const lng = Number(coord.lng !== undefined ? coord.lng : (coord.lon !== undefined ? coord.lon : coord.longitude));
    return !isNaN(lat) && !isNaN(lng) && isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  // ==========================================
  // 3. CAPA DE ALMACENAMIENTO DE COORDENADAS
  // ==========================================

  /**
   * Recupera el diccionario completo de coordenadas almacenadas en LocalStorage.
   * Retorna un objeto mapeado: { [storeKeyNormalized]: { lat, lng, displayName, address, updatedAt, source } }
   */
  function getStoredCoordinates() {
    const raw = safeStorageGet(STORAGE_KEYS.STORE_COORDS);
    if (!raw) return {};

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};

      // Si viene envuelto en versión { version: 1, stores: { ... } }
      if (parsed.stores && typeof parsed.stores === 'object') {
        return parsed.stores;
      }
      return parsed;
    } catch (_) {
      return {};
    }
  }

  /**
   * Persiste o actualiza la coordenada de un comercio en LocalStorage bajo su clave normalizada.
   */
  function saveStoreCoordinate(storeName, coord) {
    if (!storeName || !isValidCoordinates(coord)) return false;

    const key = normalizeStoreName(storeName);
    if (!key) return false;

    const lat = Number(coord.lat !== undefined ? coord.lat : coord.latitude);
    const lng = Number(coord.lng !== undefined ? coord.lng : (coord.lon !== undefined ? coord.lon : coord.longitude));

    const stores = getStoredCoordinates();
    stores[key] = {
      displayName: coord.displayName || String(storeName).trim(),
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      address: coord.address || coord.displayName || '',
      source: coord.source || 'manual',
      updatedAt: Date.now()
    };

    const payload = {
      version: 1,
      updatedAt: Date.now(),
      stores
    };

    safeStorageSet(STORAGE_KEYS.STORE_COORDS, JSON.stringify(payload));
    return true;
  }

  /**
   * Obtiene el punto de origen de navegación guardado o el valor predeterminado de referencia.
   */
  function getStoredOrigin() {
    const raw = safeStorageGet(STORAGE_KEYS.ROUTE_ORIGIN);
    if (!raw) {
      return Object.assign({}, DEFAULTS.DEFAULT_ORIGIN);
    }

    try {
      const parsed = JSON.parse(raw);
      if (isValidCoordinates(parsed)) {
        return {
          lat: Number(parsed.lat),
          lng: Number(parsed.lng),
          address: parsed.address || 'Punto de partida',
          type: parsed.type || 'manual',
          accuracy: parsed.accuracy || null,
          updatedAt: parsed.updatedAt || Date.now()
        };
      }
    } catch (_) {
      // Ignorado, retorna default
    }

    return Object.assign({}, DEFAULTS.DEFAULT_ORIGIN);
  }

  /**
   * Guarda el punto de partida seleccionado por el usuario.
   */
  function saveOrigin(origin) {
    if (!isValidCoordinates(origin)) return false;

    const lat = Number(origin.lat !== undefined ? origin.lat : origin.latitude);
    const lng = Number(origin.lng !== undefined ? origin.lng : (origin.lon !== undefined ? origin.lon : origin.longitude));

    const payload = {
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      address: origin.address || (origin.type === 'gps' ? 'Mi Ubicación actual (GPS)' : 'Punto de partida'),
      type: origin.type || 'manual',
      accuracy: origin.accuracy || null,
      updatedAt: Date.now()
    };

    safeStorageSet(STORAGE_KEYS.ROUTE_ORIGIN, JSON.stringify(payload));
    return true;
  }

  // ==========================================
  // 4. MOTOR DE GEOCODIFICACIÓN DEFENSIVO
  // ==========================================

  let geocodeDebounceTimer = null;
  let activeAbortController = null;

  /**
   * Geocodifica una dirección o nombre de comercio de forma resiliente:
   * 1. Consulta la caché local (0 ms de red).
   * 2. Si no existe, invoca Nominatim OSM con debounce de 450 ms y AbortController.
   * 3. Si Nominatim falla o limita tasa (429), invoca Photon (Komoot).
   * 4. Si tiene éxito, almacena automáticamente en caché para futuras consultas.
   * 
   * @param {string} query - Nombre o dirección del comercio
   * @param {Object} [options] - Opciones de consulta { immediate: boolean, signal: AbortSignal }
   * @returns {Promise<Object|null>} Coordenadas resueltas o null
   */
  function geocodeAddress(query, options = {}) {
    if (!query || typeof query !== 'string') {
      return Promise.resolve(null);
    }

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return Promise.resolve(null);
    }

    // 1. Verificación previa en caché local (cero peticiones duplicadas)
    const normalizedKey = normalizeStoreName(trimmed);
    const cachedStores = getStoredCoordinates();
    if (cachedStores[normalizedKey] && isValidCoordinates(cachedStores[normalizedKey])) {
      const c = cachedStores[normalizedKey];
      return Promise.resolve({
        lat: c.lat,
        lng: c.lng,
        displayName: c.displayName || trimmed,
        address: c.address || '',
        source: c.source || 'cache',
        fromCache: true
      });
    }

    // 2. Control de ejecución diferida (debounce) y cancelación de peticiones previas
    const isImmediate = Boolean(options.immediate);

    if (activeAbortController) {
      try {
        activeAbortController.abort();
      } catch (_) {}
    }

    if (geocodeDebounceTimer && !isImmediate) {
      clearTimeout(geocodeDebounceTimer);
    }

    return new Promise((resolve) => {
      const executeLookup = async () => {
        // Si no hay conexión de red y no estaba en caché
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          return resolve(null);
        }

        const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        activeAbortController = controller;
        const signal = options.signal || (controller ? controller.signal : null);

        // Si fetch no está disponible (ej. entornos antiguos de Node sin polyfill)
        if (typeof fetch === 'undefined') {
          return resolve(null);
        }

        let resolvedResult = null;

        // --- Intento 1: Nominatim OpenStreetMap ---
        try {
          const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&limit=1&addressdetails=1`;
          const fetchOpts = {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'ListaDeCompraPRO-Web/2.0'
            }
          };
          if (signal) fetchOpts.signal = signal;

          const res = await fetch(nominatimUrl, fetchOpts);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
              resolvedResult = {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
                displayName: data[0].display_name || trimmed,
                address: data[0].display_name || '',
                source: 'nominatim'
              };
            }
          }
        } catch (err) {
          if (err && err.name === 'AbortError') {
            return resolve(null);
          }
        }

        // --- Intento 2: Fallback a Photon Komoot si Nominatim no respondió o falló ---
        if (!resolvedResult) {
          try {
            const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}&limit=1`;
            const fetchOpts = { method: 'GET', headers: { 'Accept': 'application/json' } };
            if (signal) fetchOpts.signal = signal;

            const res = await fetch(photonUrl, fetchOpts);
            if (res.ok) {
              const data = await res.json();
              if (data && data.features && data.features.length > 0) {
                const feat = data.features[0];
                const coords = feat.geometry && feat.geometry.coordinates; // [lon, lat]
                if (Array.isArray(coords) && coords.length >= 2) {
                  const props = feat.properties || {};
                  const addrParts = [props.name, props.street, props.city, props.country].filter(Boolean);
                  resolvedResult = {
                    lat: parseFloat(coords[1]),
                    lng: parseFloat(coords[0]),
                    displayName: props.name || trimmed,
                    address: addrParts.join(', ') || trimmed,
                    source: 'photon'
                  };
                }
              }
            }
          } catch (err) {
            if (err && err.name === 'AbortError') {
              return resolve(null);
            }
          }
        }

        // Si se resolvió con éxito, persistir en caché local de inmediato
        if (resolvedResult && isValidCoordinates(resolvedResult)) {
          saveStoreCoordinate(trimmed, resolvedResult);
          return resolve(resolvedResult);
        }

        return resolve(null);
      };

      if (isImmediate) {
        executeLookup();
      } else {
        geocodeDebounceTimer = setTimeout(executeLookup, DEFAULTS.GEOCODE_DEBOUNCE_MS);
      }
    });
  }

  // ==========================================
  // 5. GEOLOCALIZACIÓN DEL DISPOSITIVO
  // ==========================================

  /**
   * Obtiene la posición actual mediante navigator.geolocation.
   * Conmuta a fallback elegante si los permisos son denegados o si ocurre timeout.
   */
  function getCurrentLocation(options = {}) {
    return new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation || typeof navigator.geolocation.getCurrentPosition !== 'function') {
        return resolve(getStoredOrigin());
      }

      const geoOptions = {
        enableHighAccuracy: options.enableHighAccuracy !== undefined ? options.enableHighAccuracy : true,
        timeout: options.timeout || 10000,
        maximumAge: options.maximumAge || 60000
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!position || !position.coords) {
            return resolve(getStoredOrigin());
          }
          const result = {
            type: 'gps',
            lat: Math.round(position.coords.latitude * 1e6) / 1e6,
            lng: Math.round(position.coords.longitude * 1e6) / 1e6,
            accuracy: position.coords.accuracy || null,
            address: 'Mi Ubicación actual (GPS)',
            updatedAt: Date.now()
          };
          saveOrigin(result);
          resolve(result);
        },
        (_error) => {
          // Fallback elegante a origen guardado o punto por defecto
          resolve(getStoredOrigin());
        },
        geoOptions
      );
    });
  }

  // ==========================================
  // 6. ALGORITMOS MATEMÁTICOS, HAVERSINE Y TSP
  // ==========================================

  /**
   * Fórmula exacta de Haversine para distancias esféricas sobre el elipsoide terrestre.
   * R = 6371 km. Retorna distancia en kilómetros.
   */
  function haversineDistance(coord1, coord2) {
    if (!coord1 || !coord2) return 0;

    const lat1 = Number(coord1.lat !== undefined ? coord1.lat : coord1.latitude);
    const lng1 = Number(coord1.lng !== undefined ? coord1.lng : (coord1.lon !== undefined ? coord1.lon : coord1.longitude));
    const lat2 = Number(coord2.lat !== undefined ? coord2.lat : coord2.latitude);
    const lng2 = Number(coord2.lng !== undefined ? coord2.lng : (coord2.lon !== undefined ? coord2.lon : coord2.longitude));

    if (isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)) return 0;
    if (lat1 === lat2 && lng1 === lng2) return 0;

    const toRad = deg => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const rLat1 = toRad(lat1);
    const rLat2 = toRad(lat2);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(rLat1) * Math.cos(rLat2) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const clampedA = Math.min(1, Math.max(0, a));
    const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));

    return DEFAULTS.EARTH_RADIUS_KM * c;
  }

  /**
   * Ajusta la distancia lineal teórica aplicando el factor de sinuosidad urbana (circuity = 1.25).
   */
  function calculateUrbanDistance(haversineKm, factor = DEFAULTS.CIRCUITY_FACTOR) {
    const d = Number(haversineKm);
    if (isNaN(d) || d <= 0) return 0;
    return d * factor;
  }

  /**
   * Estima el tiempo de desplazamiento en minutos a velocidad urbana constante (30 km/h = 0.5 km/min).
   * Redondeo hacia arriba al minuto entero. Si la distancia es > 0, tiempo mínimo 1 min.
   */
  function calculateEstimatedMinutes(urbanDistanceKm, speedKmH = DEFAULTS.AVERAGE_SPEED_KMH) {
    const d = Number(urbanDistanceKm);
    if (isNaN(d) || d <= 0) return 0;
    const minutes = Math.ceil((d / speedKmH) * 60);
    return Math.max(1, minutes);
  }

  /**
   * Algoritmo del Vecino Más Cercano (Nearest Neighbor TSP) para optimizar la secuencia de visitas:
   * 1. Agrupa ítems pendientes (!item.completed) por tienda (item.location).
   * 2. Calcula cantidad de artículos y subtotal estimado en centavos enteros.
   * 3. Resuelve coordenadas de cada comercio desde la caché o fallback.
   * 4. Ordena iterativamente la secuencia visitando la tienda más cercana aún no visitada.
   * 5. Desempate determinista por orden alfabético de tienda (localeCompare).
   * 6. Genera el itinerario completo con distancias, minutos y URL de Google Maps.
   */
  function calculateOptimalRoute(items, customOrigin = null) {
    const origin = (customOrigin && isValidCoordinates(customOrigin))
      ? customOrigin
      : getStoredOrigin();

    if (!Array.isArray(items) || items.length === 0) {
      return {
        origin,
        orderedStops: [],
        totalDistanceKm: 0,
        totalUrbanDistanceKm: 0,
        estimatedDurationMinutes: 0,
        googleMapsUrl: ''
      };
    }

    // Filtrar únicamente ítems pendientes
    const pendingItems = items.filter(it => it && !it.completed);
    if (pendingItems.length === 0) {
      return {
        origin,
        orderedStops: [],
        totalDistanceKm: 0,
        totalUrbanDistanceKm: 0,
        estimatedDurationMinutes: 0,
        googleMapsUrl: ''
      };
    }

    // Agrupar ítems por comercio
    const groupsByStore = new Map();
    const storedCoords = getStoredCoordinates();

    for (const item of pendingItems) {
      const rawStoreName = (item.location && String(item.location).trim()) || 'General';
      if (!groupsByStore.has(rawStoreName)) {
        groupsByStore.set(rawStoreName, []);
      }
      groupsByStore.get(rawStoreName).push(item);
    }

    // Construir objetos de paradas candidatos
    const candidateStops = [];
    for (const [storeName, storeItems] of groupsByStore.entries()) {
      const normalizedKey = normalizeStoreName(storeName);
      const coordData = storedCoords[normalizedKey];

      // Determinar coordenadas: de la caché de tiendas, de storeCoords del ítem, o estimadas
      let lat = null;
      let lng = null;
      let address = storeName;

      if (coordData && isValidCoordinates(coordData)) {
        lat = coordData.lat;
        lng = coordData.lng;
        address = coordData.address || coordData.displayName || storeName;
      } else {
        // Buscar si algún producto tiene coordenadas embebidas
        const itemWithCoords = storeItems.find(it => it.storeCoords && isValidCoordinates(it.storeCoords));
        if (itemWithCoords) {
          lat = itemWithCoords.storeCoords.lat;
          lng = itemWithCoords.storeCoords.lng;
        } else {
          // Si no tiene coordenadas geocodificadas, se ubica cerca del origen con un offset determinista
          // para no romper el cálculo de ruta (o se mantiene visible)
          const hash = Math.abs(Array.from(storeName).reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) | 0, 0));
          const offsetLat = ((hash % 100) - 50) * 0.0003;
          const offsetLng = (((hash >> 4) % 100) - 50) * 0.0003;
          lat = origin.lat + offsetLat;
          lng = origin.lng + offsetLng;
        }
      }

      // Cálculo de cantidad de productos y subtotal monetario en centavos enteros
      let itemCount = 0;
      let totalCents = 0;

      for (const item of storeItems) {
        const qty = Number(item.quantity);
        const safeQty = (!isNaN(qty) && isFinite(qty) && qty > 0) ? qty : 1;
        itemCount += safeQty;

        const price = Number(item.unitPrice);
        const safePrice = (!isNaN(price) && isFinite(price) && price >= 0) ? price : 0;
        const itemCents = Math.round(safeQty * Math.round(safePrice * 100));
        totalCents += itemCents;
      }

      candidateStops.push({
        storeName,
        lat: Math.round(lat * 1e6) / 1e6,
        lng: Math.round(lng * 1e6) / 1e6,
        address,
        pendingItems: storeItems,
        itemCount: Math.round((itemCount + Number.EPSILON) * 1000) / 1000,
        estimatedTotal: Math.round((totalCents / 100 + Number.EPSILON) * 100) / 100
      });
    }

    // --- ALGORITMO TSP GREEDY (NEAREST NEIGHBOR) ---
    const unvisited = [...candidateStops];
    const orderedStops = [];
    let currentPoint = { lat: origin.lat, lng: origin.lng };
    let accumulatedHaversineKm = 0;
    let accumulatedUrbanKm = 0;

    while (unvisited.length > 0) {
      let nearestIndex = 0;
      let minDistance = haversineDistance(currentPoint, unvisited[0]);

      for (let i = 1; i < unvisited.length; i++) {
        const candidate = unvisited[i];
        const dist = haversineDistance(currentPoint, candidate);

        if (dist < minDistance - 1e-9) {
          minDistance = dist;
          nearestIndex = i;
        } else if (Math.abs(dist - minDistance) <= 1e-9) {
          // Desempate determinista por orden alfabético
          if (candidate.storeName.localeCompare(unvisited[nearestIndex].storeName) < 0) {
            minDistance = dist;
            nearestIndex = i;
          }
        }
      }

      const selectedStop = unvisited.splice(nearestIndex, 1)[0];
      const legHaversine = haversineDistance(currentPoint, selectedStop);
      const legUrban = calculateUrbanDistance(legHaversine);
      const legMinutes = calculateEstimatedMinutes(legUrban);

      selectedStop.stepIndex = orderedStops.length + 1;
      selectedStop.stepDistanceKm = Math.round(legHaversine * 100) / 100;
      selectedStop.stepUrbanDistanceKm = Math.round(legUrban * 100) / 100;
      selectedStop.stepMinutes = legMinutes;

      accumulatedHaversineKm += legHaversine;
      accumulatedUrbanKm += legUrban;

      orderedStops.push(selectedStop);
      currentPoint = { lat: selectedStop.lat, lng: selectedStop.lng };
    }

    const totalDistanceKm = Math.round(accumulatedHaversineKm * 100) / 100;
    const totalUrbanDistanceKm = Math.round(accumulatedUrbanKm * 100) / 100;
    const estimatedDurationMinutes = calculateEstimatedMinutes(totalUrbanDistanceKm);

    const googleMapsUrl = generateGoogleMapsUrl(origin, orderedStops);

    return {
      origin,
      orderedStops,
      totalDistanceKm,
      totalUrbanDistanceKm,
      estimatedDurationMinutes,
      googleMapsUrl
    };
  }

  // ==========================================
  // 7. GENERADOR UNIVERSAL DE URL GOOGLE MAPS
  // ==========================================

  /**
   * Construye la URL universal de Google Maps Navigation con origen, destino y paradas intermedias.
   * Respeta el límite defensivo de 9 waypoints intermedios de Google Maps.
   */
  function generateGoogleMapsUrl(origin, stops, options = {}) {
    if (!stops || !Array.isArray(stops) || stops.length === 0) {
      return '';
    }

    const travelMode = options.travelMode || 'driving';

    const formatCoordinate = pt => {
      if (!pt) return '';
      if (typeof pt.lat === 'number' && typeof pt.lng === 'number') {
        return `${pt.lat},${pt.lng}`;
      }
      return pt.address || pt.storeName || '';
    };

    const originStr = formatCoordinate(origin);
    if (!originStr) return '';

    // Si solo hay una tienda, ruta directa: Origen -> Destino
    if (stops.length === 1) {
      const destStr = formatCoordinate(stops[0]);
      return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originStr)}&destination=${encodeURIComponent(destStr)}&travelmode=${travelMode}`;
    }

    // Si hay 2 o más tiendas: Destino es la última parada
    const destinationStop = stops[stops.length - 1];
    const destStr = formatCoordinate(destinationStop);

    // Paradas intermedias (todas excepto la última)
    const intermediateStops = stops.slice(0, stops.length - 1);

    // Limitar defensivamente a un máximo de 9 waypoints
    const cappedWaypoints = intermediateStops.slice(0, DEFAULTS.MAX_GOOGLE_MAPS_WAYPOINTS);
    const waypointsStr = cappedWaypoints.map(formatCoordinate).filter(Boolean).join('|');

    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originStr)}&destination=${encodeURIComponent(destStr)}&waypoints=${encodeURIComponent(waypointsStr)}&travelmode=${travelMode}`;
  }

  // ==========================================
  // 8. CONTROLADOR DE RENDERIZADO LEAFLET
  // ==========================================

  class MapController {
    constructor() {
      this.map = null;
      this.containerId = null;
      this.currentTheme = 'light';
      this.tileLayer = null;
      this.markersLayer = null;
      this.routeLayer = null;
    }

    /**
     * Resuelve el objeto global L de Leaflet de forma segura en navegador o mock.
     */
    _getLeaflet() {
      if (typeof window !== 'undefined' && window.L) return window.L;
      if (typeof global !== 'undefined' && global.L) return global.L;
      return null;
    }

    /**
     * Inicializa la instancia del mapa Leaflet en el contenedor DOM indicado.
     */
    initMap(containerId, options = {}) {
      const L = this._getLeaflet();
      if (!L || typeof L.map !== 'function') {
        return null;
      }

      this.containerId = containerId;
      this.currentTheme = options.isDark ? 'dark' : 'light';

      // Si ya existía un mapa previo en este controlador, limpiarlo
      if (this.map && typeof this.map.remove === 'function') {
        try {
          this.map.remove();
        } catch (_) {}
        this.map = null;
      }

      const center = options.center || [DEFAULTS.DEFAULT_ORIGIN.lat, DEFAULTS.DEFAULT_ORIGIN.lng];
      const zoom = options.zoom || 13;

      // Configuración de mapa móvil con protección contra scroll trap
      this.map = L.map(containerId, {
        center,
        zoom,
        zoomControl: false,
        scrollWheelZoom: false, // Prevención de trampa de scroll en móviles
        attributionControl: true
      });

      // Añadir control de zoom accesible en esquina superior derecha
      if (L.control && typeof L.control.zoom === 'function') {
        L.control.zoom({ position: 'topright' }).addTo(this.map);
      }

      // Capa de teselas inicial
      this._applyTileLayer(this.currentTheme);

      // Grupos de capas dedicados para marcadores y polilínea de ruta
      if (typeof L.layerGroup === 'function') {
        this.markersLayer = L.layerGroup().addTo(this.map);
        this.routeLayer = L.layerGroup().addTo(this.map);
      }

      return this.map;
    }

    /**
     * Aplica la capa de teselas según el tema visual activo (CartoDB Positron o Dark Matter).
     */
    _applyTileLayer(theme) {
      const L = this._getLeaflet();
      if (!L || !this.map || typeof L.tileLayer !== 'function') return;

      if (this.tileLayer) {
        try {
          this.map.removeLayer(this.tileLayer);
        } catch (_) {}
      }

      const provider = (theme === 'dark') ? TILE_PROVIDERS.DARK : TILE_PROVIDERS.LIGHT;
      this.tileLayer = L.tileLayer(provider.url, provider.options);
      this.tileLayer.addTo(this.map);
      this.currentTheme = theme;
    }

    /**
     * Conmuta dinámicamente entre modo claro y modo oscuro.
     */
    setTheme(isDark) {
      const newTheme = isDark ? 'dark' : 'light';
      if (this.currentTheme !== newTheme) {
        this._applyTileLayer(newTheme);
      }
    }

    /**
     * Crea un icono SVG accesible para el punto de origen.
     */
    _createOriginIcon() {
      const L = this._getLeaflet();
      if (!L || typeof L.divIcon !== 'function') return null;

      const html = `
        <div class="map-pin-origin" style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;background:#10b981;color:#ffffff;border-radius:50%;border:3px solid #ffffff;box-shadow:0 3px 10px rgba(0,0,0,0.3);cursor:pointer;" aria-label="Punto de partida">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
        </div>
      `;

      return L.divIcon({
        html,
        className: 'leaflet-origin-pin-container',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -20]
      });
    }

    /**
     * Crea un icono SVG accesible para una parada numerada del itinerario.
     */
    _createStopIcon(stopNumber, storeName) {
      const L = this._getLeaflet();
      if (!L || typeof L.divIcon !== 'function') return null;

      const html = `
        <div class="map-pin-stop" style="display:flex;flex-direction:column;align-items:center;cursor:pointer;" aria-label="Parada ${stopNumber}: ${escapeHtml(storeName)}">
          <div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;background:#4f46e5;color:#ffffff;font-weight:700;font-size:14px;border-radius:50%;border:3px solid #ffffff;box-shadow:0 3px 10px rgba(0,0,0,0.35);">
            ${stopNumber}
          </div>
          <div style="background:rgba(15,23,42,0.85);color:#f8fafc;font-size:11px;font-weight:600;padding:2px 6px;border-radius:4px;margin-top:2px;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 5px rgba(0,0,0,0.2);">
            ${escapeHtml(storeName)}
          </div>
        </div>
      `;

      return L.divIcon({
        html,
        className: 'leaflet-stop-pin-container',
        iconSize: [40, 56],
        iconAnchor: [20, 20],
        popupAnchor: [0, -24]
      });
    }

    /**
     * Dibuja los marcadores de la ruta (origen + paradas ordenadas) con popups detallados.
     */
    renderMarkers(stops, origin = null) {
      const L = this._getLeaflet();
      if (!L || !this.map) return;

      if (this.markersLayer && typeof this.markersLayer.clearLayers === 'function') {
        this.markersLayer.clearLayers();
      }

      // 1. Marcador del Punto de Partida
      if (origin && isValidCoordinates(origin)) {
        const originIcon = this._createOriginIcon();
        const markerOpts = originIcon ? { icon: originIcon } : {};
        const originMarker = L.marker([origin.lat, origin.lng], markerOpts);

        const originPopupContent = `
          <div class="map-popup-card" style="font-family:inherit;min-width:180px;padding:4px;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#10b981;"></span>
              <strong style="font-size:14px;color:var(--text-main,#0f172a);">Punto de Partida</strong>
            </div>
            <p style="margin:0;font-size:12px;color:var(--text-muted,#64748b);">${escapeHtml(origin.address || 'Ubicación actual')}</p>
          </div>
        `;

        if (typeof originMarker.bindPopup === 'function') {
          originMarker.bindPopup(originPopupContent);
        }

        if (this.markersLayer) {
          originMarker.addTo(this.markersLayer);
        } else {
          originMarker.addTo(this.map);
        }
      }

      // 2. Marcadores de las Paradas Ordenadas
      if (Array.isArray(stops)) {
        stops.forEach((stop, idx) => {
          if (!isValidCoordinates(stop)) return;

          const stopNumber = idx + 1;
          const stopIcon = this._createStopIcon(stopNumber, stop.storeName);
          const markerOpts = stopIcon ? { icon: stopIcon } : {};
          const marker = L.marker([stop.lat, stop.lng], markerOpts);

          // Construcción de la lista de productos pendientes en el popup
          let itemsListHtml = '';
          if (Array.isArray(stop.pendingItems) && stop.pendingItems.length > 0) {
            const listItems = stop.pendingItems.slice(0, 6).map(it => {
              const q = it.quantity || 1;
              const p = it.unitPrice || 0;
              const subtotal = Math.round(q * Math.round(p * 100)) / 100;
              return `<li style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dashed var(--border,#e2e8f0);font-size:12px;">
                <span>${escapeHtml(it.name)} (x${q})</span>
                <strong>${subtotal > 0 ? '$' + subtotal.toFixed(2) : '-'}</strong>
              </li>`;
            }).join('');

            const overflowNote = stop.pendingItems.length > 6
              ? `<p style="margin:4px 0 0;font-size:11px;color:var(--text-muted,#64748b);text-align:right;">+ ${stop.pendingItems.length - 6} más...</p>`
              : '';

            itemsListHtml = `
              <ul style="list-style:none;padding:0;margin:8px 0;max-height:160px;overflow-y:auto;">
                ${listItems}
              </ul>
              ${overflowNote}
            `;
          } else {
            itemsListHtml = `<p style="font-size:12px;color:var(--text-muted,#64748b);margin:6px 0;">Sin productos pendientes</p>`;
          }

          const popupContent = `
            <div class="map-popup-card" style="font-family:inherit;min-width:220px;max-width:280px;padding:4px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                <span style="background:#4f46e5;color:#ffffff;font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px;">Parada ${stopNumber}</span>
                <span style="font-size:11px;color:var(--text-muted,#64748b);">${stop.stepDistanceKm ? stop.stepDistanceKm + ' km' : ''}</span>
              </div>
              <h4 style="margin:4px 0;font-size:15px;font-weight:700;color:var(--text-main,#0f172a);">${escapeHtml(stop.storeName)}</h4>
              <p style="margin:0 0 6px;font-size:11px;color:var(--text-muted,#64748b);">${escapeHtml(stop.address || stop.storeName)}</p>
              ${itemsListHtml}
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;padding-top:6px;border-top:1px solid var(--border,#e2e8f0);">
                <span style="font-size:12px;font-weight:600;">Total Parada:</span>
                <strong style="font-size:14px;color:#10b981;">$${(stop.estimatedTotal || 0).toFixed(2)}</strong>
              </div>
            </div>
          `;

          if (typeof marker.bindPopup === 'function') {
            marker.bindPopup(popupContent, { maxWidth: 300 });
          }

          if (this.markersLayer) {
            marker.addTo(this.markersLayer);
          } else {
            marker.addTo(this.map);
          }
        });
      }
    }

    /**
     * Dibuja la polilínea continua de la ruta sobre el mapa.
     */
    renderPolyline(stops, origin = null) {
      const L = this._getLeaflet();
      if (!L || !this.map || typeof L.polyline !== 'function') return;

      if (this.routeLayer && typeof this.routeLayer.clearLayers === 'function') {
        this.routeLayer.clearLayers();
      }

      const points = [];
      if (origin && isValidCoordinates(origin)) {
        points.push([origin.lat, origin.lng]);
      }

      if (Array.isArray(stops)) {
        stops.forEach(s => {
          if (isValidCoordinates(s)) {
            points.push([s.lat, s.lng]);
          }
        });
      }

      if (points.length >= 2) {
        const polyline = L.polyline(points, {
          color: '#4f46e5',
          weight: 4,
          opacity: 0.85,
          dashArray: '8, 6',
          lineJoin: 'round'
        });

        if (this.routeLayer) {
          polyline.addTo(this.routeLayer);
        } else {
          polyline.addTo(this.map);
        }
      }
    }

    /**
     * Ajusta el viewport y zoom del mapa para encuadrar todo el itinerario.
     */
    fitRouteBounds(stops, origin = null) {
      const L = this._getLeaflet();
      if (!L || !this.map || typeof L.latLngBounds !== 'function') return;

      const points = [];
      if (origin && isValidCoordinates(origin)) {
        points.push([origin.lat, origin.lng]);
      }
      if (Array.isArray(stops)) {
        stops.forEach(s => {
          if (isValidCoordinates(s)) {
            points.push([s.lat, s.lng]);
          }
        });
      }

      if (points.length === 0) return;

      try {
        const bounds = L.latLngBounds(points);
        if (typeof this.map.fitBounds === 'function') {
          this.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
        }
      } catch (_) {}
    }

    /**
     * Renderiza el itinerario completo (marcadores, línea y encuadre) en el mapa.
     */
    renderRouteOnMap(route) {
      if (!route) return;
      this.renderMarkers(route.orderedStops, route.origin);
      this.renderPolyline(route.orderedStops, route.origin);
      this.fitRouteBounds(route.orderedStops, route.origin);
    }

    /**
     * Ajusta el tamaño de la capa Leaflet al conmutar pestañas o redimensionar ventana.
     */
    invalidateSize() {
      if (this.map && typeof this.map.invalidateSize === 'function') {
        try {
          this.map.invalidateSize();
        } catch (_) {}
      }
    }

    /**
     * Destruye de forma segura la instancia del mapa.
     */
    destroy() {
      if (this.map && typeof this.map.remove === 'function') {
        try {
          this.map.remove();
        } catch (_) {}
      }
      this.map = null;
      this.tileLayer = null;
      this.markersLayer = null;
      this.routeLayer = null;
    }
  }

  // ==========================================
  // 9. INSTANCIA DE SERVICIO PRINCIPAL (FACADE)
  // ==========================================

  const mapControllerInstance = new MapController();

  const MapRouteService = {
    // Configuración y Constantes
    STORAGE_KEYS,
    DEFAULTS,
    TILE_PROVIDERS,

    // Capa de Almacenamiento
    getStoredCoordinates,
    saveStoreCoordinate,
    getStoredOrigin,
    getOrigin: getStoredOrigin,
    saveOrigin,
    setOrigin: saveOrigin,
    normalizeStoreName,
    isValidCoordinates,

    // Geocodificación y Geolocalización
    geocodeAddress,
    getCurrentLocation,

    // Algoritmos y Ruteo
    haversineDistance,
    calculateUrbanDistance,
    calculateEstimatedMinutes,
    calculateOptimalRoute,
    generateGoogleMapsUrl,

    // Controlador de Mapa Leaflet
    MapController,
    mapController: mapControllerInstance,
    initMap: (containerId, opts) => mapControllerInstance.initMap(containerId, opts),
    setTheme: (isDark) => mapControllerInstance.setTheme(isDark),
    renderMarkers: (stops, origin) => mapControllerInstance.renderMarkers(stops, origin),
    renderPolyline: (stops, origin) => mapControllerInstance.renderPolyline(stops, origin),
    fitRouteBounds: (stops, origin) => mapControllerInstance.fitRouteBounds(stops, origin),
    renderRouteOnMap: (route) => mapControllerInstance.renderRouteOnMap(route),
    invalidateSize: () => mapControllerInstance.invalidateSize(),
    destroy: () => mapControllerInstance.destroy()
  };

  return MapRouteService;
}));
