import React from 'react';
import { ShoppingCart, BarChart2, Map, MapPin } from 'lucide-react';

export type ViewType = 'list' | 'stats' | 'map';

interface NavigationTabsProps {
  currentView: ViewType;
  onSelectView: (view: ViewType) => void;
  totalItemsCount?: number;
  storesCount?: number;
  receiptsCount?: number;
}

export const NavigationTabs: React.FC<NavigationTabsProps> = ({
  currentView,
  onSelectView,
  totalItemsCount = 0,
  storesCount = 0,
  receiptsCount = 0,
}) => {
  return (
    <>
      {/* Selector de Vistas / Navigation Tabs Ejecutivas (WAI-ARIA) */}
      <nav className="view-tabs executive-nav-tabs" role="tablist" aria-label="Selector de vistas principales">
        <button
          id="tab-list"
          className={`tab-btn ${currentView === 'list' ? 'active' : ''}`}
          role="tab"
          aria-selected={currentView === 'list'}
          aria-controls="panel-list"
          type="button"
          data-view="list"
          onClick={() => onSelectView('list')}
        >
          <ShoppingCart size={16} aria-hidden="true" />
          <span>Lista de Compras</span>
          {totalItemsCount > 0 && (
            <span className="nav-tab-counter tabular-nums">{totalItemsCount}</span>
          )}
        </button>

        <button
          id="tab-stats"
          className={`tab-btn ${currentView === 'stats' ? 'active' : ''}`}
          role="tab"
          aria-selected={currentView === 'stats'}
          aria-controls="panel-stats"
          type="button"
          data-view="stats"
          onClick={() => onSelectView('stats')}
        >
          <BarChart2 size={16} aria-hidden="true" />
          <span>Estadísticas Financieras</span>
          {receiptsCount > 0 && (
            <span className="nav-tab-counter tabular-nums">{receiptsCount} tickets</span>
          )}
        </button>

        <button
          id="tab-map"
          className={`tab-btn ${currentView === 'map' ? 'active' : ''}`}
          role="tab"
          aria-selected={currentView === 'map'}
          aria-controls="panel-map"
          type="button"
          data-view="map"
          onClick={() => onSelectView('map')}
        >
          <Map size={16} aria-hidden="true" />
          <span>Ruta en Mapa</span>
          {storesCount > 0 && (
            <span className="nav-tab-counter tabular-nums">{storesCount} paradas</span>
          )}
        </button>
      </nav>

      {/* Bottom Navigation Bar Móvil (<640px) */}
      <nav className="bottom-nav" role="tablist" aria-label="Navegación móvil inferior">
        <button
          id="bottom-tab-list"
          className={`bottom-nav-btn ${currentView === 'list' ? 'active' : ''}`}
          role="tab"
          aria-selected={currentView === 'list'}
          aria-controls="panel-list"
          type="button"
          data-view="list"
          onClick={() => onSelectView('list')}
        >
          <ShoppingCart size={19} aria-hidden="true" />
          <span>Lista</span>
        </button>

        <button
          id="bottom-tab-stats"
          className={`bottom-nav-btn ${currentView === 'stats' ? 'active' : ''}`}
          role="tab"
          aria-selected={currentView === 'stats'}
          aria-controls="panel-stats"
          type="button"
          data-view="stats"
          onClick={() => onSelectView('stats')}
        >
          <BarChart2 size={19} aria-hidden="true" />
          <span>Estadísticas</span>
        </button>

        <button
          id="bottom-tab-map"
          className={`bottom-nav-btn ${currentView === 'map' ? 'active' : ''}`}
          role="tab"
          aria-selected={currentView === 'map'}
          aria-controls="panel-map"
          type="button"
          data-view="map"
          onClick={() => onSelectView('map')}
        >
          <MapPin size={19} aria-hidden="true" />
          <span>Ruta</span>
        </button>
      </nav>
    </>
  );
};
