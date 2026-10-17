import React, { useState, useMemo } from 'react';
import {
  Package,
  Hash,
  DollarSign,
  MapPin,
  Tag,
  PlusCircle,
  Search,
  List,
  LayoutGrid,
  HelpCircle,
  Trash2,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Edit2,
  Check,
  X,
  ChevronUp
} from 'lucide-react';
import { ShoppingItem } from '../types';
import { getCategoryIcon } from '../utils/categoryIcons';

interface ListViewProps {
  items: ShoppingItem[];
  layoutMode: 'list' | 'grid';
  onToggleLayout: (mode: 'list' | 'grid') => void;
  onAddItem: (item: Omit<ShoppingItem, 'id' | 'timestamp' | 'updatedAt'>) => void;
  onUpdateItem: (id: string, updates: Partial<ShoppingItem>) => void;
  onDeleteItem: (id: string) => void;
  onToggleCompleted: (id: string) => void;
  locationOrder: string[];
  collapsedGroups: string[];
  onToggleGroupCollapse: (location: string) => void;
  onReorderLocation: (direction: 'up' | 'down', location: string) => void;
  grandTotalPending: number;
}

const PENDING_LOCATION_NAMES = [
  'por averiguar',
  'por definir',
  'sin asignar',
  'sin lugar',
  'a averiguar',
  'averiguar',
  'pendiente',
  'sin tienda',
  'indefinido',
];

export function isPendingLocationName(locName: string): boolean {
  if (!locName) return true;
  const clean = locName.trim().toLowerCase();
  return PENDING_LOCATION_NAMES.includes(clean);
}

export const ListView: React.FC<ListViewProps> = ({
  items,
  layoutMode,
  onToggleLayout,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onToggleCompleted,
  locationOrder,
  collapsedGroups,
  onToggleGroupCollapse,
  onReorderLocation,
  grandTotalPending,
}) => {
  // Input form state
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('');

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [hideCompleted, setHideCompleted] = useState(false);

  // Editing item state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editLoc, setEditLoc] = useState('');
  const [editCat, setEditCat] = useState('');

  // Pending item assign state
  const [pendingAssignMap, setPendingAssignMap] = useState<Record<string, string>>({});

  // Suggestions
  const distinctCategories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.category && i.category.trim()) set.add(i.category.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [items]);

  const distinctLocations = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.location && i.location.trim() && !isPendingLocationName(i.location)) {
        set.add(i.location.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [items]);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const parsedQty = parseFloat(quantity.replace(',', '.'));
    const parsedPrice = parseFloat(unitPrice.replace(',', '.'));

    onAddItem({
      name: name.trim(),
      quantity: !isNaN(parsedQty) && parsedQty > 0 ? Math.round(parsedQty * 1000) / 1000 : 1,
      unitPrice: !isNaN(parsedPrice) && parsedPrice >= 0 ? Math.round(parsedPrice * 100) / 100 : 0,
      location: location.trim() || 'General',
      category: category.trim() || 'General',
      completed: false,
    });

    setName('');
    setQuantity('1');
    setUnitPrice('');
  };

  const startEditing = (item: ShoppingItem) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditQty(String(item.quantity));
    setEditPrice(item.unitPrice > 0 ? String(item.unitPrice) : '');
    setEditLoc(item.location || 'General');
    setEditCat(item.category || 'General');
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const saveEditing = (id: string) => {
    if (!editName.trim()) return;
    const parsedQty = parseFloat(editQty.replace(',', '.'));
    const parsedPrice = parseFloat(editPrice.replace(',', '.'));

    onUpdateItem(id, {
      name: editName.trim(),
      quantity: !isNaN(parsedQty) && parsedQty > 0 ? Math.round(parsedQty * 1000) / 1000 : 1,
      unitPrice: !isNaN(parsedPrice) && parsedPrice >= 0 ? Math.round(parsedPrice * 100) / 100 : 0,
      location: editLoc.trim() || 'General',
      category: editCat.trim() || 'General',
    });

    setEditingId(null);
  };

  // Pending location items
  const pendingItems = useMemo(() => {
    return items.filter((it) => !it.completed && isPendingLocationName(it.location));
  }, [items]);

  const handleAssignPending = (itemId: string) => {
    const targetStore = pendingAssignMap[itemId];
    if (!targetStore) return;

    if (targetStore === '__new_store__') {
      const customStore = window.prompt('Introduce el nombre del nuevo comercio:');
      if (customStore && customStore.trim()) {
        onUpdateItem(itemId, { location: customStore.trim() });
      }
    } else {
      onUpdateItem(itemId, { location: targetStore });
    }
  };

  // Filtered and grouped items (excluding pending items from standard store list)
  const groupedItems = useMemo(() => {
    const query = searchQuery
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    const filtered = items.filter((item) => {
      // Pending location items are shown separately in their own section
      if (!item.completed && isPendingLocationName(item.location)) return false;

      if (hideCompleted && item.completed) return false;

      if (!query) return true;

      const haystack = `${item.name} ${item.location} ${item.category}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

      return query.split(/\s+/).every((tok) => haystack.includes(tok));
    });

    const groups: Record<string, ShoppingItem[]> = {};

    filtered.forEach((it) => {
      const loc = (it.location && it.location.trim()) || 'General';
      if (!groups[loc]) groups[loc] = [];
      groups[loc].push(it);
    });

    // Sort items inside groups: pending first, then by timestamp desc
    Object.keys(groups).forEach((loc) => {
      groups[loc].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        const timeA = Number(a.timestamp || 0);
        const timeB = Number(b.timestamp || 0);
        if (timeA !== timeB) return timeB - timeA;
        return a.name.localeCompare(b.name, 'es');
      });
    });

    // Sort locations according to locationOrder
    const sortedLocations = Object.keys(groups).sort((a, b) => {
      const ia = locationOrder.indexOf(a);
      const ib = locationOrder.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b, 'es');
      return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
    });

    const result: Array<{ location: string; items: ShoppingItem[]; subtotal: number; pendingCount: number }> = [];

    sortedLocations.forEach((loc) => {
      const groupList = groups[loc];
      let subtotalCents = 0;
      let pendingCount = 0;

      groupList.forEach((it) => {
        if (!it.completed) {
          pendingCount++;
          const qty = Number(it.quantity) || 1;
          const price = Number(it.unitPrice) || 0;
          subtotalCents += Math.round(qty * Math.round(price * 100));
        }
      });

      result.push({
        location: loc,
        items: groupList,
        subtotal: Math.round(subtotalCents) / 100,
        pendingCount,
      });
    });

    return result;
  }, [items, searchQuery, hideCompleted, locationOrder]);

  return (
    <section id="panel-list" className="view-panel active" role="tabpanel" aria-labelledby="tab-list" tabIndex={0}>
      {/* Formulario Superior de Ingesta */}
      <form className="input-section" role="form" aria-label="Añadir nuevo producto" onSubmit={handleAddSubmit}>
        <div className="input-wrapper input-wrapper-item">
          <Package className="input-icon" size={18} aria-hidden="true" />
          <label htmlFor="itemInput" className="sr-only">
            Nombre del producto
          </label>
          <input
            type="text"
            id="itemInput"
            placeholder="Producto"
            aria-label="Nombre del producto"
            autoComplete="off"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="input-wrapper input-wrapper-qty">
          <Hash className="input-icon" size={18} aria-hidden="true" />
          <label htmlFor="quantityInput" className="sr-only">
            Cantidad
          </label>
          <input
            type="number"
            id="quantityInput"
            placeholder="Cant."
            min="0.01"
            step="any"
            aria-label="Cantidad"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>

        <div className="input-wrapper input-wrapper-price">
          <DollarSign className="input-icon" size={18} aria-hidden="true" />
          <label htmlFor="unitPriceInput" className="sr-only">
            Precio Unitario
          </label>
          <input
            type="number"
            id="unitPriceInput"
            placeholder="Precio Unit."
            min="0"
            step="0.01"
            aria-label="Precio Unitario"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
          />
        </div>

        <div className="input-wrapper input-wrapper-loc">
          <MapPin className="input-icon" size={18} aria-hidden="true" />
          <label htmlFor="locationInput" className="sr-only">
            Lugar o Supermercado
          </label>
          <input
            type="text"
            id="locationInput"
            placeholder="Lugar / Super (o Por averiguar)"
            list="location-suggestions"
            aria-label="Lugar o Supermercado"
            autoComplete="off"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <datalist id="location-suggestions">
            <option value="Por averiguar" />
            {distinctLocations.map((loc) => (
              <option key={loc} value={loc} />
            ))}
          </datalist>
        </div>

        <div className="input-wrapper input-wrapper-cat">
          <Tag className="input-icon" size={18} aria-hidden="true" />
          <label htmlFor="categoryInput" className="sr-only">
            Categoría
          </label>
          <input
            type="text"
            id="categoryInput"
            placeholder="Categoría"
            list="category-suggestions"
            aria-label="Categoría"
            autoComplete="off"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <datalist id="category-suggestions">
            {distinctCategories.map((cat) => (
              <option key={cat} value={cat} />
            ))}
          </datalist>
        </div>

        <button id="addItemButton" className="btn btn-primary" type="submit" aria-label="Añadir producto a la lista">
          <PlusCircle size={18} aria-hidden="true" />
          <span>Añadir</span>
        </button>
      </form>

      <div className="main-content">
        {/* Barra de herramientas y filtros */}
        <div className="toolbar-section" role="toolbar" aria-label="Herramientas de filtrado y búsqueda">
          <div className="input-wrapper toolbar-search">
            <Search className="input-icon" size={18} aria-hidden="true" />
            <label htmlFor="searchInput" className="sr-only">
              Buscar en toda la lista
            </label>
            <input
              type="search"
              id="searchInput"
              placeholder="Buscar en toda la lista..."
              aria-label="Buscar productos"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="toolbar-controls-group">
            <div className="form-check">
              <input
                type="checkbox"
                id="hideCompletedSwitch"
                role="switch"
                aria-checked={hideCompleted}
                checked={hideCompleted}
                onChange={(e) => setHideCompleted(e.target.checked)}
              />
              <label htmlFor="hideCompletedSwitch">Ocultar Comprados</label>
            </div>

            <div className="view-layout-toggle" role="group" aria-label="Diseño de visualización">
              <button
                type="button"
                id="btnViewList"
                className={`btn-layout-toggle ${layoutMode === 'list' ? 'active' : ''}`}
                title="Ver en lista"
                aria-label="Ver en lista"
                aria-pressed={layoutMode === 'list'}
                onClick={() => onToggleLayout('list')}
              >
                <List size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                id="btnViewGrid"
                className={`btn-layout-toggle ${layoutMode === 'grid' ? 'active' : ''}`}
                title="Ver en cuadrícula"
                aria-label="Ver en cuadrícula"
                aria-pressed={layoutMode === 'grid'}
                onClick={() => onToggleLayout('grid')}
              >
                <LayoutGrid size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {/* Sección: Por averiguar / Sin lugar asignado */}
        {pendingItems.length > 0 && (
          <section
            id="pendingLocationSection"
            className="pending-location-section"
            aria-label="Productos por averiguar o sin lugar asignado"
          >
            <div className="pending-location-header">
              <div className="pending-title-group">
                <HelpCircle className="pending-icon" size={20} aria-hidden="true" />
                <h3>Por averiguar / Sin lugar asignado</h3>
                <span id="pendingLocationCountBadge" className="pending-badge">
                  {pendingItems.length} {pendingItems.length === 1 ? 'por asignar' : 'por asignar'}
                </span>
              </div>
              <p className="pending-hint">
                Productos agregados sin comercio definido. Elige el comercio en el menú y pulsa la flecha para guardarlo en su lugar.
              </p>
            </div>

            <div id="pendingLocationList" className="pending-items-grid">
              {pendingItems.map((item) => {
                const itemTotalPrice = (item.unitPrice || 0) * (item.quantity || 1);
                return (
                  <div key={item.id} className="pending-item-card" data-id={item.id}>
                    <div className="pending-item-main">
                      <div className="pending-item-info">
                        <span className="pending-item-name" title={item.name}>
                          {item.name}
                        </span>
                        <div className="pending-item-details">
                          <span className="pending-qty-badge">Cant: {item.quantity}</span>
                          {itemTotalPrice > 0 && (
                            <span className="pending-price-badge">${itemTotalPrice.toFixed(2)}</span>
                          )}
                          <span className="pending-cat-badge">{item.category || 'General'}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-remove-pending"
                        data-id={item.id}
                        title="Eliminar producto"
                        aria-label={`Eliminar ${item.name}`}
                        onClick={() => onDeleteItem(item.id)}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>

                    <div className="pending-assign-row">
                      <select
                        className="pending-assign-select"
                        data-id={item.id}
                        aria-label={`Elegir comercio para ${item.name}`}
                        value={pendingAssignMap[item.id] || ''}
                        onChange={(e) =>
                          setPendingAssignMap({
                            ...pendingAssignMap,
                            [item.id]: e.target.value,
                          })
                        }
                      >
                        <option value="" disabled>
                          Elegir comercio...
                        </option>
                        {distinctLocations.map((store) => (
                          <option key={store} value={store}>
                            {store}
                          </option>
                        ))}
                        <option value="__new_store__">+ Nuevo comercio...</option>
                      </select>
                      <button
                        type="button"
                        className="btn-assign-arrow"
                        data-id={item.id}
                        title="Asignar y guardar en este comercio"
                        aria-label={`Asignar ${item.name} al comercio seleccionado`}
                        disabled={!pendingAssignMap[item.id]}
                        onClick={() => handleAssignPending(item.id)}
                      >
                        <ArrowRight size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Lista de compras agrupada por ubicación */}
        <div
          id="shoppingListContainer"
          className={`shopping-list-container ${layoutMode === 'grid' ? 'view-grid' : ''}`}
          role="region"
          aria-live="polite"
          aria-label="Lista de compras agrupada por ubicación"
        >
          {groupedItems.length === 0 ? (
            <div className="empty-state">
              <Package size={48} className="empty-icon" aria-hidden="true" />
              <h3>Tu lista está vacía</h3>
              <p>Agrega productos usando el formulario superior para comenzar a organizarte.</p>
            </div>
          ) : (
            groupedItems.map((group, groupIdx) => {
              const isCollapsed = collapsedGroups.includes(group.location);
              return (
                <div key={group.location} className="location-group-card">
                  <div className="location-header">
                    <button
                      type="button"
                      className="location-title-toggle"
                      aria-expanded={!isCollapsed}
                      onClick={() => onToggleGroupCollapse(group.location)}
                    >
                      {isCollapsed ? (
                        <ChevronRight size={18} aria-hidden="true" />
                      ) : (
                        <ChevronDown size={18} aria-hidden="true" />
                      )}
                      <MapPin size={18} className="loc-pin-icon" aria-hidden="true" />
                      <span className="location-name">{group.location}</span>
                      <span className="location-count-badge">
                        {group.pendingCount} {group.pendingCount === 1 ? 'pendiente' : 'pendientes'}
                      </span>
                    </button>

                    <div className="location-actions">
                      {group.subtotal > 0 && (
                        <span className="location-subtotal-badge" title="Subtotal estimado para este comercio">
                          Subtotal: ${group.subtotal.toFixed(2)}
                        </span>
                      )}

                      <div className="location-reorder-buttons">
                        <button
                          type="button"
                          className="btn-order-arrow"
                          title="Subir comercio"
                          aria-label={`Subir comercio ${group.location}`}
                          disabled={groupIdx === 0}
                          onClick={() => onReorderLocation('up', group.location)}
                        >
                          <ChevronUp size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn-order-arrow"
                          title="Bajar comercio"
                          aria-label={`Bajar comercio ${group.location}`}
                          disabled={groupIdx === groupedItems.length - 1}
                          onClick={() => onReorderLocation('down', group.location)}
                        >
                          <ChevronDown size={16} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {!isCollapsed && (
                    <div className="items-list">
                      {group.items.map((item) => {
                        const isEditing = editingId === item.id;
                        const CategoryIcon = getCategoryIcon(item.category);
                        const itemTotal = (item.unitPrice || 0) * (item.quantity || 1);

                        if (isEditing) {
                          return (
                            <div key={item.id} className="item-row editing-row">
                              <div className="edit-inputs-grid">
                                <input
                                  type="text"
                                  className="edit-input-name"
                                  value={editName}
                                  placeholder="Producto"
                                  onChange={(e) => setEditName(e.target.value)}
                                  autoFocus
                                />
                                <input
                                  type="number"
                                  className="edit-input-qty"
                                  value={editQty}
                                  placeholder="Cant."
                                  min="0.01"
                                  step="any"
                                  onChange={(e) => setEditQty(e.target.value)}
                                />
                                <input
                                  type="number"
                                  className="edit-input-price"
                                  value={editPrice}
                                  placeholder="Precio unit."
                                  min="0"
                                  step="0.01"
                                  onChange={(e) => setEditPrice(e.target.value)}
                                />
                                <input
                                  type="text"
                                  className="edit-input-loc"
                                  value={editLoc}
                                  placeholder="Lugar"
                                  list="location-suggestions"
                                  onChange={(e) => setEditLoc(e.target.value)}
                                />
                                <input
                                  type="text"
                                  className="edit-input-cat"
                                  value={editCat}
                                  placeholder="Categoría"
                                  list="category-suggestions"
                                  onChange={(e) => setEditCat(e.target.value)}
                                />
                              </div>
                              <div className="edit-actions">
                                <button
                                  type="button"
                                  className="btn-save-edit"
                                  title="Guardar cambios"
                                  aria-label="Guardar cambios"
                                  onClick={() => saveEditing(item.id)}
                                >
                                  <Check size={16} />
                                </button>
                                <button
                                  type="button"
                                  className="btn-cancel-edit"
                                  title="Cancelar"
                                  aria-label="Cancelar edición"
                                  onClick={cancelEditing}
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
                            className={`item-row ${item.completed ? 'completed' : ''}`}
                            data-id={item.id}
                          >
                            <div className="item-left">
                              <label className="checkbox-container">
                                <input
                                  type="checkbox"
                                  checked={item.completed}
                                  onChange={() => onToggleCompleted(item.id)}
                                  aria-label={`Marcar ${item.name} como ${item.completed ? 'pendiente' : 'comprado'}`}
                                />
                                <span className="checkmark" />
                              </label>

                              <div className="category-avatar-pill" title={`Categoría: ${item.category || 'General'}`}>
                                <CategoryIcon size={16} aria-hidden="true" />
                              </div>

                              <span
                                className="item-name"
                                title="Haga clic para editar"
                                onClick={() => startEditing(item)}
                              >
                                {item.name}
                              </span>
                            </div>

                            <div className="item-right">
                              <div className="item-pricing">
                                <span className="item-qty-tag">{item.quantity} un.</span>
                                {item.unitPrice > 0 && (
                                  <span className="item-price-tag">
                                    ${itemTotal.toFixed(2)}
                                    {item.quantity > 1 && (
                                      <small className="unit-price-sub"> (${item.unitPrice.toFixed(2)} c/u)</small>
                                    )}
                                  </span>
                                )}
                              </div>

                              <div className="item-actions">
                                <button
                                  type="button"
                                  className="btn-item-action"
                                  title="Editar producto"
                                  aria-label={`Editar ${item.name}`}
                                  onClick={() => startEditing(item)}
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  type="button"
                                  className="btn-item-action btn-delete-item"
                                  title="Eliminar producto"
                                  aria-label={`Eliminar ${item.name}`}
                                  onClick={() => onDeleteItem(item.id)}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Resumen exclusivo para impresión / guardado en PDF */}
        <div id="printListSummary" className="print-list-summary" aria-hidden="true">
          <div className="print-summary-content">
            <span className="print-summary-title">Total Estimado de Compra:</span>
            <span id="printGrandTotalValue" className="print-summary-value">
              ${grandTotalPending.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
