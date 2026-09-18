/**
 * js/export-import.js
 * Módulo de Exportación e Importación de Listas en JSON v1.0 y CSV RFC 4180 con BOM UTF-8.
 * Compatible con UMD (Navegadores y Node.js).
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    const validation = require('./validation');
    module.exports = factory(validation);
  } else {
    const exports = factory(root.ShoppingValidation || root.ValidationModule);
    root.ShoppingExportImport = exports;
    root.ExportImportService = exports;
  }
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this), function (validationModule) {
  'use strict';

  function getValidator() {
    if (validationModule && typeof validationModule.validateItem === 'function') {
      return validationModule;
    }
    if (typeof window !== 'undefined' && window.ShoppingValidation) {
      return window.ShoppingValidation;
    }
    // Fallback defensivo
    return {
      validateItem: (raw) => ({
        isValid: !!(raw && raw.name),
        cleanData: {
          id: raw.id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          name: String(raw.name || '').trim(),
          quantity: Number(raw.quantity) || 1,
          unitPrice: Number(raw.unitPrice) || 0,
          category: String(raw.category || 'General').trim() || 'General',
          location: String(raw.location || 'General').trim() || 'General',
          completed: Boolean(raw.completed),
          timestamp: Number(raw.timestamp) || Date.now()
        }
      })
    };
  }

  /**
   * Genera el payload estructurado JSON v1.0 con metadatos.
   * @param {Array<Object>} items
   * @param {number} [budget=0]
   * @returns {string} JSON formateado
   */
  function exportJSON(items = [], budget = 0) {
    const payload = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      budget: Number(budget) || 0,
      items: (items || []).map(it => ({
        id: String(it.id || ''),
        name: String(it.name || ''),
        quantity: Number(it.quantity) || 1,
        unitPrice: Number(it.unitPrice) || 0,
        category: String(it.category || 'General'),
        location: String(it.location || 'General'),
        completed: Boolean(it.completed),
        timestamp: Number(it.timestamp || Date.now())
      }))
    };
    return JSON.stringify(payload, null, 2);
  }

  function _escapeCSVCell(val) {
    let str = String(val ?? '');
    // Restaurar comillas literales si provienen de entidades HTML para formato RFC 4180
    str = str.replace(/&quot;/g, '"');
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  /**
   * Genera un archivo CSV compatible con RFC 4180 e inicia con BOM UTF-8 (\uFEFF)
   * para apertura perfecta en Microsoft Excel y hojas de cálculo en cualquier idioma.
   * @param {Array<Object>} items
   * @returns {string} CSV con BOM
   */
  function exportCSV(items = []) {
    const BOM = '\uFEFF';
    const headers = ['id', 'name', 'quantity', 'unitPrice', 'category', 'location', 'completed', 'timestamp'];
    const rows = [headers.join(',')];

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const row = [
        _escapeCSVCell(it.id),
        _escapeCSVCell(it.name),
        it.quantity,
        it.unitPrice,
        _escapeCSVCell(it.category || 'General'),
        _escapeCSVCell(it.location || 'General'),
        it.completed ? 'true' : 'false',
        it.timestamp || Date.now()
      ];
      rows.push(row.join(','));
    }

    return BOM + rows.join('\r\n');
  }

  /**
   * Importa y valida una cadena JSON.
   * @param {string} jsonString
   * @returns {{ success: boolean, budget: number, items: Array<Object>, error?: string }}
   */
  function importJSON(jsonString) {
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

      const validator = getValidator();
      const validItems = [];

      for (let i = 0; i < data.items.length; i++) {
        const raw = data.items[i];
        const res = validator.validateItem(raw);
        if (res.isValid && res.cleanData) {
          validItems.push(res.cleanData);
        } else if (res.valid && res.data) {
          validItems.push(res.data);
        }
      }

      return {
        success: true,
        budget: Math.max(0, Number(data.budget) || 0),
        items: validItems
      };
    } catch (err) {
      return { success: false, error: err.message, items: [], budget: 0 };
    }
  }

  function _parseCSVLines(text) {
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
          i++; // Salta comilla escapada
        } else if (char === '"') {
          insideQuotes = false;
        } else {
          currentCell += char;
        }
      } else {
        if (char === '"') {
          insideQuotes = true;
        } else if (char === ',') {
          currentLine.push(currentCell.trim());
          currentCell = '';
        } else if (char === '\r' && nextChar === '\n') {
          currentLine.push(currentCell.trim());
          lines.push(currentLine);
          currentLine = [];
          currentCell = '';
          i++; // Salta \n
        } else if (char === '\n' || char === '\r') {
          currentLine.push(currentCell.trim());
          lines.push(currentLine);
          currentLine = [];
          currentCell = '';
        } else {
          currentCell += char;
        }
      }
    }

    if (currentCell.length > 0 || currentLine.length > 0) {
      currentLine.push(currentCell.trim());
      lines.push(currentLine);
    }

    return lines;
  }

  /**
   * Importa y parsea un archivo CSV con mapeo tolerante de columnas.
   * @param {string} csvString
   * @returns {{ success: boolean, items: Array<Object>, error?: string }}
   */
  function importCSV(csvString) {
    try {
      let content = csvString || '';
      if (content.startsWith('\uFEFF')) {
        content = content.slice(1);
      }

      const allLines = _parseCSVLines(content);
      const lines = allLines.filter(row => row.some(cell => cell.trim().length > 0));

      if (lines.length === 0 || lines.length < 2) {
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

      const validator = getValidator();
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

        const res = validator.validateItem(rawItem);
        if (res.isValid && res.cleanData) {
          validItems.push(res.cleanData);
        } else if (res.valid && res.data) {
          validItems.push(res.data);
        }
      }

      return { success: true, items: validItems };
    } catch (err) {
      return { success: false, error: err.message, items: [] };
    }
  }

  /**
   * Dispara la descarga de un archivo en el navegador del cliente.
   * @param {string} content
   * @param {string} fileName
   * @param {string} mimeType
   */
  function triggerDownload(content, fileName, mimeType = 'text/plain;charset=utf-8') {
    if (typeof window === 'undefined' || !window.Blob) return;

    const blob = new window.Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }, 100);
  }

  return {
    exportJSON,
    exportCSV,
    importJSON,
    importCSV,
    triggerDownload
  };
}));
