import {
  ShoppingItem,
  FinancialMetrics,
  DetailedAnalytics,
  GroupBreakdownItem,
  RankedProductItem,
} from '../types';
import { formatSkuCode } from './storage';

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

function isPendingLoc(locName?: string): boolean {
  if (!locName) return true;
  return PENDING_LOCATION_NAMES.includes(locName.trim().toLowerCase());
}

export function calculateMetrics(items: ShoppingItem[] = [], budget: number = 0): FinancialMetrics {
  let centsPending = 0;
  let centsSpent = 0;

  if (Array.isArray(items)) {
    for (const item of items) {
      if (!item) continue;
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unitPrice) || 0;

      if (qty <= 0 || price < 0) continue;

      const itemCents = Math.round(price * 100) * qty;

      if (item.completed) {
        centsSpent += itemCents;
      } else {
        centsPending += itemCents;
      }
    }
  }

  const totalPending = Math.round(centsPending) / 100;
  const totalSpent = Math.round(centsSpent) / 100;
  const totalOverall = Math.round(centsPending + centsSpent) / 100;

  const numBudget = Math.max(0, Number(budget) || 0);
  const budgetCents = Math.round(numBudget * 100);

  let budgetRemaining = 0;
  let budgetPercentage = 0;

  if (budgetCents > 0) {
    budgetRemaining = Math.round(budgetCents - (centsPending + centsSpent)) / 100;
    budgetPercentage = Math.min(100, Math.round(((centsPending + centsSpent) / budgetCents) * 100));
  }

  return {
    totalPending,
    totalSpent,
    totalOverall,
    budget: numBudget,
    budgetRemaining,
    budgetPercentage,
  };
}

export function getCategoryBreakdown(items: ShoppingItem[] = []): Record<string, Record<string, number>> {
  const breakdown: Record<string, Record<string, number>> = {};
  if (!Array.isArray(items)) return breakdown;

  for (const item of items) {
    if (!item || item.completed) continue;

    const loc = String(item.location || 'General').trim() || 'General';
    const cat = String(item.category || 'General').trim() || 'General';
    const qty = Number(item.quantity) || 0;

    if (qty <= 0) continue;

    if (!breakdown[loc]) {
      breakdown[loc] = {};
    }

    const current = breakdown[loc][cat] || 0;
    breakdown[loc][cat] = Math.round((current + qty) * 1000) / 1000;
  }

  return breakdown;
}

export function calculateDetailedAnalytics(
  items: ShoppingItem[] = [],
  budget: number = 0
): DetailedAnalytics {
  const base = calculateMetrics(items, budget);
  const validItems = Array.isArray(items) ? items.filter(Boolean) : [];

  let completedProducts = 0;
  let pendingProducts = 0;
  let unassignedProducts = 0;
  let pricedProductsCount = 0;
  let unpricedProductsCount = 0;

  let totalUnits = 0;
  let completedUnits = 0;
  let pendingUnits = 0;

  const storeMap: Record<
    string,
    {
      name: string;
      spentCents: number;
      pendingCents: number;
      spentUnits: number;
      pendingUnits: number;
      productCount: number;
      completedProductCount: number;
      pendingProductCount: number;
    }
  > = {};

  const catMap: Record<
    string,
    {
      name: string;
      spentCents: number;
      pendingCents: number;
      spentUnits: number;
      pendingUnits: number;
      productCount: number;
      completedProductCount: number;
      pendingProductCount: number;
    }
  > = {};

  const rankedItems: RankedProductItem[] = [];

  validItems.forEach((item, index) => {
    const qty = Math.max(0, Number(item.quantity) || 1);
    const price = Math.max(0, Number(item.unitPrice) || 0);
    const lineCents = Math.round(price * 100 * qty);
    const lineTotal = Math.round(lineCents) / 100;

    const loc = String(item.location || 'General').trim() || 'General';
    const cat = String(item.category || 'General').trim() || 'General';
    const seqNumber = Number(item.seqNumber) || index + 1;
    const skuCode = item.skuCode || formatSkuCode(seqNumber);

    if (item.completed) {
      completedProducts++;
      completedUnits += qty;
    } else {
      pendingProducts++;
      pendingUnits += qty;
      if (isPendingLoc(loc)) {
        unassignedProducts++;
      }
    }

    if (price > 0) {
      pricedProductsCount++;
    } else {
      unpricedProductsCount++;
    }

    totalUnits += qty;

    // Aggregate by store
    if (!storeMap[loc]) {
      storeMap[loc] = {
        name: loc,
        spentCents: 0,
        pendingCents: 0,
        spentUnits: 0,
        pendingUnits: 0,
        productCount: 0,
        completedProductCount: 0,
        pendingProductCount: 0,
      };
    }
    storeMap[loc].productCount++;
    if (item.completed) {
      storeMap[loc].spentCents += lineCents;
      storeMap[loc].spentUnits += qty;
      storeMap[loc].completedProductCount++;
    } else {
      storeMap[loc].pendingCents += lineCents;
      storeMap[loc].pendingUnits += qty;
      storeMap[loc].pendingProductCount++;
    }

    // Aggregate by category
    if (!catMap[cat]) {
      catMap[cat] = {
        name: cat,
        spentCents: 0,
        pendingCents: 0,
        spentUnits: 0,
        pendingUnits: 0,
        productCount: 0,
        completedProductCount: 0,
        pendingProductCount: 0,
      };
    }
    catMap[cat].productCount++;
    if (item.completed) {
      catMap[cat].spentCents += lineCents;
      catMap[cat].spentUnits += qty;
      catMap[cat].completedProductCount++;
    } else {
      catMap[cat].pendingCents += lineCents;
      catMap[cat].pendingUnits += qty;
      catMap[cat].pendingProductCount++;
    }

    rankedItems.push({
      id: item.id,
      skuCode,
      seqNumber,
      name: item.name,
      location: loc,
      category: cat,
      quantity: Math.round(qty * 1000) / 1000,
      unitPrice: price,
      lineTotal,
      completed: Boolean(item.completed),
      shareOfTotal:
        base.totalOverall > 0 ? Math.round((lineTotal / base.totalOverall) * 1000) / 10 : 0,
    });
  });

  const totalProducts = validItems.length;
  const completionRateProducts =
    totalProducts > 0 ? Math.round((completedProducts / totalProducts) * 1000) / 10 : 0;
  const completionRateUnits =
    totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 1000) / 10 : 0;

  const averageCostPerProduct =
    pricedProductsCount > 0
      ? Math.round((base.totalOverall / pricedProductsCount) * 100) / 100
      : 0;
  const averageCostPerUnit =
    totalUnits > 0 ? Math.round((base.totalOverall / totalUnits) * 100) / 100 : 0;

  const spentPercentageOfBudget =
    base.budget > 0 ? Math.min(100, Math.round((base.totalSpent / base.budget) * 1000) / 10) : 0;
  const pendingPercentageOfBudget =
    base.budget > 0 ? Math.min(100, Math.round((base.totalPending / base.budget) * 1000) / 10) : 0;
  const spentShareOfTotal =
    base.totalOverall > 0 ? Math.round((base.totalSpent / base.totalOverall) * 1000) / 10 : 0;

  const formatBreakdownList = (
    rawRecord: typeof storeMap
  ): GroupBreakdownItem[] => {
    return Object.values(rawRecord)
      .map((entry) => {
        const spentAmount = Math.round(entry.spentCents) / 100;
        const pendingAmount = Math.round(entry.pendingCents) / 100;
        const totalAmount = Math.round(entry.spentCents + entry.pendingCents) / 100;
        const spentUnits = Math.round(entry.spentUnits * 1000) / 1000;
        const pendingUnits = Math.round(entry.pendingUnits * 1000) / 1000;
        const totalU = Math.round((entry.spentUnits + entry.pendingUnits) * 1000) / 1000;
        return {
          name: entry.name,
          spentAmount,
          pendingAmount,
          totalAmount,
          spentUnits,
          pendingUnits,
          totalUnits: totalU,
          productCount: entry.productCount,
          completedProductCount: entry.completedProductCount,
          pendingProductCount: entry.pendingProductCount,
          shareOfTotalSpend:
            base.totalOverall > 0 ? Math.round((totalAmount / base.totalOverall) * 1000) / 10 : 0,
        };
      })
      .sort((a, b) => {
        if (b.totalAmount !== a.totalAmount) return b.totalAmount - a.totalAmount;
        if (b.productCount !== a.productCount) return b.productCount - a.productCount;
        return a.name.localeCompare(b.name, 'es');
      });
  };

  const storeBreakdown = formatBreakdownList(storeMap);
  const categoryBreakdown = formatBreakdownList(catMap);

  const topProducts = [...rankedItems].sort((a, b) => {
    if (b.lineTotal !== a.lineTotal) return b.lineTotal - a.lineTotal;
    if (b.quantity !== a.quantity) return b.quantity - a.quantity;
    return a.seqNumber - b.seqNumber;
  });

  return {
    ...base,
    spentPercentageOfBudget,
    pendingPercentageOfBudget,
    spentShareOfTotal,
    totalProducts,
    completedProducts,
    pendingProducts,
    unassignedProducts,
    completionRateProducts,
    totalUnits: Math.round(totalUnits * 1000) / 1000,
    completedUnits: Math.round(completedUnits * 1000) / 1000,
    pendingUnits: Math.round(pendingUnits * 1000) / 1000,
    completionRateUnits,
    pricedProductsCount,
    unpricedProductsCount,
    averageCostPerProduct,
    averageCostPerUnit,
    storeBreakdown,
    categoryBreakdown,
    topProducts,
  };
}
