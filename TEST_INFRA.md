# Infraestructura y Suite de Pruebas E2E — "Lista de Compra | PRO"

Documento de referencia para la ejecución, arquitectura, metodología y catálogo de pruebas E2E automatizadas para la aplicación web **Lista de Compra | PRO**.

---

## 1. Arquitectura de Pruebas y Test Runner

La infraestructura de pruebas ha sido diseñada para ser **100% autónoma, ultrarrápida y libre de dependencias externas pesadas** (como navegadores completos, drivers nativos o compiladores C++). Toda la suite se ejecuta de forma nativa en Node.js mediante un motor de ejecución a medida y un simulador de DOM (`mock_dom.js`).

```
ListadeCompras-Git/
├── tests/
│   ├── e2e_runner.js            # Runner CLI con aserciones, reporting ANSI y filtros por Tier
│   ├── mock_dom.js              # Entorno DOM liviano, eventos, LocalStorage, ECharts y SweetAlert2
│   ├── spec_helper.js           # Oráculos matemáticos, sanitización XSS y contratos de interface
│   ├── tier1_features.test.js   # Tier 1: Cobertura por característica (106 tests)
│   ├── tier2_boundaries.test.js # Tier 2: Casos límite y esquinas (104 tests)
│   ├── tier3_pairwise.test.js   # Tier 3: Interacciones cruzadas por pares (22 tests)
│   └── tier4_scenarios.test.js  # Tier 4: Escenarios de usuario del mundo real (10 tests)
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
   - Almacenamiento local aislado (`MockLocalStorage`) conforme a la especificación W3C Web Storage.
   - Emulación de APIs de navegador: `window.matchMedia`, `window.ResizeObserver`, `Blob`, `FileReader`, `URL.createObjectURL`.
   - Stubs de control para librerías visuales: **Apache ECharts** (`init`, `setOption`, `resize`, `clear`), **SweetAlert2** (`Swal.fire`) y **Lucide Icons** (`createIcons`).

3. **`tests/spec_helper.js`**:
   - **`ReferenceAnalytics`**: Oráculo de cálculo aritmético monetario en centavos enteros para eliminar el desvío IEEE 754.
   - **`ReferenceValidation`**: Validador estricto y función de sanitización y escape HTML anti-XSS (`escapeHtml`).
   - **`ReferenceExportImport`**: Validador y generador de payloads JSON v1.0 y CSV RFC 4180 con BOM UTF-8 (`\uFEFF`).
   - **`ReferenceWCAG`**: Motor matemático de luminancia relativa y ratio de contraste de color conforme a WCAG AA (4.5:1).

---

## 2. Instrucciones de Ejecución

Para ejecutar la suite completa o tiers individuales:

### Ejecutar toda la suite (242 tests):
```bash
node tests/e2e_runner.js
```

### Ejecutar por Tier específico:
```bash
node tests/e2e_runner.js --tier=1   # Solo Tier 1 (Cobertura F01-F20)
node tests/e2e_runner.js --tier=2   # Solo Tier 2 (Casos Límite y Esquinas)
node tests/e2e_runner.js --tier=3   # Solo Tier 3 (Combinaciones Cruzadas)
node tests/e2e_runner.js --tier=4   # Solo Tier 4 (Escenarios de Usuario)
```

### Filtrar pruebas por nombre o característica:
```bash
node tests/e2e_runner.js --filter="F01"
node tests/e2e_runner.js --filter="XSS"
node tests/e2e_runner.js --filter="Presupuesto"
```

### Modo Bail (detener en primer fallo):
```bash
node tests/e2e_runner.js --bail
```

### Salida estructurada en JSON (para CI/CD o agentes):
```bash
node tests/e2e_runner.js --json
```

---

## 3. Desglose de Capas de Pruebas (Tiers)

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

---

### Tier 2: Casos Límite y Esquinas (104 tests)
Pruebas de estrés, valores atípicos y robustez defensiva:
- **B1: Precios Numéricos Extremos (15 tests)**: $0.00 exacto, negativos (-0.01, -100, -Infinity), `MAX_SAFE_INTEGER`, $999,999.99, decimales múltiples (0.001, 0.005, 19.9999), notación científica ("1e2"), NaN, null, booleanos y objetos.
- **B2: Cantidades Numéricas Extremas (15 tests)**: 1 (mínimo), 0 (rechazado), negativas (-1, -999), decimales fraccionarios (0.5, 0.250 kg), 10,000 unidades, strings numéricos y con espacios, texto no numérico ("tres"), NaN, Infinity, null y especiales ("2x1").
- **B3: Cadenas de Texto y Nombres Límite (15 tests)**: Nombre de 1 carácter, vacío, 100 espacios en blanco, ultra largo (5,000 chars), emojis simples (🍎), emojis ZWJ (👨‍👩‍👧‍👦), alfabetos cirílico/japonés/árabe, saltos de línea/tabs, espacios en categorías y ubicaciones, nombres con comillas, nombres numéricos, protección contra prototipos (`__proto__`, `constructor`).
- **B4: Presupuesto Financiero Límite (14 tests)**: Presupuesto 0.00, negativo, decimales (123.45), 100% de uso exacto, sobrepaso al 101% y al 500%, barra de progreso topada al 100%, presupuesto de 1 millón, formatos con "$" y coma decimal "50,50", NaN, Infinity, protección de división por cero y reactividad en tiempo real.
- **B5: Inyecciones de Seguridad y XSS (15 tests)**: Tags `<script>`, inyecciones en categorías y ubicaciones, `<iframe>`, `<img onerror>`, `<svg onload>`, pseudo-protocolo `javascript:`, prevención de doble escape, rupturas de comillas `">`, atributos de input `test" onfocus=`, plantillas `${alert(1)}`, carácter nulo `\0`, payloads políglotas XSS, filtros de búsqueda maliciosos y contaminación de prototipo.
- **B6: Archivos de Importación Corruptos (15 tests)**: JSON sintácticamente roto, primitivos, sin campo `items`, items no array, versión no soportada, items vacíos, items sin `name`, CSV vacío, solo espacios, sin columna obligatoria `name`, filas con menos o más columnas, comillas sin cerrar, mezcla de saltos CRLF y LF, caracteres acentuados.
- **B7: Estrés de Almacenamiento y Concurrencia (15 tests)**: Metacaracteres regex en búsqueda (`.*`, `[abc`, `(test`, `+?`), insensibilidad a acentos/mayúsculas, 50 adiciones en ráfaga rápida, fallo simulado de `QuotaExceededError`, contenido no array en LocalStorage, duplicidad de IDs, borrado y toggle en IDs inexistentes, cancelación de edición inválida, normalización de ubicaciones repetidas, idempotencia de colapso y limpieza de lista vacía.

---

### Tier 3: Combinaciones Entre Características (22 tests)
Pruebas de interacción cruzada entre subsistemas:
- **P01**: [F03 Store + F07 Dark Theme + F15 ECharts Theme]: Conmutar tema actualiza el store y recalibra colores de ECharts.
- **P02**: [F04 Validación + F01 LocalStorage]: Input inválido no genera persistencia corrupta.
- **P03**: [F11 DOM Granular + F13 Métricas]: Toggle de completado actualiza DOM y transfiere montos de pendiente a gastado atómicamente.
- **P04**: [F17 Exportación CSV + F05 Prevención XSS]: Items con caracteres sanitizados se exportan a CSV cumpliendo RFC 4180.
- **P05**: [F18 Importación JSON + F01 LocalStorage + F13 Métricas]: Importar archivo actualiza almacenamiento y recalcula presupuesto en un solo ciclo.
- **P06**: [F03 Filtro Búsqueda + F03 Ocultar Comprados]: Intersección lógica exacta entre texto de búsqueda y switch de completados.
- **P07**: [F20 Toast Undo + F13 Métricas + F01 LocalStorage]: Borrar producto descuenta métricas; Deshacer restaura producto, métricas y LocalStorage.
- **P08**: [F19 Atajo Enter + F04 Validación + F11 DOM]: Enter con datos válidos agrega producto, limpia formulario y reenfoca `#itemInput`.
- **P09**: [F19 Atajo Enter + F04 Validación]: Enter con nombre vacío rechaza sin añadir y muestra feedback.
- **P10**: [F14 ECharts + F16 Estado Vacío + F11 DOM]: Añadir primer producto activa ECharts; borrarlo regresa a estado limpio.
- **P11**: [F12 Precisión Centavos + F13 Métricas + F04 Validación]: Adición acumulativa masiva de decimales sin error de deriva IEEE 754.
- **P12**: [F18 Importación CSV + F10 Avatares Locales]: Asignación automática de avatares locales tras importar catálogo mixto.
- **P13**: [F08 Layout Mobile + F14 ECharts Responsive]: En ancho de 360px, tooltip mantiene `confine: true` sin salirse de la pantalla.
- **P14**: [F01 LocalStorage + F02 Firebase Fallback]: Pérdida total de conexión conmuta a LocalStorage sin bloquear la experiencia de usuario.
- **P15**: [F18 Importación Merge vs Overwrite]: Modo Merge adiciona conservando catálogo existente; modo Overwrite reemplaza.
- **P16**: [F20 Limpiar Comprados + F20 Toast Undo]: Limpieza masiva de comprados y restauración en bloque con Deshacer.
- **P17**: [F07 Dark Theme + F06 WCAG AA]: Verificación de ratio de contraste >= 4.5:1 en elementos de modo oscuro.
- **P18**: [F03 Store + F14 ECharts Categories]: Modificar categoría de producto reubica dinámicamente las series de ECharts.
- **P19**: [F09 Touch Targets + F08 Mobile]: Dimensiones táctiles mínimas preservadas en viewport móvil.
- **P20**: [F17 Export JSON + F18 Import JSON (Roundtrip)]: Ciclo completo de exportación y reimportación garantiza fidelidad 100%.
- **P21**: [F17 Export CSV + F18 Import CSV (Roundtrip)]: Exportar a CSV con BOM y reimportar conserva datos y precios exactos.
- **P22**: [F03 Store PubSub + F19 Teclado Esc]: Cancelar edición con Escape no emite mutaciones erróneas y restaura estado previo.

---

### Tier 4: Escenarios de Usuario del Mundo Real (10 escenarios completos)
1. **S01 — Compra Semanal Familiar Completa**: Presupuesto de $150, 12 productos en 3 supermercados ("Mercadona", "Carrefour", "Verdulería"), compra y marcado gradual de 7 productos en tienda, recálculo continuo de métricas gastado/pendiente, limpieza final de comprados.
2. **S02 — Gestión Estricta de Presupuesto con Alerta de Sobrepaso**: Presupuesto de $50, adición de items hasta $49.50 (99%), item excedente que lleva a $59.50 (119%), alerta visual de exceso y corrección de cantidad para volver a saldo positivo ($44.50).
3. **S03 — Organización por Pasillos y Colapso de Secciones**: Lista organizada en pasillos, colapso de sección completada con persistencia en LocalStorage, y búsqueda rápida de producto en pasillo pendiente.
4. **S04 — Flujo de Respaldo y Migración entre Dispositivos**: Exportación a JSON `lista-compras.json` en ordenador, simulación de nuevo dispositivo limpio, importación y restauración de datos, categorías y presupuesto al 100%.
5. **S05 — Recuperación tras Error Accidental con Deshacer (Undo Flow)**: Borrado accidental de 8 items completados con "Limpiar Comprados", toast de advertencia con botón Deshacer, restauración dentro de la ventana de tiempo conservando estados.
6. **S06 — Preparación de Receta Especial con Cantidades Fraccionadas**: Ingredientes pesados en decimales (1.25 kg de ternera a $24.80/kg, 0.35 kg chalotas, vino y mantequilla), validando cálculo matemático exacto en centavos ($46.47 total).
7. **S07 — Uso Rápido en Movilidad con Atajos de Teclado y Búsqueda**: Adición de 5 productos usando exclusivamente `Enter` en formulario con retorno continuo de foco a `#itemInput`, seguido de búsqueda en tiempo real de "leche".
8. **S08 — Interrupción Offline y Continuidad de Sesión**: Entrada a supermercado sin cobertura, adición y marcado de productos 100% en LocalStorage, recarga de página/sesión comprobando persistencia íntegra de cambios.
9. **S09 — Colaboración Externa mediante Importación de CSV**: Recepción de lista compartida por un tercero en formato CSV, importación en modo "Combinar (Merge)" integrando nuevos items sin alterar lista preexistente.
10. **S10 — Ciclo de Vida Nocturno (Dark Mode Shopping Journey)**: Compra nocturna en entorno oscuro, activación de modo oscuro, verificación de contraste visual WCAG AA, sincronización de ECharts en oscuro y persistencia sin parpadeo blanco (FOUC).

---

## 4. Defectos de Implementación Detectados en el Código Legacy (Para Escalar)

Durante la ejecución de las pruebas contra la base de código inicial existente, la suite ha detectado y aislado los siguientes defectos que deben ser resueltos en los milestones correspondientes:

1. **Defecto F08 (M2) — Presencia de `minmax(340px, 1fr)` en `style.css` (Línea 180)**:
   - *Observación*: En `style.css` la regla `.shopping-list` define `grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));`.
   - *Impacto*: En pantallas móviles estrechas (320px a 360px), el ancho mínimo forzado de 340px desborda el viewport y genera scroll horizontal involuntario, violando el criterio de aceptación R2 y la especificación F08.
   - *Acción requerida*: Modificar la regla en Milestone M2 para usar un layout fluido (ej. `minmax(min(100%, 280px), 1fr)` o maquetación mobile-first basada en flex-column).

2. **Defecto F01/F02 (M1) — Dependencia Dura de Firebase en `script.js` (Línea 2)**:
   - *Observación*: En `script.js`, el inicio de la aplicación ejecuta directamente `firebase.initializeApp(firebaseConfig)` y `db.collection('shoppingItems')` sin bloques de protección `try/catch` ni comprobación de disponibilidad.
   - *Impacto*: Si no se cargan las librerías remotas de Firebase o no hay conexión a internet, la aplicación lanza un `ReferenceError: firebase is not defined` impidiendo el uso local.
   - *Acción requerida*: Modularizar la persistencia en `js/storage.js` durante Milestone M1 con soporte LocalStorage offline-first transparente.

3. **Defecto F10 (M2) — Enlace a CDN externa LoremFlickr en `script.js` (Línea 198)**:
   - *Observación*: `script.js` genera imágenes con `https://loremflickr.com/150/150/${encodeURIComponent(cat.toLowerCase())}`.
   - *Impacto*: Falla completamente en modo offline y genera lentitud en la carga.
   - *Acción requerida*: Reemplazar por avatares SVG locales o iconos temáticos de Lucide en Milestone M2.
