import {
  ShoppingItem,
  FinancialMetrics,
  DetailedAnalytics,
  GroupBreakdownItem,
  RankedProductItem,
  PurchaseReceipt,
  ParetoBreakdownItem,
  TicketDatePoint,
  ProductPriceVariationItem,
  StoreEfficiencyItem,
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

function parseArgentineDateToTimestamp(dateStr?: string, fallbackTs: number = 0): number {
  if (!dateStr || !dateStr.trim()) return fallbackTs;
  const clean = dateStr.trim();
  const parts = clean.split(/[/-]/);
  if (parts.length >= 2) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    let year = parts.length >= 3 ? parseInt(parts[2], 10) : new Date().getFullYear();
    if (year < 100) year += 2000;
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      const dt = new Date(year, month - 1, day);
      if (!isNaN(dt.getTime())) return dt.getTime();
    }
  }
  const parsed = Date.parse(clean);
  return !isNaN(parsed) ? parsed : fallbackTs;
}

function normalizeDateLabel(dateStr?: string): string {
  if (!dateStr || !dateStr.trim()) return 'Sin fecha';
  const clean = dateStr.trim();
  const parts = clean.split(/[/-]/);
  if (parts.length >= 2) {
    const d = String(parseInt(parts[0], 10) || parts[0]).padStart(2, '0');
    const m = String(parseInt(parts[1], 10) || parts[1]).padStart(2, '0');
    const y =
      parts.length >= 3
        ? String(parts[2]).length === 2
          ? `20${parts[2]}`
          : String(parts[2])
        : String(new Date().getFullYear());
    return `${d}/${m}/${y}`;
  }
  return clean;
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
  budget: number = 0,
  receipts: PurchaseReceipt[] = []
): DetailedAnalytics {
  const base = calculateMetrics(items, budget);
  const validItems = Array.isArray(items) ? items.filter(Boolean) : [];
  const validReceipts = Array.isArray(receipts) ? receipts.filter(Boolean) : [];

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
      lastPurchasedDate: item.lastPurchasedDate,
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

  // 1. Curva de Pareto 80-20 (Comercios y Categorías)
  const buildParetoList = (breakdown: GroupBreakdownItem[]): ParetoBreakdownItem[] => {
    const totalSum = breakdown.reduce((acc, g) => acc + g.totalAmount, 0);
    let runningAmount = 0;

    return breakdown.map((g, idx) => {
      const prevCum = totalSum > 0 ? (runningAmount / totalSum) * 100 : 0;
      runningAmount += g.totalAmount;
      const sharePercent =
        totalSum > 0
          ? Math.round((g.totalAmount / totalSum) * 1000) / 10
          : breakdown.length > 0
          ? Math.round((100 / breakdown.length) * 10) / 10
          : 0;
      const cumulativePercent =
        totalSum > 0
          ? Math.min(100, Math.round((runningAmount / totalSum) * 1000) / 10)
          : Math.min(100, Math.round(((idx + 1) / Math.max(1, breakdown.length)) * 1000) / 10);

      let paretoClass: 'A' | 'B' | 'C' = 'C';
      if (cumulativePercent <= 80 || prevCum < 80) {
        paretoClass = 'A';
      } else if (cumulativePercent <= 95 || prevCum < 95) {
        paretoClass = 'B';
      }

      return {
        name: g.name,
        totalAmount: g.totalAmount,
        spentAmount: g.spentAmount,
        pendingAmount: g.pendingAmount,
        productCount: g.productCount,
        sharePercent,
        cumulativePercent,
        paretoClass,
      };
    });
  };

  const paretoStores = buildParetoList(storeBreakdown);
  const paretoCategories = buildParetoList(categoryBreakdown);
  const paretoClassAStoreCount = paretoStores.filter((p) => p.paretoClass === 'A').length;
  const paretoClassACategoryCount = paretoCategories.filter((p) => p.paretoClass === 'A').length;

  // 2. Matriz de Eficiencia por Local
  const storeEfficiencyMatrix: StoreEfficiencyItem[] = storeBreakdown.map((st, idx) => {
    const paretoNode = paretoStores[idx];
    const avgCostPerProduct =
      st.productCount > 0 ? Math.round((st.totalAmount / st.productCount) * 100) / 100 : 0;
    const avgCostPerUnit =
      st.totalUnits > 0 ? Math.round((st.totalAmount / st.totalUnits) * 100) / 100 : 0;
    const completionRate =
      st.productCount > 0
        ? Math.round((st.completedProductCount / st.productCount) * 1000) / 10
        : 0;

    return {
      name: st.name,
      totalAmount: st.totalAmount,
      spentAmount: st.spentAmount,
      pendingAmount: st.pendingAmount,
      productCount: st.productCount,
      completedProductCount: st.completedProductCount,
      pendingProductCount: st.pendingProductCount,
      totalUnits: st.totalUnits,
      avgCostPerProduct,
      avgCostPerUnit,
      shareOfTotalSpend: st.shareOfTotalSpend,
      cumulativeShare: paretoNode ? paretoNode.cumulativePercent : 100,
      paretoClass: paretoNode ? paretoNode.paretoClass : 'C',
      completionRate,
    };
  });

  // 3. Evolución Histórica de Tickets y Compras por Fecha
  const dateMap = new Map<
    string,
    {
      date: string;
      sortTimestamp: number;
      totalCents: number;
      itemCount: number;
      unitCount: number;
      receiptIds: Set<string>;
      stores: Set<string>;
    }
  >();

  // Incorporar tickets escaneados
  const countedReceiptItemKeys = new Set<string>();
  validReceipts.forEach((rcpt) => {
    const dateLabel = normalizeDateLabel(rcpt.date);
    const ts = parseArgentineDateToTimestamp(rcpt.date, rcpt.createdAt || 0);
    if (!dateMap.has(dateLabel)) {
      dateMap.set(dateLabel, {
        date: dateLabel,
        sortTimestamp: ts,
        totalCents: 0,
        itemCount: 0,
        unitCount: 0,
        receiptIds: new Set(),
        stores: new Set(),
      });
    }
    const bucket = dateMap.get(dateLabel)!;
    bucket.receiptIds.add(rcpt.id);
    if (rcpt.storeName) bucket.stores.add(rcpt.storeName);

    const rcptCents = Math.round((Number(rcpt.total) || 0) * 100);
    bucket.totalCents += rcptCents;
    bucket.itemCount += Array.isArray(rcpt.items) ? rcpt.items.length : 0;
    if (Array.isArray(rcpt.items)) {
      rcpt.items.forEach((ri) => {
        bucket.unitCount += Number(ri.quantity) || 1;
        if (ri.matchedItemId) {
          countedReceiptItemKeys.add(`${ri.matchedItemId}_${dateLabel}`);
        }
      });
    }
  });

  // Incorporar productos marcados como comprados con fecha o con historial de compra (que no provengan del mismo ticket ya sumado)
  validItems.forEach((item) => {
    const hist = Array.isArray(item.purchaseHistory) ? item.purchaseHistory : [];
    if (hist.length > 0) {
      hist.forEach((h) => {
        if (h.receiptId && validReceipts.some((r) => r.id === h.receiptId)) {
          return; // Ya contabilizado en el ticket
        }
        const dateLabel = normalizeDateLabel(h.date);
        if (countedReceiptItemKeys.has(`${item.id}_${dateLabel}`)) return;
        countedReceiptItemKeys.add(`${item.id}_${dateLabel}`);

        const ts = parseArgentineDateToTimestamp(h.date, item.updatedAt || item.timestamp || 0);
        if (!dateMap.has(dateLabel)) {
          dateMap.set(dateLabel, {
            date: dateLabel,
            sortTimestamp: ts,
            totalCents: 0,
            itemCount: 0,
            unitCount: 0,
            receiptIds: new Set(),
            stores: new Set(),
          });
        }
        const bucket = dateMap.get(dateLabel)!;
        const price = Math.max(0, Number(h.unitPrice) || Number(item.unitPrice) || 0);
        const qty = Math.max(0, Number(h.quantity) || Number(item.quantity) || 1);
        bucket.totalCents += Math.round(price * 100 * qty);
        bucket.itemCount += 1;
        bucket.unitCount += qty;
        if (h.storeName) bucket.stores.add(h.storeName);
      });
    } else if (item.completed) {
      const rawDate = item.lastPurchasedDate || new Date(item.updatedAt || Date.now()).toLocaleDateString('es-AR');
      const dateLabel = normalizeDateLabel(rawDate);
      if (countedReceiptItemKeys.has(`${item.id}_${dateLabel}`)) return;
      countedReceiptItemKeys.add(`${item.id}_${dateLabel}`);

      const ts = parseArgentineDateToTimestamp(rawDate, item.updatedAt || item.timestamp || 0);
      if (!dateMap.has(dateLabel)) {
        dateMap.set(dateLabel, {
          date: dateLabel,
          sortTimestamp: ts,
          totalCents: 0,
          itemCount: 0,
          unitCount: 0,
          receiptIds: new Set(),
          stores: new Set(),
        });
      }
      const bucket = dateMap.get(dateLabel)!;
      const price = Math.max(0, Number(item.unitPrice) || 0);
      const qty = Math.max(0, Number(item.quantity) || 1);
      bucket.totalCents += Math.round(price * 100 * qty);
      bucket.itemCount += 1;
      bucket.unitCount += qty;
      if (item.location) bucket.stores.add(item.location);
    }
  });

  const ticketHistorySeries: TicketDatePoint[] = Array.from(dateMap.values())
    .sort((a, b) => a.sortTimestamp - b.sortTimestamp)
    .map((entry) => ({
      date: entry.date,
      sortTimestamp: entry.sortTimestamp,
      totalAmount: Math.round(entry.totalCents) / 100,
      itemCount: entry.itemCount,
      unitCount: Math.round(entry.unitCount * 100) / 100,
      receiptCount: Math.max(1, entry.receiptIds.size),
      stores: Array.from(entry.stores),
    }));

  // 4. Variación de Precios / Inflación por Producto
  // Recolecta observaciones de precios por producto desde:
  // a) item.purchaseHistory
  // b) tickets guardados (validReceipts)
  // c) precios del mismo producto en distintos comercios o registros del catálogo
  const productObsMap = new Map<
    string,
    {
      item: ShoppingItem;
      skuCode: string;
      observations: Array<{
        price: number;
        date: string;
        storeName: string;
        timestamp: number;
      }>;
    }
  >();

  const normProductName = (n: string) =>
    String(n || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  validItems.forEach((item, idx) => {
    const key = normProductName(item.name);
    if (!key) return;
    const sku = item.skuCode || formatSkuCode(Number(item.seqNumber) || idx + 1);
    if (!productObsMap.has(key)) {
      productObsMap.set(key, {
        item,
        skuCode: sku,
        observations: [],
      });
    }
    const group = productObsMap.get(key)!;

    // Observaciones desde historial de compras del ítem
    if (Array.isArray(item.purchaseHistory)) {
      item.purchaseHistory.forEach((h, hIdx) => {
        const p = Number(h.unitPrice) || 0;
        if (p > 0) {
          group.observations.push({
            price: p,
            date: normalizeDateLabel(h.date),
            storeName: h.storeName || item.location || 'General',
            timestamp:
              parseArgentineDateToTimestamp(h.date, (item.updatedAt || item.timestamp || 0) - hIdx * 60000),
          });
        }
      });
    }

    // Observación actual del ítem
    const curPrice = Number(item.unitPrice) || 0;
    if (curPrice > 0) {
      const curDate = item.lastPurchasedDate
        ? normalizeDateLabel(item.lastPurchasedDate)
        : 'Actual';
      group.observations.push({
        price: curPrice,
        date: curDate,
        storeName: item.location || 'General',
        timestamp: (item.updatedAt || item.timestamp || Date.now()) + 1000,
      });
    }
  });

  // Agregar observaciones desde tickets escaneados
  validReceipts.forEach((rcpt) => {
    if (!Array.isArray(rcpt.items)) return;
    rcpt.items.forEach((ri) => {
      const p = Number(ri.unitPrice) || 0;
      if (p <= 0) return;
      const key = normProductName(ri.name);
      const group = productObsMap.get(key);
      if (group) {
        group.observations.push({
          price: p,
          date: normalizeDateLabel(rcpt.date),
          storeName: rcpt.storeName || 'General',
          timestamp: parseArgentineDateToTimestamp(rcpt.date, rcpt.createdAt || 0),
        });
      }
    });
  });

  const productPriceVariations: ProductPriceVariationItem[] = [];

  productObsMap.forEach((group) => {
    const validObs = group.observations
      .filter((o) => o.price > 0)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (validObs.length === 0) return;

    // Deduplicar observaciones idénticas consecutivas (mismo precio, misma fecha y comercio)
    const distinctObs: typeof validObs = [];
    validObs.forEach((obs) => {
      const prev = distinctObs[distinctObs.length - 1];
      if (
        !prev ||
        Math.abs(prev.price - obs.price) >= 0.01 ||
        prev.storeName.toLowerCase() !== obs.storeName.toLowerCase() ||
        prev.date !== obs.date
      ) {
        distinctObs.push(obs);
      }
    });

    const latest = distinctObs[distinctObs.length - 1];
    // Buscar observación previa con precio distinto o la primera observación histórica
    const prevWithDiffPrice =
      [...distinctObs]
        .slice(0, -1)
        .reverse()
        .find((o) => Math.abs(o.price - latest.price) >= 0.01) || distinctObs[0];

    const prices = distinctObs.map((o) => o.price);
    const minHistoricalPrice = Math.min(...prices);
    const maxHistoricalPrice = Math.max(...prices);
    const deltaAmount = Math.round((latest.price - prevWithDiffPrice.price) * 100) / 100;
    const deltaPercent =
      prevWithDiffPrice.price > 0
        ? Math.round(((latest.price - prevWithDiffPrice.price) / prevWithDiffPrice.price) * 1000) / 10
        : 0;

    productPriceVariations.push({
      id: group.item.id,
      skuCode: group.skuCode,
      name: group.item.name,
      category: group.item.category || 'General',
      currentStore: latest.storeName,
      currentPrice: latest.price,
      previousPrice: prevWithDiffPrice.price,
      previousDate: prevWithDiffPrice.date,
      previousStore: prevWithDiffPrice.storeName,
      minHistoricalPrice,
      maxHistoricalPrice,
      deltaAmount,
      deltaPercent,
      observationsCount: distinctObs.length,
    });
  });

  // Ordenar variaciones: primero los que tienen variación real != 0 (por mayor % absoluto), luego por mayor precio
  productPriceVariations.sort((a, b) => {
    const hasVarA = Math.abs(a.deltaPercent) > 0 ? 1 : 0;
    const hasVarB = Math.abs(b.deltaPercent) > 0 ? 1 : 0;
    if (hasVarA !== hasVarB) return hasVarB - hasVarA;
    if (Math.abs(b.deltaPercent) !== Math.abs(a.deltaPercent)) {
      return Math.abs(b.deltaPercent) - Math.abs(a.deltaPercent);
    }
    return b.currentPrice - a.currentPrice;
  });

  const itemsWithVariation = productPriceVariations.filter((p) => Math.abs(p.deltaPercent) > 0);
  const avgInflationPercent =
    itemsWithVariation.length > 0
      ? Math.round(
          (itemsWithVariation.reduce((acc, p) => acc + p.deltaPercent, 0) /
            itemsWithVariation.length) *
            10
        ) / 10
      : 0;

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
    paretoStores,
    paretoCategories,
    paretoClassAStoreCount,
    paretoClassACategoryCount,
    storeEfficiencyMatrix,
    ticketHistorySeries,
    productPriceVariations,
    avgInflationPercent,
  };
}
