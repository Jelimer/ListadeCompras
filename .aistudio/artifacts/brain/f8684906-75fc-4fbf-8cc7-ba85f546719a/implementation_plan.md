# Lista de Compra | PRO — Sistema de IDs por Producto (#001), Dashboard de KPIs Reales y Plegado Universal de Listas

Esta actualización incorpora un identificador secuencial único (`#001`, `#002`, `#003`...) para cada producto, transforma la pestaña de **Estadísticas** en un tablero analítico de KPIs financieros y operativos reales, y garantiza que **todas las listas de la aplicación** (Comercios, sección *Por averiguar* y Paradas del Mapa) puedan encogerse al 100% de forma individual o masiva.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Se han integrado todas tus respuestas para estructurar esta mejora:

- **ID Secuencial Corto (`#001`, `#002`, `#003`)**: Cada producto existente y nuevo recibe automáticamente un código secuencial único (ej. `#001`, `#002`) visible junto al nombre del artículo, buscable desde la barra de búsqueda y utilizado para auditar unidades y costos en las tablas y gráficos de estadísticas.
- **Suite Completa de KPIs y Gráficos en Estadísticas**:
  - **Comparativa de Presupuesto vs. Comprometido y Gastado**: Desglose exacto entre *Presupuesto*, *Total Comprometido (Comprado + Pendiente)*, *Gastado Real ($)* y *Saldo Disponible / Excedente ($)*.
  - **Gasto Real ($) por Comercio y por Categoría**: Gráfico interactivo ECharts con selector para alternar entre **Monto ($)** y **Unidades**, y agrupar por **Comercio** o **Categoría** (diferenciando *Comprado* vs. *Pendiente*).
  - **Avance de Compra (% Comprados vs. Pendientes)**: Indicador y gráfico de progreso porcentual tanto en cantidad de productos únicos (`#ID`) como en unidades totales y presupuesto ejecutado.
  - **Top Productos Más Caros y Promedio por Unidad**: Ranking detallado con `#ID`, nombre, comercio, costo unitario, subtotal y porcentaje de incidencia sobre el gasto total, además del KPI de costo promedio por producto y por unidad.
- **Plegado Universal (Comercios, "Por averiguar" y Paradas del Mapa)**:
  - La sección **"Por averiguar / Sin lugar asignado"** ahora cuenta con encabezado interactivo y botón para encogerse/expandirse, e ingresa dentro de la acción global **"Contraer todo / Expandir todo"**.
  - Las tarjetas de **Comercios** en *Mi Lista* permiten contraer el 100% de los grupos (incluso cuando hay un único comercio) con ocultamiento estricto del cuerpo de ítems.
  - Las **Paradas del Itinerario** en *Ruta en Mapa* incluyen botón para plegar/desplegar sus productos individuales y un botón rápido en la cabecera del itinerario para contraer o expandir todas las paradas a la vez.

---

## 1. Overview & Core Concept

- **What It Does**: Convierte la lista de compras en un sistema trazable por ítem (`#001`, `#002`...) donde cada unidad y peso gastado se refleja en KPIs financieros accionables, manteniendo una interfaz limpia donde cualquier lista o bloque puede plegarse por completo.
- **Target Audience / Persona**: Usuarios que planifican compras multi-comercio y necesitan auditar cuánto gastaron realmente, cuánto les falta por pagar, qué productos encarecen el carrito y mantener las listas compactas en pantalla.
- **Key Value**: Control financiero exacto (diferenciando gasto ejecutado vs. pendiente), trazabilidad por código `#ID` de cada artículo y ergonomía visual sin listas bloqueadas abiertas.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Trazabilidad por `#ID` en Mi Lista y Búsqueda**: Al agregar o visualizar un producto, se muestra su código secuencial (`#001`, `#002`...) con tipografía tabular. El usuario puede escribir `#003` o `003` en el buscador para localizar el artículo al instante.
  2. **Plegado Total en Todas las Vistas**:
     - En *Mi Lista*, el usuario puede contraer cualquier comercio, la caja *Por averiguar / Sin lugar asignado*, o pulsar **"Contraer todo"** para dejar absolutamente todas las secciones compactadas en una sola línea de resumen.
     - En *Ruta en Mapa*, cada parada del itinerario puede encoger su lista de productos con un clic, o plegarse todas juntas desde la cabecera del itinerario.
  3. **Análisis en Estadísticas**: Al abrir la pestaña *Estadísticas*, el usuario visualiza la fila superior de KPIs ejecutivos, los gráficos interactivos (con filtros para ver Gasto `$` por Comercio o Categoría y dona de Avance/Presupuesto) y la tabla de **Top Productos Más Caros** identificada por `#ID`.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Dashboard analítico de alta densidad inspirado en herramientas financieras modernas, respetando el modo claro y oscuro (`data-theme="light" | "dark"`).
  - *Color Palette & Mood*: Indigo (`#4f46e5` / `#a5b4fc`) para montos pendientes y serie principal; Esmeralda (`#047857` / `#34d399`) para gasto real comprado y presupuesto saludable; Ámbar (`#b45309` / `#fbbf24`) para advertencia (>80% del presupuesto); Rojo (`#b91c1c` / `#f87171`) para exceso presupuestario.
  - *Typography & Hierarchy*: `Plus Jakarta Sans` con `font-variant-numeric: tabular-nums` obligatorio en todos los códigos `#001`, precios, porcentajes y tablas comparativas.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Asignación y Persistencia del Código `#ID` (`#001`, `#002`...)**:
  - *Chosen Approach*: Asignar y persistir un número secuencial (`seqNumber` y `skuCode` formateado a 3 dígitos `#001`) ordenado cronológicamente para los productos existentes y auto-incremental para cada nuevo producto añadido.
  - *Why*: Garantiza que el código `#001` de un producto no cambie al reordenar comercios ni al marcarlo como comprado, permitiendo referenciarlo de forma estable en los gráficos y rankings.
- **Decision 2: Gráficos Duales con Selector de Métrica (`$` vs `Unidades`) y Dimensión (`Comercio` vs `Categoría`)**:
  - *Chosen Approach*: Incorporar controles segmentados en el panel de gráficos para alternar instantáneamente entre **Gasto ($)** y **Unidades**, y entre **Por Comercio** y **Por Categoría**, apilando *Comprado* + *Pendiente*.
  - *Why*: Evita que el gráfico quede vacío cuando todos los productos se marcan como comprados (error actual) y permite analizar tanto el dinero gastado como el volumen físico de compra.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                 App State                                  │
│  items (con seqNumber / skuCode #001) · budget · collapsedGroups · trips   │
└───────────────┬─────────────────────────────┬──────────────────────────────┘
                │                             │
      ┌─────────▼──────────┐        ┌─────────▼──────────┐
      │     ListView       │        │     StatsView      │
      ├────────────────────┤        ├────────────────────┤
      │ • Plegado 100% de: │        │ • 6 Tarjetas KPI   │
      │   - Por averiguar  │        │ • Barra Dual de    │
      │   - Comercios      │        │   Presupuesto      │
      │ • Botón Contraer / │        │ • ECharts Gasto $  │
      │   Expandir Todo    │        │   (Comercio / Cat) │
      │ • Etiqueta #001 en │        │ • ECharts Avance % │
      │   cada producto    │        │ • Ranking Top #ID  │
      └────────────────────┘        └────────────────────┘
                │
      ┌─────────▼──────────┐
      │      MapView       │
      ├────────────────────┤
      │ • Paradas con      │
      │   lista plegable   │
      │ • Botón Contraer / │
      │   Expandir Paradas │
      │ • Código #001 en   │
      │   ítems de parada  │
      └────────────────────┘
```

### Data Model & State
- **Entidad `ShoppingItem`**: Se enriquece con `seqNumber?: number` y `skuCode?: string` (ej. `"#001"`). La función de sanitización en almacenamiento asigna automáticamente códigos correlativos `#001`, `#002`... a cualquier lista previa guardada en `localStorage` o importada por CSV/JSON.
- **Métricas Analíticas Extendidas (`ExtendedAnalytics`)**:
  - `totalPending`, `totalSpent`, `totalOverall` (Comprometido Total = Gastado + Pendiente).
  - `budget`, `budgetRemaining`, `budgetPercentage`, `spentPercentage`, `pendingPercentage`.
  - `totalItemsCount`, `completedItemsCount`, `pendingItemsCount`, `completionRateItems` (%).
  - `totalUnitsCount`, `completedUnitsCount`, `pendingUnitsCount`, `completionRateUnits` (%).
  - `averageCostPerItem`, `averageCostPerUnit`.
  - `storeBreakdown` (Gasto comprado, gasto pendiente, unidades y cantidad de `#ID` por comercio).
  - `categoryBreakdown` (Gasto comprado, gasto pendiente, unidades y cantidad de `#ID` por categoría).
  - `topExpensiveItems` (Lista ordenada por subtotal `$` descendente con `#ID`, precio unitario, cantidad, comercio, estado y `%` del total).

### Interactive Component & State Mapping
- **Plegado Universal en `ListView`**:
  - La sección `#pendingLocationSection` utiliza la clave reservada `__pending_unassigned__` dentro de `collapsedGroups` (o estado sincronizado) para que tanto el clic en su propia cabecera como el botón global **"Contraer todo / Expandir todo"** la contraigan o desplieguen junto con todos los comercios.
- **Plegado de Paradas en `MapView`**:
  - Estado `collapsedStops` que permite contraer o expandir la lista de productos de cada parada del itinerario individualmente o todas a la vez mediante un botón en la cabecera del itinerario.
- **Controles Interactivos en `StatsView`**:
  - Selector segmentado `metricMode: 'currency' | 'units'` y `groupBy: 'store' | 'category'` que actualiza en tiempo real el gráfico principal de ECharts sin recargar la vista.
