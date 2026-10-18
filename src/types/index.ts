export interface PurchaseHistoryEntry {
  date: string;
  storeName: string;
  unitPrice: number;
  quantity: number;
  receiptId?: string;
  rawTicketName?: string;
}

export interface ShoppingItem {
  id: string;
  seqNumber?: number;
  skuCode?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  location: string;
  category: string;
  completed: boolean;
  timestamp: number;
  updatedAt: number;
  lastPurchasedDate?: string;
  receiptId?: string;
  purchaseHistory?: PurchaseHistoryEntry[];
  storeCoords?: {
    lat: number;
    lng: number;
  };
}

export interface ReceiptLineItem {
  id: string;
  name: string;
  rawTicketName?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  category: string;
  matchedItemId?: string;
  matchedSkuCode?: string;
  included: boolean;
}

export interface PurchaseReceipt {
  id: string;
  storeName: string;
  storeAddress?: string;
  date: string;
  receiptNumber?: string;
  items: Array<{
    name: string;
    rawTicketName?: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    category: string;
    skuCode?: string;
    matchedItemId?: string;
  }>;
  total: number;
  imagePreview?: string;
  createdAt: number;
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
  completedItems?: ShoppingItem[];
  hasPending?: boolean;
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

export interface GroupBreakdownItem {
  name: string;
  spentAmount: number;
  pendingAmount: number;
  totalAmount: number;
  spentUnits: number;
  pendingUnits: number;
  totalUnits: number;
  productCount: number;
  completedProductCount: number;
  pendingProductCount: number;
  shareOfTotalSpend: number;
}

export interface RankedProductItem {
  id: string;
  skuCode: string;
  seqNumber: number;
  name: string;
  location: string;
  category: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  completed: boolean;
  lastPurchasedDate?: string;
  shareOfTotal: number;
}

export interface DetailedAnalytics extends FinancialMetrics {
  spentPercentageOfBudget: number;
  pendingPercentageOfBudget: number;
  spentShareOfTotal: number;
  totalProducts: number;
  completedProducts: number;
  pendingProducts: number;
  unassignedProducts: number;
  completionRateProducts: number;
  totalUnits: number;
  completedUnits: number;
  pendingUnits: number;
  completionRateUnits: number;
  pricedProductsCount: number;
  unpricedProductsCount: number;
  averageCostPerProduct: number;
  averageCostPerUnit: number;
  storeBreakdown: GroupBreakdownItem[];
  categoryBreakdown: GroupBreakdownItem[];
  topProducts: RankedProductItem[];
}

export type UndoAction =
  | { type: 'ADD_ITEM'; timestamp: number; payload: { id: string }; description: string }
  | { type: 'DELETE_ITEM'; timestamp: number; payload: { item: ShoppingItem; index: number }; description: string }
  | { type: 'UPDATE_ITEM'; timestamp: number; payload: { previousItem: ShoppingItem }; description: string }
  | {
      type: 'TOGGLE_COMPLETED';
      timestamp: number;
      payload: { id: string; previousCompleted: boolean; previousDate?: string };
      description: string;
    }
  | { type: 'RESET_ITEMS'; timestamp: number; payload: { previousItems: ShoppingItem[] }; description: string }
  | { type: 'CLEAR_COMPLETED'; timestamp: number; payload: { items: ShoppingItem[] }; description: string };
