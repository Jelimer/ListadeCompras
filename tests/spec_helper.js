/**
 * tests/spec_helper.js
 * Helpers, oráculos de especificación y puente de carga para las pruebas E2E.
 * Derivado estrictamente de PROJECT.md y ORIGINAL_REQUEST.md.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createTestEnvironment, escapeHtmlText } = require('./mock_dom');

const ROOT_DIR = path.resolve(__dirname, '..');

// Oráculo de referencia para Analíticas y Cálculos Monetarios (precisión entera en centavos)
const ReferenceAnalytics = {
  calculateMetrics(items = [], budget = 0) {
    let centsPending = 0;
    let centsSpent = 0;

    for (const item of items) {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unitPrice) || 0;
      const itemCents = Math.round(price * 100) * qty;

      if (item.completed) {
        centsSpent += itemCents;
      } else {
        centsPending += itemCents;
      }
    }

    const totalPending = centsPending / 100;
    const totalSpent = centsSpent / 100;
    const totalOverall = (centsPending + centsSpent) / 100;
    const numBudget = Number(budget) || 0;
    const budgetCents = Math.round(numBudget * 100);

    const budgetRemaining = budgetCents > 0 ? (budgetCents - (centsPending + centsSpent)) / 100 : 0;
    const budgetPercentage = budgetCents > 0 ? Math.min(100, Math.round(((centsPending + centsSpent) / budgetCents) * 100)) : 0;

    return {
      totalPending,
      totalSpent,
      totalOverall,
      budget: numBudget,
      budgetRemaining,
      budgetPercentage
    };
  },

  getCategoryBreakdown(items = []) {
    const breakdown = {};
    for (const item of items) {
      if (item.completed) continue; // Sólo pendientes para gráfico
      const loc = (item.location || 'General').trim() || 'General';
      const cat = (item.category || 'General').trim() || 'General';
      const qty = Number(item.quantity) || 0;

      if (!breakdown[loc]) breakdown[loc] = {};
      breakdown[loc][cat] = (breakdown[loc][cat] || 0) + qty;
    }
    return breakdown;
  }
};

// Oráculo de referencia para Validaciones y Sanitización XSS
const ReferenceValidation = {
  escapeHtml(str) {
    if (typeof str !== 'string') str = String(str ?? '');
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  validateItem(raw) {
    if (!raw || typeof raw !== 'object') {
      return { valid: false, error: 'Objeto de producto inválido' };
    }

    const name = String(raw.name ?? '').replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!name) {
      return { valid: false, error: 'El nombre del producto no puede estar vacío' };
    }

    const qty = Number(raw.quantity);
    if (isNaN(qty) || qty <= 0) {
      return { valid: false, error: 'La cantidad debe ser un número mayor a 0' };
    }

    const price = raw.unitPrice === undefined || raw.unitPrice === '' ? 0 : Number(raw.unitPrice);
    if (isNaN(price) || price < 0) {
      return { valid: false, error: 'El precio no puede ser negativo ni inválido' };
    }

    const category = (String(raw.category ?? '').replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim()) || 'General';
    const location = (String(raw.location ?? '').replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim()) || 'General';

    return {
      valid: true,
      data: {
        id: raw.id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: this.escapeHtml(name),
        quantity: qty,
        unitPrice: Math.round(price * 100) / 100,
        category: this.escapeHtml(category),
        location: this.escapeHtml(location),
        completed: Boolean(raw.completed),
        timestamp: Number(raw.timestamp) || Date.now()
      }
    };
  }
};

// Oráculo de referencia para Exportación e Importación JSON/CSV (RFC 4180 + BOM)
const ReferenceExportImport = {
  exportJSON(items = [], budget = 0) {
    const payload = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      budget: Number(budget) || 0,
      items: items.map(it => ({
        id: String(it.id),
        name: String(it.name),
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
        category: String(it.category || 'General'),
        location: String(it.location || 'General'),
        completed: Boolean(it.completed),
        timestamp: Number(it.timestamp || Date.now())
      }))
    };
    return JSON.stringify(payload, null, 2);
  },

  exportCSV(items = []) {
    const BOM = '\uFEFF';
    const headers = ['id', 'name', 'quantity', 'unitPrice', 'category', 'location', 'completed', 'timestamp'];
    const rows = [headers.join(',')];

    for (const item of items) {
      const row = [
        this._escapeCSVCell(item.id),
        this._escapeCSVCell(item.name),
        item.quantity,
        item.unitPrice,
        this._escapeCSVCell(item.category || 'General'),
        this._escapeCSVCell(item.location || 'General'),
        item.completed ? 'true' : 'false',
        item.timestamp || Date.now()
      ];
      rows.push(row.join(','));
    }
    return BOM + rows.join('\r\n');
  },

  _escapeCSVCell(val) {
    let str = String(val ?? '');
    // Restaurar comillas literales si provienen de entidades HTML para formato RFC 4180
    str = str.replace(/&quot;/g, '"');
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  },

  importJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (!data || typeof data !== 'object') {
        throw new Error('Estructura JSON raíz inválida.');
      }
      if (data.version !== '1.0') {
        throw new Error(`Versión de esquema no soportada: ${data.version}. Se requiere versión 1.0.`);
      }
      if (!Array.isArray(data.items)) {
        throw new Error('El campo "items" debe ser una lista.');
      }
      const validItems = [];
      for (const raw of data.items) {
        const v = ReferenceValidation.validateItem(raw);
        if (v.valid) validItems.push(v.data);
      }
      return {
        success: true,
        budget: Number(data.budget) || 0,
        items: validItems
      };
    } catch (e) {
      return { success: false, error: e.message, items: [] };
    }
  },

  importCSV(csvString) {
    try {
      let content = csvString;
      if (content.startsWith('\uFEFF')) {
        content = content.slice(1);
      }
      // Filtrar líneas que contengan únicamente espacios
      const allLines = this._parseCSVLines(content);
      const lines = allLines.filter(row => row.some(cell => cell.trim().length > 0));

      if (lines.length === 0) {
        return { success: true, items: [] };
      }
      if (lines.length < 2) {
        return { success: true, items: [] };
      }
      const headers = lines[0].map(h => h.trim().toLowerCase());
      const nameIdx = headers.indexOf('name');
      const qtyIdx = headers.indexOf('quantity');
      const priceIdx = headers.indexOf('unitprice');
      const catIdx = headers.indexOf('category');
      const locIdx = headers.indexOf('location');
      const compIdx = headers.indexOf('completed');
      const idIdx = headers.indexOf('id');

      if (nameIdx === -1) {
        throw new Error('Cabecera CSV inválida: columna obligatoria "name" ausente.');
      }

      const validItems = [];
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        if (row.length === 0 || (row.length === 1 && !row[0].trim())) continue;
        const rawQty = (qtyIdx !== -1 && row[qtyIdx] !== undefined && row[qtyIdx].trim() !== '') ? parseFloat(row[qtyIdx]) : 1;
        const rawPrice = (priceIdx !== -1 && row[priceIdx] !== undefined && row[priceIdx].trim() !== '') ? parseFloat(row[priceIdx]) : 0;
        const rawItem = {
          id: idIdx !== -1 && row[idIdx] ? row[idIdx] : undefined,
          name: row[nameIdx],
          quantity: isNaN(rawQty) ? 1 : rawQty,
          unitPrice: isNaN(rawPrice) ? 0 : rawPrice,
          category: (catIdx !== -1 && row[catIdx] !== undefined && row[catIdx].trim()) ? row[catIdx] : 'General',
          location: (locIdx !== -1 && row[locIdx] !== undefined && row[locIdx].trim()) ? row[locIdx] : 'General',
          completed: compIdx !== -1 && row[compIdx] ? row[compIdx].toLowerCase() === 'true' : false
        };
        const v = ReferenceValidation.validateItem(rawItem);
        if (v.valid) validItems.push(v.data);
      }
      return { success: true, items: validItems };
    } catch (e) {
      return { success: false, error: e.message, items: [] };
    }
  },

  _parseCSVLines(text) {
    const lines = [];
    let currentLine = [];
    let currentCell = '';
    let insideQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (insideQuotes) {
        if (char === '"' && nextChar === '"') {
          currentCell += '"';
          i++; // saltar quote escapado
        } else if (char === '"') {
          insideQuotes = false;
        } else {
          currentCell += char;
        }
      } else {
        if (char === '"') {
          insideQuotes = true;
        } else if (char === ',') {
          currentLine.push(currentCell);
          currentCell = '';
        } else if (char === '\r' && nextChar === '\n') {
          currentLine.push(currentCell);
          lines.push(currentLine);
          currentLine = [];
          currentCell = '';
          i++;
        } else if (char === '\n' || char === '\r') {
          currentLine.push(currentCell);
          lines.push(currentLine);
          currentLine = [];
          currentCell = '';
        } else {
          currentCell += char;
        }
      }
    }
    if (currentCell || currentLine.length > 0) {
      currentLine.push(currentCell);
      lines.push(currentLine);
    }
    return lines;
  }
};

// Oráculo de contraste de color WCAG AA (Luminancia relativa)
const ReferenceWCAG = {
  parseHexColor(hex) {
    let clean = hex.replace('#', '').trim();
    if (clean.length === 3) {
      clean = clean.split('').map(c => c + c).join('');
    }
    const num = parseInt(clean, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  },

  getLuminance({ r, g, b }) {
    const sRGB = [r / 255, g / 255, b / 255].map(v => {
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
  },

  getContrastRatio(colorA, colorB) {
    const lumA = this.getLuminance(typeof colorA === 'string' ? this.parseHexColor(colorA) : colorA);
    const lumB = this.getLuminance(typeof colorB === 'string' ? this.parseHexColor(colorB) : colorB);
    const brightest = Math.max(lumA, lumB);
    const darkest = Math.min(lumA, lumB);
    return (brightest + 0.05) / (darkest + 0.05);
  },

  isWcagAA(contrastRatio, isLargeText = false) {
    return contrastRatio >= (isLargeText ? 3.0 : 4.5);
  }
};

// Mapeo dinámico de módulos implementados o fallback a especificación
function loadAppModule(subpath) {
  const fullPath = path.join(ROOT_DIR, subpath);
  if (fs.existsSync(fullPath)) {
    try {
      return require(fullPath);
    } catch (e) {
      return null;
    }
  }
  return null;
}

module.exports = {
  ROOT_DIR,
  createTestEnvironment,
  ReferenceAnalytics,
  ReferenceValidation,
  ReferenceExportImport,
  ReferenceWCAG,
  loadAppModule
};
