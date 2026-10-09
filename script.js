/**
 * script.js
 * Orquestador Principal y Controlador de UI para Lista de Compra | PRO.
 * Integración bidireccional en tiempo real con Firebase Firestore + Resiliencia Offline-First.
 */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // --- 1. Referencias al DOM ---
  const elements = {
    itemInput: document.getElementById('itemInput'),
    quantityInput: document.getElementById('quantityInput'),
    unitPriceInput: document.getElementById('unitPriceInput'),
    locationInput: document.getElementById('locationInput'),
    categoryInput: document.getElementById('categoryInput'),
    addItemButton: document.getElementById('addItemButton'),
    locationSuggestions: document.getElementById('location-suggestions'),
    categorySuggestions: document.getElementById('category-suggestions'),
    searchInput: document.getElementById('searchInput'),
    hideCompletedSwitch: document.getElementById('hideCompletedSwitch'),
    themeToggle: document.getElementById('themeToggle'),
    shareButton: document.getElementById('shareButton'),
    printButton: document.getElementById('printButton'),
    printListSummary: document.getElementById('printListSummary'),
    printGrandTotalValue: document.getElementById('printGrandTotalValue'),
    exportButton: document.getElementById('exportButton'),
    importButton: document.getElementById('importButton'),
    importFileInput: document.getElementById('importFileInput'),
    budgetInput: document.getElementById('budgetInput'),
    budgetProgressBar: document.getElementById('budgetProgressBar'),
    budgetStats: document.getElementById('budgetStats'),
    grandTotalValue: document.getElementById('grandTotalValue'),
    resetListButton: document.getElementById('resetListButton'),
    shoppingListContainer: document.getElementById('shoppingListContainer'),

    // Selector de Vistas y Paneles WAI-ARIA
    tabList: document.getElementById('tab-list'),
    tabStats: document.getElementById('tab-stats'),
    tabMap: document.getElementById('tab-map'),
    bottomTabList: document.getElementById('bottom-tab-list'),
    bottomTabStats: document.getElementById('bottom-tab-stats'),
    bottomTabMap: document.getElementById('bottom-tab-map'),
    panelList: document.getElementById('panel-list'),
    panelStats: document.getElementById('panel-stats'),
    panelMap: document.getElementById('panel-map'),
    ariaAnnouncer: document.getElementById('ariaAnnouncer'),

    // Controles y Tarjeta de Resumen de Ruta
    mapContainer: document.getElementById('map-container'),
    manualOriginInput: document.getElementById('manual-origin-input'),
    btnSetManualOrigin: document.getElementById('btn-set-manual-origin'),
    btnGpsOrigin: document.getElementById('btn-gps-origin'),
    routeSummaryCard: document.getElementById('route-summary-card'),
    routeDistance: document.getElementById('route-distance'),
    routeDuration: document.getElementById('route-duration'),
    routeStops: document.getElementById('route-stops'),
    btnOpenGoogleMaps: document.getElementById('btn-open-google-maps'),
    routeStopsList: document.getElementById('route-stops-list'),
    btnResetRouteOrder: document.getElementById('btn-reset-route-order'),
    btnMapZoomIn: document.getElementById('btn-map-zoom-in'),
    btnMapZoomOut: document.getElementById('btn-map-zoom-out'),
    btnMapFitBounds: document.getElementById('btn-map-fit-bounds'),

    // Gestor de Viajes de Compra
    tripsCard: document.querySelector('.trips-card'),
    tripSelect: document.getElementById('trip-select'),
    btnNewTrip: document.getElementById('btn-new-trip'),
    btnRenameTrip: document.getElementById('btn-rename-trip'),
    btnDeleteTrip: document.getElementById('btn-delete-trip'),
    tripIncludedCount: document.getElementById('trip-included-count'),
    btnSelectAllTripStops: document.getElementById('btn-select-all-trip-stops'),
    btnDeselectAllTripStops: document.getElementById('btn-deselect-all-trip-stops'),

    // Banner de Selección Directa en Mapa
    mapPickerBanner: document.getElementById('map-picker-banner'),
    mapPickerStoreName: document.getElementById('map-picker-store-name'),
    btnCancelMapPicker: document.getElementById('btn-cancel-map-picker'),

    // Modal de Edición de Ubicación
    modalEditStoreLocation: document.getElementById('modal-edit-store-location'),
    modalStoreTitle: document.getElementById('modal-store-title'),
    inputStoreAddress: document.getElementById('input-store-address'),
    modalCurrentCoordsText: document.getElementById('modal-current-coords-text'),
    btnSearchStoreAddress: document.getElementById('btn-search-store-address'),
    btnPickOnMapFromModal: document.getElementById('btn-pick-on-map-from-modal'),
    btnResetStoreLocation: document.getElementById('btn-reset-store-location'),
    btnCloseStoreModal: document.getElementById('btn-close-store-modal'),
    btnCancelStoreModal: document.getElementById('btn-cancel-store-modal'),

    container: document.querySelector('.container')
  };

  // --- 2. Acceso a Módulos Auxiliares (Soporte Navegador y Runner Node.js) ---
  function safeRequire(filename) {
    if (typeof require !== 'function') return null;
    const candidates = [
      `./js/${filename}`,
      `../js/${filename}`
    ];
    try {
      if (typeof process !== 'undefined' && process.cwd) {
        const pathModule = require('path');
        candidates.push(pathModule.resolve(process.cwd(), 'js', filename));
      }
    } catch (_) {}
    for (const cand of candidates) {
      try {
        const mod = require(cand);
        if (mod) return mod;
      } catch (_) {}
    }
    return null;
  }

  const ValidationModule = window.ShoppingValidation || window.ValidationModule || (typeof global !== 'undefined' && (global.ShoppingValidation || global.ValidationModule)) || safeRequire('validation.js') || {};
  const AvatarsModule = window.ShoppingAvatars || (typeof global !== 'undefined' && global.ShoppingAvatars) || safeRequire('avatars.js') || {};
  const AnalyticsModule = window.ShoppingAnalytics || window.AnalyticsService || (typeof global !== 'undefined' && (global.ShoppingAnalytics || global.AnalyticsService)) || safeRequire('analytics.js') || {};
  const ChartModule = window.ShoppingChart || (typeof global !== 'undefined' && global.ShoppingChart) || safeRequire('chart.js') || {};
  const ExportImportModule = window.ShoppingExportImport || window.ExportImportService || (typeof global !== 'undefined' && (global.ShoppingExportImport || global.ExportImportService)) || safeRequire('export-import.js') || {};
  const FeedbackModule = window.ShoppingFeedback || window.UIFeedback || (typeof global !== 'undefined' && (global.ShoppingFeedback || global.UIFeedback)) || safeRequire('ui-feedback.js') || {};
  const ShareModule = (typeof window !== 'undefined' && (window.ShoppingShare || window.ShareModule)) || (typeof global !== 'undefined' && (global.ShoppingShare || global.ShareModule)) || safeRequire('share.js') || {};

  function getShareModule() {
    if (typeof window !== 'undefined' && (window.ShoppingShare || window.ShareModule)) {
      return window.ShoppingShare || window.ShareModule;
    }
    if (typeof global !== 'undefined' && (global.ShoppingShare || global.ShareModule)) {
      return global.ShoppingShare || global.ShareModule;
    }
    if (ShareModule && (typeof ShareModule.shareList === 'function' || typeof ShareModule.formatShoppingList === 'function')) {
      return ShareModule;
    }
    const req = safeRequire('share.js');
    if (req) return req;
    return null;
  }
  const stateReq = safeRequire('state.js');
  const StoreClass = window.Store || (window.ShoppingStore && window.ShoppingStore.Store) || (window.ShoppingState && window.ShoppingState.Store) || (typeof global !== 'undefined' && (global.Store || (global.ShoppingStore && global.ShoppingStore.Store) || (global.ShoppingState && global.ShoppingState.Store))) || (stateReq && (stateReq.Store || stateReq)) || null;
  const MapRouteService = (typeof window !== 'undefined' && (window.MapRouteService || window.MapRoute)) || (typeof global !== 'undefined' && (global.MapRouteService || global.MapRoute)) || safeRequire('map-route.js') || {};

  function normalizeSearchText(str) {
    return String(str === null || str === undefined ? '' : str)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  // --- 2.1. Estado de Navegación Reactiva y Dirty Flags (R1) ---
  let currentView = 'list';
  let listDirty = false;
  let statsDirty = true;
  let mapDirty = true;

  // --- 2.2. Funciones de Navegación y Conmutación de Vistas WAI-ARIA ---
  function setPanelVisibility(panelEl, visible) {
    if (!panelEl) return;
    if (visible) {
      panelEl.removeAttribute('hidden');
      panelEl.hidden = false;
      panelEl.classList.add('active');
    } else {
      panelEl.setAttribute('hidden', '');
      panelEl.hidden = true;
      panelEl.classList.remove('active');
    }
  }

  function setTabSelected(tabEl, selected) {
    if (!tabEl) return;
    tabEl.setAttribute('aria-selected', selected ? 'true' : 'false');
    if (selected) {
      tabEl.classList.add('active');
    } else {
      tabEl.classList.remove('active');
    }
  }

  function switchView(viewName) {
    try {
      const validViews = ['list', 'stats', 'map'];
      if (!validViews.includes(viewName)) {
        return;
      }

      currentView = viewName;
      const isList = viewName === 'list';
      const isStats = viewName === 'stats';
      const isMap = viewName === 'map';

      // 1. Sincronización visual de pestañas superiores e inferiores (WAI-ARIA)
      setTabSelected(elements.tabList, isList);
      setTabSelected(elements.tabStats, isStats);
      setTabSelected(elements.tabMap, isMap);

      setTabSelected(elements.bottomTabList, isList);
      setTabSelected(elements.bottomTabStats, isStats);
      setTabSelected(elements.bottomTabMap, isMap);

      // 2. Alternar visibilidad de paneles de contenido (inmediato)
      setPanelVisibility(elements.panelList, isList);
      setPanelVisibility(elements.panelStats, isStats);
      setPanelVisibility(elements.panelMap, isMap);

      // 3. Conmutar modo panorámico en contenedor
      const appContainer = elements.container || document.querySelector('.container');
      if (appContainer) {
        if (isMap) {
          appContainer.classList.add('map-panoramic-mode');
        } else {
          appContainer.classList.remove('map-panoramic-mode');
        }
      }

      // 4. Anuncio accesible para lectores de pantalla
      if (elements.ariaAnnouncer) {
        const labels = { list: 'Lista de Compras', stats: 'Estadísticas Financieras', map: 'Ruta en Mapa' };
        elements.ariaAnnouncer.textContent = `Mostrando vista: ${labels[viewName] || viewName}`;
      }

      // 5. Renderizado Quirúrgico bajo demanda y Ajuste de Viewport
      const state = (store && typeof store.getState === 'function') ? store.getState() : {};
      const items = state.items || [];
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

      if (isList) {
        if (listDirty && typeof renderListView === 'function') {
          renderListView(state, items);
        }
      } else if (isStats) {
        if (statsDirty && typeof renderStatsView === 'function') {
          renderStatsView(state, items, isDark);
        }
        try {
          const ctrl = (typeof getOrInitChartController === 'function') ? getOrInitChartController() : chartController;
          if (ctrl) {
            setTimeout(() => {
              try {
                if (typeof ctrl.resize === 'function') {
                  ctrl.resize();
                } else if (ctrl.instance && typeof ctrl.instance.resize === 'function') {
                  ctrl.instance.resize();
                }
              } catch (_) {}
            }, 60);
          }
        } catch (_) {}
      } else if (isMap) {
        if (mapDirty && typeof renderMapView === 'function') {
          renderMapView();
        }
        try {
          if (typeof window.MapRouteService !== 'undefined') {
            if (typeof MapRouteService.invalidateSize === 'function') {
              MapRouteService.invalidateSize();
            }
            if (MapRouteService.mapController) {
              setTimeout(() => {
                try { MapRouteService.mapController.invalidateSize(); } catch (_) {}
              }, 60);
            }
          }
        } catch (e) {
          console.warn('[App] Error al invalidar tamaño del mapa:', e);
        }
      }
    } catch (err) {
      console.error('[App] Error al conmutar pestaña:', err);
    }
  }

  // Exposición global para callbacks inline y utilidades de prueba
  window.switchAppView = switchView;
  window.switchView = switchView;
  window.renderAppUI = (...args) => renderUI(...args);
  window.__getRenderState = () => ({
    currentView,
    listDirty,
    statsDirty,
    mapDirty
  });

  // Registro inmediato y directo de eventos de navegación
  const navTabBindings = [
    { btn: elements.tabList, view: 'list' },
    { btn: elements.tabStats, view: 'stats' },
    { btn: elements.tabMap, view: 'map' },
    { btn: elements.bottomTabList, view: 'list' },
    { btn: elements.bottomTabStats, view: 'stats' },
    { btn: elements.bottomTabMap, view: 'map' }
  ];

  navTabBindings.forEach(({ btn, view }) => {
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(view);
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        switchView(view);
      }
    });
  });

  // Delegación de eventos global a nivel de documento para blindar cualquier clic en pestañas
  document.addEventListener('click', (e) => {
    const tabBtn = e.target && e.target.closest && e.target.closest('[data-view], [id^="tab-"], [id^="bottom-tab-"]');
    if (tabBtn) {
      let view = tabBtn.getAttribute('data-view');
      if (!view) {
        const id = tabBtn.id || '';
        if (id.includes('list')) view = 'list';
        else if (id.includes('stats')) view = 'stats';
        else if (id.includes('map')) view = 'map';
      }
      if (view) {
        switchView(view);
      }
    }
  });

  // --- 3. Inicialización y Detección de Firebase Firestore ---
  let db = null;
  let itemsCollection = null;
  let isFirebaseActive = false;

  const resolvedFirebaseConfig = (typeof window !== 'undefined' && window.firebaseConfig) 
    || (typeof globalThis !== 'undefined' && globalThis.firebaseConfig) 
    || (typeof firebaseConfig !== 'undefined' ? firebaseConfig : null);

  try {
    if (typeof firebase !== 'undefined' && resolvedFirebaseConfig) {
      const cfg = resolvedFirebaseConfig;
      const hasRealConfig = cfg && cfg.apiKey && !cfg.apiKey.includes('dummy') && cfg.projectId && !cfg.projectId.includes('dummy');

      if (hasRealConfig) {
        const app = (firebase.apps && firebase.apps.length > 0) ? firebase.apps[0] : firebase.initializeApp(cfg);
        db = app.firestore();
        itemsCollection = db.collection('shoppingItems');
        isFirebaseActive = true;
        console.log('[App] Conexión activa con Firebase Firestore.');
      }
    }
  } catch (err) {
    console.warn('[App] Error al inicializar Firebase SDK:', err.message);
    isFirebaseActive = false;
  }

  // --- 4. Inicialización del Store Local Reactivo ---
  const localStore = (typeof window !== 'undefined' && window.localStorage)
    ? window.localStorage
    : (typeof localStorage !== 'undefined' ? localStorage : { getItem: () => null, setItem: () => {}, removeItem: () => {} });

  let initialItems = [];
  try {
    initialItems = JSON.parse(localStore.getItem('shopping_items') || '[]');
  } catch (_) {
    initialItems = [];
  }
  const initialBudget = parseFloat(localStore.getItem('budget')) || 0;
  const initialTheme = localStore.getItem('theme') || 'light';
  let initialLocationOrder = [];
  let initialCollapsed = [];
  try {
    initialLocationOrder = JSON.parse(localStore.getItem('locationOrder') || '[]');
    initialCollapsed = JSON.parse(localStore.getItem('collapsedGroups') || '[]');
  } catch (_) {}

  const storageReq = safeRequire('storage.js');
  const StorageModule = window.ShoppingStorage || window.StorageService || (typeof global !== 'undefined' && (global.ShoppingStorage || global.StorageService)) || (storageReq && (storageReq.StorageService || storageReq.ShoppingStorage || storageReq)) || null;

  if (!StoreClass) {
    throw new Error('[App] ShoppingState StoreClass no está disponible en window. Asegúrate de incluir js/state.js antes de script.js.');
  }

  const store = new StoreClass({
    items: initialItems,
    budget: initialBudget,
    theme: initialTheme,
    locationOrder: initialLocationOrder,
    collapsedGroups: initialCollapsed,
    filter: { search: '', searchQuery: '', hideCompleted: false },
    filters: { search: '', searchQuery: '', hideCompleted: false },
    uiPreferences: { locationOrder: initialLocationOrder, collapsedGroups: initialCollapsed }
  }, StorageModule);

  // --- 5. Sincronización en Tiempo Real con Firebase Firestore ---
  if (isFirebaseActive && itemsCollection) {
    itemsCollection.onSnapshot(
      snapshot => {
        if (!snapshot || !snapshot.docs) return;
        const remoteItems = snapshot.docs.map(doc => {
          const d = doc.data() || {};
          let ts = Date.now();
          if (d.timestamp) {
            ts = typeof d.timestamp.toMillis === 'function' ? d.timestamp.toMillis() : (Number(d.timestamp) || Date.now());
          }
          return {
            id: doc.id,
            name: d.name || 'Sin nombre',
            quantity: (() => {
              let q = typeof d.quantity === 'string' ? d.quantity.trim().replace(',', '.') : d.quantity;
              let n = parseFloat(q);
              return (!isNaN(n) && isFinite(n) && n > 0) ? n : 1;
            })(),
            unitPrice: (() => {
              let p = typeof d.unitPrice === 'string' ? d.unitPrice.trim().replace(',', '.') : d.unitPrice;
              let n = parseFloat(p);
              return (!isNaN(n) && isFinite(n) && n >= 0) ? n : 0;
            })(),
            category: d.category || 'General',
            location: d.location || 'General',
            completed: Boolean(d.completed),
            timestamp: ts
          };
        });

        // Ordenar en memoria garantizando que todos los productos se muestren aunque no tengan timestamp
        remoteItems.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        // Actualizar Store local y persistir copia de respaldo
        if (typeof store.hydrate === 'function') {
          store.hydrate(remoteItems);
        } else {
          store.state.items = remoteItems;
        }
        try {
          localStore.setItem('shopping_items', JSON.stringify(remoteItems));
        } catch (_) {}
      },
      err => {
        console.warn('[App] Error en listener Firestore:', err.message);
      }
    );
  }

  // --- 6. Controlador Adaptativo de Apache ECharts ---
  const chartDom = document.getElementById('categoryChart');
  let chartController = null;

  function getOrInitChartController() {
    if (chartController && chartController.instance && !chartController.instance.disposed) {
      return chartController;
    }
    const echartsLib = (typeof window !== 'undefined' && window.echarts) || (typeof global !== 'undefined' && global.echarts);
    if (chartDom && ChartModule.ChartController) {
      if (!chartController) {
        chartController = new ChartModule.ChartController(chartDom, { echarts: echartsLib });
      } else if (echartsLib && (!chartController.instance || chartController.instance.disposed)) {
        if (typeof chartController.init === 'function') {
          chartController.init(echartsLib);
        }
      }
    }
    return chartController;
  }

  // Intento de inicialización temprana síncrona si echarts ya estuviera en memoria (ej. Node.js mocks)
  getOrInitChartController();

  // --- 7. Gestión del Tema (Claro / Oscuro) ---
  function applyTheme(theme) {
    try {
      document.documentElement.setAttribute('data-theme', theme);
      if (elements.themeToggle) {
        elements.themeToggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
        elements.themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
        elements.themeToggle.innerHTML = theme === 'dark' 
          ? '<i data-lucide="sun" aria-hidden="true"></i>' 
          : '<i data-lucide="moon" aria-hidden="true"></i>';
        if (window.lucide) window.lucide.createIcons(elements.themeToggle ? { root: elements.themeToggle } : undefined);
      }
      if (store && typeof store.setTheme === 'function') {
        store.setTheme(theme);
      }
      if (typeof window.MapRouteService !== 'undefined' && MapRouteService.setTheme) {
        MapRouteService.setTheme(theme === 'dark');
      }
      renderUI();
    } catch (e) {
      console.warn('[App] Error al aplicar tema:', e);
    }
  }

  const savedTheme = localStore.getItem('theme') || initialTheme || 'light';
  applyTheme(savedTheme);

  if (elements.themeToggle) {
    elements.themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const nextTheme = current === 'dark' ? 'light' : 'dark';
      localStore.setItem('theme', nextTheme);
      applyTheme(nextTheme);
    });
  }

  // --- 8. Renderizado Desacoplado y Reactivo (R1) ---

  // 8.1 Métricas Universales Agregadas (siempre activas, ligeras)
  function renderUniversalMetrics(state, items) {
    let metrics = { totalPending: 0, totalSpent: 0, totalOverall: 0, budgetRemaining: 0, budgetPercentage: 0 };
    if (AnalyticsModule.calculateMetrics) {
      metrics = AnalyticsModule.calculateMetrics(items, state.budget);
    } else {
      let pending = 0;
      items.forEach(it => { if (!it.completed) pending += (Number(it.unitPrice) || 0) * (Number(it.quantity) || 1); });
      metrics.totalPending = Math.round(pending * 100) / 100;
    }

    if (elements.grandTotalValue) {
      elements.grandTotalValue.textContent = `$${metrics.totalPending.toFixed(2)}`;
    }

    if (elements.printGrandTotalValue) {
      elements.printGrandTotalValue.textContent = `$${metrics.totalPending.toFixed(2)}`;
    }

    if (elements.budgetInput && document.activeElement !== elements.budgetInput) {
      elements.budgetInput.value = state.budget > 0 ? state.budget : '';
    }

    if (elements.budgetProgressBar) {
      const pct = metrics.budgetPercentage;
      elements.budgetProgressBar.style.width = `${pct}%`;
      elements.budgetProgressBar.className = 'progress-bar';
      if (pct >= 100) {
        elements.budgetProgressBar.classList.add('danger');
      } else if (pct >= 80) {
        elements.budgetProgressBar.classList.add('warning');
      }
    }

    if (elements.budgetStats) {
      if (state.budget > 0) {
        const absRem = Math.abs(metrics.budgetRemaining).toFixed(2);
        elements.budgetStats.textContent = metrics.budgetRemaining >= 0 
          ? `Disponible: $${absRem} (${metrics.budgetPercentage}% consumido)`
          : `⚠️ Excedido por: $${absRem}`;
        elements.budgetStats.style.color = metrics.budgetRemaining < 0 ? 'var(--danger)' : 'var(--text-muted)';
      } else {
        elements.budgetStats.textContent = 'Sin presupuesto asignado';
        elements.budgetStats.style.color = 'var(--text-muted)';
      }
    }
  }

  // 8.2 Vista de Lista de Compras
  function renderListView(state, items) {
    const distinctLocs = [...new Set(items.map(it => (it.location || '').trim()).filter(Boolean))].sort();
    const distinctCats = [...new Set(items.map(it => (it.category || '').trim()).filter(Boolean))].sort();

    if (elements.locationSuggestions) {
      elements.locationSuggestions.innerHTML = distinctLocs.map(l => `<option value="${l}">`).join('');
    }
    if (elements.categorySuggestions) {
      elements.categorySuggestions.innerHTML = distinctCats.map(c => `<option value="${c}">`).join('');
    }

    renderShoppingList(state);
    listDirty = false;
  }

  // --- Placeholders visuales y accesibles (WCAG AA) para carga diferida ---
  function showChartLoadingPlaceholder() {
    let ph = document.getElementById('chartLoadingPlaceholder');
    if (!ph && chartDom && chartDom.parentNode) {
      ph = document.createElement('div');
      ph.id = 'chartLoadingPlaceholder';
      ph.className = 'chart-placeholder chart-loading';
      ph.setAttribute('role', 'status');
      ph.setAttribute('aria-live', 'polite');
      ph.innerHTML = `
        <i data-lucide="loader-2" class="spin" aria-hidden="true"></i>
        <span>Cargando estadísticas financieras...</span>
      `;
      chartDom.parentNode.insertBefore(ph, chartDom);
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: ph });
      }
    }
    if (ph) ph.style.display = 'flex';
    if (chartDom) chartDom.style.display = 'none';
  }

  function hideChartPlaceholder() {
    const ph = document.getElementById('chartLoadingPlaceholder');
    const errPh = document.getElementById('chartErrorPlaceholder');
    if (ph) ph.style.display = 'none';
    if (errPh) errPh.style.display = 'none';
    if (chartDom) chartDom.style.display = 'block';
  }

  function showChartErrorPlaceholder(retryCallback) {
    let ph = document.getElementById('chartErrorPlaceholder');
    if (!ph && chartDom && chartDom.parentNode) {
      ph = document.createElement('div');
      ph.id = 'chartErrorPlaceholder';
      ph.className = 'chart-placeholder chart-error';
      ph.setAttribute('role', 'alert');
      ph.innerHTML = `
        <i data-lucide="bar-chart-2" style="font-size:24px;opacity:0.6;" aria-hidden="true"></i>
        <p style="margin:0;font-size:0.875rem;">Módulo de gráficos no disponible sin conexión.</p>
        <button type="button" class="btn btn-sm btn-secondary" id="btnRetryECharts">
          <i data-lucide="refresh-cw" aria-hidden="true"></i>
          <span>Reintentar</span>
        </button>
      `;
      chartDom.parentNode.insertBefore(ph, chartDom);
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: ph });
      }
      const retryBtn = ph.querySelector('#btnRetryECharts');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          if (typeof retryCallback === 'function') retryCallback();
        });
      }
    }
    const loadingPh = document.getElementById('chartLoadingPlaceholder');
    if (loadingPh) loadingPh.style.display = 'none';
    if (ph) ph.style.display = 'flex';
    if (chartDom) chartDom.style.display = 'none';
  }

  function showMapLoadingPlaceholder() {
    const mapEl = elements.mapContainer || document.getElementById('map-container');
    if (!mapEl) return;
    let ph = document.getElementById('mapLoadingPlaceholder');
    if (!ph) {
      ph = document.createElement('div');
      ph.id = 'mapLoadingPlaceholder';
      ph.className = 'map-overlay-placeholder map-loading';
      ph.setAttribute('role', 'status');
      ph.setAttribute('aria-live', 'polite');
      ph.innerHTML = `
        <i data-lucide="loader-2" class="spin" aria-hidden="true"></i>
        <span>Cargando mapa interactivo y capas satelitales...</span>
      `;
      mapEl.appendChild(ph);
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: ph });
      }
    }
    ph.style.display = 'flex';
  }

  function hideMapPlaceholder() {
    const ph = document.getElementById('mapLoadingPlaceholder');
    const errPh = document.getElementById('mapErrorPlaceholder');
    if (ph) ph.style.display = 'none';
    if (errPh) errPh.style.display = 'none';
  }

  function showMapErrorPlaceholder(retryCallback) {
    const mapEl = elements.mapContainer || document.getElementById('map-container');
    if (!mapEl) return;
    let ph = document.getElementById('mapErrorPlaceholder');
    if (!ph) {
      ph = document.createElement('div');
      ph.id = 'mapErrorPlaceholder';
      ph.className = 'map-overlay-placeholder map-error';
      ph.setAttribute('role', 'alert');
      ph.innerHTML = `
        <i data-lucide="map-pin-off" style="font-size:28px;opacity:0.6;" aria-hidden="true"></i>
        <p style="margin:0;font-size:0.9rem;font-weight:700;">El mapa satelital requiere conexión a internet.</p>
        <p style="margin:0;font-size:0.8rem;color:var(--text-muted);">Tu itinerario ordenado y el botón para abrir en Google Maps siguen funcionando.</p>
        <button type="button" class="btn btn-sm btn-secondary" id="btnRetryLeaflet">
          <i data-lucide="refresh-cw" aria-hidden="true"></i>
          <span>Reintentar carga de mapa</span>
        </button>
      `;
      mapEl.appendChild(ph);
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: ph });
      }
      const retryBtn = ph.querySelector('#btnRetryLeaflet');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          if (typeof retryCallback === 'function') retryCallback();
        });
      }
    }
    const loadingPh = document.getElementById('mapLoadingPlaceholder');
    if (loadingPh) loadingPh.style.display = 'none';
    ph.style.display = 'flex';
  }

  let isEChartsLoading = false;

  // 8.3 Vista de Estadísticas Financieras
  function renderStatsView(state, items, isDark) {
    const hasEChartsInMemory = (typeof window !== 'undefined' && window.echarts) || (typeof global !== 'undefined' && global.echarts);
    const ctrl = getOrInitChartController();

    // Fast-Path: Si ECharts ya está en memoria y el controlador está inicializado
    if (hasEChartsInMemory && ctrl && ctrl.instance) {
      hideChartPlaceholder();
      let breakdown = {};
      if (AnalyticsModule.getCategoryBreakdown) {
        breakdown = AnalyticsModule.getCategoryBreakdown(items);
      }
      ctrl.render(breakdown, items, isDark);
      statsDirty = false;
      return;
    }

    // Slow-Path: Carga bajo demanda mediante ResourceLoader
    const loader = (typeof window !== 'undefined' && window.ResourceLoader) || (typeof ResourceLoader !== 'undefined' ? ResourceLoader : null) || safeRequire('resource-loader.js');
    if (loader && typeof loader.loadECharts === 'function') {
      if (isEChartsLoading) return;
      isEChartsLoading = true;
      showChartLoadingPlaceholder();

      loader.loadECharts().then((echartsLib) => {
        isEChartsLoading = false;
        hideChartPlaceholder();
        const updatedCtrl = getOrInitChartController();
        if (updatedCtrl && typeof updatedCtrl.init === 'function') {
          updatedCtrl.init(echartsLib);
        }
        if (currentView === 'stats') {
          const freshState = (store && typeof store.getState === 'function') ? store.getState() : state;
          const freshItems = freshState.items || items;
          let breakdown = {};
          if (AnalyticsModule.getCategoryBreakdown) {
            breakdown = AnalyticsModule.getCategoryBreakdown(freshItems);
          }
          if (updatedCtrl) {
            updatedCtrl.render(breakdown, freshItems, isDark);
            setTimeout(() => {
              try {
                if (typeof updatedCtrl.resize === 'function') updatedCtrl.resize();
              } catch (_) {}
            }, 60);
          }
          statsDirty = false;
        } else {
          statsDirty = true;
        }
      }).catch((err) => {
        isEChartsLoading = false;
        console.warn('[App] Error al descargar ECharts bajo demanda:', err);
        showChartErrorPlaceholder(() => renderStatsView(state, items, isDark));
      });
    } else if (ctrl) {
      hideChartPlaceholder();
      let breakdown = {};
      if (AnalyticsModule.getCategoryBreakdown) {
        breakdown = AnalyticsModule.getCategoryBreakdown(items);
      }
      ctrl.render(breakdown, items, isDark);
      statsDirty = false;
    }
  }

  let leafletLoadPromise = null;

  function ensureLeafletAndMapLoaded(onSuccess, onError) {
    const hasL = (typeof window !== 'undefined' && window.L) || (typeof global !== 'undefined' && global.L);
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    // Fast-Path: Si Leaflet ya existe en memoria
    if (hasL) {
      if (typeof MapRouteService !== 'undefined' && MapRouteService.initMap && (!MapRouteService.mapController || !MapRouteService.mapController.map)) {
        MapRouteService.initMap('map-container', { isDark });
      }
      hideMapPlaceholder();
      if (typeof onSuccess === 'function') {
        try {
          onSuccess();
        } catch (e) {
          console.error('[App] Error en callback Leaflet onSuccess:', e);
        }
      }
      return Promise.resolve(hasL);
    }

    // Slow-Path: Carga bajo demanda vía ResourceLoader
    const loader = (typeof window !== 'undefined' && window.ResourceLoader) || (typeof ResourceLoader !== 'undefined' ? ResourceLoader : null) || safeRequire('resource-loader.js');
    if (!loader || typeof loader.loadLeaflet !== 'function') {
      const err = new Error('ResourceLoader no disponible para cargar Leaflet');
      if (typeof onError === 'function') onError(err);
      return Promise.reject(err);
    }

    if (!leafletLoadPromise) {
      showMapLoadingPlaceholder();
      leafletLoadPromise = loader.loadLeaflet().then((leafletLib) => {
        hideMapPlaceholder();
        if (typeof MapRouteService !== 'undefined' && MapRouteService.initMap) {
          MapRouteService.initMap('map-container', { isDark });
        }
        return leafletLib;
      }).catch((err) => {
        leafletLoadPromise = null;
        console.warn('[App] Error al descargar Leaflet bajo demanda:', err);
        showMapErrorPlaceholder(() => ensureLeafletAndMapLoaded(onSuccess, onError));
        throw err;
      });
    }

    return leafletLoadPromise.then((leafletLib) => {
      if (typeof onSuccess === 'function') onSuccess(leafletLib);
      return leafletLib;
    }).catch((err) => {
      if (typeof onError === 'function') onError(err);
      throw err;
    });
  }

  // 8.4 Vista de Ruta y Mapa
  function renderMapView() {
    const hasL = (typeof window !== 'undefined' && window.L) || (typeof global !== 'undefined' && global.L);

    // Fast-Path: Si Leaflet ya existe en memoria, actualización 100% síncrona y única
    if (hasL) {
      ensureLeafletAndMapLoaded();
      if (typeof updateMapRouteUI === 'function') {
        updateMapRouteUI();
      }
      if (typeof window.MapRouteService !== 'undefined' && MapRouteService.invalidateSize) {
        MapRouteService.invalidateSize();
      }
      mapDirty = false;
      return;
    }

    // Slow-Path: Carga bajo demanda asíncrona mediante ResourceLoader
    ensureLeafletAndMapLoaded(() => {
      if (currentView === 'map') {
        if (typeof updateMapRouteUI === 'function') {
          updateMapRouteUI();
        }
        if (typeof window.MapRouteService !== 'undefined' && MapRouteService.invalidateSize) {
          MapRouteService.invalidateSize();
        }
        mapDirty = false;
      } else {
        mapDirty = true;
      }
    });
    mapDirty = false;
  }

  // 8.5 Orquestador de Renderizado Selectivo por Vista Activa
  function renderUI(options = {}) {
    const forceAll = Boolean(options && (options.forceAll || options === true) || (typeof window !== 'undefined' && window.__FORCE_FULL_RENDER__));
    const state = (store && typeof store.getState === 'function') ? store.getState() : {};
    const items = state.items || [];
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    // 1. Métricas universales: actualización ligera incondicional
    renderUniversalMetrics(state, items);

    // 2. Renderizado total forzado (para tests o sincronizaciones completas)
    if (forceAll) {
      renderListView(state, items);
      renderStatsView(state, items, isDark);
      renderMapView();
      listDirty = false;
      statsDirty = false;
      mapDirty = false;
      return;
    }

    // 3. Renderizado selectivo granular por pestaña activa
    if (currentView === 'list') {
      renderListView(state, items);
      statsDirty = true;
      mapDirty = true;
    } else if (currentView === 'stats') {
      renderStatsView(state, items, isDark);
      listDirty = true;
      mapDirty = true;
    } else if (currentView === 'map') {
      renderMapView();
      listDirty = true;
      statsDirty = true;
    }
  }

  function renderShoppingList(state) {
    if (!elements.shoppingListContainer) return;

    let grouped = {};
    if (typeof store.getGroupedItems === 'function') {
      grouped = store.getGroupedItems();
    } else {
      const activeFilter = state.filters || state.filter || {};
      const query = normalizeSearchText(activeFilter.searchQuery || activeFilter.search || '');
      const hideCompleted = Boolean(activeFilter.hideCompleted);
      const tokens = query ? query.split(/\s+/).filter(Boolean) : [];

      (state.items || []).forEach(it => {
        const haystack = normalizeSearchText(`${it.name || ''} ${it.location || ''} ${it.category || ''}`);
        const matchSearch = tokens.length === 0 || tokens.every(token => haystack.includes(token));
        const matchHide = !hideCompleted || !it.completed;
        if (matchSearch && matchHide) {
          const loc = (it.location || 'General').trim() || 'General';
          if (!grouped[loc]) grouped[loc] = [];
          grouped[loc].push(it);
        }
      });
    }

    const locations = Object.keys(grouped);
    elements.shoppingListContainer.innerHTML = '';

    if (locations.length === 0) {
      elements.shoppingListContainer.innerHTML = `
        <div class="empty-state" style="text-align:center; padding: 40px 20px; color: var(--text-muted);">
          <i data-lucide="shopping-bag" style="width: 48px; height: 48px; margin-bottom: 12px; opacity: 0.5;"></i>
          <p style="font-weight: 700; font-size: 1.1rem; color: var(--text-main);">Tu lista de compras está vacía</p>
          <p style="font-size: 0.85rem; margin-top: 4px;">Añade productos usando el formulario superior para comenzar.</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons(elements.shoppingListContainer ? { root: elements.shoppingListContainer } : undefined);
      return;
    }

    const rawCollapsed = state.collapsedGroups || (state.uiPreferences && state.uiPreferences.collapsedGroups) || [];
    const collapsedSet = new Set(rawCollapsed);

    locations.forEach(loc => {
      const itemsInGroup = grouped[loc];
      const isCollapsed = collapsedSet.has(loc);

      const groupDiv = document.createElement('div');
      groupDiv.className = `location-group ${isCollapsed ? 'collapsed' : ''}`;
      groupDiv.dataset.location = loc;

      const safeLoc = ValidationModule.escapeHtml ? ValidationModule.escapeHtml(loc) : loc;

      const header = document.createElement('div');
      header.className = 'group-header';
      header.setAttribute('role', 'button');
      header.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
      header.setAttribute('tabindex', '0');
      header.innerHTML = `
        <div class="group-title">
          <i data-lucide="grip-vertical" style="opacity: 0.35;" aria-hidden="true"></i>
          <i data-lucide="chevron-down" class="collapse-icon" aria-hidden="true"></i>
          <h2>${safeLoc}</h2>
        </div>
        <span class="group-count-badge">${itemsInGroup.length} ${itemsInGroup.length === 1 ? 'ítem' : 'ítems'}</span>
      `;

      const listDiv = document.createElement('div');
      listDiv.className = 'shopping-list';

      itemsInGroup.forEach(item => {
        listDiv.appendChild(createItemCard(item));
      });

      groupDiv.appendChild(header);
      groupDiv.appendChild(listDiv);
      elements.shoppingListContainer.appendChild(groupDiv);
    });

    if (window.lucide) window.lucide.createIcons(elements.shoppingListContainer ? { root: elements.shoppingListContainer } : undefined);
  }

  function createItemCard(item) {
    const card = document.createElement('div');
    card.className = `shopping-item ${item.completed ? 'completed' : ''}`;
    card.dataset.id = item.id;

    const totalItemPrice = (Number(item.unitPrice) || 0) * (Number(item.quantity) || 1);
    const safeName = ValidationModule.escapeHtml ? ValidationModule.escapeHtml(item.name) : item.name;
    const safeCategory = ValidationModule.escapeHtml ? ValidationModule.escapeHtml(item.category || 'General') : (item.category || 'General');

    let avatarMarkup = '';
    if (AvatarsModule.getAvatarMarkup) {
      avatarMarkup = AvatarsModule.getAvatarMarkup(item.category, item.name);
    } else {
      avatarMarkup = `<div class="product-avatar"><i data-lucide="package"></i></div>`;
    }

    card.innerHTML = `
      ${avatarMarkup}
      <input type="checkbox" class="item-checkbox" ${item.completed ? 'checked' : ''} data-id="${item.id}" aria-label="Marcar ${safeName} como comprado">
      <div class="item-info">
        <span class="item-name" title="${safeName}">${safeName}</span>
        <div class="item-sub">
          <span>${item.quantity} un.</span>
          ${item.unitPrice > 0 ? `<span>• $${Number(item.unitPrice).toFixed(2)} c/u</span>` : ''}
          <span class="item-category-tag">${safeCategory}</span>
        </div>
      </div>
      <div class="item-price">$${totalItemPrice.toFixed(2)}</div>
      <div class="item-actions">
        <button type="button" class="btn-icon edit-btn" data-id="${item.id}" aria-label="Editar producto ${safeName}" title="Editar">
          <i data-lucide="edit-3"></i>
        </button>
        <button type="button" class="btn-icon btn-danger del-btn" data-id="${item.id}" aria-label="Eliminar producto ${safeName}" title="Eliminar">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    `;

    return card;
  }

  // --- 9. Modo Edición ---
  let currentEditingId = null;

  function startEditingItem(item) {
    currentEditingId = item.id;
    if (store && typeof store.setEditingItem === 'function') {
      store.setEditingItem(item.id);
    }
    elements.itemInput.value = item.name || '';
    elements.quantityInput.value = item.quantity || 1;
    elements.unitPriceInput.value = item.unitPrice > 0 ? item.unitPrice : '';
    elements.locationInput.value = item.location || '';
    elements.categoryInput.value = item.category || '';

    if (elements.addItemButton) {
      elements.addItemButton.innerHTML = `<i data-lucide="check-circle"></i><span>Guardar</span>`;
      if (window.lucide) window.lucide.createIcons(elements.addItemButton ? { root: elements.addItemButton } : undefined);
    }

    elements.itemInput.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEditing() {
    currentEditingId = null;
    if (store && typeof store.setEditingItem === 'function') {
      store.setEditingItem(null);
    }
    clearInputs();
    if (elements.addItemButton) {
      elements.addItemButton.innerHTML = `<i data-lucide="plus-circle"></i><span>Añadir</span>`;
      if (window.lucide) window.lucide.createIcons(elements.addItemButton ? { root: elements.addItemButton } : undefined);
    }
  }

  function clearInputs() {
    if (elements.itemInput) elements.itemInput.value = '';
    if (elements.quantityInput) elements.quantityInput.value = '1';
    if (elements.unitPriceInput) elements.unitPriceInput.value = '';
    if (elements.locationInput) elements.locationInput.value = '';
    if (elements.categoryInput) elements.categoryInput.value = '';
  }

  // --- 10. Formulario de Añadir / Guardar ---
  async function handleFormSubmit() {
    const rawData = {
      name: elements.itemInput.value,
      quantity: elements.quantityInput.value,
      unitPrice: elements.unitPriceInput.value,
      location: elements.locationInput.value,
      category: elements.categoryInput.value
    };

    let validationRes = null;
    if (ValidationModule.validateItem) {
      validationRes = ValidationModule.validateItem(rawData);
    } else {
      const valid = Boolean(rawData.name && rawData.name.trim());
      validationRes = { isValid: valid, cleanData: rawData, errors: valid ? [] : ['El nombre es obligatorio'] };
    }

    if (!validationRes.isValid) {
      const errMsg = (validationRes.errors && validationRes.errors[0]) || 'Por favor verifica los datos ingresados.';
      if (FeedbackModule.showToast) FeedbackModule.showToast(errMsg, 'error');
      else alert(errMsg);
      elements.itemInput.focus();
      return;
    }

    const clean = validationRes.cleanData;

    if (isFirebaseActive && itemsCollection) {
      try {
        if (currentEditingId) {
          const editId = currentEditingId;
          const existingItem = (typeof store.getItemById === 'function') ? store.getItemById(editId) : null;
          const updateData = {
            name: clean.name,
            quantity: clean.quantity,
            unitPrice: clean.unitPrice,
            location: clean.location,
            category: clean.category,
            completed: existingItem ? existingItem.completed : false,
            updatedAt: Date.now()
          };

          if (typeof store.updateItem === 'function') {
            store.updateItem(editId, updateData);
          }
          cancelEditing();
          await itemsCollection.doc(editId).set(updateData, { merge: true });
          if (FeedbackModule.showToast) FeedbackModule.showToast('Producto actualizado en Firebase', 'success');
        } else {
          const newItemData = {
            name: clean.name,
            quantity: clean.quantity,
            unitPrice: clean.unitPrice,
            location: clean.location,
            category: clean.category,
            completed: false,
            timestamp: Date.now()
          };

          let addedItem = null;
          if (typeof store.addItem === 'function') {
            addedItem = store.addItem(newItemData);
          } else {
            addedItem = { ...newItemData, id: `item_${Date.now()}` };
            store.state.items.unshift(addedItem);
          }
          clearInputs();
          if (elements.itemInput) elements.itemInput.focus();

          const firestorePayload = {
            ...newItemData,
            id: addedItem.id,
            timestamp: (firebase.firestore && firebase.firestore.FieldValue) 
              ? firebase.firestore.FieldValue.serverTimestamp() 
              : Date.now()
          };

          if (addedItem && addedItem.id) {
            await itemsCollection.doc(addedItem.id).set(firestorePayload);
          } else {
            await itemsCollection.add(firestorePayload);
          }
        }
      } catch (err) {
        console.warn('[App] Error al escribir en Firebase:', err);
        if (FeedbackModule.showToast) FeedbackModule.showToast('Error de conexión a Firebase. Guardado localmente.', 'warning');
      }
    } else {
      if (currentEditingId) {
        if (typeof store.updateItem === 'function') store.updateItem(currentEditingId, clean);
        cancelEditing();
        if (FeedbackModule.showToast) FeedbackModule.showToast('Producto actualizado correctamente', 'success');
      } else {
        if (typeof store.addItem === 'function') store.addItem(clean);
        clearInputs();
        if (elements.itemInput) elements.itemInput.focus();
      }
    }
  }

  if (elements.addItemButton) {
    elements.addItemButton.addEventListener('click', handleFormSubmit);
  }

  // --- 11. Atajos de Teclado ---
  [elements.itemInput, elements.quantityInput, elements.unitPriceInput, elements.locationInput, elements.categoryInput].forEach(inp => {
    if (!inp) return;
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleFormSubmit();
      } else if (e.key === 'Escape') {
        if (currentEditingId) {
          e.preventDefault();
          cancelEditing();
        }
      }
    });
  });

  // --- 11.1 Delegación de Eventos en Lista de Compras (R3) ---
  if (elements.shoppingListContainer) {
    // 1. Delegación de cambio (checkbox comprado)
    elements.shoppingListContainer.addEventListener('change', async (e) => {
      const chk = e.target.closest('.item-checkbox');
      if (!chk) return;
      const card = chk.closest('.shopping-item');
      const itemId = (card && card.dataset.id) || chk.dataset.id;
      if (!itemId) return;

      let nextCompleted = chk.checked;
      if (typeof store.toggleCompleted === 'function') {
        const toggled = store.toggleCompleted(itemId);
        if (toggled) nextCompleted = toggled.completed;
      }

      if (isFirebaseActive && itemsCollection) {
        try {
          await itemsCollection.doc(itemId).set({
            completed: nextCompleted,
            updatedAt: Date.now()
          }, { merge: true });
        } catch (err) {
          console.warn('[App] Error al actualizar estado en Firebase:', err);
        }
      }
    });

    // 2. Delegación de clics (editar, eliminar, colapsar grupo)
    elements.shoppingListContainer.addEventListener('click', async (e) => {
      // A. Botón Editar
      const editBtn = e.target.closest('.edit-btn');
      if (editBtn) {
        e.stopPropagation();
        const card = editBtn.closest('.shopping-item');
        const itemId = card ? card.dataset.id : editBtn.dataset.id;
        const item = store.getItemById ? store.getItemById(itemId) : (store.getItems && store.getItems().find(i => i.id === itemId));
        if (item) startEditingItem(item);
        return;
      }

      // B. Botón Eliminar
      const delBtn = e.target.closest('.del-btn');
      if (delBtn) {
        e.stopPropagation();
        const card = delBtn.closest('.shopping-item');
        const itemId = card ? card.dataset.id : delBtn.dataset.id;
        const item = store.getItemById ? store.getItemById(itemId) : (store.getItems && store.getItems().find(i => i.id === itemId));
        if (!item) return;

        const removedSnapshot = { ...item };
        if (typeof store.deleteItem === 'function') {
          store.deleteItem(itemId);
        }

        if (isFirebaseActive && itemsCollection) {
          try {
            await itemsCollection.doc(itemId).delete();
          } catch (err) {
            console.warn('[App] Error al eliminar de Firebase:', err);
          }
        }

        if (FeedbackModule.showUndoToast) {
          FeedbackModule.showUndoToast(`"${removedSnapshot.name}" eliminado`, async () => {
            if (typeof store.undoLastAction === 'function') {
              store.undoLastAction();
            } else if (typeof store.addItem === 'function') {
              store.addItem(removedSnapshot);
            }

            if (isFirebaseActive && itemsCollection) {
              try {
                await itemsCollection.doc(removedSnapshot.id).set(removedSnapshot);
              } catch (err) {
                console.warn('[App] Error al restaurar en Firebase:', err);
              }
            }
          });
        }
        return;
      }

      // C. Encabezado de Grupo (Colapsar / Expandir)
      const header = e.target.closest('.group-header');
      if (header) {
        const groupDiv = header.closest('.location-group');
        const loc = groupDiv ? groupDiv.dataset.location : null;
        if (loc && typeof store.toggleGroupCollapse === 'function') {
          store.toggleGroupCollapse(loc);
        }
        return;
      }
    });

    // 3. Accesibilidad de teclado para grupos
    elements.shoppingListContainer.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const header = e.target.closest('.group-header');
        if (header) {
          e.preventDefault();
          const groupDiv = header.closest('.location-group');
          const loc = groupDiv ? groupDiv.dataset.location : null;
          if (loc && typeof store.toggleGroupCollapse === 'function') {
            store.toggleGroupCollapse(loc);
          }
        }
      }
    });
  }

  // --- 12. Filtros y Búsqueda (R2) ---
  if (elements.searchInput) {
    let searchDebounceTimer = null;
    const SEARCH_DEBOUNCE_MS = 150;

    const applySearchFilter = (val) => {
      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
      }
      store.setFilter({ search: val, searchQuery: val });
    };

    elements.searchInput.addEventListener('input', (e) => {
      const val = e.target.value || '';
      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
      }
      if (!val.trim()) {
        applySearchFilter('');
        return;
      }
      searchDebounceTimer = setTimeout(() => {
        applySearchFilter(val);
      }, SEARCH_DEBOUNCE_MS);
    });

    elements.searchInput.addEventListener('search', (e) => {
      applySearchFilter(e.target.value || '');
    });

    elements.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        elements.searchInput.value = '';
        applySearchFilter('');
      } else if (e.key === 'Enter') {
        applySearchFilter(elements.searchInput.value || '');
      }
    });
  }

  if (elements.hideCompletedSwitch) {
    elements.hideCompletedSwitch.addEventListener('change', (e) => {
      store.setFilter({ hideCompleted: e.target.checked });
    });
  }

  // --- 13. Presupuesto Reactivo (R2) ---
  if (elements.budgetInput) {
    elements.budgetInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 0;
      localStore.setItem('budget', String(val));
      store.setBudget(val);
    });
  }

  // --- 14. Limpiar Comprados (R2) ---
  if (elements.resetListButton) {
    elements.resetListButton.addEventListener('click', async () => {
      const state = store.getState();
      const completedItems = (state.items || []).filter(it => it.completed);

      if (completedItems.length === 0) {
        if (FeedbackModule.showToast) FeedbackModule.showToast('No hay productos comprados para limpiar', 'info');
        return;
      }

      const confirmed = await FeedbackModule.confirmClearCompleted(completedItems.length);
      if (!confirmed) return;

      if (typeof store.clearCompleted === 'function') {
        store.clearCompleted();
      }

      if (isFirebaseActive && db && itemsCollection) {
        try {
          const batch = db.batch();
          completedItems.forEach(it => {
            batch.delete(itemsCollection.doc(it.id));
          });
          await batch.commit();
        } catch (err) {
          console.warn('[App] Error al limpiar en Firebase:', err);
        }
      }

      if (window.confetti) {
        window.confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
      }

      if (FeedbackModule.showUndoToast) {
        FeedbackModule.showUndoToast(`Se limpiaron ${completedItems.length} productos comprados`, async () => {
          if (typeof store.undoLastAction === 'function') {
            store.undoLastAction();
          } else {
            completedItems.forEach(it => {
              if (typeof store.addItem === 'function') store.addItem(it);
              else store.state.items.push(it);
            });
          }

          if (isFirebaseActive && db && itemsCollection) {
            try {
              const batch = db.batch();
              completedItems.forEach(it => {
                batch.set(itemsCollection.doc(it.id), it);
              });
              await batch.commit();
            } catch (err) {
              console.warn('[App] Error al deshacer en Firebase:', err);
            }
          }
        });
      }
    });
  }

  // --- 15. Exportación e Importación ---
  if (elements.exportButton) {
    elements.exportButton.addEventListener('click', async () => {
      const state = store.getState();
      if (!state.items || state.items.length === 0) {
        if (FeedbackModule.showToast) FeedbackModule.showToast('La lista está vacía, no hay nada para exportar', 'warning');
        return;
      }

      const Swal = window.Swal;
      let format = 'json';

      if (Swal) {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const res = await Swal.fire({
          title: 'Exportar Lista',
          text: 'Selecciona el formato de descarga:',
          icon: 'question',
          showCancelButton: true,
          showDenyButton: true,
          confirmButtonText: 'JSON (.json)',
          denyButtonText: 'CSV (.csv Excel)',
          cancelButtonText: 'Cancelar',
          background: isDark ? '#1e293b' : '#ffffff',
          color: isDark ? '#f8fafc' : '#0f172a',
          confirmButtonColor: '#4f46e5',
          denyButtonColor: '#047857'
        });

        if (res.isConfirmed) format = 'json';
        else if (res.isDenied) format = 'csv';
        else return;
      }

      const dateStr = new Date().toISOString().slice(0, 10);
      if (format === 'json') {
        const jsonContent = ExportImportModule.exportJSON(state.items, state.budget);
        ExportImportModule.triggerDownload(jsonContent, `lista-compras-${dateStr}.json`, 'application/json;charset=utf-8');
      } else {
        const csvContent = ExportImportModule.exportCSV(state.items);
        ExportImportModule.triggerDownload(csvContent, `lista-compras-${dateStr}.csv`, 'text/csv;charset=utf-8');
      }

      if (FeedbackModule.showToast) FeedbackModule.showToast('Archivo descargado con éxito', 'success');
    });
  }

  // --- Compartir Lista (F13 - WhatsApp / Web Share / Clipboard) ---
  if (elements.shareButton) {
    elements.shareButton.addEventListener('click', async () => {
      const state = (store && typeof store.getState === 'function') ? store.getState() : {};
      const items = state.items || [];

      if (!items || items.length === 0) {
        if (FeedbackModule && typeof FeedbackModule.showToast === 'function') {
          FeedbackModule.showToast('La lista está vacía, no hay nada para compartir', 'warning');
        }
        return;
      }

      const sm = getShareModule();
      if (!sm || typeof sm.shareList !== 'function') {
        console.warn('[App] ShareModule no disponible');
        return;
      }

      try {
        const res = await sm.shareList(items, { includeCompleted: false });
        if (res && res.success) {
          if (res.method === 'whatsapp') {
            if (FeedbackModule && typeof FeedbackModule.showToast === 'function') {
              FeedbackModule.showToast('Abriendo WhatsApp para compartir lista', 'info');
            }
          } else if (res.method === 'clipboard' || res.copied) {
            if (FeedbackModule && typeof FeedbackModule.showToast === 'function') {
              FeedbackModule.showToast('¡Lista copiada al portapapeles!', 'success');
            }
          }
        }
      } catch (err) {
        if (FeedbackModule && typeof FeedbackModule.showToast === 'function') {
          FeedbackModule.showToast('No se pudo compartir la lista', 'error');
        }
      }
    });
  }

  // --- Modo de Impresión y PDF (F14 & F15) ---
  if (elements.printButton) {
    elements.printButton.addEventListener('click', () => {
      const state = (store && typeof store.getState === 'function') ? store.getState() : {};
      const items = state.items || [];

      if (!items || items.length === 0) {
        if (FeedbackModule && typeof FeedbackModule.showToast === 'function') {
          FeedbackModule.showToast('La lista está vacía, no hay nada para imprimir', 'warning');
        }
        return;
      }

      if (typeof switchView === 'function' && currentView !== 'list') {
        switchView('list');
      } else if (listDirty && typeof renderListView === 'function') {
        renderListView(state, items);
        listDirty = false;
      }

      if (typeof window !== 'undefined' && typeof window.print === 'function') {
        window.print();
      }
    });
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('beforeprint', () => {
      try {
        const state = (store && typeof store.getState === 'function') ? store.getState() : {};
        const items = state.items || [];
        if (typeof renderShoppingList === 'function') {
          renderShoppingList(state);
        }
        if (elements.printGrandTotalValue) {
          let pending = 0;
          if (AnalyticsModule && typeof AnalyticsModule.calculateMetrics === 'function') {
            const m = AnalyticsModule.calculateMetrics(items, state.budget);
            pending = m.totalPending;
          } else {
            items.forEach(it => { if (!it.completed) pending += (Number(it.unitPrice) || 0) * (Number(it.quantity) || 1); });
            pending = Math.round(pending * 100) / 100;
          }
          elements.printGrandTotalValue.textContent = `$${pending.toFixed(2)}`;
        }
      } catch (_) {}
    });
  }

  if (elements.importButton && elements.importFileInput) {
    elements.importButton.addEventListener('click', () => {
      elements.importFileInput.value = '';
      elements.importFileInput.click();
    });

    elements.importFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        const content = event.target.result;
        const isJSON = file.name.endsWith('.json') || content.trim().startsWith('{');
        
        let result = null;
        if (isJSON) {
          result = ExportImportModule.importJSON(content);
        } else {
          result = ExportImportModule.importCSV(content);
        }

        if (!result.success || !result.items || result.items.length === 0) {
          const err = result.error || 'El archivo seleccionado no contiene productos válidos.';
          if (FeedbackModule.showToast) FeedbackModule.showToast(err, 'error');
          return;
        }

        const mode = await FeedbackModule.confirmImportMode(result.items.length);
        if (mode === 'cancel') return;

        // Actualización optimista inmediata en Store local y UI
        if (mode === 'overwrite') {
          if (typeof store.hydrate === 'function') store.hydrate(result.items);
          else store.state.items = result.items;
        } else {
          // Modo append: hidratar lote unificado para emitir un solo evento reactivo
          if (typeof store.hydrate === 'function') {
            const currentItems = (typeof store.getItems === 'function') ? store.getItems() : (store.state.items || []);
            store.hydrate([...result.items, ...currentItems]);
          } else {
            result.items.forEach(it => {
              if (typeof store.addItem === 'function') store.addItem(it);
              else store.state.items.push(it);
            });
          }
        }

        if (isFirebaseActive && db && itemsCollection) {
          try {
            const batch = db.batch();
            if (mode === 'overwrite') {
              const existing = await itemsCollection.get();
              existing.docs.forEach(doc => batch.delete(doc.ref));
            }
            result.items.forEach(it => {
              const docId = it.id || (db.collection('shoppingItems').doc().id);
              batch.set(itemsCollection.doc(docId), {
                ...it,
                timestamp: it.timestamp || Date.now()
              });
            });
            await batch.commit();
          } catch (err) {
            console.warn('[App] Error al importar en Firebase:', err);
            if (FeedbackModule.showToast) {
              FeedbackModule.showToast('Importado localmente. Error de sincronización en la nube.', 'warning');
              return;
            }
          }
        }

        if (FeedbackModule.showToast) {
          FeedbackModule.showToast(`Se importaron ${result.items.length} productos con éxito`, 'success');
        }
      };

      reader.readAsText(file);
    });
  }

  // --- 16. Reordenamiento Drag & Drop con SortableJS ---
  if (window.Sortable && elements.shoppingListContainer) {
    new window.Sortable(elements.shoppingListContainer, {
      animation: 150,
      handle: '.group-header',
      onEnd: () => {
        const newOrder = Array.from(elements.shoppingListContainer.querySelectorAll('.location-group'))
          .map(g => g.dataset.location);
        if (typeof store.reorderLocations === 'function') store.reorderLocations(newOrder);
        localStore.setItem('locationOrder', JSON.stringify(newOrder));
      }
    });
  }

  // --- 17. Suscripción a Cambios del Store ---
  if (typeof store.on === 'function') {
    store.on('state:changed', () => {
      renderUI();
    });
  }

  // --- 18. Módulo de Rutas y Selector de Vistas WAI-ARIA ---

  // A. Actualización de Métricas, Itinerario y Renderizado de Ruta en el Mapa
  let stopsSortableInstance = null;

  function renderRouteStopsList(route) {
    if (!elements.routeStopsList) return;
    elements.routeStopsList.innerHTML = '';

    const origin = route.origin || (MapRouteService.getOrigin && MapRouteService.getOrigin());
    const allCandidateStops = (Array.isArray(route.allStops) && route.allStops.length > 0)
      ? route.allStops
      : (route.orderedStops || []);

    if (allCandidateStops.length === 0) {
      elements.routeStopsList.innerHTML = `
        <div style="text-align:center; padding: 20px 10px; color: var(--text-muted); font-size: 0.85rem;">
          <p style="font-weight:600;">No hay paradas de compra pendientes.</p>
          <p style="font-size: 0.75rem; margin-top: 4px;">Añade comercios en tus productos para trazar el itinerario.</p>
        </div>
      `;
      return;
    }

    // Ordenar para mostrar primero las paradas activas en su orden de itinerario, seguidas de las excluidas
    const orderedNames = (route.orderedStops || []).map(s => s.storeName);
    const orderedSet = new Set(orderedNames);
    const stops = [
      ...(route.orderedStops || []),
      ...allCandidateStops.filter(s => !orderedSet.has(s.storeName))
    ];

    // 1. Elemento Fijo de Punto de Partida
    const originItem = document.createElement('div');
    originItem.className = 'route-stop-item route-origin-item';
    const originAddr = origin.address || (origin.type === 'gps' ? 'Mi Ubicación actual (GPS)' : 'Punto de partida');
    const safeOriginAddr = ValidationModule.escapeHtml ? ValidationModule.escapeHtml(originAddr) : originAddr;
    originItem.innerHTML = `
      <div class="stop-badge" aria-label="Punto de partida">📍</div>
      <div class="stop-details">
        <span class="stop-name">Origen: ${safeOriginAddr}</span>
        <span class="stop-meta">${origin.type === 'gps' ? 'Geolocalización GPS' : 'Punto de partida configurado'}</span>
      </div>
    `;
    elements.routeStopsList.appendChild(originItem);

    // 2. Paradas Ordenadas y Paradas Excluidas
    const activeStopsList = route.orderedStops || [];
    stops.forEach((stop, idx) => {
      const isIncluded = stop.isIncluded !== false;
      const stopDiv = document.createElement('div');
      stopDiv.className = `route-stop-item ${isIncluded ? '' : 'is-excluded'}`;
      stopDiv.dataset.location = stop.storeName;
      if (isIncluded) {
        stopDiv.setAttribute('draggable', 'true');
      }

      const safeStoreName = ValidationModule.escapeHtml ? ValidationModule.escapeHtml(stop.storeName) : stop.storeName;
      const totalAmount = stop.estimatedTotal > 0 ? `$${Number(stop.estimatedTotal).toFixed(2)}` : '$0.00';
      const itemsCountText = `${stop.itemCount || (stop.pendingItems && stop.pendingItems.length) || 0} art.`;
      const safeAddress = ValidationModule.escapeHtml ? ValidationModule.escapeHtml(stop.address || stop.storeName) : (stop.address || stop.storeName);
      const stopNumberBadge = isIncluded ? (stop.stepIndex || (idx + 1)) : '—';

      stopDiv.innerHTML = `
        <div class="stop-drag-handle" title="${isIncluded ? 'Arrastra para reordenar esta parada' : 'Parada no incluida en la ruta'}" aria-label="Arrastrar parada" ${isIncluded ? '' : 'style="opacity:0.25; cursor:not-allowed;"'}>
          <i data-lucide="grip-vertical"></i>
        </div>
        <label class="stop-checkbox-label" title="${isIncluded ? 'Desmarcar para excluir de este viaje' : 'Marcar para incluir en este viaje'}">
          <input type="checkbox" class="stop-checkbox" data-store="${safeStoreName}" ${isIncluded ? 'checked' : ''} aria-label="Incluir ${safeStoreName} en la ruta">
        </label>
        <div class="stop-badge">${stopNumberBadge}</div>
        <div class="stop-details">
          <div class="stop-title-row">
            <span class="stop-name" title="${safeStoreName}">${safeStoreName}</span>
            ${!isIncluded ? '<span class="stop-excluded-tag">No incluido</span>' : ''}
          </div>
          <div class="stop-meta">
            <span>${itemsCountText}</span>
            <span>•</span>
            <span class="stop-price-tag">${totalAmount}</span>
            ${isIncluded && stop.stepDistanceKm ? `<span>• ${stop.stepDistanceKm} km</span>` : ''}
          </div>
          <div class="stop-address-preview" title="${safeAddress}">
            <i data-lucide="map-pin" class="meta-icon"></i>
            <span>${safeAddress}</span>
          </div>
        </div>
        <div class="stop-actions">
          <button type="button" class="btn-edit-location" data-store="${safeStoreName}" title="Ajustar dirección exacta o señalar en el mapa" aria-label="Editar dirección de ${safeStoreName}">
            <i data-lucide="map-pin"></i>
          </button>
          <div class="stop-reorder-actions">
            <button type="button" class="btn-move-stop btn-move-up" title="Mover hacia arriba" aria-label="Mover hacia arriba" ${idx === 0 || !isIncluded ? 'disabled' : ''}>▲</button>
            <button type="button" class="btn-move-stop btn-move-down" title="Mover hacia abajo" aria-label="Mover hacia abajo" ${idx >= activeStopsList.length - 1 || !isIncluded ? 'disabled' : ''}>▼</button>
          </div>
        </div>
      `;

      // Clic en checkbox para incluir / excluir parada del viaje
      const chk = stopDiv.querySelector('.stop-checkbox');
      if (chk) {
        chk.addEventListener('change', () => {
          handleStopCheckboxToggle(stop.storeName, chk.checked);
        });
      }

      // Clic en botón de edición de ubicación exacta
      const btnEditLoc = stopDiv.querySelector('.btn-edit-location');
      if (btnEditLoc) {
        btnEditLoc.addEventListener('click', (e) => {
          e.stopPropagation();
          openEditStoreModal(stop.storeName);
        });
      }

      // Clics en botones accesibles Subir / Bajar (solo paradas activas)
      if (isIncluded) {
        const activeIdx = activeStopsList.findIndex(s => s.storeName === stop.storeName);
        const btnUp = stopDiv.querySelector('.btn-move-up');
        const btnDown = stopDiv.querySelector('.btn-move-down');

        if (btnUp && activeIdx > 0) {
          btnUp.addEventListener('click', (e) => {
            e.stopPropagation();
            moveStopPosition(activeIdx, activeIdx - 1, activeStopsList);
          });
        }
        if (btnDown && activeIdx < activeStopsList.length - 1) {
          btnDown.addEventListener('click', (e) => {
            e.stopPropagation();
            moveStopPosition(activeIdx, activeIdx + 1, activeStopsList);
          });
        }
      }

      elements.routeStopsList.appendChild(stopDiv);
    });

    if (window.lucide) window.lucide.createIcons(elements.routeStopsList ? { root: elements.routeStopsList } : undefined);

    // Inicializar SortableJS o drag & drop nativo para paradas activas
    initStopsDragAndDrop(elements.routeStopsList, activeStopsList);
  }

  function handleStopCheckboxToggle(storeName, isChecked) {
    if (typeof MapRouteService === 'undefined') return;
    const activeTrip = MapRouteService.getActiveTrip();
    if (!activeTrip) return;

    // Obtener todos los comercios pendientes actuales
    const items = (typeof store.getItems === 'function' ? store.getItems() : (store.getState() && store.getState().items)) || [];
    const pendingItems = items.filter(it => it && !it.completed);
    const allStores = [...new Set(pendingItems.map(it => (it.location && String(it.location).trim()) || 'General'))];

    // Si includedStores era null, inicialmente todos estaban incluidos
    let currentIncluded = Array.isArray(activeTrip.includedStores)
      ? [...activeTrip.includedStores]
      : [...allStores];

    if (isChecked) {
      if (!currentIncluded.includes(storeName)) {
        currentIncluded.push(storeName);
      }
    } else {
      currentIncluded = currentIncluded.filter(s => s !== storeName);
    }

    MapRouteService.setTripIncludedStores(activeTrip.id, currentIncluded);
    updateMapRouteUI();
    if (FeedbackModule.showToast) {
      FeedbackModule.showToast(
        isChecked ? `"${storeName}" añadido a la ruta` : `"${storeName}" excluido de la ruta`,
        'info'
      );
    }
  }

  function moveStopPosition(fromIndex, toIndex, stops) {
    if (!Array.isArray(stops) || toIndex < 0 || toIndex >= stops.length || fromIndex === toIndex) return;
    const currentOrder = stops.map(s => s.storeName);
    const moved = currentOrder.splice(fromIndex, 1)[0];
    currentOrder.splice(toIndex, 0, moved);

    if (typeof MapRouteService !== 'undefined' && typeof MapRouteService.setCustomStopOrder === 'function') {
      MapRouteService.setCustomStopOrder(currentOrder);
    }
    updateMapRouteUI();
    if (FeedbackModule.showToast) {
      FeedbackModule.showToast('Recorrido actualizado con nuevo orden de paradas', 'info');
    }
  }

  function initStopsDragAndDrop(container, stops) {
    if (window.Sortable && typeof window.Sortable.create === 'function') {
      if (stopsSortableInstance) return;
      stopsSortableInstance = window.Sortable.create(container, {
        animation: 180,
        handle: '.stop-drag-handle',
        filter: '.route-origin-item, .is-excluded',
        preventOnFilter: true,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        onEnd: () => {
          const stopEls = container.querySelectorAll('.route-stop-item:not(.route-origin-item):not(.is-excluded)[data-location]');
          const newOrder = Array.from(stopEls).map(el => el.dataset.location).filter(Boolean);
          if (newOrder.length > 0) {
            if (typeof MapRouteService !== 'undefined' && typeof MapRouteService.setCustomStopOrder === 'function') {
              MapRouteService.setCustomStopOrder(newOrder);
            }
            updateMapRouteUI();
            if (FeedbackModule.showToast) {
              FeedbackModule.showToast('Recorrido actualizado con nuevo orden de paradas', 'info');
            }
          }
        }
      });
    } else {
      setupNativeDragAndDrop(container);
    }
  }

  function setupNativeDragAndDrop(container) {
    let draggedItem = null;
    const items = container.querySelectorAll('.route-stop-item:not(.route-origin-item):not(.is-excluded)');

    items.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        draggedItem = item;
        item.classList.add('sortable-chosen');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', item.dataset.location || '');
        }
      });

      item.addEventListener('dragend', () => {
        if (draggedItem) draggedItem.classList.remove('sortable-chosen');
        draggedItem = null;
        const stopEls = container.querySelectorAll('.route-stop-item:not(.route-origin-item):not(.is-excluded)[data-location]');
        const newOrder = Array.from(stopEls).map(el => el.dataset.location).filter(Boolean);
        if (newOrder.length > 0 && typeof MapRouteService !== 'undefined' && typeof MapRouteService.setCustomStopOrder === 'function') {
          MapRouteService.setCustomStopOrder(newOrder);
        }
        updateMapRouteUI();
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        if (draggedItem && draggedItem !== item) {
          const allItems = Array.from(container.querySelectorAll('.route-stop-item:not(.route-origin-item):not(.is-excluded)'));
          const draggedIdx = allItems.indexOf(draggedItem);
          const targetIdx = allItems.indexOf(item);
          if (draggedIdx < targetIdx) {
            item.after(draggedItem);
          } else {
            item.before(draggedItem);
          }
        }
      });
    });
  }

  function renderTripsSelector() {
    if (!elements.tripSelect || typeof MapRouteService === 'undefined' || !MapRouteService.getTripsData) return;
    const tripsData = MapRouteService.getTripsData();
    const trips = tripsData.trips || [];
    const activeTripId = tripsData.activeTripId;

    elements.tripSelect.innerHTML = '';
    trips.forEach(trip => {
      const opt = document.createElement('option');
      opt.value = trip.id;
      opt.textContent = trip.name;
      if (trip.id === activeTripId) {
        opt.selected = true;
      }
      elements.tripSelect.appendChild(opt);
    });

    if (elements.tripIncludedCount) {
      const activeTrip = MapRouteService.getActiveTrip();
      const items = (typeof store.getItems === 'function' ? store.getItems() : (store.getState() && store.getState().items)) || [];
      const pendingItems = items.filter(it => it && !it.completed);
      const totalStoresCount = new Set(pendingItems.map(it => (it.location && String(it.location).trim()) || 'General')).size;

      if (!activeTrip || activeTrip.includedStores === null) {
        elements.tripIncludedCount.textContent = `${totalStoresCount} de ${totalStoresCount} lugares`;
      } else {
        const incCount = activeTrip.includedStores.filter(s => {
          return pendingItems.some(it => ((it.location && String(it.location).trim()) || 'General') === s);
        }).length;
        elements.tripIncludedCount.textContent = `${incCount} de ${totalStoresCount} lugares`;
      }
    }
  }

  function updateMapRouteUI() {
    if (typeof window.MapRouteService === 'undefined' || !MapRouteService.calculateOptimalRoute) return;
    const items = (typeof store.getItems === 'function' ? store.getItems() : (store.getState() && store.getState().items)) || [];
    const currentOrigin = (typeof MapRouteService.getOrigin === 'function') ? MapRouteService.getOrigin() : null;
    const route = MapRouteService.calculateOptimalRoute(items, currentOrigin);

    if (typeof MapRouteService.renderRouteOnMap === 'function') {
      MapRouteService.renderRouteOnMap(route);
    }

    // Actualizar selector de viajes y métricas de paradas
    renderTripsSelector();

    // Actualizar métricas de la tarjeta resumen
    if (elements.routeDistance) {
      elements.routeDistance.textContent = `${(route.totalDistanceKm || 0).toFixed(1)} km`;
    }
    if (elements.routeDuration) {
      elements.routeDuration.textContent = `${route.estimatedDurationMinutes || 0} min`;
    }
    if (elements.routeStops) {
      const stopCount = (route.orderedStops && route.orderedStops.length) || 0;
      elements.routeStops.textContent = `${stopCount} ${stopCount === 1 ? 'parada' : 'paradas'}`;
    }

    // Actualizar botón de Google Maps
    if (elements.btnOpenGoogleMaps) {
      if (route.googleMapsUrl && route.orderedStops && route.orderedStops.length > 0) {
        elements.btnOpenGoogleMaps.href = route.googleMapsUrl;
        elements.btnOpenGoogleMaps.classList.remove('disabled');
        elements.btnOpenGoogleMaps.removeAttribute('aria-disabled');
      } else {
        elements.btnOpenGoogleMaps.href = '#';
        elements.btnOpenGoogleMaps.classList.add('disabled');
        elements.btnOpenGoogleMaps.setAttribute('aria-disabled', 'true');
      }
    }

    // Actualizar lista interactiva de paradas del itinerario
    renderRouteStopsList(route);
  }

  // B. Gestor de Viajes de Compra: Listeners y Acciones
  if (elements.tripSelect) {
    elements.tripSelect.addEventListener('change', (e) => {
      if (typeof MapRouteService === 'undefined') return;
      MapRouteService.setActiveTrip(e.target.value);
      updateMapRouteUI();
    });
  }

  if (elements.btnNewTrip) {
    elements.btnNewTrip.addEventListener('click', async () => {
      if (typeof MapRouteService === 'undefined') return;
      let tripName = '';
      if (window.Swal) {
        const { value, isConfirmed } = await window.Swal.fire({
          title: 'Nuevo Viaje de Compra',
          text: 'Ingresa un nombre para tu nuevo viaje:',
          input: 'text',
          inputPlaceholder: 'Ej: Viaje 2, Supermercado y Farmacia...',
          showCancelButton: true,
          confirmButtonText: 'Crear Viaje',
          cancelButtonText: 'Cancelar',
          confirmButtonColor: '#4f46e5',
          inputValidator: (val) => {
            if (!val || !val.trim()) return 'El nombre no puede estar vacío';
          }
        });
        if (!isConfirmed || !value) return;
        tripName = value.trim();
      } else {
        tripName = (prompt('Nombre del nuevo viaje:') || '').trim();
        if (!tripName) return;
      }

      const newTrip = MapRouteService.createTrip(tripName);
      updateMapRouteUI();
      if (FeedbackModule.showToast) {
        FeedbackModule.showToast(`Viaje "${newTrip.name}" creado con éxito`, 'success');
      }
    });
  }

  if (elements.btnRenameTrip) {
    elements.btnRenameTrip.addEventListener('click', async () => {
      if (typeof MapRouteService === 'undefined') return;
      const activeTrip = MapRouteService.getActiveTrip();
      if (!activeTrip) return;

      let newName = '';
      if (window.Swal) {
        const { value, isConfirmed } = await window.Swal.fire({
          title: 'Renombrar Viaje',
          input: 'text',
          inputValue: activeTrip.name,
          showCancelButton: true,
          confirmButtonText: 'Guardar',
          cancelButtonText: 'Cancelar',
          confirmButtonColor: '#4f46e5',
          inputValidator: (val) => {
            if (!val || !val.trim()) return 'El nombre no puede estar vacío';
          }
        });
        if (!isConfirmed || !value) return;
        newName = value.trim();
      } else {
        newName = (prompt('Nuevo nombre para el viaje:', activeTrip.name) || '').trim();
        if (!newName) return;
      }

      MapRouteService.renameTrip(activeTrip.id, newName);
      updateMapRouteUI();
      if (FeedbackModule.showToast) {
        FeedbackModule.showToast(`Viaje renombrado a "${newName}"`, 'success');
      }
    });
  }

  if (elements.btnDeleteTrip) {
    elements.btnDeleteTrip.addEventListener('click', async () => {
      if (typeof MapRouteService === 'undefined') return;
      const tripsData = MapRouteService.getTripsData();
      if (tripsData.trips.length <= 1) {
        if (FeedbackModule.showToast) {
          FeedbackModule.showToast('Debe haber al menos un viaje en la lista', 'warning');
        }
        return;
      }

      const activeTrip = MapRouteService.getActiveTrip();
      let confirmed = false;
      if (window.Swal) {
        const res = await window.Swal.fire({
          title: '¿Eliminar viaje?',
          text: `Se eliminará "${activeTrip.name}". Los productos de la lista se conservan intactos.`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Sí, eliminar',
          cancelButtonText: 'Cancelar',
          confirmButtonColor: '#ef4444'
        });
        confirmed = res.isConfirmed;
      } else {
        confirmed = confirm(`¿Deseas eliminar el viaje "${activeTrip.name}"?`);
      }

      if (confirmed) {
        MapRouteService.deleteTrip(activeTrip.id);
        updateMapRouteUI();
        if (FeedbackModule.showToast) {
          FeedbackModule.showToast(`Viaje "${activeTrip.name}" eliminado`, 'info');
        }
      }
    });
  }

  if (elements.btnSelectAllTripStops) {
    elements.btnSelectAllTripStops.addEventListener('click', () => {
      if (typeof MapRouteService === 'undefined') return;
      const activeTrip = MapRouteService.getActiveTrip();
      if (!activeTrip) return;
      MapRouteService.setTripIncludedStores(activeTrip.id, null);
      updateMapRouteUI();
      if (FeedbackModule.showToast) {
        FeedbackModule.showToast('Todos los lugares incluidos en este viaje', 'success');
      }
    });
  }

  if (elements.btnDeselectAllTripStops) {
    elements.btnDeselectAllTripStops.addEventListener('click', () => {
      if (typeof MapRouteService === 'undefined') return;
      const activeTrip = MapRouteService.getActiveTrip();
      if (!activeTrip) return;
      MapRouteService.setTripIncludedStores(activeTrip.id, []);
      updateMapRouteUI();
      if (FeedbackModule.showToast) {
        FeedbackModule.showToast('Todos los lugares desmarcados de este viaje', 'info');
      }
    });
  }

  // Modal de Edición de Ubicación y Selección Directa en Mapa
  let currentEditingStoreName = null;

  function openEditStoreModal(storeName) {
    if (!elements.modalEditStoreLocation || !storeName) return;
    currentEditingStoreName = storeName;

    if (elements.modalStoreTitle) {
      elements.modalStoreTitle.textContent = `Ubicación de "${storeName}"`;
    }

    const coordsMap = (typeof MapRouteService !== 'undefined' && MapRouteService.getStoredCoordinates)
      ? MapRouteService.getStoredCoordinates()
      : {};
    const normKey = (typeof MapRouteService !== 'undefined' && MapRouteService.normalizeStoreName)
      ? MapRouteService.normalizeStoreName(storeName)
      : storeName.toLowerCase().trim();
    const stored = coordsMap[normKey];

    if (elements.inputStoreAddress) {
      elements.inputStoreAddress.value = (stored && (stored.address || stored.displayName)) || '';
    }

    if (elements.modalCurrentCoordsText) {
      if (stored && typeof stored.lat === 'number' && typeof stored.lng === 'number') {
        const sourceLabel = stored.source === 'map_click' ? 'Punto señalado en el mapa' : (stored.source === 'manual' ? 'Dirección manual' : 'Geocodificación');
        elements.modalCurrentCoordsText.innerHTML = `<strong>Ubicación fijada:</strong> ${stored.lat.toFixed(5)}, ${stored.lng.toFixed(5)}<br><span style="font-size:0.75rem; opacity:0.8;">Tipo: ${sourceLabel}</span>`;
      } else {
        elements.modalCurrentCoordsText.innerHTML = `<em>Ubicación aproximada automática. Ingresa una dirección exacta o márcala directamente en el mapa.</em>`;
      }
    }

    if (elements.btnResetStoreLocation) {
      elements.btnResetStoreLocation.style.display = stored ? 'inline-block' : 'none';
    }

    elements.modalEditStoreLocation.removeAttribute('hidden');
    if (elements.inputStoreAddress) {
      elements.inputStoreAddress.focus();
    }
  }

  function closeEditStoreModal() {
    if (!elements.modalEditStoreLocation) return;
    elements.modalEditStoreLocation.setAttribute('hidden', '');
    currentEditingStoreName = null;
  }

  if (elements.btnCloseStoreModal) {
    elements.btnCloseStoreModal.addEventListener('click', closeEditStoreModal);
  }
  if (elements.btnCancelStoreModal) {
    elements.btnCancelStoreModal.addEventListener('click', closeEditStoreModal);
  }

  // Guardar dirección manual desde el modal
  if (elements.btnSearchStoreAddress && elements.inputStoreAddress) {
    const handleSaveStoreAddress = async () => {
      const addressText = (elements.inputStoreAddress.value || '').trim();
      if (!addressText) {
        if (FeedbackModule.showToast) FeedbackModule.showToast('Escribe una dirección válida', 'warning');
        elements.inputStoreAddress.focus();
        return;
      }
      if (!currentEditingStoreName || typeof MapRouteService === 'undefined') return;

      const origHtml = elements.btnSearchStoreAddress.innerHTML;
      elements.btnSearchStoreAddress.innerHTML = `<i data-lucide="loader-2" class="spin"></i><span>Buscando...</span>`;
      if (window.lucide) window.lucide.createIcons(elements.btnSearchStoreAddress ? { root: elements.btnSearchStoreAddress } : undefined);

      try {
        const resolved = await MapRouteService.geocodeAddress(addressText, { immediate: true });
        if (resolved && MapRouteService.isValidCoordinates(resolved)) {
          MapRouteService.saveStoreCoordinate(currentEditingStoreName, {
            lat: resolved.lat,
            lng: resolved.lng,
            address: resolved.displayName || addressText,
            source: 'manual'
          });
          closeEditStoreModal();
          updateMapRouteUI();
          if (FeedbackModule.showToast) {
            FeedbackModule.showToast(`Ubicación de "${currentEditingStoreName}" actualizada con éxito`, 'success');
          }
        } else {
          if (FeedbackModule.showToast) {
            FeedbackModule.showToast('No se encontraron coordenadas para esa dirección. Intenta seleccionarla en el mapa.', 'warning');
          }
        }
      } catch (err) {
        console.warn('[App] Error al geocodificar dirección de tienda:', err);
      } finally {
        elements.btnSearchStoreAddress.innerHTML = origHtml;
        if (window.lucide) window.lucide.createIcons(elements.btnSearchStoreAddress ? { root: elements.btnSearchStoreAddress } : undefined);
      }
    };

    elements.btnSearchStoreAddress.addEventListener('click', handleSaveStoreAddress);
    elements.inputStoreAddress.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSaveStoreAddress();
      }
    });
  }

  // Elegir punto en el mapa desde el modal
  if (elements.btnPickOnMapFromModal) {
    elements.btnPickOnMapFromModal.addEventListener('click', () => {
      const targetStore = currentEditingStoreName;
      closeEditStoreModal();
      if (targetStore) {
        startPickLocationOnMap(targetStore);
      }
    });
  }

  // Restablecer ubicación predeterminada
  if (elements.btnResetStoreLocation) {
    elements.btnResetStoreLocation.addEventListener('click', () => {
      if (!currentEditingStoreName || typeof MapRouteService === 'undefined') return;
      MapRouteService.removeStoreCoordinate(currentEditingStoreName);
      closeEditStoreModal();
      updateMapRouteUI();
      if (FeedbackModule.showToast) {
        FeedbackModule.showToast(`Ubicación de "${currentEditingStoreName}" restablecida por defecto`, 'info');
      }
    });
  }

  // Modo interactivo de selección directa en el mapa
  function startPickLocationOnMap(storeName) {
    if (typeof MapRouteService === 'undefined' || !MapRouteService.enablePickLocationMode) return;
    if (elements.mapPickerStoreName) {
      elements.mapPickerStoreName.textContent = storeName;
    }
    if (elements.mapPickerBanner) {
      elements.mapPickerBanner.removeAttribute('hidden');
    }

    if (typeof switchView === 'function') {
      switchView('map');
    }

    ensureLeafletAndMapLoaded(() => {
      MapRouteService.enablePickLocationMode(storeName, (picked) => {
        if (elements.mapPickerBanner) {
          elements.mapPickerBanner.setAttribute('hidden', '');
        }
        if (picked && typeof picked.lat === 'number' && typeof picked.lng === 'number') {
          MapRouteService.saveStoreCoordinate(picked.storeName, {
            lat: picked.lat,
            lng: picked.lng,
            address: 'Ubicación seleccionada en el mapa',
            source: 'map_click'
          });
          updateMapRouteUI();
          if (FeedbackModule.showToast) {
            FeedbackModule.showToast(`Ubicación de "${picked.storeName}" fijada en el mapa`, 'success');
          }
        }
      });
    });

    if (FeedbackModule.showToast) {
      FeedbackModule.showToast(`Haz clic sobre el mapa para ubicar "${storeName}"`, 'info');
    }
  }

  if (elements.btnCancelMapPicker) {
    elements.btnCancelMapPicker.addEventListener('click', () => {
      if (typeof MapRouteService !== 'undefined' && MapRouteService.disablePickLocationMode) {
        MapRouteService.disablePickLocationMode();
      }
      if (elements.mapPickerBanner) {
        elements.mapPickerBanner.setAttribute('hidden', '');
      }
      if (FeedbackModule.showToast) {
        FeedbackModule.showToast('Selección en el mapa cancelada', 'info');
      }
    });
  }

  // C. Inicialización de MapRouteService y Leaflet (síncrona solo si L ya existe en memoria)
  const hasLeafletInMemory = (typeof window !== 'undefined' && window.L) || (typeof global !== 'undefined' && global.L);
  if (hasLeafletInMemory && typeof window.MapRouteService !== 'undefined' && MapRouteService.initMap) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    MapRouteService.initMap('map-container', { isDark });
  }

  // D. Conexión del Botón GPS
  if (elements.btnGpsOrigin) {
    elements.btnGpsOrigin.addEventListener('click', async () => {
      if (typeof window.MapRouteService === 'undefined' || !MapRouteService.getCurrentLocation) return;
      const originalHtml = elements.btnGpsOrigin.innerHTML;
      elements.btnGpsOrigin.innerHTML = `<i data-lucide="loader-2" class="spin"></i><span>Detectando...</span>`;
      if (window.lucide) window.lucide.createIcons(elements.btnGpsOrigin ? { root: elements.btnGpsOrigin } : undefined);

      try {
        const pos = await MapRouteService.getCurrentLocation({ timeout: 10000 });
        if (elements.manualOriginInput && pos) {
          elements.manualOriginInput.value = pos.address || 'Mi Ubicación actual (GPS)';
        }
        updateMapRouteUI();
        if (FeedbackModule.showToast) {
          FeedbackModule.showToast('Ubicación GPS establecida como origen', 'success');
        }
      } catch (err) {
        console.warn('[App] Error al obtener GPS:', err);
        if (FeedbackModule.showToast) {
          FeedbackModule.showToast('No se pudo obtener la ubicación GPS', 'warning');
        }
      } finally {
        elements.btnGpsOrigin.innerHTML = originalHtml;
        if (window.lucide) window.lucide.createIcons(elements.btnGpsOrigin ? { root: elements.btnGpsOrigin } : undefined);
      }
    });
  }

  // E. Conexión del Origen Manual
  if (elements.btnSetManualOrigin && elements.manualOriginInput) {
    const handleSetManualOrigin = async () => {
      const text = (elements.manualOriginInput.value || '').trim();
      if (!text) {
        if (FeedbackModule.showToast) FeedbackModule.showToast('Escribe una dirección o punto de partida', 'warning');
        elements.manualOriginInput.focus();
        return;
      }

      if (typeof window.MapRouteService === 'undefined') return;

      const originalHtml = elements.btnSetManualOrigin.innerHTML;
      elements.btnSetManualOrigin.innerHTML = `<i data-lucide="loader-2" class="spin"></i><span>Fijando...</span>`;
      if (window.lucide) window.lucide.createIcons(elements.btnSetManualOrigin ? { root: elements.btnSetManualOrigin } : undefined);

      try {
        const resolved = await MapRouteService.geocodeAddress(text, { immediate: true });
        if (resolved && MapRouteService.isValidCoordinates(resolved)) {
          MapRouteService.saveOrigin({
            lat: resolved.lat,
            lng: resolved.lng,
            address: resolved.displayName || text,
            type: 'manual'
          });
          updateMapRouteUI();
          if (FeedbackModule.showToast) {
            FeedbackModule.showToast('Origen fijado correctamente', 'success');
          }
        } else {
          if (FeedbackModule.showToast) {
            FeedbackModule.showToast('No se encontraron coordenadas para esa dirección', 'warning');
          }
        }
      } catch (e) {
        console.warn('[App] Error al geocodificar origen:', e);
      } finally {
        elements.btnSetManualOrigin.innerHTML = originalHtml;
        if (window.lucide) window.lucide.createIcons(elements.btnSetManualOrigin ? { root: elements.btnSetManualOrigin } : undefined);
      }
    };

    elements.btnSetManualOrigin.addEventListener('click', handleSetManualOrigin);
    elements.manualOriginInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSetManualOrigin();
      }
    });
  }

  // Precargar dirección de origen en el campo manual si ya existe
  if (elements.manualOriginInput && typeof window.MapRouteService !== 'undefined' && MapRouteService.getOrigin) {
    const savedOrig = MapRouteService.getOrigin();
    if (savedOrig && savedOrig.address && savedOrig.type !== 'default') {
      elements.manualOriginInput.value = savedOrig.address;
    }
  }

  // F. Geocodificación Defensiva en Segundo Plano al escribir en locationInput
  if (elements.locationInput) {
    let locDebounceTimer = null;
    const triggerBgGeocode = () => {
      const loc = (elements.locationInput.value || '').trim();
      if (loc.length >= 2 && typeof window.MapRouteService !== 'undefined' && MapRouteService.geocodeAddress) {
        MapRouteService.geocodeAddress(loc).catch(() => {});
      }
    };

    elements.locationInput.addEventListener('blur', triggerBgGeocode);
    elements.locationInput.addEventListener('input', () => {
      clearTimeout(locDebounceTimer);
      locDebounceTimer = setTimeout(triggerBgGeocode, 500);
    });
  }

  // G. Controles del Mapa: Zoom In, Zoom Out, Encuadrar Ruta y Re-optimizar
  if (elements.btnMapZoomIn) {
    elements.btnMapZoomIn.addEventListener('click', () => {
      if (typeof MapRouteService !== 'undefined' && typeof MapRouteService.zoomIn === 'function') {
        MapRouteService.zoomIn();
      }
    });
  }

  if (elements.btnMapZoomOut) {
    elements.btnMapZoomOut.addEventListener('click', () => {
      if (typeof MapRouteService !== 'undefined' && typeof MapRouteService.zoomOut === 'function') {
        MapRouteService.zoomOut();
      }
    });
  }

  if (elements.btnMapFitBounds) {
    elements.btnMapFitBounds.addEventListener('click', () => {
      if (typeof MapRouteService === 'undefined') return;
      const items = (typeof store.getItems === 'function' ? store.getItems() : (store.getState() && store.getState().items)) || [];
      const currentOrigin = (typeof MapRouteService.getOrigin === 'function') ? MapRouteService.getOrigin() : null;
      const route = MapRouteService.calculateOptimalRoute(items, currentOrigin);
      if (route && typeof MapRouteService.fitRouteBounds === 'function') {
        MapRouteService.fitRouteBounds(route.orderedStops, route.origin);
      }
    });
  }

  if (elements.btnResetRouteOrder) {
    elements.btnResetRouteOrder.addEventListener('click', () => {
      if (typeof MapRouteService !== 'undefined' && typeof MapRouteService.resetCustomStopOrder === 'function') {
        MapRouteService.resetCustomStopOrder();
      }
      updateMapRouteUI();
      if (FeedbackModule.showToast) {
        FeedbackModule.showToast('Ruta re-optimizada automáticamente por distancia mínima', 'success');
      }
    });
  }

  // Inicialización de Conectividad de Red (Online / Offline)
  initNetworkConnectivity();

  // Primer renderizado
  renderUI();
  if (window.lucide) window.lucide.createIcons();
});

/**
 * Inicializa el monitoreo de conectividad en tiempo real (F06)
 * Actualiza el componente accesible #networkStatusBadge
 */
function initNetworkConnectivity() {
  if (typeof document === 'undefined') return;
  const badge = document.getElementById('networkStatusBadge');
  if (!badge) return;

  function updateStatus(isOnline) {
    if (isOnline) {
      badge.classList.remove('offline');
      badge.classList.add('online');
      badge.title = 'Estado de red: Online (Conectado)';
      const textEl = badge.querySelector('.badge-text') || badge.querySelector('.network-text');
      if (textEl) textEl.textContent = 'Online';
      badge.setAttribute('aria-label', 'Conexión a internet restablecida');
    } else {
      badge.classList.remove('online');
      badge.classList.add('offline');
      badge.title = 'Estado de red: Offline (Sin conexión)';
      const textEl = badge.querySelector('.badge-text') || badge.querySelector('.network-text');
      if (textEl) textEl.textContent = 'Offline';
      badge.setAttribute('aria-label', 'Sin conexión a internet. Modo offline activado');
    }
  }

  // Estado inicial
  const nav = (typeof window !== 'undefined' && window.navigator)
    ? window.navigator
    : (typeof navigator !== 'undefined' ? navigator : null);
  const initialOnline = (nav && 'onLine' in nav)
    ? Boolean(nav.onLine)
    : true;
  updateStatus(initialOnline);

  // Escuchar eventos en window
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('online', () => updateStatus(true));
    window.addEventListener('offline', () => updateStatus(false));
  }
}

/**
 * Registra el Service Worker con guardas defensivas estrictas (F05)
 * Seguro para entornos sin soporte de SW (Node.js / JSDOM)
 */
function registerServiceWorker() {
  if (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    navigator &&
    'serviceWorker' in navigator &&
    typeof navigator.serviceWorker.register === 'function'
  ) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((err) => {
        console.warn('SW registration failed:', err);
      });
    });
  }
}

// Registro Seguro de Service Worker (PWA)
registerServiceWorker();

// Exposición global para pruebas de ciclo de vida y conectividad
if (typeof window !== 'undefined') {
  window.initNetworkConnectivity = initNetworkConnectivity;
  window.registerServiceWorker = registerServiceWorker;
}


