/**
 * js/storage.js
 * Capa de Persistencia y Almacenamiento Offline-First con Adaptador Opcional para Firebase.
 * Lista de Compra | PRO
 * 
 * Compatible con entornos UMD (Navegadores y Node.js).
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StorageService = factory();
  }
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  // --- CONSTANTES DE ALMACENAMIENTO ---
  const STORAGE_KEYS = {
    ITEMS: 'shopping_items',
    ITEMS_LEGACY: 'shoppingItems',
    BUDGET: 'budget',
    THEME: 'theme',
    LOCATION_ORDER: 'locationOrder',
    COLLAPSED_GROUPS: 'collapsedGroups'
  };

  // --- GENERADOR DE IDENTIFICADORES ÚNICOS ---
  function generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'item_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
  }

  // --- CONTROLADOR EN MEMORIA (FALLBACK SEGURO) ---
  class MemoryStorageDriver {
    constructor() {
      this._data = new Map();
    }
    getItem(key) {
      return this._data.has(key) ? this._data.get(key) : null;
    }
    setItem(key, value) {
      this._data.set(key, String(value));
    }
    removeItem(key) {
      this._data.delete(key);
    }
    clear() {
      this._data.clear();
    }
    get length() {
      return this._data.size;
    }
  }

  // --- DETECCIÓN DE DISPONIBILIDAD DE LOCALSTORAGE ---
  function createStorageDriver() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const probeKey = '__storage_probe__';
        window.localStorage.setItem(probeKey, '1');
        window.localStorage.removeItem(probeKey);
        return {
          driver: window.localStorage,
          type: 'localStorage'
        };
      }
    } catch (e) {
      // Modo incógnito estricto, directiva de seguridad o cuota excedida
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[StorageService] LocalStorage no disponible. Activando almacenamiento seguro en memoria.', e.message);
      }
    }
    return {
      driver: new MemoryStorageDriver(),
      type: 'memory'
    };
  }

  // --- NORMALIZADOR DEFENSIVO DE PRODUCTOS ---
  function normalizeItem(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const id = (raw.id && String(raw.id).trim()) || generateId();
    const name = (raw.name !== undefined && raw.name !== null && String(raw.name).trim()) || 'Sin nombre';

    // Cantidad: número finito > 0. Default: 1
    let rawQty = raw.quantity;
    if (typeof rawQty === 'string') {
      rawQty = rawQty.trim().replace(',', '.');
    }
    let quantity = Number(rawQty);
    if (isNaN(quantity) || !isFinite(quantity) || quantity <= 0) {
      quantity = 1;
    } else {
      const rounded = Math.round((quantity + Number.EPSILON) * 1000) / 1000;
      quantity = rounded > 0 ? rounded : 1;
    }

    // Precio unitario: número finito >= 0. Default: 0
    let rawPrice = raw.unitPrice;
    if (typeof rawPrice === 'string') {
      rawPrice = rawPrice.trim().replace(',', '.');
    }
    let unitPrice = Number(rawPrice);
    if (isNaN(unitPrice) || !isFinite(unitPrice) || unitPrice < 0) {
      unitPrice = 0;
    } else {
      unitPrice = Math.round((unitPrice + Number.EPSILON) * 100) / 100;
    }

    // Categoría y Ubicación: default 'General'
    const category = (raw.category && String(raw.category).trim()) || 'General';
    const location = (raw.location && String(raw.location).trim()) || 'General';
    const completed = Boolean(raw.completed);

    // Timestamp numérico en ms
    let timestamp = Number(raw.timestamp);
    if (isNaN(timestamp) || !isFinite(timestamp) || timestamp <= 0) {
      timestamp = Date.now();
    }

    let updatedAt = Number(raw.updatedAt);
    if (isNaN(updatedAt) || !isFinite(updatedAt) || updatedAt <= 0) {
      updatedAt = timestamp;
    }

    return {
      id,
      name,
      quantity,
      unitPrice,
      category,
      location,
      completed,
      timestamp,
      updatedAt
    };
  }

  // --- DETECCIÓN DE CONFIGURACIÓN REAL DE FIREBASE ---
  function isRealFirebaseConfig(config) {
    if (!config || typeof config !== 'object') return false;
    const apiKey = String(config.apiKey || '').trim();
    const projectId = String(config.projectId || '').trim();

    if (!apiKey || apiKey === 'dummy-api-key' || apiKey.toLowerCase().includes('dummy')) {
      return false;
    }
    if (!projectId || projectId === 'dummy-project' || projectId.toLowerCase().includes('dummy')) {
      return false;
    }
    return true;
  }

  // --- IMPLEMENTACIÓN DEL SERVICIO PRINCIPAL DE ALMACENAMIENTO ---
  class StorageServiceImpl {
    constructor(customDriver = null) {
      if (customDriver) {
        this._driver = customDriver;
        this._storageType = 'custom';
      } else {
        const { driver, type } = createStorageDriver();
        this._driver = driver;
        this._storageType = type;
      }

      this._memoryFallback = new MemoryStorageDriver();
      this._originalDriver = this._driver;
      this._isDegraded = false;
      this._firebaseDb = null;
      this._isFirebaseConfigured = false;
      this._firebaseUnsubscribe = null;
      this._remoteListeners = new Set();
      this._lastSyncTimestamp = null;

      // Intentar auto-inicialización segura si estamos en navegador
      this._tryAutoInitFirebase();

      // Escuchar eventos de conectividad en el navegador
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('online', () => this._onNetworkStatusChange(true));
        window.addEventListener('offline', () => this._onNetworkStatusChange(false));
      }
    }

    /**
     * Degrada permanentemente el servicio al almacenamiento seguro en memoria
     * cuando el driver primario (ej. LocalStorage) sufre agotamiento de cuota (QuotaExceededError).
     * Migra defensivamente las claves preexistentes del driver al fallback para asegurar
     * la continuidad total de datos (presupuesto, tema, grupos) en la sesión activa.
     */
    _degradeToMemory() {
      if (this._isDegraded) return;
      this._isDegraded = true;
      this._storageType = 'memory';

      // Migrar claves preexistentes conocidas del driver primario hacia memoryFallback
      if (this._originalDriver && this._originalDriver !== this._memoryFallback) {
        try {
          const knownKeys = Object.values(STORAGE_KEYS);
          for (const key of knownKeys) {
            // Solo migrar si la clave no fue ya escrita en el fallback
            if (this._memoryFallback.getItem(key) === null) {
              try {
                const existingVal = this._originalDriver.getItem(key);
                if (existingVal !== null && existingVal !== undefined) {
                  this._memoryFallback.setItem(key, String(existingVal));
                }
              } catch (_) {
                // Silencioso si el driver también falla al leer
              }
            }
          }
        } catch (_) {
          // Silencioso ante fallos inesperados de introspección
        }
      }

      // Conmutar el driver activo hacia el fallback en memoria
      this._driver = this._memoryFallback;
    }

    _safeGet(key, defaultValue = null) {
      // 1. Prioridad: Si la clave existe en el fallback en memoria (por fallo de cuota previo
      // o degradación activa), retornarla inmediatamente. Evita leer datos obsoletos o nulos
      // del driver persistente, dado que getItem() nunca lanza excepciones en navegadores.
      const fallbackVal = this._memoryFallback.getItem(key);
      if (fallbackVal !== null) {
        return fallbackVal;
      }

      // 2. Si no está en memoria, consultar el driver primario
      try {
        const val = this._driver.getItem(key);
        return val !== null ? val : defaultValue;
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`[StorageService] Error al leer clave "${key}":`, e.message);
        }
        return defaultValue;
      }
    }

    _safeSet(key, value) {
      const strVal = String(value);

      // Si el servicio ya degradó permanentemente a memoria, persistir directamente sin arrojar nuevas excepciones
      if (this._isDegraded) {
        this._memoryFallback.setItem(key, strVal);
        return;
      }

      try {
        this._driver.setItem(key, strVal);
        // Si la escritura en el driver tuvo éxito, limpiar cualquier residuo en memoria para esta clave
        this._memoryFallback.removeItem(key);
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`[StorageService] Error al escribir clave "${key}". Activando degradación a memoria:`, e.message);
        }
        // Respaldar inmediatamente el dato en memoria
        this._memoryFallback.setItem(key, strVal);
        // Activar la degradación permanente y migración en caliente
        this._degradeToMemory();
      }
    }

    _safeRemove(key) {
      // Eliminar siempre del fallback en memoria
      this._memoryFallback.removeItem(key);

      // Eliminar del driver primario si no estamos operando puramente en memoria
      if (this._driver !== this._memoryFallback) {
        try {
          this._driver.removeItem(key);
        } catch (e) {
          // Silencioso
        }
      }
      if (this._originalDriver && this._originalDriver !== this._memoryFallback && this._originalDriver !== this._driver) {
        try {
          this._originalDriver.removeItem(key);
        } catch (e) {
          // Silencioso
        }
      }
    }

    // ==========================================
    // GESTIÓN DE PRODUCTOS (F01 / F02)
    // ==========================================

    async loadItems() {
      let rawData = this._safeGet(STORAGE_KEYS.ITEMS, null);
      if (rawData === null) {
        // Buscar clave legacy si no existe la canónica
        rawData = this._safeGet(STORAGE_KEYS.ITEMS_LEGACY, null);
      }

      if (!rawData) return [];

      try {
        const parsed = JSON.parse(rawData);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(normalizeItem).filter(Boolean);
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[StorageService] Error al deserializar JSON de productos. Retornando array vacío.', e.message);
        }
        return [];
      }
    }

    async saveItems(items) {
      if (!Array.isArray(items)) return;
      const normalized = items.map(normalizeItem).filter(Boolean);
      const serialized = JSON.stringify(normalized);

      // Guardado local inmediato síncrono
      this._safeSet(STORAGE_KEYS.ITEMS, serialized);

      // Sincronización en segundo plano con Firebase (no bloqueante, nunca arroja excepciones no controladas)
      this._syncToFirebase(normalized).catch(err => {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[StorageService] Sincronización secundaria en segundo plano no completada:', err.message);
        }
      });
    }

    // ==========================================
    // PRESUPUESTO
    // ==========================================

    loadBudget() {
      const raw = this._safeGet(STORAGE_KEYS.BUDGET, '0');
      const parsed = parseFloat(raw);
      return isNaN(parsed) || !isFinite(parsed) || parsed < 0 ? 0 : parsed;
    }

    saveBudget(budget) {
      const val = Number(budget);
      const safeBudget = isNaN(val) || !isFinite(val) || val < 0 ? 0 : val;
      this._safeSet(STORAGE_KEYS.BUDGET, String(safeBudget));
    }

    // ==========================================
    // TEMA (MODO CLARO / OSCURO)
    // ==========================================

    loadTheme() {
      const theme = this._safeGet(STORAGE_KEYS.THEME, null);
      if (theme === 'dark' || theme === 'light') return theme;
      return null;
    }

    saveTheme(theme) {
      if (theme === 'dark' || theme === 'light') {
        this._safeSet(STORAGE_KEYS.THEME, theme);
      }
    }

    // ==========================================
    // PREFERENCIAS DE UI
    // ==========================================

    loadLocationOrder() {
      const raw = this._safeGet(STORAGE_KEYS.LOCATION_ORDER, null);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch (e) {
        return [];
      }
    }

    saveLocationOrder(order) {
      if (!Array.isArray(order)) return;
      this._safeSet(STORAGE_KEYS.LOCATION_ORDER, JSON.stringify(order.map(String)));
    }

    loadCollapsedGroups() {
      const raw = this._safeGet(STORAGE_KEYS.COLLAPSED_GROUPS, null);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch (e) {
        return [];
      }
    }

    saveCollapsedGroups(groups) {
      if (!Array.isArray(groups)) return;
      this._safeSet(STORAGE_KEYS.COLLAPSED_GROUPS, JSON.stringify(groups.map(String)));
    }

    // ==========================================
    // ESTADO DE SINCRONIZACIÓN Y CONECTIVIDAD
    // ==========================================

    getSyncStatus() {
      const isOnline = typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
        ? navigator.onLine
        : true;

      return {
        isFirebaseConfigured: this._isFirebaseConfigured,
        isOnline,
        storageType: this._isDegraded ? 'memory' : this._storageType,
        lastSyncTimestamp: this._lastSyncTimestamp,
        isDegraded: Boolean(this._isDegraded)
      };
    }

    isDegraded() {
      return Boolean(this._isDegraded);
    }

    // ==========================================
    // ADAPTADOR RESILIENTE DE FIREBASE (F02)
    // ==========================================

    _tryAutoInitFirebase() {
      try {
        if (typeof window === 'undefined' || !window.firebase) return;
        const config = window.firebaseConfig;
        if (isRealFirebaseConfig(config)) {
          this.initFirebase(config);
        }
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[StorageService] Auto-inicialización de Firebase omitida con seguridad:', e.message);
        }
      }
    }

    initFirebase(config) {
      if (!isRealFirebaseConfig(config)) {
        this._isFirebaseConfigured = false;
        return false;
      }

      try {
        if (typeof window === 'undefined' || !window.firebase) {
          this._isFirebaseConfigured = false;
          return false;
        }

        const firebase = window.firebase;
        let app;
        if (firebase.apps && firebase.apps.length > 0) {
          app = firebase.apps[0];
        } else {
          app = firebase.initializeApp(config);
        }

        this._firebaseDb = app.firestore();
        this._isFirebaseConfigured = true;

        if (typeof this._firebaseDb.enablePersistence === 'function') {
          this._firebaseDb.enablePersistence({ synchronizeTabs: true }).catch(() => {
            // Ignorar avisos de persistencia multiventana
          });
        }

        this._subscribeToFirebase();
        return true;
      } catch (err) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[StorageService] Error al inicializar Firebase. Operando 100% en modo local:', err.message);
        }
        this._isFirebaseConfigured = false;
        this._firebaseDb = null;
        return false;
      }
    }

    _subscribeToFirebase() {
      if (!this._firebaseDb) return;
      try {
        if (this._firebaseUnsubscribe) {
          this._firebaseUnsubscribe();
          this._firebaseUnsubscribe = null;
        }

        this._firebaseUnsubscribe = this._firebaseDb.collection('shoppingItems')
          .orderBy('timestamp', 'desc')
          .onSnapshot(
            snapshot => {
              if (!snapshot || !snapshot.docs) return;
              const remoteItems = snapshot.docs.map(doc => {
                const data = doc.data() || {};
                return normalizeItem({ id: doc.id, ...data });
              }).filter(Boolean);

              this._lastSyncTimestamp = Date.now();
              this._notifyRemoteChange(remoteItems);
            },
            error => {
              if (typeof console !== 'undefined' && console.warn) {
                console.warn('[StorageService] Listener de Firestore suspendido de forma controlada:', error.message);
              }
            }
          );
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[StorageService] Excepción al configurar listener onSnapshot:', e.message);
        }
      }
    }

    onRemoteItemsChange(callback) {
      if (typeof callback !== 'function') return () => {};
      this._remoteListeners.add(callback);
      return () => this._remoteListeners.delete(callback);
    }

    _notifyRemoteChange(items) {
      this._remoteListeners.forEach(cb => {
        try {
          cb(items);
        } catch (e) {
          if (typeof console !== 'undefined' && console.error) {
            console.error('[StorageService] Error en callback de suscriptor remoto:', e);
          }
        }
      });
    }

    async _syncToFirebase(items) {
      if (!this._isFirebaseConfigured || !this._firebaseDb) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;

      try {
        const batch = this._firebaseDb.batch();
        const collection = this._firebaseDb.collection('shoppingItems');

        items.forEach(item => {
          const docRef = collection.doc(item.id);
          batch.set(docRef, {
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            category: item.category,
            location: item.location,
            completed: item.completed,
            timestamp: item.timestamp,
            updatedAt: item.updatedAt || Date.now()
          }, { merge: true });
        });

        await batch.commit();
        this._lastSyncTimestamp = Date.now();
      } catch (err) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[StorageService] Error no bloqueante al sincronizar lote en Firebase:', err.message);
        }
      }
    }

    _onNetworkStatusChange(isOnline) {
      if (isOnline && this._isFirebaseConfigured) {
        this.loadItems().then(items => {
          this._syncToFirebase(items);
        });
      }
    }

    // ==========================================
    // REINICIO Y MANTENIMIENTO
    // ==========================================

    clearAll() {
      this._safeRemove(STORAGE_KEYS.ITEMS);
      this._safeRemove(STORAGE_KEYS.ITEMS_LEGACY);
      this._safeRemove(STORAGE_KEYS.BUDGET);
      this._safeRemove(STORAGE_KEYS.THEME);
      this._safeRemove(STORAGE_KEYS.LOCATION_ORDER);
      this._safeRemove(STORAGE_KEYS.COLLAPSED_GROUPS);
      this._memoryFallback.clear();
      if (this._driver && typeof this._driver.clear === 'function') {
        try { this._driver.clear(); } catch (_) {}
      }
      if (this._originalDriver && typeof this._originalDriver.clear === 'function' && this._originalDriver !== this._driver) {
        try { this._originalDriver.clear(); } catch (_) {}
      }
      this._lastSyncTimestamp = null;
    }
  }

  // Instancia Singleton expuesta por defecto
  const instance = new StorageServiceImpl();

  // Exportar clases y utilidades auxiliares
  instance.StorageService = instance;
  instance.StorageServiceImpl = StorageServiceImpl;
  instance.MemoryStorageDriver = MemoryStorageDriver;
  instance.normalizeItem = normalizeItem;
  instance.isRealFirebaseConfig = isRealFirebaseConfig;
  instance.STORAGE_KEYS = STORAGE_KEYS;

  return instance;
}));
