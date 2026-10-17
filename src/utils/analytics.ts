import { ShoppingItem, FinancialMetrics } from '../types';

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

    const loc = (String(item.location || 'General')).trim() || 'General';
    const cat = (String(item.category || 'General')).trim() || 'General';
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
