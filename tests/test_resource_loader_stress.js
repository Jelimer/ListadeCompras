/**
 * tests/test_resource_loader_stress.js
 * ============================================================================
 * Suite de Pruebas Adversarial, de Estrés y Verificación Empírica
 * Módulo: js/resource-loader.js
 * 
 * Rol: challenger_m2_1 (Challenger M2 ResourceLoader Stress)
 * Directrices:
 * 1. Concurrencia masiva: 50 llamadas simultáneas a loadScript y loadStyle (reutilización de promesa, 1 solo tag DOM, assert.strictEqual).
 * 2. Fallo y Reintento: simulación de error de red, verificación de desalojo de Map (_loadedScripts / _loadedStyles) y segundo intento exitoso.
 * 3. Soporte SRI: verificación rigurosa de integrity y crossOrigin="anonymous".
 * 4. Bypass en memoria: fast-path sin mutación del DOM cuando window.echarts o window.L ya existen.
 * 5. Análisis Adversarial Adicional: detección de carrera por setTimeout(0) incondicional y contaminación de singleton.
 * ============================================================================
 */

const assert = require('node:assert');
const path = require('node:path');
const { createTestEnvironment, DOMDocument, DOMElement } = require('./mock_dom.js');
const ResourceLoader = require('../js/resource-loader.js');

// ---------------------------------------------------------------------------
// Configuración y Contadores de Prueba
// ---------------------------------------------------------------------------
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failedTests++;
    failures.push({ name, error: err });
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.stack || err.message}`);
  }
}

async function describe(title, fn) {
  console.log(`\n============================================================`);
  console.log(`STRESS SUITE: ${title}`);
  console.log(`============================================================`);
  await fn();
}

/**
 * Helper para aislar el singleton ResourceLoader entre pruebas
 */
function resetResourceLoader() {
  if (ResourceLoader._loadedScripts) ResourceLoader._loadedScripts.clear();
  if (ResourceLoader._loadedStyles) ResourceLoader._loadedStyles.clear();
}

// ---------------------------------------------------------------------------
// EJECUCIÓN PRINCIPAL DE PRUEBAS
// ---------------------------------------------------------------------------
async function runSuite() {
  console.log('Iniciando batería de estrés adversarial para js/resource-loader.js...\n');

  // =========================================================================
  // PILAR 1: CONCURRENCIA MASIVA (50 LLAMADAS SIMULTÁNEAS)
  // =========================================================================
  await describe('Pilar 1 — Concurrencia Masiva (50 Llamadas Simultáneas)', async () => {

    await test('P1.1: 50 llamadas simultáneas a loadScript para la misma URL generan 1 sola Promesa idéntica', async () => {
      resetResourceLoader();
      const env = createTestEnvironment();
      const testUrl = 'https://cdn.example.com/vendor/heavy-library.js';
      const CALL_COUNT = 50;

      const promises = [];
      for (let i = 0; i < CALL_COUNT; i++) {
        promises.push(ResourceLoader.loadScript(testUrl, { document: env.document }));
      }

      // Verificación síncrona inmediata: todas las promesas deben ser estrictamente la misma referencia
      for (let i = 1; i < CALL_COUNT; i++) {
        assert.strictEqual(
          promises[i],
          promises[0],
          `La llamada #${i} debe compartir exactamente la misma referencia de Promesa que la llamada #0`
        );
      }

      // Esperar resolución
      const results = await Promise.all(promises);

      // Verificación de resolución: todas deben resolver al mismo objeto HTMLScriptElement
      for (let i = 1; i < CALL_COUNT; i++) {
        assert.strictEqual(
          results[i],
          results[0],
          `El resultado resuelto #${i} debe ser idéntico por referencia al resultado #0`
        );
      }

      // Verificación DOM: exactamente 1 nodo <script> creado en el documento
      const scriptElements = env.document.head.getElementsByTagName('script');
      assert.strictEqual(
        scriptElements.length,
        1,
        `Se esperaba exactamente 1 elemento <script> en el DOM, pero se encontraron ${scriptElements.length}`
      );
      assert.strictEqual(scriptElements[0].src, testUrl, 'La URL del script en el DOM debe coincidir');
    });

    await test('P1.2: 50 llamadas simultáneas a loadStyle para la misma URL generan 1 sola Promesa idéntica', async () => {
      resetResourceLoader();
      const env = createTestEnvironment();
      const testUrl = 'https://cdn.example.com/vendor/heavy-style.css';
      const CALL_COUNT = 50;

      const promises = [];
      for (let i = 0; i < CALL_COUNT; i++) {
        promises.push(ResourceLoader.loadStyle(testUrl, { document: env.document }));
      }

      // Verificación síncrona inmediata
      for (let i = 1; i < CALL_COUNT; i++) {
        assert.strictEqual(
          promises[i],
          promises[0],
          `La llamada de estilo #${i} debe retornar la misma Promesa que la #0`
        );
      }

      const results = await Promise.all(promises);

      // Verificación de resolución
      for (let i = 1; i < CALL_COUNT; i++) {
        assert.strictEqual(
          results[i],
          results[0],
          `El elemento <link> resuelto #${i} debe ser idéntico al #0`
        );
      }

      // Verificación DOM: exactamente 1 nodo <link> creado en el documento
      const linkElements = env.document.head.getElementsByTagName('link');
      assert.strictEqual(
        linkElements.length,
        1,
        `Se esperaba exactamente 1 elemento <link> en el DOM, pero se encontraron ${linkElements.length}`
      );
      assert.strictEqual(linkElements[0].href, testUrl, 'La URL del estilo en el DOM debe coincidir');
      assert.strictEqual(linkElements[0].rel, 'stylesheet', 'rel debe ser stylesheet');
    });

    await test('P1.3: Concurrencia entrelazada con 2 URLs distintas (25 llamadas c/u) no produce colisiones cruzadas', async () => {
      resetResourceLoader();
      const env = createTestEnvironment();
      const urlA = 'https://cdn.example.com/lib-A.js';
      const urlB = 'https://cdn.example.com/lib-B.js';

      const promisesA = [];
      const promisesB = [];

      for (let i = 0; i < 25; i++) {
        promisesA.push(ResourceLoader.loadScript(urlA, { document: env.document }));
        promisesB.push(ResourceLoader.loadScript(urlB, { document: env.document }));
      }

      // Las promesas dentro de cada grupo deben ser idénticas
      for (let i = 1; i < 25; i++) {
        assert.strictEqual(promisesA[i], promisesA[0]);
        assert.strictEqual(promisesB[i], promisesB[0]);
      }

      // Las promesas entre grupos distintos deben ser completamente independientes
      assert.notStrictEqual(promisesA[0], promisesB[0], 'Las promesas de URLs distintas deben ser diferentes');

      const [resA, resB] = await Promise.all([Promise.all(promisesA), Promise.all(promisesB)]);

      assert.strictEqual(resA[0].src, urlA);
      assert.strictEqual(resB[0].src, urlB);

      const allScripts = env.document.head.getElementsByTagName('script');
      assert.strictEqual(allScripts.length, 2, 'Deben existir exactamente 2 scripts en el DOM');
    });

    await test('P1.4: 50 llamadas simultáneas a loadECharts() descargan exactamente 1 script y resuelven la misma instancia', async () => {
      resetResourceLoader();
      const env = createTestEnvironment();
      delete env.window.echarts; // Asegurar entorno frío sin cache en memoria

      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(ResourceLoader.loadECharts({ window: env.window, document: env.document }));
      }

      const results = await Promise.all(promises);
      assert.strictEqual(results.length, 50);

      // Todos los llamantes reciben la misma instancia o firma válida
      for (let i = 1; i < 50; i++) {
        assert.strictEqual(results[i], results[0]);
      }

      const scripts = env.document.head.getElementsByTagName('script');
      assert.strictEqual(scripts.length, 1, 'Debe insertarse exactamente 1 script para ECharts');
      assert.ok(scripts[0].src.includes('echarts'), 'El src debe apuntar al CDN de ECharts');
    });

    await test('P1.5: 50 llamadas simultáneas a loadLeaflet() insertan exactamente 1 CSS y 1 JS en el DOM', async () => {
      resetResourceLoader();
      const env = createTestEnvironment();
      delete env.window.L; // Entorno frío

      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(ResourceLoader.loadLeaflet({ window: env.window, document: env.document }));
      }

      const results = await Promise.all(promises);
      assert.strictEqual(results.length, 50);

      for (let i = 1; i < 50; i++) {
        assert.strictEqual(results[i], results[0]);
      }

      const links = env.document.head.getElementsByTagName('link');
      const scripts = env.document.head.getElementsByTagName('script');

      assert.strictEqual(links.length, 1, 'Debe existir exactamente 1 tag <link> de Leaflet');
      assert.strictEqual(scripts.length, 1, 'Debe existir exactamente 1 tag <script> de Leaflet');
      assert.ok(links[0].href.includes('leaflet.css'));
      assert.ok(scripts[0].src.includes('leaflet.js'));
    });
  });

  // =========================================================================
  // PILAR 2: FALLO Y REINTENTO (ERROR HANDLING & MAP EVICTION)
  // =========================================================================
  await describe('Pilar 2 — Fallo y Reintento (Limpieza de Map y Recuperación)', async () => {

    await test('P2.1: Error de red en loadScript limpia _loadedScripts y permite un segundo intento exitoso', async () => {
      resetResourceLoader();
      const env = createTestEnvironment();
      const failingUrl = 'https://cdn.example.com/unstable-script.js';
      let shouldFail = true;

      // Interceptar appendChild para inyectar simulación de fallo determinista
      const originalAppend = env.document.head.appendChild.bind(env.document.head);
      env.document.head.appendChild = function (child) {
        originalAppend(child);
        if (child.tagName === 'SCRIPT' && shouldFail) {
          // Simular fallo de red inmediato
          child.onerror(new Error('Network error 404: Script not found'));
        }
      };

      // Intento 1: Debe fallar
      let attempt1Error = null;
      try {
        await ResourceLoader.loadScript(failingUrl, { document: env.document });
      } catch (err) {
        attempt1Error = err;
      }

      assert.ok(attempt1Error !== null, 'El primer intento debía fallar con una excepción');
      assert.ok(
        attempt1Error.message.includes('Error cargando script') || attempt1Error.message.includes('Network error'),
        'El mensaje de error debe reflejar el fallo de carga'
      );

      // Verificación crítica: La URL debe haber sido eliminada de _loadedScripts
      assert.strictEqual(
        ResourceLoader._loadedScripts.has(failingUrl),
        false,
        'La URL que falló debe ser desalojada del Map _loadedScripts para permitir reintentos'
      );

      // Intento 2: Reparamos la condición de red
      shouldFail = false;
      let attempt2Result = null;
      try {
        attempt2Result = await ResourceLoader.loadScript(failingUrl, { document: env.document });
      } catch (err) {
        assert.fail(`El reintento no debía fallar, pero arrojó: ${err.message}`);
      }

      assert.ok(attempt2Result !== null, 'El segundo intento debe resolver con éxito');
      assert.strictEqual(attempt2Result.src, failingUrl, 'El script resuelto debe tener la URL correcta');
      assert.strictEqual(
        ResourceLoader._loadedScripts.has(failingUrl),
        true,
        'Tras el éxito, la URL debe quedar registrada en _loadedScripts'
      );

      // Se deben haber intentado 2 inserciones en el DOM en total
      const scripts = env.document.head.getElementsByTagName('script');
      assert.strictEqual(scripts.length, 2, 'Deben existir 2 nodos script (1 fallido + 1 exitoso)');
    });

    await test('P2.2: Error de red en loadStyle limpia _loadedStyles y permite un segundo intento exitoso', async () => {
      resetResourceLoader();
      const env = createTestEnvironment();
      const failingStyleUrl = 'https://cdn.example.com/unstable-style.css';
      let shouldFail = true;

      const originalAppend = env.document.head.appendChild.bind(env.document.head);
      env.document.head.appendChild = function (child) {
        originalAppend(child);
        if (child.tagName === 'LINK' && shouldFail) {
          child.onerror(new Error('CSS CDN 503 Service Unavailable'));
        }
      };

      // Intento 1: Fallo
      let attempt1Error = null;
      try {
        await ResourceLoader.loadStyle(failingStyleUrl, { document: env.document });
      } catch (err) {
        attempt1Error = err;
      }

      assert.ok(attempt1Error !== null, 'El estilo debía fallar');
      assert.strictEqual(
        ResourceLoader._loadedStyles.has(failingStyleUrl),
        false,
        'La URL de estilo debe ser desalojada del Map _loadedStyles'
      );

      // Intento 2: Éxito
      shouldFail = false;
      let attempt2Result = null;
      try {
        attempt2Result = await ResourceLoader.loadStyle(failingStyleUrl, { document: env.document });
      } catch (err) {
        assert.fail(`El reintento de estilo falló: ${err.message}`);
      }

      assert.ok(attempt2Result !== null);
      assert.strictEqual(attempt2Result.href, failingStyleUrl);
      assert.strictEqual(ResourceLoader._loadedStyles.has(failingStyleUrl), true);
    });

    await test('P2.3: Múltiples llamadas concurrentes ante un fallo todas rechazan y desalojan el Map', async () => {
      resetResourceLoader();
      const env = createTestEnvironment();
      const badUrl = 'https://cdn.example.com/always-broken.js';

      const originalAppend = env.document.head.appendChild.bind(env.document.head);
      env.document.head.appendChild = function (child) {
        originalAppend(child);
        if (child.tagName === 'SCRIPT') {
          child.onerror(new Error('Fatal 500'));
        }
      };

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(ResourceLoader.loadScript(badUrl, { document: env.document }));
      }

      const results = await Promise.allSettled(promises);
      assert.strictEqual(results.length, 10);

      // Todas las promesas concurrentes deben ser rechazadas
      for (let i = 0; i < 10; i++) {
        assert.strictEqual(results[i].status, 'rejected', `La promesa #${i} debió ser rechazada`);
      }

      assert.strictEqual(
        ResourceLoader._loadedScripts.has(badUrl),
        false,
        'El Map debe permanecer limpio tras el rechazo simultáneo'
      );
    });
  });

  // =========================================================================
  // PILAR 3: SOPORTE SRI Y ATRIBUTOS DE SEGURIDAD
  // =========================================================================
  await describe('Pilar 3 — Soporte SRI e Integridad de Seguridad', async () => {

    await test('P3.1: integrity configurado establece script.integrity y crossOrigin="anonymous" por defecto', async () => {
      resetResourceLoader();
      const env = createTestEnvironment();
      const url = 'https://cdn.example.com/sri-test.js';
      const hash = 'sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC';

      const script = await ResourceLoader.loadScript(url, {
        document: env.document,
        integrity: hash
      });

      assert.strictEqual(script.integrity, hash, 'El atributo integrity debe coincidir exactamente');
      assert.strictEqual(script.crossOrigin, 'anonymous', 'crossOrigin debe ser anonymous por defecto al tener integrity');
    });

    await test('P3.2: crossOrigin explícito tiene precedencia sobre el valor por defecto en scripts', async () => {
      resetResourceLoader();
      const env = createTestEnvironment();
      const url = 'https://cdn.example.com/cors-test.js';
      const hash = 'sha256-abc123mock';

      const script = await ResourceLoader.loadScript(url, {
        document: env.document,
        integrity: hash,
        crossOrigin: 'use-credentials'
      });

      assert.strictEqual(script.integrity, hash);
      assert.strictEqual(script.crossOrigin, 'use-credentials', 'crossOrigin explícito debe respetarse');
    });

    await test('P3.3: loadScript sin integrity ni crossOrigin no inyecta atributos espurios', async () => {
      resetResourceLoader();
      const env = createTestEnvironment();
      const url = 'https://cdn.example.com/plain.js';

      const script = await ResourceLoader.loadScript(url, { document: env.document });

      assert.ok(!script.integrity, 'No debe tener integrity');
      assert.ok(!script.crossOrigin, 'No debe tener crossOrigin');
      assert.strictEqual(script.async, true, 'async debe ser true por defecto');
    });

    await test('P3.4: integrity configurado en loadStyle establece link.integrity y crossOrigin="anonymous"', async () => {
      resetResourceLoader();
      const env = createTestEnvironment();
      const url = 'https://cdn.example.com/sri-test.css';
      const hash = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';

      const link = await ResourceLoader.loadStyle(url, {
        document: env.document,
        integrity: hash
      });

      assert.strictEqual(link.integrity, hash);
      assert.strictEqual(link.crossOrigin, 'anonymous');
      assert.strictEqual(link.rel, 'stylesheet');
    });

    await test('P3.5: loadLeaflet() inyecta los hashes SRI canónicos exactos para CSS y JS', async () => {
      resetResourceLoader();
      const env = createTestEnvironment();
      delete env.window.L;

      await ResourceLoader.loadLeaflet({ window: env.window, document: env.document });

      const links = env.document.head.getElementsByTagName('link');
      const scripts = env.document.head.getElementsByTagName('script');

      assert.strictEqual(links[0].integrity, 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=');
      assert.strictEqual(links[0].crossOrigin, 'anonymous');

      assert.strictEqual(scripts[0].integrity, 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=');
      assert.strictEqual(scripts[0].crossOrigin, 'anonymous');
    });
  });

  // =========================================================================
  // PILAR 4: BYPASS EN MEMORIA (FAST-PATH IN-MEMORY)
  // =========================================================================
  await describe('Pilar 4 — Bypass en Memoria (Fast-Path In-Memory)', async () => {

    await test('P4.1: loadECharts() con window.echarts existente resuelve síncronamente sin mutar el DOM', async () => {
      resetResourceLoader();
      const env = createTestEnvironment();
      const mockEchartsInstance = {
        version: '5.4.3-preloaded',
        init: () => ({ setOption: () => {} })
      };
      env.window.echarts = mockEchartsInstance;

      const initialScriptCount = env.document.head.getElementsByTagName('script').length;

      const result = await ResourceLoader.loadECharts({
        window: env.window,
        document: env.document
      });

      assert.strictEqual(result, mockEchartsInstance, 'Debe retornar la referencia exacta en memoria');

      const finalScriptCount = env.document.head.getElementsByTagName('script').length;
      assert.strictEqual(
        finalScriptCount,
        initialScriptCount,
        'No se debió insertar ningún tag <script> en el DOM'
      );
      assert.strictEqual(
        ResourceLoader._loadedScripts.size,
        0,
        'No se debe registrar ninguna URL en _loadedScripts al hacer bypass'
      );
    });

    await test('P4.2: loadLeaflet() con window.L existente resuelve síncronamente sin mutar el DOM', async () => {
      resetResourceLoader();
      const env = createTestEnvironment();
      const mockLeafletInstance = {
        version: '1.9.4-preloaded',
        map: () => ({ setView: () => {} })
      };
      env.window.L = mockLeafletInstance;

      const initialLinkCount = env.document.head.getElementsByTagName('link').length;
      const initialScriptCount = env.document.head.getElementsByTagName('script').length;

      const result = await ResourceLoader.loadLeaflet({
        window: env.window,
        document: env.document
      });

      assert.strictEqual(result, mockLeafletInstance, 'Debe retornar la instancia L preexistente');

      const finalLinkCount = env.document.head.getElementsByTagName('link').length;
      const finalScriptCount = env.document.head.getElementsByTagName('script').length;

      assert.strictEqual(finalLinkCount, initialLinkCount, 'No debe insertar <link> en el DOM');
      assert.strictEqual(finalScriptCount, initialScriptCount, 'No debe insertar <script> en el DOM');
      assert.strictEqual(ResourceLoader._loadedStyles.size, 0);
      assert.strictEqual(ResourceLoader._loadedScripts.size, 0);
    });
  });

  // =========================================================================
  // PILAR 5: CASOS LÍMITE ADVERSARIALES Y HALLAZGOS ARQUITECTÓNICOS
  // =========================================================================
  await describe('Pilar 5 — Casos Límite Adversariales y Vulnerabilidades Ocultas', async () => {

    await test('P5.1: Degeneración graciosa en entorno headless sin document (Node/Workers)', async () => {
      resetResourceLoader();
      const url = 'https://cdn.example.com/headless.js';

      const scriptResult = await ResourceLoader.loadScript(url, { document: null });
      assert.ok(scriptResult);
      assert.strictEqual(scriptResult.src, url);

      const styleResult = await ResourceLoader.loadStyle(url, { document: null });
      assert.ok(styleResult);
      assert.strictEqual(styleResult.href, url);
    });

    await test('P5.2: Flags async y defer configurables en loadScript', async () => {
      resetResourceLoader();
      const env = createTestEnvironment();
      const url = 'https://cdn.example.com/sync-defer.js';

      const script = await ResourceLoader.loadScript(url, {
        document: env.document,
        async: false,
        defer: true
      });

      assert.strictEqual(script.async, false, 'async debe poder desactivarse');
      assert.strictEqual(script.defer, true, 'defer debe poder activarse');
    });

    await test('P5.3: [HALLAZGO ADVERSARIAL] Detección de auto-resolución prematura por setTimeout(0) incondicional', async () => {
      resetResourceLoader();
      const env = createTestEnvironment();
      const slowCdnUrl = 'https://cdn.example.com/slow-real-world-library.js';

      // Simular latencia real de red (e.g. 20ms) en la carga del script
      let realNetworkCompleted = false;
      const originalAppend = env.document.head.appendChild.bind(env.document.head);

      env.document.head.appendChild = function (child) {
        originalAppend(child);
        if (child.tagName === 'SCRIPT') {
          // El navegador real tarda 20ms en descargar y ejecutar
          setTimeout(() => {
            realNetworkCompleted = true;
          }, 20);
        }
      };

      const promise = ResourceLoader.loadScript(slowCdnUrl, { document: env.document });

      // Esperar a que la promesa resuelva
      await promise;

      // OBSERVACIÓN CRÍTICA:
      // Debido a las líneas 73-75 de js/resource-loader.js:
      // if (typeof script.onload === 'function') setTimeout(() => script.onload(...), 0);
      // La promesa resuelve en 0ms ANTES de que el script real de 20ms haya terminado.
      const resolvedBeforeNetwork = (realNetworkCompleted === false);

      assert.strictEqual(
        resolvedBeforeNetwork,
        true,
        'Demostración empírica: el setTimeout(0) incondicional resuelve la promesa antes de que la red real responda'
      );
    });
  });

  // -------------------------------------------------------------------------
  // RESUMEN Y CONCLUSIÓN
  // -------------------------------------------------------------------------
  console.log(`\n============================================================`);
  console.log(`RESUMEN DE PRUEBAS DE ESTRÉS`);
  console.log(`============================================================`);
  console.log(`Total pruebas ejecutadas : ${totalTests}`);
  console.log(`Pruebas aprobadas        : ${passedTests}`);
  console.log(`Pruebas fallidas         : ${failedTests}`);
  console.log(`Tasa de éxito            : ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  if (failedTests > 0) {
    console.error('\nFallos registrados:');
    failures.forEach((f, idx) => {
      console.error(`  ${idx + 1}. ${f.name}`);
      console.error(`     ${f.error.message}`);
    });
  }
}

// Ejecutar si es invocado directamente
if (require.main === module) {
  runSuite().catch(err => {
    console.error('Error fatal durante la ejecución de la suite de estrés:', err);
    process.exit(1);
  });
}

module.exports = { runSuite };
