import React, { useState, useEffect, useMemo, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  ShoppingItem,
  RouteOrigin,
  TripsData,
  UndoAction,
  PurchaseReceipt,
  ReceiptLineItem,
  PurchaseHistoryEntry,
} from './types';
import {
  loadStoredItems,
  saveStoredItems,
  loadStoredBudget,
  saveStoredBudget,
  loadStoredTheme,
  saveStoredTheme,
  loadStoredLayout,
  saveStoredLayout,
  loadStoredLocationOrder,
  saveStoredLocationOrder,
  loadStoredCollapsedGroups,
  saveStoredCollapsedGroups,
  loadStoredOrigin,
  loadStoredOrigin as refreshOrigin,
  loadStoredTripsData,
  saveStoreCoordinate,
  getNextSequentialSku,
  ensureSequentialSkus,
  loadStoredReceipts,
  saveStoredReceipts,
  formatSkuCode,
} from './utils/storage';
import { calculateMetrics } from './utils/analytics';
import { importJSON, importCSV } from './utils/exportImport';
import { formatMoney } from './utils/formatters';
import { Header } from './components/Header';
import { NavigationTabs, ViewType } from './components/NavigationTabs';
import { ListView, isPendingLocationName } from './components/ListView';
import { StatsView } from './components/StatsView';
import { MapView } from './components/MapView';
import { ModalEditStoreLocation } from './components/ModalEditStoreLocation';
import { ShareModal } from './components/ShareModal';
import { ExportModal } from './components/ExportModal';
import { ReceiptScannerModal } from './components/ReceiptScannerModal';
import { UndoToast } from './components/UndoToast';

function normalizeLocKey(loc: string): string {
  return String(loc || 'General')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export const App: React.FC = () => {
  // State Initialization from Persistent LocalStorage
  const [items, setItems] = useState<ShoppingItem[]>(() => loadStoredItems());
  const [budget, setBudget] = useState<number>(() => loadStoredBudget());
  const [theme, setTheme] = useState<'light' | 'dark'>(() => loadStoredTheme());
  const [layoutMode, setLayoutMode] = useState<'list' | 'grid'>(() => loadStoredLayout());
  const [currentView, setCurrentView] = useState<ViewType>('list');
  const [locationOrder, setLocationOrder] = useState<string[]>(() => loadStoredLocationOrder());
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>(() => loadStoredCollapsedGroups());
  const [origin, setOrigin] = useState<RouteOrigin>(() => loadStoredOrigin());
  const [tripsData, setTripsData] = useState<TripsData>(() => loadStoredTripsData());
  const [receipts, setReceipts] = useState<PurchaseReceipt[]>(() => loadStoredReceipts());

  // Network Online Status
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Undo Stack
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [lastUndoAction, setLastUndoAction] = useState<UndoAction | null>(null);

  // Modals & Map Picker State
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isReceiptScannerOpen, setIsReceiptScannerOpen] = useState(false);
  const [editStoreModalName, setEditStoreModalName] = useState<string | null>(null);
  const [pickerStore, setPickerStore] = useState<string | null>(null);

  // Sync theme with document element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    saveStoredTheme(theme);
  }, [theme]);

  // Sync online/offline listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Save items when changed
  useEffect(() => {
    saveStoredItems(items);
  }, [items]);

  // Save budget when changed
  useEffect(() => {
    saveStoredBudget(budget);
  }, [budget]);

  // Save location order
  useEffect(() => {
    saveStoredLocationOrder(locationOrder);
  }, [locationOrder]);

  // Save collapsed groups
  useEffect(() => {
    saveStoredCollapsedGroups(collapsedGroups);
  }, [collapsedGroups]);

  // Save receipts when changed
  useEffect(() => {
    saveStoredReceipts(receipts);
  }, [receipts]);

  // Financial Metrics
  const metrics = useMemo(() => calculateMetrics(items, budget), [items, budget]);

  // Distinct locations and categories for autocomplete in ReceiptScannerModal
  const distinctLocations = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.location && i.location.trim() && !isPendingLocationName(i.location)) {
        set.add(i.location.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [items]);

  const distinctCategories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.category && i.category.trim()) set.add(i.category.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [items]);

  // Push Undo Helper
  const pushUndo = useCallback((action: UndoAction) => {
    setUndoStack((prev) => [...prev.slice(-29), action]);
    setLastUndoAction(action);
  }, []);

  // Item Actions
  const handleAddItem = (itemData: Omit<ShoppingItem, 'id' | 'timestamp' | 'updatedAt'>) => {
    const { seqNumber, skuCode } = getNextSequentialSku(items);
    const newItem: ShoppingItem = {
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      seqNumber,
      skuCode,
      ...itemData,
      timestamp: Date.now(),
      updatedAt: Date.now(),
    };

    setItems((prev) => [newItem, ...prev]);

    pushUndo({
      type: 'ADD_ITEM',
      timestamp: Date.now(),
      payload: { id: newItem.id },
      description: `Se añadió ${skuCode} "${newItem.name}"`,
    });
  };

  const handleUpdateItem = (id: string, updates: Partial<ShoppingItem>) => {
    const previous = items.find((i) => i.id === id);
    if (!previous) return;

    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...updates, updatedAt: Date.now() } : i))
    );

    pushUndo({
      type: 'UPDATE_ITEM',
      timestamp: Date.now(),
      payload: { previousItem: { ...previous } },
      description: `Se actualizó ${previous.skuCode || ''} "${updates.name || previous.name}"`,
    });
  };

  const handleDeleteItem = (id: string) => {
    const index = items.findIndex((i) => i.id === id);
    if (index === -1) return;
    const itemToDelete = items[index];

    setItems((prev) => prev.filter((i) => i.id !== id));

    pushUndo({
      type: 'DELETE_ITEM',
      timestamp: Date.now(),
      payload: { item: { ...itemToDelete }, index },
      description: `Se eliminó ${itemToDelete.skuCode || ''} "${itemToDelete.name}"`,
    });
  };

  const handleToggleCompleted = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    const previousCompleted = item.completed;
    const previousDate = item.lastPurchasedDate;
    const nextCompleted = !previousCompleted;
    const todayStr = new Date().toLocaleDateString('es-AR');

    const nextItems = items.map((i) => {
      if (i.id !== id) return i;
      if (nextCompleted) {
        const entry: PurchaseHistoryEntry = {
          date: todayStr,
          storeName: i.location || 'General',
          unitPrice: i.unitPrice || 0,
          quantity: i.quantity || 1,
        };
        const prevHist = Array.isArray(i.purchaseHistory) ? i.purchaseHistory : [];
        return {
          ...i,
          completed: true,
          lastPurchasedDate: todayStr,
          purchaseHistory: [entry, ...prevHist.slice(0, 19)],
          updatedAt: Date.now(),
        };
      } else {
        return {
          ...i,
          completed: false,
          lastPurchasedDate: undefined,
          receiptId: undefined,
          updatedAt: Date.now(),
        };
      }
    });

    setItems(nextItems);

    const pendingRemaining = nextItems.filter((i) => !i.completed).length;
    if (nextCompleted && pendingRemaining === 0 && nextItems.length > 0) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    }

    pushUndo({
      type: 'TOGGLE_COMPLETED',
      timestamp: Date.now(),
      payload: { id, previousCompleted, previousDate },
      description: previousCompleted
        ? `Pendiente nuevamente: ${item.skuCode || ''} "${item.name}"`
        : `Comprado (${todayStr}): ${item.skuCode || ''} "${item.name}"`,
    });
  };

  // Reset a single product to pending (keeping the product, its #ID, name, store, and reference price)
  const handleResetProduct = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    const snapshot = { ...item };

    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              completed: false,
              lastPurchasedDate: undefined,
              receiptId: undefined,
              updatedAt: Date.now(),
            }
          : i
      )
    );

    pushUndo({
      type: 'RESET_ITEMS',
      timestamp: Date.now(),
      payload: { previousItems: [snapshot] },
      description: `Producto reseteado a pendiente: ${item.skuCode || ''} "${item.name}"`,
    });
  };

  // Reset all completed products of a specific store (keeping all products intact)
  const handleResetStoreCompleted = (location: string) => {
    const targetNorm = normalizeLocKey(location);
    const affected = items.filter(
      (i) => i.completed && normalizeLocKey(i.location) === targetNorm
    );
    if (affected.length === 0) return;

    const snapshots = affected.map((i) => ({ ...i }));

    setItems((prev) =>
      prev.map((i) =>
        i.completed && normalizeLocKey(i.location) === targetNorm
          ? {
              ...i,
              completed: false,
              lastPurchasedDate: undefined,
              receiptId: undefined,
              updatedAt: Date.now(),
            }
          : i
      )
    );

    pushUndo({
      type: 'RESET_ITEMS',
      timestamp: Date.now(),
      payload: { previousItems: snapshots },
      description: `Se resetearon ${affected.length} productos en "${location}" (conservados en tu lista)`,
    });
  };

  // Reset all completed products across the list (keeping 100% of products intact to start tracking with dates)
  const handleResetAllCompleted = () => {
    const completedItems = items.filter((i) => i.completed);
    if (completedItems.length === 0) return;

    const snapshots = completedItems.map((i) => ({ ...i }));

    setItems((prev) =>
      prev.map((i) =>
        i.completed
          ? {
              ...i,
              completed: false,
              lastPurchasedDate: undefined,
              receiptId: undefined,
              updatedAt: Date.now(),
            }
          : i
      )
    );

    pushUndo({
      type: 'RESET_ITEMS',
      timestamp: Date.now(),
      payload: { previousItems: snapshots },
      description: `Se resetearon ${completedItems.length} productos a pendientes (sin borrar ninguno)`,
    });
  };

  // Process & Confirm Uploaded Receipt
  const handleConfirmReceipt = (payload: {
    storeName: string;
    storeAddress: string;
    date: string;
    receiptNumber: string;
    items: ReceiptLineItem[];
    total: number;
    thumbnailDataUrl?: string;
    syncEditedNamesToList: boolean;
  }) => {
    const receiptId = `rcpt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const cleanStoreName = payload.storeName.trim() || 'General';
    const purchaseDate = payload.date.trim() || new Date().toLocaleDateString('es-AR');

    let workingItems = [...items];
    const receiptSavedItems: PurchaseReceipt['items'] = [];

    payload.items.forEach((lineItem, idx) => {
      const qty = Math.max(0.01, Number(lineItem.quantity) || 1);
      const price = Math.max(0, Number(lineItem.unitPrice) || 0);
      const lineTotal = Math.round(qty * price * 100) / 100;
      const cleanEditedName = lineItem.name.trim();

      // Check if linked to an existing item in the list
      const existingIndex = lineItem.matchedItemId
        ? workingItems.findIndex((w) => w.id === lineItem.matchedItemId)
        : -1;

      const historyEntry: PurchaseHistoryEntry = {
        date: purchaseDate,
        storeName: cleanStoreName,
        unitPrice: price,
        quantity: qty,
        receiptId,
        rawTicketName: lineItem.rawTicketName,
      };

      if (existingIndex !== -1) {
        const existing = workingItems[existingIndex];
        const sku = existing.skuCode || formatSkuCode(existing.seqNumber || existingIndex + 1);
        const finalProductName =
          payload.syncEditedNamesToList && cleanEditedName ? cleanEditedName : existing.name;
        const prevHist = Array.isArray(existing.purchaseHistory) ? existing.purchaseHistory : [];

        workingItems[existingIndex] = {
          ...existing,
          name: finalProductName,
          quantity: qty,
          unitPrice: price,
          location: cleanStoreName,
          category: lineItem.category || existing.category || 'General',
          completed: true,
          lastPurchasedDate: purchaseDate,
          receiptId,
          purchaseHistory: [historyEntry, ...prevHist.slice(0, 19)],
          updatedAt: Date.now(),
        };
        receiptSavedItems.push({
          name: cleanEditedName || existing.name,
          rawTicketName: lineItem.rawTicketName,
          quantity: qty,
          unitPrice: price,
          lineTotal,
          category: lineItem.category || existing.category || 'General',
          skuCode: sku,
          matchedItemId: existing.id,
        });
      } else {
        // Add as a new purchased item with next sequential #ID
        const { seqNumber, skuCode } = getNextSequentialSku(workingItems);
        const newItemId = `item_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`;
        const newItem: ShoppingItem = {
          id: newItemId,
          seqNumber,
          skuCode,
          name: cleanEditedName,
          quantity: qty,
          unitPrice: price,
          location: cleanStoreName,
          category: lineItem.category.trim() || 'General',
          completed: true,
          lastPurchasedDate: purchaseDate,
          receiptId,
          purchaseHistory: [historyEntry],
          timestamp: Date.now(),
          updatedAt: Date.now(),
        };
        workingItems = [newItem, ...workingItems];
        receiptSavedItems.push({
          name: newItem.name,
          rawTicketName: lineItem.rawTicketName,
          quantity: qty,
          unitPrice: price,
          lineTotal,
          category: newItem.category,
          skuCode,
          matchedItemId: newItemId,
        });
      }
    });

    const newReceipt: PurchaseReceipt = {
      id: receiptId,
      storeName: cleanStoreName,
      storeAddress: payload.storeAddress || undefined,
      date: purchaseDate,
      receiptNumber: payload.receiptNumber || undefined,
      items: receiptSavedItems,
      total: payload.total,
      imagePreview: payload.thumbnailDataUrl,
      createdAt: Date.now(),
    };

    setItems(ensureSequentialSkus(workingItems));
    setReceipts((prev) => [newReceipt, ...prev]);

    confetti({
      particleCount: 70,
      spread: 60,
      origin: { y: 0.65 },
    });

    pushUndo({
      type: 'ADD_ITEM',
      timestamp: Date.now(),
      payload: { id: '' },
      description: `Ticket de "${cleanStoreName}" (${purchaseDate}) registrado por ${formatMoney(payload.total)}`,
    });
  };

  // Update a saved receipt in History (and sync corrected names/prices to linked items in the main list)
  const handleUpdateReceipt = (updatedReceipt: PurchaseReceipt) => {
    setReceipts((prev) =>
      prev.map((r) => (r.id === updatedReceipt.id ? updatedReceipt : r))
    );

    setItems((prevItems) =>
      prevItems.map((item) => {
        // Match by matchedItemId or skuCode from the edited receipt
        const editedLine = updatedReceipt.items.find(
          (ri) =>
            (ri.matchedItemId && ri.matchedItemId === item.id) ||
            (ri.skuCode && ri.skuCode === item.skuCode && item.receiptId === updatedReceipt.id)
        );
        if (!editedLine) return item;

        return {
          ...item,
          name: editedLine.name.trim() || item.name,
          category: editedLine.category.trim() || item.category,
          quantity: editedLine.quantity > 0 ? editedLine.quantity : item.quantity,
          unitPrice: editedLine.unitPrice >= 0 ? editedLine.unitPrice : item.unitPrice,
          location: updatedReceipt.storeName.trim() || item.location,
          lastPurchasedDate: updatedReceipt.date.trim() || item.lastPurchasedDate,
          updatedAt: Date.now(),
        };
      })
    );
  };

  const handleDeleteReceipt = (receiptId: string) => {
    setReceipts((prev) => prev.filter((r) => r.id !== receiptId));
  };

  // Undo execution
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const action = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setLastUndoAction(null);

    switch (action.type) {
      case 'ADD_ITEM':
        if (action.payload.id) {
          setItems((prev) => prev.filter((i) => i.id !== action.payload.id));
        }
        break;
      case 'DELETE_ITEM': {
        const restored = { ...action.payload.item };
        const idx = action.payload.index;
        setItems((prev) => {
          const next = [...prev];
          next.splice(idx, 0, restored);
          return ensureSequentialSkus(next);
        });
        break;
      }
      case 'UPDATE_ITEM':
        setItems((prev) =>
          prev.map((i) =>
            i.id === action.payload.previousItem.id ? { ...action.payload.previousItem } : i
          )
        );
        break;
      case 'TOGGLE_COMPLETED':
        setItems((prev) =>
          prev.map((i) =>
            i.id === action.payload.id
              ? {
                  ...i,
                  completed: action.payload.previousCompleted,
                  lastPurchasedDate: action.payload.previousDate,
                }
              : i
          )
        );
        break;
      case 'RESET_ITEMS': {
        const mapById = new Map(action.payload.previousItems.map((p) => [p.id, p]));
        setItems((prev) =>
          prev.map((i) => (mapById.has(i.id) ? { ...mapById.get(i.id)! } : i))
        );
        break;
      }
      case 'CLEAR_COMPLETED':
        setItems((prev) => ensureSequentialSkus([...prev, ...action.payload.items]));
        break;
    }
  };

  // Layout mode
  const handleToggleLayout = (mode: 'list' | 'grid') => {
    setLayoutMode(mode);
    saveStoredLayout(mode);
  };

  // Group Collapse (normalized so 100% of groups and sections can be collapsed/expanded cleanly)
  const handleToggleGroupCollapse = (loc: string) => {
    const targetNorm = normalizeLocKey(loc);
    setCollapsedGroups((prev) => {
      const exists = prev.some((l) => normalizeLocKey(l) === targetNorm);
      if (exists) {
        return prev.filter((l) => normalizeLocKey(l) !== targetNorm);
      }
      return [...prev, loc.trim()];
    });
  };

  // Reorder Locations
  const handleReorderLocation = (direction: 'up' | 'down', targetLoc: string) => {
    const distinctLocs = Array.from(
      new Set(items.map((i) => (i.location && i.location.trim()) || 'General'))
    );
    const fullOrder = [...locationOrder];
    distinctLocs.forEach((l) => {
      if (!fullOrder.some((existing) => normalizeLocKey(existing) === normalizeLocKey(l))) {
        fullOrder.push(l);
      }
    });

    const index = fullOrder.findIndex((l) => normalizeLocKey(l) === normalizeLocKey(targetLoc));
    if (index === -1) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= fullOrder.length) return;

    const temp = fullOrder[index];
    fullOrder[index] = fullOrder[targetIdx];
    fullOrder[targetIdx] = temp;

    setLocationOrder(fullOrder);
  };

  // Theme Toggle
  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Print
  const handlePrint = () => {
    window.print();
  };

  // File Import (.json, .csv)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      if (file.name.endsWith('.csv')) {
        const res = importCSV(content);
        if (res.success && res.items.length > 0) {
          setItems(ensureSequentialSkus(res.items));
          pushUndo({
            type: 'ADD_ITEM',
            timestamp: Date.now(),
            payload: { id: '' },
            description: `¡${res.items.length} productos importados desde CSV!`,
          });
        }
      } else {
        const res = importJSON(content);
        if (res.success) {
          setItems(ensureSequentialSkus(res.items));
          if (res.budget > 0) setBudget(res.budget);
          pushUndo({
            type: 'ADD_ITEM',
            timestamp: Date.now(),
            payload: { id: '' },
            description: `¡${res.items.length} productos importados desde JSON!`,
          });
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportClick = () => {
    const input = document.getElementById('importFileInput') as HTMLInputElement;
    input?.click();
  };

  // Map Picker coordinates picked callback
  const handleCoordPicked = (storeName: string, lat: number, lng: number) => {
    saveStoreCoordinate(storeName, {
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      displayName: storeName,
      address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      source: 'picker',
    });
    setPickerStore(null);
    setOrigin(refreshOrigin());
    setItems((prev) => [...prev]);
  };

  return (
    <div className={`container ${currentView === 'map' ? 'map-panoramic-mode' : ''}`}>
      {/* Skip link for accessibility */}
      <a href="#main-content" className="skip-link sr-only focusable">
        Saltar al contenido principal
      </a>

      {/* Cabecera y Navegación Ejecutiva Unificada */}
      <div className="executive-topbar-shell">
        <Header
          isOnline={isOnline}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onOpenReceiptScanner={() => setIsReceiptScannerOpen(true)}
          receiptsCount={receipts.length}
          totalItemsCount={items.length}
          pendingCount={items.filter((i) => !i.completed).length}
          totalPendingAmount={metrics.totalPending}
          totalSpentAmount={metrics.totalSpent}
          onOpenShare={() => setIsShareOpen(true)}
          onPrint={handlePrint}
          onExport={() => setIsExportOpen(true)}
          onImportClick={handleImportClick}
          onFileChange={handleFileChange}
        />

        {/* Main Tabs */}
        <NavigationTabs
          currentView={currentView}
          onSelectView={setCurrentView}
          totalItemsCount={items.length}
          storesCount={distinctLocations.length}
          receiptsCount={receipts.length}
        />
      </div>

      {/* Main Panels */}
      <main id="main-content" className="dashboard-grid" role="main">
        {currentView === 'list' && (
          <ListView
            items={items}
            layoutMode={layoutMode}
            onToggleLayout={handleToggleLayout}
            onAddItem={handleAddItem}
            onUpdateItem={handleUpdateItem}
            onDeleteItem={handleDeleteItem}
            onToggleCompleted={handleToggleCompleted}
            onResetItem={handleResetProduct}
            onResetStoreCompleted={handleResetStoreCompleted}
            onResetAllCompleted={handleResetAllCompleted}
            locationOrder={locationOrder}
            onSetLocationOrder={setLocationOrder}
            collapsedGroups={collapsedGroups}
            onToggleGroupCollapse={handleToggleGroupCollapse}
            onSetCollapsedGroups={setCollapsedGroups}
            onReorderLocation={handleReorderLocation}
            grandTotalPending={metrics.totalPending}
            onOpenReceiptScanner={() => setIsReceiptScannerOpen(true)}
          />
        )}

        {currentView === 'stats' && (
          <StatsView
            items={items}
            budget={budget}
            onBudgetChange={setBudget}
            metrics={metrics}
            onResetAllCompleted={handleResetAllCompleted}
            onResetItem={handleResetProduct}
            onToggleCompleted={handleToggleCompleted}
            receipts={receipts}
            onOpenReceiptScanner={() => setIsReceiptScannerOpen(true)}
            onDeleteReceipt={handleDeleteReceipt}
            theme={theme}
          />
        )}

        {currentView === 'map' && (
          <MapView
            items={items}
            origin={origin}
            onOriginChange={setOrigin}
            tripsData={tripsData}
            onTripsDataChange={setTripsData}
            theme={theme}
            onEditStoreLocation={(store) => setEditStoreModalName(store)}
            pickerStore={pickerStore}
            onCancelPicker={() => setPickerStore(null)}
            onCoordPicked={handleCoordPicked}
            onToggleCompleted={handleToggleCompleted}
          />
        )}
      </main>

      {/* Modals & Popups */}
      {isReceiptScannerOpen && (
        <ReceiptScannerModal
          isOpen={isReceiptScannerOpen}
          onClose={() => setIsReceiptScannerOpen(false)}
          items={items}
          receipts={receipts}
          distinctLocations={distinctLocations}
          distinctCategories={distinctCategories}
          onConfirmReceipt={handleConfirmReceipt}
          onUpdateReceipt={handleUpdateReceipt}
          onDeleteReceipt={handleDeleteReceipt}
        />
      )}

      {isShareOpen && (
        <ShareModal items={items} isOpen={isShareOpen} onClose={() => setIsShareOpen(false)} />
      )}

      {isExportOpen && (
        <ExportModal
          items={items}
          budget={budget}
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
        />
      )}

      {editStoreModalName && (
        <ModalEditStoreLocation
          storeName={editStoreModalName}
          onClose={() => setEditStoreModalName(null)}
          onStartMapPicker={(store) => setPickerStore(store)}
          onLocationSaved={() => {
            setItems((prev) => [...prev]);
          }}
        />
      )}

      {/* Undo Toast */}
      <UndoToast
        lastAction={lastUndoAction}
        onUndo={handleUndo}
        onDismiss={() => setLastUndoAction(null)}
      />

      {/* Live Region for Screen Readers */}
      <div
        id="ariaAnnouncer"
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      />
    </div>
  );
};
export default App;
