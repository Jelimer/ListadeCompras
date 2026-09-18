/**
 * js/validation.js
 * Módulo de Validación Estricta, Sanitización y Prevención de XSS para Lista de Compra | PRO.
 * Funciones puras, deterministas y 100% desacopladas del DOM.
 * 
 * Compatible con entornos UMD (Navegadores y Node.js).
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    root.ShoppingValidation = exports;
    root.ValidationModule = exports;
  }
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  /**
   * Parsea de manera tolerante números flotantes, admitiendo coma decimal hispana ("3,50" -> 3.5).
   * Rechaza valores no numéricos, NaN, Infinity y objetos.
   * 
   * @param {any} value
   * @returns {number} Número finito o NaN
   */
  function parseFlexibleNumber(value) {
    if (value === null || value === undefined || value === '') {
      return NaN;
    }
    if (typeof value === 'boolean') {
      return NaN;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : NaN;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return NaN;
      // Reemplazar coma por punto para notación decimal
      const sanitized = trimmed.replace(',', '.');
      const num = Number(sanitized);
      return Number.isFinite(num) ? num : NaN;
    }
    return NaN;
  }

  /**
   * Escapa caracteres HTML críticos para prevenir vulnerabilidades de inyección XSS.
   * Convierte &, <, >, ", ' en entidades HTML seguras.
   * 
   * @param {any} str
   * @returns {string} Cadena segura para interpolación HTML
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const stringVal = String(str);
    const escapeMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return stringVal.replace(/[&<>"']/g, char => escapeMap[char]);
  }

  /**
   * Limpia y recorta una cadena de texto, removiendo caracteres de control no imprimibles
   * y truncando a la longitud máxima especificada.
   * 
   * @param {any} str
   * @param {number} [maxLength=120]
   * @returns {string}
   */
  function sanitizeString(str, maxLength = 120) {
    if (typeof str !== 'string') {
      if (str === null || str === undefined) return '';
      str = String(str);
    }
    // Remover caracteres de control ASCII (0x00 a 0x1F y 0x7F a 0x9F)
    const cleaned = str.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
    return cleaned.length > maxLength ? cleaned.slice(0, maxLength).trim() : cleaned;
  }

  /**
   * Valida exhaustivamente los campos de un producto de la lista de compras.
   * 
   * @param {Object} rawInput - Datos crudos del formulario o importación
   * @param {Object} [options={}] - Opciones de tolerancia
   * @param {boolean} [options.allowEmptyQuantity=true] - Asigna 1 si la cantidad está vacía
   * @param {boolean} [options.allowEmptyPrice=true] - Asigna 0 si el precio está vacío
   * @returns {{ isValid: boolean, errors: string[], errorFields: Record<string, string>, cleanData?: Object }}
   */
  function validateItem(rawInput, options = {}) {
    const errors = [];
    const errorFields = {};

    if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
      return {
        isValid: false,
        errors: ['Los datos del producto son inválidos o no fueron proporcionados.'],
        errorFields: { general: 'Datos inválidos' }
      };
    }

    // --- 1. Nombre del Producto ---
    const rawName = rawInput.name;
    const sanitizedName = sanitizeString(rawName, 120);

    if (!sanitizedName || sanitizedName.length === 0) {
      const msg = 'El nombre del producto es obligatorio.';
      errors.push(msg);
      errorFields.name = msg;
    } else if (rawName && String(rawName).replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim().length > 120) {
      const msg = 'El nombre del producto no debe exceder los 120 caracteres.';
      errors.push(msg);
      errorFields.name = msg;
    }

    // --- 2. Cantidad ---
    const rawQty = rawInput.quantity;
    let parsedQty;

    const isQtyEmpty = rawQty === undefined || rawQty === null || (typeof rawQty === 'string' && rawQty.trim() === '');
    if (isQtyEmpty && options.allowEmptyQuantity !== false) {
      parsedQty = 1;
    } else {
      parsedQty = parseFlexibleNumber(rawQty);
    }

    if (Number.isNaN(parsedQty)) {
      const msg = 'La cantidad debe ser un número válido.';
      errors.push(msg);
      errorFields.quantity = msg;
    } else if (parsedQty <= 0) {
      const msg = 'La cantidad debe ser mayor a 0 (ej. 1, 2.5).';
      errors.push(msg);
      errorFields.quantity = msg;
    } else if (parsedQty > 99999) {
      const msg = 'La cantidad no puede superar las 99.999 unidades.';
      errors.push(msg);
      errorFields.quantity = msg;
    } else {
      const roundedQty = Math.round((parsedQty + Number.EPSILON) * 1000) / 1000;
      if (roundedQty <= 0) {
        const msg = 'La cantidad debe ser mayor a 0 (ej. 1, 2.5).';
        errors.push(msg);
        errorFields.quantity = msg;
      } else {
        parsedQty = roundedQty;
      }
    }

    // --- 3. Precio Unitario ---
    const rawPrice = rawInput.unitPrice;
    let parsedPrice;

    const isPriceEmpty = rawPrice === undefined || rawPrice === null || (typeof rawPrice === 'string' && rawPrice.trim() === '');
    if (isPriceEmpty && options.allowEmptyPrice !== false) {
      parsedPrice = 0;
    } else {
      parsedPrice = parseFlexibleNumber(rawPrice);
    }

    if (Number.isNaN(parsedPrice)) {
      const msg = 'El precio unitario debe ser un valor numérico válido.';
      errors.push(msg);
      errorFields.unitPrice = msg;
    } else if (parsedPrice < 0) {
      const msg = 'El precio unitario no puede ser negativo.';
      errors.push(msg);
      errorFields.unitPrice = msg;
    } else if (parsedPrice > 999999.99) {
      const msg = 'El precio unitario no puede exceder $999.999,99.';
      errors.push(msg);
      errorFields.unitPrice = msg;
    } else {
      parsedPrice = Math.round((parsedPrice + Number.EPSILON) * 100) / 100;
    }

    // --- 4. Ubicación / Tienda ---
    let location = sanitizeString(rawInput.location, 50);
    if (!location) {
      location = 'General';
    }

    // --- 5. Categoría ---
    let category = sanitizeString(rawInput.category, 50);
    if (!category) {
      category = 'General';
    }

    // --- 6. Estado Completado ---
    const completed = Boolean(rawInput.completed);

    const isValid = errors.length === 0;
    const cleanData = isValid ? {
      ...(rawInput.id ? { id: String(rawInput.id).trim() } : {}),
      name: sanitizedName,
      quantity: parsedQty,
      unitPrice: parsedPrice,
      location,
      category,
      completed
    } : undefined;

    return {
      isValid,
      errors,
      errorFields,
      cleanData
    };
  }

  /**
   * Valida el presupuesto mensual o general ingresado.
   * 
   * @param {any} rawBudget
   * @returns {{ isValid: boolean, errors: string[], errorFields: Record<string, string>, cleanData?: number }}
   */
  function validateBudget(rawBudget) {
    const errors = [];
    const errorFields = {};

    if (rawBudget === null || rawBudget === undefined || (typeof rawBudget === 'string' && rawBudget.trim() === '')) {
      return {
        isValid: true,
        errors: [],
        errorFields: {},
        cleanData: 0
      };
    }

    const parsed = parseFlexibleNumber(rawBudget);

    if (Number.isNaN(parsed)) {
      const msg = 'El presupuesto debe ser un número válido.';
      errors.push(msg);
      errorFields.budget = msg;
    } else if (parsed < 0) {
      const msg = 'El presupuesto no puede ser un número negativo.';
      errors.push(msg);
      errorFields.budget = msg;
    } else if (parsed > 10000000) {
      const msg = 'El presupuesto ingresado supera el límite admitido ($10.000.000).';
      errors.push(msg);
      errorFields.budget = msg;
    }

    const isValid = errors.length === 0;
    const cleanData = isValid ? Math.round((parsed + Number.EPSILON) * 100) / 100 : undefined;

    return {
      isValid,
      errors,
      errorFields,
      cleanData
    };
  }

  /**
   * Valida un lote completo de importación (JSON o array de ítems).
   * 
   * @param {any} rawPayload
   * @returns {{ isValid: boolean, errors: string[], errorFields: Record<string, string>, cleanData?: { items: Object[], budget?: number } }}
   */
  function validateImportPayload(rawPayload) {
    const errors = [];
    const errorFields = {};

    if (!rawPayload || typeof rawPayload !== 'object') {
      return {
        isValid: false,
        errors: ['El archivo no tiene un formato válido de datos.'],
        errorFields: { payload: 'Formato inválido' }
      };
    }

    let rawItems = [];
    let budget = 0;

    if (Array.isArray(rawPayload)) {
      rawItems = rawPayload;
    } else if (Array.isArray(rawPayload.items)) {
      rawItems = rawPayload.items;
      if (rawPayload.budget !== undefined) {
        const budgetValidation = validateBudget(rawPayload.budget);
        if (budgetValidation.isValid) {
          budget = budgetValidation.cleanData || 0;
        }
      }
    } else {
      return {
        isValid: false,
        errors: ['El archivo no contiene un listado de productos válido.'],
        errorFields: { items: 'Lista no encontrada' }
      };
    }

    if (rawItems.length === 0) {
      return {
        isValid: false,
        errors: ['El archivo no contiene ningún producto para importar.'],
        errorFields: { items: 'Lista vacía' }
      };
    }

    if (rawItems.length > 2000) {
      return {
        isValid: false,
        errors: ['El archivo contiene más de 2.000 productos, excediendo la capacidad recomendada.'],
        errorFields: { items: 'Límite excedido' }
      };
    }

    const cleanItems = [];
    const itemErrors = [];

    for (let i = 0; i < rawItems.length; i++) {
      const itemValidation = validateItem(rawItems[i]);
      if (!itemValidation.isValid) {
        itemErrors.push(`Fila ${i + 1} ("${rawItems[i]?.name || 'Sin nombre'}"): ${itemValidation.errors.join(', ')}`);
      } else {
        cleanItems.push(itemValidation.cleanData);
      }
    }

    if (itemErrors.length > 0) {
      return {
        isValid: false,
        errors: [
          `Se encontraron ${itemErrors.length} productos con errores de validación.`,
          ...itemErrors.slice(0, 5)
        ],
        errorFields: { items: `${itemErrors.length} errores en productos` }
      };
    }

    return {
      isValid: true,
      errors: [],
      errorFields: {},
      cleanData: {
        items: cleanItems,
        budget
      }
    };
  }

  return {
    parseFlexibleNumber,
    escapeHtml,
    sanitizeString,
    validateItem,
    validateBudget,
    validateImportPayload
  };
}));
