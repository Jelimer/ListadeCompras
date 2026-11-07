import React, { useState, useMemo } from 'react';
import {
  Package,
  Store,
  Search,
  Filter,
  AlertTriangle,
  GitMerge,
  Edit2,
  Trash2,
  Check,
  X,
  MapPin,
  ChevronDown,
  ChevronRight,
  Plus,
  Compass,
  ArrowRight,
  RotateCcw,
  Tag,
  Building2,
  ExternalLink,
} from 'lucide-react';
import { ShoppingItem, StoredStoreCoordinate } from '../types';
import { getCategoryIcon } from '../utils/categoryIcons';
import { formatSkuCode, loadStoredCoordinates, removeStoreCoordinate } from '../utils/storage';
import { formatMoney, formatNumber, parseLocaleNumber } from '../utils/formatters';
import {
  detectDuplicateGroups,
  mergeTwoProducts,
  DuplicateGroup,
  normalizeProductName,
} from '../utils/duplicates';

interface ManageViewProps {
  items: ShoppingItem[];
  onUpdateItem: (id: string, updates: Partial<ShoppingItem>) => void;
  onDeleteItem: (id: string) => void;
  onAddItem: (item: Omit<ShoppingItem, 'id' | 'timestamp' | 'updatedAt'>) => void;
  onMergeItems: (primaryId: string, duplicateId: string) => void;
  onRenameStore: (oldStoreName: string, newStoreName: string) => void;
  onMergeStores: (sourceStoreName: string, targetStoreName: string) => void;
  onEditStoreLocation: (storeName: string) => void;
  theme: 'light' | 'dark';
}

export const ManageView: React.FC<ManageViewProps> = ({
  items,
  onUpdateItem,
  onDeleteItem,
  onAddItem,
  onMergeItems,
  onRenameStore,
  onMergeStores,
  onEditStoreLocation,
}) => {
  const [activeTab, setActiveTab] = useState<'products' | 'stores'>('products');

  // Filtros de Productos
  const [productSearch, setProductSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [storeFilter, setStoreFilter] = useState('ALL');
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);

  // Edición Inline de Producto
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSku, setEditSku] = useState('');
  const [editCat, setEditCat] = useState('');
  const [editLoc, setEditLoc] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editPrice, setEditPrice] = useState('');

  // Modal / Diálogo de Fusión de Productos
  const [mergeModalGroup, setMergeModalGroup] = useState<DuplicateGroup | null>(null);
  const [mergePrimaryId, setMergePrimaryId] = useState<string | null>(null);

  // Filtros y Estados de Locales / Comercios
  const [storeSearch, setStoreSearch] = useState('');
  const [onlyWithoutLocation, setOnlyWithoutLocation] = useState(false);
  const [expandedStoreProducts, setExpandedStoreProducts] = useState<Set<string>>(new Set());

  // Diálogo de Renombrar Local
  const [renamingStore, setRenamingStore] = useState<string | null>(null);
  const [newStoreName, setNewStoreName] = useState('');

  // Diálogo de Fusionar Comercios
  const [mergingStoreSource, setMergingStoreSource] = useState<string | null>(null);
  const [mergingStoreTarget, setMergingStoreTarget] = useState<string>('');

  // Coordenadas guardadas en localStorage
  const storedCoords = useMemo(() => loadStoredCoordinates(), [items]);

  // Lista de comercios detectados
  const distinctStores = useMemo(() => {
    const storeMap = new Map<string, { name: string; productCount: number; pendingCount: number; subtotal: number }>();
    for (const it of items) {
      const loc = (it.location && it.location.trim()) || 'General';
      const existing = storeMap.get(loc.toLowerCase()) || {
        name: loc,
        productCount: 0,
        pendingCount: 0,
        subtotal: 0,
      };
      existing.productCount += 1;
      if (!it.completed) {
        existing.pendingCount += 1;
        existing.subtotal += (Number(it.unitPrice) || 0) * (Number(it.quantity) || 1);
      }
      storeMap.set(loc.toLowerCase(), existing);
    }
    return Array.from(storeMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [items]);

  // Categorías distintas
  const distinctCategories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.category && i.category.trim()) set.add(i.category.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [items]);

  // Detección de duplicados
  const duplicateGroups = useMemo(() => detectDuplicateGroups(items), [items]);
  const duplicateItemIds = useMemo(() => {
    const ids = new Set<string>();
    duplicateGroups.forEach((g) => g.items.forEach((it) => ids.add(it.id)));
    return ids;
  }, [duplicateGroups]);

  // Productos filtrados
  const filteredItems = useMemo(() => {
    const q = productSearch.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const skuQ = q.replace(/^#/, '');

    return items.filter((it, idx) => {
      if (onlyDuplicates && !duplicateItemIds.has(it.id)) {
        return false;
      }
      if (categoryFilter !== 'ALL' && it.category !== categoryFilter) {
        return false;
      }
      if (storeFilter !== 'ALL' && it.location !== storeFilter) {
        return false;
      }
      if (!q) return true;

      const sku = (it.skuCode || formatSkuCode(it.seqNumber || idx + 1)).toLowerCase();
      const skuDigits = sku.replace('#', '');
      const name = (it.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const loc = (it.location || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const cat = (it.category || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      return (
        name.includes(q) ||
        sku.includes(q) ||
        (skuQ && skuDigits.includes(skuQ)) ||
        loc.includes(q) ||
        cat.includes(q)
      );
    });
  }, [items, productSearch, categoryFilter, storeFilter, onlyDuplicates, duplicateItemIds]);

  // Comercios filtrados
  const filteredStores = useMemo(() => {
    const q = storeSearch.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return distinctStores.filter((st) => {
      const coord = storedCoords[st.name.toLowerCase().trim()];
      const hasCoord = Boolean(coord && coord.lat && coord.lng);
      if (onlyWithoutLocation && hasCoord) {
        return false;
      }
      if (!q) return true;
      const matchName = st.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q);
      const matchAddr = coord?.address?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q);
      return matchName || matchAddr;
    });
  }, [distinctStores, storeSearch, onlyWithoutLocation, storedCoords]);

  // Manejo de edición inline
  const startEditItem = (item: ShoppingItem) => {
    setEditingItemId(item.id);
    setEditName(item.name);
    setEditSku(item.skuCode || '');
    setEditCat(item.category || 'General');
    setEditLoc(item.location || 'General');
    setEditQty(String(item.quantity || 1));
    setEditPrice(item.unitPrice > 0 ? String(item.unitPrice) : '');
  };

  const saveEditItem = (id: string) => {
    if (!editName.trim()) return;
    const parsedQty = parseLocaleNumber(editQty);
    const parsedPrice = parseLocaleNumber(editPrice);

    onUpdateItem(id, {
      name: editName.trim(),
      skuCode: editSku.trim() || undefined,
      category: editCat.trim() || 'General',
      location: editLoc.trim() || 'General',
      quantity: parsedQty > 0 ? Math.round(parsedQty * 1000) / 1000 : 1,
      unitPrice: parsedPrice >= 0 ? Math.round(parsedPrice * 100) / 100 : 0,
      updatedAt: Date.now(),
    });

    setEditingItemId(null);
  };

  // Manejo de fusión de productos duplicados
  const handleOpenMergeModal = (group: DuplicateGroup) => {
    setMergeModalGroup(group);
    setMergePrimaryId(group.items[0]?.id || null);
  };

  const handleConfirmMerge = () => {
    if (!mergeModalGroup || !mergePrimaryId) return;
    const secondaryItems = mergeModalGroup.items.filter((it) => it.id !== mergePrimaryId);
    for (const sec of secondaryItems) {
      onMergeItems(mergePrimaryId, sec.id);
    }
    setMergeModalGroup(null);
    setMergePrimaryId(null);
  };

  // Manejo de renombrado de comercios
  const handleStartRenameStore = (store: string) => {
    setRenamingStore(store);
    setNewStoreName(store);
  };

  const handleConfirmRenameStore = () => {
    if (!renamingStore || !newStoreName.trim()) return;
    if (renamingStore.trim().toLowerCase() !== newStoreName.trim().toLowerCase()) {
      onRenameStore(renamingStore, newStoreName.trim());
    }
    setRenamingStore(null);
    setNewStoreName('');
  };

  // Manejo de fusión de comercios
  const handleStartMergeStores = (sourceStore: string) => {
    setMergingStoreSource(sourceStore);
    const otherStores = distinctStores.filter(
      (s) => s.name.toLowerCase() !== sourceStore.toLowerCase()
    );
    setMergingStoreTarget(otherStores[0]?.name || '');
  };

  const handleConfirmMergeStores = () => {
    if (!mergingStoreSource || !mergingStoreTarget) return;
    onMergeStores(mergingStoreSource, mergingStoreTarget);
    setMergingStoreSource(null);
    setMergingStoreTarget('');
  };

  const toggleStoreExpand = (storeName: string) => {
    const next = new Set(expandedStoreProducts);
    if (next.has(storeName)) {
      next.delete(storeName);
    } else {
      next.add(storeName);
    }
    setExpandedStoreProducts(next);
  };

  return (
    <section
      id="panel-manage"
      className="view-panel active manage-view-container"
      role="tabpanel"
      aria-labelledby="tab-manage"
      tabIndex={0}
    >
      {/* Subnavegación de Gestión */}
      <div className="manage-header-tabs" role="tablist">
        <button
          type="button"
          className={`manage-tab-btn ${activeTab === 'products' ? 'active' : ''}`}
          role="tab"
          aria-selected={activeTab === 'products'}
          onClick={() => setActiveTab('products')}
        >
          <Package size={17} aria-hidden="true" />
          <span>Revisión y Catálogo de Productos</span>
          <span className="manage-tab-badge tabular-nums">{items.length}</span>
          {duplicateGroups.length > 0 && (
            <span
              className="badge-warning-pill tabular-nums"
              title={`${duplicateGroups.length} grupos de posibles duplicados detectados`}
            >
              ⚠️ {duplicateGroups.length}
            </span>
          )}
        </button>

        <button
          type="button"
          className={`manage-tab-btn ${activeTab === 'stores' ? 'active' : ''}`}
          role="tab"
          aria-selected={activeTab === 'stores'}
          onClick={() => setActiveTab('stores')}
        >
          <Building2 size={17} aria-hidden="true" />
          <span>Gestión de Locales y Ubicaciones</span>
          <span className="manage-tab-badge tabular-nums">{distinctStores.length}</span>
        </button>
      </div>

      {/* ====================================================================
          PESTAÑA 1: CATÁLOGO DE PRODUCTOS Y DETECCIÓN DE DUPLICADOS
          ==================================================================== */}
      {activeTab === 'products' && (
        <div className="manage-tab-content">
          {/* Métricas del Catálogo */}
          <div className="manage-metrics-grid">
            <div className="manage-metric-card">
              <span className="metric-label">Total Productos</span>
              <span className="metric-value tabular-nums">{formatNumber(items.length, 0)}</span>
              <small className="metric-sub">en base de datos</small>
            </div>

            <div
              className={`manage-metric-card ${duplicateGroups.length > 0 ? 'card-warning-alert' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setOnlyDuplicates(!onlyDuplicates)}
              title="Haga clic para filtrar solo duplicados"
            >
              <div className="metric-header-flex">
                <span className="metric-label">Posibles Duplicados</span>
                {duplicateGroups.length > 0 && (
                  <AlertTriangle size={16} className="text-warning" aria-hidden="true" />
                )}
              </div>
              <span className="metric-value tabular-nums text-warning">
                {duplicateGroups.length}
              </span>
              <small className="metric-sub">
                {onlyDuplicates ? 'Filtro activo (clic para quitar)' : 'clic para ver y corregir'}
              </small>
            </div>

            <div className="manage-metric-card">
              <span className="metric-label">Categorías</span>
              <span className="metric-value tabular-nums">{distinctCategories.length}</span>
              <small className="metric-sub">distribuidas</small>
            </div>

            <div className="manage-metric-card">
              <span className="metric-label">Locales Asignados</span>
              <span className="metric-value tabular-nums">{distinctStores.length}</span>
              <small className="metric-sub">comercios registrados</small>
            </div>
          </div>

          {/* Banner de alerta de duplicados detectados */}
          {duplicateGroups.length > 0 && (
            <div className="duplicate-alert-banner">
              <div className="alert-banner-left">
                <AlertTriangle size={20} className="text-warning" aria-hidden="true" />
                <div>
                  <strong>
                    Se han detectado {duplicateGroups.length} posibles grupos de productos duplicados o con nombres similares.
                  </strong>
                  <p>
                    Revisa los grupos a continuación para unificarlos bajo un mismo ID permanente y evitar duplicar entradas.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className={`btn btn-sm ${onlyDuplicates ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setOnlyDuplicates(!onlyDuplicates)}
              >
                {onlyDuplicates ? 'Ver todos los productos' : 'Filtrar solo duplicados'}
              </button>
            </div>
          )}

          {/* Tarjetas de grupos de duplicados cuando el filtro está activo o hay duplicados */}
          {onlyDuplicates && duplicateGroups.length > 0 && (
            <div className="duplicate-groups-container">
              <h3 className="section-title">
                Grupos de duplicados detectados ({duplicateGroups.length})
              </h3>
              {duplicateGroups.map((group) => (
                <div key={group.id} className="duplicate-group-card">
                  <div className="group-card-header">
                    <div className="group-header-info">
                      <span className="group-reason-badge">{group.reasonLabel}</span>
                      <h4 className="group-title">"{group.representativeName}"</h4>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary btn-merge-action"
                      onClick={() => handleOpenMergeModal(group)}
                    >
                      <GitMerge size={15} aria-hidden="true" />
                      <span>Fusionar en uno solo</span>
                    </button>
                  </div>

                  <div className="group-items-list">
                    {group.items.map((it) => {
                      const CatIcon = getCategoryIcon(it.category);
                      return (
                        <div key={it.id} className="group-item-row">
                          <span className="item-sku-code tabular-nums">{it.skuCode}</span>
                          <div className="group-item-cat">
                            <CatIcon size={14} />
                            <span>{it.category || 'General'}</span>
                          </div>
                          <span className="group-item-name">{it.name}</span>
                          <span className="group-item-loc">📍 {it.location || 'General'}</span>
                          <span className="group-item-qty tabular-nums">
                            {formatNumber(it.quantity)} un.
                          </span>
                          {it.unitPrice > 0 && (
                            <span className="group-item-price tabular-nums">
                              {formatMoney(it.unitPrice)}
                            </span>
                          )}
                          <span className={`status-pill ${it.completed ? 'completed' : 'pending'}`}>
                            {it.completed ? 'Comprado' : 'Pendiente'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Barra de Búsqueda y Filtros */}
          <div className="manage-toolbar">
            <div className="manage-search-wrap">
              <Search size={17} className="search-icon" aria-hidden="true" />
              <input
                type="search"
                className="manage-search-input"
                placeholder="Buscar por nombre de producto, #SKU (#001), comercio o categoría..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
              {productSearch && (
                <button
                  type="button"
                  className="btn-clear-search"
                  onClick={() => setProductSearch('')}
                  title="Limpiar búsqueda"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            <div className="manage-filter-selects">
              <div className="filter-select-wrap">
                <Tag size={15} className="filter-icon" />
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="manage-select"
                >
                  <option value="ALL">Todas las categorías ({distinctCategories.length})</option>
                  {distinctCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-select-wrap">
                <Store size={15} className="filter-icon" />
                <select
                  value={storeFilter}
                  onChange={(e) => setStoreFilter(e.target.value)}
                  className="manage-select"
                >
                  <option value="ALL">Todos los comercios ({distinctStores.length})</option>
                  {distinctStores.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Tabla / Lista de Productos */}
          <div className="manage-table-card">
            <div className="table-header-info">
              <span className="table-results-count">
                Mostrando <strong>{filteredItems.length}</strong> de {items.length} productos
              </span>
            </div>

            {filteredItems.length === 0 ? (
              <div className="manage-empty-state">
                <Package size={44} className="text-muted" />
                <h4>No se encontraron productos</h4>
                <p>Prueba ajustando los filtros o el término de búsqueda.</p>
              </div>
            ) : (
              <div className="manage-products-table">
                <div className="table-row table-header-row">
                  <div className="col-sku">#ID</div>
                  <div className="col-product">Producto</div>
                  <div className="col-cat">Categoría</div>
                  <div className="col-loc">Local / Negocio</div>
                  <div className="col-pricing">Cant. / Precio</div>
                  <div className="col-status">Estado</div>
                  <div className="col-actions">Acciones</div>
                </div>

                {filteredItems.map((item) => {
                  const isEditing = editingItemId === item.id;
                  const CatIcon = getCategoryIcon(item.category);
                  const isDup = duplicateItemIds.has(item.id);

                  if (isEditing) {
                    return (
                      <div key={item.id} className="table-row editing-table-row">
                        <div className="col-sku">
                          <input
                            type="text"
                            className="input-inline-sku"
                            value={editSku}
                            onChange={(e) => setEditSku(e.target.value)}
                            title="Código SKU / ID consecutivo"
                          />
                        </div>
                        <div className="col-product">
                          <input
                            type="text"
                            className="input-inline-name"
                            value={editName}
                            placeholder="Nombre del producto"
                            onChange={(e) => setEditName(e.target.value)}
                            autoFocus
                          />
                        </div>
                        <div className="col-cat">
                          <input
                            type="text"
                            list="manage-category-list"
                            className="input-inline-cat"
                            value={editCat}
                            placeholder="Categoría"
                            onChange={(e) => setEditCat(e.target.value)}
                          />
                          <datalist id="manage-category-list">
                            {distinctCategories.map((c) => (
                              <option key={c} value={c} />
                            ))}
                          </datalist>
                        </div>
                        <div className="col-loc">
                          <input
                            type="text"
                            list="manage-store-list"
                            className="input-inline-loc"
                            value={editLoc}
                            placeholder="Local / Negocio"
                            onChange={(e) => setEditLoc(e.target.value)}
                          />
                          <datalist id="manage-store-list">
                            {distinctStores.map((s) => (
                              <option key={s.name} value={s.name} />
                            ))}
                          </datalist>
                        </div>
                        <div className="col-pricing">
                          <input
                            type="text"
                            inputMode="decimal"
                            className="input-inline-qty"
                            value={editQty}
                            placeholder="Cant."
                            onChange={(e) => setEditQty(e.target.value)}
                          />
                          <input
                            type="text"
                            inputMode="decimal"
                            className="input-inline-price"
                            value={editPrice}
                            placeholder="$ Precio"
                            onChange={(e) => setEditPrice(e.target.value)}
                          />
                        </div>
                        <div className="col-status">
                          <span className="status-pill editing">Editando</span>
                        </div>
                        <div className="col-actions">
                          <button
                            type="button"
                            className="btn-action-icon btn-save"
                            title="Guardar cambios"
                            onClick={() => saveEditItem(item.id)}
                          >
                            <Check size={16} />
                          </button>
                          <button
                            type="button"
                            className="btn-action-icon btn-cancel"
                            title="Cancelar"
                            onClick={() => setEditingItemId(null)}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={item.id}
                      className={`table-row ${isDup ? 'is-duplicate-row' : ''}`}
                    >
                      <div className="col-sku">
                        <span className="item-sku-code tabular-nums">{item.skuCode}</span>
                      </div>

                      <div className="col-product">
                        <span className="product-table-name" title={item.name}>
                          {item.name}
                        </span>
                        {isDup && (
                          <span className="dup-badge-mini" title="Posible producto duplicado">
                            ⚠️ Duplicado
                          </span>
                        )}
                      </div>

                      <div className="col-cat">
                        <div className="cat-pill-badge" title={`Categoría: ${item.category}`}>
                          <CatIcon size={14} aria-hidden="true" />
                          <span>{item.category || 'General'}</span>
                        </div>
                      </div>

                      <div className="col-loc">
                        <span className="store-pill-badge" title={`Comercio: ${item.location}`}>
                          <MapPin size={13} className="text-primary" />
                          <span>{item.location || 'General'}</span>
                        </span>
                      </div>

                      <div className="col-pricing tabular-nums">
                        <span className="table-qty-badge">{formatNumber(item.quantity)} un.</span>
                        {item.unitPrice > 0 && (
                          <span className="table-price-badge">
                            {formatMoney(item.unitPrice)}
                          </span>
                        )}
                      </div>

                      <div className="col-status">
                        <span className={`status-pill ${item.completed ? 'completed' : 'pending'}`}>
                          {item.completed ? '✓ Comprado' : '⏳ Pendiente'}
                        </span>
                      </div>

                      <div className="col-actions">
                        <button
                          type="button"
                          className="btn-action-icon"
                          title="Editar producto"
                          onClick={() => startEditItem(item)}
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn-action-icon btn-delete"
                          title="Eliminar producto"
                          onClick={() => {
                            if (window.confirm(`¿Seguro que deseas eliminar "${item.name}"?`)) {
                              onDeleteItem(item.id);
                            }
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          PESTAÑA 2: GESTIÓN DE LOCALES, NEGOCIOS Y UBICACIONES
          ==================================================================== */}
      {activeTab === 'stores' && (
        <div className="manage-tab-content">
          {/* Métricas de Comercios */}
          <div className="manage-metrics-grid">
            <div className="manage-metric-card">
              <span className="metric-label">Total Comercios</span>
              <span className="metric-value tabular-nums">{distinctStores.length}</span>
              <small className="metric-sub">locales registrados</small>
            </div>

            <div className="manage-metric-card card-success">
              <span className="metric-label">Con Ubicación GPS</span>
              <span className="metric-value tabular-nums text-success">
                {
                  distinctStores.filter(
                    (s) => storedCoords[s.name.toLowerCase().trim()]?.lat
                  ).length
                }
              </span>
              <small className="metric-sub">posicionados en mapa</small>
            </div>

            <div
              className="manage-metric-card"
              role="button"
              tabIndex={0}
              onClick={() => setOnlyWithoutLocation(!onlyWithoutLocation)}
              title="Haga clic para filtrar comercios sin ubicación"
            >
              <span className="metric-label">Sin Ubicación en Mapa</span>
              <span className="metric-value tabular-nums text-warning">
                {
                  distinctStores.filter(
                    (s) => !storedCoords[s.name.toLowerCase().trim()]?.lat
                  ).length
                }
              </span>
              <small className="metric-sub">
                {onlyWithoutLocation ? 'Filtro activo (clic para ver todos)' : 'clic para ubicar en mapa'}
              </small>
            </div>
          </div>

          {/* Barra de Búsqueda de Comercios */}
          <div className="manage-toolbar">
            <div className="manage-search-wrap">
              <Search size={17} className="search-icon" aria-hidden="true" />
              <input
                type="search"
                className="manage-search-input"
                placeholder="Buscar local o negocio por nombre o dirección..."
                value={storeSearch}
                onChange={(e) => setStoreSearch(e.target.value)}
              />
            </div>

            <button
              type="button"
              className={`btn btn-sm ${onlyWithoutLocation ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setOnlyWithoutLocation(!onlyWithoutLocation)}
            >
              <Compass size={15} />
              <span>{onlyWithoutLocation ? 'Ver todos los locales' : 'Solo sin ubicación en mapa'}</span>
            </button>
          </div>

          {/* Listado de Tarjetas de Comercios */}
          <div className="stores-management-grid">
            {filteredStores.length === 0 ? (
              <div className="manage-empty-state">
                <Store size={44} className="text-muted" />
                <h4>No se encontraron locales</h4>
                <p>Prueba con otro término de búsqueda.</p>
              </div>
            ) : (
              filteredStores.map((st) => {
                const coord = storedCoords[st.name.toLowerCase().trim()];
                const hasLocation = Boolean(coord && coord.lat && coord.lng);
                const isExpanded = expandedStoreProducts.has(st.name);
                const storeProducts = items.filter(
                  (i) => (i.location || 'General').toLowerCase() === st.name.toLowerCase()
                );

                return (
                  <div key={st.name} className="store-manage-card">
                    <div className="store-card-top">
                      <div className="store-title-area">
                        <Store size={20} className="text-primary store-card-icon" />
                        <div>
                          <h4 className="store-card-name">{st.name}</h4>
                          <span className="store-card-counts tabular-nums">
                            {st.productCount} {st.productCount === 1 ? 'producto' : 'productos'} ·{' '}
                            {st.pendingCount} pendientes
                          </span>
                        </div>
                      </div>

                      <div className="store-location-status">
                        {hasLocation ? (
                          <span className="location-badge-configured" title={`Coordenadas: ${coord?.lat}, ${coord?.lng}`}>
                            <MapPin size={13} />
                            <span>GPS Configurado</span>
                          </span>
                        ) : (
                          <span className="location-badge-missing">
                            <AlertTriangle size={13} />
                            <span>Sin ubicación</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Dirección configurada */}
                    {hasLocation && coord?.address && (
                      <div className="store-address-box">
                        <Compass size={14} className="text-muted" />
                        <span className="store-address-text" title={coord.address}>
                          {coord.address}
                        </span>
                      </div>
                    )}

                    {/* Acciones principales del local */}
                    <div className="store-card-actions">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        title="Configurar o cambiar ubicación en mapa con buscador o clic interactivo"
                        onClick={() => onEditStoreLocation(st.name)}
                      >
                        <MapPin size={14} />
                        <span>{hasLocation ? 'Editar Ubicación' : 'Asignar Ubicación'}</span>
                      </button>

                      {hasLocation && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          title="Quitar ubicación guardada de este comercio"
                          onClick={() => {
                            if (window.confirm(`¿Quitar coordenadas guardadas de "${st.name}"?`)) {
                              removeStoreCoordinate(st.name);
                              window.location.reload();
                            }
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}

                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        title="Renombrar este comercio en todos los productos asociados"
                        onClick={() => handleStartRenameStore(st.name)}
                      >
                        <Edit2 size={13} />
                        <span>Renombrar</span>
                      </button>

                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        title="Unificar este comercio con otro existente"
                        onClick={() => handleStartMergeStores(st.name)}
                      >
                        <GitMerge size={13} />
                        <span>Fusionar</span>
                      </button>

                      <button
                        type="button"
                        className="btn btn-sm btn-ghost btn-store-expand"
                        onClick={() => toggleStoreExpand(st.name)}
                        title="Ver productos asociados a este comercio"
                      >
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <span>Productos ({st.productCount})</span>
                      </button>
                    </div>

                    {/* Lista desplegable de productos asociados al local */}
                    {isExpanded && (
                      <div className="store-expanded-products">
                        <div className="expanded-products-header">
                          <span>Productos cargados en {st.name}:</span>
                        </div>
                        <div className="expanded-products-list">
                          {storeProducts.map((p) => {
                            const CatIcon = getCategoryIcon(p.category);
                            return (
                              <div key={p.id} className="expanded-product-pill">
                                <span className="item-sku-code tabular-nums">{p.skuCode}</span>
                                <CatIcon size={13} />
                                <span className="expanded-p-name">{p.name}</span>
                                <span className="expanded-p-qty tabular-nums">{p.quantity} un.</span>
                                {p.unitPrice > 0 && (
                                  <span className="expanded-p-price tabular-nums">{formatMoney(p.unitPrice)}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL DE FUSIÓN DE PRODUCTOS DUPLICADOS
          ==================================================================== */}
      {mergeModalGroup && (
        <div className="manage-modal-backdrop" onClick={() => setMergeModalGroup(null)}>
          <div className="manage-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="manage-modal-header">
              <div className="modal-title-flex">
                <GitMerge size={18} className="text-primary" />
                <h3>Fusionar Productos Duplicados</h3>
              </div>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setMergeModalGroup(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="manage-modal-body">
              <p className="modal-desc">
                Selecciona cuál de los siguientes productos deseas conservar como el <strong>principal</strong>.
                Se conservará su ID y SKU permanente, y se sumarán las cantidades y el historial del duplicado:
              </p>

              <div className="modal-merge-items-select">
                {mergeModalGroup.items.map((it) => {
                  const isSelected = mergePrimaryId === it.id;
                  const CatIcon = getCategoryIcon(it.category);
                  return (
                    <label
                      key={it.id}
                      className={`merge-choice-label ${isSelected ? 'selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="primaryItemChoice"
                        checked={isSelected}
                        onChange={() => setMergePrimaryId(it.id)}
                      />
                      <div className="merge-choice-content">
                        <div className="choice-top">
                          <span className="item-sku-code tabular-nums">{it.skuCode}</span>
                          <strong>{it.name}</strong>
                          <span className="choice-badge-primary">
                            {isSelected ? '✓ Conservar ID y SKU' : 'Se unificará'}
                          </span>
                        </div>
                        <div className="choice-meta tabular-nums">
                          <span>📍 {it.location || 'General'}</span>
                          <span>🏷️ {it.category || 'General'}</span>
                          <span>{it.quantity} un.</span>
                          {it.unitPrice > 0 && <span>{formatMoney(it.unitPrice)}</span>}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="manage-modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setMergeModalGroup(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmMerge}
                disabled={!mergePrimaryId}
              >
                <GitMerge size={15} />
                <span>Confirmar y Fusionar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL DE RENOMBRAR COMERCIO
          ==================================================================== */}
      {renamingStore && (
        <div className="manage-modal-backdrop" onClick={() => setRenamingStore(null)}>
          <div className="manage-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="manage-modal-header">
              <div className="modal-title-flex">
                <Edit2 size={18} className="text-primary" />
                <h3>Renombrar Comercio</h3>
              </div>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setRenamingStore(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="manage-modal-body">
              <p className="modal-desc">
                Cambia el nombre de <strong>"{renamingStore}"</strong>. Todos los productos y coordenadas
                asociadas a este comercio se actualizarán de forma automática:
              </p>

              <div className="modal-input-field">
                <label htmlFor="newStoreNameInput">Nuevo nombre del comercio:</label>
                <input
                  id="newStoreNameInput"
                  type="text"
                  className="modal-text-input"
                  value={newStoreName}
                  onChange={(e) => setNewStoreName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmRenameStore();
                  }}
                />
              </div>
            </div>

            <div className="manage-modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setRenamingStore(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmRenameStore}
                disabled={!newStoreName.trim()}
              >
                <Check size={15} />
                <span>Guardar Nuevo Nombre</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL DE FUSIONAR COMERCIOS
          ==================================================================== */}
      {mergingStoreSource && (
        <div className="manage-modal-backdrop" onClick={() => setMergingStoreSource(null)}>
          <div className="manage-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="manage-modal-header">
              <div className="modal-title-flex">
                <GitMerge size={18} className="text-primary" />
                <h3>Fusionar Comercios</h3>
              </div>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setMergingStoreSource(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="manage-modal-body">
              <p className="modal-desc">
                Reasignar todos los productos de <strong>"{mergingStoreSource}"</strong> hacia otro comercio
                existente y eliminar la entrada duplicada:
              </p>

              <div className="modal-input-field">
                <label htmlFor="targetStoreSelect">Seleccionar comercio de destino:</label>
                <select
                  id="targetStoreSelect"
                  className="modal-select-input"
                  value={mergingStoreTarget}
                  onChange={(e) => setMergingStoreTarget(e.target.value)}
                >
                  {distinctStores
                    .filter((s) => s.name.toLowerCase() !== mergingStoreSource.toLowerCase())
                    .map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name} ({s.productCount} productos)
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="manage-modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setMergingStoreSource(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmMergeStores}
                disabled={!mergingStoreTarget}
              >
                <GitMerge size={15} />
                <span>Confirmar Fusión de Comercio</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
