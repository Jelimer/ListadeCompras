# Infraestructura y Metodología de Pruebas — "Lista de Compra | PRO"

Documento maestro de referencia para la infraestructura de pruebas automatizadas, arquitectura de ejecución, metodología **Dual Track** (Category-Partition, BVA, Pairwise y Workload Testing) y catálogo integral de pruebas para la aplicación web **Lista de Compra | PRO**.

---

## 1. Arquitectura de Pruebas y Test Runner

La infraestructura de pruebas del proyecto está construida bajo los principios de **independencia total, ejecución ultrarrápida y cero dependencias pesadas de navegador externo**. Utiliza el motor nativo de aserciones de Node.js (`node:assert`) y una suite de emulación DOM modular (`tests/mock_dom.js`).

```
ListadeCompras-Git/
├── tests/
│   ├── e2e_runner.js                       # Runner CLI histórico (F01-F20) (242 tests)
│   ├── mock_dom.js                         # Emulador DOM en memoria (DOMDocument, LocalStorage, ECharts, Leaflet, Geolocation, Fetch)
│   ├── spec_helper.js                      # Oráculos matemáticos canónicos (centavos enteros, anti-XSS, CSV RFC 4180, WCAG AA)
│   ├── tier1_features.test.js              # Tier 1 histórico: Cobertura F01-F20 (106 tests)
│   ├── tier2_boundaries.test.js            # Tier 2 histórico: Casos límite y esquinas F01-F20 (104 tests)
│   ├── tier3_pairwise.test.js              # Tier 3 histórico: Interacciones cruzadas F01-F20 (22 tests)
│   ├── tier4_scenarios.test.js             # Tier 4 histórico: Escenarios de usuario F01-F20 (10 tests)
│   ├── m1_unit.test.js                     # Pruebas unitarias de almacenamiento y Store M1 (86 tests)
│   ├── map_routing.test.js                 # Suite de Mapa y TSP F22-F28, F30 (60 tests)
│   ├── script_lifecycle.test.js            # Ciclo de vida y reactividad selectiva en script.js (24 tests)
│   ├── adversarial_reactivity_stress.test.js # Estrés de debounce, DOM diffing y renderizado selectivo (18 tests)
│   ├── adversarial_challenger2_m1.test.js  # Delegación de eventos, SortableJS y assets de red (16 tests)
│   └── pwa_share_lazy.test.js              # NUEVA SUITE: PWA Offline, ResourceLoader, ShareModule (Tiers 1-4)
├── package.json                            # Orquestador npm test
├── TEST_INFRA.md                           # Especificación técnica y metodología Dual Track (este documento)
└── TEST_READY.md                           # Reporte formal de preparación de pruebas
```

### Componentes Clave del Arnés:
1. **`node:assert` Puro**: Motor de aserciones estricto (`strictEqual`, `deepStrictEqual`, `ok`, `match`, `throws`, `doesNotThrow`, `rejects`).
2. **`mock_dom.js`**:
   - Árbol DOM virtualizado (`DOMDocument`, `DOMElement`, `DOMEvent`, `DOMText`) con soporte de selectores (`querySelector`, `querySelectorAll`, `classList`, atributos).
   - Simulación de APIs web: `localStorage` aislado (`MockLocalStorage`), `navigator.onLine`, `navigator.geolocation` (`MockGeolocation`), `fetch` simulado con control de errores HTTP, `echarts`, `L` (Leaflet), `Swal` (SweetAlert2) y `lucide.createIcons`.
   - Soporte extendido para APIs PWA y Share: `navigator.serviceWorker` (inspección de registro seguro), `navigator.share` y `navigator.clipboard`.
3. **Oráculos de Especificación Canónicos**:
   - `ReferenceAnalytics`: Garantía de suma monetaria en centavos enteros para eliminar derivas IEEE 754.
   - `ReferenceMapRoute`: Algoritmo Haversine esférico, TSP Nearest Neighbor y formateo de waypoints Google Maps.
   - `ReferenceShareModule`: Algoritmo canónico de agrupación por comercios, cálculo de subtotales, viñetas de WhatsApp y orquestación de compartir en cascada.
   - `ReferenceResourceLoader`: Promisificación de inyección de scripts/hojas de estilo con deduplicación singleton y compatibilidad con objetos ya inyectados en memoria.
   - `ReferenceManifestValidator` & `ReferenceServiceWorkerValidator`: Validación estricta de esquemas PWA y eventos del Service Worker.

---

## 2. Metodología de Pruebas: Estándar Dual Track

La metodología **Dual Track** combina la rigurosidad analítica del diseño de casos de prueba con la verificación progresiva de interfaces y componentes en cuatro capas concéntricas (Tiers 1 a 4).

```
┌──────────────────────────────────────────────────────────────┐
│                    TIER 4: REAL-WORLD SCENARIOS              │
│    Jornadas de compra completas, flujos offline en tienda,  │
│    compartir listas complejas por WhatsApp y portapapeles    │
├──────────────────────────────────────────────────────────────┤
│              TIER 3: CROSS-FEATURE COMBINATIONS              │
│    Pairwise Testing: Offline + Formateador, Lazy Load       │
│    con librerías en memoria, conmutación selectiva de vistas │
├──────────────────────────────────────────────────────────────┤
│              TIER 2: BOUNDARY & CORNER CASES                 │
│    Boundary Value Analysis (BVA): Listas vacías, precios 0,  │
│    caracteres reservados en URI, entornos sin APIs nativas   │
├──────────────────────────────────────────────────────────────┤
│                TIER 1: FEATURE COVERAGE                      │
│    Category-Partition: >=5 pruebas de camino feliz y         │
│    equivalencia funcional por cada característica canónica   │
└──────────────────────────────────────────────────────────────┘
```

### 2.1 Category-Partition Method
Se descomponen las entradas del sistema en particiones disjuntas de equivalencia:
- **Estado de Red**: `{ Online, Offline, Transición Rápida Flapping }`.
- **Soporte de Plataforma**: `{ Con navigator.share, Sin navigator.share, Con clipboard.writeText, Sin clipboard (execCommand) }`.
- **Entorno Service Worker**: `{ Con navigator.serviceWorker, Sin navigator.serviceWorker (Node.js / navegadores legacy) }`.
- **Conjunto de Ítems de Compra**: `{ Vacío, 1 ítem sin precio, Múltiples ítems misma tienda, Múltiples tiendas, Todos completados, Parcialmente completados }`.
- **Carga de Recursos Pesados**: `{ Recurso nuevo no cargado, Recurso en proceso de carga (concurrente), Recurso ya disponible globalmente }`.

### 2.2 Boundary Value Analysis (BVA)
Se prueban los límites exactos de los dominios numéricos y textuales:
- **Precios**: `$0.00`, `$0.01`, decimales periódicos, enteros grandes `$99999.99`.
- **Cantidades**: `0`, `0.5`, `1`, `1.5 un.`, `100`.
- **Cadenas de texto**: String vacío `""`, solo espacios `"   "`, cadenas con caracteres URL reservados (`&`, `?`, `#`, `/`, `%`), emojis (`🛒`, `🍎`, `🧀`) y acentos (`ñ`, `á`, `ü`).
- **Límites de Waypoints en Mapas**: 0 tiendas, 1 tienda (trayecto directo), 9 tiendas (máximo sin truncar), 15 tiendas (recorte seguro a 9 waypoints).

### 2.3 Pairwise Testing
Se combinan estados ortogonales de subsistemas para detectar fallos de acoplamiento:
- `[Modo Offline] × [Formateador de Compras]`: Asegura que compartir funcione sin llamadas de red.
- `[Entorno sin navigator.share] × [Portapapeles Bloqueado]`: Asegura la apertura en enlace web de WhatsApp con notificación toast.
- `[Pestaña 'Stats'] × [window.echarts ya presente]`: Asegura resolución en 0 ms sin inyección duplicada de script.
- `[Pestaña 'Map'] × [window.L ya presente]`: Asegura invocación transparente de `invalidateSize()` y renderizado de paradas.

### 2.4 Workload & User Journeys (Tier 4)
Simulación de flujos de vida real de extremo a extremo:
- **Jornada de Supermercado Offline**: Usuario entra al comercio sin conexión (modo avión), añade artículos a la lista, tilda productos completados en tiempo real, verifica totales en pantalla y preserva datos locales.
- **Jornada de Compartir Multitienda**: Usuario arma lista para 3 comercios diferentes, presiona "Compartir", el formateador genera el recibo agrupado con subtotales y total general, y despacha a WhatsApp sin pérdida de caracteres especiales.

---

## 3. Instrucciones de Ejecución de Pruebas

### 3.1 Ejecutar toda la suite del proyecto
```bash
npm test
```
*Ejecuta en cadena todas las suites del proyecto: `e2e_runner.js`, `m1_unit.test.js`, `map_routing.test.js`, `script_lifecycle.test.js`, `adversarial_reactivity_stress.test.js`, `adversarial_challenger2_m1.test.js` y `pwa_share_lazy.test.js`.*

### 3.2 Ejecutar la nueva suite de PWA, Lazy Loading y Share
```bash
node tests/pwa_share_lazy.test.js
```

### 3.3 Ejecutar suites especializadas individuales
```bash
# Suite de Mapa y Enrutamiento TSP (60 tests)
node tests/map_routing.test.js

# Suite Unitarias de Persistencia M1 (86 tests)
node tests/m1_unit.test.js

# Suite de Ciclo de Vida y DOM (24 tests)
node tests/script_lifecycle.test.js

# Suite de Estrés de Reactividad y Debounce (18 tests)
node tests/adversarial_reactivity_stress.test.js

# Suite Challenger 2 de Delegación y Red (16 tests)
node tests/adversarial_challenger2_m1.test.js

# Suite Base E2E F01-F20 (242 tests)
node tests/e2e_runner.js
```

---

## 4. Catálogo Detallado de Pruebas: Nueva Suite `tests/pwa_share_lazy.test.js`

La nueva suite `tests/pwa_share_lazy.test.js` cubre integralmente los nuevos requerimientos R1, R2 y R3 de acuerdo con la división en 4 Tiers:

### Tier 1: Cobertura por Característica (Feature Coverage — ≥5 tests por feature)

#### Feature 1: Manifiesto PWA (`manifest.json` y metadatos)
- `T1_F01_1`: `manifest.json` sintácticamente válido (`JSON.parse` sin errores).
- `T1_F01_2`: Presencia de metadatos de identidad obligatorios (`name: "Lista de Compra | PRO"`, `short_name: "Lista Compra"`).
- `T1_F01_3`: Configuración de experiencia de instalación (`display: "standalone"`, `start_url`, `scope`).
- `T1_F01_4`: Definición de paleta de colores de sistema (`theme_color`, `background_color`).
- `T1_F01_5`: Iconos PWA definidos con resoluciones estándar (192x192, 512x512 PNG y/o SVG vectorial).
- `T1_F01_6`: Enlace `<link rel="manifest" href="manifest.json">` y `<meta name="theme-color">` presentes en `index.html`.

#### Feature 2: Service Worker (`sw.js` y ciclo de vida de caché)
- `T1_F02_1`: Estructura y sintaxis válida de `sw.js`.
- `T1_F02_2`: Manejo del evento `install` con apertura de caché versionada (`caches.open`) y precacheo de recursos críticos.
- `T1_F02_3`: Manejo del evento `activate` con purga de cachés antiguas (`caches.keys`, `caches.delete`) y `clients.claim()`.
- `T1_F02_4`: Intercepción del evento `fetch` para resolución offline.
- `T1_F02_5`: Estrategia Cache-First / Stale-While-Revalidate con `{ ignoreSearch: true }` para resistir parámetros de versión (`?v=2.4.0`).

#### Feature 3: Cargador Asíncrono Bajo Demanda (`ResourceLoader`)
- `T1_F03_1`: Módulo `ResourceLoader` expone API estándar (`loadScript`, `loadStyle`, `loadECharts`, `loadLeaflet`).
- `T1_F03_2`: `loadScript(url, options)` crea nodo `<script>`, asigna atributos y resuelve al completar.
- `T1_F03_3`: `loadStyle(url, options)` crea nodo `<link rel="stylesheet">` y resuelve al cargar.
- `T1_F03_4`: Soporte de Subresource Integrity (`integrity`, `crossOrigin: "anonymous"`) en inyección dinámica.
- `T1_F03_5`: Singleton y memoización de promesas: múltiples llamadas al mismo URL reutilizan la misma promesa sin inyectar nodos duplicados.
- `T1_F03_6`: `loadECharts()` y `loadLeaflet()` cargan las dependencias oficiales correspondientes bajo demanda.

#### Feature 4: Formateador de Compras (`ShareModule.formatShoppingList`)
- `T1_F04_1`: Agrupación lógica de artículos por tienda/comercio (`location`) con cabeceras `🏪 *Tienda*`.
- `T1_F04_2`: Formato legible de artículos con viñetas, cantidades (`2x`, `1.5 un. x`), nombre de producto y precios.
- `T1_F04_3`: Cálculo y formateo de subtotales estimados por cada comercio.
- `T1_F04_4`: Cálculo exacto del total general en centavos enteros (`Math.round(price * 100) * qty`) eliminando desvíos IEEE 754.
- `T1_F04_5`: Exclusión por defecto de artículos completados (`includeCompleted: false`) o inclusión con viñeta `[✓]`.

#### Feature 5: Compartir en Cascada (`ShareModule.shareList`)
- `T1_F05_1`: Invocación de `navigator.share` nativo en dispositivos móviles compatibles retornando `{ success: true, method: 'native' }`.
- `T1_F05_2`: Manejo silencioso de cancelación voluntaria del usuario (`AbortError`) sin romper la aplicación.
- `T1_F05_3`: Fallback automático a URL universal de WhatsApp (`https://api.whatsapp.com/send?text=...`) con codificación URI estricta.
- `T1_F05_4`: Fallback de portapapeles con `navigator.clipboard.writeText(text)` (y fallback defensivo con `document.execCommand('copy')`).
- `T1_F05_5`: Notificación visual de confirmación al usuario tras compartir exitosamente.

---

### Tier 2: Boundary & Corner Cases (≥5 tests por área)

#### Área B1: Casos Extremos de Formateo y WhatsApp URL
- `T2_B01_1`: Lista completamente vacía (`items = []`) retorna mensaje amigable (`🛒 Tu lista de compras está vacía.`).
- `T2_B01_2`: Productos con precio en cero o indefinido no muestran `$0.00` ni distorsionan subtotales.
- `T2_B01_3`: Manejo de cantidades fraccionarias (ej: `0.75 kg`, `1.5 un.`) sin redondeo truncado.
- `T2_B01_4`: Preservación y codificación segura en WhatsApp URL de caracteres especiales, emojis (`🍎`, `🥩`), comillas, ampersands y saltos de línea.
- `T2_B01_5`: Artículos sin tienda especificada (`location: null`, `""` o espacios) se agrupan ordenadamente en `'General'`.

#### Área B2: Resiliencia en Entornos sin `navigator.serviceWorker`
- `T2_B02_1`: Entornos Node.js o navegadores sin `navigator.serviceWorker` arrancan con 0 excepciones.
- `T2_B02_2`: Función defensiva `registerServiceWorker()` valida existencia de la API antes de invocarla.
- `T2_B02_3`: Rechazo de promesa en registro de Service Worker es capturado limpiamente sin crash global.
- `T2_B02_4`: Ausencia de `window.location` en arnés de pruebas no impide la ejecución de scripts.
- `T2_B02_5`: La funcionalidad de almacenamiento offline-first (`localStorage`) opera independientemente del Service Worker.

#### Área B3: Resiliencia en Entornos sin `navigator.share`
- `T2_B03_1`: Navegadores de escritorio sin Web Share API ejecutan el fallback a WhatsApp sin arrojar `TypeError`.
- `T2_B03_2`: Si el portapapeles rechaza por permisos o contexto HTTP, se intenta `document.execCommand('copy')` con textarea oculto.
- `T2_B03_3`: Bloqueo de ventanas emergentes en `window.open` preserva la copia en portapapeles y retorna estado exitoso.
- `T2_B03_4`: Lista con todos los artículos completados y `includeCompleted: false` informa que no hay pendientes sin abrir WhatsApp innecesariamente.
- `T2_B03_5`: Invocación simultánea de compartir no genera colisiones ni listeners duplicados.

#### Área B4: Conectividad y Badge de Red (`#networkStatusBadge`)
- `T2_B04_1`: Despacho de evento `offline` en `window` actualiza el badge a clase `.offline` y texto 'Modo Offline'.
- `T2_B04_2`: Despacho de evento `online` en `window` restaura el badge a clase `.online` y texto 'Online'.
- `T2_B04_3`: Estado inicial según `navigator.onLine` falso arranca con badge en modo offline.
- `T2_B04_4`: Ausencia del nodo `#networkStatusBadge` en DOM es tolerada defensivamente sin errores de referencia.
- `T2_B04_5`: Conmutaciones sucesivas (online -> offline -> online -> offline) mantienen la reactividad sin desincronización.

---

### Tier 3: Combinaciones Cruzadas (Cross-Feature Combinations)

- `T3_C01`: **Formateo y exportación en Modo Offline**: Generación íntegra de texto de compras y URL de WhatsApp con el badge de red en estado offline.
- `T3_C02`: **Resolución inmediata de ResourceLoader en memoria**: Invocación de `ResourceLoader.loadECharts()` cuando `window.echarts` ya existe resuelve de forma síncrona/instantánea sin peticiones de red ni nodos DOM adicionales.
- `T3_C03`: **Resolución inmediata de Leaflet en memoria**: Invocación de `ResourceLoader.loadLeaflet()` cuando `window.L` ya existe resuelve de forma inmediata sin insertar `<script>` ni `<link>` duplicados.
- `T3_C04`: **Conmutación selectiva a 'stats' con carga diferida**: Acceso por primera vez a estadísticas dispara la carga asíncrona y memoriza la instancia.
- `T3_C05`: **Conmutación selectiva a 'map' con carga diferida**: Acceso por primera vez a ruta en mapa dispara la carga de Leaflet preservando la geometría TSP.
- `T3_C06`: **Persistencia Store + Compartir**: Añadir productos con tienda nueva refleja de inmediato el nuevo grupo en el texto formateado para compartir.

---

### Tier 4: Escenarios de Usuario del Mundo Real (Workload Journeys)

- `T4_S01`: **Jornada de Supermercado 100% Offline**:
  1. El dispositivo pierde la conexión (evento `offline`, badge cambia a offline).
  2. El usuario crea 3 productos repartidos en 2 comercios.
  3. Marca 1 producto como completado en el pasillo del supermercado.
  4. Los datos persisten en `localStorage`, las métricas universales se recalculan correctamente y el mapa mantiene los pines cacheados sin conexión.
- `T4_S02`: **Jornada de Compartir Multitienda por WhatsApp**:
  1. El usuario tiene una lista activa con 5 artículos en 3 tiendas ("Supermercado", "Farmacia", "Verdulería").
  2. Presiona `#shareButton`.
  3. El formateador genera el recibo con viñetas, subtotales por comercio y gran total en centavos exactos.
  4. La cascada despacha al enlace universal de WhatsApp codificando caracteres especiales y copia el texto al portapapeles.

---

## 5. Resumen Consolidado de Suites del Proyecto

| Suite de Pruebas | Archivo | Cantidad de Tests | Enfoque Principal |
|------------------|---------|-------------------|-------------------|
| **E2E Core Base** | `tests/e2e_runner.js` | **242** | Arquitectura base F01-F20 (Tiers 1, 2, 3 y 4) |
| **Unitarias M1** | `tests/m1_unit.test.js` | **86** | Persistencia offline-first, Store reactivo, StorageService |
| **Mapa & Enrutamiento TSP** | `tests/map_routing.test.js` | **60** | Geocodificación, Haversine, Nearest Neighbor, Google Maps URL |
| **Ciclo de Vida script.js** | `tests/script_lifecycle.test.js` | **24** | DOMContentLoaded, listeners, conmutación de vistas |
| **Estrés de Reactividad** | `tests/adversarial_reactivity_stress.test.js` | **18** | Debounce de búsqueda, renderizado granular, no-op en tabs inactivas |
| **Challenger 2 M1** | `tests/adversarial_challenger2_m1.test.js` | **16** | Delegación de eventos, SortableJS único, Lucide scoping, assets de red |
| **PWA, Lazy Load & Share** | `tests/pwa_share_lazy.test.js` | **50+** | Service Worker, Manifest, ResourceLoader, ShareModule, Offline badge |
| **TOTAL CONSOLIDADO** | **Toda la suite** | **≥ 496 tests** | **100% automatizado, 0 dependencias externas, ejecución < 4 segundos** |
