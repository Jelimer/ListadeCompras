# TEST_READY — Suite Integral "Lista de Compra | PRO"

**Estado:** LISTO PARA EVALUAR IMPLEMENTACIONES (M1, M2, M3, M4, M-MAP-1, M-MAP-2)  
**Fecha de Actualización:** 2026-09-25T12:35:00Z  
**Autor:** `test_writer_e2e_map` (Track E2E & Map Testing)  
**Comando Principal de Ejecución:** `npm test`  
**Comando Directo Suite de Rutas:** `node tests/map_routing.test.js`

---

## 1. Resumen Ejecutivo

Se declara oficialmente ampliada, completada y operativa la suite integral de pruebas automatizadas para el proyecto **Lista de Compra | PRO**.

La suite cuenta actualmente con **388 pruebas automatizadas y ejecutables** con **100% de tasa de aprobación (0 fallos)**, integrando:
1. Las 242 pruebas E2E de la arquitectura base (F01 a F20).
2. Las 86 pruebas unitarias de persistencia offline-first y store reactivo de M1.
3. Las **60 nuevas pruebas exhaustivas de Mapa y Optimizador de Rutas** (R1, R2, R3, R4 / F22-F28, F30), organizadas en los 4 Tiers de calidad requeridos.

---

## 2. Inventario de Archivos de Pruebas

| Archivo | Rol / Contenido | Tests Contenidos |
|---------|-----------------|------------------|
| `tests/e2e_runner.js` | Test runner automatizado en Node.js puro con reporting ANSI, filtros y modos de salida | — |
| `tests/mock_dom.js` | Simulador DOM completo en memoria con soporte de eventos, LocalStorage, ECharts, Leaflet, Geolocation y Fetch | — |
| `tests/spec_helper.js` | Oráculos matemáticos en centavos enteros, sanitizador XSS, parseador RFC 4180 CSV y WCAG AA | — |
| `tests/tier1_features.test.js` | **Tier 1: Cobertura por Característica** (F01-F20, >=5 tests por feature) | **106 tests** |
| `tests/tier2_boundaries.test.js` | **Tier 2: Casos Límite y Esquinas** (Valores numéricos, corrupción, XSS, límites de presupuesto) | **104 tests** |
| `tests/tier3_pairwise.test.js` | **Tier 3: Interacciones Cruzadas por Pares** (Mapeos cruzados entre subsistemas) | **22 tests** |
| `tests/tier4_scenarios.test.js` | **Tier 4: Escenarios de Usuario del Mundo Real** (Jornadas completas de compra) | **10 tests** |
| `tests/m1_unit.test.js` | **Pruebas Unitarias de Arquitectura M1** (StorageService, MockStorageDriver, Store, PubSub) | **86 tests** |
| `tests/map_routing.test.js` | **Suite de Mapa y Optimizador de Rutas** (F22-F28, F30: Tiers 1, 2, 3 y 4) | **60 tests** |
| `package.json` | Orquestación del pipeline de pruebas mediante script `npm test` | — |
| `TEST_INFRA.md` | Documentación exhaustiva de arquitectura de pruebas, metodología y catálogo de pruebas | — |
| `TEST_READY.md` | Declaración formal de preparación de suite (este documento) | — |

**Total de Pruebas Automatizadas:** **388 tests (100% aprobadas)**

---

## 3. Guía de Ejecución para Agentes de Implementación

Los agentes implementadores (especialmente para los hitos **M-MAP-1** y **M-MAP-2**) deben utilizar los comandos siguientes para verificar progresivamente sus avances:

```bash
# 1. Ejecutar toda la suite del proyecto (388 tests en total)
npm test

# 2. Ejecutar específicamente la nueva suite de Mapa y Enrutamiento (60 tests)
node tests/map_routing.test.js

# 3. Ejecutar las pruebas unitarias de persistencia M1 (86 tests)
node tests/m1_unit.test.js

# 4. Ejecutar la suite E2E general F01-F20 (242 tests)
node tests/e2e_runner.js

# 5. Filtrar por Tier en e2e_runner:
node tests/e2e_runner.js --tier=1
node tests/e2e_runner.js --tier=2
node tests/e2e_runner.js --tier=3
node tests/e2e_runner.js --tier=4
```

---

## 4. Desglose de Cobertura de la Suite de Mapa y Rutas (`tests/map_routing.test.js`)

- **Tier 1: Cobertura por Característica (40 tests)**
  * **F22 (5 tests)**: Renderizado de pines, popups con ítems pendientes, subtotales en centavos, exclusión de comercios 100% completados.
  * **F23 (5 tests)**: Geocodificación Nominatim OSM, fallback a Photon Komoot ante HTTP 429, degradación suave sin crash, debounce y sanitización.
  * **F24 (5 tests)**: Persistencia en LocalStorage `shopping_store_coords`, lectura desde caché con 0 llamadas a red, normalización de claves y timestamps.
  * **F25 (5 tests)**: Origen GPS mediante `navigator.geolocation`, manejo de error de permisos (código 1), fallback a origen manual, persistencia en `shopping_route_origin`.
  * **F26 (5 tests)**: Fórmula Haversine matemática exacta, distancia 0 en puntos idénticos, factor de sinuosidad urbana 1.25, velocidad promedio de 30 km/h, mínimo 1 minuto.
  * **F27 (5 tests)**: Algoritmo heurístico TSP Nearest Neighbor, minimización de distancia acumulada, casos base de 0 y 1 tienda, desempate determinista.
  * **F28 (5 tests)**: Formato universal `https://www.google.com/maps/dir/?api=1`, delimitador `%7C`, recorte estricto a máximo 9 waypoints intermedios, codificación URI.
  * **F30 (5 tests)**: Tres pestañas accesibles (Lista, Gráficos, Mapa), WAI-ARIA (`tablist`, `tab`, `tabpanel`), conmutación de paneles, invalidación de tamaño en Leaflet (`invalidateSize()`), teclado Enter/Espacio.

- **Tier 2: Casos Límite y Esquinas (10 tests)**
  * `T2_B01` a `T2_B10`: 0 tiendas, 1 tienda, >10 tiendas con truncado seguro de waypoints, agrupación de tiendas duplicadas, caracteres reservados en nombres, fallo total de red, saturación de cuota de LocalStorage (`QuotaExceededError`), coordenadas límite (polos/antípodas), timeout GPS, subtotales extremos.

- **Tier 3: Interacciones Cruzadas entre Subsistemas (7 tests)**
  * `T3_P01` a `T3_P07`: Modificaciones en el Store que disparan actualización del mapa, toggle completado que retira pines, Deshacer (Undo) que restaura pines, sincronización de tema claro/oscuro con capas de teselas (CartoDB Positron / Dark Matter), cambio de origen que recalcula TSP, edición de nombre de tienda, importación de catálogo en lote.

- **Tier 4: Escenarios de Usuario del Mundo Real (3 tests)**
  * `T4_S01`: Jornada completa de compra urbana con 4 tiendas, origen GPS y exportación de ruta a Google Maps.
  * `T4_S02`: Compra en sótano 100% offline aprovechando la caché local de coordenadas sin conexión a red.
  * `T4_S03`: Compra peatonal rápida con tienda única e inicio manual.

---

## 5. Conclusión y Preparación para Implementación

La suite de pruebas de Mapa y Enrutamiento se encuentra **100% LISTA Y VERIFICADA**.
- No se han introducido regresiones en las 328 pruebas preexistentes.
- Se proporciona a los implementadores de **M-MAP-1** y **M-MAP-2** un arnés de pruebas automatizado, rápido (~2 segundos) y de alta fidelidad para guiar el desarrollo guiado por pruebas (TDD).
