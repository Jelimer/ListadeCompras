import React from 'react';
import { ShoppingCart, BarChart2, Map, MapPin, Building2 } from 'lucide-react';

export type ViewType = 'list' | 'stats' | 'map' | 'manage';

interface NavigationTabsProps {
  currentView: ViewType;
  onSelectView: (view: ViewType) => void;
  totalItemsCount?: number;
  storesCount?: number;
  receiptsCount?: number;
  duplicateCount?: number;
}

const VIEWS_ORDER: ViewType[] = ['list', 'stats', 'map', 'manage'];

export const NavigationTabs: React.FC<NavigationTabsProps> = ({
  currentView,
  onSelectView,
  totalItemsCount = 0,
  storesCount = 0,
  receiptsCount = 0,
  duplicateCount = 0,
}) => {
  const handleTabKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    view: ViewType,
    prefix: 'tab' | 'bottom-tab'
  ) => {
    const idx = VIEWS_ORDER.indexOf(view);
    if (idx === -1) return;

    let nextIdx = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIdx = (idx + 1) % VIEWS_ORDER.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIdx = (idx - 1 + VIEWS_ORDER.length) % VIEWS_ORDER.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIdx = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIdx = VIEWS_ORDER.length - 1;
    }

    if (nextIdx !== -1) {
      const nextView = VIEWS_ORDER[nextIdx];
      onSelectView(nextView);
      const nextBtn = document.getElementById(`${prefix}-${nextView}`);
      if (nextBtn) nextBtn.focus();
    }
  };

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
          tabIndex={currentView === 'list' ? 0 : -1}
          type="button"
          data-view="list"
          onClick={() => onSelectView('list')}
          onKeyDown={(e) => handleTabKeyDown(e, 'list', 'tab')}
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
          tabIndex={currentView === 'stats' ? 0 : -1}
          type="button"
          data-view="stats"
          onClick={() => onSelectView('stats')}
          onKeyDown={(e) => handleTabKeyDown(e, 'stats', 'tab')}
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
          tabIndex={currentView === 'map' ? 0 : -1}
          type="button"
          data-view="map"
          onClick={() => onSelectView('map')}
          onKeyDown={(e) => handleTabKeyDown(e, 'map', 'tab')}
        >
          <Map size={16} aria-hidden="true" />
          <span>Ruta en Mapa</span>
          {storesCount > 0 && (
            <span className="nav-tab-counter tabular-nums">{storesCount} paradas</span>
          )}
        </button>

        <button
          id="tab-manage"
          className={`tab-btn ${currentView === 'manage' ? 'active' : ''}`}
          role="tab"
          aria-selected={currentView === 'manage'}
          aria-controls="panel-manage"
          tabIndex={currentView === 'manage' ? 0 : -1}
          type="button"
          data-view="manage"
          onClick={() => onSelectView('manage')}
          onKeyDown={(e) => handleTabKeyDown(e, 'manage', 'tab')}
        >
          <Building2 size={16} aria-hidden="true" />
          <span>Catálogo y Locales</span>
          {duplicateCount > 0 ? (
            <span
              className="nav-tab-counter badge-warning tabular-nums"
              title={`${duplicateCount} posibles duplicados detectados`}
            >
              ⚠️ {duplicateCount}
            </span>
          ) : (
            storesCount > 0 && (
              <span className="nav-tab-counter tabular-nums">{storesCount} locales</span>
            )
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
          tabIndex={currentView === 'list' ? 0 : -1}
          type="button"
          data-view="list"
          onClick={() => onSelectView('list')}
          onKeyDown={(e) => handleTabKeyDown(e, 'list', 'bottom-tab')}
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
          tabIndex={currentView === 'stats' ? 0 : -1}
          type="button"
          data-view="stats"
          onClick={() => onSelectView('stats')}
          onKeyDown={(e) => handleTabKeyDown(e, 'stats', 'bottom-tab')}
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
          tabIndex={currentView === 'map' ? 0 : -1}
          type="button"
          data-view="map"
          onClick={() => onSelectView('map')}
          onKeyDown={(e) => handleTabKeyDown(e, 'map', 'bottom-tab')}
        >
          <MapPin size={19} aria-hidden="true" />
          <span>Ruta</span>
        </button>

        <button
          id="bottom-tab-manage"
          className={`bottom-nav-btn ${currentView === 'manage' ? 'active' : ''}`}
          role="tab"
          aria-selected={currentView === 'manage'}
          aria-controls="panel-manage"
          tabIndex={currentView === 'manage' ? 0 : -1}
          type="button"
          data-view="manage"
          onClick={() => onSelectView('manage')}
          onKeyDown={(e) => handleTabKeyDown(e, 'manage', 'bottom-tab')}
        >
          <Building2 size={19} aria-hidden="true" />
          <span>Gestión</span>
          {duplicateCount > 0 && (
            <span className="bottom-nav-dot" title="Posibles duplicados detectados" />
          )}
        </button>
      </nav>
    </>
  );
};
