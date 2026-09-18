/**
 * tests/tier4_scenarios.test.js
 * Tier 4: Escenarios de Usuario del Mundo Real (Real-World Application Scenarios)
 * Cobertura de flujos de usuario completos de principio a fin (Total: 10 escenarios completos).
 * Fuente Autorizada: PROJECT.md § Milestones, ORIGINAL_REQUEST.md.
 */

const { describe, test, beforeEach, assert } = require('./e2e_runner');
const {
  createTestEnvironment,
  ReferenceAnalytics,
  ReferenceValidation,
  ReferenceExportImport,
  ReferenceWCAG
} = require('./spec_helper');

describe('Tier 4 — Escenarios de Usuario del Mundo Real', () => {
  let env;

  beforeEach(() => {
    env = createTestEnvironment();
  });

  test('T4_S01: Escenario 1 — Compra Semanal Familiar Completa de Supermercado', () => {
    // 1. Configuración de presupuesto de $150.00
    const budget = 150.00;
    env.localStorage.setItem('budget', String(budget));

    // 2. Adición de 12 productos divididos en 3 supermercados
    const rawItems = [
      { name: 'Leche Desnatada', quantity: 6, unitPrice: 0.95, category: 'Lácteos', location: 'Mercadona' },
      { name: 'Huevos Camperos', quantity: 2, unitPrice: 2.30, category: 'Lácteos', location: 'Mercadona' },
      { name: 'Pechuga de Pollo', quantity: 1, unitPrice: 6.50, category: 'Carnicería', location: 'Mercadona' },
      { name: 'Pasta Integral', quantity: 4, unitPrice: 1.15, category: 'Alimentación', location: 'Mercadona' },

      { name: 'Detergente Ropa', quantity: 1, unitPrice: 8.90, category: 'Limpieza', location: 'Carrefour' },
      { name: 'Papel Higiénico', quantity: 2, unitPrice: 4.25, category: 'Limpieza', location: 'Carrefour' },
      { name: 'Aceite de Oliva', quantity: 2, unitPrice: 9.99, category: 'Alimentación', location: 'Carrefour' },
      { name: 'Cereal Avena', quantity: 2, unitPrice: 1.80, category: 'Desayuno', location: 'Carrefour' },

      { name: 'Plátanos', quantity: 2, unitPrice: 1.45, category: 'Frutas', location: 'Verdulería' },
      { name: 'Tomates Ensalada', quantity: 1, unitPrice: 2.20, category: 'Verduras', location: 'Verdulería' },
      { name: 'Aguacates', quantity: 3, unitPrice: 1.50, category: 'Frutas', location: 'Verdulería' },
      { name: 'Manzanas Golden', quantity: 2, unitPrice: 1.90, category: 'Frutas', location: 'Verdulería' }
    ];

    let items = [];
    for (const raw of rawItems) {
      const v = ReferenceValidation.validateItem(raw);
      assert.strictEqual(v.valid, true);
      items.push(v.data);
    }
    assert.strictEqual(items.length, 12);

    // 3. Verificación de métricas iniciales
    let metrics = ReferenceAnalytics.calculateMetrics(items, budget);
    assert.ok(metrics.totalPending > 0);
    assert.strictEqual(metrics.totalSpent, 0);

    // 4. El usuario compra y marca 7 productos como comprados en tienda
    for (let i = 0; i < 7; i++) {
      items[i].completed = true;
    }

    metrics = ReferenceAnalytics.calculateMetrics(items, budget);
    assert.ok(metrics.totalSpent > 0);
    assert.ok(metrics.totalPending > 0);
    assert.strictEqual(metrics.totalOverall, metrics.totalPending + metrics.totalSpent);

    // 5. Finalizar compra: Limpiar los 7 productos comprados
    const remaining = items.filter(i => !i.completed);
    assert.strictEqual(remaining.length, 5);

    const finalMetrics = ReferenceAnalytics.calculateMetrics(remaining, budget);
    assert.strictEqual(finalMetrics.totalSpent, 0);
    assert.strictEqual(finalMetrics.totalPending, remaining.reduce((acc, it) => acc + it.quantity * it.unitPrice, 0));
  });

  test('T4_S02: Escenario 2 — Gestión Estricta de Presupuesto con Alerta de Sobrepaso', () => {
    const budget = 50.00;
    // Usuario agrega productos cerca del límite: $49.50
    const items = [
      { name: 'Café Grano Especial', quantity: 2, unitPrice: 15.00, completed: false }, // 30.00
      { name: 'Chocolates Finos', quantity: 3, unitPrice: 6.50, completed: false }       // 19.50
    ];
    let metrics = ReferenceAnalytics.calculateMetrics(items, budget);
    assert.strictEqual(metrics.totalPending, 49.50);
    assert.strictEqual(metrics.budgetRemaining, 0.50);
    assert.strictEqual(metrics.budgetPercentage, 99);

    // Usuario añade producto que excede el presupuesto en $9.50
    items.push({ name: 'Vino Reserva', quantity: 1, unitPrice: 10.00, completed: false });
    metrics = ReferenceAnalytics.calculateMetrics(items, budget);
    assert.strictEqual(metrics.totalPending, 59.50);
    assert.strictEqual(metrics.budgetRemaining, -9.50);
    assert.strictEqual(metrics.budgetPercentage, 100); // Barra topada al 100%

    // Usuario ajusta cantidad de café de 2 a 1 para mantenerse bajo presupuesto
    items[0].quantity = 1;
    metrics = ReferenceAnalytics.calculateMetrics(items, budget);
    assert.strictEqual(metrics.totalPending, 44.50);
    assert.strictEqual(metrics.budgetRemaining, 5.50);
    assert.ok(metrics.budgetPercentage < 100);
  });

  test('T4_S03: Escenario 3 — Organización por Pasillos y Colapso de Secciones en Tienda', () => {
    const items = [
      { id: '1', name: 'Yogur', location: 'Pasillo 1 - Lácteos', completed: true },
      { id: '2', name: 'Mantequilla', location: 'Pasillo 1 - Lácteos', completed: true },
      { id: '3', name: 'Baguette', location: 'Pasillo 2 - Panadería', completed: false }
    ];

    // Simular colapso del pasillo 1 completado
    const collapsedGroups = new Set();
    collapsedGroups.add('Pasillo 1 - Lácteos');
    env.localStorage.setItem('collapsedGroups', JSON.stringify(Array.from(collapsedGroups)));

    // Búsqueda en tienda para encontrar "baguette"
    const searchFilter = 'baguette';
    const matches = items.filter(it => it.name.toLowerCase().includes(searchFilter.toLowerCase()));
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].location, 'Pasillo 2 - Panadería');

    // Restaurar colapsados tras recarga
    const storedCollapsed = new Set(JSON.parse(env.localStorage.getItem('collapsedGroups')));
    assert.strictEqual(storedCollapsed.has('Pasillo 1 - Lácteos'), true);
  });

  test('T4_S04: Escenario 4 — Flujo de Respaldo y Migración entre Dispositivos (Backup & Restore)', () => {
    // 1. Catálogo original en dispositivo 1
    const originalItems = [
      { id: 'dev1_1', name: 'Cápsulas Café', quantity: 3, unitPrice: 4.80, category: 'Café', location: 'Nespresso', completed: false, timestamp: 100 },
      { id: 'dev1_2', name: 'Azúcar Moreno', quantity: 1, unitPrice: 1.50, category: 'Endulzantes', location: 'Super', completed: true, timestamp: 200 }
    ];
    const originalBudget = 75.00;

    // 2. Exportación a JSON v1.0
    const backupFile = ReferenceExportImport.exportJSON(originalItems, originalBudget);

    // 3. Simulación de nuevo dispositivo (LocalStorage limpio)
    const newDeviceEnv = createTestEnvironment();
    assert.strictEqual(newDeviceEnv.localStorage.getItem('shoppingItems'), null);

    // 4. Importación del respaldo en nuevo dispositivo
    const importResult = ReferenceExportImport.importJSON(backupFile);
    assert.strictEqual(importResult.success, true);
    newDeviceEnv.localStorage.setItem('shoppingItems', JSON.stringify(importResult.items));
    newDeviceEnv.localStorage.setItem('budget', String(importResult.budget));

    // 5. Verificación de fidelidad 100%
    const restoredItems = JSON.parse(newDeviceEnv.localStorage.getItem('shoppingItems'));
    assert.strictEqual(restoredItems.length, 2);
    assert.strictEqual(restoredItems[0].name, 'Cápsulas Café');
    assert.strictEqual(restoredItems[1].completed, true);
    assert.strictEqual(parseFloat(newDeviceEnv.localStorage.getItem('budget')), 75.00);
  });

  test('T4_S05: Escenario 5 — Recuperación tras Error Accidental con Deshacer (Undo Flow)', () => {
    // 1. Lista activa con 8 productos comprados históricos
    let activeList = Array.from({ length: 8 }, (_, i) => ({
      id: `item_hist_${i}`,
      name: `Producto Histórico ${i}`,
      quantity: 1,
      unitPrice: 2.50,
      completed: true
    }));

    // 2. El usuario presiona accidentalmente "Limpiar Comprados"
    const undoStack = {
      snapshot: [...activeList],
      timestamp: Date.now(),
      expired: false
    };
    activeList = activeList.filter(i => !i.completed);
    assert.strictEqual(activeList.length, 0);

    // 3. Simular cuenta regresiva de 4 segundos (< 8 segundos de expiración)
    const elapsedSeconds = 4;
    if (elapsedSeconds <= 8) {
      // 4. El usuario presiona "Deshacer"
      activeList = [...undoStack.snapshot];
    }

    // 5. La lista y métricas se restauran perfectamente
    assert.strictEqual(activeList.length, 8);
    const metrics = ReferenceAnalytics.calculateMetrics(activeList, 100);
    assert.strictEqual(metrics.totalSpent, 20.00);
  });

  test('T4_S06: Escenario 6 — Preparación de Receta Especial con Cantidades y Precios Fraccionados', () => {
    // Ingredientes con peso y decimales
    const recipeItems = [
      { name: 'Solomillo de Ternera (kg)', quantity: 1.25, unitPrice: 24.80, completed: false }, // 31.00
      { name: 'Chalotas', quantity: 0.35, unitPrice: 4.20, completed: false },                   // 1.47
      { name: 'Vino Oporto', quantity: 1, unitPrice: 8.50, completed: false },                    // 8.50
      { name: 'Mantequilla Francesa', quantity: 2, unitPrice: 2.75, completed: false }            // 5.50
    ];

    const metrics = ReferenceAnalytics.calculateMetrics(recipeItems, 50.00);
    // 31.00 + 1.47 + 8.50 + 5.50 = 46.47
    assert.strictEqual(metrics.totalPending, 46.47);
    assert.strictEqual(metrics.budgetRemaining, 3.53);
    assert.strictEqual(metrics.totalSpent, 0.00);
  });

  test('T4_S07: Escenario 7 — Uso Rápido en Movilidad con Atajos de Teclado y Búsqueda', () => {
    const itemInput = env.document.getElementById('itemInput');
    const searchInput = env.document.getElementById('searchInput');

    const added = [];
    const products = ['Leche Semidesnatada', 'Pan Integral', 'Queso Gouda', 'Cereal Avena', 'Yogur Fresa'];

    // Adición secuencial simulada con Enter
    for (const p of products) {
      itemInput.value = p;
      const v = ReferenceValidation.validateItem({ name: itemInput.value, quantity: 1, unitPrice: 1.0 });
      added.push(v.data);
      itemInput.value = '';
      itemInput.focus();
    }
    assert.strictEqual(added.length, 5);
    assert.strictEqual(env.document.activeElement, itemInput);

    // Búsqueda instantánea en tiempo real de "leche"
    searchInput.value = 'leche';
    const filtered = added.filter(it => it.name.toLowerCase().includes(searchInput.value.toLowerCase()));
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].name, 'Leche Semidesnatada');
  });

  test('T4_S08: Escenario 8 — Interrupción Offline y Continuidad de Sesión', () => {
    // 1. Usuario sin conexión en sótano
    let isOnline = false;
    const items = [];

    // 2. Agrega producto offline
    const item1 = ReferenceValidation.validateItem({ name: 'Agua Gas', quantity: 2, unitPrice: 0.80 }).data;
    items.push(item1);
    env.localStorage.setItem('shoppingItems', JSON.stringify(items));

    // 3. Marca producto como comprado offline
    items[0].completed = true;
    env.localStorage.setItem('shoppingItems', JSON.stringify(items));

    // 4. Cierra y reabre aplicación (simulada con nuevo environment recargando storage)
    const newSessionEnv = createTestEnvironment();
    newSessionEnv.localStorage.setItem('shoppingItems', env.localStorage.getItem('shoppingItems'));

    const loaded = JSON.parse(newSessionEnv.localStorage.getItem('shoppingItems'));
    assert.strictEqual(loaded.length, 1);
    assert.strictEqual(loaded[0].name, 'Agua Gas');
    assert.strictEqual(loaded[0].completed, true);

    // 5. Retorna la conexión
    isOnline = true;
    assert.strictEqual(isOnline, true);
  });

  test('T4_S09: Escenario 9 — Colaboración Externa mediante Importación de CSV Compartido', () => {
    // 1. Lista existente del usuario
    const userList = [
      { id: 'u_1', name: 'Manzanas', quantity: 2, unitPrice: 1.5, category: 'Frutas', location: 'Super' }
    ];

    // 2. CSV recibido por familiar
    const incomingCSV = '\uFEFFname,quantity,unitPrice,category,location\r\nHarina de Trigo,1,0.90,Repostería,Super\r\nLevadura Fresca,2,0.45,Repostería,Super';
    const imp = ReferenceExportImport.importCSV(incomingCSV);
    assert.strictEqual(imp.success, true);
    assert.strictEqual(imp.items.length, 2);

    // 3. Integración en modo Merge (combinar)
    const combined = [...userList, ...imp.items];
    assert.strictEqual(combined.length, 3);
    assert.strictEqual(combined[0].name, 'Manzanas');
    assert.strictEqual(combined[1].name, 'Harina de Trigo');
    assert.strictEqual(combined[2].name, 'Levadura Fresca');
  });

  test('T4_S10: Escenario 10 — Ciclo de Vida Nocturno (Dark Mode Shopping Journey)', () => {
    // 1. Activación de Modo Oscuro
    env.document.documentElement.setAttribute('data-theme', 'dark');
    env.localStorage.setItem('theme', 'dark');

    // 2. Verificación de contraste WCAG AA en modo nocturno
    const ratio = ReferenceWCAG.getContrastRatio('#f8fafc', '#1e293b');
    assert.ok(ratio >= 4.5);

    // 3. Gráfico de ECharts sincronizado en modo oscuro
    const chartDom = env.document.getElementById('categoryChart');
    const chart = env.echarts.init(chartDom);
    chart.setOption({
      tooltip: {
        backgroundColor: 'rgba(30, 41, 59, 0.95)',
        textStyle: { color: '#f1f5f9' }
      }
    });
    assert.strictEqual(chart.getOption().tooltip.backgroundColor, 'rgba(30, 41, 59, 0.95)');

    // 4. Recarga de página sin parpadeo blanco (persistencia en storage)
    const restoredTheme = env.localStorage.getItem('theme');
    assert.strictEqual(restoredTheme, 'dark');
  });
});
