export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  location: string;
  category: string;
  completed: boolean;
  timestamp: number;
  updatedAt: number;
  storeCoords?: {
    lat: number;
    lng: number;
  };
}

export interface StoredStoreCoordinate {
  lat: number;
  lng: number;
  displayName?: string;
  address?: string;
  source?: string;
  updatedAt?: number;
}

export interface RouteOrigin {
  lat: number;
  lng: number;
  address: string;
  type: 'default' | 'manual' | 'gps';
  accuracy: number | null;
  updatedAt?: number;
}

export interface Trip {
  id: string;
  name: string;
  includedStores: string[] | null;
  customOrder: string[] | null;
}

export interface TripsData {
  activeTripId: string;
  trips: Trip[];
}

export interface RouteStop {
  storeName: string;
  lat: number;
  lng: number;
  address: string;
  pendingItems: ShoppingItem[];
  itemCount: number;
  estimatedTotal: number;
  stepIndex?: number;
  stepDistanceKm?: number;
  stepUrbanDistanceKm?: number;
  stepMinutes?: number;
  isIncluded?: boolean;
}

export interface RouteCalculationResult {
  origin: RouteOrigin;
  orderedStops: RouteStop[];
  allStops: RouteStop[];
  totalDistanceKm: number;
  totalUrbanDistanceKm: number;
  estimatedDurationMinutes: number;
  googleMapsUrl: string;
  isCustomOrder: boolean;
}

export interface FinancialMetrics {
  totalPending: number;
  totalSpent: number;
  totalOverall: number;
  budget: number;
  budgetRemaining: number;
  budgetPercentage: number;
}

export type UndoAction =
  | { type: 'ADD_ITEM'; timestamp: number; payload: { id: string }; description: string }
  | { type: 'DELETE_ITEM'; timestamp: number; payload: { item: ShoppingItem; index: number }; description: string }
  | { type: 'UPDATE_ITEM'; timestamp: number; payload: { previousItem: ShoppingItem }; description: string }
  | { type: 'TOGGLE_COMPLETED'; timestamp: number; payload: { id: string; previousCompleted: boolean }; description: string }
  | { type: 'CLEAR_COMPLETED'; timestamp: number; payload: { items: ShoppingItem[] }; description: string };
