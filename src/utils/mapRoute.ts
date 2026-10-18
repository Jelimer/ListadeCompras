import { ShoppingItem, RouteOrigin, RouteStop, RouteCalculationResult, StoredStoreCoordinate } from '../types';
import {
  DEFAULT_ORIGIN,
  loadStoredCoordinates,
  saveStoreCoordinate,
  loadStoredOrigin,
  saveStoredOrigin,
  normalizeStoreKey,
} from './storage';

const CIRCUITY_FACTOR = 1.25;
const AVERAGE_SPEED_KMH = 30;
const EARTH_RADIUS_KM = 6371;
const MAX_GOOGLE_MAPS_WAYPOINTS = 9;

const PENDING_LOCATION_NAMES = [
  'por averiguar',
  'por definir',
  'sin asignar',
  'sin lugar',
  'a averiguar',
  'averiguar',
  'pendiente',
  'sin tienda',
  'indefinido',
];

function isUnassignedStoreName(locName: string): boolean {
  if (!locName) return true;
  const clean = locName.trim().toLowerCase();
  return PENDING_LOCATION_NAMES.includes(clean);
}

export interface OSRMRouteData {
  coordinates: [number, number][]; // [lat, lng] pairs for Leaflet
  totalDistanceKm: number;
  totalDurationMinutes: number;
  legs: Array<{
    distanceKm: number;
    durationMinutes: number;
  }>;
}

const osrmCache = new Map<string, OSRMRouteData>();

export async function fetchOSRMRoute(
  origin: RouteOrigin,
  stops: RouteStop[],
  signal?: AbortSignal
): Promise<OSRMRouteData | null> {
  if (!stops || stops.length === 0) return null;

  const points = [
    { lat: origin.lat, lng: origin.lng },
    ...stops.map((s) => ({ lat: s.lat, lng: s.lng })),
  ];

  // If all points are identical, skip OSRM call
  const hasDistinctCoords = points.some(
    (pt) => Math.abs(pt.lat - origin.lat) > 1e-6 || Math.abs(pt.lng - origin.lng) > 1e-6
  );
  if (!hasDistinctCoords) return null;

  const coordString = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  if (osrmCache.has(coordString)) {
    return osrmCache.get(coordString)!;
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson&steps=false`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
      return null;
    }

    const primaryRoute = data.routes[0];
    const rawCoords: [number, number][] = primaryRoute.geometry?.coordinates || [];
    const leafletCoords: [number, number][] = rawCoords.map(([lng, lat]) => [lat, lng]);

    const totalDistanceKm = Math.round((Number(primaryRoute.distance || 0) / 1000) * 100) / 100;
    const totalDurationMinutes = Math.max(1, Math.ceil(Number(primaryRoute.duration || 0) / 60));

    const legs = Array.isArray(primaryRoute.legs)
      ? primaryRoute.legs.map((leg: { distance?: number; duration?: number }) => ({
          distanceKm: Math.round((Number(leg.distance || 0) / 1000) * 100) / 100,
          durationMinutes: Math.max(1, Math.ceil(Number(leg.duration || 0) / 60)),
        }))
      : [];

    const result: OSRMRouteData = {
      coordinates: leafletCoords,
      totalDistanceKm,
      totalDurationMinutes,
      legs,
    };

    osrmCache.set(coordString, result);
    return result;
  } catch {
    return null;
  }
}

export function haversineDistance(
  coord1: { lat: number; lng: number },
  coord2: { lat: number; lng: number }
): number {
  if (!coord1 || !coord2) return 0;
  const lat1 = Number(coord1.lat);
  const lng1 = Number(coord1.lng);
  const lat2 = Number(coord2.lat);
  const lng2 = Number(coord2.lng);

  if (isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)) return 0;
  if (lat1 === lat2 && lng1 === lng2) return 0;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const clampedA = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));

  return EARTH_RADIUS_KM * c;
}

export function calculateUrbanDistance(haversineKm: number, factor = CIRCUITY_FACTOR): number {
  const d = Number(haversineKm);
  if (isNaN(d) || d <= 0) return 0;
  return d * factor;
}

export function calculateEstimatedMinutes(urbanDistanceKm: number, speedKmH = AVERAGE_SPEED_KMH): number {
  const d = Number(urbanDistanceKm);
  if (isNaN(d) || d <= 0) return 0;
  const minutes = Math.ceil((d / speedKmH) * 60);
  return Math.max(1, minutes);
}

export async function geocodeAddress(query: string): Promise<StoredStoreCoordinate | null> {
  if (!query || typeof query !== 'string') return null;
  const trimmed = query.trim();
  if (trimmed.length < 2) return null;

  const normalizedKey = normalizeStoreKey(trimmed);
  const cachedStores = loadStoredCoordinates();
  if (cachedStores[normalizedKey] && cachedStores[normalizedKey].lat && cachedStores[normalizedKey].lng) {
    return cachedStores[normalizedKey];
  }

  // Bias search toward Corrientes, Argentina if query doesn't already mention a city/country
  const lower = trimmed.toLowerCase();
  const hasExplicitRegion =
    lower.includes('corrientes') ||
    lower.includes('argentina') ||
    lower.includes('resistencia') ||
    lower.includes('buenos aires') ||
    lower.includes(',');

  const candidateQueries = hasExplicitRegion
    ? [trimmed]
    : [`${trimmed}, Corrientes, Argentina`, trimmed];

  for (const q of candidateQueries) {
    try {
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        q
      )}&limit=1&addressdetails=1`;
      const res = await fetch(nominatimUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'ListaDeCompraPRO-React/2.0',
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
          const resolved: StoredStoreCoordinate = {
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
            displayName: data[0].display_name || trimmed,
            address: data[0].display_name || trimmed,
            source: 'nominatim',
          };
          saveStoreCoordinate(trimmed, resolved);
          return resolved;
        }
      }
    } catch (e) {
      console.warn('[Geocode] Nominatim lookup error:', e);
    }
  }

  try {
    const photonQuery = hasExplicitRegion ? trimmed : `${trimmed} Corrientes`;
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(photonQuery)}&lat=${DEFAULT_ORIGIN.lat}&lon=${DEFAULT_ORIGIN.lng}&limit=1`;
    const res = await fetch(photonUrl, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.features && data.features.length > 0) {
        const feat = data.features[0];
        const coords = feat.geometry && feat.geometry.coordinates;
        if (Array.isArray(coords) && coords.length >= 2) {
          const props = feat.properties || {};
          const addrParts = [props.name, props.street, props.city, props.country].filter(Boolean);
          const resolved: StoredStoreCoordinate = {
            lat: parseFloat(coords[1]),
            lng: parseFloat(coords[0]),
            displayName: props.name || trimmed,
            address: addrParts.join(', ') || trimmed,
            source: 'photon',
          };
          saveStoreCoordinate(trimmed, resolved);
          return resolved;
        }
      }
    }
  } catch (e) {
    console.warn('[Geocode] Photon fallback lookup error:', e);
  }

  return null;
}

export function getCurrentGpsLocation(): Promise<RouteOrigin> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return resolve(loadStoredOrigin());
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!position || !position.coords) {
          return resolve(loadStoredOrigin());
        }
        const origin: RouteOrigin = {
          type: 'gps',
          lat: Math.round(position.coords.latitude * 1e6) / 1e6,
          lng: Math.round(position.coords.longitude * 1e6) / 1e6,
          accuracy: position.coords.accuracy || null,
          address: 'Mi Ubicación actual (GPS)',
          updatedAt: Date.now(),
        };
        saveStoredOrigin(origin);
        resolve(origin);
      },
      () => {
        resolve(loadStoredOrigin());
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  });
}

export function generateGoogleMapsUrl(origin: RouteOrigin, stops: RouteStop[]): string {
  if (!stops || stops.length === 0) return '';

  const formatPoint = (pt: { lat: number; lng: number; address?: string }) => {
    if (typeof pt.lat === 'number' && typeof pt.lng === 'number' && isFinite(pt.lat) && isFinite(pt.lng)) {
      return `${pt.lat},${pt.lng}`;
    }
    return pt.address || '';
  };

  const originStr = formatPoint(origin);
  if (!originStr) return '';

  if (stops.length === 1) {
    const destStr = formatPoint(stops[0]);
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originStr)}&destination=${encodeURIComponent(destStr)}&travelmode=driving`;
  }

  const destinationStop = stops[stops.length - 1];
  const destStr = formatPoint(destinationStop);
  const intermediateStops = stops.slice(0, stops.length - 1);
  const cappedWaypoints = intermediateStops.slice(0, MAX_GOOGLE_MAPS_WAYPOINTS);
  const waypointsStr = cappedWaypoints.map(formatPoint).filter(Boolean).join('|');

  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originStr)}&destination=${encodeURIComponent(destStr)}&waypoints=${encodeURIComponent(waypointsStr)}&travelmode=driving`;
}

export function calculateOptimalRoute(
  items: ShoppingItem[],
  customOrigin?: RouteOrigin | null,
  options: {
    includedStores?: string[] | null;
    customStopOrder?: string[] | null;
  } = {}
): RouteCalculationResult {
  const origin = customOrigin || loadStoredOrigin() || { ...DEFAULT_ORIGIN };

  // Include ALL stores from items (both pending and completed items), skipping unassigned "Por averiguar"
  const validItems = (items || []).filter(
    (it) => it && (!isUnassignedStoreName(it.location) || it.completed)
  );

  if (validItems.length === 0) {
    return {
      origin,
      orderedStops: [],
      allStops: [],
      totalDistanceKm: 0,
      totalUrbanDistanceKm: 0,
      estimatedDurationMinutes: 0,
      googleMapsUrl: '',
      isCustomOrder: false,
    };
  }

  const groupsByStore = new Map<string, ShoppingItem[]>();
  const storedCoords = loadStoredCoordinates();

  for (const item of validItems) {
    const rawStore = (item.location && item.location.trim()) || 'General';
    if (isUnassignedStoreName(rawStore)) continue;
    if (!groupsByStore.has(rawStore)) {
      groupsByStore.set(rawStore, []);
    }
    groupsByStore.get(rawStore)!.push(item);
  }

  const candidateStops: RouteStop[] = [];

  for (const [storeName, storeItems] of groupsByStore.entries()) {
    const key = normalizeStoreKey(storeName);
    const coordData = storedCoords[key];

    let lat: number | null = null;
    let lng: number | null = null;
    let address = `${storeName}, Corrientes`;

    if (coordData && typeof coordData.lat === 'number' && typeof coordData.lng === 'number') {
      lat = coordData.lat;
      lng = coordData.lng;
      address = coordData.address || coordData.displayName || storeName;
    } else {
      const itemWithCoords = storeItems.find(
        (it) => it.storeCoords && typeof it.storeCoords.lat === 'number' && typeof it.storeCoords.lng === 'number'
      );
      if (itemWithCoords && itemWithCoords.storeCoords) {
        lat = itemWithCoords.storeCoords.lat;
        lng = itemWithCoords.storeCoords.lng;
      } else {
        // Spread stores in realistic urban radius within Corrientes Capital around the origin
        const hash = Math.abs(
          Array.from(storeName).reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) | 0, 0)
        );
        const offsetLat = ((hash % 100) - 50) * 0.00028;
        const offsetLng = (((hash >> 4) % 100) - 40) * 0.00032;
        lat = origin.lat + offsetLat;
        lng = origin.lng + offsetLng;
      }
    }

    const pendingItems = storeItems.filter((it) => !it.completed);
    const completedItems = storeItems.filter((it) => it.completed);
    const hasPending = pendingItems.length > 0;

    let itemCount = 0;
    let totalCents = 0;

    for (const item of pendingItems) {
      const qty = Number(item.quantity) || 1;
      const price = Number(item.unitPrice) || 0;
      itemCount += qty;
      totalCents += Math.round(qty * Math.round(price * 100));
    }

    candidateStops.push({
      storeName,
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      address,
      pendingItems,
      completedItems,
      hasPending,
      itemCount: Math.round(itemCount * 1000) / 1000,
      estimatedTotal: Math.round(totalCents) / 100,
    });
  }

  // Sort candidateStops so stores with pending items appear before 0-pending stores
  candidateStops.sort((a, b) => {
    if (Boolean(a.hasPending) !== Boolean(b.hasPending)) {
      return a.hasPending ? -1 : 1;
    }
    return a.storeName.localeCompare(b.storeName, 'es');
  });

  let includedSet: Set<string> | null = null;
  if (options && Array.isArray(options.includedStores)) {
    includedSet = new Set(options.includedStores);
  }

  for (const stop of candidateStops) {
    // Include all stores by default (or use explicit trip selection), so both pending and 0-pending stores appear
    stop.isIncluded = includedSet !== null ? includedSet.has(stop.storeName) : true;
  }

  const activeStops = candidateStops.filter((s) => s.isIncluded);
  if (activeStops.length === 0) {
    return {
      origin,
      orderedStops: [],
      allStops: candidateStops,
      totalDistanceKm: 0,
      totalUrbanDistanceKm: 0,
      estimatedDurationMinutes: 0,
      googleMapsUrl: '',
      isCustomOrder: false,
    };
  }

  const manualOrder = options.customStopOrder;
  const orderedStops: RouteStop[] = [];
  let accumulatedHaversineKm = 0;
  let accumulatedUrbanKm = 0;
  let isCustomOrder = false;

  if (Array.isArray(manualOrder) && manualOrder.length > 0) {
    isCustomOrder = true;
    const stopsMap = new Map<string, RouteStop>();
    activeStops.forEach((s) => stopsMap.set(s.storeName, s));

    const sequencedStops: RouteStop[] = [];
    for (const name of manualOrder) {
      if (stopsMap.has(name)) {
        sequencedStops.push(stopsMap.get(name)!);
        stopsMap.delete(name);
      }
    }
    for (const remaining of stopsMap.values()) {
      sequencedStops.push(remaining);
    }

    let currentPoint = { lat: origin.lat, lng: origin.lng };
    for (let i = 0; i < sequencedStops.length; i++) {
      const stop = sequencedStops[i];
      const legHaversine = haversineDistance(currentPoint, stop);
      const legUrban = calculateUrbanDistance(legHaversine);
      const legMinutes = calculateEstimatedMinutes(legUrban);

      stop.stepIndex = i + 1;
      stop.stepDistanceKm = Math.round(legHaversine * 100) / 100;
      stop.stepUrbanDistanceKm = Math.round(legUrban * 100) / 100;
      stop.stepMinutes = legMinutes;

      accumulatedHaversineKm += legHaversine;
      accumulatedUrbanKm += legUrban;

      orderedStops.push(stop);
      currentPoint = { lat: stop.lat, lng: stop.lng };
    }
  } else {
    // Visit stores with pending items first via TSP, then stores with 0 pending items via TSP
    const unvisitedPending = activeStops.filter((s) => s.hasPending);
    const unvisitedZeroPending = activeStops.filter((s) => !s.hasPending);
    let currentPoint = { lat: origin.lat, lng: origin.lng };

    const visitPool = (pool: RouteStop[]) => {
      while (pool.length > 0) {
        let nearestIndex = 0;
        let minDistance = haversineDistance(currentPoint, pool[0]);

        for (let i = 1; i < pool.length; i++) {
          const candidate = pool[i];
          const dist = haversineDistance(currentPoint, candidate);

          if (dist < minDistance - 1e-9) {
            minDistance = dist;
            nearestIndex = i;
          } else if (Math.abs(dist - minDistance) <= 1e-9) {
            if (candidate.storeName.localeCompare(pool[nearestIndex].storeName) < 0) {
              minDistance = dist;
              nearestIndex = i;
            }
          }
        }

        const selectedStop = pool.splice(nearestIndex, 1)[0];
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
    };

    visitPool(unvisitedPending);
    visitPool(unvisitedZeroPending);
  }

  const totalDistanceKm = Math.round(accumulatedHaversineKm * 100) / 100;
  const totalUrbanDistanceKm = Math.round(accumulatedUrbanKm * 100) / 100;
  const estimatedDurationMinutes = calculateEstimatedMinutes(totalUrbanDistanceKm);
  const googleMapsUrl = generateGoogleMapsUrl(origin, orderedStops);

  return {
    origin,
    orderedStops,
    allStops: candidateStops,
    totalDistanceKm,
    totalUrbanDistanceKm,
    estimatedDurationMinutes,
    googleMapsUrl,
    isCustomOrder,
  };
}
