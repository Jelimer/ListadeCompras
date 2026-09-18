#!/usr/bin/env node
/**
 * tests/m1_stress_concurrency.test.js
 * Suite de Pruebas de Estrés, Concurrencia, Fidelidad de Undo y Pub/Sub Leak Test para Milestone 1.
 * Agente: challenger_m1_2 (Empirical Challenger)
 */

'use strict';

const assert = require('node:assert');
const { performance } = require('node:perf_hooks');
const { Store, createStore } = require('../js/state.js');
const StorageService = require('../js/storage.js');

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m'
};

let totalPassed = 0;
let totalFailed = 0;
const findings = [];

function runTest(name, fn) {
  process.stdout.write(`  • ${name}... `);
  try {
    fn();
    console.log(`${c.green}✓ OK${c.reset}`);
    totalPassed++;
  } catch (err) {
    console.log(`${c.red}✗ FALLÓ${c.reset}`);
    console.error(`    ${c.red}Error: ${err.message}${c.reset}`);
    totalFailed++;
    findings.push({ test: name, error: err.message, stack: err.stack });
  }
}

async function runAsyncTest(name, fn) {
  process.stdout.write(`  • ${name}... `);
  try {
    await fn();
    console.log(`${c.green}✓ OK${c.reset}`);
    totalPassed++;
  } catch (err) {
    console.log(`${c.red}✗ FALLÓ${c.reset}`);
    console.error(`    ${c.red}Error: ${err.message}${c.reset}`);
    totalFailed++;
    findings.push({ test: name, error: err.message, stack: err.stack });
  }
}

console.log(`\n${c.bold}${c.cyan}======================================================================${c.reset}`);
console.log(`${c.bold}${c.cyan} 🔬 CHALLENGER M1-2: PRUEBAS DE ESTRÉS, CONCURRENCIA Y UNDO FIDELITY  ${c.reset}`);
console.log(`${c.bold}${c.cyan}======================================================================${c.reset}\n`);

// ======================================================================
// SUITE 1: FIDELIDAD 100% DE DESHACER (UNDO ENGINE)
// ======================================================================
console.log(`${c.bold}${c.magenta}--- SUITE 1: Integridad y Fidelidad del Motor de Deshacer (Undo) ---${c.reset}`);

runTest('Undo 1.1: Ciclo de vida completo (Add -> Update -> Toggle -> Delete) restaurado al 100% idéntico a S0', () => {
  const store = createStore();
  const initialSnapshot = JSON.stringify(store.getState());

  // 1. Añadir
  const added = store.addItem({ name: 'Leche Desnatada', quantity: 2, unitPrice: 1.25, category: 'Lácteos', location: 'Nevera' });
  // 2. Modificar
  store.updateItem(added.id, { quantity: 4, unitPrice: 1.30, name: 'Leche Entera' });
  // 3. Toggle
  store.toggleCompleted(added.id);
  // 4. Eliminar
  store.deleteItem(added.id);

  assert.strictEqual(store.getItems().length, 0);
  assert.strictEqual(store.canUndo(), true);

  // Deshacer paso 4: restaura borrado
  const undo4 = store.undoLastAction();
  assert.strictEqual(undo4.success, true);
  assert.strictEqual(store.getItems().length, 1);
  assert.strictEqual(store.getItems()[0].completed, true);

  // Deshacer paso 3: restaura toggle
  const undo3 = store.undoLastAction();
  assert.strictEqual(undo3.success, true);
  assert.strictEqual(store.getItems()[0].completed, false);

  // Deshacer paso 2: restaura update
  const undo2 = store.undoLastAction();
  assert.strictEqual(undo2.success, true);
  assert.strictEqual(store.getItems()[0].quantity, 2);
  assert.strictEqual(store.getItems()[0].unitPrice, 1.25);
  assert.strictEqual(store.getItems()[0].name, 'Leche Desnatada');

  // Deshacer paso 1: elimina item añadido
  const undo1 = store.undoLastAction();
  assert.strictEqual(undo1.success, true);
  assert.strictEqual(store.getItems().length, 0);

  const finalSnapshot = JSON.stringify(store.getState());
  assert.strictEqual(finalSnapshot, initialSnapshot, 'El estado final tras deshacer todas las acciones debe ser idéntico byte a byte al snapshot inicial');
});

runTest('Undo 1.2: Secuencia aleatoria intensa de 25 mutaciones reversibles con recuperación 100% de snapshot', () => {
  const store = createStore();
  
  // Poblar 5 productos iniciales como baseline
  const baseItems = [];
  for (let i = 0; i < 5; i++) {
    baseItems.push(store.addItem({
      name: `Base Product ${i}`,
      quantity: i + 1,
      unitPrice: (i + 1) * 2.5,
      category: i % 2 === 0 ? 'Alimentos' : 'Bebidas',
      location: i % 2 === 0 ? 'Pasillo 1' : 'Pasillo 2'
    }));
  }

  // Guardamos snapshot canónico exacto después de poblar
  const baselineSnapshot = store.getState();

  // Realizar 25 mutaciones aleatorias y rastreadas
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

  // Ahora deshacemos exactamente las 25 acciones
  for (let step = 0; step < actionsCount; step++) {
    assert.strictEqual(store.canUndo(), true, `Debe poder deshacer en el paso ${step + 1}`);
    const res = store.undoLastAction();
    assert.strictEqual(res.success, true, `Deshacer paso ${step + 1} debe ser exitoso`);
  }

  const restoredState = store.getState();

  // Verificación de integridad estructural
  assert.strictEqual(restoredState.items.length, baselineSnapshot.items.length, 'La cantidad de items debe ser exactamente la misma');

  // Comprobar cada item restaurado
  for (let i = 0; i < baselineSnapshot.items.length; i++) {
    const expected = baselineSnapshot.items[i];
    const actual = restoredState.items.find(x => x.id === expected.id);
    assert.ok(actual, `El item ${expected.id} (${expected.name}) debe existir en el estado restaurado`);
    assert.strictEqual(actual.name, expected.name, `Nombre de ${expected.id} debe coincidir`);
    assert.strictEqual(actual.quantity, expected.quantity, `Cantidad de ${expected.id} debe coincidir`);
    assert.strictEqual(actual.unitPrice, expected.unitPrice, `Precio de ${expected.id} debe coincidir`);
    assert.strictEqual(actual.completed, expected.completed, `Estado completed de ${expected.id} debe coincidir`);
    assert.strictEqual(actual.category, expected.category, `Categoría de ${expected.id} debe coincidir`);
    assert.strictEqual(actual.location, expected.location, `Ubicación de ${expected.id} debe coincidir`);
  }
});

runTest('Undo 1.3: Límite de pila (maxUndoSteps = 30) y comportamiento FIFO sliding-window', () => {
  const store = createStore();

  // Ejecutar 40 adiciones
  for (let i = 0; i < 40; i++) {
    store.addItem({ name: `Item ${i}` });
  }

  assert.strictEqual(store.undoStack.length, 30, 'La pila de undo no debe exceder los 30 pasos máximos');

  // Deshacer los 30 pasos disponibles
  let undosPerformed = 0;
  while (store.canUndo()) {
    const res = store.undoLastAction();
    assert.strictEqual(res.success, true);
    undosPerformed++;
  }

  assert.strictEqual(undosPerformed, 30, 'Deben haberse deshecho exactamente 30 pasos');
  assert.strictEqual(store.undoStack.length, 0, 'La pila debe quedar vacía');
  assert.strictEqual(store.canUndo(), false, 'canUndo debe ser false con pila vacía');

  // Intento de deshacer en pila vacía
  const emptyUndo = store.undoLastAction();
  assert.strictEqual(emptyUndo.success, false);
  assert.strictEqual(emptyUndo.reason, 'Pila de deshacer vacía');

  // Deben quedar exactamente los primeros 10 items (los más antiguos que salieron del historial de 30)
  assert.strictEqual(store.getItems().length, 10, 'Deben quedar exactamente 10 items no reversibles');
});

runTest('Undo 1.4: Análisis forense del orden de items tras clearCompleted + undoLastAction', () => {
  const store = createStore();
  
  // Creamos productos ordenados A (pendiente), B (comprado), C (pendiente), D (comprado)
  const itemA = store.addItem({ name: 'A', completed: false });
  const itemB = store.addItem({ name: 'B', completed: true });
  const itemC = store.addItem({ name: 'C', completed: false });
  const itemD = store.addItem({ name: 'D', completed: true });

  const originalOrder = store.getItems().map(i => i.name); // Note: addItem prepends: [D, C, B, A]

  // Ejecutamos clearCompleted
  const cleared = store.clearCompleted();
  assert.strictEqual(cleared.length, 2, 'Deben haberse limpiado 2 items');
  
  // Verificamos que solo queden pendientes
  const remainingNames = store.getItems().map(i => i.name);
  assert.deepStrictEqual(remainingNames, ['C', 'A'], 'Solo deben quedar los pendientes C y A');

  // Deshacemos clearCompleted
  const undoResult = store.undoLastAction();
  assert.strictEqual(undoResult.success, true);

  const restoredNames = store.getItems().map(i => i.name);

  // Verificamos si se recuperaron todos los elementos
  assert.strictEqual(restoredNames.length, 4, 'Deben haberse recuperado los 4 items');
  assert.ok(restoredNames.includes('A') && restoredNames.includes('B') && restoredNames.includes('C') && restoredNames.includes('D'));

  // Registrar observación sobre el orden relativo
  const isExactSameOrder = JSON.stringify(restoredNames) === JSON.stringify(originalOrder);
  if (!isExactSameOrder) {
    findings.push({
      type: 'ARCHITECTURAL_OBSERVATION',
      component: 'Undo: CLEAR_COMPLETED',
      detail: `Orden original antes de clearCompleted: [${originalOrder.join(', ')}]. Orden tras deshacer: [${restoredNames.join(', ')}]. Los ítems restaurados se concatenaron al final en vez de restaurar posiciones intercaladas relativas.`
    });
  }
});

runTest('Undo 1.5: Verificación de preservación de timestamps y updatedAt en operaciones Undo', () => {
  const store = createStore();
  const fixedTimestamp = 1600000000000;
  const item = store.addItem({ name: 'Arroz', quantity: 1, timestamp: fixedTimestamp, updatedAt: fixedTimestamp });

  // 1. Modificar
  store.updateItem(item.id, { quantity: 3 });
  assert.notStrictEqual(store.getItemById(item.id).updatedAt, fixedTimestamp, 'updatedAt debe haberse actualizado al modificar');

  // 2. Deshacer
  store.undoLastAction();
  const restoredItem = store.getItemById(item.id);
  assert.strictEqual(restoredItem.quantity, 1, 'Cantidad restaurada');
  assert.strictEqual(restoredItem.timestamp, fixedTimestamp, 'timestamp original intacto');
  assert.strictEqual(restoredItem.updatedAt, fixedTimestamp, 'updatedAt previo restaurado por UPDATE_ITEM');
});

// ======================================================================
// SUITE 2: BENCHMARK Y PRUEBAS DE ESTRÉS (1,000 ITEMS)
// ======================================================================
console.log(`\n${c.bold}${c.magenta}--- SUITE 2: Benchmark de Carga Rápida (1,000 Mutaciones) y Memoria ---${c.reset}`);

runTest('Benchmark 2.1: Inserción de 1,000 productos consecutivos en Store puro (tiempo y memoria)', () => {
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

  const endTime = performance.now();
  const finalMemory = process.memoryUsage().heapUsed;
  const elapsedMs = Math.round(endTime - startTime);
  const memoryDeltaMb = ((finalMemory - initialMemory) / (1024 * 1024)).toFixed(2);
  const opsPerSec = Math.round((1000 / (elapsedMs / 1000)));

  console.log(`\n      ${c.cyan}→ 1,000 addItems completados en ${c.bold}${elapsedMs} ms${c.reset} (${opsPerSec} ops/sec, Heap Delta: ${memoryDeltaMb} MB)`);

  assert.strictEqual(store.getItems().length, 1000, 'Deben existir 1000 items');
  // Umbral de aceptación: 1000 inserciones en menos de 1500 ms en Node.js
  assert.ok(elapsedMs < 1500, `El tiempo (${elapsedMs}ms) debe ser menor al umbral de 1500ms`);
});

runAsyncTest('Benchmark 2.2: Inserción de 1,000 productos con StorageService activo (persistencia síncrona/asíncrona)', async () => {
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

  const endTime = performance.now();
  const elapsedMs = Math.round(endTime - startTime);
  console.log(`\n      ${c.cyan}→ 1,000 addItems persistidos en ${c.bold}${elapsedMs} ms${c.reset}`);

  // Verificar que el storage tiene los 1,000 items
  const loaded = await storage.loadItems();
  assert.strictEqual(loaded.length, 1000, 'StorageService debe contener exactamente 1000 items normalizados');
});

runTest('Benchmark 2.3: Filtrado y Agrupamiento masivo sobre 1,000 items en memoria', () => {
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

  // Medir getFilteredItems con filtro de texto
  store.setFilter({ searchQuery: 'manzana', hideCompleted: false });
  const t0 = performance.now();
  const filtered = store.getFilteredItems();
  const t1 = performance.now();
  const filterDuration = (t1 - t0).toFixed(3);

  // Medir getGroupedItems
  const t2 = performance.now();
  const grouped = store.getGroupedItems();
  const t3 = performance.now();
  const groupDuration = (t3 - t2).toFixed(3);

  console.log(`\n      ${c.cyan}→ getFilteredItems(1,000 items): ${c.bold}${filterDuration} ms${c.reset} (Encontrados: ${filtered.length})`);
  console.log(`      ${c.cyan}→ getGroupedItems(1,000 items): ${c.bold}${groupDuration} ms${c.reset} (Grupos: ${Object.keys(grouped).length})`);

  assert.ok(filtered.length > 0, 'Debe haber encontrado items coincidentes');
  // Umbral: filtrado en menos de 10ms (más rápido que un frame de 60fps a 16.6ms)
  assert.ok(parseFloat(filterDuration) < 16.0, 'Filtrado debe tardar menos de 16ms');
  assert.ok(parseFloat(groupDuration) < 25.0, 'Agrupamiento debe tardar menos de 25ms');
});

runTest('Benchmark 2.4: Hidratación masiva instantánea (hydrate) con 1,000 items', () => {
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

  console.log(`\n      ${c.cyan}→ store.hydrate(1,000 items) completado en ${c.bold}${elapsed} ms${c.reset}`);
  assert.strictEqual(store.getItems().length, 1000);
  assert.strictEqual(store.getBudget(), 500);
  assert.ok(parseFloat(elapsed) < 100.0, 'La hidratación masiva debe tardar menos de 100ms');
});

// ======================================================================
// SUITE 3: PUB/SUB LISTENER LEAKS, STALE EVENTS & RESILIENCIA
// ======================================================================
console.log(`\n${c.bold}${c.magenta}--- SUITE 3: Pub/Sub Listener Leaks, Eventos Stale y Aislamiento ---${c.reset}`);

runTest('Pub/Sub 3.1: Registro masivo (1,000 listeners) y desuscripción limpia con verificación de Sets', () => {
  const store = createStore();
  const unsubs = [];

  // Registrar 1,000 suscriptores globales
  for (let i = 0; i < 1000; i++) {
    unsubs.push(store.subscribe(() => {}));
  }

  assert.strictEqual(store.listeners.size, 1000, 'Deben haberse registrado 1000 listeners');

  // Desuscribir todos
  unsubs.forEach(unsub => unsub());

  assert.strictEqual(store.listeners.size, 0, 'El Set de listeners debe quedar con size 0 (cero fugas)');

  // Idempotencia: llamar de nuevo a los desuscriptores no debe fallar ni alterar nada
  unsubs.forEach(unsub => unsub());
  assert.strictEqual(store.listeners.size, 0);
});

runTest('Pub/Sub 3.2: Registro masivo de eventos puntuales (on) y limpieza de eventHandlers', () => {
  const store = createStore();
  const unsubs = [];

  for (let i = 0; i < 500; i++) {
    unsubs.push(store.on('item:added', () => {}));
    unsubs.push(store.on('items:changed', () => {}));
  }

  assert.strictEqual(store.eventHandlers.get('item:added').size, 500);
  assert.strictEqual(store.eventHandlers.get('items:changed').size, 500);

  // Desuscribir todos
  unsubs.forEach(unsub => unsub());

  assert.strictEqual(store.eventHandlers.get('item:added').size, 0, 'Set item:added debe estar vacío');
  assert.strictEqual(store.eventHandlers.get('items:changed').size, 0, 'Set items:changed debe estar vacío');
});

runTest('Pub/Sub 3.3: Prevención de Event Staleness (desuscriptores no reciben eventos posteriores)', () => {
  const store = createStore();
  let callCountA = 0;
  let callCountB = 0;

  const unsubA = store.subscribe(() => { callCountA++; });
  const unsubB = store.subscribe(() => { callCountB++; });

  store.addItem({ name: 'Item 1' });
  assert.strictEqual(callCountA > 0, true);
  assert.strictEqual(callCountB > 0, true);

  // Desuscribir A
  unsubA();
  const frozenCountA = callCountA;

  // Realizar 20 mutaciones
  for (let i = 0; i < 20; i++) {
    store.addItem({ name: `Item Extra ${i}` });
  }

  assert.strictEqual(callCountA, frozenCountA, 'El listener desuscrito NO debe haber recibido ningún evento adicional (cero stale events)');
  assert.ok(callCountB > frozenCountA, 'El listener activo debe seguir recibiendo eventos');

  unsubB();
});

runTest('Pub/Sub 3.4: Resiliencia ante excepciones dentro de handlers de eventos', () => {
  const store = createStore();
  let survivorCalled = false;

  // Listener defectuoso que lanza un error
  store.on('item:added', () => {
    throw new Error('Error simulado en listener rebelde');
  });

  // Listener sobreviviente registrado después
  store.on('item:added', () => {
    survivorCalled = true;
  });

  // Mutación que dispara el evento
  assert.doesNotThrow(() => {
    store.addItem({ name: 'Prueba Resiliencia' });
  }, 'El Store no debe propagar excepciones no controladas de listeners de terceros');

  assert.strictEqual(survivorCalled, true, 'Los listeners posteriores deben ejecutarse aun si uno previo falló');
});

runTest('Pub/Sub 3.5: Auto-desuscripción segura durante la propia ejecución del handler', () => {
  const store = createStore();
  let executionTimes = 0;
  let unsubscribeFn;

  unsubscribeFn = store.subscribe(() => {
    executionTimes++;
    if (executionTimes === 1) {
      unsubscribeFn(); // Se desuscribe a sí mismo en su primera ejecución
    }
  });

  store.addItem({ name: 'Evento 1' });
  store.addItem({ name: 'Evento 2' });
  store.addItem({ name: 'Evento 3' });

  // Nota: addItem dispara 'item:added', 'items:changed', 'state:changed'.
  // Al desuscribirse en la primera invocación, no debe llamarse en los eventos subsiguientes.
  assert.strictEqual(executionTimes, 1, 'El handler solo debió ejecutarse exactamente 1 vez y auto-removerse sin arrojar error');
});

runTest('Pub/Sub 3.6: Simulación de ciclos de vida de componentes UI (500 montajes y desmontajes)', () => {
  const store = createStore();

  for (let cycle = 0; cycle < 500; cycle++) {
    // Montaje: componente crea 3 listeners
    const cleanup1 = store.subscribe(() => {});
    const cleanup2 = store.on('item:added', () => {});
    const cleanup3 = store.on('budget:changed', () => {});

    // Componente interactúa
    if (cycle % 10 === 0) {
      store.addItem({ name: `Ciclo ${cycle}` });
    }

    // Desmontaje
    cleanup1();
    cleanup2();
    cleanup3();
  }

  assert.strictEqual(store.listeners.size, 0, 'No deben quedar listeners globales tras 500 ciclos');
  assert.strictEqual(store.eventHandlers.get('item:added').size, 0, 'No deben quedar handlers puntuales');
});

// ======================================================================
// RESUMEN Y REPORTE
// ======================================================================
console.log(`\n${c.bold}${c.cyan}======================================================================${c.reset}`);
console.log(`${c.bold}RESULTADO GLOBAL DE PRUEBAS DE ESTRÉS Y CONCURRENCIA M1:${c.reset}`);
console.log(`Total Pruebas: ${totalPassed + totalFailed} | ${c.green}Aprobadas: ${totalPassed}${c.reset} | ${totalFailed > 0 ? c.red : c.dim}Falladas: ${totalFailed}${c.reset}`);
console.log(`${c.bold}${c.cyan}======================================================================${c.reset}\n`);

if (findings.length > 0) {
  console.log(`${c.yellow}${c.bold}Observaciones y Hallazgos Registrados:${c.reset}`);
  findings.forEach((f, idx) => {
    console.log(`  [${idx + 1}] ${JSON.stringify(f, null, 2)}`);
  });
}

if (totalFailed > 0) {
  process.exit(1);
} else {
  console.log(`${c.green}${c.bold}✓ TODAS LAS PRUEBAS DE CONCURRENCIA, REACTIVIDAD Y ESTRÉS HAN SIDO SUPERADAS.${c.reset}\n`);
  process.exit(0);
}
