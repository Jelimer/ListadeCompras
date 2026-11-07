import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ShoppingItem } from '../src/types';
import { formatSkuCode } from '../src/utils/storage';

interface CatalogProductSuggestion {
  id: string;
  skuCode: string;
  seqNumber?: number;
  name: string;
  category: string;
  location: string;
  unitPrice: number;
  completed: boolean;
  quantity?: number;
}

function extractCatalogProducts(items: ShoppingItem[]): CatalogProductSuggestion[] {
  const map = new Map<string, CatalogProductSuggestion>();
  for (const it of items) {
    const cleanName = it.name?.trim();
    if (!cleanName) continue;
    const key = cleanName.toLowerCase();
    const sku = it.skuCode || formatSkuCode(it.seqNumber || 1);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        id: it.id,
        skuCode: sku,
        seqNumber: it.seqNumber,
        name: cleanName,
        category: it.category || 'General',
        location: it.location || 'General',
        unitPrice: Number(it.unitPrice) || 0,
        completed: Boolean(it.completed),
        quantity: Number(it.quantity) || 1,
      });
    } else {
      if (!it.completed && existing.completed) {
        map.set(key, {
          id: it.id,
          skuCode: sku,
          seqNumber: it.seqNumber,
          name: cleanName,
          category: it.category || existing.category,
          location: it.location || existing.location,
          unitPrice: (Number(it.unitPrice) || 0) > 0 ? Number(it.unitPrice) : existing.unitPrice,
          completed: false,
          quantity: Number(it.quantity) || 1,
        });
      }
    }
  }
  return Array.from(map.values());
}

function filterProductSuggestions(
  query: string,
  catalog: CatalogProductSuggestion[]
): CatalogProductSuggestion[] {
  const q = query.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!q) return [];
  const cleanQ = q.replace(/^#/, '');
  return catalog
    .filter((prod) => {
      const prodName = prod.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const skuFull = prod.skuCode.toLowerCase();
      const skuDigits = skuFull.replace('#', '');
      return prodName.includes(q) || skuFull.includes(q) || (cleanQ && skuDigits.includes(cleanQ));
    })
    .sort((a, b) => {
      const nameA = a.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const nameB = b.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const startsA = nameA.startsWith(q);
      const startsB = nameB.startsWith(q);
      if (startsA && !startsB) return -1;
      if (!startsA && startsB) return 1;
      return nameA.localeCompare(nameB, 'es');
    })
    .slice(0, 6);
}

describe('Catalog Autocomplete & Product ID Reuse Suite', () => {
  const sampleItems: ShoppingItem[] = [
    {
      id: 'prod_100',
      seqNumber: 100,
      skuCode: '#100',
      name: 'Carne picada especial',
      quantity: 1,
      unitPrice: 3500,
      location: 'Depot',
      category: 'Carnicería',
      completed: true,
      timestamp: 1000,
    },
    {
      id: 'prod_014',
      seqNumber: 14,
      skuCode: '#014',
      name: 'Café molido tostado',
      quantity: 2,
      unitPrice: 2800,
      location: 'Facor',
      category: 'Almacén',
      completed: false,
      timestamp: 2000,
    },
    {
      id: 'prod_005',
      seqNumber: 5,
      skuCode: '#005',
      name: 'Leche entera 1L',
      quantity: 3,
      unitPrice: 1200,
      location: 'Depot',
      category: 'Lácteos',
      completed: false,
      timestamp: 3000,
    },
  ];

  it('extrae el catálogo deduplicado preservando IDs permanentes y SKUs', () => {
    const catalog = extractCatalogProducts(sampleItems);
    assert.strictEqual(catalog.length, 3);
    const carne = catalog.find((c) => c.name === 'Carne picada especial');
    assert.ok(carne);
    assert.strictEqual(carne.id, 'prod_100');
    assert.strictEqual(carne.skuCode, '#100');
    assert.strictEqual(carne.completed, true);
  });

  it('encuentra coincidencias insensibles a mayúsculas y acentos', () => {
    const catalog = extractCatalogProducts(sampleItems);
    const resultsCafe = filterProductSuggestions('cafe', catalog);
    assert.strictEqual(resultsCafe.length, 1);
    assert.strictEqual(resultsCafe[0].name, 'Café molido tostado');
    assert.strictEqual(resultsCafe[0].skuCode, '#014');

    const resultsCarne = filterProductSuggestions('CARNE', catalog);
    assert.strictEqual(resultsCarne.length, 1);
    assert.strictEqual(resultsCarne[0].id, 'prod_100');
  });

  it('permite buscar productos por su código SKU (#100 o 100)', () => {
    const catalog = extractCatalogProducts(sampleItems);
    const resultsSku100 = filterProductSuggestions('100', catalog);
    assert.strictEqual(resultsSku100.length, 1);
    assert.strictEqual(resultsSku100[0].name, 'Carne picada especial');

    const resultsSku014 = filterProductSuggestions('#014', catalog);
    assert.strictEqual(resultsSku014.length, 1);
    assert.strictEqual(resultsSku014[0].name, 'Café molido tostado');
  });

  it('prioriza coincidencias que comienzan con el texto buscado', () => {
    const catalog = extractCatalogProducts([
      ...sampleItems,
      {
        id: 'prod_200',
        seqNumber: 200,
        skuCode: '#200',
        name: 'Torta de Café',
        quantity: 1,
        unitPrice: 4000,
        location: 'Panadería',
        category: 'Panadería',
        completed: false,
        timestamp: 4000,
      },
    ]);

    const results = filterProductSuggestions('caf', catalog);
    assert.strictEqual(results.length, 2);
    // 'Café molido tostado' starts with 'caf', 'Torta de Café' contains 'caf'
    assert.strictEqual(results[0].name, 'Café molido tostado');
    assert.strictEqual(results[1].name, 'Torta de Café');
  });

  it('simula la reactivación de un producto comprado manteniendo su ID y SKU sin duplicar', () => {
    const items = [...sampleItems];
    const target = items.find((i) => i.id === 'prod_100')!;
    assert.strictEqual(target.completed, true);

    // Usuario vuelve a agregar "Carne picada especial"
    const newQty = 2;
    const updatedItems = items.map((i) =>
      i.id === target.id
        ? {
            ...i,
            completed: false,
            quantity: newQty,
            updatedAt: Date.now(),
          }
        : i
    );

    const reactivated = updatedItems.find((i) => i.id === 'prod_100')!;
    assert.strictEqual(reactivated.completed, false);
    assert.strictEqual(reactivated.skuCode, '#100');
    assert.strictEqual(reactivated.quantity, 2);
    assert.strictEqual(updatedItems.length, items.length); // Sin duplicar entradas
  });
});
