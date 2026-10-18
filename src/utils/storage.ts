import {
  ShoppingItem,
  StoredStoreCoordinate,
  RouteOrigin,
  TripsData,
  Trip,
  PurchaseReceipt,
} from '../types';

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
  HIDE_EMPTY_STORES: 'shopping_hide_empty_stores',
  RECEIPTS_HISTORY: 'shopping_receipts_history',
};

export const DEFAULT_ORIGIN: RouteOrigin = {
  lat: -27.469213,
  lng: -58.830635,
  address: 'Plaza 25 de Mayo, Corrientes, Argentina',
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

export function formatSkuCode(seqNumber: number): string {
  const clean = Math.max(1, Math.floor(Number(seqNumber) || 1));
  return `#${String(clean).padStart(3, '0')}`;
}

export function parseSeqFromSku(sku?: unknown, seq?: unknown): number | null {
  if (typeof seq === 'number' && !isNaN(seq) && isFinite(seq) && seq >= 1) {
    return Math.floor(seq);
  }
  if (typeof sku === 'string') {
    const match = sku.trim().match(/^#?0*(\d+)$/);
    if (match) {
      const parsed = parseInt(match[1], 10);
      if (!isNaN(parsed) && parsed >= 1) return parsed;
    }
  }
  return null;
}

export function ensureSequentialSkus(items: ShoppingItem[]): ShoppingItem[] {
  if (!Array.isArray(items) || items.length === 0) return [];

  const usedNumbers = new Set<number>();
  let maxSeq = 0;

  // First pass: keep valid non-duplicate seqNumbers
  const result = items.map((item) => ({ ...item }));
  for (const item of result) {
    const existingSeq = parseSeqFromSku(item.skuCode, item.seqNumber);
    if (existingSeq !== null && !usedNumbers.has(existingSeq)) {
      usedNumbers.add(existingSeq);
      item.seqNumber = existingSeq;
      item.skuCode = formatSkuCode(existingSeq);
      if (existingSeq > maxSeq) maxSeq = existingSeq;
    } else {
      item.seqNumber = undefined;
      item.skuCode = undefined;
    }
  }

  // Second pass: assign sequential numbers to items without a valid seqNumber
  // Sort unassigned indices chronologically so older items receive lower numbers (#001, #002...)
  const unassignedIndices: number[] = [];
  result.forEach((it, idx) => {
    if (!it.seqNumber) unassignedIndices.push(idx);
  });

  unassignedIndices.sort((idxA, idxB) => {
    const timeA = Number(result[idxA].timestamp) || 0;
    const timeB = Number(result[idxB].timestamp) || 0;
    if (timeA !== timeB) return timeA - timeB;
    return idxA - idxB;
  });

  let nextCandidate = 1;
  for (const idx of unassignedIndices) {
    while (usedNumbers.has(nextCandidate)) {
      nextCandidate++;
    }
    usedNumbers.add(nextCandidate);
    result[idx].seqNumber = nextCandidate;
    result[idx].skuCode = formatSkuCode(nextCandidate);
    if (nextCandidate > maxSeq) maxSeq = nextCandidate;
    nextCandidate++;
  }

  return result;
}

export function getNextSequentialSku(items: ShoppingItem[]): { seqNumber: number; skuCode: string } {
  let maxSeq = 0;
  for (const item of items) {
    const seq = parseSeqFromSku(item.skuCode, item.seqNumber);
    if (seq !== null && seq > maxSeq) {
      maxSeq = seq;
    }
  }
  const nextSeq = Math.max(maxSeq + 1, items.length + 1);
  return {
    seqNumber: nextSeq,
    skuCode: formatSkuCode(nextSeq),
  };
}

export function sanitizeShoppingItem(raw: unknown, index = 0): ShoppingItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const rawName = obj.name ?? obj.text ?? obj.title ?? '';
  const name = String(rawName).trim();
  if (!name) return null;

  const rawQty = typeof obj.quantity === 'string' ? obj.quantity.replace(',', '.') : obj.quantity;
  const parsedQty = Number(rawQty);
  const quantity = !isNaN(parsedQty) && isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1;

  const rawPrice =
    typeof obj.unitPrice === 'string'
      ? obj.unitPrice.replace(',', '.')
      : obj.unitPrice ?? obj.price ?? 0;
  const parsedPrice = Number(rawPrice);
  const unitPrice = !isNaN(parsedPrice) && isFinite(parsedPrice) && parsedPrice >= 0 ? parsedPrice : 0;

  const location = String(obj.location ?? obj.store ?? 'General').trim() || 'General';
  const category = String(obj.category ?? 'General').trim() || 'General';
  const completed = Boolean(obj.completed ?? obj.bought ?? false);

  const id =
    obj.id !== undefined && obj.id !== null && String(obj.id).trim() !== ''
      ? String(obj.id)
      : `item_${Date.now()}_${index}`;

  const parsedSeq = parseSeqFromSku(obj.skuCode, obj.seqNumber);

  const timestamp = Number(obj.timestamp) || Date.now();
  const updatedAt = Number(obj.updatedAt) || timestamp;
  const lastPurchasedDate =
    typeof obj.lastPurchasedDate === 'string' && obj.lastPurchasedDate.trim()
      ? obj.lastPurchasedDate.trim()
      : undefined;
  const receiptId =
    typeof obj.receiptId === 'string' && obj.receiptId.trim() ? obj.receiptId.trim() : undefined;
  const purchaseHistory = Array.isArray(obj.purchaseHistory) ? obj.purchaseHistory : undefined;

  let storeCoords: { lat: number; lng: number } | undefined = undefined;
  if (obj.storeCoords && typeof obj.storeCoords === 'object') {
    const sc = obj.storeCoords as Record<string, unknown>;
    const lat = Number(sc.lat);
    const lng = Number(sc.lng);
    if (!isNaN(lat) && !isNaN(lng) && isFinite(lat) && isFinite(lng)) {
      storeCoords = { lat, lng };
    }
  }

  return {
    id,
    ...(parsedSeq !== null ? { seqNumber: parsedSeq, skuCode: formatSkuCode(parsedSeq) } : {}),
    name,
    quantity,
    unitPrice,
    location,
    category,
    completed,
    timestamp,
    updatedAt,
    ...(lastPurchasedDate ? { lastPurchasedDate } : {}),
    ...(receiptId ? { receiptId } : {}),
    ...(purchaseHistory ? { purchaseHistory } : {}),
    ...(storeCoords ? { storeCoords } : {}),
  };
}

export function loadStoredItems(): ShoppingItem[] {
  const raw = safeGet(STORAGE_KEYS.ITEMS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const sanitized: ShoppingItem[] = [];
    const seenIds = new Set<string>();

    parsed.forEach((entry, idx) => {
      const item = sanitizeShoppingItem(entry, idx);
      if (item) {
        if (seenIds.has(item.id)) {
          item.id = `${item.id}_${idx}`;
        }
        seenIds.add(item.id);
        sanitized.push(item);
      }
    });

    const withSkus = ensureSequentialSkus(sanitized);
    return withSkus;
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

export function loadStoredHideEmptyStores(): boolean {
  const raw = safeGet(STORAGE_KEYS.HIDE_EMPTY_STORES);
  return raw === 'true';
}

export function saveStoredHideEmptyStores(hide: boolean): void {
  safeSet(STORAGE_KEYS.HIDE_EMPTY_STORES, String(hide));
}

export function loadStoredLocationOrder(): string[] {
  const raw = safeGet(STORAGE_KEYS.LOCATION_ORDER);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean).map((s) => String(s).trim()) : [];
  } catch {
    return [];
  }
}

export function saveStoredLocationOrder(order: string[]): void {
  safeSet(STORAGE_KEYS.LOCATION_ORDER, JSON.stringify(order.map((s) => String(s).trim())));
}

export function loadStoredCollapsedGroups(): string[] {
  const raw = safeGet(STORAGE_KEYS.COLLAPSED_GROUPS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(Boolean).map((s) => String(s).trim());
    }
    if (parsed && typeof parsed === 'object') {
      return Object.keys(parsed)
        .filter((k) => Boolean((parsed as Record<string, unknown>)[k]))
        .map((k) => k.trim());
    }
    return [];
  } catch {
    return [];
  }
}

export function saveStoredCollapsedGroups(groups: string[]): void {
  safeSet(STORAGE_KEYS.COLLAPSED_GROUPS, JSON.stringify(groups.map((s) => String(s).trim())));
}

export function normalizeStoreKey(storeName: string): string {
  if (!storeName) return '';
  return String(storeName)
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
    const lat = Number(parsed?.lat);
    const lng = Number(parsed?.lng);
    if (
      parsed &&
      !isNaN(lat) &&
      !isNaN(lng) &&
      isFinite(lat) &&
      isFinite(lng)
    ) {
      // Auto-migrate legacy Madrid default origin to Corrientes, Argentina
      const isLegacyMadrid =
        parsed.type === 'default' ||
        (Math.abs(lat - 40.416775) < 0.01 && Math.abs(lng - -3.70379) < 0.01) ||
        (typeof parsed.address === 'string' && parsed.address.includes('Puerta del Sol, Madrid'));

      if (isLegacyMadrid) {
        saveStoredOrigin(DEFAULT_ORIGIN);
        return { ...DEFAULT_ORIGIN };
      }

      return {
        lat,
        lng,
        address: String(parsed.address || 'Punto de partida'),
        type: parsed.type === 'gps' || parsed.type === 'manual' ? parsed.type : 'manual',
        accuracy: typeof parsed.accuracy === 'number' ? parsed.accuracy : null,
        updatedAt: Number(parsed.updatedAt) || Date.now(),
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
      const cleanTrips: Trip[] = parsed.trips
        .filter((t: unknown) => t && typeof t === 'object')
        .map((t: Record<string, unknown>, idx: number) => ({
          id: String(t.id || `trip_${idx + 1}`),
          name: String(t.name || `Viaje ${idx + 1}`),
          includedStores: Array.isArray(t.includedStores)
            ? t.includedStores.map((s) => String(s))
            : null,
          customOrder: Array.isArray(t.customOrder)
            ? t.customOrder.map((s) => String(s))
            : null,
        }));

      if (cleanTrips.length === 0) {
        return {
          activeTripId: DEFAULT_TRIP.id,
          trips: [{ ...DEFAULT_TRIP }],
        };
      }

      const activeTripId =
        parsed.activeTripId && cleanTrips.some((t) => t.id === String(parsed.activeTripId))
          ? String(parsed.activeTripId)
          : cleanTrips[0].id;

      return {
        activeTripId,
        trips: cleanTrips,
      };
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

export function loadStoredReceipts(): PurchaseReceipt[] {
  const raw = safeGet(STORAGE_KEYS.RECEIPTS_HISTORY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r) => r && typeof r === 'object' && r.id && Array.isArray(r.items));
  } catch {
    return [];
  }
}

export function saveStoredReceipts(receipts: PurchaseReceipt[]): void {
  safeSet(STORAGE_KEYS.RECEIPTS_HISTORY, JSON.stringify(receipts));
}

