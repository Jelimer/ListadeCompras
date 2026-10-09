/**
 * tests/m3_share_print.test.js
 * Suite Integral de Verificación para Milestone 3 (F12, F13, F14, F15):
 * - F12: Formateador de compras (js/share.js formatShoppingList).
 * - F13: Botón y cascada de compartir (js/share.js shareList + index.html + script.js).
 * - F14: Botón de impresión (index.html + script.js window.print + beforeprint).
 * - F15: Reglas @media print (style.css).
 * - Resiliencia Offline: sw.js pre-caché de /js/share.js.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createTestEnvironment } = require('./mock_dom.js');
const { createStore } = require('../js/state.js');

async function runM3Tests() {
  console.log('\n==================================================');
  console.log('SUITE DE VERIFICACIÓN MILESTONE 3: SHARE & PRINT');
  console.log('==================================================');

  let total = 0;
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`  ✓ [PASS] ${name}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(`     ${err.message}`);
    }
  }

  // ----------------------------------------------------
  // 1. Módulo js/share.js y Patrón UMD
  // ----------------------------------------------------
  console.log('\n--- 1. Formateador de Compras y UMD (js/share.js) ---');

  await test('1.1: js/share.js exporta UMD limpio en Node.js', () => {
    const sm = require('../js/share.js');
    assert.ok(sm, 'ShareModule debe existir');
    assert.strictEqual(typeof sm.formatShoppingList, 'function', 'formatShoppingList debe ser función');
    assert.strictEqual(typeof sm.shareList, 'function', 'shareList debe ser función');
  });

  await test('1.2: formatShoppingList con lista vacía o nula retorna mensaje amigable', () => {
    const sm = require('../js/share.js');
    assert.strictEqual(sm.formatShoppingList([]), '🛒 Tu lista de compras está vacía.');
    assert.strictEqual(sm.formatShoppingList(null), '🛒 Tu lista de compras está vacía.');
    assert.strictEqual(sm.formatShoppingList(undefined), '🛒 Tu lista de compras está vacía.');
  });

  await test('1.3: formatShoppingList con solo ítems completados retorna aviso amigable', () => {
    const sm = require('../js/share.js');
    const items = [
      { name: 'Arroz', completed: true, quantity: 1, unitPrice: 100 },
      { name: 'Fideos', completed: true, quantity: 2, unitPrice: 200 }
    ];
    assert.strictEqual(sm.formatShoppingList(items, { includeCompleted: false }), '🛒 No hay productos pendientes en la lista de compras.');
  });

  await test('1.4: formatShoppingList agrupa comercios y ubica "General" al final', () => {
    const sm = require('../js/share.js');
    const items = [
      { name: 'Zanahorias', location: 'Verdulería', quantity: 1, unitPrice: 500, completed: false },
      { name: 'Servilletas', location: '', quantity: 2, unitPrice: 300, completed: false }, // Se asigna a General
      { name: 'Carnaza', location: 'Carnicería', quantity: 1, unitPrice: 3500, completed: false }
    ];
    const text = sm.formatShoppingList(items);
    assert.ok(text.includes('🏪 *Carnicería*'));
    assert.ok(text.includes('🏪 *Verdulería*'));
    assert.ok(text.includes('🏪 *General*'));

    const idxCarniceria = text.indexOf('🏪 *Carnicería*');
    const idxVerduleria = text.indexOf('🏪 *Verdulería*');
    const idxGeneral = text.indexOf('🏪 *General*');

    assert.ok(idxCarniceria < idxVerduleria, 'Carnicería debe anteceder a Verdulería alfabéticamente');
    assert.ok(idxVerduleria < idxGeneral, 'General debe ubicarse estrictamente al final');
  });

  await test('1.5: formatShoppingList calcula en centavos exactos sin error IEEE 754 ($0.10 + $0.20 = $0.30)', () => {
    const sm = require('../js/share.js');
    const items = [
      { name: 'Chicle A', location: 'Kiosco', quantity: 1, unitPrice: 0.10, completed: false },
      { name: 'Chicle B', location: 'Kiosco', quantity: 1, unitPrice: 0.20, completed: false }
    ];
    const text = sm.formatShoppingList(items);
    assert.ok(text.includes('💰 *Total estimado:* $0.30'), 'Debe formatear estrictamente $0.30');
  });

  await test('1.6: formatShoppingList maneja cantidades enteras con "x" y decimales con "un. x"', () => {
    const sm = require('../js/share.js');
    const items = [
      { name: 'Leche', location: 'Super', quantity: 3, unitPrice: 1200, completed: false },
      { name: 'Jamón', location: 'Super', quantity: 0.25, unitPrice: 8000, completed: false }
    ];
    const text = sm.formatShoppingList(items);
    assert.ok(text.includes('• 3x Leche ($3600.00 - $1200.00 c/u)'));
    assert.ok(text.includes('• 0.25 un. x Jamón ($2000.00)'));
  });

  // ----------------------------------------------------
  // 2. Cascada de Fallback de shareList
  // ----------------------------------------------------
  console.log('\n--- 2. Cascada de Fallback en shareList ---');

  await test('2.1: shareList Nivel 1 usa navigator.share nativo', async () => {
    const sm = require('../js/share.js');
    let shareCalled = false;
    const mockNav = {
      share: async (payload) => {
        shareCalled = true;
        assert.ok(payload.text.includes('Yerba'));
        return true;
      }
    };
    const res = await sm.shareList([{ name: 'Yerba', quantity: 1, unitPrice: 2000, completed: false }], { navigator: mockNav });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.method, 'native');
    assert.strictEqual(shareCalled, true);
  });

  await test('2.2: shareList Nivel 1 captura AbortError sin fallar ni abrir WhatsApp', async () => {
    const sm = require('../js/share.js');
    const mockNav = {
      share: async () => {
        const err = new Error('Abort');
        err.name = 'AbortError';
        throw err;
      }
    };
    let openCalled = false;
    const mockWin = { open: () => { openCalled = true; } };

    const res = await sm.shareList('Texto', { navigator: mockNav, window: mockWin });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.method, 'native');
    assert.strictEqual(res.cancelled, true);
    assert.strictEqual(openCalled, false, 'No debe abrir WhatsApp si el usuario canceló');
  });

  await test('2.3: shareList Nivel 2 abre URL codificada de WhatsApp si no hay navigator.share', async () => {
    const sm = require('../js/share.js');
    let openedUrl = '';
    const mockWin = {
      open: (url, target, features) => {
        openedUrl = url;
        assert.strictEqual(target, '_blank');
        assert.strictEqual(features, 'noopener,noreferrer');
        return { closed: false };
      }
    };

    const res = await sm.shareList('Lista 🍎 & 🍌', { navigator: null, window: mockWin });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.method, 'whatsapp');
    assert.strictEqual(res.opened, true);
    assert.ok(openedUrl.startsWith('https://api.whatsapp.com/send?text='));
    assert.ok(openedUrl.includes('%F0%9F%8D%8E')); // 🍎
    assert.ok(openedUrl.includes('%26')); // &
  });

  await test('2.4: shareList Nivel 3 copia al portapapeles si la ventana fue bloqueada', async () => {
    const sm = require('../js/share.js');
    let copiedText = '';
    const mockNav = {
      clipboard: {
        writeText: async (t) => {
          copiedText = t;
          return true;
        }
      }
    };
    const mockWin = { open: () => null }; // Popup blocker

    const res = await sm.shareList('Texto Secreto', { navigator: mockNav, window: mockWin });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.method, 'clipboard');
    assert.strictEqual(res.copied, true);
    assert.strictEqual(res.opened, false);
    assert.strictEqual(copiedText, 'Texto Secreto');
  });

  // ----------------------------------------------------
  // 3. Pre-caché en sw.js
  // ----------------------------------------------------
  console.log('\n--- 3. Pre-caché en sw.js ---');

  await test('3.1: sw.js incluye /js/share.js en CORE_PRECACHE_URLS', () => {
    const swSource = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
    assert.ok(swSource.includes("'/js/share.js'"), "sw.js debe contener '/js/share.js' en CORE_PRECACHE_URLS");
  });

  // ----------------------------------------------------
  // 4. Integración en index.html
  // ----------------------------------------------------
  console.log('\n--- 4. Componentes DOM en index.html ---');

  await test('4.1: index.html contiene #shareButton y #printButton en .header-actions', () => {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    assert.ok(html.includes('id="shareButton"'), 'index.html debe contener id="shareButton"');
    assert.ok(html.includes('id="printButton"'), 'index.html debe contener id="printButton"');
    assert.ok(html.includes('data-lucide="share-2"'), 'shareButton debe tener icono share-2');
    assert.ok(html.includes('data-lucide="printer"'), 'printButton debe tener icono printer');
  });

  await test('4.2: index.html incluye #printListSummary para resumen de impresión', () => {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    assert.ok(html.includes('id="printListSummary"'), 'index.html debe incluir printListSummary');
    assert.ok(html.includes('id="printGrandTotalValue"'), 'index.html debe incluir printGrandTotalValue');
  });

  await test('4.3: index.html carga script js/share.js con versión ?v=2.5.0', () => {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    assert.ok(html.includes('src="js/share.js?v=2.5.0"'), 'index.html debe cargar js/share.js?v=2.5.0');
  });

  // ----------------------------------------------------
  // 5. Reglas @media print en style.css
  // ----------------------------------------------------
  console.log('\n--- 5. Estilos de Impresión en style.css ---');

  await test('5.1: style.css oculta printListSummary en pantalla normal', () => {
    const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
    assert.ok(css.includes('.print-list-summary'), 'Debe existir regla .print-list-summary');
    assert.ok(css.includes('display: none;'), 'Debe ocultar el resumen en pantalla');
  });

  await test('5.2: style.css define bloque @media print con alto contraste B/N y sin UI interactiva', () => {
    const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
    assert.ok(css.includes('@media print'), 'style.css debe contener regla @media print');
    assert.ok(css.includes('print-color-adjust: exact'), 'Debe incluir print-color-adjust');
    assert.ok(css.includes('break-inside: avoid'), 'Debe prevenir saltos de página con break-inside: avoid');
    assert.ok(css.includes('#panel-list'), 'Debe forzar visualización de #panel-list');
    assert.ok(css.includes('.item-checkbox'), 'Debe incluir estilo nítido para checkbox físico');
  });

  // ----------------------------------------------------
  // 6. Cableado en script.js
  // ----------------------------------------------------
  console.log('\n--- 6. Cableado y Comportamiento en script.js ---');

  await test('6.1: script.js contiene referencias seguras a shareButton y printButton', () => {
    const script = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
    assert.ok(script.includes("shareButton: document.getElementById('shareButton')"));
    assert.ok(script.includes("printButton: document.getElementById('printButton')"));
    assert.ok(script.includes('elements.shareButton.addEventListener'));
    assert.ok(script.includes('elements.printButton.addEventListener'));
    assert.ok(script.includes("window.addEventListener('beforeprint'"));
  });

  // ----------------------------------------------------
  // RESUMEN
  // ----------------------------------------------------
  console.log('\n==================================================');
  console.log(`TOTAL: ${total} | APROBADAS: ${passed} | FALLADAS: ${failed}`);
  console.log('==================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runM3Tests().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runM3Tests };
