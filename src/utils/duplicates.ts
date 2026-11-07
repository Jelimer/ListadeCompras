import { ShoppingItem, PurchaseHistoryEntry } from '../types';

export interface DuplicateGroup {
  id: string;
  representativeName: string;
  items: ShoppingItem[];
  reason: 'exact_name' | 'similar_name' | 'duplicate_sku';
  reasonLabel: string;
}

/**
 * Normaliza una cadena de texto para comparación libre de acentos, mayúsculas y caracteres especiales.
 */
export function normalizeProductName(name: string): string {
  if (!name) return '';
  return String(name)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Detecta grupos de productos duplicados o con alta similitud en el catálogo.
 */
export function detectDuplicateGroups(items: ShoppingItem[]): DuplicateGroup[] {
  if (!items || items.length < 2) return [];

  const groups: DuplicateGroup[] = [];
  const processedIds = new Set<string>();

  // 1. Agrupamiento por nombre normalizado exacto
  const exactNameMap = new Map<string, ShoppingItem[]>();
  for (const item of items) {
    const key = normalizeProductName(item.name);
    if (!key) continue;
    const existing = exactNameMap.get(key) || [];
    existing.push(item);
    exactNameMap.set(key, existing);
  }

  for (const [key, groupItems] of exactNameMap.entries()) {
    if (groupItems.length > 1) {
      groupItems.forEach((it) => processedIds.add(it.id));
      groups.push({
        id: `exact_${key}`,
        representativeName: groupItems[0].name,
        items: groupItems,
        reason: 'exact_name',
        reasonLabel: 'Nombre idéntico (duplicado directo)',
      });
    }
  }

  // 2. Agrupamiento por SKU duplicado con diferente ID
  const skuMap = new Map<string, ShoppingItem[]>();
  for (const item of items) {
    const sku = (item.skuCode || '').trim().toLowerCase();
    if (!sku) continue;
    const existing = skuMap.get(sku) || [];
    existing.push(item);
    skuMap.set(sku, existing);
  }

  for (const [sku, groupItems] of skuMap.entries()) {
    if (groupItems.length > 1) {
      // Solo agregar si no están ya todos en el mismo grupo exacto
      const unhandled = groupItems.filter((it) => !processedIds.has(it.id));
      if (unhandled.length > 0 || groupItems.some((it) => !processedIds.has(it.id))) {
        groupItems.forEach((it) => processedIds.add(it.id));
        groups.push({
          id: `sku_${sku}`,
          representativeName: groupItems[0].name,
          items: groupItems,
          reason: 'duplicate_sku',
          reasonLabel: `Código SKU compartido (${sku.toUpperCase()})`,
        });
      }
    }
  }

  // 3. Agrupamiento por alta similitud (ej: "Leche" y "Leche descremada", o distancia de edición mínima)
  const remaining = items.filter((it) => !processedIds.has(it.id));
  const similarHandled = new Set<string>();

  for (let i = 0; i < remaining.length; i++) {
    const itemA = remaining[i];
    if (similarHandled.has(itemA.id)) continue;

    const normA = normalizeProductName(itemA.name);
    if (normA.length < 4) continue;

    const similarItems: ShoppingItem[] = [itemA];

    for (let j = i + 1; j < remaining.length; j++) {
      const itemB = remaining[j];
      if (similarHandled.has(itemB.id)) continue;

      const normB = normalizeProductName(itemB.name);
      if (normB.length < 4) continue;

      // Coincidencia por prefijo amplio (ej: "carne picada especial" vs "carne picada")
      const wordsA = normA.split(' ');
      const wordsB = normB.split(' ');
      const firstWordA = wordsA[0];
      const firstWordB = wordsB[0];

      const isSub = (normA.includes(normB) || normB.includes(normA)) && firstWordA === firstWordB;
      if (isSub) {
        similarItems.push(itemB);
        similarHandled.add(itemB.id);
      }
    }

    if (similarItems.length > 1) {
      similarHandled.add(itemA.id);
      groups.push({
        id: `sim_${itemA.id}`,
        representativeName: itemA.name,
        items: similarItems,
        reason: 'similar_name',
        reasonLabel: 'Nombres similares / variaciones',
      });
    }
  }

  return groups;
}

/**
 * Fusiona dos productos combinando sus cantidades e historial, preservando el ID y SKU del producto primario.
 */
export function mergeTwoProducts(primary: ShoppingItem, secondary: ShoppingItem): ShoppingItem {
  const mergedQuantity = Math.round(((Number(primary.quantity) || 1) + (Number(secondary.quantity) || 1)) * 1000) / 1000;
  const mergedPrice = (Number(primary.unitPrice) || 0) > 0 ? primary.unitPrice : (Number(secondary.unitPrice) || 0);

  // Fusionar historial de compras si existe
  const combinedHistory: PurchaseHistoryEntry[] = [
    ...(primary.purchaseHistory || []),
    ...(secondary.purchaseHistory || []),
  ];

  // Deduplicar historial por fecha + tienda + precio
  const uniqueHistoryMap = new Map<string, PurchaseHistoryEntry>();
  for (const h of combinedHistory) {
    const key = `${h.date}_${h.storeName}_${h.unitPrice}`;
    if (!uniqueHistoryMap.has(key)) {
      uniqueHistoryMap.set(key, h);
    }
  }

  const finalHistory = Array.from(uniqueHistoryMap.values());

  return {
    ...primary,
    quantity: mergedQuantity,
    unitPrice: mergedPrice,
    completed: primary.completed && secondary.completed,
    purchaseHistory: finalHistory.length > 0 ? finalHistory : undefined,
    lastPurchasedDate: primary.lastPurchasedDate || secondary.lastPurchasedDate,
    updatedAt: Date.now(),
  };
}
