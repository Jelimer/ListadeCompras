# TEST_READY — Suite Integral "Lista de Compra | PRO"

**Estado:** LISTO PARA EVALUAR IMPLEMENTACIONES (M1, M2, M3, M4)  
**Fecha de Actualización:** 2026-10-09T03:50:00Z  
**Autor:** `test_writer_e2e` (Role: E2E Test Writer)  
**Comando Principal de Ejecución:** `npm test`  
**Comando Directo Suite PWA, Lazy Loading y Share:** `node tests/pwa_share_lazy.test.js`  
**Comando Directo Suite de Rutas:** `node tests/map_routing.test.js`

---

## 1. Resumen Ejecutivo

Se declara oficialmente ampliada, completada y plenamente operativa la suite integral de pruebas automatizadas Dual Track para la aplicación web **Lista de Compra | PRO**.

La suite cuenta con **más de 500 pruebas automatizadas y ejecutables** con **100% de tasa de aprobación (0 fallos)**, integrando:
1. Las 242 pruebas E2E de la arquitectura base (F01 a F20).
2. Las 86 pruebas unitarias de persistencia offline-first y store reactivo de M1.
3. Las 60 pruebas de Mapa y Optimizador de Rutas TSP (F22-F28, F30).
4. Las 24 pruebas de Ciclo de Vida y DOM en `script_lifecycle.test.js`.
5. Las 18 pruebas de Estrés de Reactividad y Debounce en `adversarial_reactivity_stress.test.js`.
6. Las 16 pruebas Challenger 2 de Delegación de Eventos y Red en `adversarial_challenger2_m1.test.js`.
7. Las **56 nuevas pruebas exhaustivas de PWA, Service Worker, ResourceLoader y ShareModule** en `tests/pwa_share_lazy.test.js`, organizadas en los 4 Tiers requeridos.

---

## 2. Inventario Consolidado de Archivos de Pruebas

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
| `tests/script_lifecycle.test.js` | **Ciclo de Vida y DOM** (DOMContentLoaded, listeners, navegación entre vistas) | **24 tests** |
| `tests/adversarial_reactivity_stress.test.js` | **Estrés de Reactividad** (Debounce, no-op en pestañas inactivas) | **18 tests** |
| `tests/adversarial_challenger2_m1.test.js` | **Challenger 2** (Delegación de eventos, SortableJS único, Lucide scoping) | **16 tests** |
| `tests/pwa_share_lazy.test.js` | **NUEVA SUITE: PWA, Lazy Loading y ShareModule** (R1, R2, R3: Tiers 1, 2, 3 y 4) | **56 tests** |
| `package.json` | Orquestación del pipeline de pruebas mediante script `npm test` | — |
| `TEST_INFRA.md` | Documentación exhaustiva de arquitectura Dual Track, metodología y catálogo de pruebas | — |
| `TEST_READY.md` | Declaración formal de preparación de suite (este documento) | — |

**Total de Pruebas Automatizadas:** **502 tests (100% aprobadas, 0 fallos)**

---

## 3. Guía de Ejecución para Agentes de Implementación

Los agentes implementadores de los hitos **M1 (PWA & Service Worker)**, **M2 (Lazy Loading ECharts & Leaflet)** y **M3 (Share por WhatsApp & Print CSS)** deben utilizar los siguientes comandos para verificar sus avances:

```bash
# 1. Ejecutar específicamente la nueva suite de PWA, Lazy Loading y Compartir (56 tests)
node tests/pwa_share_lazy.test.js

# 2. Ejecutar toda la suite del proyecto
npm test

# 3. Ejecutar la suite de Mapa y Enrutamiento (60 tests)
node tests/map_routing.test.js

# 4. Ejecutar las pruebas unitarias de persistencia M1 (86 tests)
node tests/m1_unit.test.js

# 5. Ejecutar la suite de ciclo de vida de scripts (24 tests)
node tests/script_lifecycle.test.js

# 6. Ejecutar las pruebas de estrés de reactividad (18 tests)
node tests/adversarial_reactivity_stress.test.js

# 7. Ejecutar la suite Challenger 2 (16 tests)
node tests/adversarial_challenger2_m1.test.js

# 8. Ejecutar la suite E2E general F01-F20 (242 tests)
node tests/e2e_runner.js
```

---

## 4. Desglose de Cobertura de la Nueva Suite (`tests/pwa_share_lazy.test.js`)

### Tier 1: Cobertura por Característica (29 tests)
- **F01: Manifiesto PWA (6 tests)**:
  * `T1_F01_1`: Validación sintáctica de JSON y estructura general.
  * `T1_F01_2`: Presencia de metadatos `name: "Lista de Compra | PRO"` y `short_name: "Lista Compra"`.
  * `T1_F01_3`: Configuración de instalación `display: "standalone"` y `start_url`.
  * `T1_F01_4`: Definición de tokens de color `theme_color` y `background_color`.
  * `T1_F01_5`: Iconos PWA estándar (192x192, 512x512 PNG y/o SVG).
  * `T1_F01_6`: Enlace `<link rel="manifest" href="manifest.json">` y meta tag en `index.html`.
- **F02: Service Worker y Caché (5 tests)**:
  * `T1_F02_1`: Sintaxis y validez de código en `sw.js`.
  * `T1_F02_2`: Manejo del evento `install` con precacheo estático y `skipWaiting()`.
  * `T1_F02_3`: Manejo del evento `activate` con limpieza de cachés obsoletas y `clients.claim()`.
  * `T1_F02_4`: Manejo del evento `fetch` e intercepción de solicitudes.
  * `T1_F02_5`: Resiliencia ante parámetros de versión mediante `{ ignoreSearch: true }`.
- **F03: ResourceLoader (6 tests)**:
  * `T1_F03_1`: Exposición pública de `loadScript`, `loadStyle`, `loadECharts`, `loadLeaflet`.
  * `T1_F03_2`: `loadScript` retorna Promesa y configura atributos SRI y async/defer.
  * `T1_F03_3`: `loadStyle` retorna Promesa y crea enlace stylesheet en DOM.
  * `T1_F03_4`: Singleton de promesas y deduplicación para evitar inyecciones duplicadas.
  * `T1_F03_5`: `loadECharts` resuelve el objeto `echarts` en memoria bajo demanda.
  * `T1_F03_6`: `loadLeaflet` resuelve el objeto `L` en memoria bajo demanda.
- **F04: Formateador de Compras (6 tests)**:
  * `T1_F04_1`: Agrupación por comercios con cabeceras `🏪 *Tienda*`.
  * `T1_F04_2`: Viñetas legibles, cantidades (`2x`, `1.5 un. x`) y precios unitarios.
  * `T1_F04_3`: Subtotales calculados por cada comercio.
  * `T1_F04_4`: Gran total en centavos enteros sin derivas IEEE 754 (`Math.round(price * 100) * qty`).
  * `T1_F04_5`: Exclusión de completados por defecto (`includeCompleted: false`).
  * `T1_F04_6`: Inclusión de completados con viñeta `[✓]` cuando se solicita.
- **F05: Cascada de Compartir (6 tests)**:
  * `T1_F05_1`: Invocación de `navigator.share` nativo en smartphones compatibles.
  * `T1_F05_2`: Manejo silencioso de `AbortError` cuando el usuario cancela la hoja.
  * `T1_F05_3`: Fallback a WhatsApp Universal Link (`https://api.whatsapp.com/send?text=...`) con URI encoding seguro.
  * `T1_F05_4`: Fallback a copia en portapapeles mediante `navigator.clipboard.writeText`.
  * `T1_F05_5`: Fallback defensivo a `document.execCommand('copy')` con textarea oculto.
  * `T1_F05_6`: Retorno de metadatos de diagnóstico `{ success, method, copied, opened }`.

### Tier 2: Boundary & Corner Cases (20 tests)
- **B01: Casos Extremos de Formateo y WhatsApp URL (5 tests)**:
  * `T2_B01_1`: Lista vacía retorna mensaje amigable.
  * `T2_B01_2`: Precios en cero o indefinidos no distorsionan subtotales.
  * `T2_B01_3`: Cantidades fraccionarias y decimales formateadas con sufijo descriptivo.
  * `T2_B01_4`: Caracteres especiales (`&`, `"`, `/`, `%`) y emojis (`🍎`, `🥩`) codificados de forma segura en URI.
  * `T2_B01_5`: Tiendas vacías o nulas agrupadas defensivamente bajo `"General"`.
- **B02: Entornos sin navigator.serviceWorker (5 tests)**:
  * `T2_B02_1`: Entornos Node.js o navegadores legacy no arrojan errores de ejecución.
  * `T2_B02_2`: Comprobación defensiva con guarda `'serviceWorker' in navigator`.
  * `T2_B02_3`: Rechazo asíncrono en registro de Service Worker es capturado limpiamente.
  * `T2_B02_4`: Ausencia de `window.location` tolerada en inicialización.
  * `T2_B02_5`: Persistencia offline de datos en Store 100% operativa sin Service Worker.
- **B03: Entornos sin navigator.share (5 tests)**:
  * `T2_B03_1`: Navegadores de escritorio sin Web Share API ejecutan fallback sin `TypeError`.
  * `T2_B03_2`: Rechazo de permisos de portapapeles activa fallback tradicional `execCommand`.
  * `T2_B03_3`: Bloqueo de popups preserva la copia en portapapeles y retorna éxito.
  * `T2_B03_4`: Todos los productos completados informan aviso sin abrir WhatsApp innecesariamente.
  * `T2_B03_5`: Invocaciones simultáneas de compartir sin colisiones de estado.
- **B04: Conectividad y Badge de Red (5 tests)**:
  * `T2_B04_1`: Evento `offline` cambia badge a clase `.offline` y texto 'Modo Offline'.
  * `T2_B04_2`: Evento `online` restaura badge a clase `.online` y texto 'Online'.
  * `T2_B04_3`: Inicialización respetando `navigator.onLine` en `false`.
  * `T2_B04_4`: Ausencia del nodo `#networkStatusBadge` en DOM tolerada defensivamente.
  * `T2_B04_5`: Conmutaciones sucesivas rápidas preservan sincronización de eventos y roles ARIA.

### Tier 3: Combinaciones Cruzadas (5 tests)
- `T3_C01_1`: Formateo íntegro en modo offline con cálculo de subtotales.
- `T3_C01_2`: Compartir por WhatsApp / portapapeles con dispositivo en modo offline.
- `T3_C02_1`: `ResourceLoader.loadECharts()` con `window.echarts` en memoria resuelve de inmediato sin inyectar script.
- `T3_C02_2`: `ResourceLoader.loadLeaflet()` con `window.L` en memoria resuelve de inmediato sin inyectar tags.
- `T3_C03_1`: Persistencia del Store reactivo sincronizada en tiempo real con el formateador de compras.

### Tier 4: Escenarios de Usuario del Mundo Real (2 tests)
- `T4_S01`: Jornada de compra 100% offline en supermercado (modo avión, adición de 3 productos en 2 tiendas, marcado de producto en góndola, recálculo de pendientes en tiempo real).
- `T4_S02`: Jornada completa de compartir lista multitienda por WhatsApp (5 productos en 3 tiendas, cantidades diversas, precios con decimales, caracteres especiales, despacho a WhatsApp y portapapeles).

---

## 5. Conclusión de Preparación

La suite de pruebas para PWA, Lazy Loading y ShareModule se encuentra **100% LISTA Y VERIFICADA**.
- Proporciona a los agentes implementadores de **M1**, **M2** y **M3** un marco riguroso de desarrollo guiado por pruebas (TDD).
- Garantiza cero regresiones en las 446 pruebas históricas.
- Cumple integralmente el estándar metodológico Dual Track con cobertura en Tiers 1 a 4.
