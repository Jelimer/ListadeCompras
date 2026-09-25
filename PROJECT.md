# Project: Lista de Compra | PRO — Módulo de Mapas y Optimizador de Rutas

## Architecture Overview
Arquitectura modular desacoplada en capas para aplicación web vanilla de alto rendimiento, 100% offline-first, accesible (WCAG AA/AAA) y adaptable a dispositivos móviles desde 360px hasta pantallas panorámicas.

```
                           ┌─────────────────────────────────────────┐
                           │               index.html                │
                           │  - Navigation Tabs (Lista/Stats/Ruta)   │
                           │  - Leaflet Container & Route Controls   │
                           └────────────────────┬────────────────────┘
                                                │
         ┌──────────────────────────────────────┼──────────────────────────────────────┐
         │                                      │                                      │
┌────────▼──────────────┐             ┌─────────▼───────────┐               ┌──────────▼──────────┐
│       UI / DOM        │             │  Core State & Logic │               │  Persistence Layer  │
│  - script.js (App)    │◄───────────►│  - state.js (Store) │◄─────────────►│  - storage.js       │
│  - chart.js (ECharts) │             │  - validation.js    │               │    (LocalStorage +  │
│  - ui-feedback.js     │             │  - analytics.js     │               │     Firestore sync) │
│  - style.css          │             │  - export-import.js │               └─────────────────────┘
└───────────────────────┘             └─────────┬───────────┘
                                                │
                                      ┌─────────▼───────────┐
                                      │   Map & Route Core  │
                                      │  - js/map-route.js  │
                                      │    * Leaflet Ctrl   │
                                      │    * Geocoding API  │
                                      │    * TSP Optimizer  │
                                      │    * Google Maps URL│
                                      │    * Coords Cache   │
                                      └─────────────────────┘
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F01 | LocalStorage Offline-First | Persistencia primaria local inmediata e independiente de Firebase | M1 | Preexistente |
| F02 | Sincronización Opcional Firebase | Adaptador seguro con try/catch que no bloquea la app si no hay conexión | M1 | Preexistente |
| F03 | Estado Centralizado y Eventos | Store centralizado de productos y filtros con patrón pub/sub limpio | M1 | Preexistente |
| F04 | Validaciones Numéricas y Lógicas | Precios >= 0, cantidades > 0, sanitización contra XSS y categoría 'General' unificada | M1 | Preexistente |
| F05 | Prevención de Inyección XSS | Sanitización y escape HTML en inputs de usuario (`escapeHtml`) | M1 | Preexistente |
| F06 | Paleta de Tokens WCAG AA | Colores con contraste superior a 4.5:1 en modo claro y modo oscuro | M2 | Preexistente |
| F07 | Modo Oscuro Persistente | Alternancia instantánea, persistencia en LocalStorage y detección de `prefers-color-scheme` | M2 | Preexistente |
| F08 | Layout Mobile-First (desde 360px) | Eliminación de `minmax(340px, 1fr)`, cero scroll horizontal en 360px-480px | M2 | Preexistente |
| F09 | Touch Targets Accesibles (44px) | Botones de edición/borrado y checkboxes con áreas táctiles mínimas de 44x44px | M2 | Preexistente |
| F10 | Avatares Locales SVG / Lucide | Sustitución de LoremFlickr por avatares locales temáticos 100% offline | M2 | Preexistente |
| F11 | Renderizado DOM Granular | Eliminación de `innerHTML = ''` destructivo, actualización quirúrgica por nodo | M3 | Preexistente |
| F12 | Precisión Aritmética de Centavos | Cálculos monetarios en centavos enteros para evitar deriva de flotantes IEEE 754 | M3 | Preexistente |
| F13 | Segregación de Métricas | Cálculo y actualización de Total Pendiente, Total Gastado y Presupuesto Real | M3 | Preexistente |
| F14 | ECharts Adaptativo y Responsive | `confine: true` en tooltips, leyenda scroll, truncamiento elíptico en eje Y | M3 | Preexistente |
| F15 | Sincronización Tema ECharts | Adaptación automática del gráfico según modo claro/oscuro con ResizeObserver debounced | M3 | Preexistente |
| F16 | Estado Vacío en ECharts | Visualización amigable cuando no hay compras pendientes | M3 | Preexistente |
| F17 | Exportación JSON y CSV | Descarga estructurada con esquema versionado y CSV RFC 4180 con BOM UTF-8 | M4 | Preexistente |
| F18 | Importación JSON y CSV | Validación estricta de estructura con opción de sobrescribir o combinar | M4 | Preexistente |
| F19 | Atajos de Teclado (Enter / Escape) | Adición rápida con Enter y retorno de foco; cancelación de edición con Esc | M4 | Preexistente |
| F20 | Diálogos Amigables y Undo Toast | Reemplazo de `confirm()` por SweetAlert2 y toast con botón Deshacer (6-8 seg) | M4 | Preexistente |
| F21 | Leaflet 1.9.4 & OSM/CartoDB Tiles | Vista interactiva con CartoDB Positron (claro) y Dark Matter (oscuro) | M-MAP-2 | Survey (Exp 2) |
| F22 | Marcadores y Popups de Comercio | Pines personalizados con lista de ítems pendientes, cantidades y total estimado | M-MAP-1 | Survey (Exp 2) |
| F23 | Geocodificación Defensiva | Nominatim OSM + Photon con debounce de 450ms, AbortController y fallback seguro | M-MAP-1 | Survey (Exp 2) |
| F24 | Caché Local de Coordenadas | Persistencia en `shopping_store_coords` para 0 peticiones de red duplicadas | M-MAP-1 | Survey (Exp 1 & 3) |
| F25 | Origen y Geolocalización | `navigator.geolocation` con permisos/timeout + ingreso manual de dirección | M-MAP-1 | Survey (Exp 2 & 3) |
| F26 | Estimación Haversine y Tiempo | Distancia esférica corregida (sinuosidad 1.25) y tiempo estimado a 30 km/h | M-MAP-1 | Survey (Exp 2) |
| F27 | Optimizador de Rutas TSP | Algoritmo Nearest Neighbor desde origen visitando tiendas con compras pendientes | M-MAP-1 | Survey (Exp 2) |
| F28 | URL Universal Google Maps | Generador de enlace de navegación universal con origen, destino y waypoints | M-MAP-1 | Survey (Exp 2) |
| F29 | Evaluación de Persistencia | Documento formal comparando Firestore vs Dexie, Supabase y Cloudflare D1/KV | M-MAP-1 | Survey (Exp 3) |
| F30 | Selector Ágil de Vistas (Tabs) | Pestañas accesibles (Lista / Estadísticas / Ruta en Mapa) en móvil y desktop | M-MAP-2 | Survey (Exp 3) |
| F31 | Ergonomía Mobile-First (360px+) | Bottom Bar en zona del pulgar, mapa `clamp(350px, 45vh, 450px)`, scroll trap fix | M-MAP-2 | Survey (Exp 3) |
| F32 | Accesibilidad WCAG AA/AAA | Contraste mínimo 4.5:1 y 7:1 en popups, controles del mapa y pestañas | M-MAP-2 | Survey (Exp 3) |
| F33 | Suite de Pruebas E2E / Unitarias | Mocks de Leaflet y Geo en mock_dom.js, nuevas pruebas y 0 regresiones en 328 preexistentes | E2E | Survey (Exp 1 & 3) |
| F34 | Despliegue en Git (`master`) | Confirmación y publicación en GitHub master para compilación/despliegue en Vercel | M-MAP-3 | Survey (Exp 3) |

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track: Mocks y Suite de Pruebas | Extensión de `tests/mock_dom.js` (Leaflet, Geolocation), pruebas de geocodificación, ruteo, TSP, persistencia y UI | none | IN_PROGRESS |
| M-MAP-1 | Persistencia y Módulo Core Map & Route | Documento de persistencia R3, módulo `js/map-route.js` con geocodificación, TSP, Haversine, Google Maps URL y caché local | none | IN_PROGRESS |
| M-MAP-2 | Integración UI/UX, Selector de Vistas y Mapa | Inyección de Leaflet en `index.html`, maquetación de tabs accesibles, panel de ruta, controles mobile-first y estilos en `style.css` | M-MAP-1 | PLANNED |
| M-MAP-3 | Verificación Final, 100% Tests y Despliegue Git | Ejecución y aprobación de suite ampliada (328+ pruebas), auditoría de integridad forense y push a `master` | E2E, M-MAP-1, M-MAP-2 | PLANNED |

## Interface Contracts

### Store (js/state.js) ↔ Storage (js/storage.js)
```typescript
interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;      // > 0
  unitPrice: number;     // >= 0
  category: string;      // default: 'General'
  location: string;      // default: 'General'
  completed: boolean;    // default: false
  timestamp: number;     // Date.now()
}

interface StoreCoordinate {
  lat: number;
  lng: number;
  displayName?: string;
  updatedAt: number;
}

interface CoordinateCache {
  [storeNameLower: string]: StoreCoordinate;
}

interface RouteOrigin {
  type: 'gps' | 'manual' | 'default';
  lat: number;
  lng: number;
  address?: string;
}
```

### Map & Route Core (js/map-route.js)
```typescript
interface StoreRouteStop {
  storeName: string;
  lat: number;
  lng: number;
  pendingItems: ShoppingItem[];
  itemCount: number;
  estimatedTotal: number;
}

interface RouteCalculationResult {
  origin: RouteOrigin;
  orderedStops: StoreRouteStop[];
  totalDistanceKm: number;
  estimatedDurationMinutes: number;
  googleMapsUrl: string;
}

interface MapRouteService {
  initMap(containerId: string, options?: { isDark?: boolean }): any;
  setTheme(isDark: boolean): void;
  geocodeAddress(address: string): Promise<StoreCoordinate | null>;
  getStoredCoordinates(): CoordinateCache;
  saveStoreCoordinate(storeName: string, coord: StoreCoordinate): void;
  getOrigin(): RouteOrigin;
  setOrigin(origin: RouteOrigin): void;
  calculateOptimalRoute(items: ShoppingItem[], origin?: RouteOrigin): RouteCalculationResult;
  generateGoogleMapsUrl(origin: RouteOrigin, stops: StoreRouteStop[]): string;
  renderRouteOnMap(route: RouteCalculationResult): void;
  destroy(): void;
}
```

## Code Layout
```
ListadeCompras-Git/
├── index.html                   # HTML semántico con Navigation Tabs, Leaflet CDN y controles de ruta
├── style.css                    # Tokens CSS, bottom navigation, mobile-first (360px+), temas WCAG AAA
├── DOCS_PERSISTENCE_EVALUATION.md # Informe técnico R3 (Firestore vs Dexie vs Supabase vs D1)
├── js/
│   ├── state.js                 # Centralized reactive Store (Pub/Sub)
│   ├── storage.js               # Local-first persistence (LocalStorage + Firebase sync)
│   ├── validation.js            # Input validation & sanitization
│   ├── analytics.js             # Financial & category calculations
│   ├── chart.js                 # ECharts controller
│   ├── map-route.js             # NUEVO: Core de mapas, geocodificación, TSP y navegación Google Maps
│   ├── export-import.js         # JSON v1.0 & CSV export/import
│   ├── ui-feedback.js           # SweetAlert2 & Toast notifications
│   └── script.js                # App bootstrap, view switching, event delegation & map wiring
├── tests/
│   ├── e2e_runner.js            # Automated test runner
│   ├── mock_dom.js              # Mock DOM en memoria (extendido con Leaflet y Geolocation)
│   ├── spec_helper.js           # Oráculos matemáticos, Haversine y helpers de aserción
│   ├── tier1_features.test.js   # Tier 1: Cobertura por característica (F01-F32)
│   ├── tier2_boundaries.test.js # Tier 2: Casos límite y esquinas
│   ├── tier3_pairwise.test.js   # Tier 3: Interacciones cruzadas
│   ├── tier4_scenarios.test.js  # Tier 4: Escenarios de usuario reales
│   └── map_routing.test.js      # NUEVO: Pruebas especializadas del módulo de mapa y rutas
├── TEST_INFRA.md                # Metodología y catálogo de pruebas
├── TEST_READY.md                # Señal de preparación de suite
└── PROJECT.md                   # Especificación arquitectónica global
```
