import React, { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin,
  Check,
  Crosshair,
  Milestone,
  Clock,
  Store,
  Navigation,
  Compass,
  Plus,
  Edit2,
  Trash2,
  ListOrdered,
  Sparkles,
  Minus,
  Maximize2,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  GripVertical,
  Route,
  X,
} from 'lucide-react';
import { ShoppingItem, RouteOrigin, Trip, TripsData } from '../types';
import {
  calculateOptimalRoute,
  getCurrentGpsLocation,
  geocodeAddress,
  fetchOSRMRoute,
  OSRMRouteData,
} from '../utils/mapRoute';
import {
  saveStoredOrigin,
  saveStoredTripsData,
  formatSkuCode,
} from '../utils/storage';

interface MapViewProps {
  items: ShoppingItem[];
  origin: RouteOrigin;
  onOriginChange: (origin: RouteOrigin) => void;
  tripsData: TripsData;
  onTripsDataChange: (trips: TripsData) => void;
  theme: 'light' | 'dark';
  onEditStoreLocation: (storeName: string) => void;
  pickerStore: string | null;
  onCancelPicker: () => void;
  onCoordPicked: (storeName: string, lat: number, lng: number) => void;
  onToggleCompleted?: (id: string) => void;
}

export const MapView: React.FC<MapViewProps> = ({
  items,
  origin,
  onOriginChange,
  tripsData,
  onTripsDataChange,
  theme,
  onEditStoreLocation,
  pickerStore,
  onCancelPicker,
  onCoordPicked,
  onToggleCompleted,
}) => {
  const [manualOriginText, setManualOriginText] = useState(origin.address || '');
  const [originStatusMsg, setOriginStatusMsg] = useState<string | null>(null);
  const [customStopOrder, setCustomStopOrder] = useState<string[] | null>(null);

  // Sync manualOriginText when origin prop updates
  useEffect(() => {
    setManualOriginText(origin.address || '');
  }, [origin.address]);

  // OSRM real street route state
  const [osrmRoute, setOsrmRoute] = useState<OSRMRouteData | null>(null);
  const [isLoadingOsrm, setIsLoadingOsrm] = useState<boolean>(false);

  // Drag & Drop state for itinerary stops
  const [draggedStopName, setDraggedStopName] = useState<string | null>(null);
  const [dragOverStopName, setDragOverStopName] = useState<string | null>(null);

  // Collapsed stop items state (expanded by default so details are visible)
  const [collapsedStopItems, setCollapsedStopItems] = useState<Record<string, boolean>>({});
  const [isItineraryCollapsed, setIsItineraryCollapsed] = useState<boolean>(false);

  // Inline Trip create / rename state
  const [tripEditMode, setTripEditMode] = useState<'create' | 'rename' | null>(null);
  const [tripInputName, setTripInputName] = useState('');

  // Active Trip
  const activeTrip = useMemo(() => {
    return (
      tripsData.trips.find((t) => t.id === tripsData.activeTripId) ||
      tripsData.trips[0] || {
        id: 'trip_1',
        name: 'Viaje 1',
        includedStores: null,
        customOrder: null,
      }
    );
  }, [tripsData]);

  // Keep manual order in sync with active trip
  useEffect(() => {
    setCustomStopOrder(activeTrip.customOrder || null);
  }, [activeTrip]);

  // Calculate Route (TSP or Custom Order) — includes both pending and 0-pending stores
  const routeResult = useMemo(() => {
    return calculateOptimalRoute(items, origin, {
      includedStores: activeTrip.includedStores,
      customStopOrder,
    });
  }, [items, origin, activeTrip.includedStores, customStopOrder]);

  // Ordered display list for the sidebar: active orderedStops first (in exact route sequence), then excluded stops
  const displayedStops = useMemo(() => {
    const excluded = routeResult.allStops.filter((s) => !s.isIncluded);
    return [...routeResult.orderedStops, ...excluded];
  }, [routeResult]);

  // Fetch OSRM real street route whenever origin or orderedStops change
  useEffect(() => {
    if (routeResult.orderedStops.length === 0) {
      setOsrmRoute(null);
      setIsLoadingOsrm(false);
      return;
    }

    const controller = new AbortController();
    setIsLoadingOsrm(true);

    fetchOSRMRoute(origin, routeResult.orderedStops, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setOsrmRoute(data);
          setIsLoadingOsrm(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setOsrmRoute(null);
          setIsLoadingOsrm(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [
    origin.lat,
    origin.lng,
    routeResult.orderedStops.map((s) => `${s.storeName}:${s.lat},${s.lng}`).join('|'),
  ]);

  // Leaflet map instance refs
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const routeCasingLayerRef = useRef<L.Polyline | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Initialize Map + ResizeObserver to eliminate right-half blank canvas bug
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    if (!mapRef.current) {
      const map = L.map(container, {
        center: [origin.lat, origin.lng],
        zoom: 14,
        zoomControl: false,
      });

      mapRef.current = map;
      markersLayerRef.current = L.layerGroup().addTo(map);
    }

    const invalidateMapSize = () => {
      if (mapRef.current) {
        mapRef.current.invalidateSize({ animate: false });
      }
    };

    requestAnimationFrame(invalidateMapSize);
    const t1 = setTimeout(invalidateMapSize, 60);
    const t2 = setTimeout(invalidateMapSize, 250);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        invalidateMapSize();
      });
      resizeObserver.observe(container);
    }

    window.addEventListener('resize', invalidateMapSize);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', invalidateMapSize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update map click listener when pickerStore changes
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.off('click');
    mapRef.current.on('click', (e: L.LeafletMouseEvent) => {
      if (pickerStore) {
        onCoordPicked(pickerStore, e.latlng.lat, e.latlng.lng);
      }
    });
  }, [pickerStore, onCoordPicked]);

  // Official OpenStreetMap Tile Layer (100% Free, No API Key Required)
  useEffect(() => {
    if (!mapRef.current) return;

    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
    }

    tileLayerRef.current = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(mapRef.current);
  }, []);

  // Update Markers, Permanent Store Labels (with lighter style for 0-pending stores) & Street Route Polyline
  useEffect(() => {
    if (!mapRef.current || !markersLayerRef.current) return;

    markersLayerRef.current.clearLayers();

    if (routeCasingLayerRef.current) {
      routeCasingLayerRef.current.remove();
      routeCasingLayerRef.current = null;
    }
    if (routeLayerRef.current) {
      routeLayerRef.current.remove();
      routeLayerRef.current = null;
    }

    const bounds = L.latLngBounds([L.latLng(origin.lat, origin.lng)]);

    // 1. Origin Marker with permanent label
    const originIcon = L.divIcon({
      className: 'map-origin-marker',
      html: `<div class="map-pin-badge map-pin-origin"><span>0</span></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });

    const originMarker = L.marker([origin.lat, origin.lng], { icon: originIcon, zIndexOffset: 250 });
    const shortOriginName = (origin.address || 'Corrientes').split(',')[0].trim();
    originMarker.bindTooltip(`Salida · ${shortOriginName}`, {
      permanent: true,
      direction: 'bottom',
      offset: [0, 14],
      className: 'map-store-permanent-label map-origin-permanent-label',
    });
    originMarker.bindPopup(
      `<div class="map-popup-box">
        <strong class="map-popup-title">Punto de Partida</strong>
        <p class="map-popup-address">${origin.address || 'Corrientes, Argentina'}</p>
      </div>`
    );
    markersLayerRef.current.addLayer(originMarker);

    // 2. Stops Markers (Both active orderedStops and excluded/0-pending stores)
    const fallbackCoords: [number, number][] = [[origin.lat, origin.lng]];

    displayedStops.forEach((stop) => {
      const orderedIndex = routeResult.orderedStops.findIndex(
        (s) => s.storeName === stop.storeName
      );
      const isIncluded = orderedIndex !== -1;
      const isZeroPending = stop.pendingItems.length === 0;

      const stopLatLng = L.latLng(stop.lat, stop.lng);
      bounds.extend(stopLatLng);

      if (isIncluded) {
        fallbackCoords.push([stop.lat, stop.lng]);
      }

      const pinClass = isZeroPending || !isIncluded ? 'map-pin-zero-pending' : 'map-pin-stop';
      const badgeLabel = isIncluded ? String(orderedIndex + 1) : '✓';

      const stopIcon = L.divIcon({
        className: `map-stop-marker ${isZeroPending ? 'marker-zero-pending' : ''}`,
        html: `<div class="map-pin-badge ${pinClass}"><span>${badgeLabel}</span></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const allStoreItems = [...stop.pendingItems, ...(stop.completedItems || [])];
      const itemsListHtml = allStoreItems
        .map(
          (it) =>
            `<div class="map-popup-item-row ${it.completed ? 'popup-item-completed' : ''}">
              <span>${it.completed ? '✓' : '•'} ${it.name}</span>
              <span class="tabular-nums">${it.quantity} un.${
              it.unitPrice > 0 ? ` · $${(it.quantity * it.unitPrice).toFixed(2)}` : ''
            }</span>
            </div>`
        )
        .join('');

      const marker = L.marker([stop.lat, stop.lng], {
        icon: stopIcon,
        zIndexOffset: isZeroPending ? 100 : 300 + (isIncluded ? orderedIndex : 0),
        opacity: isZeroPending || !isIncluded ? 0.68 : 1,
      });

      const stepPrefix = isIncluded ? `<span class="label-step-num">${orderedIndex + 1}.</span> ` : '';
      const countText = isZeroPending
        ? '0 pend.'
        : `${stop.pendingItems.length} ${stop.pendingItems.length === 1 ? 'art.' : 'arts.'}`;

      marker.bindTooltip(
        `${stepPrefix}<span class="label-store-name">${stop.storeName}</span> <span class="label-item-count">· ${countText}</span>`,
        {
          permanent: true,
          direction: 'top',
          offset: [0, -16],
          className: `map-store-permanent-label ${
            isZeroPending || !isIncluded ? 'map-label-zero-pending' : ''
          }`,
        }
      );

      marker.bindPopup(`
        <div class="map-popup-box">
          <strong class="map-popup-title">${isIncluded ? `${orderedIndex + 1}. ` : ''}${
        stop.storeName
      }</strong>
          <p class="map-popup-address">${stop.address}</p>
          <div class="map-popup-items-list">
            ${itemsListHtml || '<span>Sin productos</span>'}
          </div>
          <div class="map-popup-footer tabular-nums">
            ${
              isZeroPending
                ? '0 pendientes (Compra completada)'
                : `Subtotal pendiente: $${stop.estimatedTotal.toFixed(2)} (${stop.pendingItems.length} prod.)`
            }
          </div>
        </div>
      `);

      markersLayerRef.current?.addLayer(marker);
    });

    // 3. Draw Street Route Polyline (OSRM real streets if available, else direct fallback)
    const activePolylineCoords =
      osrmRoute && osrmRoute.coordinates.length > 1 ? osrmRoute.coordinates : fallbackCoords;

    if (activePolylineCoords.length > 1) {
      const isRealStreets = Boolean(osrmRoute && osrmRoute.coordinates.length > 1);

      activePolylineCoords.forEach(([lat, lng]) => {
        bounds.extend([lat, lng]);
      });

      // Outer casing for high contrast on both light and dark tiles
      routeCasingLayerRef.current = L.polyline(activePolylineCoords, {
        color: theme === 'dark' ? '#020617' : '#ffffff',
        weight: isRealStreets ? 8 : 6,
        opacity: 0.85,
        lineJoin: 'round',
        lineCap: 'round',
      }).addTo(mapRef.current);

      // Primary route line
      routeLayerRef.current = L.polyline(activePolylineCoords, {
        color: theme === 'dark' ? '#818cf8' : '#4f46e5',
        weight: isRealStreets ? 5 : 4,
        opacity: 0.95,
        dashArray: isRealStreets ? undefined : '8, 8',
        lineJoin: 'round',
        lineCap: 'round',
      }).addTo(mapRef.current);
    }

    // Ensure map dimensions are up to date before fitting bounds
    mapRef.current.invalidateSize({ animate: false });

    if (displayedStops.length > 0) {
      mapRef.current.fitBounds(bounds, { padding: [54, 54], maxZoom: 16 });
    } else {
      mapRef.current.setView([origin.lat, origin.lng], 14);
    }
  }, [routeResult, displayedStops, origin, osrmRoute, theme]);

  // Set Manual Origin
  const handleSetManualOrigin = async () => {
    if (!manualOriginText.trim()) return;
    setOriginStatusMsg('Buscando dirección en Corrientes / Argentina...');
    const geocoded = await geocodeAddress(manualOriginText.trim());
    if (geocoded) {
      const nextOrigin: RouteOrigin = {
        lat: geocoded.lat,
        lng: geocoded.lng,
        address: geocoded.address || manualOriginText.trim(),
        type: 'manual',
        accuracy: null,
      };
      saveStoredOrigin(nextOrigin);
      onOriginChange(nextOrigin);
      setOriginStatusMsg(null);
    } else {
      setOriginStatusMsg('No se encontró la dirección ingresada. Intenta con calle y ciudad.');
    }
  };

  // Set GPS Origin
  const handleGpsOrigin = async () => {
    setOriginStatusMsg('Obteniendo ubicación GPS...');
    const gps = await getCurrentGpsLocation();
    setManualOriginText(gps.address || 'Mi Ubicación actual (GPS)');
    onOriginChange(gps);
    setOriginStatusMsg(null);
  };

  // Trips Management
  const handleSelectTrip = (tripId: string) => {
    const updated = {
      ...tripsData,
      activeTripId: tripId,
    };
    saveStoredTripsData(updated);
    onTripsDataChange(updated);
    setTripEditMode(null);
  };

  const startCreateTrip = () => {
    setTripInputName(`Viaje ${tripsData.trips.length + 1}`);
    setTripEditMode('create');
  };

  const startRenameTrip = () => {
    setTripInputName(activeTrip.name);
    setTripEditMode('rename');
  };

  const handleSaveTripForm = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = tripInputName.trim();
    if (!cleanName) return;

    if (tripEditMode === 'create') {
      const newTrip: Trip = {
        id: `trip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: cleanName,
        includedStores: null,
        customOrder: null,
      };
      const updated = {
        activeTripId: newTrip.id,
        trips: [...tripsData.trips, newTrip],
      };
      saveStoredTripsData(updated);
      onTripsDataChange(updated);
    } else if (tripEditMode === 'rename') {
      const updatedTrips = tripsData.trips.map((t) =>
        t.id === activeTrip.id ? { ...t, name: cleanName } : t
      );
      const updated = {
        ...tripsData,
        trips: updatedTrips,
      };
      saveStoredTripsData(updated);
      onTripsDataChange(updated);
    }

    setTripEditMode(null);
    setTripInputName('');
  };

  const handleDeleteTrip = () => {
    if (tripsData.trips.length <= 1) return;

    const updatedTrips = tripsData.trips.filter((t) => t.id !== activeTrip.id);
    const updated = {
      activeTripId: updatedTrips[0].id,
      trips: updatedTrips,
    };

    saveStoredTripsData(updated);
    onTripsDataChange(updated);
  };

  // Select / Deselect All Stops for current trip
  const handleSelectAllStops = () => {
    const allStoreNames = routeResult.allStops.map((s) => s.storeName);
    const updatedTrips = tripsData.trips.map((t) =>
      t.id === activeTrip.id ? { ...t, includedStores: allStoreNames } : t
    );
    const updated = { ...tripsData, trips: updatedTrips };
    saveStoredTripsData(updated);
    onTripsDataChange(updated);
  };

  const handleDeselectAllStops = () => {
    const updatedTrips = tripsData.trips.map((t) =>
      t.id === activeTrip.id ? { ...t, includedStores: [] } : t
    );
    const updated = { ...tripsData, trips: updatedTrips };
    saveStoredTripsData(updated);
    onTripsDataChange(updated);
  };

  const handleToggleStopInclusion = (storeName: string) => {
    const currentIncluded = activeTrip.includedStores
      ? new Set(activeTrip.includedStores)
      : new Set(routeResult.allStops.map((s) => s.storeName));

    if (currentIncluded.has(storeName)) {
      currentIncluded.delete(storeName);
    } else {
      currentIncluded.add(storeName);
    }

    const updatedTrips = tripsData.trips.map((t) =>
      t.id === activeTrip.id ? { ...t, includedStores: Array.from(currentIncluded) } : t
    );
    const updated = { ...tripsData, trips: updatedTrips };
    saveStoredTripsData(updated);
    onTripsDataChange(updated);
  };

  // Save custom stop order helper
  const applyNewStopOrder = (nextOrder: string[]) => {
    setCustomStopOrder(nextOrder);
    const updatedTrips = tripsData.trips.map((t) =>
      t.id === activeTrip.id ? { ...t, customOrder: nextOrder } : t
    );
    const updated = { ...tripsData, trips: updatedTrips };
    saveStoredTripsData(updated);
    onTripsDataChange(updated);
  };

  // Reorder stops via Up / Down buttons
  const handleMoveStop = (index: number, direction: 'up' | 'down') => {
    const stops = [...routeResult.orderedStops];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= stops.length) return;

    const temp = stops[index];
    stops[index] = stops[targetIndex];
    stops[targetIndex] = temp;

    applyNewStopOrder(stops.map((s) => s.storeName));
  };

  // Drag & Drop handlers for itinerary stops
  const handleStopDragStart = (e: React.DragEvent, storeName: string) => {
    setDraggedStopName(storeName);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', storeName);
  };

  const handleStopDragOver = (e: React.DragEvent, storeName: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedStopName && draggedStopName !== storeName) {
      setDragOverStopName(storeName);
    }
  };

  const handleStopDrop = (e: React.DragEvent, targetStoreName: string) => {
    e.preventDefault();
    const sourceStoreName = draggedStopName || e.dataTransfer.getData('text/plain');
    setDraggedStopName(null);
    setDragOverStopName(null);

    if (!sourceStoreName || sourceStoreName === targetStoreName) return;

    const currentOrderedNames = routeResult.orderedStops.map((s) => s.storeName);
    const fromIdx = currentOrderedNames.indexOf(sourceStoreName);
    const toIdx = currentOrderedNames.indexOf(targetStoreName);
    if (fromIdx === -1 || toIdx === -1) return;

    const nextOrder = [...currentOrderedNames];
    const [moved] = nextOrder.splice(fromIdx, 1);
    nextOrder.splice(toIdx, 0, moved);

    applyNewStopOrder(nextOrder);
  };

  const handleStopDragEnd = () => {
    setDraggedStopName(null);
    setDragOverStopName(null);
  };

  // Optimize (TSP Nearest Neighbor)
  const handleOptimizeRoute = () => {
    setCustomStopOrder(null);
    const updatedTrips = tripsData.trips.map((t) =>
      t.id === activeTrip.id ? { ...t, customOrder: null } : t
    );
    const updated = { ...tripsData, trips: updatedTrips };
    saveStoredTripsData(updated);
    onTripsDataChange(updated);
  };

  const toggleStopProductList = (storeName: string) => {
    setCollapsedStopItems((prev) => ({
      ...prev,
      [storeName]: !prev[storeName],
    }));
  };

  const areAllStopsCollapsed = useMemo(() => {
    if (displayedStops.length === 0) return false;
    return displayedStops.every((s) => Boolean(collapsedStopItems[s.storeName]));
  }, [displayedStops, collapsedStopItems]);

  const handleToggleAllStopProducts = () => {
    if (areAllStopsCollapsed) {
      setCollapsedStopItems({});
    } else {
      const next: Record<string, boolean> = {};
      displayedStops.forEach((s) => {
        next[s.storeName] = true;
      });
      setCollapsedStopItems(next);
    }
  };

  // Floating map controls
  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();
  const handleFitBounds = () => {
    if (!mapRef.current) return;
    mapRef.current.invalidateSize({ animate: false });
    const bounds = L.latLngBounds([L.latLng(origin.lat, origin.lng)]);
    displayedStops.forEach((s) => bounds.extend(L.latLng(s.lat, s.lng)));
    if (osrmRoute && osrmRoute.coordinates.length > 1) {
      osrmRoute.coordinates.forEach(([lat, lng]) => bounds.extend([lat, lng]));
    }
    if (displayedStops.length > 0) {
      mapRef.current.fitBounds(bounds, { padding: [54, 54], maxZoom: 16 });
    } else {
      mapRef.current.setView([origin.lat, origin.lng], 14);
    }
  };

  const displayedTotalDistanceKm = osrmRoute
    ? osrmRoute.totalDistanceKm
    : routeResult.totalUrbanDistanceKm;

  const displayedTotalMinutes = osrmRoute
    ? osrmRoute.totalDurationMinutes
    : routeResult.estimatedDurationMinutes;

  return (
    <section
      id="panel-map"
      className="view-panel panel-map-layout active"
      role="tabpanel"
      aria-labelledby="tab-map"
      tabIndex={0}
    >
      {/* Barra Lateral: Origen, Métricas, Google Maps e Itinerario */}
      <aside className="map-sidebar">
        <div className="map-controls-card">
          <div className="origin-input-row">
            <label htmlFor="manual-origin-input" className="stat-label">
              Punto de Partida
            </label>
            <div className="origin-inputs-container">
              <div className="input-wrapper origin-input-wrapper">
                <MapPin className="input-icon" size={18} aria-hidden="true" />
                <input
                  type="text"
                  id="manual-origin-input"
                  placeholder="Ej: Plaza 25 de Mayo, Corrientes..."
                  aria-label="Punto de partida manual"
                  autoComplete="off"
                  value={manualOriginText}
                  onChange={(e) => setManualOriginText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSetManualOrigin();
                  }}
                />
              </div>
              <button
                id="btn-set-manual-origin"
                className="btn btn-secondary"
                type="button"
                aria-label="Fijar origen manual"
                onClick={handleSetManualOrigin}
              >
                <Check size={16} aria-hidden="true" />
                <span>Fijar origen</span>
              </button>
              <button
                id="btn-gps-origin"
                className="btn btn-secondary"
                type="button"
                aria-label="Usar mi ubicación GPS"
                title="Usar mi ubicación GPS actual"
                onClick={handleGpsOrigin}
              >
                <Crosshair size={16} aria-hidden="true" />
                <span>GPS</span>
              </button>
            </div>
            {originStatusMsg && (
              <p className="origin-status-hint" role="status">
                {originStatusMsg}
              </p>
            )}
          </div>

          {/* Tarjeta resumen de ruta */}
          <div id="route-summary-card" className="route-summary-card">
            <div className="route-metric-item">
              <Milestone className="metric-icon" size={20} aria-hidden="true" />
              <div>
                <span className="metric-label">
                  {osrmRoute ? 'Distancia en ruta' : 'Distancia estimada'}
                </span>
                <strong id="route-distance" className="metric-value tabular-nums">
                  {displayedTotalDistanceKm.toFixed(1)} km
                </strong>
              </div>
            </div>
            <div className="route-metric-divider" aria-hidden="true" />
            <div className="route-metric-item">
              <Clock className="metric-icon" size={20} aria-hidden="true" />
              <div>
                <span className="metric-label">Tiempo en vehículo</span>
                <strong id="route-duration" className="metric-value tabular-nums">
                  {displayedTotalMinutes} min
                </strong>
              </div>
            </div>
            <div className="route-metric-divider" aria-hidden="true" />
            <div className="route-metric-item">
              <Store className="metric-icon" size={20} aria-hidden="true" />
              <div>
                <span className="metric-label">Paradas activas</span>
                <strong id="route-stops" className="metric-value tabular-nums">
                  {routeResult.orderedStops.length}{' '}
                  {routeResult.orderedStops.length === 1 ? 'parada' : 'paradas'}
                </strong>
              </div>
            </div>
          </div>

          {/* Indicador de modo de trazado vial */}
          {routeResult.orderedStops.length > 0 && (
            <div className="route-mode-status">
              <Route size={14} aria-hidden="true" />
              <span>
                {isLoadingOsrm
                  ? 'Calculando trazado por calles reales (OSRM)...'
                  : osrmRoute
                  ? 'Trazado vial activo siguiendo calles reales de Corrientes (OSRM)'
                  : 'Trazado geométrico urbano activo (modo sin conexión)'}
              </span>
            </div>
          )}

          {/* Botón de Google Maps */}
          <a
            id="btn-open-google-maps"
            href={routeResult.googleMapsUrl || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className={`btn btn-primary btn-block btn-open-gmaps ${
              !routeResult.googleMapsUrl ? 'disabled' : ''
            }`}
            aria-label="Abrir ruta en Google Maps"
            style={{ pointerEvents: routeResult.googleMapsUrl ? 'auto' : 'none' }}
          >
            <Navigation size={18} aria-hidden="true" />
            <span>Abrir navegación en Google Maps</span>
          </a>
        </div>

        {/* Gestor de Viajes de Compra */}
        <div className="trips-card">
          <div className="trips-header">
            <div className="trips-title">
              <Compass size={18} aria-hidden="true" />
              <h3>Mis Viajes</h3>
            </div>
            <button
              type="button"
              id="btn-new-trip"
              className="btn btn-sm btn-primary-outline"
              title="Crear nuevo viaje de compra"
              aria-label="Crear nuevo viaje"
              onClick={startCreateTrip}
            >
              <Plus size={16} aria-hidden="true" />
              <span>Nuevo</span>
            </button>
          </div>

          {tripEditMode ? (
            <form className="trip-inline-form" onSubmit={handleSaveTripForm}>
              <input
                type="text"
                className="trip-inline-input"
                placeholder="Nombre del viaje..."
                value={tripInputName}
                onChange={(e) => setTripInputName(e.target.value)}
                autoFocus
              />
              <button type="submit" className="btn-save-edit" title="Guardar">
                <Check size={16} />
              </button>
              <button
                type="button"
                className="btn-cancel-edit"
                title="Cancelar"
                onClick={() => setTripEditMode(null)}
              >
                <X size={16} />
              </button>
            </form>
          ) : (
            <div className="trip-selector-row">
              <div className="trip-select-wrapper">
                <select
                  id="trip-select"
                  className="trip-select"
                  aria-label="Seleccionar viaje de compra activo"
                  value={activeTrip.id}
                  onChange={(e) => handleSelectTrip(e.target.value)}
                >
                  {tripsData.trips.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="trip-actions-btn-group">
                <button
                  type="button"
                  id="btn-rename-trip"
                  className="btn-trip-action"
                  title="Renombrar este viaje"
                  aria-label="Renombrar viaje"
                  onClick={startRenameTrip}
                >
                  <Edit2 size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  id="btn-delete-trip"
                  className="btn-trip-action btn-trip-delete"
                  title="Eliminar este viaje"
                  aria-label="Eliminar viaje"
                  disabled={tripsData.trips.length <= 1}
                  onClick={handleDeleteTrip}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          <div className="trip-meta-info">
            <span id="trip-included-count" className="trip-meta-badge">
              {routeResult.orderedStops.length} comercios activos en este recorrido
            </span>
            <div className="trip-meta-quick-actions">
              <button
                type="button"
                id="btn-select-all-trip-stops"
                className="btn-link-action"
                title="Incluir todos los comercios en este viaje"
                onClick={handleSelectAllStops}
              >
                Todos
              </button>
              <span className="meta-dot" aria-hidden="true">
                ·
              </span>
              <button
                type="button"
                id="btn-deselect-all-trip-stops"
                className="btn-link-action"
                title="Excluir todos los comercios"
                onClick={handleDeselectAllStops}
              >
                Ninguno
              </button>
            </div>
          </div>
        </div>

        {/* Itinerario de Paradas Reordenables con Desglose de Productos */}
        <div className="route-stops-card">
          <div className="route-stops-header">
            <div
              className="route-stops-title"
              role="button"
              tabIndex={0}
              aria-expanded={!isItineraryCollapsed}
              onClick={() => setIsItineraryCollapsed((prev) => !prev)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsItineraryCollapsed((prev) => !prev);
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              {isItineraryCollapsed ? (
                <ChevronRight size={18} aria-hidden="true" />
              ) : (
                <ChevronDown size={18} aria-hidden="true" />
              )}
              <ListOrdered size={18} aria-hidden="true" />
              <h3>Itinerario y Productos ({displayedStops.length})</h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {displayedStops.length > 0 && !isItineraryCollapsed && (
                <button
                  type="button"
                  className="btn-reset-order"
                  title={
                    areAllStopsCollapsed
                      ? 'Expandir productos de todas las paradas'
                      : 'Contraer productos de todas las paradas'
                  }
                  onClick={handleToggleAllStopProducts}
                >
                  {areAllStopsCollapsed ? (
                    <>
                      <ChevronsUpDown size={14} aria-hidden="true" />
                      <span>Expandir paradas</span>
                    </>
                  ) : (
                    <>
                      <ChevronsDownUp size={14} aria-hidden="true" />
                      <span>Contraer paradas</span>
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                id="btn-reset-route-order"
                className="btn-reset-order"
                title="Re-optimizar orden automático por cercanía (TSP)"
                onClick={handleOptimizeRoute}
              >
                <Sparkles size={15} aria-hidden="true" />
                <span>Optimizar</span>
              </button>
            </div>
          </div>

          {!isItineraryCollapsed && (
            <>
              <p className="route-stops-help">
                Arrastra las paradas para reordenar o haz clic en cada parada para encoger sus productos:
              </p>

              <div
                id="route-stops-list"
                className="route-stops-list"
                role="list"
                aria-label="Lista de paradas del recorrido de compra"
              >
            {displayedStops.length === 0 ? (
              <p className="empty-stops-text">
                Aún no hay comercios cargados en tu lista de compras.
              </p>
            ) : (
              displayedStops.map((stop) => {
                const orderedIndex = routeResult.orderedStops.findIndex(
                  (s) => s.storeName === stop.storeName
                );
                const isIncluded = Boolean(stop.isIncluded && orderedIndex !== -1);
                const isZeroPending = stop.pendingItems.length === 0;
                const isDragging = draggedStopName === stop.storeName;
                const isDragOver = dragOverStopName === stop.storeName;
                const areItemsCollapsed = Boolean(collapsedStopItems[stop.storeName]);
                const allStopItems = [...stop.pendingItems, ...(stop.completedItems || [])];

                // Use OSRM leg metrics when available, otherwise fallback to urban distance
                const osrmLeg =
                  isIncluded && osrmRoute && osrmRoute.legs && osrmRoute.legs[orderedIndex]
                    ? osrmRoute.legs[orderedIndex]
                    : null;

                const legDistanceKm = osrmLeg
                  ? osrmLeg.distanceKm
                  : stop.stepUrbanDistanceKm;

                const legMinutes = osrmLeg ? osrmLeg.durationMinutes : stop.stepMinutes;

                return (
                  <div
                    key={stop.storeName}
                    role="listitem"
                    className={`route-stop-card ${!isIncluded ? 'excluded' : ''} ${
                      isZeroPending ? 'zero-pending' : ''
                    } ${isDragging ? 'sortable-ghost' : ''} ${
                      isDragOver ? 'drag-over-card' : ''
                    }`}
                    draggable={isIncluded}
                    onDragStart={(e) => isIncluded && handleStopDragStart(e, stop.storeName)}
                    onDragOver={(e) => isIncluded && handleStopDragOver(e, stop.storeName)}
                    onDrop={(e) => isIncluded && handleStopDrop(e, stop.storeName)}
                    onDragEnd={handleStopDragEnd}
                  >
                    <div className="route-stop-item">
                      {isIncluded && (
                        <span
                          className="stop-drag-handle"
                          title="Arrastrar para cambiar orden de parada"
                        >
                          <GripVertical size={16} aria-hidden="true" />
                        </span>
                      )}

                      <label
                        className="stop-checkbox-wrap"
                        title={isIncluded ? 'Quitar parada del viaje' : 'Incluir parada en el viaje'}
                      >
                        <input
                          type="checkbox"
                          checked={isIncluded}
                          onChange={() => handleToggleStopInclusion(stop.storeName)}
                        />
                      </label>

                      <div className="stop-badge-idx tabular-nums">
                        {isIncluded ? orderedIndex + 1 : '—'}
                      </div>

                      <div
                        className="stop-info-body"
                        role="button"
                        tabIndex={0}
                        aria-expanded={!areItemsCollapsed}
                        onClick={() => toggleStopProductList(stop.storeName)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleStopProductList(stop.storeName);
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="stop-name-row">
                          <strong className="stop-store-name">{stop.storeName}</strong>
                          <span className="stop-items-count tabular-nums">
                            {isZeroPending
                              ? `0 pendientes · ${stop.completedItems?.length || 0} comprados`
                              : `${stop.pendingItems.length} ${
                                  stop.pendingItems.length === 1 ? 'pend.' : 'pends.'
                                } · $${stop.estimatedTotal.toFixed(2)}`}
                          </span>
                        </div>
                        <span className="stop-address-text" title={stop.address}>
                          {stop.address}
                        </span>
                        {isIncluded && legDistanceKm !== undefined && (
                          <div className="stop-leg-meta tabular-nums">
                            <span>
                              Tramo #{orderedIndex + 1}: +{legDistanceKm.toFixed(2)} km · ~
                              {legMinutes} min
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="stop-actions">
                        <button
                          type="button"
                          className="btn-stop-edit"
                          title="Cambiar dirección o fijar en el mapa"
                          aria-label={`Ubicación de ${stop.storeName}`}
                          onClick={() => onEditStoreLocation(stop.storeName)}
                        >
                          <MapPin size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn-stop-edit"
                          title={
                            areItemsCollapsed
                              ? 'Mostrar productos de esta parada'
                              : 'Ocultar productos de esta parada'
                          }
                          aria-expanded={!areItemsCollapsed}
                          onClick={() => toggleStopProductList(stop.storeName)}
                        >
                          {areItemsCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                        </button>
                        {isIncluded && (
                          <div className="stop-arrows-col">
                            <button
                              type="button"
                              className="btn-order-arrow"
                              title="Subir parada"
                              disabled={orderedIndex === 0}
                              onClick={() => handleMoveStop(orderedIndex, 'up')}
                            >
                              <ChevronUp size={13} />
                            </button>
                            <button
                              type="button"
                              className="btn-order-arrow"
                              title="Bajar parada"
                              disabled={orderedIndex === routeResult.orderedStops.length - 1}
                              onClick={() => handleMoveStop(orderedIndex, 'down')}
                            >
                              <ChevronDown size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Lista de productos dentro de cada parada (pendientes y comprados) */}
                    {!areItemsCollapsed && allStopItems.length > 0 && (
                      <div className="stop-inline-items">
                        {allStopItems.map((item, idx) => {
                          const lineTotal = (item.quantity || 1) * (item.unitPrice || 0);
                          const sku = item.skuCode || formatSkuCode(item.seqNumber || idx + 1);
                          return (
                            <label
                              key={item.id}
                              className={`stop-inline-item-row ${
                                item.completed ? 'completed-inline-item' : ''
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={item.completed}
                                onChange={() => onToggleCompleted && onToggleCompleted(item.id)}
                              />
                              <span className="item-sku-code tabular-nums">{sku}</span>
                              <span className="stop-inline-item-name">{item.name}</span>
                              <span className="stop-inline-item-meta tabular-nums">
                                {item.quantity} un.
                                {lineTotal > 0 ? ` · $${lineTotal.toFixed(2)}` : ''}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Área Principal: Mapa Interactivo Leaflet Panorámico */}
      <div className="map-main-wrapper">
        {/* Banner Flotante para Selección Directa en el Mapa */}
        {pickerStore && (
          <div id="map-picker-banner" className="map-picker-banner">
            <div className="map-picker-content">
              <MapPin className="picker-pin-icon" size={20} aria-hidden="true" />
              <span>
                Haz clic en el punto exacto del mapa para ubicar <strong>{pickerStore}</strong>
              </span>
            </div>
            <button
              type="button"
              id="btn-cancel-map-picker"
              className="btn btn-sm btn-secondary"
              aria-label="Cancelar selección en mapa"
              onClick={onCancelPicker}
            >
              Cancelar
            </button>
          </div>
        )}

        <div
          id="map-container"
          ref={mapContainerRef}
          className="map-view-container"
          role="region"
          aria-label="Mapa interactivo con la ruta de compras"
        >
          {/* Controles Flotantes de Zoom y Ajuste */}
          <div
            className="map-floating-controls"
            role="toolbar"
            aria-label="Controles de navegación en mapa"
          >
            <button
              type="button"
              id="btn-map-zoom-in"
              className="map-floating-btn"
              aria-label="Acercar mapa"
              title="Acercar (+)"
              onClick={handleZoomIn}
            >
              <Plus size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              id="btn-map-zoom-out"
              className="map-floating-btn"
              aria-label="Alejar mapa"
              title="Alejar (-)"
              onClick={handleZoomOut}
            >
              <Minus size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              id="btn-map-fit-bounds"
              className="map-floating-btn"
              aria-label="Centrar y encuadrar toda la ruta"
              title="Encuadrar toda la ruta"
              onClick={handleFitBounds}
            >
              <Maximize2 size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
