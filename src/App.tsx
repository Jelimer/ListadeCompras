import React, { useState, useEffect, useMemo, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { ShoppingItem, RouteOrigin, TripsData, UndoAction } from './types';
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
  saveStoredOrigin,
  loadStoredTripsData,
  saveStoredTripsData,
  saveStoreCoordinate,
} from './utils/storage';
import { calculateMetrics } from './utils/analytics';
import { importJSON, importCSV } from './utils/exportImport';
import { Header } from './components/Header';
import { NavigationTabs, ViewType } from './components/NavigationTabs';
import { ListView } from './components/ListView';
import { StatsView } from './components/StatsView';
import { MapView } from './components/MapView';
import { ModalEditStoreLocation } from './components/ModalEditStoreLocation';
import { ShareModal } from './components/ShareModal';
import { ExportModal } from './components/ExportModal';
import { UndoToast } from './components/UndoToast';

function normalizeLocKey(loc: string): string {
  return String(loc || 'General').trim().toLowerCase();
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

  // Network Online Status
  const [isOnline, setIsOnline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));

  // Undo Stack
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [lastUndoAction, setLastUndoAction] = useState<UndoAction | null>(null);

  // Modals & Map Picker State
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
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

  // Financial Metrics
  const metrics = useMemo(() => calculateMetrics(items, budget), [items, budget]);

  // Push Undo Helper
  const pushUndo = useCallback((action: UndoAction) => {
    setUndoStack((prev) => [...prev.slice(-29), action]);
    setLastUndoAction(action);
  }, []);

  // Item Actions
  const handleAddItem = (itemData: Omit<ShoppingItem, 'id' | 'timestamp' | 'updatedAt'>) => {
    const newItem: ShoppingItem = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      ...itemData,
      timestamp: Date.now(),
      updatedAt: Date.now(),
    };

    setItems((prev) => [newItem, ...prev]);

    pushUndo({
      type: 'ADD_ITEM',
      timestamp: Date.now(),
      payload: { id: newItem.id },
      description: `Se añadió "${newItem.name}"`,
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
      description: `Se actualizó "${updates.name || previous.name}"`,
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
      description: `Se eliminó "${itemToDelete.name}"`,
    });
  };

  const handleToggleCompleted = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    const previousCompleted = item.completed;
    const nextCompleted = !previousCompleted;

    const nextItems = items.map((i) =>
      i.id === id ? { ...i, completed: nextCompleted, updatedAt: Date.now() } : i
    );

    setItems(nextItems);

    // If all items are completed, trigger celebration confetti!
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
      payload: { id, previousCompleted },
      description: previousCompleted
        ? `Marcado como pendiente: "${item.name}"`
        : `Comprado: "${item.name}"`,
    });
  };

  const handleClearCompleted = () => {
    const completedItems = items.filter((i) => i.completed);
    if (completedItems.length === 0) return;

    setItems((prev) => prev.filter((i) => !i.completed));

    pushUndo({
      type: 'CLEAR_COMPLETED',
      timestamp: Date.now(),
      payload: { items: completedItems },
      description: `Se limpiaron ${completedItems.length} productos comprados`,
    });
  };

  // Undo execution
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const action = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setLastUndoAction(null);

    switch (action.type) {
      case 'ADD_ITEM':
        setItems((prev) => prev.filter((i) => i.id !== action.payload.id));
        break;
      case 'DELETE_ITEM': {
        const restored = { ...action.payload.item };
        const idx = action.payload.index;
        setItems((prev) => {
          const next = [...prev];
          next.splice(idx, 0, restored);
          return next;
        });
        break;
      }
      case 'UPDATE_ITEM':
        setItems((prev) =>
          prev.map((i) => (i.id === action.payload.previousItem.id ? { ...action.payload.previousItem } : i))
        );
        break;
      case 'TOGGLE_COMPLETED':
        setItems((prev) =>
          prev.map((i) =>
            i.id === action.payload.id ? { ...i, completed: action.payload.previousCompleted } : i
          )
        );
        break;
      case 'CLEAR_COMPLETED':
        setItems((prev) => [...prev, ...action.payload.items]);
        break;
    }
  };

  // Layout mode
  const handleToggleLayout = (mode: 'list' | 'grid') => {
    setLayoutMode(mode);
    saveStoredLayout(mode);
  };

  // Group Collapse (normalized so 100% of groups can be collapsed/expanded cleanly)
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
    const distinctLocs = Array.from(new Set(items.map((i) => (i.location && i.location.trim()) || 'General')));
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
          setItems(res.items);
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
          setItems(res.items);
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
    setItems((prev) => [...prev]);
  };

  return (
    <div className={`container ${currentView === 'map' ? 'map-panoramic-mode' : ''}`}>
      {/* Skip link for accessibility */}
      <a href="#main-content" className="skip-link sr-only focusable">
        Saltar al contenido principal
      </a>

      {/* Header */}
      <Header
        isOnline={isOnline}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenShare={() => setIsShareOpen(true)}
        onPrint={handlePrint}
        onExport={() => setIsExportOpen(true)}
        onImportClick={handleImportClick}
        onFileChange={handleFileChange}
      />

      {/* Main Tabs */}
      <NavigationTabs currentView={currentView} onSelectView={setCurrentView} />

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
            locationOrder={locationOrder}
            onSetLocationOrder={setLocationOrder}
            collapsedGroups={collapsedGroups}
            onToggleGroupCollapse={handleToggleGroupCollapse}
            onSetCollapsedGroups={setCollapsedGroups}
            onReorderLocation={handleReorderLocation}
            grandTotalPending={metrics.totalPending}
          />
        )}

        {currentView === 'stats' && (
          <StatsView
            items={items}
            budget={budget}
            onBudgetChange={setBudget}
            metrics={metrics}
            onClearCompleted={handleClearCompleted}
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
      <div id="ariaAnnouncer" className="sr-only" role="status" aria-live="polite" aria-atomic="true" />
    </div>
  );
};
export default App;
