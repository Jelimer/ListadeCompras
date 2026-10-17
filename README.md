# Lista de Compra | PRO

Una aplicación moderna y completa en React + TypeScript y Vite para la gestión avanzada de listas de compra, optimización inteligente de rutas con OpenStreetMap / Google Maps Navigation, y análisis financiero interactivo con Apache ECharts.

## Características Principales

- **Gestión Avanzada de Compras**: Agrupación inteligente por comercios o supermercados, categorización automática con avatares visuales, edición rápida en línea, ordenamiento personalizado de comercios y conmutación entre vista de lista y cuadrícula.
- **Productos "Por averiguar / Sin lugar asignado"**: Detección inteligente de productos ingresados sin comercio o con estado pendiente ("Por averiguar", "Sin asignar") con asignación rápida y directa a cualquier tienda.
- **Ruta en Mapa con Optimización TSP (Nearest Neighbor)**:
  - Fijación de punto de partida manual o por geolocalización GPS.
  - Estimación precisa de distancia y tiempos con factor de sinuosidad urbana.
  - Optimización automática de visitas (Travelling Salesperson Problem).
  - Integración nativa con Google Maps Navigation con soporte para waypoints intermedios.
  - Gestor de Viajes de Compra ("Mis Viajes") para crear, renombrar y filtrar comercios incluidos.
  - Selección visual directa de tiendas en el mapa y geocodificación automática resiliente (Nominatim + Photon).
- **Estadísticas Financieras**:
  - Control de presupuesto con barra de progreso y alertas visuales de exceso.
  - Gráfico interactivo con Apache ECharts de unidades por categoría y comercio.
  - Cálculo de precisión entera en centavos para eliminar derivas de coma flotante.
- **Exportación, Importación y Compartición**:
  - Exportación en JSON estructurado y CSV compatible con RFC 4180 y BOM UTF-8 para apertura directa en Microsoft Excel.
  - Importación y validación de archivos JSON y CSV.
  - Compartición de listas con formato enriquecido para WhatsApp, Portapapeles y Web Share API.
  - Modo de impresión optimizado con hoja de resumen limpio para PDF.
- **Pila de Deshacer (Undo)**: Reversión instantánea de eliminaciones, ediciones o cambios accidentales.
- **Accesibilidad y Modo Oscuro**: Cumplimiento WCAG AA/AAA, diseño adaptable a dispositivos móviles con barra inferior de navegación y modo oscuro persistente.

## Pila Tecnológica

- **Framework**: React 19 + TypeScript
- **Bundler**: Vite
- **Estilos**: Sistema de diseño con tokens CSS accesibles WCAG AA / AAA
- **Mapas**: Leaflet + OpenStreetMap & CARTO Dark tiles
- **Gráficos**: Apache ECharts
- **Iconos**: Lucide React
- **Celebración**: Canvas Confetti
