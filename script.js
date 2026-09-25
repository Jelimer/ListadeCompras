/**
 * script.js
 * Orquestador Principal y Controlador de UI para Lista de Compra | PRO.
 * Integración bidireccional en tiempo real con Firebase Firestore + Resiliencia Offline-First.
 */
document.addEventListener('DOMContentLoaded', async () => {
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
    btnOpenGoogleMaps: document.getElementById('btn-open-google-maps')
  };

  // --- 2. Acceso a Módulos Auxiliares ---
  const ValidationModule = window.ShoppingValidation || window.ValidationModule || {};
  const AvatarsModule = window.ShoppingAvatars || {};
  const AnalyticsModule = window.ShoppingAnalytics || window.AnalyticsService || {};
  const ChartModule = window.ShoppingChart || {};
  const ExportImportModule = window.ShoppingExportImport || window.ExportImportService || {};
  const FeedbackModule = window.ShoppingFeedback || window.UIFeedback || {};
  const StoreClass = window.Store || (window.ShoppingStore && window.ShoppingStore.Store) || (window.ShoppingState && window.ShoppingState.Store);

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
  let initialItems = [];
  try {
    initialItems = JSON.parse(localStorage.getItem('shopping_items') || '[]');
  } catch (_) {
    initialItems = [];
  }
  const initialBudget = parseFloat(localStorage.getItem('budget')) || 0;
  const initialTheme = localStorage.getItem('theme') || 'light';
  let initialLocationOrder = [];
  let initialCollapsed = [];
  try {
    initialLocationOrder = JSON.parse(localStorage.getItem('locationOrder') || '[]');
    initialCollapsed = JSON.parse(localStorage.getItem('collapsedGroups') || '[]');
  } catch (_) {}

  const StorageModule = window.ShoppingStorage || window.StorageService || null;

  const store = StoreClass 
    ? new StoreClass({
        items: initialItems,
        budget: initialBudget,
        theme: initialTheme,
        locationOrder: initialLocationOrder,
        collapsedGroups: initialCollapsed,
        filter: { search: '', searchQuery: '', hideCompleted: false },
        filters: { search: '', searchQuery: '', hideCompleted: false },
        uiPreferences: { locationOrder: initialLocationOrder, collapsedGroups: initialCollapsed }
      }, StorageModule)
    : {
        state: { 
          items: initialItems, 
          budget: initialBudget,
          theme: initialTheme,
          locationOrder: initialLocationOrder,
          collapsedGroups: initialCollapsed,
          editingItemId: null,
          filter: { search: '', searchQuery: '', hideCompleted: false }, 
          filters: { search: '', searchQuery: '', hideCompleted: false }, 
          uiPreferences: { locationOrder: initialLocationOrder, collapsedGroups: initialCollapsed } 
        },
        getState() { return this.state; },
        getItems() { return this.state.items; },
        getItemById(id) { return (this.state.items || []).find(i => i.id === id) || null; },
        getFilter() { return { ...this.state.filter }; },
        getFilters() { return { ...(this.state.filters || this.state.filter) }; },
        getBudget() { return this.state.budget; },
        subscribe(listener) { return () => {}; },
        on(event, handler) { return () => {}; },
        setEditingItem(id) { this.state.editingItemId = id ? String(id) : null; },
        reorderLocations(newOrder) {
          if (!Array.isArray(newOrder)) return;
          this.state.locationOrder = [...newOrder.map(String)];
          if (this.state.uiPreferences) this.state.uiPreferences.locationOrder = this.state.locationOrder;
        },
        toggleGroupCollapse(location) {
          const loc = String(location || 'General');
          const set = new Set(this.state.collapsedGroups || []);
          let isCollapsed = false;
          if (set.has(loc)) {
            set.delete(loc);
          } else {
            set.add(loc);
            isCollapsed = true;
          }
          this.state.collapsedGroups = Array.from(set);
          if (this.state.uiPreferences) this.state.uiPreferences.collapsedGroups = this.state.collapsedGroups;
          return isCollapsed;
        },
        getGroupedItems() {
          const activeFilter = this.state.filters || this.state.filter || {};
          const query = normalizeSearchText(activeFilter.searchQuery || activeFilter.search || '');
          const hideCompleted = Boolean(activeFilter.hideCompleted);
          const tokens = query ? query.split(/\s+/).filter(Boolean) : [];
          const grouped = {};

          (this.state.items || []).forEach(it => {
            const haystack = normalizeSearchText(`${it.name || ''} ${it.location || ''} ${it.category || ''}`);
            const matchSearch = tokens.length === 0 || tokens.every(token => haystack.includes(token));
            const matchHide = !hideCompleted || !it.completed;
            if (matchSearch && matchHide) {
              const loc = (it.location || 'General').trim() || 'General';
              if (!grouped[loc]) grouped[loc] = [];
              grouped[loc].push(it);
            }
          });

          Object.keys(grouped).forEach(loc => {
            grouped[loc].sort((a, b) => {
              if (a.completed !== b.completed) return a.completed ? 1 : -1;
              return (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' });
            });
          });

          const order = (this.state.uiPreferences && this.state.uiPreferences.locationOrder) || this.state.locationOrder || [];
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
        },
        hydrate(data) {
          const parseNum = (val, def = 0) => {
            if (typeof val === 'string') val = val.trim().replace(',', '.');
            const n = parseFloat(val);
            return (!isNaN(n) && isFinite(n)) ? n : def;
          };
          const normalizeItem = (it) => ({
            ...it,
            id: it.id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            name: String(it.name || 'Sin nombre'),
            quantity: parseNum(it.quantity, 1) > 0 ? parseNum(it.quantity, 1) : 1,
            unitPrice: parseNum(it.unitPrice, 0) >= 0 ? parseNum(it.unitPrice, 0) : 0,
            location: String(it.location || 'General'),
            category: String(it.category || 'General'),
            completed: Boolean(it.completed)
          });

          if (Array.isArray(data)) {
            this.state.items = data.filter(it => it && typeof it === 'object').map(normalizeItem);
          } else if (data && typeof data === 'object' && Array.isArray(data.items)) {
            this.state.items = data.items.filter(it => it && typeof it === 'object').map(normalizeItem);
            if (typeof data.budget === 'number') this.state.budget = data.budget;
          } else if (data && typeof data === 'object') {
            Object.assign(this.state, data);
          }
        },
        addItem(item) {
          const id = item.id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
          let rawQty = typeof item.quantity === 'string' ? item.quantity.trim().replace(',', '.') : item.quantity;
          let rawPrice = typeof item.unitPrice === 'string' ? item.unitPrice.trim().replace(',', '.') : item.unitPrice;
          const q = parseFloat(rawQty);
          const p = parseFloat(rawPrice);
          const newItem = { 
            ...item, 
            id, 
            quantity: (!isNaN(q) && isFinite(q) && q > 0) ? q : 1,
            unitPrice: (!isNaN(p) && isFinite(p) && p >= 0) ? p : 0,
            location: String(item.location || 'General'),
            category: String(item.category || 'General'),
            completed: Boolean(item.completed) 
          };
          this.state.items.unshift(newItem);
          return newItem;
        },
        updateItem(id, data) {
          const it = (this.state.items || []).find(i => i.id === id);
          if (it) Object.assign(it, data);
          return it;
        },
        deleteItem(id) {
          const idx = (this.state.items || []).findIndex(i => i.id === id);
          if (idx !== -1) return this.state.items.splice(idx, 1)[0];
          return null;
        },
        toggleCompleted(id) {
          const it = (this.state.items || []).find(i => i.id === id);
          if (it) it.completed = !it.completed;
          return it;
        },
        clearCompleted() {
          this.state.items = (this.state.items || []).filter(i => !i.completed);
        },
        setFilter(f) { 
          if (!f || typeof f !== 'object') return;
          let nextSearch = undefined;
          if (f.searchQuery !== undefined) {
            nextSearch = f.searchQuery === null ? '' : String(f.searchQuery);
          } else if (f.search !== undefined) {
            nextSearch = f.search === null ? '' : String(f.search);
          }
          if (nextSearch !== undefined) {
            this.state.filter.search = nextSearch;
            this.state.filter.searchQuery = nextSearch;
            this.state.filters.search = nextSearch;
            this.state.filters.searchQuery = nextSearch;
          }
          if (f.hideCompleted !== undefined) {
            const hide = Boolean(f.hideCompleted);
            this.state.filter.hideCompleted = hide;
            this.state.filters.hideCompleted = hide;
          }
        },
        setBudget(b) { this.state.budget = b; }
      };

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
          localStorage.setItem('shopping_items', JSON.stringify(remoteItems));
        } catch (_) {}

        renderUI();
      },
      err => {
        console.warn('[App] Error en listener Firestore:', err.message);
      }
    );
  }

  // --- 6. Controlador de Apache ECharts ---
  const chartDom = document.getElementById('categoryChart');
  let chartController = null;
  if (chartDom && ChartModule.ChartController) {
    chartController = new ChartModule.ChartController(chartDom, { echarts: window.echarts });
  }

  // --- 7. Gestión del Tema (Claro / Oscuro) ---
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (elements.themeToggle) {
      elements.themeToggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
      elements.themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
      elements.themeToggle.innerHTML = theme === 'dark' 
        ? '<i data-lucide="sun" aria-hidden="true"></i>' 
        : '<i data-lucide="moon" aria-hidden="true"></i>';
      if (window.lucide) window.lucide.createIcons();
    }
    if (store && typeof store.setTheme === 'function') {
      store.setTheme(theme);
    }
    if (typeof window.MapRouteService !== 'undefined' && MapRouteService.setTheme) {
      MapRouteService.setTheme(theme === 'dark');
    }
    renderUI();
  }

  const savedTheme = localStorage.getItem('theme') || initialTheme || 'light';
  applyTheme(savedTheme);

  if (elements.themeToggle) {
    elements.themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const nextTheme = current === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', nextTheme);
      applyTheme(nextTheme);
    });
  }

  // --- 8. Renderizado de la Interfaz de Usuario ---
  function renderUI() {
    const state = store.getState();
    const items = state.items || [];
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    // A. Analíticas Financieras
    let metrics = { totalPending: 0, totalSpent: 0, totalOverall: 0, budgetRemaining: 0, budgetPercentage: 0 };
    if (AnalyticsModule.calculateMetrics) {
      metrics = AnalyticsModule.calculateMetrics(items, state.budget);
    } else {
      let pending = 0;
      items.forEach(it => { if (!it.completed) pending += (Number(it.unitPrice) || 0) * (Number(it.quantity) || 1); });
      metrics.totalPending = Math.round(pending * 100) / 100;
    }

    // B. Tarjetas de Estadísticas
    if (elements.grandTotalValue) {
      elements.grandTotalValue.textContent = `$${metrics.totalPending.toFixed(2)}`;
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

    // C. Gráfico de Categorías en Apache ECharts
    if (chartController) {
      let breakdown = {};
      if (AnalyticsModule.getCategoryBreakdown) {
        breakdown = AnalyticsModule.getCategoryBreakdown(items);
      }
      chartController.render(breakdown, items, isDark);
    }

    // D. Sugerencias de Autocompletado
    const distinctLocs = [...new Set(items.map(it => (it.location || '').trim()).filter(Boolean))].sort();
    const distinctCats = [...new Set(items.map(it => (it.category || '').trim()).filter(Boolean))].sort();

    if (elements.locationSuggestions) {
      elements.locationSuggestions.innerHTML = distinctLocs.map(l => `<option value="${l}">`).join('');
    }
    if (elements.categorySuggestions) {
      elements.categorySuggestions.innerHTML = distinctCats.map(c => `<option value="${c}">`).join('');
    }

    // E. Lista de Productos
    renderShoppingList(state);

    // F. Actualización del Módulo de Rutas y Mapa
    updateMapRouteUI();
  };

  const normalizeSearchText = (str) => String(str === null || str === undefined ? '' : str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  const renderShoppingList = (state) => {
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
      if (window.lucide) window.lucide.createIcons();
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

      const toggleCollapse = () => {
        if (typeof store.toggleGroupCollapse === 'function') {
          store.toggleGroupCollapse(loc);
        } else {
          groupDiv.classList.toggle('collapsed');
        }
      };

      header.addEventListener('click', toggleCollapse);
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleCollapse();
        }
      });

      const listDiv = document.createElement('div');
      listDiv.className = 'shopping-list';

      itemsInGroup.forEach(item => {
        listDiv.appendChild(createItemCard(item));
      });

      groupDiv.appendChild(header);
      groupDiv.appendChild(listDiv);
      elements.shoppingListContainer.appendChild(groupDiv);
    });

    if (window.lucide) window.lucide.createIcons();
  };

  const createItemCard = (item) => {
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
      <input type="checkbox" class="item-checkbox" ${item.completed ? 'checked' : ''} aria-label="Marcar ${safeName} como comprado">
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
        <button type="button" class="btn-icon edit-btn" aria-label="Editar producto ${safeName}" title="Editar">
          <i data-lucide="edit-3"></i>
        </button>
        <button type="button" class="btn-icon btn-danger del-btn" aria-label="Eliminar producto ${safeName}" title="Eliminar">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    `;

    // Marcar/Desmarcar como comprado
    const chk = card.querySelector('.item-checkbox');
    chk.addEventListener('change', async () => {
      let nextCompleted = !item.completed;
      if (typeof store.toggleCompleted === 'function') {
        const toggled = store.toggleCompleted(item.id);
        if (toggled) nextCompleted = toggled.completed;
      } else {
        item.completed = nextCompleted;
        renderUI();
      }

      if (isFirebaseActive && itemsCollection) {
        try {
          await itemsCollection.doc(item.id).set({ 
            completed: nextCompleted,
            updatedAt: Date.now()
          }, { merge: true });
        } catch (e) {
          console.warn('[App] Error al actualizar estado en Firebase:', e);
        }
      }
    });

    // Iniciar edición
    const editBtn = card.querySelector('.edit-btn');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startEditingItem(item);
    });

    // Eliminar con Toast de Deshacer
    const delBtn = card.querySelector('.del-btn');
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const removedSnapshot = { ...item };

      if (typeof store.deleteItem === 'function') {
        store.deleteItem(item.id);
      } else {
        store.state.items = (store.state.items || []).filter(i => i.id !== item.id);
        renderUI();
      }

      if (isFirebaseActive && itemsCollection) {
        try {
          await itemsCollection.doc(item.id).delete();
        } catch (err) {
          console.warn('[App] Error al eliminar de Firebase:', err);
        }
      }

      if (FeedbackModule.showUndoToast) {
        FeedbackModule.showUndoToast(`"${removedSnapshot.name}" eliminado`, async () => {
          if (typeof store.undoLastAction === 'function') {
            store.undoLastAction();
          } else {
            store.state.items.push(removedSnapshot);
            renderUI();
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
    });

    return card;
  };

  // --- 9. Modo Edición ---
  let currentEditingId = null;

  const startEditingItem = (item) => {
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
      if (window.lucide) window.lucide.createIcons();
    }

    elements.itemInput.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEditing = () => {
    currentEditingId = null;
    if (store && typeof store.setEditingItem === 'function') {
      store.setEditingItem(null);
    }
    clearInputs();
    if (elements.addItemButton) {
      elements.addItemButton.innerHTML = `<i data-lucide="plus-circle"></i><span>Añadir</span>`;
      if (window.lucide) window.lucide.createIcons();
    }
  };

  const clearInputs = () => {
    if (elements.itemInput) elements.itemInput.value = '';
    if (elements.quantityInput) elements.quantityInput.value = '1';
    if (elements.unitPriceInput) elements.unitPriceInput.value = '';
    if (elements.locationInput) elements.locationInput.value = '';
    if (elements.categoryInput) elements.categoryInput.value = '';
  };

  // --- 10. Formulario de Añadir / Guardar ---
  const handleFormSubmit = async () => {
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
          renderUI();
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
          renderUI();

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
      renderUI();
    }
  };

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

  // --- 12. Filtros y Búsqueda ---
  if (elements.searchInput) {
    const onSearchChange = (e) => {
      const val = e.target.value || '';
      store.setFilter({ search: val, searchQuery: val });
      renderUI();
    };
    elements.searchInput.addEventListener('input', onSearchChange);
    elements.searchInput.addEventListener('search', onSearchChange);
  }

  if (elements.hideCompletedSwitch) {
    elements.hideCompletedSwitch.addEventListener('change', (e) => {
      store.setFilter({ hideCompleted: e.target.checked });
      renderUI();
    });
  }

  // --- 13. Presupuesto Reactivo ---
  if (elements.budgetInput) {
    elements.budgetInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 0;
      store.setBudget(val);
      localStorage.setItem('budget', String(val));
      renderUI();
    });
  }

  // --- 14. Limpiar Comprados ---
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
      renderUI();

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
          renderUI();

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
          result.items.forEach(it => {
            if (typeof store.addItem === 'function') store.addItem(it);
            else store.state.items.push(it);
          });
        }
        renderUI();

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
        localStorage.setItem('locationOrder', JSON.stringify(newOrder));
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

  // A. Actualización de Métricas y Renderizado de Ruta en el Mapa
  function updateMapRouteUI() {
    if (typeof window.MapRouteService === 'undefined' || !MapRouteService.calculateOptimalRoute) return;
    const items = (typeof store.getItems === 'function' ? store.getItems() : (store.getState() && store.getState().items)) || [];
    const currentOrigin = (typeof MapRouteService.getOrigin === 'function') ? MapRouteService.getOrigin() : null;
    const route = MapRouteService.calculateOptimalRoute(items, currentOrigin);

    if (typeof MapRouteService.renderRouteOnMap === 'function') {
      MapRouteService.renderRouteOnMap(route);
    }

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
  }

  // B. Selector Ágil de Vistas (Conmutación Sincronizada Desktop & Mobile)
  function switchView(viewName) {
    const isList = viewName === 'list';
    const isStats = viewName === 'stats';
    const isMap = viewName === 'map';

    // Sincronización Pestañas Desktop
    setTabSelected(elements.tabList, isList);
    setTabSelected(elements.tabStats, isStats);
    setTabSelected(elements.tabMap, isMap);

    // Sincronización Barra Inferior Móvil (Bottom Navigation)
    setTabSelected(elements.bottomTabList, isList);
    setTabSelected(elements.bottomTabStats, isStats);
    setTabSelected(elements.bottomTabMap, isMap);

    // Alternar Paneles de Contenido
    setPanelVisibility(elements.panelList, isList);
    setPanelVisibility(elements.panelStats, isStats);
    setPanelVisibility(elements.panelMap, isMap);

    // Anuncio WAI-ARIA
    if (elements.ariaAnnouncer) {
      const labels = { list: 'Lista de Compras', stats: 'Estadísticas Financieras', map: 'Ruta en Mapa' };
      elements.ariaAnnouncer.textContent = `Mostrando vista: ${labels[viewName] || viewName}`;
    }

    // Ajuste de Viewport al mostrar mapa o gráfico
    if (isMap) {
      if (typeof window.MapRouteService !== 'undefined' && MapRouteService.mapController) {
        setTimeout(() => {
          MapRouteService.mapController.invalidateSize();
        }, 60);
      }
      updateMapRouteUI();
    } else if (isStats) {
      if (chartController && typeof chartController.resize === 'function') {
        setTimeout(() => {
          chartController.resize();
        }, 60);
      }
    }
  }

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
    btn.addEventListener('click', () => switchView(view));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        switchView(view);
      }
    });
  });

  // C. Inicialización de MapRouteService y Leaflet
  if (typeof window.MapRouteService !== 'undefined' && MapRouteService.initMap) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    MapRouteService.initMap('map-container', { isDark });
  }

  // D. Conexión del Botón GPS
  if (elements.btnGpsOrigin) {
    elements.btnGpsOrigin.addEventListener('click', async () => {
      if (typeof window.MapRouteService === 'undefined' || !MapRouteService.getCurrentLocation) return;
      const originalHtml = elements.btnGpsOrigin.innerHTML;
      elements.btnGpsOrigin.innerHTML = `<i data-lucide="loader-2" class="spin"></i><span>Detectando...</span>`;
      if (window.lucide) window.lucide.createIcons();

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
        if (window.lucide) window.lucide.createIcons();
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
      if (window.lucide) window.lucide.createIcons();

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
        if (window.lucide) window.lucide.createIcons();
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

  // Primer renderizado
  renderUI();
});
