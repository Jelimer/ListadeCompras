import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ShoppingItem } from '../src/types';
import {
  normalizeProductName,
  detectDuplicateGroups,
  mergeTwoProducts,
} from '../src/utils/duplicates';
import { recompactSequentialSkus, hasSkuGaps } from '../src/utils/storage';

describe('Duplicates detection & merge utility suite', () => {
  it('normaliza nombres de producto eliminando acentos y signos', () => {
    assert.strictEqual(normalizeProductName(' Café Molido! '), 'cafe molido');
    assert.strictEqual(normalizeProductName('Leche   Entera (1L)'), 'leche entera 1l');
    assert.strictEqual(normalizeProductName(''), '');
  });

  it('detecta productos duplicados por nombre exacto normalizado', () => {
    const items: ShoppingItem[] = [
      {
        id: '1',
        name: 'Carne picada',
        quantity: 1,
        unitPrice: 2000,
        location: 'Depot',
        category: 'Carnes',
        completed: false,
        timestamp: 100,
      },
      {
        id: '2',
        name: 'CARNE PICADA',
        quantity: 2,
        unitPrice: 2100,
        location: 'Facor',
        category: 'Carnes',
        completed: true,
        timestamp: 200,
      },
      {
        id: '3',
        name: 'Pan lactal',
        quantity: 1,
        unitPrice: 1500,
        location: 'Panadería',
        category: 'Panadería',
        completed: false,
        timestamp: 300,
      },
    ];

    const groups = detectDuplicateGroups(items);
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].reason, 'exact_name');
    assert.strictEqual(groups[0].items.length, 2);
  });

  it('detecta productos con el mismo código SKU pero distinto ID', () => {
    const items: ShoppingItem[] = [
      {
        id: 'item_a',
        skuCode: '#100',
        name: 'Manzanas rojas',
        quantity: 1,
        unitPrice: 1000,
        location: 'Verdulería',
        category: 'Frutas',
        completed: false,
        timestamp: 100,
      },
      {
        id: 'item_b',
        skuCode: '#100',
        name: 'Peras Williams',
        quantity: 2,
        unitPrice: 1200,
        location: 'Verdulería',
        category: 'Frutas',
        completed: false,
        timestamp: 200,
      },
    ];

    const groups = detectDuplicateGroups(items);
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].reason, 'duplicate_sku');
  });

  it('detecta productos con nombres similares por variación/subcadena', () => {
    const items: ShoppingItem[] = [
      {
        id: '1',
        name: 'Leche entera La Serenísima',
        quantity: 1,
        unitPrice: 1300,
        location: 'Depot',
        category: 'Lácteos',
        completed: false,
        timestamp: 100,
      },
      {
        id: '2',
        name: 'Leche entera',
        quantity: 2,
        unitPrice: 1200,
        location: 'Super',
        category: 'Lácteos',
        completed: false,
        timestamp: 200,
      },
    ];

    const groups = detectDuplicateGroups(items);
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].reason, 'similar_name');
  });

  it('fusiona dos productos correctamente combinando cantidades e historial', () => {
    const primary: ShoppingItem = {
      id: 'prim_1',
      skuCode: '#005',
      seqNumber: 5,
      name: 'Arroz largo fino',
      quantity: 2,
      unitPrice: 1200,
      location: 'Depot',
      category: 'Almacén',
      completed: false,
      timestamp: 1000,
      purchaseHistory: [
        {
          date: '01/10/2026',
          storeName: 'Depot',
          quantity: 2,
          unitPrice: 1100,
        },
      ],
    };

    const secondary: ShoppingItem = {
      id: 'sec_2',
      skuCode: '#099',
      seqNumber: 99,
      name: 'Arroz largo fino 1kg',
      quantity: 3,
      unitPrice: 1250,
      location: 'Facor',
      category: 'Almacén',
      completed: false,
      timestamp: 2000,
      purchaseHistory: [
        {
          date: '15/10/2026',
          storeName: 'Facor',
          quantity: 1,
          unitPrice: 1250,
        },
      ],
    };

    const merged = mergeTwoProducts(primary, secondary);
    assert.strictEqual(merged.id, 'prim_1');
    assert.strictEqual(merged.skuCode, '#005');
    assert.strictEqual(merged.quantity, 5); // 2 + 3
    assert.strictEqual(merged.unitPrice, 1200); // conserva precio de primary
    assert.strictEqual(merged.purchaseHistory?.length, 2); // historial combinado
  });

  it('hasSkuGaps detecta huecos cuando se elimina un ID intermedio como el #045', () => {
    const items: ShoppingItem[] = [];
    for (let i = 1; i <= 100; i++) {
      if (i === 45) continue; // Simulamos que el #045 fue eliminado
      items.push({
        id: `item_${i}`,
        seqNumber: i,
        skuCode: `#${String(i).padStart(3, '0')}`,
        name: `Producto ${i}`,
        quantity: 1,
        unitPrice: 100,
        location: 'Super',
        category: 'General',
        completed: false,
        timestamp: i * 100,
      });
    }

    assert.strictEqual(items.length, 99);
    assert.strictEqual(hasSkuGaps(items), true); // Detecta que falta el 45
  });

  it('recompactSequentialSkus cierra automáticamente el hueco y desplaza los IDs posteriores', () => {
    const items: ShoppingItem[] = [];
    for (let i = 1; i <= 100; i++) {
      if (i === 45) continue; // Hueco en #045
      items.push({
        id: `item_${i}`,
        seqNumber: i,
        skuCode: `#${String(i).padStart(3, '0')}`,
        name: `Producto ${i}`,
        quantity: 1,
        unitPrice: 100,
        location: 'Super',
        category: 'General',
        completed: false,
        timestamp: i * 100,
      });
    }

    const compacted = recompactSequentialSkus(items);
    assert.strictEqual(compacted.length, 99);
    // El item 44 (índice 43) se mantiene en #044
    assert.strictEqual(compacted[43].seqNumber, 44);
    assert.strictEqual(compacted[43].skuCode, '#044');
    // El item que antes era #046 (índice 44) ahora pasa a ser #045
    assert.strictEqual(compacted[44].seqNumber, 45);
    assert.strictEqual(compacted[44].skuCode, '#045');
    assert.strictEqual(compacted[44].id, 'item_46');
    // El último producto pasa de #100 a #099
    assert.strictEqual(compacted[98].seqNumber, 99);
    assert.strictEqual(compacted[98].skuCode, '#099');
    assert.strictEqual(compacted[98].id, 'item_100');

    // Ahora no deben existir huecos
    assert.strictEqual(hasSkuGaps(compacted), false);
  });
});
