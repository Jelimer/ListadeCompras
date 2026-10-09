/**
 * js/share.js
 * Módulo de Formateo de Lista de Compras y Cascada de Compartir (Web Share / WhatsApp / Portapapeles)
 * para "Lista de Compra | PRO".
 * 
 * Formato: UMD (compatible con Navegadores y Node.js puro).
 * Cero dependencias externas. Lógica matemática de centavos enteros anti-deriva IEEE 754.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    root.ShareModule = exports;
    root.ShoppingShare = exports;
    if (typeof window !== 'undefined') {
      window.ShareModule = exports;
      window.ShoppingShare = exports;
    }
  }
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  const ShareModule = {
    /**
     * Formatea un conjunto de productos para compartir de manera legible por WhatsApp o texto plano.
     * @param {Array<Object>} items - Lista de artículos de compra
     * @param {Object} [options={}] - Opciones de configuración
     * @returns {string} Texto formateado
     */
    formatShoppingList(items = [], options = {}) {
      const {
        includeCompleted = false,
        includePrices = true,
        title = 'Lista de Compras'
      } = options;

      if (!Array.isArray(items) || items.length === 0) {
        return '🛒 Tu lista de compras está vacía.';
      }

      const targetItems = items.filter(it => {
        if (!it || !it.name) return false;
        if (!includeCompleted && it.completed) return false;
        return true;
      });

      if (targetItems.length === 0) {
        return '🛒 No hay productos pendientes en la lista de compras.';
      }

      // Agrupación por comercio (defaulting a 'General')
      const grouped = {};
      targetItems.forEach(item => {
        const rawLoc = (item.location !== null && item.location !== undefined) ? String(item.location).trim() : '';
        const loc = rawLoc || 'General';
        if (!grouped[loc]) grouped[loc] = [];
        grouped[loc].push(item);
      });

      const lines = [];
      lines.push(`🛒 *${title}*`);
      lines.push('');

      let grandTotalCents = 0;
      let totalPendingArticles = 0;

      // Ordenar comercios: 'General' siempre al final, los demás por orden alfabético en español
      const locations = Object.keys(grouped).sort((a, b) => {
        if (a === 'General') return 1;
        if (b === 'General') return -1;
        return a.localeCompare(b, 'es', { sensitivity: 'base' });
      });

      locations.forEach(loc => {
        lines.push(`🏪 *${loc}*`);
        let storeSubtotalCents = 0;

        grouped[loc].forEach(item => {
          const rawQty = Number(item.quantity);
          const qty = (!isNaN(rawQty) && isFinite(rawQty) && rawQty > 0) ? rawQty : 1;
          const rawPrice = Number(item.unitPrice);
          const price = (!isNaN(rawPrice) && isFinite(rawPrice) && rawPrice > 0) ? rawPrice : 0;

          // Aritmética exacta en centavos enteros para eliminar deriva IEEE 754
          const itemTotalCents = Math.round(Math.round(price * 100) * qty);

          if (!item.completed) {
            grandTotalCents += itemTotalCents;
            totalPendingArticles += qty;
          }
          storeSubtotalCents += itemTotalCents;

          const qtyDisplay = Number.isInteger(qty) ? `${qty}x` : `${qty} un. x`;
          const checkPrefix = item.completed ? '[✓] ' : '• ';

          if (includePrices && price > 0) {
            const totalFormatted = (itemTotalCents / 100).toFixed(2);
            if (qty > 1) {
              lines.push(`${checkPrefix}${qtyDisplay} ${item.name} ($${totalFormatted} - $${price.toFixed(2)} c/u)`);
            } else {
              lines.push(`${checkPrefix}${qtyDisplay} ${item.name} ($${totalFormatted})`);
            }
          } else {
            lines.push(`${checkPrefix}${qtyDisplay} ${item.name}`);
          }
        });

        if (includePrices && storeSubtotalCents > 0) {
          const subtotalFormatted = (storeSubtotalCents / 100).toFixed(2);
          lines.push(`  _Subtotal estimado: $${subtotalFormatted}_`);
        }

        lines.push('');
      });

      if (includePrices && grandTotalCents > 0) {
        const grandTotalFormatted = (grandTotalCents / 100).toFixed(2);
        lines.push(`💰 *Total estimado:* $${grandTotalFormatted}`);
      }
      lines.push(`📦 *Artículos pendientes:* ${totalPendingArticles}`);
      lines.push('📱 _Generado con Lista de Compra | PRO_');

      return lines.join('\n').trim();
    },

    /**
     * Orquesta la cascada de compartir lista: Web Share API -> WhatsApp Web -> Portapapeles -> execCommand.
     * @param {Array<Object>|string} itemsOrText - Productos o texto formateado
     * @param {Object} [options={}] - Opciones de entorno y configuración
     * @returns {Promise<{ success: boolean, method: string, copied?: boolean, opened?: boolean, whatsappUrl?: string, text?: string, cancelled?: boolean }>}
     */
    async shareList(itemsOrText, options = {}) {
      const text = Array.isArray(itemsOrText)
        ? this.formatShoppingList(itemsOrText, options)
        : String(itemsOrText || '');

      const title = options.title || 'Lista de Compras';
      const nav = options.navigator || (typeof navigator !== 'undefined' ? navigator : null);
      const win = options.window || (typeof window !== 'undefined' ? window : null);
      const doc = options.document || (typeof document !== 'undefined' ? document : null);

      // Nivel 1: Intentar Web Share API nativo
      if (nav && typeof nav.share === 'function') {
        try {
          await nav.share({ title, text });
          return { success: true, method: 'native' };
        } catch (err) {
          if (err && err.name === 'AbortError') {
            return { success: false, method: 'native', cancelled: true };
          }
        }
      }

      // Nivel 2: Construir enlace universal de WhatsApp
      const encodedText = encodeURIComponent(text);
      const whatsappUrl = `https://api.whatsapp.com/send?text=${encodedText}`;
      let opened = false;
      if (win && typeof win.open === 'function') {
        try {
          const w = win.open(whatsappUrl, '_blank', 'noopener,noreferrer');
          if (w) opened = true;
        } catch (_) {
          opened = false;
        }
      }

      // Nivel 3: Copia defensiva al portapapeles
      let copied = false;
      if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
        try {
          await nav.clipboard.writeText(text);
          copied = true;
        } catch (_) {
          copied = false;
        }
      }

      // Fallback retrocompatible con textarea y execCommand
      if (!copied && doc && typeof doc.createElement === 'function') {
        try {
          const textarea = doc.createElement('textarea');
          textarea.value = text;
          if (typeof textarea.setAttribute === 'function') {
            textarea.setAttribute('readonly', '');
          }
          if (textarea.style) {
            textarea.style.position = 'absolute';
            textarea.style.left = '-9999px';
          }
          if (doc.body && typeof doc.body.appendChild === 'function') {
            doc.body.appendChild(textarea);
          }
          if (typeof textarea.select === 'function') textarea.select();
          if (typeof doc.execCommand === 'function') {
            copied = Boolean(doc.execCommand('copy'));
          }
          if (doc.body && typeof doc.body.removeChild === 'function') {
            doc.body.removeChild(textarea);
          }
        } catch (_) {
          copied = false;
        }
      }

      return {
        success: true,
        method: opened ? 'whatsapp' : (copied ? 'clipboard' : 'fallback'),
        copied,
        opened,
        whatsappUrl,
        text
      };
    }
  };

  return ShareModule;
}));
