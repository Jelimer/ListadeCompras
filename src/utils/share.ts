import { ShoppingItem } from '../types';
import { formatMoney, formatNumber } from './formatters';

export function formatShoppingList(
  items: ShoppingItem[] = [],
  options: {
    includeCompleted?: boolean;
    includePrices?: boolean;
    title?: string;
  } = {}
): string {
  const { includeCompleted = false, includePrices = true, title = 'Lista de Compras' } = options;

  if (!Array.isArray(items) || items.length === 0) {
    return '🛒 Tu lista de compras está vacía.';
  }

  const targetItems = items.filter((it) => {
    if (!it || !it.name) return false;
    if (!includeCompleted && it.completed) return false;
    return true;
  });

  if (targetItems.length === 0) {
    return '🛒 No hay productos pendientes en la lista de compras.';
  }

  const grouped: Record<string, ShoppingItem[]> = {};
  targetItems.forEach((item) => {
    const loc = (item.location && item.location.trim()) || 'General';
    if (!grouped[loc]) grouped[loc] = [];
    grouped[loc].push(item);
  });

  const lines: string[] = [];
  lines.push(`🛒 *${title}*`);
  lines.push('');

  let grandTotalCents = 0;
  let totalPendingArticles = 0;

  const locations = Object.keys(grouped).sort((a, b) => {
    if (a === 'General') return 1;
    if (b === 'General') return -1;
    return a.localeCompare(b, 'es', { sensitivity: 'base' });
  });

  locations.forEach((loc) => {
    lines.push(`🏪 *${loc}*`);
    let storeSubtotalCents = 0;

    grouped[loc].forEach((item) => {
      const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
      const price = Number(item.unitPrice) >= 0 ? Number(item.unitPrice) : 0;
      const itemTotalCents = Math.round(Math.round(price * 100) * qty);

      if (!item.completed) {
        grandTotalCents += itemTotalCents;
        totalPendingArticles += qty;
      }
      storeSubtotalCents += itemTotalCents;

      const qtyDisplay = Number.isInteger(qty) ? `${formatNumber(qty, 0)}x` : `${formatNumber(qty)} un. x`;
      const checkPrefix = item.completed ? '[✓] ' : '• ';
      const skuPrefix = item.skuCode ? `${item.skuCode} ` : '';

      if (includePrices && price > 0) {
        const totalFormatted = formatMoney(itemTotalCents / 100);
        if (qty > 1) {
          lines.push(
            `${checkPrefix}${skuPrefix}${qtyDisplay} ${item.name} (${totalFormatted} - ${formatMoney(price)} c/u)`
          );
        } else {
          lines.push(`${checkPrefix}${skuPrefix}${qtyDisplay} ${item.name} (${totalFormatted})`);
        }
      } else {
        lines.push(`${checkPrefix}${skuPrefix}${qtyDisplay} ${item.name}`);
      }
    });

    if (includePrices && storeSubtotalCents > 0) {
      const subtotalFormatted = formatMoney(storeSubtotalCents / 100);
      lines.push(`  _Subtotal estimado: ${subtotalFormatted}_`);
    }

    lines.push('');
  });

  if (includePrices && grandTotalCents > 0) {
    const grandTotalFormatted = formatMoney(grandTotalCents / 100);
    lines.push(`💰 *Total estimado:* ${grandTotalFormatted}`);
  }
  lines.push(`📦 *Artículos pendientes:* ${formatNumber(totalPendingArticles)}`);
  lines.push('📱 _Generado con Lista de Compra | PRO_');

  return lines.join('\n').trim();
}

export async function shareShoppingList(
  items: ShoppingItem[],
  options: {
    includeCompleted?: boolean;
    includePrices?: boolean;
    title?: string;
  } = {}
): Promise<{
  success: boolean;
  method: 'native' | 'whatsapp' | 'clipboard' | 'cancelled';
  text: string;
}> {
  const text = formatShoppingList(items, options);
  const title = options.title || 'Lista de Compras';

  // 1. Try Native Web Share API
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return { success: true, method: 'native', text };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { success: false, method: 'cancelled', text };
      }
    }
  }

  // 2. Try copying to clipboard
  let copied = false;
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {}
  }

  // Fallback copy
  if (!copied && typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      copied = document.execCommand('copy');
      document.body.removeChild(textarea);
    } catch {}
  }

  return {
    success: true,
    method: copied ? 'clipboard' : 'whatsapp',
    text,
  };
}
