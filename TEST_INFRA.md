# Infraestructura y Suite de Pruebas E2E — "Lista de Compra | PRO"

Documento de referencia para la ejecución, arquitectura, metodología y catálogo de pruebas E2E y unitarias automatizadas para la aplicación web **Lista de Compra | PRO**.

---

## 1. Arquitectura de Pruebas y Test Runner

La infraestructura de pruebas ha sido diseñada para ser **100% autónoma, ultrarrápida y libre de dependencias externas pesadas** (como navegadores completos, drivers nativos o compiladores C++). Toda la suite se ejecuta de forma nativa en Node.js mediante un motor de ejecución a medida y un simulador de DOM (`mock_dom.js`).

```
ListadeCompras-Git/
├── tests/
│   ├── e2e_runner.js            # Runner CLI con aserciones, reporting ANSI y filtros por Tier (242 tests)
│   ├── mock_dom.js              # Entorno DOM liviano, eventos, LocalStorage, ECharts, Leaflet, Geolocation y Fetch
│   ├── spec_helper.js           # Oráculos matemáticos, sanitización XSS y contratos de interface
│   ├── tier1_features.test.js   # Tier 1: Cobertura por característica F01-F20 (106 tests)
│   ├── tier2_boundaries.test.js # Tier 2: Casos límite y esquinas F01-F20 (104 tests)
│   ├── tier3_pairwise.test.js   # Tier 3: Interacciones cruzadas por pares F01-F20 (22 tests)
│   ├── tier4_scenarios.test.js  # Tier 4: Escenarios de usuario del mundo real F01-F20 (10 tests)
│   ├── m1_unit.test.js          # Pruebas unitarias de almacenamiento y estado M1 (86 tests)
│   └── map_routing.test.js      # Suite de Mapa y Optimizador de Rutas F22-F28, F30 (60 tests)
├── package.json                 # Script "test" orquestador de las 388 pruebas
├── TEST_INFRA.md                # Esta documentación técnica
└── TEST_READY.md                # Declaración formal de preparación de suite
```

### Componentes Clave:
1. **`tests/e2e_runner.js`**:
   - Soporte de suite y casos de prueba con `describe()`, `test()`, `it()`, `beforeEach()`, `afterEach()`.
   - Motor de aserciones enriquecido (`strictEqual`, `deepStrictEqual`, `throws`, `doesNotThrow`, `match`, `closeTo`, `includes`).
   - Salida formateada en consola con colores ANSI, tiempos de ejecución por test y tabla resumen por Tiers.
   - Modos de ejecución flexibles por flags de línea de comandos.

2. **`tests/mock_dom.js`**:
   - Implementación completa de árbol DOM en memoria (`DOMDocument`, `DOMElement`, `DOMText`, `DOMEvent`).
   - Parsers HTML y fragmentos con soporte de jerarquías de selectores (`#id`, `.class`, `tag`, `[attr]`).
   - Almacenamiento local aislado (`MockLocalStorage`) conforme a la especificación W3C Web Storage con soporte de cuota configurable y evento `storage`.
   - Emulación de APIs de navegador: `window.matchMedia`, `window.ResizeObserver`, `Blob`, `FileReader`, `URL.createObjectURL`.
   - **Mocks y Stubs Visuales y de Geoinformación**:
     * **Leaflet.js Mock (`createMockLeaflet`)**: Simula `L.map`, `L.tileLayer`, `L.marker`, `L.polyline`, `L.divIcon`, `L.popup`, `L.latLng`, `L.latLngBounds`. Implementa métodos esenciales como `invalidateSize()`, `distanceTo()` con fórmula Haversine, `addTo()`, `bindPopup()`, `openPopup()`, `closePopup()`, `eachLayer()`, `fitBounds()`, `setView()`.
     * **Geolocation API Mock (`MockGeolocation`)**: Emula `navigator.geolocation.getCurrentPosition()`, `watchPosition()` y `clearWatch()`, con inyección de coordenadas arbitrarias (`__setMockPosition`) y simulación controlada de errores W3C (`__setMockError` con códigos 1 = Denied, 2 = Unavailable, 3 = Timeout).
     * **Fetch Mock para Geocodificación (`createMockFetch`)**: Emula peticiones HTTP a proveedores OSM (Nominatim) y Komoot (Photon), con soporte para respuestas exitosas, 429 Too Many Requests, 500 Server Error y Network Error, rastreo de invocaciones (`getCalls()`) y soporte para `AbortController`.
     * **Apache ECharts** (`init`, `setOption`, `resize`, `clear`), **SweetAlert2** (`Swal.fire`) y **Lucide Icons** (`createIcons`).

3. **`tests/spec_helper.js`**:
   - **`ReferenceAnalytics`**: Oráculo de cálculo aritmético monetario en centavos enteros para eliminar el desvío IEEE 754.
   - **`ReferenceValidation`**: Validador estricto y función de sanitización y escape HTML anti-XSS (`escapeHtml`).
   - **`ReferenceExportImport`**: Validador y generador de payloads JSON v1.0 y CSV RFC 4180 con BOM UTF-8 (`\uFEFF`).
   - **`ReferenceWCAG`**: Motor matemático de luminancia relativa y ratio de contraste de color conforme a WCAG AA (4.5:1).

4. **`tests/map_routing.test.js`**:
   - Suite especializada para los requerimientos R1, R2, R3, R4 del módulo de mapas interactivos y optimización de rutas (F22 a F28, F30).
   - Estructurada en 4 capas rigurosas (Tier 1 a Tier 4), sumando 60 casos de prueba independientes con oráculos matemáticos de Haversine, sinuosidad urbana 1.25, velocidad 30 km/h, algoritmo heurístico TSP (Nearest Neighbor), y oráculo de URLs de Google Maps con límite de 9 waypoints intermedios.

---

## 2. Instrucciones de Ejecución

Para ejecutar la suite completa o suites/tiers individuales:

### Ejecutar todas las pruebas del proyecto (388 tests):
```bash
npm test
```
*Ejecuta en secuencia: `tests/e2e_runner.js` (242 tests), `tests/m1_unit.test.js` (86 tests) y `tests/map_routing.test.js` (60 tests).*

### Ejecutar exclusivamente la suite de Mapa y Enrutamiento (60 tests):
```bash
node tests/map_routing.test.js
```

### Ejecutar exclusivamente las pruebas unitarias M1 (86 tests):
```bash
node tests/m1_unit.test.js
```

### Ejecutar la suite E2E general F01-F20 (242 tests):
```bash
node tests/e2e_runner.js
```

### Ejecutar E2E general por Tier específico:
```bash
node tests/e2e_runner.js --tier=1   # Solo Tier 1 (Cobertura F01-F20)
node tests/e2e_runner.js --tier=2   # Solo Tier 2 (Casos Límite y Esquinas)
node tests/e2e_runner.js --tier=3   # Solo Tier 3 (Combinaciones Cruzadas)
node tests/e2e_runner.js --tier=4   # Solo Tier 4 (Escenarios de Usuario)
```

### Filtrar pruebas por nombre o característica en el runner E2E:
```bash
node tests/e2e_runner.js --filter="F01"
node tests/e2e_runner.js --filter="XSS"
node tests/e2e_runner.js --filter="Presupuesto"
```

---

## 3. Desglose de Capas de Pruebas: F01 a F20 (242 tests)

### Tier 1: Cobertura por Característica (106 tests)
Garantiza que cada una de las 20 características arquitectónicas (F01-F20) definidas en `PROJECT.md` cuente con al menos 5 pruebas de camino feliz y equivalencia:

| Feature | Descripción | Tests | Cobertura Clave |
|---------|-------------|-------|-----------------|
| **F01** | LocalStorage Offline-First | 6 | Persistencia inmediata, recuperación sin red, guardado de presupuesto, borrado atómico, resiliencia ante JSON corrupto, orden de ubicaciones. |
| **F02** | Sincronización Opcional Firebase | 5 | Carga limpia sin crash cuando Firebase no está definido, adaptador try/catch seguro, estado offline/online, timestamps. |
| **F03** | Estado Centralizado y Eventos | 5 | Patrón Pub/Sub, inmutabilidad de estado, desuscripción sin fugas, filtros centralizados, borrado por lotes. |
| **F04** | Validaciones Numéricas y Lógicas | 6 | Precios >= 0, cantidades > 0, nombres no vacíos, categoría por defecto 'General', ubicación por defecto 'General', rechazo de NaN. |
| **F05** | Prevención de Inyección XSS | 5 | Sanitización de `<script>`, atributos `onerror`/`onload`, escape de entidades HTML, inserción DOM segura, sanitización en búsqueda. |
| **F06** | Paleta de Tokens WCAG AA | 5 | Variables CSS `:root`, ratio contraste en Modo Claro > 4.5:1, ratio contraste en Modo Oscuro > 4.5:1, consistencia de tokens. |
| **F07** | Modo Oscuro Persistente | 5 | Alternancia `data-theme`, persistencia en LocalStorage, inicialización respetando preferencia, `prefers-color-scheme`, botón toggle. |
| **F08** | Layout Mobile-First (desde 360px) | 6 | Viewport meta tag, detección de `minmax(340px, 1fr)`, grid responsive, inputs fluidos, max-width container, gap en formulario. |
| **F09** | Touch Targets Accesibles (44px) | 6 | Botón tema >= 44px, botón añadir accesible, botón reset, inputs con padding táctil, switch label, separación entre botones. |
| **F10** | Avatares Locales SVG / Lucide | 5 | Lucide disponible, iconos por categoría, fallback a package, iconos decorativos en inputs, renderizado offline sin LoremFlickr. |
| **F11** | Renderizado DOM Granular | 6 | Adición quirúrgica de nodos, mutación de clase completed, borrado individual, grupos por ubicación, preservación de foco, id inmutable. |
| **F12** | Precisión Aritmética de Centavos | 5 | Prevención error IEEE 754 0.1+0.2, multiplicación de decimales, redondeo de fracciones al centavo, suma masiva de 100 items, presupuesto restante. |
| **F13** | Segregación de Métricas | 5 | Cálculo de `totalPending`, `totalSpent`, `totalOverall`, saldo `budgetRemaining`, porcentaje sin división por cero. |
| **F14** | ECharts Adaptativo y Responsive | 6 | Contenedor categoryChart, inicialización ECharts, tooltip `confine: true`, `barMaxWidth`, método `resize`, listeners on/off. |
| **F15** | Sincronización Tema ECharts | 5 | Tooltip en modo oscuro, tooltip en modo claro, debounce en ResizeObserver, reciclaje de instancia, contraste de series. |
| **F16** | Estado Vacío en ECharts | 5 | Limpieza con `clear()` sin items, categorías vacías al completar todo, ausencia de NaN, reactivación al añadir item, transición a vacío. |
| **F17** | Exportación JSON y CSV | 5 | Esquema JSON v1.0 e ISO date, campos de ShoppingItem, CSV RFC 4180 (escapado comas/comillas), BOM UTF-8 `\uFEFF`, Blob y ObjectURL. |
| **F18** | Importación JSON y CSV | 5 | Validación de esquema v1.0, rechazo de versiones inválidas, parseo CSV con comillas, modo Merge, filtrado de filas corruptas. |
| **F19** | Atajos de Teclado (Enter / Escape) | 5 | Enter en itemInput agrega producto, retorno automático de foco, Escape cancela edición, Enter en cantidad, navegación Tab libre. |
| **F20** | Diálogos Amigables y Undo Toast | 5 | SweetAlert2 en vez de `window.confirm`, cancelación preserva lista, snapshot de Undo, restauración con Deshacer, expiración de toast. |

### Tier 2: Casos Límite y Esquinas (104 tests)
- **B1**: Precios numéricos extremos (15 tests).
- **B2**: Cantidades numéricas extremas (15 tests).
- **B3**: Cadenas de texto y nombres límite (15 tests).
- **B4**: Presupuesto financiero límite (14 tests).
- **B5**: Inyecciones de seguridad y XSS (15 tests).
- **B6**: Archivos de importación corruptos (15 tests).
- **B7**: Estrés de almacenamiento y concurrencia (15 tests).

### Tier 3: Combinaciones Entre Características (22 tests)
Interacciones cruzadas P01 a P22 (Store, LocalStorage, ECharts, XSS, Undo, etc.).

### Tier 4: Escenarios de Usuario del Mundo Real (10 tests)
Escenarios de jornada completa S01 a S10.

---

## 4. Desglose de Suite Mapa y Optimizador de Rutas: F22-F28, F30 (60 tests)

El archivo `tests/map_routing.test.js` implementa 60 pruebas rigurosas organizadas en 4 capas según los requerimientos R1, R2, R3 y R4:

### Tier 1: Cobertura por Característica (40 tests — 5 tests por feature)
- **F22: Marcadores y Popups de Comercio (5 tests)**
  * `T1_F22_1`: Renderizado de marcadores para cada comercio con productos pendientes.
  * `T1_F22_2`: Exclusión de comercios donde todos los productos están completados.
  * `T1_F22_3`: Popup contiene la lista de ítems pendientes y sus cantidades.
  * `T1_F22_4`: Popup calcula el subtotal monetario con precisión entera de centavos.
  * `T1_F22_5`: Apertura y cierre de popups en MockLeaflet preserva el estado de capas.
- **F23: Geocodificación Defensiva (5 tests)**
  * `T1_F23_1`: Geocodificación exitosa con Nominatim retorna lat, lon y displayName.
  * `T1_F23_2`: Fallback transparente a Photon cuando Nominatim retorna 429 Too Many Requests.
  * `T1_F23_3`: Manejo defensivo cuando ambos servicios fallan sin lanzar excepción no capturada.
  * `T1_F23_4`: Debounce y cancelación de peticiones con AbortController.
  * `T1_F23_5`: Rechazo de entradas vacías o caracteres no imprimibles sin llamada a red.
- **F24: Persistencia y Caché Local de Coordenadas (5 tests)**
  * `T1_F24_1`: Persistencia de coordenadas en LocalStorage bajo clave `shopping_store_coords`.
  * `T1_F24_2`: La segunda consulta a una tienda previamente geocodificada usa caché (0 llamadas de red).
  * `T1_F24_3`: Normalización de nombres de tienda para búsqueda en caché (espacios, mayúsculas).
  * `T1_F24_4`: Cada registro de coordenadas incluye timestamp de actualización.
  * `T1_F24_5`: Guardado manual de coordenadas sobrescribe o actualiza la entrada existente.
- **F25: Origen y Geolocalización GPS (5 tests)**
  * `T1_F25_1`: Obtención de posición de origen mediante `navigator.geolocation.getCurrentPosition`.
  * `T1_F25_2`: Manejo de error de permisos GPS (`PERMISSION_DENIED = 1`) degradando suavemente.
  * `T1_F25_3`: Fallback a ingreso manual de dirección de salida.
  * `T1_F25_4`: Persistencia del punto de partida en `shopping_route_origin`.
  * `T1_F25_5`: Modificación del origen recalcula la distancia y tiempo estimado.
- **F26: Estimación Haversine, Sinuosidad y Tiempo de Viaje (5 tests)**
  * `T1_F26_1`: Cálculo exacto de Haversine contra coordenadas de referencia conocidas (lat/lon).
  * `T1_F26_2`: Distancia cero entre dos coordenadas exactamente idénticas.
  * `T1_F26_3`: Aplicación exacta del factor de sinuosidad urbana 1.25.
  * `T1_F26_4`: Estimación de tiempo a 30 km/h: 15 km = 30 minutos.
  * `T1_F26_5`: Mínimo de 1 minuto para distancias mayores a cero.
- **F27: Optimizador de Rutas TSP (Nearest Neighbor) (5 tests)**
  * `T1_F27_1`: Algoritmo Nearest Neighbor ordena secuencialmente por proximidad.
  * `T1_F27_2`: Minimización de distancia total acumulada frente a orden arbitrario.
  * `T1_F27_3`: Con 0 tiendas pendientes retorna ruta vacía con 0 km y 0 minutos.
  * `T1_F27_4`: Con 1 sola tienda retorna trayecto directo sin iteración redundante.
  * `T1_F27_5`: Desempate determinista por orden alfabético si dos tiendas equidistan.
- **F28: Generador Universal de URL de Google Maps (5 tests)**
  * `T1_F28_1`: Formato con `api=1`, `origin`, `destination` y `travelmode=driving`.
  * `T1_F28_2`: Inclusión de waypoints intermedios separados por `%7C` (`|`).
  * `T1_F28_3`: Recorte seguro a máximo 9 waypoints intermedios en la URL.
  * `T1_F28_4`: Codificación estricta URI sin caracteres reservados no escapados.
  * `T1_F28_5`: Caso directo de 1 parada: sin parámetro waypoints en la URL.
- **F30: Selector de Vistas / Navigation Tabs (5 tests)**
  * `T1_F30_1`: Tres pestañas accesibles en el selector de vistas (Lista, Gráficos, Mapa).
  * `T1_F30_2`: Roles y atributos WAI-ARIA (`tablist`, `tab`, `tabpanel`, `aria-selected`).
  * `T1_F30_3`: Conmutación a vista de mapa oculta otros paneles y activa `view-map`.
  * `T1_F30_4`: Invocación de `invalidateSize()` en Leaflet al activar la pestaña del mapa.
  * `T1_F30_5`: Accesibilidad de teclado (Enter, Espacio) para conmutar pestañas.

### Tier 2: Casos Límite y Esquinas (10 tests)
- `T2_B01`: 0 tiendas con compras pendientes -> 0 paradas, 0.0 km, 0 min, URL vacía.
- `T2_B02`: 1 sola tienda -> recorrido directo origen a destino sin waypoints.
- `T2_B03`: Más de 10 tiendas distintas -> recorte seguro a 9 waypoints intermedios.
- `T2_B04`: Tiendas duplicadas en la lista -> agrupación bajo el mismo nodo de parada.
- `T2_B05`: Nombres de comercios con caracteres conflictivos en URI son sanitizados.
- `T2_B06`: Simulación de fallo en geocodificación (cero resultados o error 500).
- `T2_B07`: Saturación de LocalStorage (`QuotaExceededError`) no arroja error fatal.
- `T2_B08`: Coordenadas geográficas límite (antípodas, polos, cruce de hemisferio).
- `T2_B09`: Timeout o fallo de señal GPS en Geolocation API.
- `T2_B10`: Subtotales y precios extremos en popup de tienda (0.01 y 99999.99).

### Tier 3: Interacciones Cruzadas entre Subsistemas (7 tests)
- `T3_P01`: [Store items:changed + Mapa]: Adición de producto en tienda nueva añade parada al mapa.
- `T3_P02`: [Store toggleCompleted + Mapa]: Completar ítems de una tienda remueve su parada.
- `T3_P03`: [Store undoLastAction + Mapa]: Deshacer completado restaura la parada en el mapa.
- `T3_P04`: [Tema Claro/Oscuro + Tiles Leaflet]: Alternar `data-theme` modifica capa de teselas.
- `T3_P05`: [Origen GPS/Manual + TSP]: Cambiar el origen altera dinámicamente la secuencia de ruta.
- `T3_P06`: [Edición de Tienda + Persistencia]: Cambiar tienda de un producto actualiza las paradas.
- `T3_P07`: [Importación de Lista + Mapa]: Importar lote con múltiples tiendas activa los pines.

### Tier 4: Escenarios de Usuario Reales (3 tests)
- `T4_S01`: Jornada completa de compra urbana con 4 tiendas, GPS y Google Maps URL.
- `T4_S02`: Compra en sótano sin conexión (100% offline con caché local de tiendas).
- `T4_S03`: Compra peatonal rápida con tienda única y punto de partida manual.

---

## 5. Resumen Consolidado de Pruebas

| Archivo de Prueba | Ámbito y Enfoque | Tests Ejecutados |
|-------------------|------------------|------------------|
| `tests/e2e_runner.js` | Suite E2E F01-F20 (Tiers 1, 2, 3 y 4) | **242** |
| `tests/m1_unit.test.js` | Pruebas Unitarias de Arquitectura M1 (StorageService, Store, etc.) | **86** |
| `tests/map_routing.test.js` | Suite de Mapa y Optimizador de Rutas R1-R4 (F22-F28, F30) | **60** |
| **TOTAL GENERAL** | **Suite Completa del Proyecto** | **388 tests (100% verde)** |
