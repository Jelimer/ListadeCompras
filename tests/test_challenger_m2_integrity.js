/**
 * tests/test_challenger_m2_integrity.js
 * ============================================================================
 * Suite de Verificación Empírica de Integridad y Robustez de ResourceLoader
 * Módulo evaluado: js/resource-loader.js
 * 
 * Rol: challenger_m2_1_r2 (Critic / Specialist - Iteration 2)
 * 
 * Objetivos de Verificación:
 * 1. Comprobación empírica y estática de que en un entorno de navegador real
 *    (isMockEnv === false), setTimeout(0) NUNCA sea llamado.
 * 2. Comprobación de que no exista ningún objeto dummy o facade vacío
 *    (setOption: () => {}, map: () => ({ ... }), etc.).
 * 3. Comprobación de que ante fallos donde la librería no se define en memoria,
 *    o ante errores de red, se lance y propague un Error legítimo descriptivo.
 * 4. Comprobación exhaustiva del método clear() y la deduplicación concurrente
 *    por Singleton (50 peticiones simultáneas).
 * ============================================================================
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ResourceLoader = require('../js/resource-loader.js');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    failures.push({ name, error: err });
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`     ${err.stack || err.message}`);
  }
}

async function describe(title, fn) {
  console.log(`\n============================================================`);
  console.log(`INTEGRITY SUITE: ${title}`);
  console.log(`============================================================`);
  await fn();
}

/**
 * Crea una simulación estricta de entorno de navegador real (HTMLDocument / Browser Window)
 * donde process no existe y el constructor es HTMLDocument.
 */
function createRealBrowserSimulation() {
  const elements = { scripts: [], links: [] };

  const head = {
    appendChild(el) {
      if (el.tagName === 'SCRIPT') elements.scripts.push(el);
      if (el.tagName === 'LINK') elements.links.push(el);
      return el;
    },
    getElementsByTagName(tag) {
      if (tag.toLowerCase() === 'script') return elements.scripts;
      if (tag.toLowerCase() === 'link') return elements.links;
      return [];
    }
  };

  class HTMLDocument {
    constructor() {
      this.head = head;
      this.body = head;
    }
    createElement(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        src: '',
        href: '',
        integrity: '',
        crossOrigin: '',
        async: false,
        defer: false,
        onload: null,
        onerror: null
      };
      return el;
    }
  }

  const doc = new HTMLDocument();
  return { doc, elements };
}

async function runSuite() {
  console.log('Iniciando batería de verificación empírica para js/resource-loader.js...\n');

  // =========================================================================
  // PILAR 1: COMPROBACIÓN DE NAVEGADOR REAL (isMockEnv === false) Y setTimeout(0)
  // =========================================================================
  await describe('Pilar 1 — Entorno de Navegador Real (isMockEnv === false): Cero llamadas a setTimeout(0)', async () => {

    await test('P1.1: En simulación de navegador real, loadScript NUNCA invoca setTimeout', async () => {
      ResourceLoader.clear();
      const { doc, elements } = createRealBrowserSimulation();

      // Instrumentar setTimeout global para espiar invocaciones
      let setTimeoutCalls = 0;
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = function (...args) {
        setTimeoutCalls++;
        return originalSetTimeout(...args);
      };

      try {
        // En un sandbox donde doc.constructor.name === 'HTMLDocument' y process.versions.node no se usa
        // Para simular exactamente isMockEnv === false en Node.js, evaluamos el código en un contexto VM limpio sin process
        const loaderCode = fs.readFileSync(path.resolve(__dirname, '../js/resource-loader.js'), 'utf8');

        let vmSetTimeoutCalls = 0;
        const sandbox = {
          setTimeout: (...args) => {
            vmSetTimeoutCalls++;
          },
          document: doc,
          window: { document: doc },
          self: {},
          console: console
        };
        // Notar: 'process' NO se inyecta en sandbox, simulando fielmente un navegador estándar
        vm.createContext(sandbox);
        vm.runInContext(loaderCode, sandbox);

        const SandboxedLoader = sandbox.ResourceLoader;
        assert.ok(SandboxedLoader, 'ResourceLoader debe inicializarse en el sandbox del navegador');

        const testUrl = 'https://cdn.example.com/real-browser-script.js';
        const promise = SandboxedLoader.loadScript(testUrl, { document: doc });

        // Verificación síncrona inmediata: setTimeout NUNCA debe haber sido llamado
        assert.strictEqual(
          vmSetTimeoutCalls,
          0,
          `En un navegador real (isMockEnv === false), setTimeout fue llamado ${vmSetTimeoutCalls} veces (esperado: 0)`
        );

        // El script se insertó en el DOM pero aún no ha emitido onload
        assert.strictEqual(elements.scripts.length, 1);
        const scriptEl = elements.scripts[0];

        // Simular evento nativo de red tras latencia asíncrona (10ms)
        let resolved = false;
        promise.then(() => { resolved = true; });

        // Antes de que el evento de red nativo ocurra, la promesa NO debe haber resuelto
        await new Promise(r => originalSetTimeout(r, 5));
        assert.strictEqual(resolved, false, 'La promesa no debe resolver antes de que la red responda');

        // Disparar evento de red nativo
        scriptEl.onload({ type: 'load', target: scriptEl });
        await promise;
        assert.strictEqual(resolved, true, 'La promesa resuelve legítimamente cuando la red finaliza');
        assert.strictEqual(vmSetTimeoutCalls, 0, 'Incluso tras la resolución, setTimeout NUNCA fue llamado');
      } finally {
        global.setTimeout = originalSetTimeout;
      }
    });

    await test('P1.2: En simulación de navegador real, loadStyle NUNCA invoca setTimeout', async () => {
      ResourceLoader.clear();
      const { doc, elements } = createRealBrowserSimulation();

      const loaderCode = fs.readFileSync(path.resolve(__dirname, '../js/resource-loader.js'), 'utf8');

      let vmSetTimeoutCalls = 0;
      const sandbox = {
        setTimeout: (...args) => {
          vmSetTimeoutCalls++;
        },
        document: doc,
        window: { document: doc },
        self: {}
      };
      vm.createContext(sandbox);
      vm.runInContext(loaderCode, sandbox);

      const SandboxedLoader = sandbox.ResourceLoader;
      const testCssUrl = 'https://cdn.example.com/real-browser-style.css';
      const promise = SandboxedLoader.loadStyle(testCssUrl, { document: doc });

      assert.strictEqual(
        vmSetTimeoutCalls,
        0,
        `loadStyle no debe invocar setTimeout en entorno de navegador (llamadas: ${vmSetTimeoutCalls})`
      );

      assert.strictEqual(elements.links.length, 1);
      const linkEl = elements.links[0];

      let resolved = false;
      promise.then(() => { resolved = true; });

      await new Promise(r => setTimeout(r, 5));
      assert.strictEqual(resolved, false);

      linkEl.onload({ type: 'load', target: linkEl });
      await promise;
      assert.strictEqual(resolved, true);
      assert.strictEqual(vmSetTimeoutCalls, 0);
    });

    await test('P1.3: Verificación estática: Las únicas llamadas a setTimeout en js/resource-loader.js están estrictamente condicionadas por isMockEnv', () => {
      const code = fs.readFileSync(path.resolve(__dirname, '../js/resource-loader.js'), 'utf8');
      const lines = code.split('\n');

      const setTimeoutLines = [];
      lines.forEach((line, idx) => {
        if (line.includes('setTimeout(')) {
          setTimeoutLines.push({ lineNumber: idx + 1, content: line.trim() });
        }
      });

      assert.strictEqual(
        setTimeoutLines.length,
        2,
        `Se esperaban exactamente 2 invocaciones a setTimeout (1 en loadScript y 1 en loadStyle), pero se encontraron ${setTimeoutLines.length}`
      );

      // Verificar que antes de cada setTimeout existe la guarda isMockEnv
      assert.ok(code.includes('if (isMockEnv && typeof script.onload === \'function\')'));
      assert.ok(code.includes('if (isMockEnv && typeof link.onload === \'function\')'));
    });
  });

  // =========================================================================
  // PILAR 2: ERRADICACIÓN DE OBJETOS DUMMY Y FACADES NO-OP
  // =========================================================================
  await describe('Pilar 2 — Erradicación Absoluta de Objetos Dummy (setOption, map vacíos)', async () => {

    await test('P2.1: Verificación estática: Cero ocurrencias de stubs dummy (setOption, map, dispose)', () => {
      const code = fs.readFileSync(path.resolve(__dirname, '../js/resource-loader.js'), 'utf8');

      // Buscar patrones de stubs vacíos retirados
      assert.strictEqual(code.includes('setOption: () => {}'), false, 'No debe existir stub setOption: () => {}');
      assert.strictEqual(code.includes('setOption:'), false, 'No debe existir propiedad setOption en resource-loader.js');
      assert.strictEqual(code.includes('setView: () => {}'), false, 'No debe existir stub setView: () => {}');
      assert.strictEqual(code.includes('map: () => ({'), false, 'No debe existir stub map: () => ({ ... })');
      assert.strictEqual(code.includes('tileLayer: () => ({'), false, 'No debe existir stub tileLayer: () => ({ ... })');
      assert.strictEqual(code.includes('version: \'5.4.3\''), false, 'No debe existir fallback dummy version 5.4.3');
      assert.strictEqual(code.includes('version: \'1.9.4\''), false, 'No debe existir fallback dummy version 1.9.4');
    });

    await test('P2.2: loadECharts en entorno frío sin librería NO retorna objeto dummy sino que rechaza', async () => {
      ResourceLoader.clear();
      const { doc, elements } = createRealBrowserSimulation();

      const loaderCode = fs.readFileSync(path.resolve(__dirname, '../js/resource-loader.js'), 'utf8');
      const sandbox = {
        document: doc,
        window: { document: doc },
        self: {}
      };
      vm.createContext(sandbox);
      vm.runInContext(loaderCode, sandbox);

      const SandboxedLoader = sandbox.ResourceLoader;

      // Iniciar carga de ECharts sin definir sandbox.window.echarts
      const promise = SandboxedLoader.loadECharts({
        window: sandbox.window,
        document: doc
      });

      // El script fue inyectado
      assert.strictEqual(elements.scripts.length, 1);
      const scriptEl = elements.scripts[0];

      // Simular que el script se descarga (onload) pero NO definió window.echarts (e.g. fallo de CDN o corrupto)
      scriptEl.onload({ type: 'load', target: scriptEl });

      let caughtError = null;
      try {
        await promise;
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError !== null, 'loadECharts DEBE rechazar cuando window.echarts no está definido');
      assert.ok(
        caughtError.message.includes('ECharts script cargado pero window.echarts no está definido'),
        `El mensaje de error debe ser descriptivo, obtenido: ${caughtError.message}`
      );
    });

    await test('P2.3: loadLeaflet en entorno frío sin librería NO retorna objeto dummy sino que rechaza', async () => {
      ResourceLoader.clear();
      const { doc, elements } = createRealBrowserSimulation();

      const loaderCode = fs.readFileSync(path.resolve(__dirname, '../js/resource-loader.js'), 'utf8');
      const sandbox = {
        document: doc,
        window: { document: doc },
        self: {}
      };
      vm.createContext(sandbox);
      vm.runInContext(loaderCode, sandbox);

      const SandboxedLoader = sandbox.ResourceLoader;

      const promise = SandboxedLoader.loadLeaflet({
        window: sandbox.window,
        document: doc
      });

      assert.strictEqual(elements.links.length, 1);
      assert.strictEqual(elements.scripts.length, 1);

      // Simular descarga sin definir window.L
      elements.links[0].onload({ type: 'load', target: elements.links[0] });
      elements.scripts[0].onload({ type: 'load', target: elements.scripts[0] });

      let caughtError = null;
      try {
        await promise;
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError !== null, 'loadLeaflet DEBE rechazar cuando window.L no está definido');
      assert.ok(
        caughtError.message.includes('Leaflet script cargado pero window.L no está definido'),
        `El mensaje de error debe ser descriptivo, obtenido: ${caughtError.message}`
      );
    });
  });

  // =========================================================================
  // PILAR 3: LANZAMIENTO DE ERROR LEGÍTIMO ANTE FALLAS
  // =========================================================================
  await describe('Pilar 3 — Manejo y Propagación de Errores Legítimos', async () => {

    await test('P3.1: Fallo de red en script.onerror rechaza con Error legítimo y desaloja Map', async () => {
      ResourceLoader.clear();
      const { doc, elements } = createRealBrowserSimulation();

      const loaderCode = fs.readFileSync(path.resolve(__dirname, '../js/resource-loader.js'), 'utf8');
      const sandbox = {
        document: doc,
        window: { document: doc },
        self: {}
      };
      vm.createContext(sandbox);
      vm.runInContext(loaderCode, sandbox);
      const SandboxedLoader = sandbox.ResourceLoader;

      const badUrl = 'https://cdn.example.com/broken-script.js';
      const promise = SandboxedLoader.loadScript(badUrl, { document: doc });

      // Disparar error de red
      const scriptEl = elements.scripts[0];
      const networkError = new Error('HTTP 404 Not Found');
      scriptEl.onerror(networkError);

      await assert.rejects(
        promise,
        (err) => err === networkError || err.message.includes('Error cargando script'),
        'Debe rechazar con el error de red legítimo'
      );

      // Desalojo de Map
      assert.strictEqual(SandboxedLoader._loadedScripts.has(badUrl), false, 'La URL debe ser desalojada del Map');
    });

    await test('P3.2: Fallo de red en link.onerror rechaza con Error legítimo y desaloja Map', async () => {
      ResourceLoader.clear();
      const { doc, elements } = createRealBrowserSimulation();

      const loaderCode = fs.readFileSync(path.resolve(__dirname, '../js/resource-loader.js'), 'utf8');
      const sandbox = {
        document: doc,
        window: { document: doc },
        self: {}
      };
      vm.createContext(sandbox);
      vm.runInContext(loaderCode, sandbox);
      const SandboxedLoader = sandbox.ResourceLoader;

      const badCssUrl = 'https://cdn.example.com/broken-style.css';
      const promise = SandboxedLoader.loadStyle(badCssUrl, { document: doc });

      const linkEl = elements.links[0];
      const cssError = new Error('HTTP 502 Bad Gateway');
      linkEl.onerror(cssError);

      await assert.rejects(
        promise,
        (err) => err === cssError || err.message.includes('Error cargando estilo'),
        'Debe rechazar con el error de red legítimo'
      );

      assert.strictEqual(SandboxedLoader._loadedStyles.has(badCssUrl), false);
    });

    await test('P3.3: Soporte para options.mockLibrary en entornos controlados de prueba', async () => {
      ResourceLoader.clear();
      const { doc, elements } = createRealBrowserSimulation();

      const customMock = { version: '5.4.3-test-controlled', customMethod: () => 'ok' };

      const loaderCode = fs.readFileSync(path.resolve(__dirname, '../js/resource-loader.js'), 'utf8');
      const sandbox = {
        document: doc,
        window: { document: doc },
        self: {}
      };
      vm.createContext(sandbox);
      vm.runInContext(loaderCode, sandbox);
      const SandboxedLoader = sandbox.ResourceLoader;

      const promise = SandboxedLoader.loadECharts({
        window: sandbox.window,
        document: doc,
        mockLibrary: customMock
      });

      // Al completar el script, si se proveyó mockLibrary explícitamente, se retorna ese objeto
      elements.scripts[0].onload({ type: 'load', target: elements.scripts[0] });

      const result = await promise;
      assert.strictEqual(result, customMock, 'options.mockLibrary debe ser respetado si se provee');
    });
  });

  // =========================================================================
  // PILAR 4: MÉTODO clear() Y DEDUPLICACIÓN CONCURRENTE POR SINGLETON
  // =========================================================================
  await describe('Pilar 4 — Método clear() y Deduplicación Concurrente Singleton (50 peticiones)', async () => {

    await test('P4.1: ResourceLoader.clear() existe y limpia ambos Maps (_loadedScripts y _loadedStyles)', () => {
      assert.strictEqual(typeof ResourceLoader.clear, 'function', 'clear() debe ser una función pública');

      ResourceLoader._loadedScripts.set('https://test.com/s1.js', Promise.resolve());
      ResourceLoader._loadedStyles.set('https://test.com/c1.css', Promise.resolve());

      assert.strictEqual(ResourceLoader._loadedScripts.size, 1);
      assert.strictEqual(ResourceLoader._loadedStyles.size, 1);

      ResourceLoader.clear();

      assert.strictEqual(ResourceLoader._loadedScripts.size, 0, '_loadedScripts debe estar vacío tras clear()');
      assert.strictEqual(ResourceLoader._loadedStyles.size, 0, '_loadedStyles debe estar vacío tras clear()');
    });

    await test('P4.2: 50 llamadas simultáneas a loadScript deduplican a 1 sola Promesa y 1 solo nodo DOM', async () => {
      ResourceLoader.clear();
      const { doc, elements } = createRealBrowserSimulation();

      const loaderCode = fs.readFileSync(path.resolve(__dirname, '../js/resource-loader.js'), 'utf8');
      const sandbox = {
        document: doc,
        window: { document: doc },
        self: {}
      };
      vm.createContext(sandbox);
      vm.runInContext(loaderCode, sandbox);
      const SandboxedLoader = sandbox.ResourceLoader;

      const sharedUrl = 'https://cdn.example.com/concurrent-script.js';
      const promises = [];

      for (let i = 0; i < 50; i++) {
        promises.push(SandboxedLoader.loadScript(sharedUrl, { document: doc }));
      }

      // Verificación de referencia síncrona
      for (let i = 1; i < 50; i++) {
        assert.strictEqual(promises[i], promises[0], `La promesa #${i} debe ser idéntica a la #${0}`);
      }

      // Exactamente 1 script insertado en el DOM
      assert.strictEqual(elements.scripts.length, 1, 'Exactamente 1 nodo SCRIPT debe crearse en el DOM');

      // Resolver evento
      elements.scripts[0].onload({ type: 'load', target: elements.scripts[0] });

      const results = await Promise.all(promises);
      assert.strictEqual(results.length, 50);
      for (let i = 1; i < 50; i++) {
        assert.strictEqual(results[i], results[0]);
      }
    });

    await test('P4.3: 50 llamadas simultáneas a loadStyle deduplican a 1 sola Promesa y 1 solo nodo DOM', async () => {
      ResourceLoader.clear();
      const { doc, elements } = createRealBrowserSimulation();

      const loaderCode = fs.readFileSync(path.resolve(__dirname, '../js/resource-loader.js'), 'utf8');
      const sandbox = {
        document: doc,
        window: { document: doc },
        self: {}
      };
      vm.createContext(sandbox);
      vm.runInContext(loaderCode, sandbox);
      const SandboxedLoader = sandbox.ResourceLoader;

      const sharedCssUrl = 'https://cdn.example.com/concurrent-style.css';
      const promises = [];

      for (let i = 0; i < 50; i++) {
        promises.push(SandboxedLoader.loadStyle(sharedCssUrl, { document: doc }));
      }

      for (let i = 1; i < 50; i++) {
        assert.strictEqual(promises[i], promises[0]);
      }

      assert.strictEqual(elements.links.length, 1);

      elements.links[0].onload({ type: 'load', target: elements.links[0] });

      const results = await Promise.all(promises);
      for (let i = 1; i < 50; i++) {
        assert.strictEqual(results[i], results[0]);
      }
    });

    await test('P4.4: In-Memory Fast-Path para ECharts y Leaflet cuando ya residen en window', async () => {
      ResourceLoader.clear();
      const { doc, elements } = createRealBrowserSimulation();

      const mockEcharts = { version: '5.4.3-real', init: () => {} };
      const mockLeaflet = { version: '1.9.4-real', map: () => {} };

      const loaderCode = fs.readFileSync(path.resolve(__dirname, '../js/resource-loader.js'), 'utf8');
      const sandbox = {
        document: doc,
        window: {
          document: doc,
          echarts: mockEcharts,
          L: mockLeaflet
        },
        self: {}
      };
      vm.createContext(sandbox);
      vm.runInContext(loaderCode, sandbox);
      const SandboxedLoader = sandbox.ResourceLoader;

      const resEcharts = await SandboxedLoader.loadECharts({ window: sandbox.window, document: doc });
      const resLeaflet = await SandboxedLoader.loadLeaflet({ window: sandbox.window, document: doc });

      assert.strictEqual(resEcharts, mockEcharts, 'Debe retornar la instancia existente de echarts');
      assert.strictEqual(resLeaflet, mockLeaflet, 'Debe retornar la instancia existente de L');

      // Cero mutaciones al DOM
      assert.strictEqual(elements.scripts.length, 0, 'No debe insertar script en el DOM');
      assert.strictEqual(elements.links.length, 0, 'No debe insertar link en el DOM');
    });

    await test('P4.5: Tras invocar clear(), las URLs previamente cargadas pueden recargarse limpiamente', async () => {
      ResourceLoader.clear();
      const { doc, elements } = createRealBrowserSimulation();

      const loaderCode = fs.readFileSync(path.resolve(__dirname, '../js/resource-loader.js'), 'utf8');
      const sandbox = {
        document: doc,
        window: { document: doc },
        self: {}
      };
      vm.createContext(sandbox);
      vm.runInContext(loaderCode, sandbox);
      const SandboxedLoader = sandbox.ResourceLoader;

      const url = 'https://cdn.example.com/reloadable.js';

      // Carga 1
      const p1 = SandboxedLoader.loadScript(url, { document: doc });
      elements.scripts[0].onload({ type: 'load', target: elements.scripts[0] });
      await p1;
      assert.strictEqual(elements.scripts.length, 1);
      assert.strictEqual(SandboxedLoader._loadedScripts.has(url), true);

      // Invocación de clear()
      SandboxedLoader.clear();
      assert.strictEqual(SandboxedLoader._loadedScripts.has(url), false);

      // Carga 2 (debe iniciar nueva promesa y nuevo nodo DOM)
      const p2 = SandboxedLoader.loadScript(url, { document: doc });
      assert.notStrictEqual(p1, p2, 'La nueva promesa debe ser diferente a la anterior');
      assert.strictEqual(elements.scripts.length, 2, 'Debe agregarse un segundo nodo script');
      elements.scripts[1].onload({ type: 'load', target: elements.scripts[1] });
      await p2;
    });
  });

  // -------------------------------------------------------------------------
  // RESUMEN FINAL
  // -------------------------------------------------------------------------
  console.log(`\n============================================================`);
  console.log(`RESUMEN DE PRUEBAS DE INTEGRIDAD (CHALLENGER M2 ITERACIÓN 2)`);
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
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runSuite().catch(err => {
    console.error('Error fatal durante la ejecución de la suite de integridad:', err);
    process.exit(1);
  });
}

module.exports = { runSuite };
