import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMetrics,
  getCategoryBreakdown,
  calculateDetailedAnalytics,
} from '../src/utils/analytics';
import {
  formatCurrency,
  formatMoney,
  formatNumber,
  parseLocaleNumber,
} from '../src/utils/formatters';
import {
  exportCSV,
  importCSV,
  exportJSON,
  importJSON,
} from '../src/utils/exportImport';
import { sanitizeShoppingItem } from '../src/utils/storage';
import { ShoppingItem } from '../src/types';

describe('Adversarial Challenge: Analytics & Financial Calculations', () => {
  test('cálculos con valores monetarios extremos y desbordamiento', () => {
    const hugeItems: ShoppingItem[] = [
      {
        id: 'huge-1',
        name: 'Super Item 1',
        quantity: 1000000,
        unitPrice: 999999.99,
        category: 'Inversión',
        location: 'Bolsa',
        completed: false,
      },
      {
        id: 'huge-2',
        name: 'Super Item 2',
        quantity: 500000,
        unitPrice: 450000.5,
        category: 'Inversión',
        location: 'Bolsa',
        completed: true,
      },
    ];

    const metrics = calculateMetrics(hugeItems, 2000000000000);
    assert.ok(Number.isFinite(metrics.totalPending));
    assert.ok(Number.isFinite(metrics.totalSpent));
    assert.ok(Number.isFinite(metrics.totalOverall));
    assert.equal(metrics.totalPending, 999999990000);
    assert.equal(metrics.totalSpent, 225000250000);
    assert.equal(metrics.totalOverall, 1225000240000);
    assert.equal(metrics.budgetRemaining, 774999760000);
    assert.equal(metrics.budgetPercentage, 61);
  });

  test('resistencia a valores no finitos saneados y defensivos en items y presupuestos', () => {
    const rawEdgeItems = [
      {
        id: 'inf-1',
        name: 'Inf Item',
        quantity: Infinity,
        unitPrice: 100,
        category: 'Test',
        location: 'Test',
        completed: false,
      },
      {
        id: 'nan-1',
        name: 'NaN Item',
        quantity: NaN,
        unitPrice: NaN,
        category: 'Test',
        location: 'Test',
        completed: false,
      },
      {
        id: 'neg-1',
        name: 'Neg Item',
        quantity: -5,
        unitPrice: -50,
        category: 'Test',
        location: 'Test',
        completed: false,
      },
    ];

    // Saneamiento estándar de storage
    const sanitizedItems = rawEdgeItems
      .map((it, idx) => sanitizeShoppingItem(it, idx))
      .filter((it): it is ShoppingItem => it !== null);

    assert.equal(sanitizedItems.length, 3);
    assert.equal(sanitizedItems[0].quantity, 1); // Infinity normalizado a default 1
    assert.equal(sanitizedItems[1].quantity, 1); // NaN normalizado a default 1
    assert.equal(sanitizedItems[1].unitPrice, 0); // NaN normalizado a 0
    assert.equal(sanitizedItems[2].quantity, 1); // -5 normalizado a default 1
    assert.equal(sanitizedItems[2].unitPrice, 0); // -50 normalizado a 0

    const metrics = calculateMetrics(sanitizedItems, NaN);
    assert.ok(!isNaN(metrics.totalPending));
    assert.ok(!isNaN(metrics.totalSpent));
    assert.ok(!isNaN(metrics.budget));
    assert.equal(metrics.budget, 0);

    const detailed = calculateDetailedAnalytics(sanitizedItems, -100);
    assert.ok(!isNaN(detailed.completionRateProducts));
    assert.ok(!isNaN(detailed.completionRateUnits));
    assert.ok(!isNaN(detailed.averageCostPerProduct));
    assert.ok(!isNaN(detailed.averageCostPerUnit));
    assert.equal(detailed.budget, 0);
  });

  test('precisión decimal acumulada en centavos y cantidades fraccionarias', () => {
    // 0.1 + 0.2 no debe dar 0.30000000000000004
    const fractionalItems: ShoppingItem[] = [
      {
        id: 'f-1',
        name: 'Manzanas por peso',
        quantity: 0.755,
        unitPrice: 1250.6,
        category: 'Frutas',
        location: 'Verdulería',
        completed: false,
      },
      {
        id: 'f-2',
        name: 'Queso por fracción',
        quantity: 0.333,
        unitPrice: 8400.0,
        category: 'Lácteos',
        location: 'Fiambrería',
        completed: true,
      },
    ];

    const metrics = calculateMetrics(fractionalItems, 5000);
    assert.ok(Number.isFinite(metrics.totalPending));
    assert.ok(Number.isFinite(metrics.totalSpent));
    assert.equal(metrics.totalOverall, Math.round((metrics.totalPending + metrics.totalSpent) * 100) / 100);
  });

  test('estrés de rendimiento con 5.000 items', () => {
    const bulkItems: ShoppingItem[] = [];
    for (let i = 0; i < 5000; i++) {
      bulkItems.push({
        id: `bulk-${i}`,
        seqNumber: i + 1,
        skuCode: `#${String(i + 1).padStart(3, '0')}`,
        name: `Producto de prueba ${i}`,
        quantity: (i % 10) + 1,
        unitPrice: (i % 500) + 0.99,
        category: `Categoría ${i % 15}`,
        location: i % 20 === 0 ? 'Por averiguar' : `Comercio ${i % 10}`,
        completed: i % 3 === 0,
      });
    }

    const t0 = performance.now();
    const metrics = calculateMetrics(bulkItems, 500000);
    const detailed = calculateDetailedAnalytics(bulkItems, 500000);
    const breakdown = getCategoryBreakdown(bulkItems);
    const t1 = performance.now();

    const elapsed = t1 - t0;
    assert.ok(elapsed < 150, `El cálculo de 5000 items demoró ${elapsed}ms, superando el límite de 150ms`);
    assert.equal(detailed.totalProducts, 5000);
    assert.ok(detailed.unassignedProducts > 0);
    assert.ok(detailed.topProducts.length === 5000);
    assert.ok(Object.keys(breakdown).length > 0);
  });
});

describe('Adversarial Challenge: Formatters & Locale Parsing', () => {
  test('formatMoney ante valores patológicos y casos borde', () => {
    assert.equal(formatMoney(0), '$0,00');
    assert.equal(formatMoney(-150.5), '-$150,50');
    assert.equal(formatMoney(NaN), '$0,00');
    assert.equal(formatMoney(Infinity), '$0,00');
    assert.equal(formatMoney(-Infinity), '$0,00');
    assert.equal(formatMoney(null), '$0,00');
    assert.equal(formatMoney(undefined), '$0,00');
    assert.equal(formatMoney('   '), '$0,00');
    // Caso borde documentado: -0 produce '$-0,00' debido a Intl.NumberFormat es-AR
    assert.equal(formatMoney(-0), '$-0,00');
  });

  test('parseLocaleNumber con entradas arbitrarias y desordenadas', () => {
    assert.equal(parseLocaleNumber(''), 0);
    assert.equal(parseLocaleNumber('   '), 0);
    assert.equal(parseLocaleNumber(null), 0);
    assert.equal(parseLocaleNumber(undefined), 0);
    assert.equal(parseLocaleNumber('abc'), 0);
    assert.equal(parseLocaleNumber('$ 1.500,75'), 1500.75);
    assert.equal(parseLocaleNumber('-$ 500,20'), -500.2);
    assert.equal(parseLocaleNumber('1,500.75'), 1500.75);
    assert.equal(parseLocaleNumber('10.000.000'), 10000000);
    assert.equal(parseLocaleNumber('10,000,000.50'), 10000000.5);
    assert.equal(parseLocaleNumber(42.5), 42.5);
  });
});

describe('Adversarial Challenge: Multiline CSV & Corrupted Inputs', () => {
  test('inyección de saltos de línea CRLF y LF dentro de celdas entrecomilladas', () => {
    const rawCSV =
      'id,skuCode,name,quantity,unitPrice,category,location,completed,timestamp\r\n' +
      'item-1,#001,"Café molido\nEspecial\r\nTostado fuerte",2,4500.5,"Almacén","Supermercado Central",false,1700000000000\r\n' +
      'item-2,#002,"Pan francés\n""Artesanal""",1,1200,"Panadería","La Espiga",true,1700000000001\r\n';

    const result = importCSV(rawCSV);
    assert.equal(result.success, true);
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].name, 'Café molido\nEspecial\r\nTostado fuerte');
    assert.equal(result.items[0].quantity, 2);
    assert.equal(result.items[0].unitPrice, 4500.5);
    assert.equal(result.items[1].name, 'Pan francés\n"Artesanal"');
    assert.equal(result.items[1].completed, true);
  });

  test('inyección de comillas no balanceadas y caracteres binarios/malformados', () => {
    // Comilla sin cerrar no debe colgar el bucle en bucle infinito
    const unclosedQuoteCSV =
      'id,name,quantity,unitPrice,category,location,completed,timestamp\r\n' +
      'item-1,"Texto con comilla sin cerrar al final,2,100,Cat,Loc,false,1700000000000';

    const res1 = importCSV(unclosedQuoteCSV);
    assert.equal(res1.success, true); // Debe finalizar sin trabarse y procesar lo posible

    // CSV vacío o sólo espacios
    const emptyRes = importCSV('   \r\n\t\n  ');
    assert.equal(emptyRes.success, false);
    assert.ok(emptyRes.error?.includes('al menos'));

    // CSV con cabeceras incorrectas
    const wrongHeadersRes = importCSV('columnaA,columnaB,columnaC\r\n1,2,3');
    assert.equal(wrongHeadersRes.success, false);
    assert.ok(wrongHeadersRes.error?.includes('Cabeceras CSV incompatibles'));
  });

  test('resiliencia de importJSON ante JSONs corrompidos, tipos anómalos y esquemas futuros', () => {
    const corruptedJSONs = [
      '',
      '{ broken: json ]',
      '[]',
      'null',
      '{"version": "9.9", "items": []}',
      '{"items": "esto no es un array"}',
    ];

    for (const corrupt of corruptedJSONs) {
      const res = importJSON(corrupt);
      assert.equal(res.success, false);
      assert.ok(typeof res.error === 'string' && res.error.length > 0);
    }
  });

  test('ciclo completo exportCSV -> importCSV con emojis, comas y saltos de línea', () => {
    const complexItems: ShoppingItem[] = [
      {
        id: 'c-1',
        name: '🍎 Manzana Gala, seleccionada "Premium"\nOrigen: Río Negro',
        quantity: 3,
        unitPrice: 2500.75,
        category: 'Frutas & Verduras',
        location: 'Verdulería "Don Pepe", Sucursal #1',
        completed: false,
      },
      {
        id: 'c-2',
        name: 'Yerba Mate Playadito 🧉 1kg',
        quantity: 2,
        unitPrice: 3800,
        category: 'Almacén',
        location: 'Supermercado Vea',
        completed: true,
      },
    ];

    const exportedCSV = exportCSV(complexItems);
    const imported = importCSV(exportedCSV);

    assert.equal(imported.success, true);
    assert.equal(imported.items.length, 2);
    assert.equal(imported.items[0].name, '🍎 Manzana Gala, seleccionada "Premium"\nOrigen: Río Negro');
    assert.equal(imported.items[0].quantity, 3);
    assert.equal(imported.items[0].unitPrice, 2500.75);
    assert.equal(imported.items[0].category, 'Frutas & Verduras');
    assert.equal(imported.items[0].location, 'Verdulería "Don Pepe", Sucursal #1');
    assert.equal(imported.items[0].completed, false);
    assert.equal(imported.items[1].name, 'Yerba Mate Playadito 🧉 1kg');
    assert.equal(imported.items[1].completed, true);
  });
});
