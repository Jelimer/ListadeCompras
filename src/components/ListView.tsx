import React, { useState, useMemo, useDeferredValue } from 'react';
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
  ChevronUp,
  ChevronsUpDown,
  ChevronsDownUp,
  GripVertical,
  Plus,
  Minus,
  Receipt,
  RotateCcw,
  Calendar,
} from 'lucide-react';
import { ShoppingItem } from '../types';
import { getCategoryIcon } from '../utils/categoryIcons';
import {
  loadStoredHideEmptyStores,
  saveStoredHideEmptyStores,
  formatSkuCode,
  getNextSequentialSku,
} from '../utils/storage';
import { formatMoney, formatNumber, parseLocaleNumber } from '../utils/formatters';

interface ListViewProps {
  items: ShoppingItem[];
  layoutMode: 'list' | 'grid';
  onToggleLayout: (mode: 'list' | 'grid') => void;
  onAddItem: (item: Omit<ShoppingItem, 'id' | 'timestamp' | 'updatedAt'>) => void;
  onUpdateItem: (id: string, updates: Partial<ShoppingItem>) => void;
  onDeleteItem: (id: string) => void;
  onToggleCompleted: (id: string) => void;
  onResetItem: (id: string) => void;
  onResetStoreCompleted: (location: string) => void;
  onResetAllCompleted: () => void;
  locationOrder: string[];
  onSetLocationOrder: (newOrder: string[]) => void;
  collapsedGroups: string[];
  onToggleGroupCollapse: (location: string) => void;
  onSetCollapsedGroups: (groups: string[]) => void;
  onReorderLocation: (direction: 'up' | 'down', location: string) => void;
  grandTotalPending: number;
  onOpenReceiptScanner?: () => void;
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

const PENDING_SECTION_COLLAPSE_KEY = '__pending_unassigned_section__';

export function isPendingLocationName(locName: string): boolean {
  if (!locName) return true;
  const clean = locName.trim().toLowerCase();
  return PENDING_LOCATION_NAMES.includes(clean);
}

function normalizeLocKey(loc: string): string {
  return String(loc || 'General')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export interface CatalogProductSuggestion {
  id: string;
  skuCode: string;
  seqNumber?: number;
  name: string;
  category: string;
  location: string;
  unitPrice: number;
  completed: boolean;
  quantity?: number;
}

export const ListView: React.FC<ListViewProps> = ({
  items,
  layoutMode,
  onToggleLayout,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onToggleCompleted,
  onResetItem,
  onResetStoreCompleted,
  onResetAllCompleted,
  locationOrder,
  onSetLocationOrder,
  collapsedGroups,
  onToggleGroupCollapse,
  onSetCollapsedGroups,
  onReorderLocation,
  grandTotalPending,
  onOpenReceiptScanner,
}) => {
  // Input form state
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('');

  // Autocomplete de productos para reutilizar ID / SKU existente
  const [selectedExistingItem, setSelectedExistingItem] = useState<CatalogProductSuggestion | null>(null);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [highlightedSugIndex, setHighlightedSugIndex] = useState(-1);

  // Quick-Add directo en tarjeta de comercio
  const [quickAddStore, setQuickAddStore] = useState<string | null>(null);
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddQty, setQuickAddQty] = useState('1');
  const [quickAddPrice, setQuickAddPrice] = useState('');
  const [quickAddCat, setQuickAddCat] = useState('');
  const [quickAddSelectedExisting, setQuickAddSelectedExisting] = useState<CatalogProductSuggestion | null>(null);
  const [showQuickAddSuggestions, setShowQuickAddSuggestions] = useState(false);
  const [quickAddHighlightedIndex, setQuickAddHighlightedIndex] = useState(-1);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [hideEmptyStores, setHideEmptyStores] = useState<boolean>(() =>
    loadStoredHideEmptyStores()
  );

  // Drag & Drop state for store cards
  const [draggedLocation, setDraggedLocation] = useState<string | null>(null);
  const [dragOverLocation, setDragOverLocation] = useState<string | null>(null);

  // Editing item state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editLoc, setEditLoc] = useState('');
  const [editCat, setEditCat] = useState('');
  const [editDate, setEditDate] = useState('');

  // Pending item assign state
  const [pendingAssignMap, setPendingAssignMap] = useState<Record<string, string>>({});
  const [pendingCustomStoreMap, setPendingCustomStoreMap] = useState<Record<string, string>>({});

  const totalCompletedCount = useMemo(
    () => items.filter((i) => i.completed).length,
    [items]
  );

  const handleToggleHideEmptyStores = (checked: boolean) => {
    setHideEmptyStores(checked);
    saveStoredHideEmptyStores(checked);
  };

  // Catálogo deduplicado de productos para autocompletado y reuso de ID
  const catalogProducts = useMemo(() => {
    const map = new Map<string, CatalogProductSuggestion>();
    for (const it of items) {
      const cleanName = it.name?.trim();
      if (!cleanName) continue;
      const key = cleanName.toLowerCase();
      const sku = it.skuCode || formatSkuCode(it.seqNumber || 1);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          id: it.id,
          skuCode: sku,
          seqNumber: it.seqNumber,
          name: cleanName,
          category: it.category || 'General',
          location: it.location || 'General',
          unitPrice: Number(it.unitPrice) || 0,
          completed: Boolean(it.completed),
          quantity: Number(it.quantity) || 1,
        });
      } else {
        if (!it.completed && existing.completed) {
          map.set(key, {
            id: it.id,
            skuCode: sku,
            seqNumber: it.seqNumber,
            name: cleanName,
            category: it.category || existing.category,
            location: it.location || existing.location,
            unitPrice: (Number(it.unitPrice) || 0) > 0 ? Number(it.unitPrice) : existing.unitPrice,
            completed: false,
            quantity: Number(it.quantity) || 1,
          });
        }
      }
    }
    return Array.from(map.values());
  }, [items]);

  // Sugerencias de productos en formulario principal
  const nameSuggestions = useMemo(() => {
    const q = name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!q) return [];
    const cleanQ = q.replace(/^#/, '');
    return catalogProducts
      .filter((prod) => {
        const prodName = prod.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const skuFull = prod.skuCode.toLowerCase();
        const skuDigits = skuFull.replace('#', '');
        return prodName.includes(q) || skuFull.includes(q) || (cleanQ && skuDigits.includes(cleanQ));
      })
      .sort((a, b) => {
        const nameA = a.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const nameB = b.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const startsA = nameA.startsWith(q);
        const startsB = nameB.startsWith(q);
        if (startsA && !startsB) return -1;
        if (!startsA && startsB) return 1;
        return nameA.localeCompare(nameB, 'es');
      })
      .slice(0, 6);
  }, [name, catalogProducts]);

  // Sugerencias para quick-add en tarjetas de comercio
  const quickAddNameSuggestions = useMemo(() => {
    const q = quickAddName.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!q) return [];
    const cleanQ = q.replace(/^#/, '');
    return catalogProducts
      .filter((prod) => {
        const prodName = prod.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const skuFull = prod.skuCode.toLowerCase();
        const skuDigits = skuFull.replace('#', '');
        return prodName.includes(q) || skuFull.includes(q) || (cleanQ && skuDigits.includes(cleanQ));
      })
      .sort((a, b) => {
        const nameA = a.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const nameB = b.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const startsA = nameA.startsWith(q);
        const startsB = nameB.startsWith(q);
        if (startsA && !startsB) return -1;
        if (!startsA && startsB) return 1;
        return nameA.localeCompare(nameB, 'es');
      })
      .slice(0, 6);
  }, [quickAddName, catalogProducts]);

  // Código SKU estimado a mostrar en el formulario
  const nextSkuCode = useMemo(() => {
    if (selectedExistingItem) {
      return selectedExistingItem.skuCode;
    }
    const exact = catalogProducts.find(
      (p) => p.name.toLowerCase() === name.trim().toLowerCase()
    );
    if (exact) {
      return exact.skuCode;
    }
    return getNextSequentialSku(items).skuCode;
  }, [items, selectedExistingItem, name, catalogProducts]);

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

  const handleSelectSuggestion = (sug: CatalogProductSuggestion) => {
    setName(sug.name);
    setSelectedExistingItem(sug);
    setShowNameSuggestions(false);
    setHighlightedSugIndex(-1);
    if (!category.trim() || category === 'General') {
      setCategory(sug.category || 'General');
    }
    if (!location.trim() || location === 'General' || isPendingLocationName(location)) {
      setLocation(sug.location || 'General');
    }
    if ((!unitPrice.trim() || unitPrice === '0') && sug.unitPrice > 0) {
      setUnitPrice(String(sug.unitPrice));
    }
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const parsedQty = parseLocaleNumber(quantity);
    const parsedPrice = parseLocaleNumber(unitPrice);
    const finalQty = parsedQty > 0 ? Math.round(parsedQty * 1000) / 1000 : 1;
    const finalPrice = parsedPrice >= 0 ? Math.round(parsedPrice * 100) / 100 : 0;
    const finalLoc = location.trim() || 'General';
    const finalCat = category.trim() || 'General';

    // Verificar si coincide con un producto existente en catálogo (reutilización de ID)
    const existing =
      selectedExistingItem ||
      catalogProducts.find((p) => p.name.toLowerCase() === trimmedName.toLowerCase());

    if (existing) {
      const targetInList = items.find((it) => it.id === existing.id);
      if (targetInList) {
        if (targetInList.completed) {
          // Reactivar producto previamente comprado preservando su ID y SKU
          onUpdateItem(targetInList.id, {
            completed: false,
            quantity: finalQty,
            unitPrice: finalPrice > 0 ? finalPrice : targetInList.unitPrice,
            location: finalLoc !== 'General' ? finalLoc : targetInList.location,
            category: finalCat !== 'General' ? finalCat : targetInList.category,
          });
        } else {
          // Ya está en lista como pendiente: sumar cantidad y actualizar precio
          const updatedQty = Math.round(((targetInList.quantity || 1) + finalQty) * 1000) / 1000;
          onUpdateItem(targetInList.id, {
            quantity: updatedQty,
            unitPrice: finalPrice > 0 ? finalPrice : targetInList.unitPrice,
            location: finalLoc !== 'General' ? finalLoc : targetInList.location,
            category: finalCat !== 'General' ? finalCat : targetInList.category,
          });
        }
        setName('');
        setQuantity('1');
        setUnitPrice('');
        setSelectedExistingItem(null);
        setShowNameSuggestions(false);
        return;
      }
    }

    // Nuevo producto en el catálogo
    onAddItem({
      name: trimmedName,
      quantity: finalQty,
      unitPrice: finalPrice,
      location: finalLoc,
      category: finalCat,
      completed: false,
    });

    setName('');
    setQuantity('1');
    setUnitPrice('');
    setSelectedExistingItem(null);
    setShowNameSuggestions(false);
  };

  const handleToggleCardQuickAdd = (loc: string) => {
    if (quickAddStore === loc) {
      setQuickAddStore(null);
      setQuickAddName('');
      setQuickAddQty('1');
      setQuickAddPrice('');
      setQuickAddCat('');
      setQuickAddSelectedExisting(null);
      setShowQuickAddSuggestions(false);
    } else {
      if (isGroupCollapsed(loc)) {
        onToggleGroupCollapse(loc);
      }
      setQuickAddStore(loc);
      setQuickAddName('');
      setQuickAddQty('1');
      setQuickAddPrice('');
      setQuickAddCat('');
      setQuickAddSelectedExisting(null);
      setShowQuickAddSuggestions(false);
    }
  };

  const handleCardQuickAddSubmit = (storeName: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedName = quickAddName.trim();
    if (!trimmedName) return;

    const parsedQty = parseLocaleNumber(quickAddQty);
    const parsedPrice = parseLocaleNumber(quickAddPrice);
    const finalQty = parsedQty > 0 ? Math.round(parsedQty * 1000) / 1000 : 1;
    const finalPrice = parsedPrice >= 0 ? Math.round(parsedPrice * 100) / 100 : 0;
    const finalCat = quickAddCat.trim() || 'General';

    const existing =
      quickAddSelectedExisting ||
      catalogProducts.find((p) => p.name.toLowerCase() === trimmedName.toLowerCase());

    if (existing) {
      const targetInList = items.find((it) => it.id === existing.id);
      if (targetInList) {
        if (targetInList.completed) {
          onUpdateItem(targetInList.id, {
            completed: false,
            quantity: finalQty,
            unitPrice: finalPrice > 0 ? finalPrice : targetInList.unitPrice,
            location: storeName,
            category: finalCat !== 'General' ? finalCat : targetInList.category,
          });
        } else {
          const updatedQty = Math.round(((targetInList.quantity || 1) + finalQty) * 1000) / 1000;
          onUpdateItem(targetInList.id, {
            quantity: updatedQty,
            unitPrice: finalPrice > 0 ? finalPrice : targetInList.unitPrice,
            location: storeName,
            category: finalCat !== 'General' ? finalCat : targetInList.category,
          });
        }
        setQuickAddStore(null);
        setQuickAddName('');
        setQuickAddQty('1');
        setQuickAddPrice('');
        setQuickAddCat('');
        setQuickAddSelectedExisting(null);
        setShowQuickAddSuggestions(false);
        return;
      }
    }

    onAddItem({
      name: trimmedName,
      quantity: finalQty,
      unitPrice: finalPrice,
      location: storeName,
      category: finalCat,
      completed: false,
    });

    setQuickAddStore(null);
    setQuickAddName('');
    setQuickAddQty('1');
    setQuickAddPrice('');
    setQuickAddCat('');
    setQuickAddSelectedExisting(null);
    setShowQuickAddSuggestions(false);
  };

  const startEditing = (item: ShoppingItem) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditQty(String(item.quantity));
    setEditPrice(item.unitPrice > 0 ? String(item.unitPrice) : '');
    setEditLoc(item.location || 'General');
    setEditCat(item.category || 'General');
    setEditDate(item.lastPurchasedDate || '');
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const saveEditing = (id: string) => {
    if (!editName.trim()) return;
    const parsedQty = parseLocaleNumber(editQty);
    const parsedPrice = parseLocaleNumber(editPrice);

    onUpdateItem(id, {
      name: editName.trim(),
      quantity: parsedQty > 0 ? Math.round(parsedQty * 1000) / 1000 : 1,
      unitPrice: parsedPrice >= 0 ? Math.round(parsedPrice * 100) / 100 : 0,
      location: editLoc.trim() || 'General',
      category: editCat.trim() || 'General',
      ...(editDate.trim() ? { lastPurchasedDate: editDate.trim() } : { lastPurchasedDate: undefined }),
    });

    setEditingId(null);
  };

  const handleStepQuantity = (item: ShoppingItem, delta: number) => {
    const nextQty = Math.round(((Number(item.quantity) || 1) + delta) * 1000) / 1000;
    if (nextQty <= 0) return;
    onUpdateItem(item.id, { quantity: nextQty });
  };

  // Pending location items (also filtered by searchQuery if active)
  const pendingItems = useMemo(() => {
    const query = deferredSearchQuery
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    return items.filter((it, idx) => {
      if (it.completed || !isPendingLocationName(it.location)) return false;
      if (!query) return true;
      const sku = it.skuCode || formatSkuCode(it.seqNumber || idx + 1);
      const haystack = `${sku} ${it.name} ${it.location} ${it.category}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      return query.split(/\s+/).every((tok) => haystack.includes(tok));
    });
  }, [items, deferredSearchQuery]);

  const handleAssignPending = (itemId: string) => {
    const targetStore = pendingAssignMap[itemId];
    if (!targetStore) return;

    if (targetStore === '__new_store__') {
      const customStore = (pendingCustomStoreMap[itemId] || '').trim();
      if (customStore) {
        onUpdateItem(itemId, { location: customStore });
      }
    } else {
      onUpdateItem(itemId, { location: targetStore });
    }
  };

  // Filtered and grouped items
  const groupedItems = useMemo(() => {
    const query = deferredSearchQuery
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    const filtered = items.filter((item, idx) => {
      if (!item.completed && isPendingLocationName(item.location)) return false;
      if (hideCompleted && item.completed) return false;
      if (!query) return true;

      const sku = item.skuCode || formatSkuCode(item.seqNumber || idx + 1);
      const haystack = `${sku} ${item.name} ${item.location} ${item.category}`
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

    Object.keys(groups).forEach((loc) => {
      groups[loc].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        const seqA = Number(a.seqNumber || 0);
        const seqB = Number(b.seqNumber || 0);
        if (seqA !== seqB) return seqB - seqA;
        const timeA = Number(a.timestamp || 0);
        const timeB = Number(b.timestamp || 0);
        if (timeA !== timeB) return timeB - timeA;
        return a.name.localeCompare(b.name, 'es');
      });
    });

    const normalizedOrder = locationOrder.map(normalizeLocKey);
    const sortedLocations = Object.keys(groups).sort((a, b) => {
      const ia = normalizedOrder.indexOf(normalizeLocKey(a));
      const ib = normalizedOrder.indexOf(normalizeLocKey(b));
      if (ia === -1 && ib === -1) return a.localeCompare(b, 'es');
      return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
    });

    const result: Array<{
      location: string;
      items: ShoppingItem[];
      subtotal: number;
      pendingCount: number;
      completedCount: number;
    }> = [];

    sortedLocations.forEach((loc) => {
      const groupList = groups[loc];
      let subtotalCents = 0;
      let pendingCount = 0;
      let completedCount = 0;

      groupList.forEach((it) => {
        if (!it.completed) {
          pendingCount++;
          const qty = Number(it.quantity) || 1;
          const price = Number(it.unitPrice) || 0;
          subtotalCents += Math.round(qty * Math.round(price * 100));
        } else {
          completedCount++;
        }
      });

      if (hideEmptyStores && pendingCount === 0) {
        return;
      }

      result.push({
        location: loc,
        items: groupList,
        subtotal: Math.round(subtotalCents) / 100,
        pendingCount,
        completedCount,
      });
    });

    return result;
  }, [items, deferredSearchQuery, hideCompleted, hideEmptyStores, locationOrder]);

  // Normalized collapse check (includes both store cards and the "Por averiguar" section)
  const collapsedSet = useMemo(() => {
    return new Set(collapsedGroups.map(normalizeLocKey));
  }, [collapsedGroups]);

  const isGroupCollapsed = (loc: string) => collapsedSet.has(normalizeLocKey(loc));
  const isPendingSectionCollapsed = collapsedSet.has(
    normalizeLocKey(PENDING_SECTION_COLLAPSE_KEY)
  );

  const areAllVisibleCollapsed = useMemo(() => {
    const hasStores = groupedItems.length > 0;
    const hasPendingBox = pendingItems.length > 0;
    if (!hasStores && !hasPendingBox) return false;

    const storesCollapsed = groupedItems.every((g) =>
      collapsedSet.has(normalizeLocKey(g.location))
    );
    const pendingCollapsed =
      !hasPendingBox || collapsedSet.has(normalizeLocKey(PENDING_SECTION_COLLAPSE_KEY));

    return storesCollapsed && pendingCollapsed;
  }, [groupedItems, pendingItems.length, collapsedSet]);

  const handleToggleCollapseAll = () => {
    if (areAllVisibleCollapsed) {
      // Expand all visible store groups AND the pending section
      const visibleKeys = new Set(groupedItems.map((g) => normalizeLocKey(g.location)));
      visibleKeys.add(normalizeLocKey(PENDING_SECTION_COLLAPSE_KEY));
      const remaining = collapsedGroups.filter((loc) => !visibleKeys.has(normalizeLocKey(loc)));
      onSetCollapsedGroups(remaining);
    } else {
      // Collapse 100% of visible store groups AND the pending section
      const nextSet = new Set(collapsedGroups.map((l) => l.trim()));
      groupedItems.forEach((g) => nextSet.add(g.location.trim()));
      if (pendingItems.length > 0) {
        nextSet.add(PENDING_SECTION_COLLAPSE_KEY);
      }
      onSetCollapsedGroups(Array.from(nextSet));
    }
  };

  // Drag & Drop handlers for store cards
  const handleStoreDragStart = (e: React.DragEvent, loc: string) => {
    setDraggedLocation(loc);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', loc);
  };

  const handleStoreDragOver = (e: React.DragEvent, loc: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedLocation && draggedLocation !== loc) {
      setDragOverLocation(loc);
    }
  };

  const handleStoreDrop = (e: React.DragEvent, targetLoc: string) => {
    e.preventDefault();
    const sourceLoc = draggedLocation || e.dataTransfer.getData('text/plain');
    setDraggedLocation(null);
    setDragOverLocation(null);

    if (!sourceLoc || sourceLoc === targetLoc) return;

    const currentVisibleLocs = groupedItems.map((g) => g.location);
    const allLocs = Array.from(new Set([...currentVisibleLocs, ...locationOrder]));

    const fromIdx = allLocs.findIndex((l) => normalizeLocKey(l) === normalizeLocKey(sourceLoc));
    const toIdx = allLocs.findIndex((l) => normalizeLocKey(l) === normalizeLocKey(targetLoc));
    if (fromIdx === -1 || toIdx === -1) return;

    const reordered = [...allLocs];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    onSetLocationOrder(reordered);
  };

  const handleStoreDragEnd = () => {
    setDraggedLocation(null);
    setDragOverLocation(null);
  };

  return (
    <section
      id="panel-list"
      className="view-panel active"
      role="tabpanel"
      aria-labelledby="tab-list"
      tabIndex={0}
    >
      {/* Formulario Superior de Ingesta */}
      <form
        className="input-section"
        role="form"
        aria-label="Añadir nuevo producto"
        onSubmit={handleAddSubmit}
      >
        <div className="input-wrapper input-wrapper-item product-suggestions-wrapper">
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
            onChange={(e) => {
              const val = e.target.value;
              setName(val);
              setShowNameSuggestions(true);
              setHighlightedSugIndex(-1);
              if (
                selectedExistingItem &&
                selectedExistingItem.name.toLowerCase() !== val.trim().toLowerCase()
              ) {
                setSelectedExistingItem(null);
              }
            }}
            onFocus={() => {
              if (name.trim()) setShowNameSuggestions(true);
            }}
            onBlur={() => {
              setTimeout(() => setShowNameSuggestions(false), 200);
            }}
            onKeyDown={(e) => {
              if (!showNameSuggestions || nameSuggestions.length === 0) return;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlightedSugIndex((prev) => (prev + 1) % nameSuggestions.length);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlightedSugIndex((prev) =>
                  prev <= 0 ? nameSuggestions.length - 1 : prev - 1
                );
              } else if (e.key === 'Enter' && highlightedSugIndex >= 0) {
                e.preventDefault();
                handleSelectSuggestion(nameSuggestions[highlightedSugIndex]);
              } else if (e.key === 'Escape') {
                setShowNameSuggestions(false);
              }
            }}
          />

          {/* Menú flotante de sugerencias de productos */}
          {showNameSuggestions && nameSuggestions.length > 0 && (
            <div className="product-suggestions-dropdown" role="listbox">
              <div className="suggestions-header">
                <span>Productos existentes en catálogo (reutilizar ID)</span>
              </div>
              {nameSuggestions.map((sug, idx) => {
                const CategoryIcon = getCategoryIcon(sug.category);
                const isHighlighted = highlightedSugIndex === idx;
                return (
                  <div
                    key={sug.id}
                    className={`suggestion-item ${isHighlighted ? 'highlighted' : ''}`}
                    role="option"
                    aria-selected={isHighlighted}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectSuggestion(sug);
                    }}
                  >
                    <div className="sug-left">
                      <span className="item-sku-code tabular-nums" title={`ID #${sug.skuCode}`}>
                        {sug.skuCode}
                      </span>
                      <div className="sug-icon-pill">
                        <CategoryIcon size={14} aria-hidden="true" />
                      </div>
                      <span className="sug-name">{sug.name}</span>
                    </div>
                    <div className="sug-right">
                      {sug.category && (
                        <span className="sug-tag sug-category">{sug.category}</span>
                      )}
                      {sug.location && !isPendingLocationName(sug.location) && (
                        <span className="sug-tag sug-location">📍 {sug.location}</span>
                      )}
                      {sug.unitPrice > 0 && (
                        <span className="sug-price tabular-nums">{formatMoney(sug.unitPrice)}</span>
                      )}
                      <span
                        className={`sug-status-badge ${
                          sug.completed ? 'is-completed' : 'is-pending'
                        }`}
                      >
                        {sug.completed ? '✓ Comprado' : '⏳ En lista'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Indicador de SKU / ID para el producto */}
        <div
          className={`form-sku-indicator ${
            selectedExistingItem ||
            catalogProducts.some((p) => p.name.toLowerCase() === name.trim().toLowerCase())
              ? 'is-reused'
              : 'is-new'
          }`}
          title={
            selectedExistingItem ||
            catalogProducts.some((p) => p.name.toLowerCase() === name.trim().toLowerCase())
              ? `Reutilizando ${nextSkuCode} (Producto existente en catálogo)`
              : `Nuevo código ID consecutivo: ${nextSkuCode}`
          }
        >
          <span className="form-sku-code tabular-nums">{nextSkuCode}</span>
          <span className="form-sku-label">
            {selectedExistingItem ||
            catalogProducts.some((p) => p.name.toLowerCase() === name.trim().toLowerCase())
              ? 'Existente'
              : 'Nuevo'}
          </span>
        </div>

        <div className="input-wrapper input-wrapper-qty">
          <Hash className="input-icon" size={18} aria-hidden="true" />
          <label htmlFor="quantityInput" className="sr-only">
            Cantidad
          </label>
          <input
            type="text"
            inputMode="decimal"
            id="quantityInput"
            placeholder="Cant."
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
            type="text"
            inputMode="decimal"
            id="unitPriceInput"
            placeholder="Precio Unit."
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

        <button
          id="addItemButton"
          className="btn btn-primary"
          type="submit"
          aria-label="Añadir producto a la lista"
        >
          <PlusCircle size={18} aria-hidden="true" />
          <span>Añadir</span>
        </button>
      </form>

      <div className="main-content">
        {/* Barra de herramientas y filtros */}
        <div
          className="toolbar-section"
          role="toolbar"
          aria-label="Herramientas de filtrado y búsqueda"
        >
          <div className="input-wrapper toolbar-search">
            <Search className="input-icon" size={18} aria-hidden="true" />
            <label htmlFor="searchInput" className="sr-only">
              Buscar por #ID, nombre, comercio o categoría
            </label>
            <input
              type="search"
              id="searchInput"
              placeholder="Buscar por #ID (#001), producto o comercio..."
              aria-label="Buscar productos por ID o nombre"
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

            <div className="form-check">
              <input
                type="checkbox"
                id="hideEmptyStoresSwitch"
                role="switch"
                aria-checked={hideEmptyStores}
                checked={hideEmptyStores}
                onChange={(e) => handleToggleHideEmptyStores(e.target.checked)}
              />
              <label htmlFor="hideEmptyStoresSwitch">Ocultar 0 pendientes</label>
            </div>

            {onOpenReceiptScanner && (
              <button
                type="button"
                className="btn-collapse-all"
                onClick={onOpenReceiptScanner}
                title="Subir foto de ticket y registrar compra con fecha"
              >
                <Receipt size={16} aria-hidden="true" />
                <span>Escanear Ticket</span>
              </button>
            )}

            {totalCompletedCount > 0 && (
              <button
                type="button"
                className="btn-collapse-all btn-reset-completed-toolbar"
                onClick={onResetAllCompleted}
                title="Resetear todos los productos comprados a pendientes sin borrarlos, para iniciar registro con fechas"
              >
                <RotateCcw size={15} aria-hidden="true" />
                <span>Resetear Comprados ({formatNumber(totalCompletedCount, 0)})</span>
              </button>
            )}

            {(groupedItems.length > 0 || pendingItems.length > 0) && (
              <button
                type="button"
                id="btnToggleCollapseAll"
                className="btn-collapse-all"
                onClick={handleToggleCollapseAll}
                title={
                  areAllVisibleCollapsed
                    ? 'Expandir todas las listas y comercios'
                    : 'Contraer todas las listas y comercios'
                }
                aria-label={
                  areAllVisibleCollapsed
                    ? 'Expandir todas las listas y comercios'
                    : 'Contraer todas las listas y comercios'
                }
              >
                {areAllVisibleCollapsed ? (
                  <>
                    <ChevronsUpDown size={16} aria-hidden="true" />
                    <span>Expandir todo</span>
                  </>
                ) : (
                  <>
                    <ChevronsDownUp size={16} aria-hidden="true" />
                    <span>Contraer todo</span>
                  </>
                )}
              </button>
            )}

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

        {/* Sección Plegable: Por averiguar / Sin lugar asignado */}
        {pendingItems.length > 0 && (
          <section
            id="pendingLocationSection"
            className={`pending-location-section ${
              isPendingSectionCollapsed ? 'is-collapsed' : ''
            }`}
            aria-label="Productos por averiguar o sin lugar asignado"
          >
            <div
              className="pending-location-header pending-collapsible-trigger"
              role="button"
              tabIndex={0}
              aria-expanded={!isPendingSectionCollapsed}
              onClick={() => onToggleGroupCollapse(PENDING_SECTION_COLLAPSE_KEY)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggleGroupCollapse(PENDING_SECTION_COLLAPSE_KEY);
                }
              }}
            >
              <div className="pending-header-top-row">
                <div className="pending-title-group">
                  {isPendingSectionCollapsed ? (
                    <ChevronRight size={19} className="pending-chevron" aria-hidden="true" />
                  ) : (
                    <ChevronDown size={19} className="pending-chevron" aria-hidden="true" />
                  )}
                  <HelpCircle className="pending-icon" size={20} aria-hidden="true" />
                  <h3>Por averiguar / Sin lugar asignado</h3>
                  <span id="pendingLocationCountBadge" className="pending-badge tabular-nums">
                    {formatNumber(pendingItems.length, 0)} por asignar
                  </span>
                </div>

                <button
                  type="button"
                  className="btn-collapse-section-inline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleGroupCollapse(PENDING_SECTION_COLLAPSE_KEY);
                  }}
                  aria-label={
                    isPendingSectionCollapsed
                      ? 'Expandir lista Por averiguar'
                      : 'Contraer lista Por averiguar'
                  }
                >
                  {isPendingSectionCollapsed ? 'Expandir' : 'Contraer'}
                </button>
              </div>

              {!isPendingSectionCollapsed && (
                <p className="pending-hint">
                  Productos agregados sin comercio definido. Elige el comercio en el menú y pulsa la
                  flecha para guardarlo en su lugar.
                </p>
              )}
            </div>

            {!isPendingSectionCollapsed && (
              <div id="pendingLocationList" className="pending-items-grid">
                {pendingItems.map((item) => {
                  const itemTotalPrice = (item.unitPrice || 0) * (item.quantity || 1);
                  const sku = item.skuCode || formatSkuCode(item.seqNumber || 1);
                  return (
                    <div key={item.id} className="pending-item-card" data-id={item.id}>
                      <div className="pending-item-main">
                        <div className="pending-item-info">
                          <div className="pending-item-title-line">
                            <span className="item-sku-code tabular-nums">{sku}</span>
                            <span className="pending-item-name" title={item.name}>
                              {item.name}
                            </span>
                          </div>
                          <div className="pending-item-details tabular-nums">
                            <span className="pending-qty-badge">
                              Cant: {formatNumber(item.quantity)}
                            </span>
                            {itemTotalPrice > 0 && (
                              <span className="pending-price-badge">
                                {formatMoney(itemTotalPrice)}
                              </span>
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
                        {pendingAssignMap[item.id] === '__new_store__' && (
                          <input
                            type="text"
                            className="pending-custom-store-input"
                            placeholder="Nombre del comercio..."
                            value={pendingCustomStoreMap[item.id] || ''}
                            onChange={(e) =>
                              setPendingCustomStoreMap({
                                ...pendingCustomStoreMap,
                                [item.id]: e.target.value,
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAssignPending(item.id);
                            }}
                          />
                        )}
                        <button
                          type="button"
                          className="btn-assign-arrow"
                          data-id={item.id}
                          title="Asignar y guardar en este comercio"
                          aria-label={`Asignar ${item.name} al comercio seleccionado`}
                          disabled={
                            !pendingAssignMap[item.id] ||
                            (pendingAssignMap[item.id] === '__new_store__' &&
                              !(pendingCustomStoreMap[item.id] || '').trim())
                          }
                          onClick={() => handleAssignPending(item.id)}
                        >
                          <ArrowRight size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
              <h3>
                {items.length > 0
                  ? 'No hay comercios que coincidan con el filtro'
                  : 'Tu lista está vacía'}
              </h3>
              <p>
                {items.length > 0
                  ? 'Prueba desactivando "Ocultar 0 pendientes" o "Ocultar Comprados" para ver todos los comercios.'
                  : 'Agrega productos usando el formulario superior o escanea un ticket para comenzar a organizarte.'}
              </p>
            </div>
          ) : (
            groupedItems.map((group, groupIdx) => {
              const isCollapsed = isGroupCollapsed(group.location);
              const isDragging = draggedLocation === group.location;
              const isDragOver = dragOverLocation === group.location;

              return (
                <div
                  key={group.location}
                  className={`location-group-card ${isCollapsed ? 'is-collapsed' : ''} ${
                    group.pendingCount === 0 ? 'has-zero-pending' : ''
                  } ${isDragging ? 'sortable-ghost' : ''} ${
                    isDragOver ? 'drag-over-card' : ''
                  }`}
                  draggable
                  onDragStart={(e) => handleStoreDragStart(e, group.location)}
                  onDragOver={(e) => handleStoreDragOver(e, group.location)}
                  onDrop={(e) => handleStoreDrop(e, group.location)}
                  onDragEnd={handleStoreDragEnd}
                >
                  <div
                    className="location-header"
                    role="button"
                    tabIndex={0}
                    aria-expanded={!isCollapsed}
                    onClick={() => onToggleGroupCollapse(group.location)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onToggleGroupCollapse(group.location);
                      }
                    }}
                  >
                    <div className="location-title-toggle">
                      <span
                        className="store-drag-grip"
                        title="Arrastrar para reordenar comercio"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GripVertical size={16} aria-hidden="true" />
                      </span>
                      {isCollapsed ? (
                        <ChevronRight size={18} aria-hidden="true" />
                      ) : (
                        <ChevronDown size={18} aria-hidden="true" />
                      )}
                      <MapPin size={17} className="loc-pin-icon" aria-hidden="true" />
                      <span className="location-name" title={group.location}>
                        {group.location}
                      </span>
                      <span
                        className={`location-count-badge tabular-nums ${
                          group.pendingCount === 0 ? 'badge-zero' : ''
                        }`}
                      >
                        {formatNumber(group.pendingCount, 0)}{' '}
                        {group.pendingCount === 1 ? 'pendiente' : 'pendientes'}
                      </span>
                    </div>

                    <div className="location-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="btn-card-header-add"
                        title={`Añadir producto a ${group.location}`}
                        aria-label={`Añadir producto a ${group.location}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleCardQuickAdd(group.location);
                        }}
                      >
                        <Plus size={13} aria-hidden="true" />
                        <span>+ Producto</span>
                      </button>

                      {group.completedCount > 0 && (
                        <button
                          type="button"
                          className="btn-collapse-section-inline"
                          title={`Resetear los ${group.completedCount} productos comprados de ${group.location} a pendientes (sin borrarlos)`}
                          onClick={() => onResetStoreCompleted(group.location)}
                        >
                          <RotateCcw size={13} aria-hidden="true" />
                          <span>Resetear ({formatNumber(group.completedCount, 0)})</span>
                        </button>
                      )}

                      {group.subtotal > 0 && (
                        <span
                          className="location-subtotal-badge tabular-nums"
                          title="Subtotal estimado para este comercio"
                        >
                          {formatMoney(group.subtotal)}
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
                          <ChevronUp size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn-order-arrow"
                          title="Bajar comercio"
                          aria-label={`Bajar comercio ${group.location}`}
                          disabled={groupIdx === groupedItems.length - 1}
                          onClick={() => onReorderLocation('down', group.location)}
                        >
                          <ChevronDown size={15} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Vista previa de productos para comercios contraídos en cuadrícula */}
                  {isCollapsed && group.items.length > 0 && (
                    <div className="card-collapsed-preview">
                      <div className="preview-items-list">
                        {group.items.slice(0, 3).map((it) => {
                          const CategoryIcon = getCategoryIcon(it.category);
                          const sku = it.skuCode || formatSkuCode(it.seqNumber || 1);
                          return (
                            <div
                              key={it.id}
                              className={`preview-item-row ${it.completed ? 'completed' : ''}`}
                              onClick={() => onToggleGroupCollapse(group.location)}
                            >
                              <div className="preview-left">
                                <span className="item-sku-code tabular-nums">{sku}</span>
                                <div className="preview-cat-icon">
                                  <CategoryIcon size={13} aria-hidden="true" />
                                </div>
                                <span className="preview-name">{it.name}</span>
                              </div>
                              <div className="preview-right">
                                <span className="preview-qty tabular-nums">
                                  {formatNumber(it.quantity)} un.
                                </span>
                                {it.unitPrice > 0 && (
                                  <span className="preview-price tabular-nums">
                                    {formatMoney(it.unitPrice * it.quantity)}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="preview-footer">
                        <button
                          type="button"
                          className="btn-preview-expand"
                          onClick={() => onToggleGroupCollapse(group.location)}
                        >
                          {group.items.length > 3
                            ? `Ver todos (${formatNumber(group.items.length, 0)} productos)`
                            : 'Abrir lista completa'}
                        </button>
                        <button
                          type="button"
                          className="btn-preview-quick-add"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleCardQuickAdd(group.location);
                          }}
                        >
                          <Plus size={13} />
                          <span>+ Producto</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Formulario rápido desplegable dentro de la tarjeta */}
                  {quickAddStore === group.location && (
                    <form
                      className="card-quick-add-box"
                      onSubmit={(e) => handleCardQuickAddSubmit(group.location, e)}
                    >
                      <div className="card-quick-add-title">
                        <PlusCircle size={14} aria-hidden="true" />
                        <span>Añadir producto a {group.location}</span>
                      </div>
                      <div className="card-quick-add-row">
                        <div className="card-quick-input-name-wrap">
                          <Package size={14} className="card-quick-icon" aria-hidden="true" />
                          <input
                            type="text"
                            className="card-quick-input-name"
                            placeholder="Nombre del producto..."
                            value={quickAddName}
                            autoFocus
                            autoComplete="off"
                            onChange={(e) => {
                              const val = e.target.value;
                              setQuickAddName(val);
                              setShowQuickAddSuggestions(true);
                              setQuickAddHighlightedIndex(-1);
                              if (
                                quickAddSelectedExisting &&
                                quickAddSelectedExisting.name.toLowerCase() !== val.trim().toLowerCase()
                              ) {
                                setQuickAddSelectedExisting(null);
                              }
                            }}
                            onFocus={() => {
                              if (quickAddName.trim()) setShowQuickAddSuggestions(true);
                            }}
                            onBlur={() => {
                              setTimeout(() => setShowQuickAddSuggestions(false), 200);
                            }}
                            onKeyDown={(e) => {
                              if (!showQuickAddSuggestions || quickAddNameSuggestions.length === 0) return;
                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                setQuickAddHighlightedIndex((prev) => (prev + 1) % quickAddNameSuggestions.length);
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                setQuickAddHighlightedIndex((prev) =>
                                  prev <= 0 ? quickAddNameSuggestions.length - 1 : prev - 1
                                );
                              } else if (e.key === 'Enter' && quickAddHighlightedIndex >= 0) {
                                e.preventDefault();
                                const picked = quickAddNameSuggestions[quickAddHighlightedIndex];
                                setQuickAddName(picked.name);
                                setQuickAddSelectedExisting(picked);
                                setQuickAddCat(picked.category || '');
                                if (picked.unitPrice > 0 && !quickAddPrice) {
                                  setQuickAddPrice(String(picked.unitPrice));
                                }
                                setShowQuickAddSuggestions(false);
                              } else if (e.key === 'Escape') {
                                setShowQuickAddSuggestions(false);
                              }
                            }}
                          />

                          {/* Sugerencias para quick add en tarjeta */}
                          {showQuickAddSuggestions && quickAddNameSuggestions.length > 0 && (
                            <div className="product-suggestions-dropdown card-sug-dropdown" role="listbox">
                              {quickAddNameSuggestions.map((sug, sIdx) => {
                                const CatIcon = getCategoryIcon(sug.category);
                                const isHigh = quickAddHighlightedIndex === sIdx;
                                return (
                                  <div
                                    key={sug.id}
                                    className={`suggestion-item ${isHigh ? 'highlighted' : ''}`}
                                    role="option"
                                    aria-selected={isHigh}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setQuickAddName(sug.name);
                                      setQuickAddSelectedExisting(sug);
                                      setQuickAddCat(sug.category || '');
                                      if (sug.unitPrice > 0 && !quickAddPrice) {
                                        setQuickAddPrice(String(sug.unitPrice));
                                      }
                                      setShowQuickAddSuggestions(false);
                                    }}
                                  >
                                    <div className="sug-left">
                                      <span className="item-sku-code tabular-nums">{sug.skuCode}</span>
                                      <div className="sug-icon-pill">
                                        <CatIcon size={13} aria-hidden="true" />
                                      </div>
                                      <span className="sug-name">{sug.name}</span>
                                    </div>
                                    <div className="sug-right">
                                      {sug.unitPrice > 0 && (
                                        <span className="sug-price tabular-nums">{formatMoney(sug.unitPrice)}</span>
                                      )}
                                      <span
                                        className={`sug-status-badge ${
                                          sug.completed ? 'is-completed' : 'is-pending'
                                        }`}
                                      >
                                        {sug.completed ? '✓ Comprado' : '⏳ En lista'}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <input
                          type="text"
                          inputMode="decimal"
                          className="card-quick-input-qty"
                          placeholder="Cant."
                          value={quickAddQty}
                          onChange={(e) => setQuickAddQty(e.target.value)}
                        />

                        <input
                          type="text"
                          inputMode="decimal"
                          className="card-quick-input-price"
                          placeholder="$ Precio"
                          value={quickAddPrice}
                          onChange={(e) => setQuickAddPrice(e.target.value)}
                        />

                        <button
                          type="submit"
                          className="btn btn-primary btn-sm btn-card-quick-submit"
                          title="Añadir a este comercio"
                        >
                          <Plus size={14} aria-hidden="true" />
                          <span>Añadir</span>
                        </button>
                        <button
                          type="button"
                          className="btn-card-quick-cancel"
                          onClick={() => setQuickAddStore(null)}
                          title="Cancelar"
                          aria-label="Cancelar"
                        >
                          <X size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </form>
                  )}

                  {!isCollapsed && (
                    <div className="items-list">
                      {group.items.map((item) => {
                        const isEditing = editingId === item.id;
                        const CategoryIcon = getCategoryIcon(item.category);
                        const itemTotal = (item.unitPrice || 0) * (item.quantity || 1);
                        const sku = item.skuCode || formatSkuCode(item.seqNumber || 1);
                        const lastHistoryEntry = item.purchaseHistory?.[0];

                        if (isEditing) {
                          return (
                            <div key={item.id} className="item-row editing-row">
                              <div className="edit-inputs-grid">
                                <span className="item-sku-code tabular-nums">{sku}</span>
                                <input
                                  type="text"
                                  className="edit-input-name"
                                  value={editName}
                                  placeholder="Producto"
                                  onChange={(e) => setEditName(e.target.value)}
                                  autoFocus
                                />
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  className="edit-input-qty"
                                  value={editQty}
                                  placeholder="Cant."
                                  onChange={(e) => setEditQty(e.target.value)}
                                />
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  className="edit-input-price"
                                  value={editPrice}
                                  placeholder="Precio unit."
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
                                <input
                                  type="text"
                                  className="edit-input-cat"
                                  value={editDate}
                                  placeholder="Fecha compra (DD/MM/AAAA)"
                                  title="Fecha de compra (opcional)"
                                  onChange={(e) => setEditDate(e.target.value)}
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
                                  aria-label={`Marcar ${sku} ${item.name} como ${
                                    item.completed ? 'pendiente' : 'comprado'
                                  }`}
                                />
                                <span className="checkmark" />
                              </label>

                              <div
                                className="category-avatar-pill"
                                title={`Categoría: ${item.category || 'General'}`}
                              >
                                <CategoryIcon size={16} aria-hidden="true" />
                              </div>

                              <span
                                className="item-sku-code tabular-nums"
                                title={`ID de producto ${sku}`}
                              >
                                {sku}
                              </span>

                              <span
                                className="item-name"
                                title="Haga clic para editar nombre o datos"
                                onClick={() => startEditing(item)}
                              >
                                {item.name}
                              </span>

                              {item.completed ? (
                                <span
                                  className={`item-purchase-date-badge tabular-nums ${
                                    item.lastPurchasedDate ? 'has-date' : 'no-date'
                                  }`}
                                  title={
                                    item.lastPurchasedDate
                                      ? `Comprado el ${item.lastPurchasedDate}`
                                      : 'Comprado sin fecha registrada — puedes pulsar Resetear (↺) para iniciar el registro con fecha'
                                  }
                                >
                                  <Calendar size={11} aria-hidden="true" />
                                  <span>
                                    {item.lastPurchasedDate || 'Sin fecha'}
                                  </span>
                                </span>
                              ) : (
                                lastHistoryEntry?.date && (
                                  <span
                                    className="item-purchase-date-badge prev-date tabular-nums"
                                    title={`Última compra registrada el ${lastHistoryEntry.date} en ${lastHistoryEntry.storeName} (${formatMoney(lastHistoryEntry.unitPrice)})`}
                                  >
                                    <Calendar size={11} aria-hidden="true" />
                                    <span>Últ.: {lastHistoryEntry.date}</span>
                                  </span>
                                )
                              )}
                            </div>

                            <div className="item-right">
                              <div className="item-pricing tabular-nums">
                                {!item.completed ? (
                                  <div className="qty-stepper-inline">
                                    <button
                                      type="button"
                                      className="btn-qty-step"
                                      title="Restar 1"
                                      aria-label={`Restar cantidad a ${item.name}`}
                                      disabled={item.quantity <= 1}
                                      onClick={() => handleStepQuantity(item, -1)}
                                    >
                                      <Minus size={12} />
                                    </button>
                                    <span className="item-qty-tag">
                                      {formatNumber(item.quantity)} un.
                                    </span>
                                    <button
                                      type="button"
                                      className="btn-qty-step"
                                      title="Sumar 1"
                                      aria-label={`Sumar cantidad a ${item.name}`}
                                      onClick={() => handleStepQuantity(item, 1)}
                                    >
                                      <Plus size={12} />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="item-qty-tag">
                                    {formatNumber(item.quantity)} un.
                                  </span>
                                )}

                                {item.unitPrice > 0 && (
                                  <span className="item-price-tag">
                                    {formatMoney(itemTotal)}
                                    {item.quantity > 1 && (
                                      <small className="unit-price-sub">
                                        {' '}
                                        ({formatMoney(item.unitPrice)} c/u)
                                      </small>
                                    )}
                                  </span>
                                )}
                              </div>

                              <div className="item-actions">
                                <button
                                  type="button"
                                  className={`btn-item-action btn-reset-item ${
                                    item.completed ? 'is-completed-reset' : ''
                                  }`}
                                  title={
                                    item.completed
                                      ? 'Resetear producto: volver a pendiente (sin borrarlo) para registrar nueva compra con fecha'
                                      : 'Resetear fecha/estado del producto'
                                  }
                                  aria-label={`Resetear ${item.name}`}
                                  onClick={() => onResetItem(item.id)}
                                >
                                  <RotateCcw size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="btn-item-action"
                                  title="Editar nombre, precio o fecha del producto"
                                  aria-label={`Editar ${item.name}`}
                                  onClick={() => startEditing(item)}
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  type="button"
                                  className="btn-item-action btn-delete-item"
                                  title="Eliminar producto del catálogo"
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

                      <button
                        type="button"
                        className="btn-card-bottom-add"
                        title={`Añadir nuevo producto a ${group.location}`}
                        onClick={() => handleToggleCardQuickAdd(group.location)}
                      >
                        <Plus size={14} aria-hidden="true" />
                        <span>Agregar producto a {group.location}</span>
                      </button>
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
            <span id="printGrandTotalValue" className="print-summary-value tabular-nums">
              {formatMoney(grandTotalPending)}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
