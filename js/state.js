/**
 * js/state.js
 * Store Reactivo Centralizado para Lista de Compra | PRO
 * Desacoplado 100% de DOM y de Firebase SDK.
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
    root.ShoppingStore = exports;
    root.ShoppingState = exports;
    root.Store = exports.Store;
  }
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  /**
   * Generador de identificador único robusto (UUID v4 o fallback alfanumérico)
   */
  function generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'item_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
  }

  /**
   * Clonador profundo para garantizar inmutabilidad
   */
  function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (Array.isArray(obj)) return obj.map(deepClone);
    const copy = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        copy[key] = deepClone(obj[key]);
      }
    }
    return copy;
  }

  /**
   * Normalizador de texto para búsquedas insensibles a mayúsculas y acentos
   */
  function normalizeSearchText(str) {
    return (str === null || str === undefined ? '' : str)
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  /**
   * Sanitiza y normaliza un producto para garantizar el contrato ShoppingItem
   */
  function sanitizeProduct(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const clean = deepClone(raw);
    if (!clean.id || typeof clean.id !== 'string') {
      clean.id = clean.id ? String(clean.id) : generateId();
    }
    const nameStr = (typeof clean.name === 'string') ? clean.name.trim() : (clean.name !== null && clean.name !== undefined ? String(clean.name).trim() : '');
    clean.name = nameStr || 'Sin nombre';

    const locStr = (typeof clean.location === 'string') ? clean.location.trim() : (clean.location !== null && clean.location !== undefined ? String(clean.location).trim() : '');
    clean.location = locStr || 'General';

    const catStr = (typeof clean.category === 'string') ? clean.category.trim() : (clean.category !== null && clean.category !== undefined ? String(clean.category).trim() : '');
    clean.category = catStr || 'General';

    let rawQty = clean.quantity;
    if (typeof rawQty === 'string') rawQty = rawQty.trim().replace(',', '.');
    let q = Number(rawQty);
    let parsedQty = (!isNaN(q) && isFinite(q) && q > 0) ? Math.round((q + Number.EPSILON) * 1000) / 1000 : 1;
    clean.quantity = parsedQty > 0 ? parsedQty : 1;

    let rawPrice = clean.unitPrice;
    if (typeof rawPrice === 'string') rawPrice = rawPrice.trim().replace(',', '.');
    let p = Number(rawPrice);
    clean.unitPrice = (!isNaN(p) && isFinite(p) && p >= 0) ? Math.round((p + Number.EPSILON) * 100) / 100 : 0;

    clean.completed = Boolean(clean.completed);
    clean.timestamp = (typeof clean.timestamp === 'number' && clean.timestamp > 0) ? clean.timestamp : Date.now();
    clean.updatedAt = (typeof clean.updatedAt === 'number' && clean.updatedAt > 0) ? clean.updatedAt : clean.timestamp;

    return clean;
  }

  class Store {
    /**
     * @param {Object|Array} initialState - Estado inicial de arranque o array directo de productos
     * @param {Object|null} storageService - Servicio opcional de persistencia inyectado
     */
    constructor(initialState = {}, storageService = null) {
      this.storageService = storageService;

      let initialItems = [];
      let rawFilter = {};
      let initialBudget = 0;
      let initialLocationOrder = [];
      let initialCollapsed = [];
      let initialEditingItemId = null;

      if (Array.isArray(initialState)) {
        initialItems = initialState;
      } else if (initialState && typeof initialState === 'object') {
        if (Array.isArray(initialState.items)) {
          initialItems = initialState.items;
        }
        rawFilter = initialState.filter || initialState.filters || {};
        if (typeof initialState.budget === 'number' && isFinite(initialState.budget) && initialState.budget >= 0) {
          initialBudget = Math.round((initialState.budget + Number.EPSILON) * 100) / 100;
        }
        if (initialState.editingItemId) initialEditingItemId = String(initialState.editingItemId);
        if (Array.isArray(initialState.locationOrder)) initialLocationOrder = [...initialState.locationOrder];
        if (Array.isArray(initialState.collapsedGroups)) initialCollapsed = [...initialState.collapsedGroups];
        if (initialState.uiPreferences && typeof initialState.uiPreferences === 'object') {
          if (Array.isArray(initialState.uiPreferences.locationOrder) && initialLocationOrder.length === 0) {
            initialLocationOrder = [...initialState.uiPreferences.locationOrder];
          }
          if (Array.isArray(initialState.uiPreferences.collapsedGroups) && initialCollapsed.length === 0) {
            initialCollapsed = [...initialState.uiPreferences.collapsedGroups];
          }
        }
      }

      const initialSearch = rawFilter.searchQuery !== undefined 
        ? rawFilter.searchQuery 
        : (rawFilter.search !== undefined ? rawFilter.search : '');
      const initialHide = Boolean(rawFilter.hideCompleted);

      const filterObj = {
        searchQuery: String(initialSearch || ''),
        search: String(initialSearch || ''),
        hideCompleted: initialHide
      };

      const uiPrefs = {
        locationOrder: initialLocationOrder,
        collapsedGroups: initialCollapsed
      };

      this.state = {
        items: initialItems.map(sanitizeProduct).filter(Boolean),
        budget: initialBudget,
        filter: filterObj,
        filters: filterObj,
        editingItemId: initialEditingItemId,
        locationOrder: initialLocationOrder,
        collapsedGroups: initialCollapsed,
        uiPreferences: uiPrefs
      };

      this.listeners = new Set();
      this.eventHandlers = new Map();
      this.undoStack = [];
      this.maxUndoSteps = 30;
    }

    // ==========================================
    // SISTEMA REACTIVO PUB / SUB
    // ==========================================

    /**
     * Suscripción global a cualquier mutación de estado.
     * @param {Function} listener (stateSnapshot, eventName, eventData) => void
     * @returns {Function} Función desuscriptora
     */
    subscribe(listener) {
      if (typeof listener !== 'function') {
        throw new TypeError('El listener debe ser una función.');
      }
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    /**
     * Suscripción a un evento específico.
     * @param {string} event - Nombre del evento
     * @param {Function} handler (eventData, stateSnapshot) => void
     * @returns {Function} Función desuscriptora
     */
    on(event, handler) {
      if (typeof handler !== 'function') {
        throw new TypeError('El handler debe ser una función.');
      }
      if (!this.eventHandlers.has(event)) {
        this.eventHandlers.set(event, new Set());
      }
      this.eventHandlers.get(event).add(handler);
      return () => {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
          handlers.delete(handler);
        }
      };
    }

    /**
     * Emite un evento a suscriptores específicos y globales de forma protegida.
     */
    _emit(event, data = {}) {
      const stateSnapshot = this.getState();

      // Suscriptores de evento puntual
      if (this.eventHandlers.has(event)) {
        this.eventHandlers.get(event).forEach(handler => {
          try {
            handler(data, stateSnapshot);
          } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
              console.error(`[Store] Error en handler del evento "${event}":`, err);
            }
          }
        });
      }

      // Suscriptores globales
      this.listeners.forEach(listener => {
        try {
          listener(stateSnapshot, event, data);
        } catch (err) {
          if (typeof console !== 'undefined' && console.error) {
            console.error('[Store] Error en listener global:', err);
          }
        }
      });
    }

    // ==========================================
    // PERSISTENCIA DEFENSIVA
    // ==========================================

    _persistItems() {
      if (this.storageService && typeof this.storageService.saveItems === 'function') {
        try {
          this.storageService.saveItems(this.state.items);
        } catch (e) {
          if (typeof console !== 'undefined' && console.error) {
            console.error('[Store] Error al persistir productos:', e);
          }
        }
      }
    }

    _persistBudget() {
      if (this.storageService && typeof this.storageService.saveBudget === 'function') {
        try {
          this.storageService.saveBudget(this.state.budget);
        } catch (e) {
          if (typeof console !== 'undefined' && console.error) {
            console.error('[Store] Error al persistir presupuesto:', e);
          }
        }
      }
    }

    _persistLocations() {
      if (this.storageService && typeof this.storageService.saveLocationOrder === 'function') {
        try {
          this.storageService.saveLocationOrder(this.state.locationOrder);
        } catch (e) {
          if (typeof console !== 'undefined' && console.error) {
            console.error('[Store] Error al persistir orden de ubicaciones:', e);
          }
        }
      }
    }

    _persistCollapsedGroups() {
      if (this.storageService && typeof this.storageService.saveCollapsedGroups === 'function') {
        try {
          this.storageService.saveCollapsedGroups(this.state.collapsedGroups);
        } catch (e) {
          if (typeof console !== 'undefined' && console.error) {
            console.error('[Store] Error al persistir grupos colapsados:', e);
          }
        }
      }
    }

    // ==========================================
    // CONSULTAS Y SELECTORES INMUTABLES
    // ==========================================

    getState() {
      return deepClone(this.state);
    }

    getItems() {
      return deepClone(this.state.items);
    }

    getItemById(id) {
      if (!id) return null;
      const item = this.state.items.find(i => i.id === id);
      return item ? deepClone(item) : null;
    }

    getBudget() {
      return this.state.budget;
    }

    getFilter() {
      return { ...this.state.filter };
    }

    getFilters() {
      return { ...(this.state.filters || this.state.filter) };
    }

    getEditingItem() {
      if (!this.state.editingItemId) return null;
      return this.getItemById(this.state.editingItemId);
    }

    getFilteredItems() {
      const activeFilter = this.state.filter || this.state.filters || {};
      const query = normalizeSearchText(activeFilter.searchQuery || activeFilter.search || '');
      const hideCompleted = Boolean(activeFilter.hideCompleted);

      const tokens = query ? query.split(/\s+/).filter(Boolean) : [];

      return this.state.items
        .filter(item => {
          if (hideCompleted && item.completed) return false;
          if (tokens.length === 0) return true;
          const searchHaystack = normalizeSearchText(`${item.name || ''} ${item.location || ''} ${item.category || ''}`);
          return tokens.every(token => searchHaystack.includes(token));
        })
        .map(deepClone);
    }

    getGroupedItems() {
      const filtered = this.getFilteredItems();
      const grouped = {};

      filtered.forEach(item => {
        const loc = item.location || 'General';
        if (!grouped[loc]) grouped[loc] = [];
        grouped[loc].push(item);
      });

      // Ordenar productos dentro de cada ubicación: pendientes primero, luego por nombre
      Object.keys(grouped).forEach(loc => {
        grouped[loc].sort((a, b) => {
          if (a.completed !== b.completed) return a.completed ? 1 : -1;
          return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
        });
      });

      // Ordenar grupos según locationOrder
      const order = this.state.locationOrder || [];
      const sortedLocations = Object.keys(grouped).sort((a, b) => {
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        if (ia === -1 && ib === -1) return a.localeCompare(b, 'es', { sensitivity: 'base' });
        return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
      });

      const result = {};
      sortedLocations.forEach(loc => {
        result[loc] = grouped[loc];
      });
      return result;
    }

    getDistinctCategories() {
      const set = new Set();
      this.state.items.forEach(i => {
        if (i.category && String(i.category).trim()) {
          set.add(String(i.category).trim());
        }
      });
      return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    }

    getDistinctLocations() {
      const set = new Set();
      this.state.items.forEach(i => {
        if (i.location && String(i.location).trim()) {
          set.add(String(i.location).trim());
        }
      });
      return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    }

    // ==========================================
    // MOTOR DE DESHACER (UNDO ENGINE - F20)
    // ==========================================

    _pushUndo(action) {
      this.undoStack.push(action);
      if (this.undoStack.length > this.maxUndoSteps) {
        this.undoStack.shift();
      }
    }

    canUndo() {
      return this.undoStack.length > 0;
    }

    getLastUndoAction() {
      return this.undoStack.length > 0 ? deepClone(this.undoStack[this.undoStack.length - 1]) : null;
    }

    undoLastAction() {
      if (this.undoStack.length === 0) {
        return { success: false, reason: 'Pila de deshacer vacía' };
      }

      const action = this.undoStack.pop();

      switch (action.type) {
        case 'ADD_ITEM':
          // Reversión: eliminar el ítem añadido
          this.state.items = this.state.items.filter(i => i.id !== action.payload.id);
          break;

        case 'DELETE_ITEM': {
          // Reversión: reinsertar en el índice exacto original
          const restored = deepClone(action.payload.item);
          const index = typeof action.payload.index === 'number' && action.payload.index <= this.state.items.length
            ? action.payload.index
            : this.state.items.length;
          this.state.items.splice(index, 0, restored);
          break;
        }

        case 'UPDATE_ITEM':
          // Reversión: restaurar versión anterior del ítem
          this.state.items = this.state.items.map(i =>
            i.id === action.payload.previousItem.id ? deepClone(action.payload.previousItem) : i
          );
          break;

        case 'TOGGLE_COMPLETED':
          // Reversión: restaurar valor completed anterior
          this.state.items = this.state.items.map(i =>
            i.id === action.payload.id ? { ...i, completed: action.payload.previousCompleted, updatedAt: Date.now() } : i
          );
          break;

        case 'CLEAR_COMPLETED':
          // Reversión: restaurar todos los productos eliminados
          this.state.items = [...this.state.items, ...deepClone(action.payload.items)];
          break;

        default:
          return { success: false, reason: 'Tipo de acción de deshacer no reconocido' };
      }

      this._persistItems();
      this._emit('items:changed', { items: this.getItems(), action: 'undo' });
      this._emit('undo:performed', { action, state: this.getState() });
      this._emit('state:changed', { state: this.getState() });

      return { success: true, action };
    }

    // ==========================================
    // ACCIONES MUTADORAS
    // ==========================================

    addItem(itemData = {}) {
      const id = (itemData.id && String(itemData.id).trim()) || generateId();
      const name = (itemData.name !== undefined && itemData.name !== null && String(itemData.name).trim()) || 'Sin nombre';

      let rawQty = itemData.quantity;
      if (typeof rawQty === 'string') rawQty = rawQty.trim().replace(',', '.');
      let quantity = Number(rawQty);
      if (isNaN(quantity) || !isFinite(quantity) || quantity <= 0) {
        quantity = 1;
      } else {
        const rounded = Math.round((quantity + Number.EPSILON) * 1000) / 1000;
        quantity = rounded > 0 ? rounded : 1;
      }

      let rawPrice = itemData.unitPrice;
      if (typeof rawPrice === 'string') rawPrice = rawPrice.trim().replace(',', '.');
      let unitPrice = Number(rawPrice);
      if (isNaN(unitPrice) || !isFinite(unitPrice) || unitPrice < 0) {
        unitPrice = 0;
      } else {
        unitPrice = Math.round((unitPrice + Number.EPSILON) * 100) / 100;
      }

      const location = (itemData.location && String(itemData.location).trim()) || 'General';
      const category = (itemData.category && String(itemData.category).trim()) || 'General';
      const completed = Boolean(itemData.completed);
      const timestamp = (typeof itemData.timestamp === 'number' && itemData.timestamp > 0) ? itemData.timestamp : Date.now();
      const updatedAt = (typeof itemData.updatedAt === 'number' && itemData.updatedAt > 0) ? itemData.updatedAt : timestamp;

      const newItem = {
        id,
        name,
        quantity,
        unitPrice,
        location,
        category,
        completed,
        timestamp,
        updatedAt
      };

      this.state.items = [newItem, ...this.state.items];

      this._pushUndo({
        type: 'ADD_ITEM',
        timestamp: Date.now(),
        payload: { id: newItem.id },
        description: `Se añadió "${newItem.name}"`
      });

      this._persistItems();
      this._emit('item:added', { item: deepClone(newItem) });
      this._emit('items:changed', { items: this.getItems(), action: 'add' });
      this._emit('state:changed', { state: this.getState() });

      return deepClone(newItem);
    }

    updateItem(id, itemData = {}) {
      if (!id) return null;
      const index = this.state.items.findIndex(i => i.id === id);
      if (index === -1) return null;

      const previousItem = deepClone(this.state.items[index]);

      let quantity = previousItem.quantity;
      if (itemData.quantity !== undefined && itemData.quantity !== null) {
        let rawQ = typeof itemData.quantity === 'string' ? itemData.quantity.trim().replace(',', '.') : itemData.quantity;
        const parsed = Number(rawQ);
        if (!isNaN(parsed) && isFinite(parsed) && parsed > 0) {
          const rounded = Math.round((parsed + Number.EPSILON) * 1000) / 1000;
          quantity = rounded > 0 ? rounded : 1;
        } else {
          quantity = 1;
        }
      }

      let unitPrice = previousItem.unitPrice;
      if (itemData.unitPrice !== undefined && itemData.unitPrice !== null) {
        let rawP = typeof itemData.unitPrice === 'string' ? itemData.unitPrice.trim().replace(',', '.') : itemData.unitPrice;
        const parsed = Number(rawP);
        unitPrice = (!isNaN(parsed) && isFinite(parsed) && parsed >= 0)
          ? Math.round((parsed + Number.EPSILON) * 100) / 100
          : 0;
      }

      const updatedItem = {
        ...previousItem,
        ...(itemData.name !== undefined && { name: String(itemData.name).trim() || previousItem.name }),
        quantity,
        unitPrice,
        ...(itemData.location !== undefined && { location: String(itemData.location).trim() || 'General' }),
        ...(itemData.category !== undefined && { category: String(itemData.category).trim() || 'General' }),
        ...(itemData.completed !== undefined && { completed: Boolean(itemData.completed) }),
        updatedAt: Date.now()
      };

      this.state.items[index] = updatedItem;

      this._pushUndo({
        type: 'UPDATE_ITEM',
        timestamp: Date.now(),
        payload: { previousItem },
        description: `Se actualizó "${updatedItem.name}"`
      });

      this._persistItems();
      this._emit('item:updated', { item: deepClone(updatedItem), oldItem: previousItem });
      this._emit('items:changed', { items: this.getItems(), action: 'update' });
      this._emit('state:changed', { state: this.getState() });

      return deepClone(updatedItem);
    }

    deleteItem(id) {
      if (!id) return null;
      const index = this.state.items.findIndex(i => i.id === id);
      if (index === -1) return null;

      const deletedItem = deepClone(this.state.items[index]);
      this.state.items.splice(index, 1);

      if (this.state.editingItemId === id) {
        this.state.editingItemId = null;
        this._emit('editing:changed', { editingItemId: null, item: null });
      }

      this._pushUndo({
        type: 'DELETE_ITEM',
        timestamp: Date.now(),
        payload: { item: deletedItem, index },
        description: `Se eliminó "${deletedItem.name}"`
      });

      this._persistItems();
      this._emit('item:deleted', { id, item: deletedItem });
      this._emit('items:changed', { items: this.getItems(), action: 'delete' });
      this._emit('state:changed', { state: this.getState() });

      return deletedItem;
    }

    toggleCompleted(id) {
      if (!id) return null;
      const index = this.state.items.findIndex(i => i.id === id);
      if (index === -1) return null;

      const previousCompleted = this.state.items[index].completed;
      this.state.items[index].completed = !previousCompleted;
      this.state.items[index].updatedAt = Date.now();

      const updated = deepClone(this.state.items[index]);

      this._pushUndo({
        type: 'TOGGLE_COMPLETED',
        timestamp: Date.now(),
        payload: { id, previousCompleted },
        description: previousCompleted ? `Marcado como pendiente: "${updated.name}"` : `Comprado: "${updated.name}"`
      });

      this._persistItems();
      this._emit('item:updated', { item: updated });
      this._emit('items:changed', { items: this.getItems(), action: 'toggle' });
      this._emit('state:changed', { state: this.getState() });

      return updated;
    }

    clearCompleted() {
      const completed = this.state.items.filter(i => i.completed);
      if (completed.length === 0) return [];

      const remaining = this.state.items.filter(i => !i.completed);
      this.state.items = remaining;

      this._pushUndo({
        type: 'CLEAR_COMPLETED',
        timestamp: Date.now(),
        payload: { items: deepClone(completed) },
        description: `Se limpiaron ${completed.length} productos comprados`
      });

      this._persistItems();
      this._emit('items:changed', { items: this.getItems(), action: 'clearCompleted' });
      this._emit('state:changed', { state: this.getState() });

      return deepClone(completed);
    }

    setBudget(amount) {
      const parsed = parseFloat(amount);
      const budget = (isNaN(parsed) || !isFinite(parsed) || parsed < 0)
        ? 0
        : Math.round((parsed + Number.EPSILON) * 100) / 100;

      this.state.budget = budget;

      this._persistBudget();
      this._emit('budget:changed', { budget });
      this._emit('state:changed', { state: this.getState() });

      return budget;
    }

    setFilter(filterData = {}) {
      if (!filterData || typeof filterData !== 'object') return;

      let nextSearch = undefined;
      if (filterData.searchQuery !== undefined) {
        nextSearch = filterData.searchQuery === null ? '' : String(filterData.searchQuery);
      } else if (filterData.search !== undefined) {
        nextSearch = filterData.search === null ? '' : String(filterData.search);
      }

      if (nextSearch !== undefined) {
        this.state.filter.searchQuery = nextSearch;
        this.state.filter.search = nextSearch;
        if (this.state.filters) {
          this.state.filters.searchQuery = nextSearch;
          this.state.filters.search = nextSearch;
        }
      }

      if (filterData.hideCompleted !== undefined) {
        const hide = Boolean(filterData.hideCompleted);
        this.state.filter.hideCompleted = hide;
        if (this.state.filters) {
          this.state.filters.hideCompleted = hide;
        }
      }

      const filterSnapshot = { ...this.state.filter };
      this._emit('filter:changed', { filter: filterSnapshot, filters: filterSnapshot });
      this._emit('state:changed', { state: this.getState() });
    }

    setEditingItem(id) {
      const safeId = id ? String(id) : null;
      this.state.editingItemId = safeId;
      const item = safeId ? this.getItemById(safeId) : null;
      this._emit('editing:changed', { editingItemId: safeId, item });
      this._emit('state:changed', { state: this.getState() });
    }

    reorderLocations(newOrder) {
      if (!Array.isArray(newOrder)) return;
      this.state.locationOrder = [...newOrder.map(String)];
      if (this.state.uiPreferences) {
        this.state.uiPreferences.locationOrder = this.state.locationOrder;
      }
      this._persistLocations();
      this._emit('locations:reordered', { locationOrder: this.state.locationOrder });
      this._emit('state:changed', { state: this.getState() });
    }

    toggleGroupCollapse(location) {
      const target = String(location || 'General');
      const set = new Set(this.state.collapsedGroups);
      let isCollapsed = false;

      if (set.has(target)) {
        set.delete(target);
      } else {
        set.add(target);
        isCollapsed = true;
      }

      this.state.collapsedGroups = Array.from(set);
      if (this.state.uiPreferences) {
        this.state.uiPreferences.collapsedGroups = this.state.collapsedGroups;
      }
      this._persistCollapsedGroups();
      this._emit('group:toggled', { location: target, isCollapsed });
      this._emit('state:changed', { state: this.getState() });
      return isCollapsed;
    }

    // ==========================================
    // HIDRATACIÓN MASIVA (IMPORTACIÓN / STORAGE)
    // ==========================================

    hydrate(data = {}) {
      if (!data || typeof data !== 'object') return;

      let itemsToHydrate = null;
      if (Array.isArray(data)) {
        itemsToHydrate = data;
      } else if (typeof data === 'object' && Array.isArray(data.items)) {
        itemsToHydrate = data.items;
      }

      if (itemsToHydrate !== null) {
        this.state.items = itemsToHydrate.map(sanitizeProduct).filter(Boolean);
      }

      if (typeof data === 'object' && !Array.isArray(data)) {
        if (typeof data.budget === 'number' && isFinite(data.budget) && data.budget >= 0) {
          this.state.budget = Math.round((data.budget + Number.EPSILON) * 100) / 100;
        }
        if (Array.isArray(data.locationOrder)) {
          this.state.locationOrder = [...data.locationOrder.map(String)];
          if (this.state.uiPreferences) {
            this.state.uiPreferences.locationOrder = this.state.locationOrder;
          }
        }
        if (Array.isArray(data.collapsedGroups)) {
          this.state.collapsedGroups = [...data.collapsedGroups.map(String)];
          if (this.state.uiPreferences) {
            this.state.uiPreferences.collapsedGroups = this.state.collapsedGroups;
          }
        }
        if (data.uiPreferences && typeof data.uiPreferences === 'object') {
          if (Array.isArray(data.uiPreferences.locationOrder)) {
            this.state.locationOrder = [...data.uiPreferences.locationOrder.map(String)];
            if (this.state.uiPreferences) {
              this.state.uiPreferences.locationOrder = this.state.locationOrder;
            }
          }
          if (Array.isArray(data.uiPreferences.collapsedGroups)) {
            this.state.collapsedGroups = [...data.uiPreferences.collapsedGroups.map(String)];
            if (this.state.uiPreferences) {
              this.state.uiPreferences.collapsedGroups = this.state.collapsedGroups;
            }
          }
        }
      }

      this._persistItems();
      this._persistBudget();
      this._emit('items:changed', { items: this.getItems(), action: 'hydrate' });
      this._emit('budget:changed', { budget: this.state.budget });
      this._emit('state:changed', { state: this.getState() });
    }

    async loadFromStorage() {
      if (!this.storageService) return;
      try {
        const items = (typeof this.storageService.loadItems === 'function')
          ? await this.storageService.loadItems()
          : [];
        const budget = (typeof this.storageService.loadBudget === 'function')
          ? this.storageService.loadBudget()
          : 0;
        const locationOrder = (typeof this.storageService.loadLocationOrder === 'function')
          ? this.storageService.loadLocationOrder()
          : [];
        const collapsedGroups = (typeof this.storageService.loadCollapsedGroups === 'function')
          ? this.storageService.loadCollapsedGroups()
          : [];

        this.hydrate({
          items: Array.isArray(items) ? items : [],
          budget: typeof budget === 'number' ? budget : 0,
          locationOrder: Array.isArray(locationOrder) ? locationOrder : [],
          collapsedGroups: Array.isArray(collapsedGroups) ? collapsedGroups : []
        });
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[Store] Error al hidratar estado desde storageService:', err);
        }
      }
    }
  }

  function createStore(initialState = {}, storageService = null) {
    return new Store(initialState, storageService);
  }

  // Instancia singleton por defecto
  const defaultStore = new Store();

  return {
    Store,
    createStore,
    store: defaultStore,
    generateId,
    deepClone
  };
}));
