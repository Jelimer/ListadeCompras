import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin,
  Navigation,
  Calendar,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  Route,
  X,
  Compass,
  Store,
} from 'lucide-react';
import { ShoppingItem, RouteOrigin } from '../types';
import { calculateOptimalRoute, fetchOSRMRoute, OSRMRouteData } from '../utils/mapRoute';
import { formatSkuCode, loadStoredOrigin } from '../utils/storage';
import { formatMoney, formatNumber } from '../utils/formatters';

export function getTodayFullDate(): string {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear();
  return `${d}/${m}/${y}`;
}

export function getTodayDayMonth(): string {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}`;
}

export function isItemScheduledForToday(item: ShoppingItem): boolean {
  const raw = (item.plannedDate || '').trim();
  if (!raw) return false;
  const upper = raw.toUpperCase();
  const todayDM = getTodayDayMonth();
  const todayFull = getTodayFullDate();
  return (
    upper === 'HOY' ||
    raw === todayDM ||
    raw === todayFull ||
    raw.startsWith(`${todayDM}/`)
  );
}

export function formatShortDayMonth(dateStr?: string): string {
  if (!dateStr || !dateStr.trim()) return '';
  const clean = dateStr.trim();
  const todayDM = getTodayDayMonth();
  const todayFull = getTodayFullDate();
  if (
    clean.toUpperCase() === 'HOY' ||
    clean === todayDM ||
    clean === todayFull ||
    clean.startsWith(`${todayDM}/`)
  ) {
    return 'HOY';
  }
  const parts = clean.split('/');
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}`;
  }
  return clean;
}

interface TodayRouteSidePanelProps {
  todayItems: ShoppingItem[];
  origin?: RouteOrigin;
  coordsVersion?: number;
  onToggleCompleted: (id: string) => void;
  onClearTodayDate: (id: string) => void;
  onEditStoreLocation?: (storeName: string) => void;
}

export const TodayRouteSidePanel: React.FC<TodayRouteSidePanelProps> = ({
  todayItems,
  origin: propOrigin,
  coordsVersion = 0,
  onToggleCompleted,
  onClearTodayDate,
  onEditStoreLocation,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [osrmData, setOsrmData] = useState<OSRMRouteData | null>(null);
  const [focusedStopName, setFocusedStopName] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const activeOrigin = useMemo(() => propOrigin || loadStoredOrigin(), [propOrigin]);

  const routeResult = useMemo(() => {
    return calculateOptimalRoute(todayItems, activeOrigin);
  }, [todayItems, activeOrigin, coordsVersion]);

  // Fetch OSRM street geometry whenever today's route stops change
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    if (routeResult.orderedStops.length === 0) {
      setOsrmData(null);
      return;
    }

    fetchOSRMRoute(routeResult.origin, routeResult.orderedStops, controller.signal).then(
      (res) => {
        if (!cancelled) {
          setOsrmData(res);
        }
      }
    );

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [routeResult]);

  // Initialize & update Leaflet map
  useEffect(() => {
    if (isMinimized || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [activeOrigin.lat, activeOrigin.lng],
        zoom: 14,
        zoomControl: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      const lg = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
      layerGroupRef.current = lg;
    }

    const map = mapInstanceRef.current;
    const lg = layerGroupRef.current;
    if (!map || !lg) return;

    lg.clearLayers();

    const boundsPoints: [number, number][] = [[activeOrigin.lat, activeOrigin.lng]];

    // Origin marker
    const originIcon = L.divIcon({
      className: 'custom-leaflet-marker',
      html: `<div class="today-map-pin origin-pin" title="Punto de partida: ${activeOrigin.address}">P</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    L.marker([activeOrigin.lat, activeOrigin.lng], { icon: originIcon })
      .bindPopup(
        `<div class="map-popup-box"><strong>Punto de Partida</strong><div class="map-popup-addr">${activeOrigin.address}</div></div>`
      )
      .addTo(lg);

    // Store markers for TODAY
    routeResult.orderedStops.forEach((stop, index) => {
      const stepNum = stop.stepIndex || index + 1;
      boundsPoints.push([stop.lat, stop.lng]);

      const allItemsAtStop = [...(stop.pendingItems || []), ...(stop.completedItems || [])];
      const allCompleted = stop.pendingItems.length === 0 && allItemsAtStop.length > 0;

      const stopIcon = L.divIcon({
        className: 'custom-leaflet-marker',
        html: `<div class="today-map-pin ${allCompleted ? 'done-pin' : 'stop-pin'}">${stepNum}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const itemsHtml = allItemsAtStop
        .slice(0, 6)
        .map((it) => {
          const sku = it.skuCode || formatSkuCode(it.seqNumber || 1);
          return `<li><span class="tabular-nums">${sku}</span> ${it.name} (${formatNumber(
            it.quantity
          )} un.)</li>`;
        })
        .join('');

      L.marker([stop.lat, stop.lng], { icon: stopIcon })
        .bindTooltip(`${stepNum}. ${stop.storeName}`, {
          permanent: true,
          direction: 'top',
          offset: [0, -14],
          className: 'today-map-tooltip',
        })
        .bindPopup(
          `<div class="map-popup-box">
            <strong>${stepNum}. ${stop.storeName}</strong>
            <div class="map-popup-addr">${stop.address}</div>
            <ul class="map-popup-list">${itemsHtml}</ul>
            ${
              stop.estimatedTotal > 0
                ? `<div class="map-popup-footer tabular-nums">Subtotal HOY: ${formatMoney(
                    stop.estimatedTotal
                  )}</div>`
                : ''
            }
          </div>`
        )
        .addTo(lg);
    });

    // Draw route polyline
    if (osrmData && osrmData.coordinates.length > 1) {
      L.polyline(osrmData.coordinates, {
        color: '#1d4ed8',
        weight: 4,
        opacity: 0.85,
      }).addTo(lg);
    } else if (routeResult.orderedStops.length > 0) {
      const fallbackLatLngs: [number, number][] = [
        [activeOrigin.lat, activeOrigin.lng],
        ...routeResult.orderedStops.map((s) => [s.lat, s.lng] as [number, number]),
      ];
      L.polyline(fallbackLatLngs, {
        color: '#1d4ed8',
        weight: 3,
        dashArray: '6, 6',
        opacity: 0.8,
      }).addTo(lg);
    }

    setTimeout(() => {
      map.invalidateSize();
      if (focusedStopName) {
        const target = routeResult.orderedStops.find((s) => s.storeName === focusedStopName);
        if (target) {
          map.setView([target.lat, target.lng], 16, { animate: true });
          return;
        }
      }
      if (boundsPoints.length > 1) {
        map.fitBounds(L.latLngBounds(boundsPoints), { padding: [36, 36], maxZoom: 16 });
      } else {
        map.setView([activeOrigin.lat, activeOrigin.lng], 14);
      }
    }, 80);
  }, [activeOrigin, routeResult, osrmData, isMinimized, focusedStopName]);

  // Clean up map instance on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const handleFitRoute = () => {
    setFocusedStopName(null);
    const map = mapInstanceRef.current;
    if (!map) return;
    const pts: [number, number][] = [
      [activeOrigin.lat, activeOrigin.lng],
      ...routeResult.orderedStops.map((s) => [s.lat, s.lng] as [number, number]),
    ];
    if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 16 });
    } else {
      map.setView([activeOrigin.lat, activeOrigin.lng], 14);
    }
  };

  const totalTodayAmount = useMemo(() => {
    return todayItems.reduce((acc, it) => {
      if (it.completed) return acc;
      return acc + (Number(it.unitPrice) || 0) * (Number(it.quantity) || 1);
    }, 0);
  }, [todayItems]);

  const totalDistanceKm = osrmData
    ? osrmData.totalDistanceKm
    : routeResult.totalUrbanDistanceKm;
  const totalMinutes = osrmData
    ? osrmData.totalDurationMinutes
    : routeResult.estimatedDurationMinutes;

  const todayDM = getTodayDayMonth();

  if (isMinimized) {
    return (
      <aside className="today-side-panel-collapsed" aria-label="Panel de Ruta de HOY contraído">
        <button
          type="button"
          className="btn-expand-today-panel"
          onClick={() => setIsMinimized(false)}
          title="Desplegar mapa y lista de compras de HOY"
        >
          <ChevronLeft size={18} />
          <span className="today-collapsed-badge tabular-nums">
            {routeResult.orderedStops.length}
          </span>
          <span>RUTA DE HOY ({todayDM})</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="today-side-panel" aria-label="Mapa y lugares para comprar HOY">
      {/* Cabecera Ejecutiva del Panel de HOY */}
      <div className="today-panel-header">
        <div className="today-panel-title-row">
          <div className="today-panel-badge-pulse">
            <Calendar size={16} />
          </div>
          <div>
            <h3 className="today-panel-title">
              <span>Lugares a visitar hoy</span>
              <span className="today-panel-date-tag tabular-nums">HOY · {todayDM}</span>
            </h3>
            <p className="today-panel-subtitle">
              Ruta automática de locales con productos marcados para hoy
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn-collapse-today-panel"
          onClick={() => setIsMinimized(true)}
          title="Contraer panel lateral de HOY"
          aria-label="Contraer panel lateral de HOY"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Cinta de KPIs debajo de la cabecera oscura */}
      <div className="today-panel-kpis tabular-nums">
        <div className="today-kpi-item">
          <span className="today-kpi-label">Paradas HOY</span>
          <span className="today-kpi-val">
            {routeResult.orderedStops.length}{' '}
            {routeResult.orderedStops.length === 1 ? 'local' : 'locales'} ({todayItems.length} prod.)
          </span>
        </div>
        <div className="today-kpi-item">
          <span className="today-kpi-label">Recorrido Est.</span>
          <span className="today-kpi-val">
            {totalDistanceKm > 0
              ? `${formatNumber(totalDistanceKm, 1)} km (~${totalMinutes} min)`
              : 'Directo'}
          </span>
        </div>
        <div className="today-kpi-item">
          <span className="today-kpi-label">Presupuesto HOY</span>
          <span className="today-kpi-val today-kpi-money">
            {formatMoney(totalTodayAmount)}
          </span>
        </div>
      </div>

      {/* ARRIBA: Mapa Interactivo de los Lugares de HOY */}
      <div className="today-map-section">
        <div
          ref={mapContainerRef}
          className="today-map-box"
          aria-label="Mapa de lugares para ir hoy"
        />
        <div className="today-map-overlay-controls">
          <button
            type="button"
            className="btn-today-map-tool"
            onClick={handleFitRoute}
            title="Encuadrar todos los lugares de HOY"
          >
            <Compass size={13} />
            <span>Encuadrar</span>
          </button>
          {routeResult.googleMapsUrl && (
            <a
              href={routeResult.googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-today-map-tool btn-today-gmaps"
              title="Abrir recorrido de HOY en Google Maps"
            >
              <Navigation size={12} />
              <span>Google Maps</span>
              <ExternalLink size={11} />
            </a>
          )}
        </div>
      </div>

      {/* ABAJO: Lista de Paradas y Productos de HOY */}
      <div className="today-stops-list-section">
        <div className="today-stops-list-header">
          <span>Itinerario y compras de HOY</span>
          <span className="today-stops-count tabular-nums">
            {routeResult.orderedStops.length}{' '}
            {routeResult.orderedStops.length === 1 ? 'parada' : 'paradas'}
          </span>
        </div>

        <div className="today-stops-scroll">
          {routeResult.orderedStops.map((stop, idx) => {
            const stepNum = stop.stepIndex || idx + 1;
            const legDist =
              osrmData?.legs?.[idx]?.distanceKm ?? stop.stepUrbanDistanceKm ?? 0;
            const legMin = osrmData?.legs?.[idx]?.durationMinutes ?? stop.stepMinutes ?? 0;
            const allStopItems = [
              ...(stop.pendingItems || []),
              ...(stop.completedItems || []),
            ];
            const isFocused = focusedStopName === stop.storeName;

            return (
              <div
                key={stop.storeName}
                className={`today-stop-card ${isFocused ? 'is-focused' : ''} ${
                  stop.pendingItems.length === 0 ? 'is-stop-done' : ''
                }`}
              >
                <div
                  className="today-stop-card-header"
                  onClick={() =>
                    setFocusedStopName((prev) =>
                      prev === stop.storeName ? null : stop.storeName
                    )
                  }
                  role="button"
                  tabIndex={0}
                  title="Clic para enfocar este comercio en el mapa superior"
                >
                  <div className="today-stop-title-group">
                    <span className="today-stop-index tabular-nums">{stepNum}</span>
                    <div className="today-stop-text">
                      <div className="today-stop-name-row">
                        <span className="today-stop-name">{stop.storeName}</span>
                        {stop.estimatedTotal > 0 && (
                          <span className="today-stop-subtotal tabular-nums">
                            {formatMoney(stop.estimatedTotal)}
                          </span>
                        )}
                      </div>
                      <span className="today-stop-address" title={stop.address}>
                        {stop.address}
                        {legDist > 0 ? ` · +${formatNumber(legDist, 1)} km (${legMin} min)` : ''}
                      </span>
                    </div>
                  </div>

                  {onEditStoreLocation && (
                    <button
                      type="button"
                      className="btn-today-edit-pin"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditStoreLocation(stop.storeName);
                      }}
                      title={`Ajustar dirección o coordenadas de ${stop.storeName}`}
                    >
                      <MapPin size={13} />
                    </button>
                  )}
                </div>

                <ul className="today-stop-items">
                  {allStopItems.map((it) => {
                    const sku = it.skuCode || formatSkuCode(it.seqNumber || 1);
                    const lineTotal = (Number(it.unitPrice) || 0) * (Number(it.quantity) || 1);
                    return (
                      <li
                        key={it.id}
                        className={`today-stop-item-row ${it.completed ? 'completed' : ''}`}
                      >
                        <label className="today-item-check-label">
                          <input
                            type="checkbox"
                            checked={it.completed}
                            onChange={() => onToggleCompleted(it.id)}
                          />
                          <span className="today-item-sku tabular-nums">{sku}</span>
                          <span className="today-item-name" title={it.name}>
                            {it.name}
                          </span>
                        </label>
                        <div className="today-item-meta tabular-nums">
                          <span className="today-item-qty">{formatNumber(it.quantity)} un.</span>
                          {lineTotal > 0 && (
                            <span className="today-stop-subtotal">{formatMoney(lineTotal)}</span>
                          )}
                          <button
                            type="button"
                            className="btn-today-unschedule"
                            title="Quitar de las compras de HOY"
                            onClick={() => onClearTodayDate(it.id)}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
};
