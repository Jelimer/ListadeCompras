# Lista de Compra | PRO — Mapa OpenStreetMap Libre, Origen en Corrientes y Visibilidad de Comercios con 0 Pendientes

Esta actualización reemplaza los mosaicos de CartoDB que exigían llave de API (`API KEY REQUIRED`) por el servidor oficial libre de **OpenStreetMap**, establece **Corrientes, Argentina** como punto de partida predeterminado y muestra en el mapa y el itinerario todos los comercios —diferenciando visualmente con un tono más claro y suave aquellos que tienen `0 pendientes`—.

## User Review & Critical Decisions

> [!IMPORTANT]
> Se han incorporado tus respuestas para que el mapa funcione sin restricciones de API en cualquier dominio (AI Studio y Vercel) y refleje todos tus comercios en Corrientes.

- **Mapa OpenStreetMap 100% Libre (Sin API Key)**: Se reemplazan las URLs de `basemaps.cartocdn.com` por `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, eliminando definitivamente el mensaje `API KEY REQUIRED` tanto en modo claro como en modo oscuro (mediante filtro cromático CSS calibrado sobre los mosaicos de OpenStreetMap).
- **Punto de Partida en Corrientes, Argentina**: El origen por defecto pasa de Madrid a **Corrientes Capital** (`-27.4692, -58.8306` · *Plaza 25 de Mayo, Corrientes*), migrando automáticamente cualquier sesión guardada que aún tuviera la referencia de Madrid y priorizando Corrientes/Argentina en las búsquedas de direcciones.
- **Visualización Dual de Comercios (Con Pendientes y con 0 Pendientes)**: Tanto en el mapa como en el itinerario lateral aparecerán todos los comercios registrados; aquellos con `0 pendientes` (todos sus productos comprados) se mostrarán en un tono más claro y atenuado para distinguirlos de un vistazo sin perder su ubicación ni su historial de productos.

---

## 1. Overview & Core Concept

- **Qué hace**: Brinda un mapa interactivo de rutas de compra en **Corrientes, Argentina** sobre cartografía libre de OpenStreetMap con trazado vial OSRM, donde conviven las paradas activas con compras pendientes (resaltadas en primer plano) y los comercios ya completados con `0 pendientes` (en estilo suave y translúcido).
- **Audiencia y Contexto**: Usuarios en Corrientes que organizan sus compras habituales en supermercados y comercios locales y necesitan visualizar su recorrido completo desde cualquier navegador o despliegue en Vercel sin bloqueos de proveedores de mapas.
- **Valor Principal**: Elimina por completo el bloqueo `API KEY REQUIRED`, centra la experiencia en Corrientes desde el primer segundo y conserva visibles en el mapa los comercios aunque ya tengan sus productos comprados.

---

## 2. User Experience & Visual Design

- **Flujos de Usuario Clave**:
  1. **Carga Inmediata en Corrientes sin Restricciones de API**: Al abrir **"Ruta en Mapa"**, el lienzo carga las calles de Corrientes mediante OpenStreetMap libre (`tile.openstreetmap.org`). Si el navegador tenía guardado el origen antiguo por defecto en Madrid, se actualiza automáticamente a Corrientes.
  2. **Jerarquía Visual entre Comercios Activos y Comercios con 0 Pendientes**:
     - **Comercios con compras pendientes**: Marcador índigo intenso (`#4f46e5`), etiqueta flotante nítida (`1. Facor · 4 art.`) y tarjeta de itinerario con contraste completo.
     - **Comercios con 0 pendientes**: Marcador y etiqueta en tono más claro y suave (`opacity: 0.65`, borde punteado sutil y distintivo `0 pend.`), permitiendo igualmente ver sus productos comprados, desmarcarlos si hace falta volver a comprarlos o incluirlos/excluirlos del recorrido con su casilla.
- **Identidad Visual y Tema**:
  - *Dirección Estética*: SaaS Dashboard & Mobile Touch App de alta legibilidad, superficies limpias con bordes de `1px` y jerarquía visual inmediata por contraste y opacidad.
  - *Paleta de Colores*: Lienzo claro (`#f8fafc`) y oscuro (`#020617`); acento índigo (`#4f46e5`) para paradas con pendientes; gris pizarra suave (`#64748b` / `#94a3b8` con opacidad `0.62`) para comercios con `0 pendientes`; esmeralda (`#047857`) para el punto de salida y acción de navegación.
  - *Tipografía y Jerarquía*: `Plus Jakarta Sans` con numerales tabulares (`tabular-nums`) en distancias, tiempos de viaje, cantidades y subtotales.

---

## 3. Key Product Decisions & Trade-Offs

- **Decisión 1: OpenStreetMap Oficial + Filtro Nocturno CSS en lugar de CartoDB**
  - *Enfoque Elegido*: Usar `https://tile.openstreetmap.org/{z}/{x}/{y}.png` como fuente única de mosaicos y aplicar un filtro CSS exclusivamente sobre `.leaflet-tile-pane` cuando `data-theme="dark"` está activo, sin afectar marcadores, polilíneas ni etiquetas.
  - *Por qué*: CartoDB bloquea dominios en la nube con la marca de agua `API KEY REQUIRED`; OpenStreetMap oficial es abierto, gratuito y funciona en AI Studio y Vercel sin configuración extra.
- **Decisión 2: Inclusión de Comercios con 0 Pendientes con Atenuación Visual**
  - *Enfoque Elegido*: Construir la lista de paradas a partir de todos los comercios de la lista (tanto los que tienen productos pendientes como los que tienen únicamente productos comprados), asignando la propiedad `hasPendingItems` para diferenciar su estilo en el mapa y en el itinerario.
  - *Por qué*: Antes, al marcar todos los artículos como comprados, el comercio desaparecía por completo del mapa dando la impresión de que el mapa estaba vacío.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Storage & Route Engine                          │
│  DEFAULT_ORIGIN: Corrientes (-27.4692, -58.8306)                        │
│  Auto-migración de origen antiguo (Madrid ──► Corrientes)               │
└───────────────────┬─────────────────────────────────┬───────────────────┘
                    │                                 │
                    ▼                                 ▼
┌───────────────────────────────────────┐ ┌───────────────────────────────┐
│        calculateOptimalRoute()        │ │        Leaflet MapView        │
│ ┌───────────────────────────────────┐ │ │ ┌───────────────────────────┐ │
│ │ Agrupa TODOS los comercios:       │ │ │ │ OpenStreetMap Tiles       │ │
│ │ • Con pendientes (Resaltados)     │ │ │ │ (Sin API Key + Dark CSS)  │ │
│ │ • Con 0 pendientes (Más claros)   │ │ │ ├───────────────────────────┤ │
│ └───────────────────────────────────┘ │ │ │ Marcadores + Etiquetas    │ │
│                                       │ │ │ • Activos: Índigo sólido  │ │
│                                       │ │ │ • 0 pend.: Suave / Claro  │ │
│                                       │ │ └───────────────────────────┘ │
└───────────────────────────────────────┘ └───────────────────────────────┘
```

### Data Model & State

- **Origen Predeterminado (`DEFAULT_ORIGIN`)**: `lat: -27.469213`, `lng: -58.830635`, `address: 'Plaza 25 de Mayo, Corrientes, Argentina'`. Al leer `localStorage`, si el origen guardado coincide con la referencia antigua de Madrid (`40.416775, -3.703790`), se reemplaza automáticamente por Corrientes.
- **Modelo de Parada (`RouteStop`)**:
  - `pendingItems: ShoppingItem[]`: Artículos pendientes de compra en ese comercio.
  - `completedItems: ShoppingItem[]`: Artículos ya comprados en ese comercio.
  - `hasPending: boolean`: Indica si el comercio tiene al menos 1 artículo pendiente (`true` = resaltado normal; `false` = estilo claro/atenuado con `0 pendientes`).

### Interactive Component & State Mapping

- **Mapa y Marcadores**:
  - Los comercios con `hasPending === true` participan por defecto en el cálculo de la ruta vial OSRM y se dibujan con marcador índigo sólido (`#4f46e5`) y etiqueta fija completa.
  - Los comercios con `hasPending === false` (`0 pendientes`) también se ubican en el mapa con un marcador y etiqueta más claros (`map-pin-zero-pending`, `map-label-zero-pending`), y el usuario puede incluirlos o excluirlos del trazado vial con un clic en su casilla del itinerario.
  - Dentro de cada tarjeta del itinerario se muestran tanto los productos pendientes como los comprados (estos últimos tachados y más claros), permitiendo marcarlos o desmarcarlos en tiempo real.
