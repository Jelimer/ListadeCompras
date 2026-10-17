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
} from 'lucide-react';
import { ShoppingItem, RouteOrigin, RouteStop, Trip, TripsData } from '../types';
import {
  calculateOptimalRoute,
  getCurrentGpsLocation,
  geocodeAddress,
} from '../utils/mapRoute';
import {
  saveStoredOrigin,
  saveStoredTripsData,
  saveStoreCoordinate,
  removeStoreCoordinate,
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
}) => {
  const [manualOriginText, setManualOriginText] = useState(origin.address || '');
  const [customStopOrder, setCustomStopOrder] = useState<string[] | null>(null);

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

  // Calculate Route
  const routeResult = useMemo(() => {
    return calculateOptimalRoute(items, origin, {
      includedStores: activeTrip.includedStores,
      customStopOrder,
    });
  }, [items, origin, activeTrip.includedStores, customStopOrder]);

  // Leaflet map instance ref
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [origin.lat, origin.lng],
        zoom: 13,
        zoomControl: false,
      });

      mapRef.current = map;
      markersLayerRef.current = L.layerGroup().addTo(map);

      // Handle map click for picker mode
      map.on('click', (e: L.LeafletMouseEvent) => {
        if (pickerStore) {
          onCoordPicked(pickerStore, e.latlng.lat, e.latlng.lng);
        }
      });
    }

    return () => {
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

  // Update Tile Layer according to theme
  useEffect(() => {
    if (!mapRef.current) return;

    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
    }

    const tileUrl =
      theme === 'dark'
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

    const attribution =
      theme === 'dark'
        ? '&copy; <a href="https://carto.com/">CARTO</a>'
        : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

    tileLayerRef.current = L.tileLayer(tileUrl, {
      attribution,
      maxZoom: 19,
    }).addTo(mapRef.current);
  }, [theme]);

  // Update Markers & Route Polyline
  useEffect(() => {
    if (!mapRef.current || !markersLayerRef.current) return;

    markersLayerRef.current.clearLayers();

    if (routeLayerRef.current) {
      routeLayerRef.current.remove();
      routeLayerRef.current = null;
    }

    const bounds = L.latLngBounds([L.latLng(origin.lat, origin.lng)]);

    // 1. Origin Marker
    const originIcon = L.divIcon({
      className: 'map-origin-marker',
      html: `<div style="background-color: #2563eb; color: white; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,0,0,0.3); border: 2px solid white; font-weight: bold; font-size: 13px;">🏠</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    const originMarker = L.marker([origin.lat, origin.lng], { icon: originIcon });
    originMarker.bindPopup(`<strong>Punto de Partida</strong><br>${origin.address || 'Origen'}`);
    markersLayerRef.current.addLayer(originMarker);

    // 2. Stops Markers & Polyline Points
    const polylineCoords: [number, number][] = [[origin.lat, origin.lng]];

    routeResult.orderedStops.forEach((stop, idx) => {
      const stopLatLng = L.latLng(stop.lat, stop.lng);
      bounds.extend(stopLatLng);
      polylineCoords.push([stop.lat, stop.lng]);

      const stopIcon = L.divIcon({
        className: 'map-stop-marker',
        html: `<div style="background-color: #4f46e5; color: white; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,0,0,0.3); border: 2px solid white; font-weight: bold; font-size: 13px;">${
          idx + 1
        }</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const itemsListHtml = stop.pendingItems
        .map((it) => `• ${it.quantity}x ${it.name}`)
        .join('<br>');

      const marker = L.marker([stop.lat, stop.lng], { icon: stopIcon });
      marker.bindPopup(`
        <div style="min-width: 140px;">
          <strong style="color: #4f46e5; font-size: 14px;">${idx + 1}. ${stop.storeName}</strong>
          <p style="margin: 4px 0; font-size: 12px; color: #64748b;">${stop.address}</p>
          <div style="margin-top: 6px; font-size: 12px; max-height: 100px; overflow-y: auto;">
            ${itemsListHtml}
          </div>
          <div style="margin-top: 6px; font-weight: bold; font-size: 12px;">
            Total: $${stop.estimatedTotal.toFixed(2)} (${stop.itemCount} un.)
          </div>
        </div>
      `);

      markersLayerRef.current?.addLayer(marker);
    });

    // 3. Draw Polyline
    if (polylineCoords.length > 1) {
      routeLayerRef.current = L.polyline(polylineCoords, {
        color: '#4f46e5',
        weight: 4,
        opacity: 0.8,
        dashArray: '8, 8',
      }).addTo(mapRef.current);
    }

    // Fit map bounds
    if (polylineCoords.length > 1) {
      mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    } else {
      mapRef.current.setView([origin.lat, origin.lng], 13);
    }
  }, [routeResult, origin]);

  // Set Manual Origin
  const handleSetManualOrigin = async () => {
    if (!manualOriginText.trim()) return;
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
    } else {
      alert('No se pudo geocodificar la dirección ingresada.');
    }
  };

  // Set GPS Origin
  const handleGpsOrigin = async () => {
    const gps = await getCurrentGpsLocation();
    setManualOriginText(gps.address || 'Mi Ubicación actual (GPS)');
    onOriginChange(gps);
  };

  // Trips Management
  const handleSelectTrip = (tripId: string) => {
    const updated = {
      ...tripsData,
      activeTripId: tripId,
    };
    saveStoredTripsData(updated);
    onTripsDataChange(updated);
  };

  const handleNewTrip = () => {
    const name = window.prompt('Nombre del nuevo viaje:', `Viaje ${tripsData.trips.length + 1}`);
    if (!name || !name.trim()) return;

    const newTrip: Trip = {
      id: `trip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim(),
      includedStores: null,
      customOrder: null,
    };

    const updated = {
      activeTripId: newTrip.id,
      trips: [...tripsData.trips, newTrip],
    };

    saveStoredTripsData(updated);
    onTripsDataChange(updated);
  };

  const handleRenameTrip = () => {
    const nextName = window.prompt('Renombrar viaje:', activeTrip.name);
    if (!nextName || !nextName.trim()) return;

    const updatedTrips = tripsData.trips.map((t) =>
      t.id === activeTrip.id ? { ...t, name: nextName.trim() } : t
    );

    const updated = {
      ...tripsData,
      trips: updatedTrips,
    };

    saveStoredTripsData(updated);
    onTripsDataChange(updated);
  };

  const handleDeleteTrip = () => {
    if (tripsData.trips.length <= 1) {
      alert('No puedes eliminar el único viaje.');
      return;
    }
    if (!confirm(`¿Eliminar "${activeTrip.name}"?`)) return;

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

  // Reorder stops manually
  const handleMoveStop = (index: number, direction: 'up' | 'down') => {
    const stops = [...routeResult.orderedStops];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= stops.length) return;

    const temp = stops[index];
    stops[index] = stops[targetIndex];
    stops[targetIndex] = temp;

    const nextOrder = stops.map((s) => s.storeName);
    setCustomStopOrder(nextOrder);

    const updatedTrips = tripsData.trips.map((t) =>
      t.id === activeTrip.id ? { ...t, customOrder: nextOrder } : t
    );
    const updated = { ...tripsData, trips: updatedTrips };
    saveStoredTripsData(updated);
    onTripsDataChange(updated);
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

  // Floating map controls
  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();
  const handleFitBounds = () => {
    if (!mapRef.current) return;
    const bounds = L.latLngBounds([L.latLng(origin.lat, origin.lng)]);
    routeResult.orderedStops.forEach((s) => bounds.extend(L.latLng(s.lat, s.lng)));
    mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  };

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
                  placeholder="Escribe tu punto de salida..."
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
                <span>Usar mi ubicación GPS</span>
              </button>
            </div>
          </div>

          {/* Tarjeta resumen de ruta */}
          <div id="route-summary-card" className="route-summary-card">
            <div className="route-metric-item">
              <Milestone className="metric-icon" size={20} aria-hidden="true" />
              <div>
                <span className="metric-label">Distancia estimada</span>
                <strong id="route-distance" className="metric-value">
                  {routeResult.totalUrbanDistanceKm.toFixed(1)} km
                </strong>
              </div>
            </div>
            <div className="route-metric-divider" aria-hidden="true" />
            <div className="route-metric-item">
              <Clock className="metric-icon" size={20} aria-hidden="true" />
              <div>
                <span className="metric-label">Tiempo estimado</span>
                <strong id="route-duration" className="metric-value">
                  {routeResult.estimatedDurationMinutes} min
                </strong>
              </div>
            </div>
            <div className="route-metric-divider" aria-hidden="true" />
            <div className="route-metric-item">
              <Store className="metric-icon" size={20} aria-hidden="true" />
              <div>
                <span className="metric-label">Paradas de compra</span>
                <strong id="route-stops" className="metric-value">
                  {routeResult.orderedStops.length} {routeResult.orderedStops.length === 1 ? 'parada' : 'paradas'}
                </strong>
              </div>
            </div>
          </div>

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
            <span>Abrir ruta en Google Maps</span>
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
              onClick={handleNewTrip}
            >
              <Plus size={16} aria-hidden="true" />
              <span>Nuevo</span>
            </button>
          </div>

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
                onClick={handleRenameTrip}
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

          <div className="trip-meta-info">
            <span id="trip-included-count" className="trip-meta-badge">
              {routeResult.orderedStops.length} lugares en este viaje
            </span>
            <div className="trip-meta-quick-actions">
              <button
                type="button"
                id="btn-select-all-trip-stops"
                className="btn-link-action"
                title="Tildar todos los lugares en este viaje"
                onClick={handleSelectAllStops}
              >
                Todos
              </button>
              <span className="meta-dot" aria-hidden="true">
                •
              </span>
              <button
                type="button"
                id="btn-deselect-all-trip-stops"
                className="btn-link-action"
                title="Destildar todos los lugares"
                onClick={handleDeselectAllStops}
              >
                Ninguno
              </button>
            </div>
          </div>
        </div>

        {/* Itinerario de Paradas Reordenables */}
        <div className="route-stops-card">
          <div className="route-stops-header">
            <div className="route-stops-title">
              <ListOrdered size={18} aria-hidden="true" />
              <h3>Itinerario de Paradas</h3>
            </div>
            <button
              type="button"
              id="btn-reset-route-order"
              className="btn-reset-order"
              title="Re-optimizar orden automático por cercanía (TSP)"
              onClick={handleOptimizeRoute}
            >
              <Sparkles size={16} aria-hidden="true" />
              <span>Optimizar</span>
            </button>
          </div>
          <p className="route-stops-help">
            Tilda los lugares a visitar y usa las flechas para personalizar el orden:
          </p>

          <div
            id="route-stops-list"
            className="route-stops-list"
            role="list"
            aria-label="Lista de paradas del recorrido de compra"
          >
            {routeResult.allStops.length === 0 ? (
              <p className="empty-stops-text">No hay lugares con productos pendientes.</p>
            ) : (
              routeResult.allStops.map((stop) => {
                const orderedIndex = routeResult.orderedStops.findIndex(
                  (s) => s.storeName === stop.storeName
                );
                const isIncluded = stop.isIncluded;

                return (
                  <div
                    key={stop.storeName}
                    className={`route-stop-item ${!isIncluded ? 'excluded' : ''}`}
                  >
                    <label className="stop-checkbox-wrap">
                      <input
                        type="checkbox"
                        checked={isIncluded}
                        onChange={() => handleToggleStopInclusion(stop.storeName)}
                      />
                    </label>

                    <div className="stop-badge-idx">
                      {orderedIndex !== -1 ? orderedIndex + 1 : '-'}
                    </div>

                    <div className="stop-info-body">
                      <div className="stop-name-row">
                        <strong className="stop-store-name">{stop.storeName}</strong>
                        <span className="stop-items-count">
                          {stop.pendingItems.length} {stop.pendingItems.length === 1 ? 'artículo' : 'artículos'} ($
                          {stop.estimatedTotal.toFixed(2)})
                        </span>
                      </div>
                      <span className="stop-address-text">{stop.address}</span>
                      {orderedIndex !== -1 && routeResult.orderedStops[orderedIndex]?.stepDistanceKm !== undefined && (
                        <div className="stop-leg-meta">
                          <span>
                            +{routeResult.orderedStops[orderedIndex].stepUrbanDistanceKm} km (~
                            {routeResult.orderedStops[orderedIndex].stepMinutes} min)
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="stop-actions">
                      <button
                        type="button"
                        className="btn-stop-edit"
                        title="Modificar ubicación exacta de la tienda"
                        onClick={() => onEditStoreLocation(stop.storeName)}
                      >
                        <MapPin size={16} />
                      </button>
                      {orderedIndex !== -1 && (
                        <div className="stop-arrows-col">
                          <button
                            type="button"
                            className="btn-order-arrow"
                            title="Subir parada"
                            disabled={orderedIndex === 0}
                            onClick={() => handleMoveStop(orderedIndex, 'up')}
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn-order-arrow"
                            title="Bajar parada"
                            disabled={orderedIndex === routeResult.orderedStops.length - 1}
                            onClick={() => handleMoveStop(orderedIndex, 'down')}
                          >
                            <ChevronDown size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </aside>

      {/* Área Principal: Mapa Interactivo Leaflet */}
      <div className="map-main-wrapper">
        {/* Banner Flotante para Selección Directa en el Mapa */}
        {pickerStore && (
          <div id="map-picker-banner" className="map-picker-banner">
            <div className="map-picker-content">
              <MapPin className="picker-pin-icon" size={20} aria-hidden="true" />
              <span>
                Haz clic en el mapa para ubicar <strong>{pickerStore}</strong>
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
          <div className="map-floating-controls" role="toolbar" aria-label="Controles de navegación en mapa">
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
              title="Centrar ruta completa"
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
