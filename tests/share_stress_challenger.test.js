/**
 * tests/share_stress_challenger.test.js
 * Suite de Pruebas de Estrés Adversarial y Tortura Empírica para js/share.js
 * 
 * Agente: challenger_m3_1
 * Objetivos:
 * 1. Tortura IEEE 754 (redondeo, centavos, derivas de suma, cantidades fraccionarias).
 * 2. Casos extremos de datos (1000 items, 50 tiendas, Unicode complejo, emojis, URLs masivas).
 * 3. Cascada completa de compartir (Web Share API, AbortError, otros errores, WhatsApp, Popup Blocker, Clipboard, execCommand).
 * 4. Coherencia de métricas con/sin completados.
 */

const assert = require('node:assert');
const ShareModule = require('../js/share.js');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ [CHALLENGER PASS] ${name}`);
  } catch (err) {
    failedTests++;
    failures.push({ name, error: err });
    console.error(`  ✗ [CHALLENGER FAIL] ${name}`);
    console.error(`    ${err.stack || err.message}`);
  }
}

async function describe(suiteTitle, fn) {
  console.log(`\n==================================================`);
  console.log(`CHALLENGER ADVERSARIAL SUITE: ${suiteTitle}`);
  console.log(`==================================================`);
  await fn();
}

async function runChallengerStress() {
  console.log('--- INICIANDO SUITE DE ESTRÉS ADVERSARIAL SOBRE JS/SHARE.JS ---\n');

  // =========================================================================
  // SECCIÓN 1: TORTURA MATEMÁTICA IEEE 754
  // =========================================================================
  await describe('1. Tortura Numérica IEEE 754 y Aritmética de Centavos', async () => {
    await test('1.1 Combinaciones clásicas de deriva flotante (0.10 + 0.20 = 0.30)', () => {
      const items = [
        { name: 'Item 1', location: 'T1', quantity: 1, unitPrice: 0.10, completed: false },
        { name: 'Item 2', location: 'T1', quantity: 1, unitPrice: 0.20, completed: false }
      ];
      const res = ShareModule.formatShoppingList(items);
      assert.ok(res.includes('💰 *Total estimado:* $0.30'), `Esperaba $0.30 exacto, recibido:\n${res}`);
      assert.ok(res.includes('_Subtotal estimado: $0.30_'), `Esperaba subtotal $0.30`);
    });

    await test('1.2 Acumulación de centavos problemáticos (0.07 + 0.01 = 0.08)', () => {
      const items = [
        { name: 'A', location: 'T1', quantity: 1, unitPrice: 0.07, completed: false },
        { name: 'B', location: 'T1', quantity: 1, unitPrice: 0.01, completed: false }
      ];
      const res = ShareModule.formatShoppingList(items);
      assert.ok(res.includes('💰 *Total estimado:* $0.08'));
    });

    await test('1.3 Multiplicación de cantidades enteras con centavos fraccionarios (0.01 * 3 = 0.03)', () => {
      const items = [
        { name: 'Micro', location: 'T1', quantity: 3, unitPrice: 0.01, completed: false }
      ];
      const res = ShareModule.formatShoppingList(items);
      assert.ok(res.includes('• 3x Micro ($0.03 - $0.01 c/u)'));
      assert.ok(res.includes('💰 *Total estimado:* $0.03'));
    });

    await test('1.4 Redondeo en límite de medio centavo (precios con 3 decimales ej 1.005)', () => {
      // 1.005 en JS es 1.0049999999999998934...
      // Math.round(1.005 * 100) -> 100 centavos ($1.00)
      const items = [
        { name: 'Combustible', location: 'Estación', quantity: 1, unitPrice: 1.005, completed: false }
      ];
      const res = ShareModule.formatShoppingList(items);
      assert.ok(res.includes('• 1x Combustible ($1.00)'), `Recibido: ${res}`);
    });

    await test('1.5 Suma masiva de 100 items a $0.29 (28.999999999999996 deriva clásica)', () => {
      // 0.29 * 100 = 28.999999999999996. Sin Math.round da 28 en truncamiento.
      const items = [];
      for (let i = 0; i < 100; i++) {
        items.push({ name: `Prod ${i}`, location: 'Tienda', quantity: 1, unitPrice: 0.29, completed: false });
      }
      const res = ShareModule.formatShoppingList(items);
      // 100 * 0.29 = 29.00 exacto
      assert.ok(res.includes('💰 *Total estimado:* $29.00'), `Esperaba $29.00 exacto, recibido:\n${res}`);
    });

    await test('1.6 Cantidad fraccionaria con precio con centavos (1.75 un. x $2.50 = $4.38)', () => {
      const items = [
        { name: 'Queso', location: 'Fiambrería', quantity: 1.75, unitPrice: 2.50, completed: false }
      ];
      const res = ShareModule.formatShoppingList(items);
      // Math.round(Math.round(2.50 * 100) * 1.75) = Math.round(250 * 1.75) = Math.round(437.5) = 438 centavos -> $4.38
      assert.ok(res.includes('1.75 un. x Queso ($4.38 - $2.50 c/u)'), `Recibido: ${res}`);
      assert.ok(res.includes('💰 *Total estimado:* $4.38'));
    });

    await test('1.7 Cantidades fraccionarias múltiples y acumulación de artículos pendientes', () => {
      const items = [
        { name: 'A', location: 'T1', quantity: 0.1, unitPrice: 10, completed: false },
        { name: 'B', location: 'T1', quantity: 0.2, unitPrice: 10, completed: false }
      ];
      const res = ShareModule.formatShoppingList(items);
      // 0.1 + 0.2 en JS puro da 0.30000000000000004 si no se redondea
      // Verifiquemos qué entrega actualmente:
      console.log('    [INFO 1.7] Resultado artículos pendientes con 0.1 + 0.2:');
      const pendingMatch = res.match(/Artículos pendientes:\s*([^\n]+)/);
      console.log('    [INFO 1.7] Línea obtenida:', pendingMatch ? pendingMatch[0] : 'no encontrado');
      assert.ok(res.includes('📦 *Artículos pendientes:*'), 'Debe incluir artículos pendientes');
    });

    await test('1.8 Entradas no numéricas, NaN, null, Infinity en cantidades y precios', () => {
      const items = [
        { name: 'Raro 1', location: 'T1', quantity: NaN, unitPrice: null, completed: false },
        { name: 'Raro 2', location: 'T1', quantity: -5, unitPrice: -100, completed: false },
        { name: 'Raro 3', location: 'T1', quantity: Infinity, unitPrice: 'no-numero', completed: false },
        { name: 'Raro 4', location: 'T1', quantity: '3', unitPrice: '15.50', completed: false }
      ];
      const res = ShareModule.formatShoppingList(items);
      // Raro 1: qty fallback 1, unitPrice fallback 0
      assert.ok(res.includes('• 1x Raro 1'));
      // Raro 2: qty fallback 1, unitPrice fallback 0
      assert.ok(res.includes('• 1x Raro 2'));
      // Raro 3: qty fallback 1, unitPrice fallback 0
      assert.ok(res.includes('• 1x Raro 3'));
      // Raro 4: qty '3' -> 3, unitPrice '15.50' -> 15.50
      assert.ok(res.includes('• 3x Raro 4 ($46.50 - $15.50 c/u)'));
    });
  });

  // =========================================================================
  // SECCIÓN 2: ESTRÉS DE VOLUMEN (1000 PRODUCTOS, 50 TIENDAS)
  // =========================================================================
  await describe('2. Estrés de Gran Volumen (1000 Productos, 50 Tiendas)', async () => {
    await test('2.1 Generación y ordenamiento de 1000 productos en 50 tiendas', () => {
      const items = [];
      const storeNames = [];
      for (let s = 1; s <= 49; s++) {
        storeNames.push(`Tienda ${String(s).padStart(2, '0')}`);
      }
      storeNames.push('General'); // Asegurar presencia de General

      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        const store = storeNames[i % 50];
        items.push({
          name: `Producto Alfa-${i}`,
          location: store,
          quantity: (i % 5) + 1,
          unitPrice: (i % 100) + 0.50,
          completed: i % 4 === 0 // 25% completados
        });
      }

      const formatted = ShareModule.formatShoppingList(items, { includeCompleted: false });
      const duration = Date.now() - start;
      console.log(`    [PERF] Tiempo formateo 1000 items: ${duration}ms`);

      assert.ok(duration < 200, `El formateo demoró demasiado (${duration}ms > 200ms)`);
      assert.ok(formatted.length > 5000, 'El texto debe contener miles de caracteres');

      // 'General' debe estar al final de los comercios
      const generalIndex = formatted.lastIndexOf('🏪 *General*');
      const tienda01Index = formatted.indexOf('🏪 *Tienda 01*');
      assert.ok(tienda01Index !== -1, 'Debe contener Tienda 01');
      assert.ok(generalIndex > tienda01Index, 'General debe estar ubicado después de Tienda 01');
    });

    await test('2.2 Verificación de que "General" siempre se ubica al final con nombres alfabéticos diversos', () => {
      const items = [
        { name: 'Zanahorias', location: 'Zapatería', quantity: 1, unitPrice: 10 },
        { name: 'Manzanas', location: 'General', quantity: 1, unitPrice: 10 },
        { name: 'Arándanos', location: 'Almacén', quantity: 1, unitPrice: 10 },
        { name: 'Bananos', location: 'Boutique', quantity: 1, unitPrice: 10 }
      ];
      const res = ShareModule.formatShoppingList(items);
      const posAlmacen = res.indexOf('🏪 *Almacén*');
      const posBoutique = res.indexOf('🏪 *Boutique*');
      const posZapateria = res.indexOf('🏪 *Zapatería*');
      const posGeneral = res.indexOf('🏪 *General*');

      assert.ok(posAlmacen < posBoutique, 'Almacén debe preceder a Boutique');
      assert.ok(posBoutique < posZapateria, 'Boutique debe preceder a Zapatería');
      assert.ok(posZapateria < posGeneral, 'Zapatería debe preceder a General');
    });
  });

  // =========================================================================
  // SECCIÓN 3: UNICODE ADVERSARIAL, EMOJIS COMPLEJOS Y URLS DE WHATSAPP
  // =========================================================================
  await describe('3. Unicode Complejo, Emojis y Codificación de WhatsApp', async () => {
    await test('3.1 Nombres con emojis ZWJ, banderas, modificadores y símbolos reservados de Markdown', async () => {
      const items = [
        {
          name: '👨‍👩‍👧‍👦 Familia *Negrita* _Cursiva_ ~Tachado~ `Código` & "Comillas"',
          location: '🇦🇷 Supermercado & Más',
          quantity: 2,
          unitPrice: 1250.75,
          completed: false
        }
      ];
      const text = ShareModule.formatShoppingList(items);
      assert.ok(text.includes('👨‍👩‍👧‍👦 Familia *Negrita* _Cursiva_ ~Tachado~ `Código` & "Comillas"'));
      assert.ok(text.includes('🏪 *🇦🇷 Supermercado & Más*'));

      const res = await ShareModule.shareList(text, {
        navigator: null,
        window: { open: () => ({ closed: false }) }
      });

      assert.strictEqual(res.success, true);
      assert.ok(res.whatsappUrl.startsWith('https://api.whatsapp.com/send?text='));

      // Comprobar que no rompe la decodificación URI
      const decoded = decodeURIComponent(res.whatsappUrl.replace('https://api.whatsapp.com/send?text=', ''));
      assert.strictEqual(decoded, text);
    });

    await test('3.2 Tiendas y productos con solo espacios o caracteres invisibles', () => {
      const items = [
        { name: '   ', location: '   ', quantity: 1, unitPrice: 10 },
        { name: 'Válido', location: '\t\n  \r', quantity: 1, unitPrice: 10 }
      ];
      const text = ShareModule.formatShoppingList(items);
      // El item con nombre vacío de puros espacios: name es '   '. it.name es truthy en JS!
      // Debe agruparlo en General.
      assert.ok(text.includes('🏪 *General*'));
      assert.ok(text.includes('Válido'));
    });

    await test('3.3 Protección contra payloads gigantes (> 100KB de texto en shareList)', async () => {
      const hugeText = '🛒 *Lista Gigante*\n' + '• 1x Manzana ($100.00)\n'.repeat(5000);
      let capturedUrl = '';
      const mockWin = {
        open: (url) => {
          capturedUrl = url;
          return { closed: false };
        }
      };
      const res = await ShareModule.shareList(hugeText, {
        navigator: null,
        window: mockWin
      });
      assert.strictEqual(res.success, true);
      assert.ok(capturedUrl.length > 50000, 'La URL codificada debe soportar strings extensos');
    });
  });

  // =========================================================================
  // SECCIÓN 4: CASCADA DE FALLBACKS (WEB SHARE, ABORT, POPUP BLOCKER, CLIPBOARD, TEXTAREA)
  // =========================================================================
  await describe('4. Cascada de Fallbacks y Resiliencia de Entornos Adversos', async () => {
    await test('4.1 Web Share API exitoso retorna { success: true, method: "native" }', async () => {
      let sharedArgs = null;
      const mockNav = {
        share: async (args) => {
          sharedArgs = args;
          return true;
        }
      };
      const res = await ShareModule.shareList('Mi lista', { navigator: mockNav });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.method, 'native');
      assert.strictEqual(sharedArgs.text, 'Mi lista');
    });

    await test('4.2 Web Share API con cancelación de usuario (AbortError) NO abre WhatsApp y retorna cancelled: true', async () => {
      let winOpenCalled = false;
      const mockNav = {
        share: async () => {
          const err = new Error('Share canceled by user');
          err.name = 'AbortError';
          throw err;
        }
      };
      const mockWin = {
        open: () => {
          winOpenCalled = true;
          return {};
        }
      };
      const res = await ShareModule.shareList('Mi lista', { navigator: mockNav, window: mockWin });
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.cancelled, true);
      assert.strictEqual(winOpenCalled, false, 'No debe abrir WhatsApp si el usuario canceló la hoja nativa');
    });

    await test('4.3 Web Share API lanza error NO-AbortError (ej NotAllowedError): degrada suavemente a WhatsApp', async () => {
      let winOpenCalled = false;
      const mockNav = {
        share: async () => {
          const err = new Error('Permission denied');
          err.name = 'NotAllowedError';
          throw err;
        }
      };
      const mockWin = {
        open: (url) => {
          winOpenCalled = true;
          return { closed: false };
        }
      };
      const res = await ShareModule.shareList('Mi lista', { navigator: mockNav, window: mockWin });
      assert.strictEqual(res.success, true);
      assert.strictEqual(winOpenCalled, true, 'Debe activar fallback a WhatsApp ante error no-Abort');
      assert.strictEqual(res.method, 'whatsapp');
    });

    await test('4.4 Popup Blocker activo (win.open retorna null): degrada a clipboard writeText', async () => {
      let clipboardCalled = false;
      const mockWin = {
        open: () => null // Simulador de Popup Blocker de Chrome/Safari
      };
      const mockNav = {
        clipboard: {
          writeText: async (t) => {
            clipboardCalled = true;
            return true;
          }
        }
      };
      const res = await ShareModule.shareList('Texto', { window: mockWin, navigator: mockNav });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.opened, false);
      assert.strictEqual(res.copied, true);
      assert.strictEqual(res.method, 'clipboard');
      assert.strictEqual(clipboardCalled, true);
    });

    await test('4.5 Popup Blocker activo y clipboard writeText rechaza: degrada a textarea + execCommand("copy")', async () => {
      let execCommandCalled = false;
      let textareaAppended = false;
      let textareaRemoved = false;

      const mockWin = { open: () => null };
      const mockNav = {
        clipboard: {
          writeText: () => Promise.reject(new Error('Clipboard permission denied'))
        }
      };
      const mockDoc = {
        createElement: (tag) => {
          assert.strictEqual(tag, 'textarea');
          return {
            value: '',
            style: {},
            setAttribute: () => {},
            select: () => {}
          };
        },
        body: {
          appendChild: (el) => { textareaAppended = true; },
          removeChild: (el) => { textareaRemoved = true; }
        },
        execCommand: (cmd) => {
          if (cmd === 'copy') {
            execCommandCalled = true;
            return true;
          }
          return false;
        }
      };

      const res = await ShareModule.shareList('Texto seguro', {
        window: mockWin,
        navigator: mockNav,
        document: mockDoc
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.copied, true);
      assert.strictEqual(execCommandCalled, true);
      assert.strictEqual(textareaAppended, true);
      assert.strictEqual(textareaRemoved, true);
      assert.strictEqual(res.method, 'clipboard');
    });

    await test('4.6 Entorno completamente restrictivo (todo falla o es null): retorna degrado suave sin lanzar excepción', async () => {
      const res = await ShareModule.shareList('Texto', {
        window: null,
        navigator: null,
        document: null
      });
      assert.ok(res);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.method, 'fallback');
      assert.strictEqual(res.copied, false);
      assert.strictEqual(res.opened, false);
    });
  });

  // =========================================================================
  // SECCIÓN 5: ANÁLISIS DE COHERENCIA EN MÉTRICAS (COMPLETADOS VS PENDIENTES)
  // =========================================================================
  await describe('5. Coherencia de Subtotales y Totales (includeCompleted: true vs false)', async () => {
    await test('5.1 Con includeCompleted: false, items completados no afectan subtotales ni total general', () => {
      const items = [
        { name: 'Leche', location: 'Super', quantity: 1, unitPrice: 100, completed: false },
        { name: 'Vino Caro', location: 'Super', quantity: 1, unitPrice: 9000, completed: true }
      ];
      const res = ShareModule.formatShoppingList(items, { includeCompleted: false });
      assert.ok(!res.includes('Vino Caro'));
      assert.ok(res.includes('_Subtotal estimado: $100.00_'));
      assert.ok(res.includes('💰 *Total estimado:* $100.00'));
      assert.ok(res.includes('📦 *Artículos pendientes:* 1'));
    });

    await test('5.2 Con includeCompleted: true, ¿qué reflejan los subtotales de tienda vs el total general?', () => {
      const items = [
        { name: 'Pendiente', location: 'Super', quantity: 1, unitPrice: 100, completed: false },
        { name: 'Comprado', location: 'Super', quantity: 1, unitPrice: 50, completed: true }
      ];
      const res = ShareModule.formatShoppingList(items, { includeCompleted: true });
      console.log('    [INFO 5.2] Salida con includeCompleted: true:');
      console.log('--------------------------------------------------');
      console.log(res);
      console.log('--------------------------------------------------');
      // Observamos qué imprime para subtotales y total
      assert.ok(res.includes('[✓] 1x Comprado ($50.00)'));
      assert.ok(res.includes('• 1x Pendiente ($100.00)'));
      assert.ok(res.includes('📦 *Artículos pendientes:* 1'));
    });
  });

  // =========================================================================
  // RESUMEN FINAL DE LA SUITE CHALLENGER
  // =========================================================================
  console.log('\n==================================================');
  console.log('RESUMEN DE PRUEBAS ADVERSARIALES CHALLENGER M3:');
  console.log(`Total: ${totalTests} | Aprobadas: ${passedTests} | Falladas: ${failedTests}`);
  console.log('==================================================');

  if (failedTests > 0) {
    console.error(`\n❌ SE ENCONTRARON ${failedTests} VULNERABILIDADES O FALLOS:`);
    failures.forEach((f, idx) => {
      console.error(`  ${idx + 1}. ${f.name}`);
      console.error(`     ${f.error.message}`);
    });
    process.exit(1);
  } else {
    console.log('\n✅ TODAS LAS PRUEBAS ADVERSARIALES PASARON SATISFACTORIAMENTE.');
  }
}

runChallengerStress().catch(err => {
  console.error('Error no controlado en suite challenger:', err);
  process.exit(1);
});
