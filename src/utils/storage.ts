import { ShoppingItem, StoredStoreCoordinate, RouteOrigin, TripsData, Trip } from '../types';

const STORAGE_KEYS = {
  ITEMS: 'shopping_items',
  BUDGET: 'budget',
  THEME: 'theme',
  VIEW_LAYOUT: 'shopping_view_layout',
  STORE_COORDS: 'shopping_store_coords',
  ROUTE_ORIGIN: 'shopping_route_origin',
  TRIPS_DATA: 'shopping_trips_data',
  LOCATION_ORDER: 'locationOrder',
  COLLAPSED_GROUPS: 'collapsedGroups',
};

export const DEFAULT_ORIGIN: RouteOrigin = {
  lat: 40.416775,
  lng: -3.703790,
  address: 'Puerta del Sol, Madrid (Referencia)',
  type: 'default',
  accuracy: null,
};

export const DEFAULT_TRIP: Trip = {
  id: 'trip_1',
  name: 'Viaje 1',
  includedStores: null,
  customOrder: null,
};

function safeGet(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch (e) {
    console.warn(`[Storage] Failed to read ${key}:`, e);
  }
  return null;
}

function safeSet(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch (e) {
    console.warn(`[Storage] Failed to save ${key}:`, e);
  }
}

export function loadStoredItems(): ShoppingItem[] {
  const raw = safeGet(STORAGE_KEYS.ITEMS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStoredItems(items: ShoppingItem[]): void {
  safeSet(STORAGE_KEYS.ITEMS, JSON.stringify(items));
}

export function loadStoredBudget(): number {
  const raw = safeGet(STORAGE_KEYS.BUDGET);
  if (!raw) return 0;
  const num = parseFloat(raw);
  return !isNaN(num) && isFinite(num) && num >= 0 ? num : 0;
}

export function saveStoredBudget(budget: number): void {
  safeSet(STORAGE_KEYS.BUDGET, String(budget));
}

export function loadStoredTheme(): 'light' | 'dark' {
  const raw = safeGet(STORAGE_KEYS.THEME);
  if (raw === 'light' || raw === 'dark') return raw;
  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function saveStoredTheme(theme: 'light' | 'dark'): void {
  safeSet(STORAGE_KEYS.THEME, theme);
}

export function loadStoredLayout(): 'list' | 'grid' {
  const raw = safeGet(STORAGE_KEYS.VIEW_LAYOUT);
  return raw === 'grid' ? 'grid' : 'list';
}

export function saveStoredLayout(layout: 'list' | 'grid'): void {
  safeSet(STORAGE_KEYS.VIEW_LAYOUT, layout);
}

export function loadStoredLocationOrder(): string[] {
  const raw = safeGet(STORAGE_KEYS.LOCATION_ORDER);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStoredLocationOrder(order: string[]): void {
  safeSet(STORAGE_KEYS.LOCATION_ORDER, JSON.stringify(order));
}

export function loadStoredCollapsedGroups(): string[] {
  const raw = safeGet(STORAGE_KEYS.COLLAPSED_GROUPS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStoredCollapsedGroups(groups: string[]): void {
  safeSet(STORAGE_KEYS.COLLAPSED_GROUPS, JSON.stringify(groups));
}

export function normalizeStoreKey(storeName: string): string {
  if (!storeName) return '';
  return storeName
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function loadStoredCoordinates(): Record<string, StoredStoreCoordinate> {
  const raw = safeGet(STORAGE_KEYS.STORE_COORDS);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (parsed.stores && typeof parsed.stores === 'object') {
        return parsed.stores;
      }
      return parsed;
    }
  } catch {}
  return {};
}

export function saveStoreCoordinate(storeName: string, coord: StoredStoreCoordinate): void {
  const key = normalizeStoreKey(storeName);
  if (!key) return;
  const current = loadStoredCoordinates();
  current[key] = {
    ...coord,
    updatedAt: Date.now(),
  };
  safeSet(
    STORAGE_KEYS.STORE_COORDS,
    JSON.stringify({
      version: 1,
      updatedAt: Date.now(),
      stores: current,
    })
  );
}

export function removeStoreCoordinate(storeName: string): void {
  const key = normalizeStoreKey(storeName);
  if (!key) return;
  const current = loadStoredCoordinates();
  if (current[key]) {
    delete current[key];
    safeSet(
      STORAGE_KEYS.STORE_COORDS,
      JSON.stringify({
        version: 1,
        updatedAt: Date.now(),
        stores: current,
      })
    );
  }
}

export function loadStoredOrigin(): RouteOrigin {
  const raw = safeGet(STORAGE_KEYS.ROUTE_ORIGIN);
  if (!raw) return { ...DEFAULT_ORIGIN };
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.lat === 'number' &&
      typeof parsed.lng === 'number' &&
      isFinite(parsed.lat) &&
      isFinite(parsed.lng)
    ) {
      return {
        lat: parsed.lat,
        lng: parsed.lng,
        address: parsed.address || 'Punto de partida',
        type: parsed.type || 'manual',
        accuracy: parsed.accuracy || null,
        updatedAt: parsed.updatedAt || Date.now(),
      };
    }
  } catch {}
  return { ...DEFAULT_ORIGIN };
}

export function saveStoredOrigin(origin: RouteOrigin): void {
  safeSet(STORAGE_KEYS.ROUTE_ORIGIN, JSON.stringify(origin));
}

export function loadStoredTripsData(): TripsData {
  const raw = safeGet(STORAGE_KEYS.TRIPS_DATA);
  if (!raw) {
    return {
      activeTripId: DEFAULT_TRIP.id,
      trips: [{ ...DEFAULT_TRIP }],
    };
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.trips) && parsed.trips.length > 0) {
      if (!parsed.activeTripId || !parsed.trips.some((t: Trip) => t.id === parsed.activeTripId)) {
        parsed.activeTripId = parsed.trips[0].id;
      }
      return parsed;
    }
  } catch {}
  return {
    activeTripId: DEFAULT_TRIP.id,
    trips: [{ ...DEFAULT_TRIP }],
  };
}

export function saveStoredTripsData(data: TripsData): void {
  safeSet(STORAGE_KEYS.TRIPS_DATA, JSON.stringify(data));
}
