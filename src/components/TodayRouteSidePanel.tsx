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
  X,
  Compass,
  ArrowRightLeft,
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

export function getTomorrowFullDate(): string {
  const tom = new Date();
  tom.setDate(tom.getDate() + 1);
  const d = String(tom.getDate()).padStart(2, '0');
  const m = String(tom.getMonth() + 1).padStart(2, '0');
  const y = tom.getFullYear();
  return `${d}/${m}/${y}`;
}

export function getTomorrowDayMonth(): string {
  const tom = new Date();
  tom.setDate(tom.getDate() + 1);
  const d = String(tom.getDate()).padStart(2, '0');
  const m = String(tom.getMonth() + 1).padStart(2, '0');
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

export function isItemScheduledForTomorrow(item: ShoppingItem): boolean {
  const raw = (item.plannedDate || '').trim();
  if (!raw) return false;
  const upper = raw
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const tomorrowDM = getTomorrowDayMonth();
  const tomorrowFull = getTomorrowFullDate();
  return (
    upper === 'MANANA' ||
    raw === tomorrowDM ||
    raw === tomorrowFull ||
    raw.startsWith(`${tomorrowDM}/`)
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
  tomorrowItems?: ShoppingItem[];
  origin?: RouteOrigin;
  coordsVersion?: number;
  onToggleCompleted: (id: string) => void;
  onClearTodayDate: (id: string) => void;
  onMoveToToday?: (id: string) => void;
  onMoveToTomorrow?: (id: string) => void;
  onEditStoreLocation?: (storeName: string) => void;
}

export const TodayRouteSidePanel: React.FC<TodayRouteSidePanelProps> = ({
  todayItems,
  tomorrowItems = [],
  origin: propOrigin,
  coordsVersion = 0,
  onToggleCompleted,
  onClearTodayDate,
  onMoveToToday,
  onMoveToTomorrow,
  onEditStoreLocation,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [includeTomorrow, setIncludeTomorrow] = useState<boolean>(
    () => todayItems.length === 0 && tomorrowItems.length > 0
  );
  const [osrmData, setOsrmData] = useState<OSRMRouteData | null>(null);
  const [tomorrowOsrmData, setTomorrowOsrmData] = useState<OSRMRouteData | null>(null);
  const [focusedStopName, setFocusedStopName] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  // Si no hay productos para hoy pero sí para mañana, activar automáticamente la vista de mañana
  useEffect(() => {
    if (todayItems.length === 0 && tomorrowItems.length > 0 && !includeTomorrow) {
      setIncludeTomorrow(true);
    }
  }, [todayItems.length, tomorrowItems.length, includeTomorrow]);

  const activeOrigin = useMemo(() => propOrigin || loadStoredOrigin(), [propOrigin]);

  const routeResult = useMemo(() => {
    return calculateOptimalRoute(todayItems, activeOrigin);
  }, [todayItems, activeOrigin, coordsVersion]);

  const tomorrowRouteResult = useMemo(() => {
    if (!includeTomorrow || tomorrowItems.length === 0) {
      return calculateOptimalRoute([], activeOrigin);
    }
    return calculateOptimalRoute(tomorrowItems, activeOrigin);
  }, [includeTomorrow, tomorrowItems, activeOrigin, coordsVersion]);

  // Fetch OSRM street geometry for TODAY's route
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

  // Fetch OSRM street geometry for TOMORROW's route when checked
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    if (!includeTomorrow || tomorrowRouteResult.orderedStops.length === 0) {
      setTomorrowOsrmData(null);
      return;
    }

    fetchOSRMRoute(
      tomorrowRouteResult.origin,
      tomorrowRouteResult.orderedStops,
      controller.signal
    ).then((res) => {
      if (!cancelled) {
        setTomorrowOsrmData(res);
      }
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [includeTomorrow, tomorrowRouteResult]);

  // Initialize & update Leaflet map with two separate colored routes (HOY vs MAÑANA)
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

    const todayStoreCoordsSet = new Set<string>();

    // 1. Store markers for TODAY (Cobalt Blue #1D4ED8)
    routeResult.orderedStops.forEach((stop, index) => {
      const stepNum = stop.stepIndex || index + 1;
      boundsPoints.push([stop.lat, stop.lng]);
      todayStoreCoordsSet.add(`${stop.lat.toFixed(4)}_${stop.lng.toFixed(4)}`);

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
        .bindTooltip(`HOY ${stepNum}. ${stop.storeName}`, {
          permanent: true,
          direction: 'top',
          offset: [0, -14],
          className: 'today-map-tooltip tooltip-today-route',
        })
        .bindPopup(
          `<div class="map-popup-box">
            <strong>HOY #${stepNum} · ${stop.storeName}</strong>
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

    // Draw TODAY route polyline (Cobalt Blue #1d4ed8)
    if (osrmData && osrmData.coordinates.length > 1) {
      L.polyline(osrmData.coordinates, {
        color: '#1d4ed8',
        weight: 4,
        opacity: 0.88,
      }).addTo(lg);
    } else if (routeResult.orderedStops.length > 0) {
      const fallbackLatLngs: [number, number][] = [
        [activeOrigin.lat, activeOrigin.lng],
        ...routeResult.orderedStops.map((s) => [s.lat, s.lng] as [number, number]),
      ];
      L.polyline(fallbackLatLngs, {
        color: '#1d4ed8',
        weight: 3.5,
        dashArray: '6, 6',
        opacity: 0.82,
      }).addTo(lg);
    }

    // 2. Store markers & polyline for TOMORROW (Executive Amber #D97706) when checked
    if (includeTomorrow && tomorrowRouteResult.orderedStops.length > 0) {
      tomorrowRouteResult.orderedStops.forEach((stop, index) => {
        const stepNum = stop.stepIndex || index + 1;
        const coordKey = `${stop.lat.toFixed(4)}_${stop.lng.toFixed(4)}`;
        const overlapsWithToday = todayStoreCoordsSet.has(coordKey);
        const markerLat = overlapsWithToday ? stop.lat + 0.00022 : stop.lat;
        const markerLng = overlapsWithToday ? stop.lng + 0.00022 : stop.lng;

        boundsPoints.push([markerLat, markerLng]);

        const allItemsAtStop = [...(stop.pendingItems || []), ...(stop.completedItems || [])];
        const allCompleted = stop.pendingItems.length === 0 && allItemsAtStop.length > 0;

        const tomorrowIcon = L.divIcon({
          className: 'custom-leaflet-marker',
          html: `<div class="today-map-pin ${
            allCompleted ? 'done-pin' : 'tomorrow-pin'
          }">M${stepNum}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
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

        L.marker([markerLat, markerLng], { icon: tomorrowIcon })
          .bindTooltip(`MAÑANA M${stepNum}. ${stop.storeName}`, {
            permanent: true,
            direction: overlapsWithToday ? 'bottom' : 'top',
            offset: overlapsWithToday ? [0, 14] : [0, -14],
            className: 'today-map-tooltip tooltip-tomorrow-route',
          })
          .bindPopup(
            `<div class="map-popup-box">
              <strong>MAÑANA M${stepNum} · ${stop.storeName}</strong>
              <div class="map-popup-addr">${stop.address}</div>
              <ul class="map-popup-list">${itemsHtml}</ul>
              ${
                stop.estimatedTotal > 0
                  ? `<div class="map-popup-footer tabular-nums">Subtotal Mañana: ${formatMoney(
                      stop.estimatedTotal
                    )}</div>`
                  : ''
              }
            </div>`
          )
          .addTo(lg);
      });

      // Draw TOMORROW route polyline (Distinct Amber/Orange #d97706 dashed/styled line)
      if (tomorrowOsrmData && tomorrowOsrmData.coordinates.length > 1) {
        L.polyline(tomorrowOsrmData.coordinates, {
          color: '#d97706',
          weight: 4,
          dashArray: '10, 7',
          opacity: 0.92,
        }).addTo(lg);
      } else {
        const fallbackTomorrowLatLngs: [number, number][] = [
          [activeOrigin.lat, activeOrigin.lng],
          ...tomorrowRouteResult.orderedStops.map((s) => [s.lat, s.lng] as [number, number]),
        ];
        L.polyline(fallbackTomorrowLatLngs, {
          color: '#d97706',
          weight: 3.5,
          dashArray: '8, 6',
          opacity: 0.88,
        }).addTo(lg);
      }
    }

    setTimeout(() => {
      map.invalidateSize();
      if (focusedStopName) {
        const target =
          routeResult.orderedStops.find((s) => s.storeName === focusedStopName) ||
          (includeTomorrow
            ? tomorrowRouteResult.orderedStops.find((s) => s.storeName === focusedStopName)
            : undefined);
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
  }, [
    activeOrigin,
    routeResult,
    tomorrowRouteResult,
    osrmData,
    tomorrowOsrmData,
    includeTomorrow,
    isMinimized,
    focusedStopName,
  ]);

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
      ...(includeTomorrow
        ? tomorrowRouteResult.orderedStops.map((s) => [s.lat, s.lng] as [number, number])
        : []),
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

  const totalTomorrowAmount = useMemo(() => {
    return tomorrowItems.reduce((acc, it) => {
      if (it.completed) return acc;
      return acc + (Number(it.unitPrice) || 0) * (Number(it.quantity) || 1);
    }, 0);
  }, [tomorrowItems]);

  const totalDistanceKm = osrmData
    ? osrmData.totalDistanceKm
    : routeResult.totalUrbanDistanceKm;
  const totalMinutes = osrmData
    ? osrmData.totalDurationMinutes
    : routeResult.estimatedDurationMinutes;

  const tomorrowDistanceKm = tomorrowOsrmData
    ? tomorrowOsrmData.totalDistanceKm
    : tomorrowRouteResult.totalUrbanDistanceKm;
  const tomorrowMinutes = tomorrowOsrmData
    ? tomorrowOsrmData.totalDurationMinutes
    : tomorrowRouteResult.estimatedDurationMinutes;

  const todayDM = getTodayDayMonth();
  const tomorrowDM = getTomorrowDayMonth();

  if (isMinimized) {
    return (
      <aside className="today-side-panel-collapsed" aria-label="Panel de Ruta de HOY contraído">
        <button
          type="button"
          className="btn-expand-today-panel"
          onClick={() => setIsMinimized(false)}
          title="Desplegar mapa y lista de compras de HOY y Mañana"
        >
          <ChevronLeft size={18} />
          <span className="today-collapsed-badge tabular-nums">
            {routeResult.orderedStops.length +
              (includeTomorrow ? tomorrowRouteResult.orderedStops.length : 0)}
          </span>
          <span>
            RUTA HOY ({todayDM})
            {includeTomorrow && tomorrowItems.length > 0 ? ` + MAÑANA` : ''}
          </span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="today-side-panel" aria-label="Mapa y lugares para comprar HOY y Mañana">
      {/* Cabecera Ejecutiva del Panel de HOY */}
      <div className="today-panel-header">
        <div className="today-panel-title-row">
          <div className="today-panel-badge-pulse">
            <Calendar size={16} />
          </div>
          <div>
            <h3 className="today-panel-title">
              <span>Lugares a visitar</span>
              <span className="today-panel-date-tag tabular-nums">HOY · {todayDM}</span>
              {includeTomorrow && (
                <span className="today-panel-date-tag tomorrow-date-tag tabular-nums">
                  MAÑANA · {tomorrowDM}
                </span>
              )}
            </h3>
            <p className="today-panel-subtitle">
              Análisis de trayectos separados por color para Hoy y Mañana
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn-collapse-today-panel"
          onClick={() => setIsMinimized(true)}
          title="Contraer panel lateral de ruta"
          aria-label="Contraer panel lateral de ruta"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* BARRA PARA TILDAR Y COMPARAR EL POSIBLE VIAJE DE "MAÑANA" */}
      <div className="today-tomorrow-toggle-bar">
        <label className="tomorrow-checkbox-label">
          <input
            type="checkbox"
            checked={includeTomorrow}
            onChange={(e) => setIncludeTomorrow(e.target.checked)}
          />
          <span className="tomorrow-checkbox-text">
            Ver también posible viaje de <strong>Mañana ({tomorrowDM})</strong>
          </span>
        </label>

        <div className="route-color-legend tabular-nums">
          <span className="legend-route-pill legend-today">
            <span className="legend-color-dot dot-today" />
            HOY ({routeResult.orderedStops.length})
          </span>
          <span
            className={`legend-route-pill legend-tomorrow ${
              includeTomorrow ? 'is-active' : ''
            }`}
          >
            <span className="legend-color-dot dot-tomorrow" />
            Mañana ({tomorrowItems.length} prod.)
          </span>
        </div>
      </div>

      {/* Cinta de KPIs de HOY */}
      <div className="today-panel-kpis tabular-nums">
        <div className="today-kpi-item">
          <span className="today-kpi-label">Paradas HOY</span>
          <span className="today-kpi-val">
            {routeResult.orderedStops.length}{' '}
            {routeResult.orderedStops.length === 1 ? 'local' : 'locales'} ({todayItems.length} prod.)
          </span>
        </div>
        <div className="today-kpi-item">
          <span className="today-kpi-label">Trayecto HOY</span>
          <span className="today-kpi-val">
            {totalDistanceKm > 0
              ? `${formatNumber(totalDistanceKm, 1)} km (~${totalMinutes} min)`
              : routeResult.orderedStops.length > 0
              ? 'Directo'
              : '0,0 km'}
          </span>
        </div>
        <div className="today-kpi-item">
          <span className="today-kpi-label">Presupuesto HOY</span>
          <span className="today-kpi-val today-kpi-money">
            {formatMoney(totalTodayAmount)}
          </span>
        </div>
      </div>

      {/* Cinta de KPIs de MAÑANA (visible cuando se tilda la opción de Mañana) */}
      {includeTomorrow && (
        <div className="today-panel-kpis tomorrow-panel-kpis tabular-nums">
          <div className="today-kpi-item">
            <span className="today-kpi-label tomorrow-kpi-label">Paradas Mañana ({tomorrowDM})</span>
            <span className="today-kpi-val">
              {tomorrowRouteResult.orderedStops.length}{' '}
              {tomorrowRouteResult.orderedStops.length === 1 ? 'local' : 'locales'} (
              {tomorrowItems.length} prod.)
            </span>
          </div>
          <div className="today-kpi-item">
            <span className="today-kpi-label tomorrow-kpi-label">Trayecto Mañana</span>
            <span className="today-kpi-val">
              {tomorrowDistanceKm > 0
                ? `${formatNumber(tomorrowDistanceKm, 1)} km (~${tomorrowMinutes} min)`
                : tomorrowRouteResult.orderedStops.length > 0
                ? 'Directo'
                : 'Sin paradas'}
            </span>
          </div>
          <div className="today-kpi-item">
            <span className="today-kpi-label tomorrow-kpi-label">Presupuesto Mañana</span>
            <span className="today-kpi-val tomorrow-kpi-money">
              {formatMoney(totalTomorrowAmount)}
            </span>
          </div>
        </div>
      )}

      {/* ARRIBA: Mapa Interactivo con Rutas Separadas por Color (Azul = HOY, Ámbar = MAÑANA) */}
      <div className="today-map-section">
        <div
          ref={mapContainerRef}
          className="today-map-box"
          aria-label="Mapa comparativo de lugares para ir hoy y mañana"
        />
        <div className="today-map-overlay-controls">
          <button
            type="button"
            className="btn-today-map-tool"
            onClick={handleFitRoute}
            title="Encuadrar todos los lugares activos en el mapa"
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
              <span>Maps HOY</span>
              <ExternalLink size={11} />
            </a>
          )}
          {includeTomorrow && tomorrowRouteResult.googleMapsUrl && (
            <a
              href={tomorrowRouteResult.googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-today-map-tool btn-tomorrow-gmaps"
              title="Abrir recorrido de MAÑANA en Google Maps"
            >
              <Navigation size={12} />
              <span>Maps Mañana</span>
              <ExternalLink size={11} />
            </a>
          )}
        </div>
      </div>

      {/* ABAJO: Lista de Paradas y Productos de HOY y (si está tildado) de MAÑANA */}
      <div className="today-stops-list-section">
        <div className="today-stops-list-header">
          <span>
            Itinerario HOY ({routeResult.orderedStops.length})
            {includeTomorrow
              ? ` · Mañana (${tomorrowRouteResult.orderedStops.length})`
              : ''}
          </span>
          <span className="today-stops-count tabular-nums">
            {formatMoney(totalTodayAmount + (includeTomorrow ? totalTomorrowAmount : 0))}
          </span>
        </div>

        <div className="today-stops-scroll">
          {/* SECCIÓN 1: PARADAS DE HOY */}
          {routeResult.orderedStops.length === 0 ? (
            <div className="tomorrow-empty-box">
              No hay productos marcados para <strong>HOY ({todayDM})</strong>.
            </div>
          ) : (
            routeResult.orderedStops.map((stop, idx) => {
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
                  key={`today_${stop.storeName}`}
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
                          <span className="route-day-chip chip-today">HOY</span>
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
                            {onMoveToTomorrow && (
                              <button
                                type="button"
                                className="btn-move-route-day to-tomorrow"
                                title={`Pasar "${it.name}" al viaje de Mañana (${tomorrowDM})`}
                                onClick={() => onMoveToTomorrow(it.id)}
                              >
                                <ArrowRightLeft size={11} />
                                <span>Mañana</span>
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn-today-unschedule"
                              title="Quitar fecha programada"
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
            })
          )}

          {/* SECCIÓN 2: PARADAS DE MAÑANA (CUANDO ESTÁ TILDADO) */}
          {includeTomorrow && (
            <div className="tomorrow-stops-divider-block">
              <div className="tomorrow-stops-banner">
                <span>Viaje Programado para Mañana ({tomorrowDM})</span>
                <span className="tabular-nums">
                  {tomorrowRouteResult.orderedStops.length}{' '}
                  {tomorrowRouteResult.orderedStops.length === 1 ? 'parada' : 'paradas'} ·{' '}
                  {formatMoney(totalTomorrowAmount)}
                </span>
              </div>

              {tomorrowRouteResult.orderedStops.length === 0 ? (
                <div className="tomorrow-empty-box">
                  Aún no hay productos con fecha <strong>Mañana ({tomorrowDM})</strong>. Elige{' '}
                  <strong>"Mañana ({tomorrowDM})"</strong> en el selector de fecha de cualquier
                  producto para comparar su ruta en el mapa.
                </div>
              ) : (
                tomorrowRouteResult.orderedStops.map((stop, idx) => {
                  const stepNum = stop.stepIndex || idx + 1;
                  const legDist =
                    tomorrowOsrmData?.legs?.[idx]?.distanceKm ?? stop.stepUrbanDistanceKm ?? 0;
                  const legMin =
                    tomorrowOsrmData?.legs?.[idx]?.durationMinutes ?? stop.stepMinutes ?? 0;
                  const allStopItems = [
                    ...(stop.pendingItems || []),
                    ...(stop.completedItems || []),
                  ];
                  const isFocused = focusedStopName === stop.storeName;

                  return (
                    <div
                      key={`tomorrow_${stop.storeName}`}
                      className={`today-stop-card tomorrow-stop-card ${
                        isFocused ? 'is-focused' : ''
                      } ${stop.pendingItems.length === 0 ? 'is-stop-done' : ''}`}
                    >
                      <div
                        className="today-stop-card-header tomorrow-stop-card-header"
                        onClick={() =>
                          setFocusedStopName((prev) =>
                            prev === stop.storeName ? null : stop.storeName
                          )
                        }
                        role="button"
                        tabIndex={0}
                        title="Clic para enfocar este comercio de Mañana en el mapa"
                      >
                        <div className="today-stop-title-group">
                          <span className="today-stop-index tomorrow-stop-index tabular-nums">
                            M{stepNum}
                          </span>
                          <div className="today-stop-text">
                            <div className="today-stop-name-row">
                              <span className="today-stop-name">{stop.storeName}</span>
                              <span className="route-day-chip chip-tomorrow">
                                MAÑANA · {tomorrowDM}
                              </span>
                              {stop.estimatedTotal > 0 && (
                                <span className="today-stop-subtotal tomorrow-stop-subtotal tabular-nums">
                                  {formatMoney(stop.estimatedTotal)}
                                </span>
                              )}
                            </div>
                            <span className="today-stop-address" title={stop.address}>
                              {stop.address}
                              {legDist > 0
                                ? ` · +${formatNumber(legDist, 1)} km (${legMin} min)`
                                : ''}
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
                          const lineTotal =
                            (Number(it.unitPrice) || 0) * (Number(it.quantity) || 1);
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
                                <span className="today-item-qty">
                                  {formatNumber(it.quantity)} un.
                                </span>
                                {lineTotal > 0 && (
                                  <span className="today-stop-subtotal tomorrow-stop-subtotal">
                                    {formatMoney(lineTotal)}
                                  </span>
                                )}
                                {onMoveToToday && (
                                  <button
                                    type="button"
                                    className="btn-move-route-day to-today"
                                    title={`Adelantar "${it.name}" al viaje de HOY`}
                                    onClick={() => onMoveToToday(it.id)}
                                  >
                                    <ArrowRightLeft size={11} />
                                    <span>Pasar a HOY</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="btn-today-unschedule"
                                  title="Quitar fecha programada"
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
                })
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
