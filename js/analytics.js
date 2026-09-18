/**
 * js/analytics.js
 * Módulo de Analíticas y Cálculos Financieros para Lista de Compra | PRO.
 * Cálculos en precisión de centavos enteros para eliminar la deriva de coma flotante IEEE 754.
 * 
 * Compatible con UMD (Navegadores y Node.js).
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    root.ShoppingAnalytics = exports;
    root.AnalyticsService = exports;
  }
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  /**
   * Calcula con precisión entera de centavos las métricas financieras de la lista de compras.
   * 
   * @param {Array<Object>} items - Lista de artículos de compra
   * @param {number|string} budget - Presupuesto disponible asignado
   * @returns {{ totalPending: number, totalSpent: number, totalOverall: number, budget: number, budgetRemaining: number, budgetPercentage: number }}
   */
  function calculateMetrics(items = [], budget = 0) {
    let centsPending = 0;
    let centsSpent = 0;

    if (Array.isArray(items)) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item || typeof item !== 'object') continue;

        const qty = Number(item.quantity) || 0;
        const price = Number(item.unitPrice) || 0;

        if (qty <= 0 || price < 0) continue;

        // Multiplicación en centavos enteros con redondeo por artículo
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
      budgetPercentage
    };
  }

  /**
   * Agrupa los productos pendientes por ubicación y categoría para el gráfico Apache ECharts.
   * 
   * @param {Array<Object>} items - Lista de productos
   * @returns {Object.<string, Object.<string, number>>}
   */
  function getCategoryBreakdown(items = []) {
    const breakdown = {};
    if (!Array.isArray(items)) return breakdown;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item || typeof item !== 'object' || item.completed) continue;

      const loc = (String(item.location || 'General')).trim() || 'General';
      const cat = (String(item.category || 'General')).trim() || 'General';
      const qty = Number(item.quantity) || 0;

      if (qty <= 0) continue;

      if (!breakdown[loc]) {
        breakdown[loc] = {};
      }
      breakdown[loc][cat] = Math.round(((breakdown[loc][cat] || 0) + qty) * 1000) / 1000;
    }

    return breakdown;
  }

  return {
    calculateMetrics,
    getCategoryBreakdown
  };
}));
