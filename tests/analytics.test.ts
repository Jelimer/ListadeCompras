import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMetrics,
  getCategoryBreakdown,
  calculateDetailedAnalytics,
} from '../src/utils/analytics';
import { ShoppingItem } from '../src/types';

describe('analytics utility suite', () => {
  const sampleItems: ShoppingItem[] = [
    {
      id: 'item_1',
      seqNumber: 1,
      skuCode: '#001',
      name: 'Leche La Serenísima 1L',
      quantity: 2,
      unitPrice: 1200.5,
      location: 'Supermercado Impulso',
      category: 'Lácteos',
      completed: true,
      timestamp: 1000,
      updatedAt: 1000,
    },
    {
      id: 'item_2',
      seqNumber: 2,
      skuCode: '#002',
      name: 'Queso Cremoso 500g',
      quantity: 1,
      unitPrice: 3500,
      location: 'Supermercado Impulso',
      category: 'Lácteos',
      completed: false,
      timestamp: 1100,
      updatedAt: 1100,
    },
    {
      id: 'item_3',
      seqNumber: 3,
      skuCode: '#003',
      name: 'Manzanas 1kg',
      quantity: 1.5,
      unitPrice: 2000,
      location: 'Verdulería Central',
      category: 'Frutas y Verduras',
      completed: false,
      timestamp: 1200,
      updatedAt: 1200,
    },
    {
      id: 'item_4',
      seqNumber: 4,
      skuCode: '#004',
      name: 'Detergente Vajilla',
      quantity: 1,
      unitPrice: 0, // Producto no valorizado aún
      location: 'Por averiguar',
      category: 'Limpieza',
      completed: false,
      timestamp: 1300,
      updatedAt: 1300,
    },
  ];

  describe('calculateMetrics', () => {
    it('calcula métricas de lista vacía correctamente', () => {
      const metrics = calculateMetrics([], 10000);
      assert.strictEqual(metrics.totalPending, 0);
      assert.strictEqual(metrics.totalSpent, 0);
      assert.strictEqual(metrics.totalOverall, 0);
      assert.strictEqual(metrics.budget, 10000);
      assert.strictEqual(metrics.budgetRemaining, 10000);
      assert.strictEqual(metrics.budgetPercentage, 0);
    });

    it('calcula totales pendientes, gastados y presupuesto con precisión en centavos', () => {
      // item_1: 2 * 1200.50 = 2401.00 (completed -> gastado)
      // item_2: 1 * 3500.00 = 3500.00 (pending)
      // item_3: 1.5 * 2000.00 = 3000.00 (pending)
      // item_4: 1 * 0 = 0 (pending)
      // Total pendiente = 3500 + 3000 = 6500.00
      // Total gastado = 2401.00
      // Total general = 8901.00
      const budget = 10000;
      const metrics = calculateMetrics(sampleItems, budget);

      assert.strictEqual(metrics.totalSpent, 2401);
      assert.strictEqual(metrics.totalPending, 6500);
      assert.strictEqual(metrics.totalOverall, 8901);
      assert.strictEqual(metrics.budget, 10000);
      assert.strictEqual(metrics.budgetRemaining, 1099); // 10000 - 8901
      assert.strictEqual(metrics.budgetPercentage, 89); // 8901 / 10000 = 89%
    });

    it('maneja presupuesto cero o nulo sin divisiones por cero', () => {
      const metrics = calculateMetrics(sampleItems, 0);
      assert.strictEqual(metrics.budget, 0);
      assert.strictEqual(metrics.budgetRemaining, 0);
      assert.strictEqual(metrics.budgetPercentage, 0);
    });

    it('limita budgetPercentage a 100% cuando se supera el presupuesto', () => {
      const metrics = calculateMetrics(sampleItems, 5000);
      assert.strictEqual(metrics.budget, 5000);
      assert.strictEqual(metrics.budgetRemaining, -3901);
      assert.strictEqual(metrics.budgetPercentage, 100);
    });

    it('ignora items nulos o con precios/cantidades inválidas', () => {
      const dirtyItems = [
        ...sampleItems,
        null as unknown as ShoppingItem,
        { ...sampleItems[0], quantity: -5 },
        { ...sampleItems[0], unitPrice: -100 },
      ];
      const metrics = calculateMetrics(dirtyItems, 10000);
      assert.strictEqual(metrics.totalOverall, 8901);
    });
  });

  describe('getCategoryBreakdown', () => {
    it('agrupa únicamente los items pendientes por tienda y categoría sumando cantidades', () => {
      const breakdown = getCategoryBreakdown(sampleItems);
      // item_1 está completado, debe excluirse
      // Supermercado Impulso: Lácteos -> 1 (de item_2)
      // Verdulería Central: Frutas y Verduras -> 1.5 (de item_3)
      // Por averiguar: Limpieza -> 1 (de item_4)
      assert.strictEqual(breakdown['Supermercado Impulso']?.['Lácteos'], 1);
      assert.strictEqual(breakdown['Verdulería Central']?.['Frutas y Verduras'], 1.5);
      assert.strictEqual(breakdown['Por averiguar']?.['Limpieza'], 1);
    });

    it('devuelve objeto vacío ante lista vacía o nula', () => {
      assert.deepStrictEqual(getCategoryBreakdown([]), {});
      assert.deepStrictEqual(getCategoryBreakdown(undefined), {});
    });
  });

  describe('calculateDetailedAnalytics', () => {
    it('genera analítica exhaustiva con porcentajes y desgloses ordenados', () => {
      const detailed = calculateDetailedAnalytics(sampleItems, 10000);

      assert.strictEqual(detailed.totalProducts, 4);
      assert.strictEqual(detailed.completedProducts, 1);
      assert.strictEqual(detailed.pendingProducts, 3);
      assert.strictEqual(detailed.unassignedProducts, 1); // "Por averiguar"

      // Unidades: 2 + 1 + 1.5 + 1 = 5.5
      assert.strictEqual(detailed.totalUnits, 5.5);
      assert.strictEqual(detailed.completedUnits, 2);
      assert.strictEqual(detailed.pendingUnits, 3.5);

      // Tasas de completitud
      assert.strictEqual(detailed.completionRateProducts, 25); // 1 de 4 -> 25.0%
      assert.strictEqual(detailed.completionRateUnits, 36.4); // 2 de 5.5 -> 36.36% -> 36.4%

      // Conteo con precio
      assert.strictEqual(detailed.pricedProductsCount, 3);
      assert.strictEqual(detailed.unpricedProductsCount, 1);

      // Costos promedio
      assert.strictEqual(detailed.averageCostPerProduct, 2967); // 8901 / 3
      assert.strictEqual(detailed.averageCostPerUnit, 1618.36); // 8901 / 5.5

      // Verificación de desglose de comercios
      assert.ok(Array.isArray(detailed.storeBreakdown));
      // Debe estar ordenado por totalAmount descendente:
      // Supermercado Impulso: 2401 + 3500 = 5901
      // Verdulería Central: 3000
      // Por averiguar: 0
      assert.strictEqual(detailed.storeBreakdown[0].name, 'Supermercado Impulso');
      assert.strictEqual(detailed.storeBreakdown[0].totalAmount, 5901);
      assert.strictEqual(detailed.storeBreakdown[0].completedProductCount, 1);
      assert.strictEqual(detailed.storeBreakdown[0].pendingProductCount, 1);
      assert.strictEqual(detailed.storeBreakdown[1].name, 'Verdulería Central');
      assert.strictEqual(detailed.storeBreakdown[1].totalAmount, 3000);

      // Verificación de productos destacados (topProducts)
      assert.ok(Array.isArray(detailed.topProducts));
      assert.strictEqual(detailed.topProducts.length, 4);
      // Top 1 debe ser Queso Cremoso (lineTotal: 3500)
      assert.strictEqual(detailed.topProducts[0].name, 'Queso Cremoso 500g');
      assert.strictEqual(detailed.topProducts[0].lineTotal, 3500);
      // Top 2: Manzanas (lineTotal: 3000)
      assert.strictEqual(detailed.topProducts[1].name, 'Manzanas 1kg');
      assert.strictEqual(detailed.topProducts[1].lineTotal, 3000);
      // Top 3: Leche (lineTotal: 2401)
      assert.strictEqual(detailed.topProducts[2].name, 'Leche La Serenísima 1L');
      assert.strictEqual(detailed.topProducts[2].lineTotal, 2401);
    });

    it('funciona de manera segura con lista vacía', () => {
      const detailed = calculateDetailedAnalytics([], 0);
      assert.strictEqual(detailed.totalProducts, 0);
      assert.strictEqual(detailed.totalUnits, 0);
      assert.strictEqual(detailed.completionRateProducts, 0);
      assert.strictEqual(detailed.completionRateUnits, 0);
      assert.strictEqual(detailed.averageCostPerProduct, 0);
      assert.strictEqual(detailed.averageCostPerUnit, 0);
      assert.deepStrictEqual(detailed.storeBreakdown, []);
      assert.deepStrictEqual(detailed.categoryBreakdown, []);
      assert.deepStrictEqual(detailed.topProducts, []);
    });
  });
});
