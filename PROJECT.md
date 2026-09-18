# Project: Lista de Compra | PRO

## Architecture Overview
Arquitectura modular desacoplada en capas para aplicación web vanilla de alto rendimiento, 100% offline-first y adaptable a dispositivos móviles desde 360px hasta pantallas panorámicas de 1800px.

```
                  ┌─────────────────────────────────┐
                  │           index.html            │
                  └────────────────┬────────────────┘
                                   │
      ┌────────────────────────────┼────────────────────────────┐
      │                            │                            │
┌─────▼──────────────┐   ┌─────────▼───────────┐   ┌────────────▼─────────┐
│     UI / DOM       │   │  Core State & Logic │   │   Persistence Layer  │
│  - ui-manager.js   │   │  - state.js (Store) │   │  - storage.js        │
│  - ui-feedback.js  │   │  - validation.js    │   │    (LocalStorage +   │
│  - chart.js        │   │  - analytics.js     │   │     Firebase sync)   │
│  - style.css       │   │  - export-import.js │   │                      │
└────────────────────┘   └─────────────────────┘   └──────────────────────┘
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F01 | LocalStorage Offline-First | Persistencia primaria local inmediata e independiente de Firebase | M1 | Survey (Exp 1 & 3) |
| F02 | Sincronización Opcional Firebase | Adaptador seguro con try/catch que no bloquea la app si no hay conexión | M1 | Survey (Exp 1) |
| F03 | Estado Centralizado y Eventos | Store centralizado de productos y filtros con patrón pub/sub limpio | M1 | Survey (Exp 1) |
| F04 | Validaciones Numéricas y Lógicas | Precios >= 0, cantidades > 0, sanitización contra XSS y categoría 'General' unificada | M1 | Survey (Exp 1 & 3) |
| F05 | Prevención de Inyección XSS | Sanitización y escape HTML en inputs de usuario (`escapeHtml`) | M1 | Survey (Exp 1) |
| F06 | Paleta de Tokens WCAG AA | Colores con contraste superior a 4.5:1 en modo claro y modo oscuro | M2 | Survey (Exp 2) |
| F07 | Modo Oscuro Persistente | Alternancia instantánea, persistencia en LocalStorage y detección de `prefers-color-scheme` | M2 | Survey (Exp 1 & 2) |
| F08 | Layout Mobile-First (desde 360px) | Eliminación de `minmax(340px, 1fr)`, cero scroll horizontal en 360px-480px | M2 | Survey (Exp 2) |
| F09 | Touch Targets Accesibles (44px) | Botones de edición/borrado y checkboxes con áreas táctiles mínimas de 44x44px | M2 | Survey (Exp 2) |
| F10 | Avatares Locales SVG / Lucide | Sustitución de LoremFlickr por avatares locales temáticos 100% offline | M2 | Survey (Exp 1 & 2) |
| F11 | Renderizado DOM Granular | Eliminación de `innerHTML = ''` destructivo, actualización quirúrgica por nodo | M3 | Survey (Exp 1 & 2) |
| F12 | Precisión Aritmética de Centavos | Cálculos monetarios en centavos enteros para evitar deriva de flotantes IEEE 754 | M3 | Survey (Exp 3) |
| F13 | Segregación de Métricas | Cálculo y actualización de Total Pendiente, Total Gastado y Presupuesto Real | M3 | Survey (Exp 3) |
| F14 | ECharts Adaptativo y Responsive | `confine: true` en tooltips, leyenda scroll, truncamiento elíptico en eje Y | M3 | Survey (Exp 3) |
| F15 | Sincronización Tema ECharts | Adaptación automática del gráfico según modo claro/oscuro con ResizeObserver debounced | M3 | Survey (Exp 2 & 3) |
| F16 | Estado Vacío en ECharts | Visualización amigable cuando no hay compras pendientes | M3 | Survey (Exp 3) |
| F17 | Exportación JSON y CSV | Descarga estructurada con esquema versionado y CSV RFC 4180 con BOM UTF-8 | M4 | Survey (Exp 3) |
| F18 | Importación JSON y CSV | Validación estricta de estructura con opción de sobrescribir o combinar | M4 | Survey (Exp 3) |
| F19 | Atajos de Teclado (Enter / Escape) | Adición rápida con Enter y retorno de foco; cancelación de edición con Esc | M4 | Survey (Exp 3) |
| F20 | Diálogos Amigables y Undo Toast | Reemplazo de `confirm()` por SweetAlert2 y toast con botón Deshacer (6-8 seg) | M4 | Survey (Exp 1, 2, 3) |

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Suite (Dual Track) | Infraestructura y suite de pruebas integral (Tiers 1-4, ≥5 por feature, boundaries, pairwise, escenarios) | none | DONE (242 tests en TEST_READY.md) |
| M1 | Modularización y Persistencia Offline (R1) | Arquitectura modular JS, Store de estado, validaciones estrictas y LocalStorage offline-first | none | DONE (98 tests aprobados, CLEAN) |
| M2 | Experiencia UI/UX y Modo Oscuro (R2) | Maquetación mobile-first (360px+), tokens WCAG AA, persistencia de tema, touch targets 44px | M1 | IN_PROGRESS |
| M3 | Rendimiento y ECharts Adaptativo (R3) | Renderizado DOM granular, precisión en centavos, métricas (pendiente/gastado), ECharts responsive | M1, M2 | PLANNED |
| M4 | Enriquecimiento Funcional (R4) | Exportar/importar JSON/CSV, atajos de teclado Enter/Esc, SweetAlert2 y Toast Undo | M1, M2, M3 | PLANNED |
| M5 | Verificación Final y Hardening E2E | Aprobación 100% suite E2E (Tiers 1-4), pruebas adversariales Tier 5 y auditoría forense | E2E, M1-M4 | PLANNED |

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

interface StorageService {
  loadItems(): Promise<ShoppingItem[]>;
  saveItems(items: ShoppingItem[]): Promise<void>;
  loadBudget(): number;
  saveBudget(budget: number): void;
  loadTheme(): 'light' | 'dark' | null;
  saveTheme(theme: 'light' | 'dark'): void;
}
```

### Store (js/state.js) ↔ UI & Analytics
```typescript
interface FinancialMetrics {
  totalPending: number;   // Sum of (!completed) * qty * unitPrice
  totalSpent: number;     // Sum of (completed) * qty * unitPrice
  totalOverall: number;   // totalPending + totalSpent
  budget: number;
  budgetRemaining: number;
  budgetPercentage: number;
}

interface AnalyticsService {
  calculateMetrics(items: ShoppingItem[], budget: number): FinancialMetrics;
  getCategoryBreakdown(items: ShoppingItem[]): { [location: string]: { [category: string]: number } };
}
```

### Export/Import Contract (js/export-import.js)
```typescript
interface ExportPayload {
  version: '1.0';
  exportedAt: string; // ISO timestamp
  budget: number;
  items: ShoppingItem[];
}
```

## Code Layout
```
ListadeCompras-Git/
├── index.html                   # HTML semántico, accesible, sin estilos inline
├── style.css                    # Tokens CSS, responsive mobile-first (360px+), temas WCAG AA
├── js/
│   ├── state.js                 # Centralized reactive Store (Pub/Sub)
│   ├── storage.js               # Local-first persistence (LocalStorage + Firebase graceful sync)
│   ├── validation.js            # Input validation, sanitization (XSS prevention)
│   ├── analytics.js             # Financial and category metric calculations (integer cents)
│   ├── chart.js                 # Adaptive ECharts controller (dark/light, resize, tooltips)
│   ├── export-import.js         # JSON v1.0 and CSV (UTF-8 BOM) export & import
│   ├── ui-feedback.js           # SweetAlert2 dialogs and Undo Toast notification
│   └── app.js                   # Application bootstrap and event delegation
├── tests/                       # E2E & unit test suite
│   ├── e2e_runner.js            # Automated test runner
│   ├── tier1_features.test.js   # Feature coverage tests (>= 5 per feature)
│   ├── tier2_boundaries.test.js # Boundary & corner cases
│   ├── tier3_pairwise.test.js   # Cross-feature combinations
│   └── tier4_scenarios.test.js  # Real-world scenarios
├── TEST_INFRA.md                # Test architecture and coverage tracking
├── TEST_READY.md                # Test suite completion signal
└── PROJECT.md                   # Global architectural specification and roadmap
```
