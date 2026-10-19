# Rediseño Visual Ejecutivo y Empresarial — Lista de Compra | PRO

Transformación estética integral hacia una interfaz corporativa, moderna y de grado empresarial para la gestión de suministros, auditoría de tickets, rutas logísticas y analítica financiera, manteniendo intactas todas las funcionalidades existentes.

### User Review & Critical Decisions

> [!IMPORTANT]
> Se han consolidado las decisiones de diseño confirmadas para garantizar una estética sobria, ejecutiva y de alta legibilidad tanto en modo claro como en modo oscuro:

- **Paleta Cromática Confirmada**: **Azul Marino Ejecutivo, Pizarra y Acentos Cobalto** — Lienzos neutros fríos (`#F8FAFC` / `#FFFFFF` en modo claro y `#090D16` / `#111827` en modo oscuro), superficies estructurales en gris pizarra y acentos en Azul Cobalto corporativo (`#1D4ED8` / `#2563EB`) con indicadores semánticos de precisión financiera.
- **Arquitectura de Navegación Confirmada**: **Cabecera Superior Ejecutiva y Lienzo Panorámico Fluido** — Barra superior de nivel empresarial con identidad de marca sobria, navegación por pestañas integrada con indicadores activos nítidos y barra de acciones rápidas alineada, aprovechando el ancho panorámico de escritorio (`1440px–1600px`).
- **Densidad Visual y Tipografía Confirmada**: **Equilibrado con Bordes Finos de 1px y Números Tabulares** — Superficies planas de un solo nivel de elevación con divisores arquitectónicos de `1px`, radio de borde refinado (`6px–10px` en lugar de bordes redondeados excesivos) y fuente monoespaciada tabular (`JetBrains Mono` + `Plus Jakarta Sans`) para todos los importes, `#ID`, fechas y métricas.

---

### 1. Overview & Core Concept

- **What It Does**: Eleva la experiencia visual de toda la plataforma (**Mi Lista**, **Mapa y Ruta**, **Estadísticas y KPIs** y **Escáner de Tickets**) al estándar de un software ERP / SaaS financiero moderno, eliminando ornamentos innecesarios, sombras pesadas y cápsulas saturadas en favor de una jerarquía tipográfica limpia, contrastes medidos y superficies estructuradas.
- **Target Audience / Persona**: Usuarios y equipos que gestionan compras, presupuestos, comparativas de precios por comercio y auditoría de comprobantes con rigor analítico.
- **Key Value**: Mayor velocidad de lectura visual en listas extensas y tablas de auditoría, apariencia profesional de nivel ejecutivo y alineación numérica impecable en precios y métricas con formato argentino (`$12.450,50`).

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Cabecera y Navegación Unificada**: El usuario accede a una barra superior ejecutiva que agrupa la identidad del sistema, el selector de vistas principales (**Mi Lista**, **Mapa y Ruta**, **Estadísticas**) con contadores tabulares discretos y las acciones globales (**Subir Ticket**, estado de red y cambio de tema Claro/Oscuro).
  2. **Barra de Captura Rápida y Filtros Corporativos**: El formulario de carga de suministros se presenta como una consola horizontal estructurada con etiquetas claras, campos de entrada con bordes de precisión (`1px solid`) y foco en azul cobalto.
  3. **Tarjetas de Comercios y Catálogo `#ID`**: Cada comercio se muestra como un módulo ejecutivo plegable con cabecera en contraste sutil, resumen financiero alineado a la derecha y filas de productos con separación limpia de `1px`, código `#001` en tipografía monoespaciada, fecha de compra discreta y controles de acción rápida al pasar el cursor o tocar.
  4. **Tablero de KPIs y Auditoría de Tickets**: Las tarjetas de indicadores clave (Presupuesto, Comprometido, Gastado Real, Avance y Ticket Promedio) adoptan un diseño de banca corporativa con jerarquía numérica dominante, gráficos ECharts armonizados con la paleta Cobalto/Pizarra y tablas de auditoría de alta legibilidad.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: **Executive Financial & Supply Chain SaaS** — Inspirado en plataformas financieras e institucionales modernas (precisión geométrica, sobriedad cromática, bordes definidos de `1px` y ausencia de ruido visual).
  - *Color Palette & Mood* (Regla 60-30-10):
    - **60% Lienzo Dominante**: Blanco puro y alabastro frío (`#F8FAFC` / `#FFFFFF`) en modo claro; Azul Noche profundo (`#0B0F19` / `#111827`) en modo oscuro.
    - **30% Superficies Estructurales y Pizarra**: Cabeceras de tabla y paneles secundarios en `#F1F5F9` (claro) / `#1E293B` (oscuro), bordes arquitectónicos en `#E2E8F0` / `#263248` y texto secundario en `#334155` / `#94A3B8`.
    - **10% Presupuesto de Acento Ejecutivo**: Azul Cobalto Institucional (`#1D4ED8` primario, `#1E40AF` hover en modo claro; `#60A5FA` / `#3B82F6` en modo oscuro), acompañado de Verde Esmeralda (`#047857` / `#34D399`) para compras confirmadas, Ámbar (`#B45309` / `#FBBF24`) para advertencias presupuestarias y Carmesí (`#B91C1C` / `#F87171`) para desvíos o eliminaciones.
  - *Typography & Hierarchy* (Regla 2+1):
    - **Display & UI Structure**: `Plus Jakarta Sans` (pesos 500, 600, 700) con `letter-spacing: -0.02em` en títulos de sección y cabeceras.
    - **Monospace & Tabular Data**: `JetBrains Mono` con `font-variant-numeric: tabular-nums` para todos los códigos secuenciales (`#001`), precios unitarios, subtotales, porcentajes, distancias y fechas.
  - *Component Styling & Layout*:
    - Reducción de radios excesivos (`20px` → `10px–12px` en contenedores principales y `6px–8px` en controles e inputs) para proyectar un carácter más técnico y empresarial.
    - Reemplazo de cápsulas decorativas estáticas por metadatos tipográficos limpios separados por puntos medios (`·`) y etiquetas técnicas sobrias.

- **Interactive Feedback & Motion**:
  - Transiciones rápidas de `150ms cubic-bezier(0.16, 1, 0.3, 1)` en estados hover/focus sobre filas de productos, pestañas y botones.
  - Resaltado sutil de fila activa en tablas y listas de comercios sin desplazamientos bruscos de layout.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Radios Geométricos Sobrios y Bordes de 1px sobre Sombras Difusas**
  - *Chosen Approach*: Sustituir las sombras pronunciadas y esquinas muy redondeadas por bordes de `1px solid` de alto contraste estructural y sombras micro-sutiles de una sola capa.
  - *Why*: Las interfaces empresariales con alta densidad de datos (precios, cantidades, `#ID`, fechas y gráficos) se leen con mucha mayor claridad cuando los límites entre módulos están definidos por líneas limpias en lugar de sombras flotantes.
  - *Alternatives Considered*: El estilo de tarjetas amplias con sombras profundas resta espacio útil en pantalla y genera fatiga visual al auditar decenas de productos.

- **Decision 2: Tipografía Monoespaciada Tabular en Cifras e Identificadores**
  - *Chosen Approach*: Incorporar `JetBrains Mono` junto a `tabular-nums` en columnas de precios, subtotales, contadores de comercios y códigos `#001`.
  - *Why*: Garantiza alineación vertical exacta entre miles (`.`) y decimales (`,`), facilitando la comparación inmediata de importes en la lista y en el escáner de tickets.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                 LIENZO PANORÁMICO EJECUTIVO (1440px - 1600px)                │
├──────────────────────────────────────────────────────────────────────────────┤
│  CABECERA CORPORATIVA UNIFICADA                                              │
│  [Identidad & Estado] ─── [Navegación: Lista · Mapa · KPIs] ─── [Acciones]   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────────┬────────────────────────┬───────────────────────┐  │
│  │   VISTA: MI LISTA     │   VISTA: MAPA Y RUTA   │  VISTA: ESTADÍSTICAS  │  │
│  ├───────────────────────┼────────────────────────┼───────────────────────┤  │
│  │ • Consola de Captura  │ • Panel Lateral de     │ • Cinta Ejecutiva de  │  │
│  │   de Suministros      │   Paradas Plegables    │   5 KPIs Financieros  │  │
│  │ • Barra de Filtros y  │ • Lienzo Cartográfico  │ • Gráficos ECharts    │  │
│  │   Acciones en Lote    │   OSRM Panorámico      │   con Tema Cobalto    │  │
│  │ • Módulos de Comercio │ • Resumen de Distancia │ • Tabla de Auditoría  │  │
│  │   y Filas Tabulares   │   y Costo por Parada   │   #ID y Tickets       │  │
│  └───────────┬───────────┴────────────────────────┴───────────┬───────────┘  │
│              │                                                │              │
│              ▼                                                ▼              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │         MODAL DE AUDITORÍA Y ESCÁNER DE TICKETS (GEMINI / OCR)         │  │
│  │  • Comparativa de Nomenclatura de Ticket vs. Nombre en Catálogo (#ID)  │  │
│  │  • Edición Manual en Línea y Sincronización con Historial de Fechas    │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - Se conserva el 100% del modelo de datos en `localStorage` (`ShoppingItem`, `PurchaseReceipt`, `RouteOrigin`, `TripsData`), incluyendo los códigos secuenciales `#001`, el historial de compras por fecha y la sincronización de tickets.
- **Interactive Component & State Mapping**:
  - **Tokens de Diseño Globales**: Actualización del sistema de variables CSS (`--bg-body`, `--card-bg`, `--bg-surface-elevated`, `--primary`, `--border`, `--radius-*`) tanto en modo claro como oscuro para reflejar la paleta Azul Marino / Pizarra / Cobalto.
  - **Gráficos ECharts Sincronizados**: Ajuste de la paleta de series, grillas, tooltips e indicadores en el tablero de Estadísticas para coincidir con la estética corporativa azul cobalto y pizarra.
  - **Compatibilidad e Integridad DOM**: Se mantienen intactos todos los identificadores (`id`), atributos `aria-*` y manejadores de eventos en formularios, listas plegables, mapa interactivo y modal de tickets.
