# Project: Lista de Compra | PRO - PWA, Lazy Loading, Share/Print & Offline Resilience

## Architecture
- **Frontend Core**: Vanilla JavaScript (ES6+), HTML5 semántico, CSS3 modular con variables y diseño responsivo.
- **PWA & Offline Shell**: `manifest.json` para metadatos de instalación, `icons/` para iconos temáticos, y Service Worker (`sw.js`) con estrategia Stale-While-Revalidate para activos locales y Cache-First / Runtime Caching para CDNs.
- **On-Demand Resource Loader**: Módulo `js/resource-loader.js` (UMD) para cargar dinámicamente Apache ECharts y Leaflet bajo demanda con deduplicación por singleton de promesas y soporte SRI.
- **Sharing & Print Subsystem**: Módulo `js/share.js` (UMD) con algoritmo de formato por comercios, API cascada (`navigator.share` -> WhatsApp Web -> Portapapeles -> Toast), y reglas de medios `@media print` en `style.css`.
- **Testing Architecture**: Suite basada en `node:assert` puro en Node.js con emulación DOM en `tests/mock_dom.js`, ampliada con `tests/pwa_share_lazy.test.js`.

## Code Layout
```
/
├── index.html                  # Shell principal de la aplicación, metadatos PWA y enlaces lazy
├── style.css                   # Estilos visuales, badges de conectividad y reglas @media print
├── script.js                   # Controlador de ciclo de vida UI, navegación y conmutación de vistas
├── manifest.json               # Manifiesto de aplicación web progresiva (PWA)
├── sw.js                       # Service Worker con caché offline (SWR y Cache-First)
├── icons/                      # Iconos vectoriales y mapas de bits para PWA
│   ├── icon.svg
│   ├── icon-192.png
│   └── icon-512.png
├── js/
│   ├── state.js                # Gestión reactiva de estado y persistencia
│   ├── storage.js              # Capa de almacenamiento offline-first y sincronización
│   ├── chart.js                # Controlador de visualizaciones financieras con ECharts
│   ├── map-route.js            # Algoritmos de ruteo TSP y controlador de mapas Leaflet
│   ├── resource-loader.js      # Cargador dinámico asíncrono para librerías pesadas
│   └── share.js                # Formateador de compras y orquestador de compartir
├── tests/
│   ├── mock_dom.js             # Entorno simulado de navegador para Node.js
│   ├── e2e_runner.js           # Ejecutor principal de pruebas
│   ├── pwa_share_lazy.test.js  # Nueva suite de pruebas para PWA, Lazy Loading y Share
│   └── ...                     # Suites preexistentes (446 pruebas)
└── vercel.json                 # Configuración de despliegue en Vercel
```

## Feature Inventory
Every feature from the Survey phase appears here with its assigned milestone:
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F01 | Web Manifest | `manifest.json` con metadatos PWA (name, short_name, theme_color, background_color, display standalone, start_url) | M1 | survey_explorer_2 |
| F02 | Iconos PWA | Iconos temáticos vectoriales y PNG (`icon.svg`, `icon-192.png`, `icon-512.png`) | M1 | survey_explorer_2 |
| F03 | Enlace PWA en HTML | Enlace `<link rel="manifest">` y `<meta name="theme-color">` en `index.html` | M1 | survey_explorer_2 |
| F04 | Service Worker Cache | `sw.js` con estrategia Stale-While-Revalidate para activos locales y Cache-First para CDNs externos | M1 | survey_explorer_2 |
| F05 | Registro Seguro SW | Registro en `script.js` con guardas defensivas para evitar excepciones en Node.js y navegadores antiguos | M1 | survey_explorer_2 |
| F06 | Indicador Conectividad | Detección online/offline en tiempo real y componente visual `#networkStatusBadge` (WCAG AA) | M1 | survey_explorer_2 |
| F07 | Desacoplamiento CDN | Retiro de etiquetas bloqueantes `<script>` y `<link>` de ECharts y Leaflet en `index.html` manteniendo `preconnect` | M2 | survey_explorer_1 |
| F08 | Resource Loader | Módulo UMD `js/resource-loader.js` con promesas, singleton y SRI para cargar scripts y CSS | M2 | survey_explorer_1 |
| F09 | Lazy Loading ECharts | Carga bajo demanda de ECharts al acceder a "Estadísticas Financieras" con indicador visual de carga | M2 | survey_explorer_1 |
| F10 | Lazy Loading Leaflet | Carga bajo demanda de Leaflet al acceder a "Ruta en Mapa" o "Seleccionar en mapa" | M2 | survey_explorer_1 |
| F11 | Compatibilidad Tests Node | Inicialización inmediata si `window.echarts` o `window.L` ya están presentes en memoria | M2 | survey_explorer_1 |
| F12 | Formateador de Compras | Módulo `js/share.js` para texto formateado por tiendas con cantidades, precios y subtotales | M3 | survey_spec_miner_3 |
| F13 | Botón Compartir en Cascada | Botón `#shareButton` con `navigator.share`, fallback a WhatsApp web, portapapeles y toast | M3 | survey_spec_miner_3 |
| F14 | Botón Imprimir | Botón `#printButton` en cabecera para disparar `window.print()` | M3 | survey_spec_miner_3 |
| F15 | Reglas `@media print` | Ocultar botones/interacciones, forzar blanco/negro puro, desplegar tiendas y evitar cortes de página | M3 | survey_spec_miner_3 |
| F16 | Suite de Pruebas PWA/Lazy/Share | `tests/pwa_share_lazy.test.js` con aserciones formales para todas las nuevas capacidades | M4 | survey_spec_miner_3 |
| F17 | Enlace en package.json | Incorporar la nueva suite al comando `npm test` | M4 | survey_spec_miner_3 |
| F18 | Mantenimiento Cero Regresiones | 100% de éxito en las 446 pruebas existentes + nuevas pruebas (>460 pruebas aprobadas) | M4 | survey_spec_miner_3 |
| F19 | Despliegue Git en Master | Commit estructurado y `git push origin master` para despliegue automático en Vercel | M4 | parent_orchestrator |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | PWA & Service Worker Offline Resilience | F01, F02, F03, F04, F05, F06 | none | DONE |
| M2 | Lazy Loading ECharts & Leaflet | F07, F08, F09, F10, F11 | M1 | DONE |
| M3 | WhatsApp Share & Clean Print/PDF CSS | F12, F13, F14, F15 | M2 | DONE |
| M4 | Test Suite Expansion, Zero Regressions & Git Deploy | F16, F17, F18, F19 | M3 | DONE |

## Interface Contracts
### PWA / Connectivity Contract
- Elemento DOM: `<div id="networkStatusBadge" class="network-badge online" role="status" aria-live="polite">`
- Eventos escuchados: `window.addEventListener('online', ...)`, `window.addEventListener('offline', ...)`
- Registro SW: `navigator.serviceWorker.register('/sw.js', { scope: '/' })` dentro de guarda `if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof navigator.serviceWorker.register === 'function')`

### ResourceLoader Contract (`js/resource-loader.js`)
- `ResourceLoader.loadScript(url, options = {}) -> Promise<HTMLScriptElement>`
- `ResourceLoader.loadStyle(url, options = {}) -> Promise<HTMLLinkElement>`
- `ResourceLoader.loadECharts() -> Promise<echarts>`
- `ResourceLoader.loadLeaflet() -> Promise<L>`
- Retorna resolución síncrona si `(typeof window !== 'undefined' && (window.echarts || window.L))` ya existen.

### ShareModule Contract (`js/share.js`)
- `ShareModule.formatShoppingList(items, options = {}) -> string`
- `ShareModule.shareList(items, options = {}) -> Promise<{ success: boolean, method: string }>`
- Botón DOM: `#shareButton` y `#printButton` en `.header-actions`.
