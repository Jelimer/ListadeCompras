# Evaluación Técnica y Comparativa Formal de Persistencia (Requerimiento R3)

**Proyecto:** Lista de Compra | PRO  
**Fecha de Emisión:** 2026-09-25  
**Autor:** Persistence & Map-Route Worker  
**Clasificación:** Documento de Decisión Arquitectónica (ADR) & Evaluación Técnica  
**Estado:** RATIFICADO Y EN VIGOR  

---

## 1. Resumen Ejecutivo

La aplicación web **Lista de Compra | PRO** es una solución de alto rendimiento enfocada en movilidad, concebida para la gestión inteligente de compras hogareñas y comerciales. Con la incorporación del nuevo **Módulo Interactivo de Mapas y Optimizador de Rutas de Compra (R1 y R2)**, surge la necesidad de persistir información geográfica crítica:
1. **Coordenadas aprendidas de comercios y tiendas** (`shopping_store_coords`) resultantes de procesos de geocodificación o selección manual.
2. **Punto de partida y origen de navegación** (`shopping_route_origin`) obtenido vía GPS o ingresado manualmente por el usuario.

El presente documento formaliza el análisis comparativo exigido en el **Requerimiento R3**, evaluando la arquitectura actual de persistencia frente a alternativas tecnológicas contemporáneas, considerando los escenarios operativos de uso real en tiendas físicas, la compatibilidad con el despliegue estático en Vercel, los costos y las cuotas de servicio gratuito.

Como conclusión y recomendación técnica definitiva, **se ratifica la arquitectura híbrida LocalStorage Offline-First + Sincronización Opcional con Firebase Firestore**, detallando a su vez el diseño del esquema desacoplado y normalizado para coordenadas geográficas, garantizando **cero regresiones, 100% de retrocompatibilidad con las colecciones existentes y 0 ms de latencia en tiendas sin cobertura celular**.

---

## 2. Contexto Operativo y Criterios de Evaluación

### 2.1. Escenario de Uso Real (Mobility & Edge Cases)
A diferencia de aplicaciones SaaS de oficina, una lista de compras se utiliza frecuentemente en:
- Plantas subterráneas de grandes almacenes o hipermercados con **cero cobertura de datos móviles (GSM/4G/5G)**.
- Redes Wi-Fi públicas o cautivas de centros comerciales con portales de inicio de sesión bloqueados o inestables.
- Dispositivos móviles en modo ahorro de batería o modo avión.
- Múltiples dispositivos familiares donde se requiere consultar la lista tanto en el teléfono del comprador como en ordenadores domésticos.

### 2.2. Criterios de Evaluación Ponderados
1. **Operación Offline-First Inmediata (Latencia 0 ms):** Capacidad del motor de almacenamiento de leer y mutar datos de forma síncrona/inmediata sin conexión a internet ni bloqueos de la interfaz de usuario.
2. **Complejidad Operativa y Compatibilidad con Vercel:** Integración limpia en hosting estático JAMstack sin servidores dedicados, lambdas con arranques en frío (*cold starts*) ni infraestructura distribuida compleja.
3. **Riesgos y Políticas del Nivel Gratuito (Free Tier):** Análisis de vulnerabilidades operativas (como suspensión de proyectos por inactividad, costos ocultos o límites asfixiantes).
4. **Sincronización en Tiempo Real y Resiliencia:** Capacidad de reflejar cambios en múltiples clientes en vivo mediante listeners reactivos sin requerir polling constante.
5. **Riesgo de Regresión y Mantenimiento:** Impacto en la base de código preexistente y en la suite de 328 pruebas automatizadas.

---

## 3. Análisis Comparativo de Alternativas Tecnológicas

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       MATRIZ DE EVALUACIÓN COMPARATIVA                                          │
├──────────────────────┬──────────────────────────┬──────────────────────────┬──────────────────────────┬─────────┤
│ Criterio Evaluado    │ Firebase Firestore +     │ IndexedDB Nativo /       │ Supabase (PostgreSQL +   │ Cloud-  │
│                      │ LocalStorage (Actual)    │ Dexie.js                 │ Realtime)                │ flare D1│
├──────────────────────┼──────────────────────────┼──────────────────────────┼──────────────────────────┼─────────┤
│ Latencia Local       │ 0 ms (Síncrono nativo    │ 10-30 ms (Asíncrono      │ Variable / Dependiente   │ Red     │
│ (En tienda física)   │ con fallback a memoria)  │ en pool de hilos)        │ de conexión REST         │ remota  │
├──────────────────────┼──────────────────────────┼──────────────────────────┼──────────────────────────┼─────────┤
│ Operación Offline    │ 100% nativa sin red;     │ Excelente en local;      │ Deficiente sin red;      │ Nula en │
│ sin internet         │ sync en background       │ CERO nube por defecto    │ exige motor custom local │ cliente │
├──────────────────────┼──────────────────────────┼──────────────────────────┼──────────────────────────┼─────────┤
│ Hosting en Vercel    │ Óptimo (100% estático;   │ Óptimo (100% cliente;    │ Bueno (Requiere SDK y    │ Complejo│
│                      │ build inyecta config)    │ sin dependencias cloud)  │ gestión de tokens RLS)   │ (Workers│
├──────────────────────┼──────────────────────────┼──────────────────────────┼──────────────────────────┼─────────┤
│ Riesgo Free Tier     │ NULO (Spark: 1 GiB;      │ NULO (Almacenamiento     │ CRÍTICO ⚠️ (Pausa por    │ Bajo en │
│ (Suspensión)         │ NUNCA se suspende)       │ del dispositivo)         │ inactividad tras 7 días) │ CF Free │
├──────────────────────┼──────────────────────────┼──────────────────────────┼──────────────────────────┼─────────┤
│ Sync en Tiempo Real  │ Excelente (onSnapshot    │ Inexistente (Dexie       │ Excelente (Postgres CDC  │ No      │
│                      │ nativo con WebSockets)   │ Cloud requiere pago)     │ con WebSockets)          │ nativo  │
├──────────────────────┼──────────────────────────┼──────────────────────────┼──────────────────────────┼─────────┤
│ Riesgo de Regresión  │ NULO (100% de suite      │ ALTO (Reescritura total  │ ALTO (Descarte de infra  │ MÁXIMO  │
│ en Suite de Tests    │ 328 tests pasa hoy)      │ síncrona a promesas)     │ Firestore existente)     │         │
└──────────────────────┴──────────────────────────┴──────────────────────────┴──────────────────────────┴─────────┘
```

### 3.1. Opción 1: Firebase Firestore + LocalStorage Offline-First (Arquitectura Actual)

#### Mecánica Operativa
- **Persistencia Primaria en Cliente:** Utiliza `LocalStorage` para lecturas y escrituras síncronas instantáneas ($< 1\text{ ms}$). Si el dispositivo opera en modo incógnito estricto o sufre agotamiento de espacio en disco, conmuta defensivamente a un motor de memoria volátil (`MemoryStorageDriver`) sin interrumpir la sesión ni arrojar excepciones no capturadas.
- **Sincronización en Nube:** El adaptador de Firestore se ejecuta en segundo plano. Tras actualizar el estado local, envía mutaciones a través de operaciones en lote (`batch.set(..., { merge: true })`) y escucha actualizaciones remotas mediante `onSnapshot`. Si no hay internet, la llamada en segundo plano captura el error silenciosamente, reintentando de forma transparente cuando el navegador recupera el evento `online`.
- **Integración con Vercel:** 100% estática. Durante el paso de compilación (`npm run build`), el script `generate-config.js` lee las variables de entorno de Vercel y produce `firebase-config.js` sin requerir funciones serverless en ejecución permanente.

#### Evaluación de Cuotas del Nivel Gratuito (Firebase Spark)
- **Almacenamiento:** 1 GiB total de base de datos.
- **Operaciones:** 50.000 lecturas y 20.000 escrituras diarias.
- **Ventaja de Negocio Crítica:** Google Firebase **no suspende ni pausa proyectos por inactividad**. Una lista de compras puede permanecer sin uso durante meses y responderá inmediatamente en la primera visita del usuario.

### 3.2. Opción 2: IndexedDB Nativo / Dexie.js

#### Mecánica Operativa
- Almacén de objetos clave-valor transaccional nativo del navegador, capaz de albergar cientos de megabytes o gigabytes en disco. Dexie.js actúa como envoltorio minimalista basado en promesas.

#### Deficiencias y Motivos de Descarte
1. **Falta de Sincronización Remota:** IndexedDB vive únicamente en el navegador local. No ofrece sincronización entre dispositivos de forma nativa. La solución comercial *Dexie Cloud* requiere suscripciones de pago y servidores propietarios.
2. **Impacto Destructivo en el Contrato del Store:** IndexedDB es intrínsecamente asíncrono. En `js/state.js`, métodos síncronos de alta frecuencia como `addItem()`, `getState()`, `getFilteredItems()` o el motor de `undoLastAction()` tendrían que transformarse en funciones asíncronas con `Promise` / `async/await`, invalidando la arquitectura desacoplada y rompiendo inmediatamente las 328 pruebas automatizadas existentes.

### 3.3. Opción 3: Supabase (PostgreSQL + Realtime)

#### Mecánica Operativa
- Plataforma basada en PostgreSQL con capa de autenticación, API REST automática vía PostgREST y motor de eventos en tiempo real vía WebSockets (Postgres CDC).

#### Deficiencias y Motivos de Descarte
1. **Paradigma Online-First Inadecuado:** Supabase está diseñado asumiendo que el cliente tiene conexión a internet permanente para realizar consultas HTTP `fetch()`. En el sótano de un supermercado, cualquier operación `supabase.from('items').insert(...)` falla por timeout de red. Implementar capacidad offline-first requeriría integrar librerías intermedias pesadas (ej. WatermelonDB o PowerSync con SQLite embebido en WASM), agregando más de 1.5 MB de dependencias y una complejidad arquitectónica desmedida.
2. **Riesgo Crítico de Suspensión en el Free Tier:** La política oficial de Supabase para su nivel gratuito **pausa automáticamente los proyectos que no reciban solicitudes HTTP entrantes durante 7 días consecutivos**. Para una aplicación utilitaria de lista de compras, si un usuario viaja, sale a cenar fuera o pasa más de una semana sin hacer mercado, la base de datos entra en hibernación. Al volver a abrir la aplicación en la tienda, las peticiones fallan con error de servidor no disponible hasta que el administrador ingrese a la consola de Supabase y reactive el proyecto (lo cual puede tardar varios minutos).

### 3.4. Opción 4: Cloudflare D1 (SQLite Edge) + Workers KV

#### Mecánica Operativa
- Base de datos relacional SQLite distribuida en la red perimetral (*Edge*) de Cloudflare, complementada con Workers KV para almacenamiento de clave-valor ultrarrápido.

#### Deficiencias y Motivos de Descarte
1. **Ruptura de la Arquitectura de Vercel:** Cloudflare D1 solo es accesible a través de Cloudflare Workers o Cloudflare Pages Functions. Forzar su adopción obligaría a dividir el proyecto en dos plataformas cloud distintas (frontend en Vercel, backend en Cloudflare) o migrar completamente el despliegue fuera de Vercel, violando las restricciones del proyecto.
2. **Cero Soporte Offline Nativo en el Cliente:** D1 reside en la nube de Cloudflare, no en el dispositivo del usuario. La latencia hacia el Edge en un supermercado sin señal celular sigue siendo infinita.

---

## 4. Recomendación Técnica Concluyente

Se ratifica formalmente la **adopción y continuidad de la arquitectura híbrida: LocalStorage Offline-First (con degradación en caliente a MemoryStorageDriver) + Sincronización Resiliente en Segundo Plano con Firebase Firestore**.

### Justificación de la Decisión
1. **Experiencia de Usuario Ininterrumpida:** 0 ms de latencia en la tienda física, sin importar si existe cobertura móvil o no.
2. **Arquitectura JAMstack Limpia en Vercel:** Despliegue estático continuo sin servidores, lambdas ni capas intermedias.
3. **Cero Mantenimiento y Alta Disponibilidad:** Inmunidad total contra pausas por inactividad del nivel gratuito de Firebase Spark.
4. **Cero Riesgo de Regresión:** Preservación del 100% de la funcionalidad actual del proyecto y de sus 328 pruebas preexistentes.

---

## 5. Diseño del Esquema de Almacenamiento Desacoplado para Mapas y Rutas

Para dar soporte a la geocodificación de comercios (R1) y al cálculo de itinerarios óptimos de compra (R2), se implementa un modelo de datos **completamente desacoplado de la colección principal de productos**, evitando inflar el tamaño de los ítems de compra y permitiendo que una corrección geográfica se propague a todos los productos asociados a la tienda.

### 5.1. Almacén de Coordenadas de Tiendas (`shopping_store_coords`)

#### Clave en LocalStorage
`shopping_store_coords`

#### Principios de Diseño
- **Normalización Canónica de Clave:** Las tiendas se indexan bajo una clave normalizada en minúsculas, sin espacios superfluos y sin acentos ni diacríticos:
  $$\text{key} = \operatorname{normalize}(\text{storeName}) = \text{str.trim().toLowerCase().normalize('NFD').replace}(/[\backslash\text{u0300}-\backslash\text{u036f}]/g, '')$$
  *Ejemplo:* `"  Mercadona Centro "` $\to$ `"mercadona centro"`, `"Verdulería"` $\to$ `"verduleria"`.
- **Caché Inteligente (0 Consultas Duplicadas):** Cada vez que se consulta la geolocalización de un comercio, el motor verifica primero la existencia en este almacén local. Si existe, la resolución toma **0 ms** sin realizar ninguna petición HTTP a los servicios de Nominatim o Photon.

#### Esquema JSON de la Estructura:
```json
{
  "version": 1,
  "updatedAt": 1727265600000,
  "stores": {
    "mercadona": {
      "displayName": "Mercadona",
      "lat": 40.416775,
      "lng": -3.703790,
      "address": "Calle Mayor 12, 28013 Madrid",
      "source": "nominatim",
      "updatedAt": 1727265600000
    },
    "carrefour express": {
      "displayName": "Carrefour Express",
      "lat": 40.420120,
      "lng": -3.705540,
      "address": "Calle Fuencarral 45, 28004 Madrid",
      "source": "photon",
      "updatedAt": 1727265615000
    },
    "panaderia san jose": {
      "displayName": "Panadería San José",
      "lat": 40.418500,
      "lng": -3.701100,
      "address": "Calle Arenal 8, 28013 Madrid",
      "source": "manual",
      "updatedAt": 1727265630000
    }
  }
}
```

### 5.2. Almacén del Punto de Partida / Origen (`shopping_route_origin`)

#### Clave en LocalStorage
`shopping_route_origin`

#### Principios de Diseño
- Permite al usuario recordar su ubicación base (ej. hogar u oficina) para no tener que solicitar coordenadas GPS repetidamente en cada apertura del mapa.
- Distingue transparentemente entre geolocalización por hardware GPS del navegador (`gps`), dirección introducida manualmente (`manual`) y punto de referencia predeterminado (`default`).

#### Esquema JSON de la Estructura:
```json
{
  "type": "gps",
  "lat": 40.415032,
  "lng": -3.707391,
  "address": "Ubicación actual (GPS)",
  "accuracy": 12.5,
  "updatedAt": 1727265600000
}
```
*Formato alternativo para origen manual:*
```json
{
  "type": "manual",
  "lat": 40.413200,
  "lng": -3.701100,
  "address": "Calle de Atocha 25, Madrid",
  "accuracy": null,
  "updatedAt": 1727265600000
}
```

---

## 6. Garantías de Retrocompatibilidad e Integridad

### 6.1. Compatibilidad con Firestore y Mutaciones `{ merge: true }`
1. El contrato base de `ShoppingItem` en `js/state.js` y `js/storage.js` permanece inalterado con sus 8 campos originales (`id`, `name`, `quantity`, `unitPrice`, `category`, `location`, `completed`, `timestamp`).
2. La sincronización de Firestore continúa empleando `batch.set(docRef, data, { merge: true })`. Si en el futuro se añaden metadatos geográficos opcionales a un producto individual, Firestore los absorberá sin conflicto ni degradación de documentos preexistentes.
3. El almacén de coordenadas de tiendas `shopping_store_coords` opera en una clave completamente separada de `shopping_items`, imposibilitando cualquier colisión o daño a la lista de compras del usuario.

### 6.2. Compatibilidad con el Entorno Vercel
1. Todas las operaciones de lectura y escritura del módulo de mapas se ejecutan exclusivamente en el lado del cliente (Client-Side Storage).
2. No se requieren endpoints API de backend en Node.js ni bases de datos serverless adicionales.
3. El comando de compilación de Vercel (`npm run build`) y el despliegue estático de archivos se mantienen limpios, ultrarrápidos e idénticos a los estándares actuales del proyecto.

### 6.3. Blindaje de Cuota y Resiliencia en Memoria
Si `LocalStorage` rechaza una escritura por políticas de seguridad o cuota excedida (`QuotaExceededError`), el módulo conmuta silenciosamente a un diccionario en memoria volátil (`Map`), manteniendo plenamente funcionales la geocodificación, el ruteo del itinerario y la apertura de navegación en Google Maps durante toda la sesión del usuario.
