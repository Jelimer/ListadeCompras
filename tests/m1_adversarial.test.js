/**
 * tests/m1_adversarial.test.js
 * Batería de Pruebas Adversariales, Resiliencia y Casos Extremos para Milestone 1 (M1).
 * Ejecutado por reviewer_m1_2 para desafiar asunciones y encontrar fallos no contemplados.
 */

const assert = require('assert');
const StorageService = require('../js/storage.js');
const { Store, createStore, generateId, deepClone } = require('../js/state.js');
const {
  parseFlexibleNumber,
  escapeHtml,
  sanitizeString,
  validateItem,
  validateBudget,
  validateImportPayload
} = require('../js/validation.js');

let total = 0;
let passed = 0;
let failed = 0;
const findings = [];

async function check(title, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  [PASS] ${title}`);
  } catch (err) {
    failed++;
    findings.push({ title, error: err.message, stack: err.stack });
    console.error(`  [FAIL] ${title} => ${err.message}`);
  }
}

async function runAdversarialSuite() {
  console.log('=== INICIANDO BATERÍA DE PRUEBAS ADVERSARIALES M1 ===\n');

  // -------------------------------------------------------------------------
  // 1. SEGURIDAD Y VECTORES DE ATAQUE XSS
  // -------------------------------------------------------------------------
  console.log('--- 1. Pruebas de Seguridad XSS e Inyección ---');

  await check('escapeHtml neutraliza tags anidados y atributos maliciosos', () => {
    const vectors = [
      '<img src=x onerror="alert(\'XSS\')">',
      '<svg onload=alert(1)>',
      '"><script>alert(document.cookie)</script>',
      '\' onfocus=\'alert(1)\'',
      'javascript:alert(1)',
      '<a href="javascript:alert(1)">Click</a>',
      '<<SCRIPT>alert("XSS");//<</SCRIPT>'
    ];

    vectors.forEach(v => {
      const escaped = escapeHtml(v);
      assert.ok(!escaped.includes('<img') || escaped.includes('&lt;img'), `Falla en: ${v}`);
      assert.ok(!escaped.includes('<script') || escaped.includes('&lt;script'), `Falla en: ${v}`);
      assert.ok(!escaped.includes('"') || escaped.includes('&quot;'), `Falla comillas dobles en: ${v}`);
      assert.ok(!escaped.includes("'") || escaped.includes('&#39;'), `Falla comillas simples en: ${v}`);
    });
  });

  await check('sanitizeString neutraliza caracteres nulos y secuencias de control', () => {
    const malicious = '\x00\x08\x0B\x0C\x0E\x1F\x7F\x80\x9FPayload Normal';
    const cleaned = sanitizeString(malicious);
    assert.strictEqual(cleaned, 'Payload Normal');
    assert.strictEqual(cleaned.charCodeAt(0), 80); // 'P'
  });

  await check('validateItem previene nombres basados puramente en caracteres nulos o invisibles', () => {
    const invisibleNames = [
      '\u0000\u0001\u0002',
      '   \t\n\r   ',
      '\u007F\u0080\u009F'
    ];
    invisibleNames.forEach(name => {
      const res = validateItem({ name });
      assert.strictEqual(res.isValid, false, `Debería invalidar: ${JSON.stringify(name)}`);
    });
  });

  // -------------------------------------------------------------------------
  // 2. CASOS LÍMITE NUMÉRICOS, OVERFLOW Y FORMATO HISPANO
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Casos Límite Numéricos y Formato ---');

  await check('parseFlexibleNumber maneja ceros con signo, notación científica y espacios raros', () => {
    assert.strictEqual(parseFlexibleNumber('-0'), -0);
    assert.strictEqual(parseFlexibleNumber('+0'), 0);
    assert.strictEqual(parseFlexibleNumber('1e3'), 1000);
    assert.strictEqual(parseFlexibleNumber('  3,14159  '), 3.14159);
    assert.ok(Number.isNaN(parseFlexibleNumber('1.2.3')));
    assert.ok(Number.isNaN(parseFlexibleNumber('1,2,3')));
    assert.ok(Number.isNaN(parseFlexibleNumber('NaN')));
  });

  await check('validateItem rechaza overflow numérico masivo o cantidades absurdas', () => {
    const hugeQty = validateItem({ name: 'Arroz', quantity: 1e12 });
    assert.strictEqual(hugeQty.isValid, false);
    assert.ok(hugeQty.errors.some(e => e.includes('99.999')));

    const hugePrice = validateItem({ name: 'Azafrán', unitPrice: 1e9 });
    assert.strictEqual(hugePrice.isValid, false);
    assert.ok(hugePrice.errors.some(e => e.includes('999.999,99')));
  });

  await check('validateBudget rechaza presupuestos desproporcionados (> $10M) y números NaN', () => {
    const res = validateBudget(15000000);
    assert.strictEqual(res.isValid, false);

    const resNan = validateBudget('NaN');
    assert.strictEqual(resNan.isValid, false);
  });

  await check('validateItem redondea con precisión IEEE 754 evitando centavos fantasma', () => {
    // 0.1 + 0.2 suele ser 0.30000000000000004
    const res = validateItem({
      name: 'Flotante Clásico',
      quantity: 1,
      unitPrice: 0.1 + 0.2
    });
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.cleanData.unitPrice, 0.30);
  });

  // -------------------------------------------------------------------------
  // 3. ESTRÉS DEL MOTOR DE DESHACER (UNDO ENGINE) Y PUB/SUB
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Estrés del Motor de Deshacer y Pub/Sub ---');

  await check('Undo Stack respeta el tope máximo de 30 pasos sin desbordar memoria', () => {
    const store = createStore();
    for (let i = 0; i < 50; i++) {
      store.addItem({ name: `Item ${i}` });
    }
    assert.strictEqual(store.getItems().length, 50);
    assert.strictEqual(store.undoStack.length, 30);

    // Deshacer las 30 disponibles
    for (let i = 0; i < 30; i++) {
      const res = store.undoLastAction();
      assert.strictEqual(res.success, true);
    }
    assert.strictEqual(store.getItems().length, 20);
    assert.strictEqual(store.canUndo(), false);

    // Intento 31 debe fallar elegantemente
    const overUndo = store.undoLastAction();
    assert.strictEqual(overUndo.success, false);
  });

  await check('Interleaving: Alternar ADD, UPDATE, DELETE, TOGGLE y deshacerlos en orden LIFO', () => {
    const store = createStore();
    const item1 = store.addItem({ name: 'Manzana', quantity: 2, unitPrice: 1.5 });
    const item2 = store.addItem({ name: 'Pera', quantity: 1, unitPrice: 2.0 });

    store.updateItem(item1.id, { unitPrice: 2.5 });
    store.toggleCompleted(item2.id);
    store.deleteItem(item1.id);

    // Estado actual: solo queda item2, completado
    assert.strictEqual(store.getItems().length, 1);
    assert.strictEqual(store.getItemById(item2.id).completed, true);

    // 1. Deshacer deleteItem(item1) -> item1 reinsertado con precio 2.5
    assert.strictEqual(store.undoLastAction().success, true);
    assert.strictEqual(store.getItems().length, 2);
    assert.strictEqual(store.getItemById(item1.id).unitPrice, 2.5);

    // 2. Deshacer toggleCompleted(item2) -> item2 vuelve a no completado
    assert.strictEqual(store.undoLastAction().success, true);
    assert.strictEqual(store.getItemById(item2.id).completed, false);

    // 3. Deshacer updateItem(item1) -> item1 vuelve a precio original 1.5
    assert.strictEqual(store.undoLastAction().success, true);
    assert.strictEqual(store.getItemById(item1.id).unitPrice, 1.5);

    // 4. Deshacer addItem(item2) -> item2 eliminado
    assert.strictEqual(store.undoLastAction().success, true);
    assert.strictEqual(store.getItems().length, 1);
    assert.strictEqual(store.getItemById(item2.id), null);

    // 5. Deshacer addItem(item1) -> item1 eliminado
    assert.strictEqual(store.undoLastAction().success, true);
    assert.strictEqual(store.getItems().length, 0);
  });

  await check('Pub/Sub: un suscriptor que arroja error no interrumpe a los demás suscriptores', () => {
    const store = createStore();
    let healthySubscriberCalled = false;

    store.subscribe(() => {
      throw new Error('Explosión en suscriptor defectuoso');
    });

    store.subscribe(() => {
      healthySubscriberCalled = true;
    });

    // Añadir ítem no debe lanzar excepción al exterior
    store.addItem({ name: 'Prueba Resiliencia PubSub' });
    assert.strictEqual(healthySubscriberCalled, true);
  });

  // -------------------------------------------------------------------------
  // 4. RESILIENCIA DE STORAGE ANTE FALLOS SIMULADOS
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Resiliencia y Fallos Simulados de Persistencia ---');

  await check('StorageServiceImpl con driver que arroja QuotaExceededError degrada a memoria y lee coherentemente', async () => {
    const failingDriver = {
      _store: {},
      getItem(k) {
        // En navegadores reales getItem NO lanza excepción
        return this._store[k] !== undefined ? this._store[k] : null;
      },
      setItem(k, v) {
        throw new Error('QuotaExceededError: LocalStorage full');
      },
      removeItem(k) {
        delete this._store[k];
      }
    };

    const StorageServiceImpl = StorageService.StorageServiceImpl;
    const resilientStorage = new StorageServiceImpl(failingDriver);

    // Guardar debe capturar el error y almacenar en fallback en memoria
    await resilientStorage.saveItems([{ name: 'Pan de Centeno', quantity: 2, unitPrice: 1.8 }]);
    
    // Al leer con driver que falla en setItem, debe consultar el fallback en memoria
    const items = await resilientStorage.loadItems();
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].name, 'Pan de Centeno');
  });

  await check('Normalizador repara payloads con claves extrañas o tipos corruptos', () => {
    const weirdPayload = {
      id: 12345, // Número en vez de string
      name: { toString: () => 'Objeto como nombre' },
      quantity: '   2,75  ',
      unitPrice: '10,50',
      category: 999,
      location: null,
      completed: 'true' // Truthy string
    };

    const normalized = StorageService.normalizeItem(weirdPayload);
    assert.strictEqual(typeof normalized.id, 'string');
    assert.strictEqual(normalized.quantity, 2.75);
    assert.strictEqual(normalized.unitPrice, 10.50);
    assert.strictEqual(normalized.category, '999');
    assert.strictEqual(normalized.location, 'General');
    assert.strictEqual(normalized.completed, true);
  });

  console.log('\n==================================================');
  console.log(`RESULTADO DE PRUEBAS ADVERSARIALES:`);
  console.log(`Total: ${total} | Pasadas: ${passed} | Falladas: ${failed}`);
  console.log('==================================================');

  if (failed > 0) {
    console.error('\nFALLOS ENCONTRADOS:');
    findings.forEach(f => console.error(`- ${f.title}: ${f.error}`));
    process.exit(1);
  } else {
    console.log('\n¡TODAS LAS PRUEBAS ADVERSARIALES PASARON SATISFACTORIAMENTE!');
  }
}

runAdversarialSuite().catch(e => {
  console.error('Error fatal:', e);
  process.exit(1);
});
