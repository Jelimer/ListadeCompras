/**
 * script.js
 * Orquestador Principal y Controlador de UI para Lista de Compra | PRO.
 * Arquitectura desacoplada en capas: Storage, Reactive Store, Analytics, Chart, Export/Import y Feedback.
 * 100% Offline-First, Accesible (WCAG AA/AAA) y Resiliente.
 */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  // --- 1. Referencias al DOM ---
  const elements = {
    // Formulario de Ingesta
    itemInput: document.getElementById('itemInput'),
    quantityInput: document.getElementById('quantityInput'),
    unitPriceInput: document.getElementById('unitPriceInput'),
    locationInput: document.getElementById('locationInput'),
    categoryInput: document.getElementById('categoryInput'),
    addItemButton: document.getElementById('addItemButton'),

    // Sugerencias Datalist
    locationSuggestions: document.getElementById('location-suggestions'),
    categorySuggestions: document.getElementById('category-suggestions'),

    // Filtros y Búsqueda
    searchInput: document.getElementById('searchInput'),
    hideCompletedSwitch: document.getElementById('hideCompletedSwitch'),

    // Acciones de Cabecera
    themeToggle: document.getElementById('themeToggle'),
    exportButton: document.getElementById('exportButton'),
    importButton: document.getElementById('importButton'),
    importFileInput: document.getElementById('importFileInput'),

    // Panel de Estadísticas y Presupuesto
    budgetInput: document.getElementById('budgetInput'),
    budgetProgressBar: document.getElementById('budgetProgressBar'),
    budgetStats: document.getElementById('budgetStats'),
    grandTotalValue: document.getElementById('grandTotalValue'),
    resetListButton: document.getElementById('resetListButton'),

    // Contenedor Principal de la Lista
    shoppingListContainer: document.getElementById('shoppingListContainer')
  };

  // --- 2. Acceso a Módulos UMD ---
  const StorageModule = window.ShoppingStorage || {};
  const StateModule = window.ShoppingState || {};
  const ValidationModule = window.ShoppingValidation || {};
  const AvatarsModule = window.ShoppingAvatars || {};
  const AnalyticsModule = window.ShoppingAnalytics || {};
  const ChartModule = window.ShoppingChart || {};
  const ExportImportModule = window.ShoppingExportImport || {};
  const FeedbackModule = window.ShoppingFeedback || {};

  // --- 3. Inicialización de Almacenamiento y Store ---
  let storageService = null;
  if (typeof StorageModule.createDefaultStorageService === 'function') {
    storageService = StorageModule.createDefaultStorageService();
  }

  // Carga inicial de datos desde persistencia local o Firebase
  let initialItems = [];
  let initialBudget = 0;
  let initialTheme = 'light';
  let initialLocationOrder = [];
  let initialCollapsed = [];

  if (storageService) {
    try {
      initialItems = await storageService.loadItems();
    } catch (e) {
      console.warn('[App] No se pudieron cargar items de storage, iniciando vacío:', e);
      initialItems = [];
    }
    initialBudget = storageService.loadBudget() || 0;
    initialTheme = storageService.loadTheme() || 'light';
    initialLocationOrder = storageService.loadLocationOrder() || [];
    initialCollapsed = storageService.loadCollapsedGroups() || [];
  } else {
    try {
      initialItems = JSON.parse(localStorage.getItem('shopping_items') || '[]');
      initialBudget = parseFloat(localStorage.getItem('budget')) || 0;
      initialTheme = localStorage.getItem('theme') || 'light';
      initialLocationOrder = JSON.parse(localStorage.getItem('locationOrder') || '[]');
      initialCollapsed = JSON.parse(localStorage.getItem('collapsedGroups') || '[]');
    } catch (e) {
      initialItems = [];
    }
  }

  const store = new (StateModule.Store || class MockStore {
    constructor(init) { this.state = init; }
    getState() { return this.state; }
  })({
    items: initialItems,
    budget: initialBudget,
    theme: initialTheme,
    filters: { search: '', hideCompleted: false },
    uiPreferences: {
      locationOrder: initialLocationOrder,
      collapsedGroups: initialCollapsed
    }
  }, storageService);

  // --- 4. Controlador de Apache ECharts ---
  const chartDom = document.getElementById('categoryChart');
  let chartController = null;
  if (chartDom && ChartModule.ChartController) {
    chartController = new ChartModule.ChartController(chartDom, { echarts: window.echarts });
  }

  // --- 5. Gestión del Tema (Claro / Oscuro) ---
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

  // Detectar y aplicar preferencia de tema inicial
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

  // --- 6. Renderizado de la Interfaz de Usuario (UI) ---
  const renderUI = () => {
    const state = store.getState();
    const items = state.items || [];
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    // A. Analíticas Financieras (precisión en centavos)
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
        const sign = metrics.budgetRemaining < 0 ? '-' : '';
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

    // D. Actualizar sugerencias de autocompletado
    const distinctLocs = [...new Set(items.map(it => (it.location || '').trim()).filter(Boolean))].sort();
    const distinctCats = [...new Set(items.map(it => (it.category || '').trim()).filter(Boolean))].sort();

    if (elements.locationSuggestions) {
      elements.locationSuggestions.innerHTML = distinctLocs.map(l => `<option value="${l}">`).join('');
    }
    if (elements.categorySuggestions) {
      elements.categorySuggestions.innerHTML = distinctCats.map(c => `<option value="${c}">`).join('');
    }

    // E. Renderizado de la Lista Agrupada por Ubicación
    renderShoppingList(state);
  };

  const renderShoppingList = (state) => {
    if (!elements.shoppingListContainer) return;

    let grouped = {};
    if (typeof store.getGroupedItems === 'function') {
      grouped = store.getGroupedItems();
    } else {
      (state.items || []).forEach(it => {
        const loc = (it.location || 'General').trim() || 'General';
        if (!grouped[loc]) grouped[loc] = [];
        grouped[loc].push(it);
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

      header.addEventListener('click', () => {
        store.toggleGroupCollapse(loc);
      });
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          store.toggleGroupCollapse(loc);
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

    // Avatar local offline SVG/Lucide
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

    // Checkbox toggle
    const chk = card.querySelector('.item-checkbox');
    chk.addEventListener('change', () => {
      store.toggleCompleted(item.id);
    });

    // Botón Editar
    const editBtn = card.querySelector('.edit-btn');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startEditingItem(item);
    });

    // Botón Eliminar con Deshacer
    const delBtn = card.querySelector('.del-btn');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const removedName = item.name;
      store.deleteItem(item.id);

      if (FeedbackModule.showUndoToast) {
        FeedbackModule.showUndoToast(`"${removedName}" eliminado`, () => {
          store.undoLastAction();
        });
      }
    });

    return card;
  };

  // --- 7. Modo Edición ---
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

  // --- 8. Manejo de Ingesta (Añadir / Guardar) ---
  const handleFormSubmit = () => {
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
      validationRes = { isValid: !!rawData.name.trim(), cleanData: rawData };
    }

    if (!validationRes.isValid) {
      const errMsg = (validationRes.errors && validationRes.errors[0]) || 'Por favor verifica los datos ingresados.';
      if (FeedbackModule.showToast) {
        FeedbackModule.showToast(errMsg, 'error');
      } else {
        alert(errMsg);
      }
      elements.itemInput.focus();
      return;
    }

    const clean = validationRes.cleanData;

    if (currentEditingId) {
      store.updateItem(currentEditingId, clean);
      cancelEditing();
      if (FeedbackModule.showToast) FeedbackModule.showToast('Producto actualizado correctamente', 'success');
    } else {
      store.addItem(clean);
      clearInputs();
      if (elements.itemInput) elements.itemInput.focus();
    }
  };

  if (elements.addItemButton) {
    elements.addItemButton.addEventListener('click', handleFormSubmit);
  }

  // --- 9. Atajos de Teclado (F19) ---
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

  // --- 10. Filtros Reactivos (Búsqueda y Ocultar Comprados) ---
  if (elements.searchInput) {
    elements.searchInput.addEventListener('input', (e) => {
      store.setFilter({ search: e.target.value });
    });
  }

  if (elements.hideCompletedSwitch) {
    elements.hideCompletedSwitch.addEventListener('change', (e) => {
      store.setFilter({ hideCompleted: e.target.checked });
    });
  }

  // --- 11. Presupuesto Reactivo ---
  if (elements.budgetInput) {
    elements.budgetInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 0;
      store.setBudget(val);
    });
  }

  // --- 12. Limpiar Comprados con Confirmación y Deshacer ---
  if (elements.resetListButton) {
    elements.resetListButton.addEventListener('click', async () => {
      const state = store.getState();
      const completedCount = (state.items || []).filter(it => it.completed).length;

      if (completedCount === 0) {
        if (FeedbackModule.showToast) {
          FeedbackModule.showToast('No hay productos comprados para limpiar', 'info');
        }
        return;
      }

      const confirmed = await FeedbackModule.confirmClearCompleted(completedCount);
      if (confirmed) {
        store.clearCompleted();
        if (window.confetti) {
          window.confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        }
        if (FeedbackModule.showUndoToast) {
          FeedbackModule.showUndoToast(`Se limpiaron ${completedCount} productos comprados`, () => {
            store.undoLastAction();
          });
        }
      }
    });
  }

  // --- 13. Exportación e Importación de Listas ---
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
          text: 'Selecciona el formato de exportación:',
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

        if (mode === 'overwrite') {
          store.hydrate(result.items);
          if (result.budget > 0) store.setBudget(result.budget);
        } else {
          // Merge
          result.items.forEach(it => {
            store.addItem(it);
          });
          if (result.budget > 0) {
            const currentBudget = store.getState().budget || 0;
            if (currentBudget === 0) store.setBudget(result.budget);
          }
        }

        if (FeedbackModule.showToast) {
          FeedbackModule.showToast(`Se importaron ${result.items.length} productos con éxito`, 'success');
        }
      };

      reader.readAsText(file);
    });
  }

  // --- 14. Drag & Drop Reordenamiento con SortableJS ---
  if (window.Sortable && elements.shoppingListContainer) {
    new window.Sortable(elements.shoppingListContainer, {
      animation: 150,
      handle: '.group-header',
      onEnd: () => {
        const newOrder = Array.from(elements.shoppingListContainer.querySelectorAll('.location-group'))
          .map(g => g.dataset.location);
        store.reorderLocations(newOrder);
      }
    });
  }

  // --- 15. Suscripción a Cambios del Store ---
  store.on('state:changed', () => {
    renderUI();
  });

  // Primer renderizado
  renderUI();
});
