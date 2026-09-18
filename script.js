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
    shoppingListContainer: document.getElementById('shoppingListContainer')
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

  try {
    if (typeof firebase !== 'undefined' && window.firebaseConfig) {
      const cfg = window.firebaseConfig;
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

  const store = StoreClass 
    ? new StoreClass({
        items: initialItems,
        budget: initialBudget,
        theme: initialTheme,
        filters: { search: '', hideCompleted: false },
        uiPreferences: { locationOrder: initialLocationOrder, collapsedGroups: initialCollapsed }
      })
    : {
        state: { items: initialItems, budget: initialBudget, filters: { search: '', hideCompleted: false }, uiPreferences: { locationOrder: initialLocationOrder, collapsedGroups: initialCollapsed } },
        getState() { return this.state; },
        on() {},
        hydrate(data) { Object.assign(this.state, data); },
        setFilter(f) { Object.assign(this.state.filters, f); },
        setBudget(b) { this.state.budget = b; }
      };

  // --- 5. Sincronización en Tiempo Real con Firebase Firestore ---
  if (isFirebaseActive && itemsCollection) {
    itemsCollection.orderBy('timestamp', 'desc').onSnapshot(
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
            quantity: parseFloat(d.quantity) || 1,
            unitPrice: parseFloat(d.unitPrice) || 0,
            category: d.category || 'General',
            location: d.location || 'General',
            completed: Boolean(d.completed),
            timestamp: ts
          };
        });

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
  const applyTheme = (theme) => {
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
    renderUI();
  };

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
  const renderUI = () => {
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
  };

  const renderShoppingList = (state) => {
    if (!elements.shoppingListContainer) return;

    let grouped = {};
    if (typeof store.getGroupedItems === 'function') {
      grouped = store.getGroupedItems();
    } else {
      const query = (state.filters?.search || '').toLowerCase();
      const hideCompleted = Boolean(state.filters?.hideCompleted);

      (state.items || []).forEach(it => {
        const matchSearch = !query || ((it.name || '') + (it.location || '') + (it.category || '')).toLowerCase().includes(query);
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

    const collapsedSet = new Set(state.uiPreferences?.collapsedGroups || []);

    locations.forEach(loc => {
      const itemsInGroup = grouped[loc];
      const isCollapsed = collapsedSet.has(loc);

      const groupDiv = document.createElement('div');
      groupDiv.className = `location-group ${isCollapsed ? 'collapsed' : ''}`;
      groupDiv.dataset.location = loc;

      const header = document.createElement('div');
      header.className = 'group-header';
      header.setAttribute('role', 'button');
      header.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
      header.setAttribute('tabindex', '0');
      header.innerHTML = `
        <div class="group-title">
          <i data-lucide="grip-vertical" style="opacity: 0.35;" aria-hidden="true"></i>
          <i data-lucide="chevron-down" class="collapse-icon" aria-hidden="true"></i>
          <h2>${loc}</h2>
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

    let avatarMarkup = '';
    if (AvatarsModule.getAvatarMarkup) {
      avatarMarkup = AvatarsModule.getAvatarMarkup(item.category, item.name);
    } else {
      avatarMarkup = `<div class="product-avatar"><i data-lucide="package"></i></div>`;
    }

    card.innerHTML = `
      ${avatarMarkup}
      <input type="checkbox" class="item-checkbox" ${item.completed ? 'checked' : ''} aria-label="Marcar ${item.name} como comprado">
      <div class="item-info">
        <span class="item-name" title="${item.name}">${item.name}</span>
        <div class="item-sub">
          <span>${item.quantity} un.</span>
          ${item.unitPrice > 0 ? `<span>• $${Number(item.unitPrice).toFixed(2)} c/u</span>` : ''}
          <span class="item-category-tag">${item.category || 'General'}</span>
        </div>
      </div>
      <div class="item-price">$${totalItemPrice.toFixed(2)}</div>
      <div class="item-actions">
        <button type="button" class="btn-icon edit-btn" aria-label="Editar producto ${item.name}" title="Editar">
          <i data-lucide="edit-3"></i>
        </button>
        <button type="button" class="btn-icon btn-danger del-btn" aria-label="Eliminar producto ${item.name}" title="Eliminar">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    `;

    // Marcar/Desmarcar como comprado
    const chk = card.querySelector('.item-checkbox');
    chk.addEventListener('change', async () => {
      const nextCompleted = !item.completed;
      if (isFirebaseActive && itemsCollection) {
        try {
          await itemsCollection.doc(item.id).update({ completed: nextCompleted });
        } catch (e) {
          console.warn('[App] Error al actualizar estado en Firebase:', e);
        }
      } else {
        if (typeof store.toggleCompleted === 'function') store.toggleCompleted(item.id);
        else { item.completed = nextCompleted; renderUI(); }
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

      if (isFirebaseActive && itemsCollection) {
        try {
          await itemsCollection.doc(item.id).delete();
        } catch (err) {
          console.warn('[App] Error al eliminar de Firebase:', err);
        }
      } else {
        if (typeof store.deleteItem === 'function') store.deleteItem(item.id);
        else {
          store.state.items = (store.state.items || []).filter(i => i.id !== item.id);
          renderUI();
        }
      }

      if (FeedbackModule.showUndoToast) {
        FeedbackModule.showUndoToast(`"${removedSnapshot.name}" eliminado`, async () => {
          if (isFirebaseActive && itemsCollection) {
            try {
              await itemsCollection.doc(removedSnapshot.id).set(removedSnapshot);
            } catch (err) {
              console.warn('[App] Error al restaurar en Firebase:', err);
            }
          } else {
            if (typeof store.undoLastAction === 'function') store.undoLastAction();
            else { store.state.items.push(removedSnapshot); renderUI(); }
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
        const firestoreData = {
          name: clean.name,
          quantity: clean.quantity,
          unitPrice: clean.unitPrice,
          location: clean.location,
          category: clean.category,
          completed: false,
          timestamp: (firebase.firestore && firebase.firestore.FieldValue) 
            ? firebase.firestore.FieldValue.serverTimestamp() 
            : Date.now()
        };

        if (currentEditingId) {
          await itemsCollection.doc(currentEditingId).update(firestoreData);
          cancelEditing();
          if (FeedbackModule.showToast) FeedbackModule.showToast('Producto actualizado en Firebase', 'success');
        } else {
          await itemsCollection.add(firestoreData);
          clearInputs();
          if (elements.itemInput) elements.itemInput.focus();
        }
      } catch (err) {
        console.warn('[App] Error al escribir en Firebase:', err);
        if (FeedbackModule.showToast) FeedbackModule.showToast('Error de conexión a Firebase', 'error');
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
    elements.searchInput.addEventListener('input', (e) => {
      store.setFilter({ search: e.target.value });
      renderUI();
    });
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
      } else {
        if (typeof store.clearCompleted === 'function') store.clearCompleted();
        renderUI();
      }

      if (window.confetti) {
        window.confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
      }

      if (FeedbackModule.showUndoToast) {
        FeedbackModule.showUndoToast(`Se limpiaron ${completedItems.length} productos comprados`, async () => {
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
          } else {
            if (typeof store.undoLastAction === 'function') store.undoLastAction();
            renderUI();
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
          }
        } else {
          if (mode === 'overwrite') {
            store.hydrate(result.items);
          } else {
            result.items.forEach(it => store.addItem(it));
          }
          renderUI();
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

  // Primer renderizado
  renderUI();
});
