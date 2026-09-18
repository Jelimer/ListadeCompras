/**
 * tests/m1_unit.test.js
 * Suite Integral de Pruebas Unitarias para Milestone 1 (R1).
 * Verifica StorageService (offline-first), Store (Pub/Sub + Undo) y ValidationModule (XSS + estricto).
 * 
 * Ejecución: node tests/m1_unit.test.js
 */

const assert = require('assert');
const path = require('path');
const { performance } = require('perf_hooks');

// Importar módulos bajo prueba
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

// Mini-framework de pruebas descriptivo y autónomo
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

async function test(description, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ ${description}`);
  } catch (err) {
    failedTests++;
    failures.push({ description, error: err });
    console.error(`  ✗ ${description}`);
    console.error(`    ${err.message}`);
  }
}

async function describe(suiteName, fn) {
  console.log(`\n==================================================`);
  console.log(`SUITE: ${suiteName}`);
  console.log(`==================================================`);
  await fn();
}

async function runAllTests() {
  console.log('Iniciando Suite de Pruebas Unitarias M1 (Arquitectura del Núcleo y Persistencia)...\n');

  // =========================================================================
  // 1. TESTS DE VALIDATION.JS
  // =========================================================================
  await describe('1. Módulo de Validación y Sanitización (js/validation.js)', async () => {
    await test('parseFlexibleNumber: parsea enteros y decimales con punto', () => {
      assert.strictEqual(parseFlexibleNumber(10), 10);
      assert.strictEqual(parseFlexibleNumber('25.5'), 25.5);
      assert.strictEqual(parseFlexibleNumber('  100.99  '), 100.99);
    });

    await test('parseFlexibleNumber: parsea comas decimales hispanas ("3,50" -> 3.5)', () => {
      assert.strictEqual(parseFlexibleNumber('3,50'), 3.5);
      assert.strictEqual(parseFlexibleNumber('  0,75  '), 0.75);
      assert.strictEqual(parseFlexibleNumber('1234,56'), 1234.56);
    });

    await test('parseFlexibleNumber: rechaza entradas no numéricas, infinitos y booleanos', () => {
      assert.ok(Number.isNaN(parseFlexibleNumber('abc')));
      assert.ok(Number.isNaN(parseFlexibleNumber('')));
      assert.ok(Number.isNaN(parseFlexibleNumber(null)));
      assert.ok(Number.isNaN(parseFlexibleNumber(undefined)));
      assert.ok(Number.isNaN(parseFlexibleNumber(true)));
      assert.ok(Number.isNaN(parseFlexibleNumber(false)));
      assert.ok(Number.isNaN(parseFlexibleNumber(Infinity)));
      assert.ok(Number.isNaN(parseFlexibleNumber(-Infinity)));
      assert.ok(Number.isNaN(parseFlexibleNumber({})));
      assert.ok(Number.isNaN(parseFlexibleNumber([])));
    });

    await test('escapeHtml: neutraliza inyecciones XSS convirtiendo caracteres peligrosos', () => {
      const malicious = '<script>alert("XSS & theft")</script>';
      const escaped = escapeHtml(malicious);
      assert.strictEqual(escaped, '&lt;script&gt;alert(&quot;XSS &amp; theft&quot;)&lt;/script&gt;');
      assert.ok(!escaped.includes('<'));
      assert.ok(!escaped.includes('>'));
    });

    await test('escapeHtml: maneja comillas simples y valores nulos', () => {
      assert.strictEqual(escapeHtml("O'Connor"), "O&#39;Connor");
      assert.strictEqual(escapeHtml(null), '');
      assert.strictEqual(escapeHtml(undefined), '');
      assert.strictEqual(escapeHtml('Texto limpio 123'), 'Texto limpio 123');
    });

    await test('sanitizeString: remueve caracteres de control y recorta espacios', () => {
      const dirty = '\u0000\u001F  Producto con control  \u007F';
      assert.strictEqual(sanitizeString(dirty), 'Producto con control');
      assert.strictEqual(sanitizeString('   Trimmeado   '), 'Trimmeado');
    });

    await test('sanitizeString: trunca a maxLength respetando el límite', () => {
      const longStr = 'a'.repeat(200);
      const truncated = sanitizeString(longStr, 120);
      assert.strictEqual(truncated.length, 120);
    });

    await test('validateItem: valida exitosamente un producto válido con todos los campos', () => {
      const input = {
        name: 'Arroz Integral 1kg',
        quantity: '2,5',
        unitPrice: '3,80',
        location: 'Supermercado Central',
        category: 'Despensa',
        completed: false
      };
      const result = validateItem(input);
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.errors.length, 0);
      assert.strictEqual(result.cleanData.name, 'Arroz Integral 1kg');
      assert.strictEqual(result.cleanData.quantity, 2.5);
      assert.strictEqual(result.cleanData.unitPrice, 3.8);
      assert.strictEqual(result.cleanData.location, 'Supermercado Central');
      assert.strictEqual(result.cleanData.category, 'Despensa');
      assert.strictEqual(result.cleanData.completed, false);
    });

    await test('validateItem: asigna valores por defecto tolerantes cuando aplica', () => {
      const minimal = { name: 'Manzanas' };
      const result = validateItem(minimal);
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.cleanData.quantity, 1);
      assert.strictEqual(result.cleanData.unitPrice, 0);
      assert.strictEqual(result.cleanData.location, 'General');
      assert.strictEqual(result.cleanData.category, 'General');
      assert.strictEqual(result.cleanData.completed, false);
    });

    await test('validateItem: rechaza nombres vacíos o de solo espacios con mensaje en español', () => {
      const resEmpty = validateItem({ name: '' });
      assert.strictEqual(resEmpty.isValid, false);
      assert.ok(resEmpty.errors.some(e => e.includes('nombre del producto es obligatorio')));

      const resSpaces = validateItem({ name: '     ' });
      assert.strictEqual(resSpaces.isValid, false);
      assert.ok(resSpaces.errors.some(e => e.includes('nombre del producto es obligatorio')));
    });

    await test('validateItem: rechaza nombres que superen los 120 caracteres', () => {
      const resLong = validateItem({ name: 'A'.repeat(121) });
      assert.strictEqual(resLong.isValid, false);
      assert.ok(resLong.errors.some(e => e.includes('120 caracteres')));
    });

    await test('validateItem: rechaza cantidades <= 0 o negativas', () => {
      const resZero = validateItem({ name: 'Leche', quantity: 0 });
      assert.strictEqual(resZero.isValid, false);
      assert.ok(resZero.errors.some(e => e.includes('mayor a 0')));

      const resNegative = validateItem({ name: 'Leche', quantity: -5 });
      assert.strictEqual(resNegative.isValid, false);
      assert.ok(resNegative.errors.some(e => e.includes('mayor a 0')));
    });

    await test('validateItem: rechaza cantidades micro infinitesimales que redondean a 0 (ej. 0.0001)', () => {
      const res = validateItem({ name: 'Sal', quantity: 0.0001 });
      assert.strictEqual(res.isValid, false, '0.0001 debe ser inválido');
      assert.ok(res.errors.some(e => e.includes('mayor a 0') || e.includes('0.001')));

      const resThreshold = validateItem({ name: 'Pimienta', quantity: 0.00049 });
      assert.strictEqual(resThreshold.isValid, false, '0.00049 debe ser inválido');

      const resValidMin = validateItem({ name: 'Azafrán', quantity: 0.0005 });
      assert.strictEqual(resValidMin.isValid, true, '0.0005 debe ser válido');
      assert.strictEqual(resValidMin.cleanData.quantity, 0.001);
    });

    await test('validateItem: rechaza precios unitarios negativos', () => {
      const resNegativePrice = validateItem({ name: 'Pan', unitPrice: -2.5 });
      assert.strictEqual(resNegativePrice.isValid, false);
      assert.ok(resNegativePrice.errors.some(e => e.includes('no puede ser negativo')));
    });

    await test('validateItem: redondea cantidades a 3 decimales y precios a 2 decimales', () => {
      const res = validateItem({
        name: 'Queso por peso',
        quantity: 1.23456,
        unitPrice: 10.998
      });
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.cleanData.quantity, 1.235);
      assert.strictEqual(res.cleanData.unitPrice, 11.00);
    });

    await test('validateBudget: valida presupuestos válidos y admite coma decimal', () => {
      const res1 = validateBudget('250,50');
      assert.strictEqual(res1.isValid, true);
      assert.strictEqual(res1.cleanData, 250.5);

      const resEmpty = validateBudget('');
      assert.strictEqual(resEmpty.isValid, true);
      assert.strictEqual(resEmpty.cleanData, 0);

      const resNull = validateBudget(null);
      assert.strictEqual(resNull.isValid, true);
      assert.strictEqual(resNull.cleanData, 0);
    });

    await test('validateBudget: rechaza presupuesto negativo o no numérico con mensaje en español', () => {
      const resNeg = validateBudget('-50');
      assert.strictEqual(resNeg.isValid, false);
      assert.ok(resNeg.errors.some(e => e.includes('número negativo')));

      const resInvalid = validateBudget('cien euros');
      assert.strictEqual(resInvalid.isValid, false);
      assert.ok(resInvalid.errors.some(e => e.includes('número válido')));
    });

    await test('validateImportPayload: valida lotes de importación estructurados', () => {
      const payload = {
        version: '1.0',
        budget: '150,00',
        items: [
          { name: 'Huevos 12u', quantity: 1, unitPrice: '2,99' },
          { name: 'Café', quantity: 2, unitPrice: 4.5 }
        ]
      };
      const res = validateImportPayload(payload);
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.cleanData.items.length, 2);
      assert.strictEqual(res.cleanData.budget, 150);
      assert.strictEqual(res.cleanData.items[0].name, 'Huevos 12u');
      assert.strictEqual(res.cleanData.items[0].unitPrice, 2.99);
    });

    await test('validateImportPayload: detecta errores en filas específicas', () => {
      const corruptPayload = {
        items: [
          { name: 'Válido', quantity: 1 },
          { name: '', quantity: 1 }, // Inválido: nombre vacío
          { name: 'Con precio negativo', quantity: 1, unitPrice: -10 } // Inválido
        ]
      };
      const res = validateImportPayload(corruptPayload);
      assert.strictEqual(res.isValid, false);
      assert.ok(res.errors[0].includes('2 productos con errores'));
    });
  });

  // =========================================================================
  // 2. TESTS DE STORAGESERVICE (OFFLINE-FIRST)
  // =========================================================================
  await describe('2. Capa de Persistencia y Almacenamiento Offline-First (js/storage.js)', async () => {
    // Limpiar storage antes de iniciar
    StorageService.clearAll();

    await test('Inicialización: opera 100% en Node.js con MemoryStorageDriver sin arrojar excepciones', () => {
      const status = StorageService.getSyncStatus();
      assert.strictEqual(typeof status.isOnline, 'boolean');
      assert.strictEqual(status.isFirebaseConfigured, false);
      assert.ok(['localStorage', 'memory', 'custom'].includes(status.storageType));
    });

    await test('saveItems y loadItems: guarda y recupera productos con normalización', async () => {
      const itemsToSave = [
        { id: 'item_1', name: 'Leche Desnatada', quantity: 2, unitPrice: 1.25, location: 'Super A' },
        { id: 'item_2', name: 'Pan Integral', quantity: '3,0', unitPrice: '0,90', category: 'Panadería' }
      ];

      await StorageService.saveItems(itemsToSave);
      const loaded = await StorageService.loadItems();

      assert.strictEqual(loaded.length, 2);
      assert.strictEqual(loaded[0].name, 'Leche Desnatada');
      assert.strictEqual(loaded[0].quantity, 2);
      assert.strictEqual(loaded[0].unitPrice, 1.25);
      assert.strictEqual(loaded[0].location, 'Super A');
      assert.strictEqual(loaded[0].category, 'General'); // Default

      assert.strictEqual(loaded[1].name, 'Pan Integral');
      assert.strictEqual(loaded[1].quantity, 3);
      assert.strictEqual(loaded[1].unitPrice, 0.9);
      assert.strictEqual(loaded[1].category, 'Panadería');
    });

    await test('StorageServiceImpl: degradación resiliente y lectura íntegra de _memoryFallback ante fallo de driver', async () => {
      const mockFailingDriver = {
        getItem() { return null; },
        setItem() {
          const err = new Error('Disk Full');
          err.name = 'QuotaExceededError';
          throw err;
        },
        removeItem() {},
        clear() {}
      };
      const storage = new StorageService.StorageServiceImpl(mockFailingDriver);
      await storage.saveItems([{ id: 'm_1', name: 'Item Memoria', quantity: 1, unitPrice: 2.0 }]);
      const items = await storage.loadItems();
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].name, 'Item Memoria');
    });

    await test('Normalización defensiva: repara números negativos o NaN en storage', async () => {
      const corruptItems = [
        { id: 'c1', name: 'Producto Dañado', quantity: -10, unitPrice: -50 }
      ];
      await StorageService.saveItems(corruptItems);
      const loaded = await StorageService.loadItems();

      assert.strictEqual(loaded[0].quantity, 1); // Reparado a 1
      assert.strictEqual(loaded[0].unitPrice, 0); // Reparado a 0
    });

    await test('Presupuesto: saveBudget y loadBudget gestionan números y rechazan negativos', () => {
      StorageService.saveBudget(350.75);
      assert.strictEqual(StorageService.loadBudget(), 350.75);

      StorageService.saveBudget(-100);
      assert.strictEqual(StorageService.loadBudget(), 0);

      StorageService.saveBudget('invalido');
      assert.strictEqual(StorageService.loadBudget(), 0);
    });

    await test('Tema: saveTheme y loadTheme persisten solo light o dark', () => {
      StorageService.saveTheme('dark');
      assert.strictEqual(StorageService.loadTheme(), 'dark');

      StorageService.saveTheme('light');
      assert.strictEqual(StorageService.loadTheme(), 'light');

      StorageService.saveTheme('modo-invalido');
      // No debe sobreescribir con valor inválido
      assert.strictEqual(StorageService.loadTheme(), 'light');
    });

    await test('Preferencias UI: locationOrder y collapsedGroups', () => {
      const order = ['Frutería', 'Carnicería', 'Pescadería'];
      StorageService.saveLocationOrder(order);
      assert.deepStrictEqual(StorageService.loadLocationOrder(), order);

      const collapsed = ['Frutería'];
      StorageService.saveCollapsedGroups(collapsed);
      assert.deepStrictEqual(StorageService.loadCollapsedGroups(), collapsed);
    });

    await test('Adaptador Firebase: detecta configuraciones dummy y nunca arroja excepciones', () => {
      const dummyConfig1 = { apiKey: 'dummy-api-key', projectId: 'dummy-project' };
      assert.strictEqual(StorageService.isRealFirebaseConfig(dummyConfig1), false);

      const dummyConfig2 = { apiKey: 'AIzaSy_fake_dummy_test', projectId: 'project' };
      assert.strictEqual(StorageService.isRealFirebaseConfig(dummyConfig2), false);

      const realLookingConfig = { apiKey: 'AIzaSyD-validApiKeyReal123456789', projectId: 'mi-lista-compras-prod' };
      assert.strictEqual(StorageService.isRealFirebaseConfig(realLookingConfig), true);

      // initFirebase con dummy config debe retornar false sin error
      const initialized = StorageService.initFirebase(dummyConfig1);
      assert.strictEqual(initialized, false);
      assert.strictEqual(StorageService.getSyncStatus().isFirebaseConfigured, false);
    });

    await test('clearAll: limpia todo el contenido almacenado', async () => {
      StorageService.clearAll();
      const items = await StorageService.loadItems();
      assert.strictEqual(items.length, 0);
      assert.strictEqual(StorageService.loadBudget(), 0);
      assert.strictEqual(StorageService.loadTheme(), null);
      assert.deepStrictEqual(StorageService.loadLocationOrder(), []);
      assert.deepStrictEqual(StorageService.loadCollapsedGroups(), []);
    });
  });

  // =========================================================================
  // 3. TESTS DE STORE (CENTRALIZED REACTIVE PUB/SUB & UNDO)
  // =========================================================================
  await describe('3. Store Centralizado Reactivo y Motor de Deshacer (js/state.js)', async () => {
    let store;

    await test('Inicialización: arranca con estado por defecto limpio y aislado', () => {
      store = createStore({ budget: 100 });
      assert.strictEqual(store.getBudget(), 100);
      assert.strictEqual(store.getItems().length, 0);
      assert.strictEqual(store.canUndo(), false);
    });

    await test('Pub/Sub: emite eventos granulares y globales en mutaciones', () => {
      let globalCalled = 0;
      let addedEventData = null;

      const unsubGlobal = store.subscribe((state, event, data) => {
        globalCalled++;
      });

      const unsubAdded = store.on('item:added', (data) => {
        addedEventData = data;
      });

      const item = store.addItem({ name: 'Yogurt Griego', unitPrice: 1.99, quantity: 4 });

      assert.strictEqual(globalCalled >= 1, true);
      assert.ok(addedEventData !== null);
      assert.strictEqual(addedEventData.item.name, 'Yogurt Griego');
      assert.strictEqual(item.name, 'Yogurt Griego');
      assert.strictEqual(item.quantity, 4);

      unsubGlobal();
      unsubAdded();

      const prevCalls = globalCalled;
      store.addItem({ name: 'Galletas' });
      // Desuscrito no debe recibir más llamadas
      assert.strictEqual(globalCalled, prevCalls);
    });

    await test('updateItem: actualiza un producto existente manteniendo id y timestamp original', () => {
      const items = store.getItems();
      const targetId = items[0].id;
      const originalTimestamp = items[0].timestamp;

      const updated = store.updateItem(targetId, {
        name: 'Galletas de Avena',
        unitPrice: 2.50
      });

      assert.strictEqual(updated.id, targetId);
      assert.strictEqual(updated.name, 'Galletas de Avena');
      assert.strictEqual(updated.unitPrice, 2.5);
      assert.strictEqual(updated.timestamp, originalTimestamp);
      assert.ok(typeof updated.updatedAt === 'number');

      // Actualizar ID inexistente retorna null
      assert.strictEqual(store.updateItem('id_fantasma', { name: 'X' }), null);
    });

    await test('toggleCompleted: invierte el estado de compra', () => {
      const item = store.getItems()[0];
      assert.strictEqual(item.completed, false);

      const toggled = store.toggleCompleted(item.id);
      assert.strictEqual(toggled.completed, true);

      const toggledBack = store.toggleCompleted(item.id);
      assert.strictEqual(toggledBack.completed, false);
    });

    await test('deleteItem: elimina producto y limpia editingItemId si estaba en edición', () => {
      const item = store.addItem({ name: 'Producto a borrar' });
      store.setEditingItem(item.id);
      assert.strictEqual(store.getState().editingItemId, item.id);

      const deleted = store.deleteItem(item.id);
      assert.strictEqual(deleted.id, item.id);
      assert.strictEqual(store.getItemById(item.id), null);
      assert.strictEqual(store.getState().editingItemId, null);
    });

    await test('clearCompleted: elimina únicamente los ítems completados', () => {
      // Limpiar store para prueba controlada
      store = createStore();
      store.addItem({ name: 'Item 1 Pendiente', completed: false });
      store.addItem({ name: 'Item 2 Comprado', completed: true });
      store.addItem({ name: 'Item 3 Comprado', completed: true });
      store.addItem({ name: 'Item 4 Pendiente', completed: false });

      assert.strictEqual(store.getItems().length, 4);

      const cleared = store.clearCompleted();
      assert.strictEqual(cleared.length, 2);

      const remaining = store.getItems();
      assert.strictEqual(remaining.length, 2);
      assert.ok(remaining.every(i => !i.completed));
    });

    await test('setBudget y setFilter: actualizan propiedades correspondientes', () => {
      store.setBudget(250);
      assert.strictEqual(store.getBudget(), 250);

      store.setFilter({ searchQuery: 'avena', hideCompleted: true });
      const filter = store.getFilter();
      assert.strictEqual(filter.searchQuery, 'avena');
      assert.strictEqual(filter.hideCompleted, true);
    });

    await test('reorderLocations y toggleGroupCollapse: gestionan organización de grupos', () => {
      const newOrder = ['Verdulería', 'Carnicería', 'General'];
      store.reorderLocations(newOrder);
      assert.deepStrictEqual(store.getState().locationOrder, newOrder);

      const isCollapsed1 = store.toggleGroupCollapse('Verdulería');
      assert.strictEqual(isCollapsed1, true);
      assert.ok(store.getState().collapsedGroups.includes('Verdulería'));

      const isCollapsed2 = store.toggleGroupCollapse('Verdulería');
      assert.strictEqual(isCollapsed2, false);
      assert.ok(!store.getState().collapsedGroups.includes('Verdulería'));
    });

    await test('Selectores puros: getFilteredItems filtra por búsqueda y hideCompleted', () => {
      store = createStore();
      store.addItem({ name: 'Manzana Fuji', location: 'Frutería', category: 'Frutas', completed: false });
      store.addItem({ name: 'Manzana Verde', location: 'Frutería', category: 'Frutas', completed: true });
      store.addItem({ name: 'Pescado Merluza', location: 'Pescadería', category: 'Pescados', completed: false });

      // Sin filtro
      assert.strictEqual(store.getFilteredItems().length, 3);

      // Búsqueda por texto insensible a mayúsculas
      store.setFilter({ searchQuery: 'MANZANA' });
      assert.strictEqual(store.getFilteredItems().length, 2);

      // Búsqueda + Ocultar completados
      store.setFilter({ searchQuery: 'manzana', hideCompleted: true });
      const filtered = store.getFilteredItems();
      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].name, 'Manzana Fuji');
    });

    await test('Selectores puros: getGroupedItems agrupa y ordena correctamente', () => {
      store = createStore({ locationOrder: ['Pescadería', 'Frutería'] });
      store.addItem({ name: 'Bananos', location: 'Frutería', completed: true });
      store.addItem({ name: 'Aguacates', location: 'Frutería', completed: false });
      store.addItem({ name: 'Salmón', location: 'Pescadería', completed: false });

      const grouped = store.getGroupedItems();
      const locations = Object.keys(grouped);

      // Pescadería va primero por locationOrder
      assert.strictEqual(locations[0], 'Pescadería');
      assert.strictEqual(locations[1], 'Frutería');

      // Dentro de Frutería, pendientes van antes que completados
      assert.strictEqual(grouped['Frutería'][0].name, 'Aguacates'); // Pendiente
      assert.strictEqual(grouped['Frutería'][1].name, 'Bananos');   // Comprado
    });

    await test('Inmutabilidad: mutar el estado retornado por getState() no corrompe el Store', () => {
      const state1 = store.getState();
      state1.items.push({ name: 'Hack Invasivo' });
      state1.budget = 9999999;

      const state2 = store.getState();
      assert.strictEqual(state2.items.some(i => i.name === 'Hack Invasivo'), false);
      assert.notStrictEqual(state2.budget, 9999999);
    });

    // ==========================================
    // TESTS DEL MOTOR DE DESHACER (UNDO ENGINE)
    // ==========================================
    await test('Undo: deshacer ADD_ITEM elimina el producto añadido', () => {
      store = createStore();
      const item = store.addItem({ name: 'Producto Temporal' });
      assert.strictEqual(store.getItems().length, 1);
      assert.strictEqual(store.canUndo(), true);

      const undoResult = store.undoLastAction();
      assert.strictEqual(undoResult.success, true);
      assert.strictEqual(store.getItems().length, 0);
    });

    await test('Undo: deshacer DELETE_ITEM reinserta el producto en su posición original', () => {
      store = createStore();
      const item1 = store.addItem({ name: 'Primero' });
      const item2 = store.addItem({ name: 'Segundo' });
      const item3 = store.addItem({ name: 'Tercero' });

      // Borrar el producto del medio (item2)
      store.deleteItem(item2.id);
      assert.strictEqual(store.getItems().length, 2);
      assert.strictEqual(store.getItemById(item2.id), null);

      // Deshacer borrado
      const undoResult = store.undoLastAction();
      assert.strictEqual(undoResult.success, true);
      assert.strictEqual(store.getItems().length, 3);
      assert.ok(store.getItemById(item2.id) !== null);
      assert.strictEqual(store.getItemById(item2.id).name, 'Segundo');
    });

    await test('Undo: deshacer UPDATE_ITEM restaura los valores previos a la edición', () => {
      store = createStore();
      const item = store.addItem({ name: 'Cereal Original', unitPrice: 3.0 });
      store.updateItem(item.id, { name: 'Cereal Modificado', unitPrice: 5.5 });

      assert.strictEqual(store.getItemById(item.id).name, 'Cereal Modificado');
      assert.strictEqual(store.getItemById(item.id).unitPrice, 5.5);

      const undoResult = store.undoLastAction();
      assert.strictEqual(undoResult.success, true);
      assert.strictEqual(store.getItemById(item.id).name, 'Cereal Original');
      assert.strictEqual(store.getItemById(item.id).unitPrice, 3.0);
    });

    await test('Undo: deshacer TOGGLE_COMPLETED restaura el estado previo', () => {
      store = createStore();
      const item = store.addItem({ name: 'Mantequilla', completed: false });

      store.toggleCompleted(item.id);
      assert.strictEqual(store.getItemById(item.id).completed, true);

      store.undoLastAction();
      assert.strictEqual(store.getItemById(item.id).completed, false);
    });

    await test('Undo: deshacer CLEAR_COMPLETED restaura todos los productos limpiados', () => {
      store = createStore();
      store.addItem({ name: 'Pendiente 1', completed: false });
      store.addItem({ name: 'Comprado 1', completed: true });
      store.addItem({ name: 'Comprado 2', completed: true });

      assert.strictEqual(store.getItems().length, 3);
      store.clearCompleted();
      assert.strictEqual(store.getItems().length, 1);

      const undoResult = store.undoLastAction();
      assert.strictEqual(undoResult.success, true);
      assert.strictEqual(store.getItems().length, 3);
      assert.strictEqual(store.getItems().filter(i => i.completed).length, 2);
    });

    await test('Undo: invocar en pila vacía retorna { success: false } limpiamente', () => {
      store = createStore();
      const result = store.undoLastAction();
      assert.strictEqual(result.success, false);
    });

    await test('Integración Store con StorageService: auto-persistencia en mutaciones', async () => {
      StorageService.clearAll();
      const persistentStore = createStore({}, StorageService);

      persistentStore.addItem({ name: 'Persistente 1', unitPrice: 4.2 });
      persistentStore.setBudget(500);

      const storedItems = await StorageService.loadItems();
      assert.strictEqual(storedItems.length, 1);
      assert.strictEqual(storedItems[0].name, 'Persistente 1');
      assert.strictEqual(StorageService.loadBudget(), 500);
    });
  });

  // =========================================================================
  // 4. SUITE 4: PRUEBAS DE ESTRÉS, CONCURRENCIA, UNDO FIDELITY Y PUB/SUB LEAKS
  // =========================================================================
  await describe('4. Estrés, Concurrencia, Fidelidad de Undo y Pub/Sub Leak Test (challenger_m1_2)', async () => {
    await test('Undo 4.1: Ciclo completo (Add -> Update -> Toggle -> Delete) restaurado al 100% idéntico a S0', () => {
      const store = createStore();
      const initialSnapshot = JSON.stringify(store.getState());

      const added = store.addItem({ name: 'Leche Desnatada', quantity: 2, unitPrice: 1.25, category: 'Lácteos', location: 'Nevera' });
      store.updateItem(added.id, { quantity: 4, unitPrice: 1.30, name: 'Leche Entera' });
      store.toggleCompleted(added.id);
      store.deleteItem(added.id);

      assert.strictEqual(store.getItems().length, 0);
      assert.strictEqual(store.canUndo(), true);

      // Deshacer paso a paso
      assert.strictEqual(store.undoLastAction().success, true); // restaura borrado
      assert.strictEqual(store.getItems().length, 1);
      assert.strictEqual(store.getItems()[0].completed, true);

      assert.strictEqual(store.undoLastAction().success, true); // restaura toggle
      assert.strictEqual(store.getItems()[0].completed, false);

      assert.strictEqual(store.undoLastAction().success, true); // restaura update
      assert.strictEqual(store.getItems()[0].quantity, 2);
      assert.strictEqual(store.getItems()[0].unitPrice, 1.25);
      assert.strictEqual(store.getItems()[0].name, 'Leche Desnatada');

      assert.strictEqual(store.undoLastAction().success, true); // elimina item añadido
      assert.strictEqual(store.getItems().length, 0);

      const finalSnapshot = JSON.stringify(store.getState());
      assert.strictEqual(finalSnapshot, initialSnapshot, 'El estado final tras deshacer todas las acciones debe ser idéntico al snapshot inicial');
    });

    await test('Undo 4.2: Secuencia intensa de 25 mutaciones reversibles con recuperación 100% de snapshot', () => {
      const store = createStore();
      for (let i = 0; i < 5; i++) {
        store.addItem({
          name: `Base Product ${i}`,
          quantity: i + 1,
          unitPrice: (i + 1) * 2.5,
          category: i % 2 === 0 ? 'Alimentos' : 'Bebidas',
          location: i % 2 === 0 ? 'Pasillo 1' : 'Pasillo 2'
        });
      }

      const baselineSnapshot = store.getState();
      const actionsCount = 25;

      for (let step = 0; step < actionsCount; step++) {
        const currentItems = store.getItems();
        const op = step % 4;

        if (op === 0) {
          store.addItem({ name: `Extra Item ${step}`, quantity: 1, unitPrice: 5.0 });
        } else if (op === 1 && currentItems.length > 0) {
          const target = currentItems[step % currentItems.length];
          store.updateItem(target.id, { quantity: target.quantity + 1, unitPrice: target.unitPrice + 0.5 });
        } else if (op === 2 && currentItems.length > 0) {
          const target = currentItems[step % currentItems.length];
          store.toggleCompleted(target.id);
        } else if (op === 3 && currentItems.length > 2) {
          const target = currentItems[step % currentItems.length];
          store.deleteItem(target.id);
        } else {
          store.addItem({ name: `Fallback Item ${step}`, quantity: 2, unitPrice: 3.0 });
        }
      }

      for (let step = 0; step < actionsCount; step++) {
        assert.strictEqual(store.canUndo(), true);
        const res = store.undoLastAction();
        assert.strictEqual(res.success, true);
      }

      const restoredState = store.getState();
      assert.strictEqual(restoredState.items.length, baselineSnapshot.items.length);

      for (let i = 0; i < baselineSnapshot.items.length; i++) {
        const expected = baselineSnapshot.items[i];
        const actual = restoredState.items.find(x => x.id === expected.id);
        assert.ok(actual, `Item ${expected.id} debe existir`);
        assert.strictEqual(actual.name, expected.name);
        assert.strictEqual(actual.quantity, expected.quantity);
        assert.strictEqual(actual.unitPrice, expected.unitPrice);
        assert.strictEqual(actual.completed, expected.completed);
        assert.strictEqual(actual.category, expected.category);
        assert.strictEqual(actual.location, expected.location);
      }
    });

    await test('Undo 4.3: Límite de pila (maxUndoSteps = 30) y comportamiento FIFO sliding-window', () => {
      const store = createStore();
      for (let i = 0; i < 40; i++) {
        store.addItem({ name: `Item ${i}` });
      }

      assert.strictEqual(store.undoStack.length, 30);

      let undos = 0;
      while (store.canUndo()) {
        const res = store.undoLastAction();
        assert.strictEqual(res.success, true);
        undos++;
      }

      assert.strictEqual(undos, 30);
      assert.strictEqual(store.canUndo(), false);
      assert.strictEqual(store.getItems().length, 10);

      const emptyRes = store.undoLastAction();
      assert.strictEqual(emptyRes.success, false);
      assert.strictEqual(emptyRes.reason, 'Pila de deshacer vacía');
    });

    await test('Undo 4.4: Análisis forense de orden e integridad tras clearCompleted + undoLastAction', () => {
      const store = createStore();
      store.addItem({ name: 'A', completed: false });
      store.addItem({ name: 'B', completed: true });
      store.addItem({ name: 'C', completed: false });
      store.addItem({ name: 'D', completed: true });

      const cleared = store.clearCompleted();
      assert.strictEqual(cleared.length, 2);
      assert.strictEqual(store.getItems().length, 2);

      const undoResult = store.undoLastAction();
      assert.strictEqual(undoResult.success, true);
      assert.strictEqual(store.getItems().length, 4);

      const names = store.getItems().map(i => i.name);
      assert.ok(names.includes('A') && names.includes('B') && names.includes('C') && names.includes('D'));
    });

    await test('Undo 4.5: Preservación de timestamps y updatedAt en operaciones Undo', () => {
      const store = createStore();
      const fixedTimestamp = 1600000000000;
      const item = store.addItem({ name: 'Arroz', quantity: 1, timestamp: fixedTimestamp, updatedAt: fixedTimestamp });

      store.updateItem(item.id, { quantity: 3 });
      assert.notStrictEqual(store.getItemById(item.id).updatedAt, fixedTimestamp);

      store.undoLastAction();
      const restored = store.getItemById(item.id);
      assert.strictEqual(restored.quantity, 1);
      assert.strictEqual(restored.timestamp, fixedTimestamp);
      assert.strictEqual(restored.updatedAt, fixedTimestamp);
    });

    await test('Benchmark 4.6: Inserción de 1,000 productos consecutivos en Store puro (tiempo y memoria)', () => {
      const store = createStore();
      const initialMemory = process.memoryUsage().heapUsed;
      const startTime = performance.now();

      for (let i = 0; i < 1000; i++) {
        store.addItem({
          name: `Producto de Prueba Extrema #${i}`,
          quantity: (i % 10) + 1,
          unitPrice: ((i * 17) % 500) / 10,
          category: `Categoría ${i % 8}`,
          location: `Pasillo ${i % 12}`,
          completed: i % 3 === 0
        });
      }

      const elapsedMs = Math.round(performance.now() - startTime);
      const memoryDeltaMb = ((process.memoryUsage().heapUsed - initialMemory) / (1024 * 1024)).toFixed(2);
      const opsPerSec = Math.round((1000 / (elapsedMs / 1000)));

      console.log(`    [Benchmark] 1,000 addItems en ${elapsedMs}ms (${opsPerSec} ops/sec, Heap Delta: ${memoryDeltaMb}MB)`);
      assert.strictEqual(store.getItems().length, 1000);
      assert.ok(elapsedMs < 1500, `Debe completarse en menos de 1500ms (tardó ${elapsedMs}ms)`);
    });

    await test('Benchmark 4.7: Inserción de 1,000 productos con StorageService activo', async () => {
      const storage = new StorageService.StorageServiceImpl();
      const store = createStore({}, storage);
      const startTime = performance.now();

      for (let i = 0; i < 1000; i++) {
        store.addItem({
          name: `Ítem Persistido #${i}`,
          quantity: 2,
          unitPrice: 10.5,
          category: 'General',
          location: 'General'
        });
      }

      const elapsedMs = Math.round(performance.now() - startTime);
      console.log(`    [Benchmark] 1,000 addItems persistidos en ${elapsedMs}ms`);

      const loaded = await storage.loadItems();
      assert.strictEqual(loaded.length, 1000);
    });

    await test('Benchmark 4.8: Filtrado y Agrupamiento masivo sobre 1,000 items en memoria (<16ms)', () => {
      const store = createStore();
      for (let i = 0; i < 1000; i++) {
        store.addItem({
          name: `Articulo ${i % 20 === 0 ? 'Especial Manzana' : 'Común ' + i}`,
          quantity: 1,
          unitPrice: 2.0,
          category: `Cat-${i % 5}`,
          location: `Loc-${i % 10}`,
          completed: i % 2 === 0
        });
      }

      store.setFilter({ searchQuery: 'manzana', hideCompleted: false });
      const t0 = performance.now();
      const filtered = store.getFilteredItems();
      const filterDuration = (performance.now() - t0).toFixed(3);

      const t2 = performance.now();
      const grouped = store.getGroupedItems();
      const groupDuration = (performance.now() - t2).toFixed(3);

      console.log(`    [Benchmark] getFilteredItems: ${filterDuration}ms | getGroupedItems: ${groupDuration}ms`);
      assert.ok(filtered.length > 0);
      assert.ok(parseFloat(filterDuration) < 16.0, 'Filtrado debe tardar menos de 16ms');
      assert.ok(parseFloat(groupDuration) < 25.0, 'Agrupamiento debe tardar menos de 25ms');
    });

    await test('Benchmark 4.9: Hidratación masiva instantánea (hydrate) con 1,000 items', () => {
      const store = createStore();
      const batch = [];
      for (let i = 0; i < 1000; i++) {
        batch.push({
          id: `id_${i}`,
          name: `Bulk Item ${i}`,
          quantity: 1,
          unitPrice: 1.0,
          category: 'General',
          location: 'General',
          completed: false,
          timestamp: Date.now()
        });
      }

      const t0 = performance.now();
      store.hydrate({ items: batch, budget: 500 });
      const elapsed = (performance.now() - t0).toFixed(2);

      console.log(`    [Benchmark] store.hydrate(1,000 items) en ${elapsed}ms`);
      assert.strictEqual(store.getItems().length, 1000);
      assert.strictEqual(store.getBudget(), 500);
      assert.ok(parseFloat(elapsed) < 100.0);
    });

    await test('Pub/Sub 4.10: Registro masivo (1,000 listeners) y desuscripción limpia (cero memory leaks)', () => {
      const store = createStore();
      const unsubs = [];

      for (let i = 0; i < 1000; i++) {
        unsubs.push(store.subscribe(() => {}));
      }
      assert.strictEqual(store.listeners.size, 1000);

      unsubs.forEach(unsub => unsub());
      assert.strictEqual(store.listeners.size, 0);

      // Idempotencia
      unsubs.forEach(unsub => unsub());
      assert.strictEqual(store.listeners.size, 0);
    });

    await test('Pub/Sub 4.11: Registro masivo de eventos puntuales (on) y limpieza de eventHandlers', () => {
      const store = createStore();
      const unsubs = [];

      for (let i = 0; i < 500; i++) {
        unsubs.push(store.on('item:added', () => {}));
        unsubs.push(store.on('items:changed', () => {}));
      }

      assert.strictEqual(store.eventHandlers.get('item:added').size, 500);
      assert.strictEqual(store.eventHandlers.get('items:changed').size, 500);

      unsubs.forEach(unsub => unsub());
      assert.strictEqual(store.eventHandlers.get('item:added').size, 0);
      assert.strictEqual(store.eventHandlers.get('items:changed').size, 0);
    });

    await test('Pub/Sub 4.12: Prevención de Event Staleness (desuscriptores no reciben eventos posteriores)', () => {
      const store = createStore();
      let callCountA = 0;
      let callCountB = 0;

      const unsubA = store.subscribe(() => { callCountA++; });
      const unsubB = store.subscribe(() => { callCountB++; });

      store.addItem({ name: 'Item 1' });
      assert.strictEqual(callCountA > 0, true);
      assert.strictEqual(callCountB > 0, true);

      unsubA();
      const frozenCountA = callCountA;

      for (let i = 0; i < 20; i++) {
        store.addItem({ name: `Item Extra ${i}` });
      }

      assert.strictEqual(callCountA, frozenCountA, 'Cero stale events');
      assert.ok(callCountB > frozenCountA);
      unsubB();
    });

    await test('Pub/Sub 4.13: Resiliencia ante excepciones dentro de handlers de eventos', () => {
      const store = createStore();
      let survivorCalled = false;

      store.on('item:added', () => {
        throw new Error('Error simulado en listener rebelde');
      });
      store.on('item:added', () => {
        survivorCalled = true;
      });

      assert.doesNotThrow(() => {
        store.addItem({ name: 'Prueba Resiliencia' });
      });
      assert.strictEqual(survivorCalled, true);
    });

    await test('Pub/Sub 4.14: Auto-desuscripción segura durante la propia ejecución del handler', () => {
      const store = createStore();
      let executionTimes = 0;
      let unsubscribeFn;

      unsubscribeFn = store.subscribe(() => {
        executionTimes++;
        if (executionTimes === 1) {
          unsubscribeFn();
        }
      });

      store.addItem({ name: 'Evento 1' });
      store.addItem({ name: 'Evento 2' });
      store.addItem({ name: 'Evento 3' });

      assert.strictEqual(executionTimes, 1);
    });

    await test('Pub/Sub 4.15: Simulación de ciclos de vida de componentes UI (500 montajes y desmontajes sin fugas)', () => {
      const store = createStore();

      for (let cycle = 0; cycle < 500; cycle++) {
        const cleanup1 = store.subscribe(() => {});
        const cleanup2 = store.on('item:added', () => {});
        const cleanup3 = store.on('budget:changed', () => {});

        if (cycle % 10 === 0) {
          store.addItem({ name: `Ciclo ${cycle}` });
        }

        cleanup1();
        cleanup2();
        cleanup3();
      }

      assert.strictEqual(store.listeners.size, 0);
      assert.strictEqual(store.eventHandlers.get('item:added').size, 0);
    });
  });

  // =========================================================================
  // 5. SUITE 5: PRUEBAS ADVERSARIALES EMPÍRICAS (challenger_m1_1)
  // =========================================================================
  await describe('5. Pruebas Adversariales Extremas: XSS, Números Patológicos y QuotaExceededError (challenger_m1_1)', async () => {
    
    // --- 5.1 VECTORES DE INYECCIÓN XSS Y ESCAPE HTML ---
    await test('XSS 5.1: Matriz completa de vectores hostiles neutralizada por escapeHtml', () => {
      const hostileVectors = [
        '<script>alert("XSS")</script>',
        '<SCRIPT SRC="https://evil.com/xss.js"></SCRIPT>',
        '<img src=x onerror=alert("IMG")>',
        '<svg/onload=alert("SVG")>',
        '<svg><script>alert(1)</script></svg>',
        '"><script>alert(document.domain)</script>',
        '\' onfocus=\'alert(1)',
        '<iframe src="javascript:alert(1)"></iframe>',
        '<body onload=alert("XSS")>',
        '<input type="image" src="x" onerror="alert(1)">',
        '<<SCRIPT>alert("Nested");//<</SCRIPT>',
        '"><img src="x" onerror="eval(atob(\'YWxlcnQoMSk=\'))">',
        '\u0000<script>alert("NullByte")</script>',
        '\u001F<img src=x onerror=alert(1)>\u007F'
      ];

      for (const vector of hostileVectors) {
        const escaped = escapeHtml(vector);
        assert.strictEqual(escaped.includes('<'), false, `escapeHtml no debe contener '<': ${vector} -> ${escaped}`);
        assert.strictEqual(escaped.includes('>'), false, `escapeHtml no debe contener '>': ${vector} -> ${escaped}`);
        assert.strictEqual(escaped.includes('"'), false, `escapeHtml no debe contener '"': ${vector} -> ${escaped}`);
        assert.strictEqual(escaped.includes("'"), false, `escapeHtml no debe contener comilla simple: ${vector} -> ${escaped}`);
      }
    });

    await test('XSS 5.2: validateItem y sanitizeString limpian caracteres de control no imprimibles', () => {
      const hostileControl = '\u0000\u0007\u0008\u001B\u007F\u0080\u009FGalletas Seguras\u0000';
      const sanitized = sanitizeString(hostileControl);
      assert.strictEqual(sanitized, 'Galletas Seguras');
      assert.strictEqual(/[\u0000-\u001F\u007F-\u009F]/.test(sanitized), false);

      const res = validateItem({
        name: hostileControl,
        category: '\u0000Lácteos\u001F',
        location: '\u007FPasillo 1\u009F',
        quantity: 1,
        unitPrice: 2
      });

      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.cleanData.name, 'Galletas Seguras');
      assert.strictEqual(res.cleanData.category, 'Lácteos');
      assert.strictEqual(res.cleanData.location, 'Pasillo 1');
    });

    await test('XSS 5.3: Coerción defensiva ante objetos hostiles con toString personalizado en validateItem', () => {
      let callCount = 0;
      const hostileObj = {
        name: {
          toString() {
            callCount++;
            return 'Producto Sanitizado';
          }
        },
        quantity: 2,
        unitPrice: 1.5
      };

      const res = validateItem(hostileObj);
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.cleanData.name, 'Producto Sanitizado');
      assert.ok(callCount >= 1);
    });

    // --- 5.2 NÚMEROS PATOLÓGICOS Y LÍMITES ARITMÉTICOS ---
    await test('Números 5.4: parseFlexibleNumber rechaza anomalías numéricas y maneja comas regionales', () => {
      // Formato válido
      assert.strictEqual(parseFlexibleNumber('12,50'), 12.5);
      assert.strictEqual(parseFlexibleNumber('0,99'), 0.99);
      assert.strictEqual(parseFlexibleNumber('  3,14  '), 3.14);
      assert.strictEqual(parseFlexibleNumber('1e3'), 1000);
      assert.strictEqual(parseFlexibleNumber('2.5e1'), 25);

      // Anomalías patológicas
      assert.ok(Number.isNaN(parseFlexibleNumber('NaN')));
      assert.ok(Number.isNaN(parseFlexibleNumber('Infinity')));
      assert.ok(Number.isNaN(parseFlexibleNumber('-Infinity')));
      assert.ok(Number.isNaN(parseFlexibleNumber('1,2,3')));
      assert.ok(Number.isNaN(parseFlexibleNumber('1.2.3')));
      assert.ok(Number.isNaN(parseFlexibleNumber('1,2.3')));
      assert.ok(Number.isNaN(parseFlexibleNumber('')));
      assert.ok(Number.isNaN(parseFlexibleNumber('   ')));
      assert.ok(Number.isNaN(parseFlexibleNumber(null)));
      assert.ok(Number.isNaN(parseFlexibleNumber(undefined)));
      assert.ok(Number.isNaN(parseFlexibleNumber(true)));
      assert.ok(Number.isNaN(parseFlexibleNumber(false)));
      assert.ok(Number.isNaN(parseFlexibleNumber({})));
      assert.ok(Number.isNaN(parseFlexibleNumber([])));
    });

    await test('Números 5.5: Manejo adversarial de cero con signo (-0)', () => {
      // Cantidad -0 debe ser rechazada porque cantidad debe ser > 0
      const resQty = validateItem({ name: 'Leche', quantity: -0 });
      assert.strictEqual(resQty.isValid, false, 'La cantidad -0 debe ser inválida');

      // Precio -0 debe normalizarse a +0 sin retener el signo negativo IEEE 754
      const resPrice = validateItem({ name: 'Pan', quantity: 1, unitPrice: -0 });
      assert.strictEqual(resPrice.isValid, true);
      assert.strictEqual(Object.is(resPrice.cleanData.unitPrice, 0), true);
      assert.strictEqual(Object.is(resPrice.cleanData.unitPrice, -0), false, 'Precio no debe retener -0');
    });

    await test('Números 5.6: Límites superiores (desbordamiento de cantidad y precio)', () => {
      // Cantidad > 99999 rechazada
      assert.strictEqual(validateItem({ name: 'Mucho', quantity: 100000 }).isValid, false);
      assert.strictEqual(validateItem({ name: 'Exponencial', quantity: '1e6' }).isValid, false);
      assert.strictEqual(validateItem({ name: 'Infinito', quantity: Infinity }).isValid, false);

      // Precio > 999999.99 rechazado
      assert.strictEqual(validateItem({ name: 'Diamante', quantity: 1, unitPrice: 1000000 }).isValid, false);
      assert.strictEqual(validateItem({ name: 'Infinito', quantity: 1, unitPrice: Infinity }).isValid, false);

      // Presupuesto > 10.000.000 rechazado
      assert.strictEqual(validateBudget(10000001).isValid, false);
      assert.strictEqual(validateBudget(-5).isValid, false);
      assert.strictEqual(validateBudget(Infinity).isValid, false);
    });

    await test('Números 5.7 [BLINDAJE DE REDONDEO]: Micro-cantidades infinitesimales (0 < q < 0.0005) son rechazadas garantizando contrato ShoppingItem (q > 0)', () => {
      // 1. Caso canónico de regresión BUG-M1-ADV-01
      const res = validateItem({ name: 'Sal', quantity: 0.0001 });
      assert.strictEqual(res.isValid, false, 'validateItem({ name: "Sal", quantity: 0.0001 }) debe ser inválido');
      assert.ok(res.errors.some(e => e.includes('mayor a 0') || e.includes('0.001')), 'Debe mostrar mensaje explicativo de cantidad mínima');
      assert.strictEqual(Boolean(res.errorFields.quantity), true, 'El campo quantity debe marcarse con error en errorFields');

      // 2. Análisis de fronteras infinitesimales (precisión 3 decimales)
      // 0.00049 se redondearía a 0.000 -> debe invalidarse
      const resUnderflow = validateItem({ name: 'Pimienta', quantity: 0.00049 });
      assert.strictEqual(resUnderflow.isValid, false, '0.00049 se redondea a 0.000 y debe ser inválido');

      // 0.0005 se redondea a 0.001 -> es el límite inferior válido
      const resBoundary = validateItem({ name: 'Azafrán', quantity: 0.0005 });
      assert.strictEqual(resBoundary.isValid, true, '0.0005 se redondea a 0.001 y debe ser válido');
      assert.strictEqual(resBoundary.cleanData.quantity, 0.001, '0.0005 debe normalizarse a 0.001');

      // 0.001 es el mínimo exacto representable a 3 decimales
      const resExact = validateItem({ name: 'Canela', quantity: 0.001 });
      assert.strictEqual(resExact.isValid, true);
      assert.strictEqual(resExact.cleanData.quantity, 0.001);

      // 3. Blindaje de defensa en profundidad en Store (js/state.js)
      // Si Store recibe un valor micro no saneado previamente, garantiza quantity > 0
      const store = createStore();
      const added = store.addItem({ name: 'Especia Directa', quantity: 0.0001 });
      assert.ok(added.quantity > 0, `Store.addItem debe garantizar quantity > 0, pero resultó ${added.quantity}`);
      assert.strictEqual(store.getItems()[0].quantity > 0, true);

      store.updateItem(added.id, { quantity: 0.0001 });
      assert.ok(store.getItems()[0].quantity > 0, 'Store.updateItem debe garantizar quantity > 0 tras edición');

      // 4. Blindaje en StorageService.normalizeItem (js/storage.js)
      const normalized = StorageService.normalizeItem({ id: 'norm_1', name: 'Comino', quantity: 0.0001 });
      assert.ok(normalized.quantity > 0, `normalizeItem debe garantizar quantity > 0, pero resultó ${normalized.quantity}`);
    });

    // --- 5.3 DEGRADACIÓN DE ALMACENAMIENTO Y QUOTAEXCEEDEDERROR ---
    await test('Storage 5.8: MemoryStorageDriver cumple el contrato completo de Storage API', () => {
      const mem = new StorageService.MemoryStorageDriver();
      assert.strictEqual(mem.length, 0);

      mem.setItem('clave1', 'valor1');
      assert.strictEqual(mem.length, 1);
      assert.strictEqual(mem.getItem('clave1'), 'valor1');
      assert.strictEqual(mem.getItem('inexistente'), null);

      mem.setItem('clave2', 'valor2');
      assert.strictEqual(mem.length, 2);

      mem.removeItem('clave1');
      assert.strictEqual(mem.length, 1);
      assert.strictEqual(mem.getItem('clave1'), null);

      mem.clear();
      assert.strictEqual(mem.length, 0);
      assert.strictEqual(mem.getItem('clave2'), null);
    });

    await test('Storage 5.9: Resiliencia defensiva ante JSON corrupto en StorageService', async () => {
      const corruptDriver = {
        _data: new Map([
          ['shopping_items', '<<<ESTO NO ES UN JSON VÁLIDO>>>'],
          ['budget', 'CIEN_EUROS'],
          ['locationOrder', '{ no: "array" }'],
          ['collapsedGroups', 'undefined']
        ]),
        getItem(key) { return this._data.get(key) || null; },
        setItem(key, val) { this._data.set(key, String(val)); },
        removeItem(key) { this._data.delete(key); },
        clear() { this._data.clear(); }
      };

      const service = new StorageService.StorageServiceImpl(corruptDriver);

      const items = await service.loadItems();
      assert.deepStrictEqual(items, [], 'JSON corrupto en items debe retornar [] limpiamente');

      const budget = service.loadBudget();
      assert.strictEqual(budget, 0, 'Budget corrupto debe retornar 0');

      const locs = service.loadLocationOrder();
      assert.deepStrictEqual(locs, [], 'locationOrder corrupto debe retornar []');

      const groups = service.loadCollapsedGroups();
      assert.deepStrictEqual(groups, [], 'collapsedGroups corrupto debe retornar []');
    });

    await test('Storage 5.10 [BLINDAJE DE CUOTA]: Comportamiento de degradación y prevención de lecturas obsoletas ante QuotaExceededError', async () => {
      let setItemCalls = 0;
      let quotaErrors = 0;

      // El driver simula fielmente un navegador real con cuota llena:
      // - setItem() arroja QuotaExceededError
      // - getItem() retorna datos obsoletos previos (si existen) o null, SIN lanzar excepciones
      const fullStorageDriver = {
        _data: new Map([
          ['shopping_items', JSON.stringify([{ id: 'stale_previo', name: 'Item Obsoleto en Disco', quantity: 1, unitPrice: 1.0 }])],
          ['budget', '100']
        ]),
        getItem(key) {
          return this._data.has(key) ? this._data.get(key) : null;
        },
        setItem(key, value) {
          setItemCalls++;
          quotaErrors++;
          const err = new Error('The quota has been exceeded.');
          err.name = 'QuotaExceededError';
          err.code = 22;
          throw err;
        },
        removeItem(key) {
          this._data.delete(key);
        }
      };

      const quotaService = new StorageService.StorageServiceImpl(fullStorageDriver);

      // 1. Guardar productos no debe explotar y debe conmutar a fallback en memoria
      await quotaService.saveItems([
        { id: 'crit_1', name: 'Alimento Vital 1', quantity: 2, unitPrice: 5.0 },
        { id: 'crit_2', name: 'Alimento Vital 2', quantity: 1, unitPrice: 3.5 }
      ]);

      assert.ok(quotaErrors > 0, 'El error QuotaExceededError debe haberse disparado en setItem');

      // 2. Carga de productos: DEBE retornar los productos guardados en el fallback en memoria,
      // y NUNCA los datos obsoletos del driver desincronizado
      const loadedItems = await quotaService.loadItems();
      assert.strictEqual(loadedItems.length, 2, `Degradación esperada: 2 items recuperados del fallback. Obtenidos: ${loadedItems.length}`);
      assert.strictEqual(loadedItems[0].name, 'Alimento Vital 1');
      assert.strictEqual(loadedItems[1].name, 'Alimento Vital 2');
      assert.strictEqual(loadedItems.some(i => i.id === 'stale_previo'), false, 'No debe retornar datos obsoletos del disco');

      // 3. Verificación multi-clave en modo degradado
      quotaService.saveBudget(450.50);
      assert.strictEqual(quotaService.loadBudget(), 450.50, 'Presupuesto debe recuperarse del fallback en memoria');

      quotaService.saveTheme('dark');
      assert.strictEqual(quotaService.loadTheme(), 'dark', 'Tema debe recuperarse del fallback en memoria');

      quotaService.saveLocationOrder(['Pasillo 1', 'Pasillo 2']);
      assert.deepStrictEqual(quotaService.loadLocationOrder(), ['Pasillo 1', 'Pasillo 2'], 'LocationOrder debe recuperarse de memoria');

      quotaService.saveCollapsedGroups(['Lácteos']);
      assert.deepStrictEqual(quotaService.loadCollapsedGroups(), ['Lácteos'], 'CollapsedGroups debe recuperarse de memoria');

      // 4. Limpieza defensiva en modo degradado
      quotaService.clearAll();
      const afterClear = await quotaService.loadItems();
      assert.deepStrictEqual(afterClear, [], 'clearAll debe purgar el almacenamiento en memoria');
      assert.strictEqual(quotaService.loadBudget(), 0, 'loadBudget tras clearAll debe retornar 0');
    });

    // --- 5.4 ESTRÉS DE STORE E INMUTABILIDAD DEFENSIVA ---
    await test('Store 5.11: Ráfaga de 200 operaciones aleatorias mantiene inmutabilidad y consistencia', () => {
      const store = createStore();
      const numOps = 200;

      for (let i = 0; i < numOps; i++) {
        const op = i % 5;
        if (op === 0) {
          store.addItem({ name: `Prod ${i}`, quantity: (i % 5) + 1, unitPrice: (i % 20) + 0.99 });
        } else if (op === 1) {
          const items = store.getItems();
          if (items.length > 0) store.toggleCompleted(items[items.length - 1].id);
        } else if (op === 2) {
          const items = store.getItems();
          if (items.length > 0) store.updateItem(items[0].id, { unitPrice: 15.0 });
        } else if (op === 3) {
          const items = store.getItems();
          if (items.length > 3) store.deleteItem(items[0].id);
        } else if (op === 4) {
          if (store.canUndo()) store.undoLastAction();
        }
      }

      const finalState = store.getState();
      assert.ok(Array.isArray(finalState.items));
      assert.ok(typeof finalState.budget === 'number');
      assert.ok(finalState.items.every(i => typeof i.name === 'string' && typeof i.quantity === 'number'));
    });
  });

  // =========================================================================
  // RESUMEN FINAL
  // =========================================================================
  console.log(`\n==================================================`);
  console.log(`RESUMEN DE PRUEBAS UNITARIAS M1:`);
  console.log(`Total: ${totalTests} | Aprobadas: ${passedTests} | Falladas: ${failedTests}`);
  console.log(`==================================================\n`);

  if (failedTests > 0) {
    console.error('ERRORES DETECTADOS:');
    failures.forEach(f => {
      console.error(`- [FALLO] ${f.description}`);
      console.error(`  Detalle: ${f.error.stack || f.error.message}`);
    });
    process.exit(1);
  } else {
    console.log('¡ÉXITO TOTAL! 100% de las pruebas unitarias de M1 pasaron limpiamente sin errores.');
    process.exit(0);
  }
}

runAllTests().catch(err => {
  console.error('Fallo fatal al ejecutar suite de pruebas:', err);
  process.exit(1);
});
