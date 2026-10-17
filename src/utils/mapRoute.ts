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

  // 1. Check local cache
  const normalizedKey = normalizeStoreKey(trimmed);
  const cachedStores = loadStoredCoordinates();
  if (cachedStores[normalizedKey] && cachedStores[normalizedKey].lat && cachedStores[normalizedKey].lng) {
    return cachedStores[normalizedKey];
  }

  // 2. Fetch Nominatim
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&limit=1&addressdetails=1`;
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

  // 3. Fallback Photon
  try {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}&limit=1`;
    const res = await fetch(photonUrl, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.features && data.features.length > 0) {
        const feat = data.features[0];
        const coords = feat.geometry && feat.geometry.coordinates; // [lon, lat]
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

  const pendingItems = (items || []).filter((it) => it && !it.completed);
  if (pendingItems.length === 0) {
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

  for (const item of pendingItems) {
    const rawStore = (item.location && item.location.trim()) || 'General';
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
    let address = storeName;

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
        // Deterministic offset relative to origin so pins don't overlap completely
        const hash = Math.abs(Array.from(storeName).reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) | 0, 0));
        const offsetLat = ((hash % 100) - 50) * 0.0003;
        const offsetLng = (((hash >> 4) % 100) - 50) * 0.0003;
        lat = origin.lat + offsetLat;
        lng = origin.lng + offsetLng;
      }
    }

    let itemCount = 0;
    let totalCents = 0;

    for (const item of storeItems) {
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
      pendingItems: storeItems,
      itemCount: Math.round(itemCount * 1000) / 1000,
      estimatedTotal: Math.round(totalCents) / 100,
    });
  }

  // Filter included / excluded stops
  let includedSet: Set<string> | null = null;
  if (options && Array.isArray(options.includedStores)) {
    includedSet = new Set(options.includedStores);
  }

  for (const stop of candidateStops) {
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
    // TSP Nearest Neighbor
    const unvisited = [...activeStops];
    let currentPoint = { lat: origin.lat, lng: origin.lng };

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
