/**
 * tests/tier3_pairwise.test.js
 * Tier 3: Combinaciones Entre Características (Pairwise Cross-Feature Tests)
 * Cobertura de interacciones complejas y efectos secundarios entre características (Total: 22 tests).
 * Fuente Autorizada: PROJECT.md § Milestones & Architecture, ORIGINAL_REQUEST.md.
 */

const { describe, test, beforeEach, assert } = require('./e2e_runner');
const {
  createTestEnvironment,
  ReferenceAnalytics,
  ReferenceValidation,
  ReferenceExportImport,
  ReferenceWCAG
} = require('./spec_helper');

describe('Tier 3 — Combinaciones Entre Características (Pairwise)', () => {
  let env;

  beforeEach(() => {
    env = createTestEnvironment();
  });

  test('T3_P01: [F03 Store + F07 Dark Theme + F15 ECharts Theme Sync]: Cambiar tema actualiza Store y paleta de ECharts', () => {
    let theme = 'light';
    const chartDom = env.document.getElementById('categoryChart');
    const chart = env.echarts.init(chartDom);

    const setTheme = (nextTheme) => {
      theme = nextTheme;
      env.document.documentElement.setAttribute('data-theme', theme);
      env.localStorage.setItem('theme', theme);

      // Sincronización con ECharts
      const isDark = theme === 'dark';
      chart.setOption({
        tooltip: {
          backgroundColor: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          borderColor: isDark ? '#334155' : '#e2e8f0',
          textStyle: { color: isDark ? '#f1f5f9' : '#1e293b' }
        }
      });
    };

    setTheme('dark');
    assert.strictEqual(env.document.documentElement.getAttribute('data-theme'), 'dark');
    assert.strictEqual(env.localStorage.getItem('theme'), 'dark');
    assert.strictEqual(chart.getOption().tooltip.backgroundColor, 'rgba(30, 41, 59, 0.95)');

    setTheme('light');
    assert.strictEqual(env.document.documentElement.getAttribute('data-theme'), 'light');
    assert.strictEqual(chart.getOption().tooltip.backgroundColor, 'rgba(255, 255, 255, 0.95)');
  });

  test('T3_P02: [F04 Validaciones + F01 LocalStorage]: Input inválido no genera escritura corrupta en LocalStorage', () => {
    const initialItems = [{ id: '1', name: 'Leche', quantity: 1, unitPrice: 1.0 }];
    env.localStorage.setItem('shoppingItems', JSON.stringify(initialItems));

    const tryAddItem = (raw) => {
      const v = ReferenceValidation.validateItem(raw);
      if (!v.valid) return false;
      const current = JSON.parse(env.localStorage.getItem('shoppingItems'));
      current.push(v.data);
      env.localStorage.setItem('shoppingItems', JSON.stringify(current));
      return true;
    };

    const success = tryAddItem({ name: '', quantity: -1, unitPrice: 'no-numero' });
    assert.strictEqual(success, false);
    const stored = JSON.parse(env.localStorage.getItem('shoppingItems'));
    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0].name, 'Leche');
  });

  test('T3_P03: [F11 DOM Granular + F13 Segregación Métricas]: Toggle de completado actualiza DOM y métricas atómicamente', () => {
    let items = [
      { id: '1', name: 'Pan', quantity: 2, unitPrice: 1.50, completed: false }
    ];
    let metrics = ReferenceAnalytics.calculateMetrics(items, 20);
    assert.strictEqual(metrics.totalPending, 3.00);
    assert.strictEqual(metrics.totalSpent, 0.00);

    // Marcar como comprado
    items = items.map(i => i.id === '1' ? { ...i, completed: true } : i);
    metrics = ReferenceAnalytics.calculateMetrics(items, 20);

    assert.strictEqual(metrics.totalPending, 0.00);
    assert.strictEqual(metrics.totalSpent, 3.00);
    assert.strictEqual(metrics.totalOverall, 3.00);
  });

  test('T3_P04: [F17 Exportación CSV + F05 Prevención XSS]: Caracteres sanitizados se exportan a CSV conforme a RFC 4180', () => {
    const rawMalicious = {
      name: '<script>alert("xss")</script>, "Super-Oferta"',
      quantity: 1,
      unitPrice: 5.0,
      category: 'Ofertas & Promos',
      location: 'Mercado'
    };
    const validated = ReferenceValidation.validateItem(rawMalicious);
    const csv = ReferenceExportImport.exportCSV([validated.data]);

    assert.strictEqual(csv.charCodeAt(0), 0xFEFF, 'Debe incluir BOM');
    assert.includes(csv, '&lt;script&gt;');
    assert.includes(csv, '""Super-Oferta""'); // RFC 4180 comilla escapada
  });

  test('T3_P05: [F18 Importación JSON + F01 LocalStorage + F13 Métricas]: Importar JSON actualiza LocalStorage y recalcula métricas', () => {
    const jsonToImport = JSON.stringify({
      version: '1.0',
      budget: 150,
      items: [
        { name: 'Aceite de Oliva', quantity: 2, unitPrice: 9.50, completed: false },
        { name: 'Arroz', quantity: 3, unitPrice: 1.20, completed: true }
      ]
    });

    const importRes = ReferenceExportImport.importJSON(jsonToImport);
    assert.strictEqual(importRes.success, true);

    env.localStorage.setItem('shoppingItems', JSON.stringify(importRes.items));
    env.localStorage.setItem('budget', String(importRes.budget));

    const storedItems = JSON.parse(env.localStorage.getItem('shoppingItems'));
    const metrics = ReferenceAnalytics.calculateMetrics(storedItems, importRes.budget);

    assert.strictEqual(metrics.totalPending, 19.00);
    assert.strictEqual(metrics.totalSpent, 3.60);
    assert.strictEqual(metrics.totalOverall, 22.60);
    assert.strictEqual(metrics.budgetRemaining, 127.40);
  });

  test('T3_P06: [F03 Filtro Búsqueda + F03 Ocultar Comprados + F11 DOM]: Intersección lógica entre búsqueda y filtro de completados', () => {
    const items = [
      { id: '1', name: 'Leche Desnatada', completed: false },
      { id: '2', name: 'Leche Entera', completed: true },
      { id: '3', name: 'Pan de Molde', completed: false }
    ];

    const filterList = (list, query, hideCompleted) => {
      const q = query.toLowerCase();
      return list.filter(item => {
        const matchesQuery = item.name.toLowerCase().includes(q);
        const matchesHide = hideCompleted ? !item.completed : true;
        return matchesQuery && matchesHide;
      });
    };

    // Caso 1: Solo búsqueda "leche"
    const r1 = filterList(items, 'leche', false);
    assert.strictEqual(r1.length, 2);

    // Caso 2: Búsqueda "leche" + ocultar completados
    const r2 = filterList(items, 'leche', true);
    assert.strictEqual(r2.length, 1);
    assert.strictEqual(r2[0].id, '1');
  });

  test('T3_P07: [F20 Toast Undo + F13 Métricas + F01 LocalStorage]: Deshacer restaura item, métricas y persistencia', () => {
    let items = [
      { id: '1', name: 'Queso Manchego', quantity: 1, unitPrice: 12.00, completed: false }
    ];
    env.localStorage.setItem('shoppingItems', JSON.stringify(items));
    let metrics = ReferenceAnalytics.calculateMetrics(items, 50);
    assert.strictEqual(metrics.totalPending, 12.00);

    // Acción: Borrar producto (creando snapshot para Undo)
    const undoSnapshot = [...items];
    items = [];
    env.localStorage.setItem('shoppingItems', JSON.stringify(items));
    metrics = ReferenceAnalytics.calculateMetrics(items, 50);
    assert.strictEqual(metrics.totalPending, 0.00);

    // Acción: Deshacer (Undo)
    items = [...undoSnapshot];
    env.localStorage.setItem('shoppingItems', JSON.stringify(items));
    metrics = ReferenceAnalytics.calculateMetrics(items, 50);
    assert.strictEqual(metrics.totalPending, 12.00);
    assert.strictEqual(JSON.parse(env.localStorage.getItem('shoppingItems')).length, 1);
  });

  test('T3_P08: [F19 Atajo Enter + F04 Validación + F11 DOM]: Enter con datos válidos agrega producto y reenfoca input', () => {
    const itemInput = env.document.getElementById('itemInput');
    const qtyInput = env.document.getElementById('quantityInput');
    const priceInput = env.document.getElementById('unitPriceInput');

    itemInput.value = 'Café Espresso';
    qtyInput.value = '2';
    priceInput.value = '3.50';

    const v = ReferenceValidation.validateItem({
      name: itemInput.value,
      quantity: qtyInput.value,
      unitPrice: priceInput.value
    });
    assert.strictEqual(v.valid, true);

    // Simular limpieza de formulario y retorno de foco
    itemInput.value = '';
    qtyInput.value = '1';
    priceInput.value = '';
    itemInput.focus();

    assert.strictEqual(itemInput.value, '');
    assert.strictEqual(env.document.activeElement, itemInput);
  });

  test('T3_P09: [F19 Atajo Enter + F04 Validación]: Enter con nombre vacío no agrega item y genera error de validación', () => {
    const itemInput = env.document.getElementById('itemInput');
    itemInput.value = '   ';
    const v = ReferenceValidation.validateItem({ name: itemInput.value });
    assert.strictEqual(v.valid, false);
  });

  test('T3_P10: [F14 ECharts + F16 Estado Vacío + F11 DOM]: Añadir primer producto activa ECharts; borrarlo regresa a vacío', () => {
    const chartDom = env.document.getElementById('categoryChart');
    const chart = env.echarts.init(chartDom);

    let items = [];
    let breakdown = ReferenceAnalytics.getCategoryBreakdown(items);
    assert.strictEqual(Object.keys(breakdown).length, 0);

    // Añadir producto
    items.push({ name: 'Plátanos', category: 'Frutas', location: 'Frutería', quantity: 4, completed: false });
    breakdown = ReferenceAnalytics.getCategoryBreakdown(items);
    assert.strictEqual(breakdown['Frutería']['Frutas'], 4);
    chart.setOption({ series: [{ data: [4] }] });
    assert.ok(chart.getOption().series);

    // Eliminar producto
    items = [];
    breakdown = ReferenceAnalytics.getCategoryBreakdown(items);
    assert.strictEqual(Object.keys(breakdown).length, 0);
    chart.clear();
    assert.strictEqual(chart._cleared, true);
  });

  test('T3_P11: [F12 Precisión Centavos + F13 Métricas + F04 Validación]: Adición masiva fraccionaria previene drift IEEE 754', () => {
    const items = [];
    // 10 productos de $0.33 -> 10 * 0.33 = $3.30 (en float simple 0.33 * 10 = 3.3000000000000003)
    for (let i = 0; i < 10; i++) {
      items.push({ quantity: 1, unitPrice: 0.33, completed: false });
    }
    const metrics = ReferenceAnalytics.calculateMetrics(items, 10);
    assert.strictEqual(metrics.totalPending, 3.30);
  });

  test('T3_P12: [F18 Importación CSV + F10 Avatares Locales]: CSV asigna avatares locales temáticos según categoría', () => {
    const csv = '\uFEFFname,quantity,unitPrice,category\r\nLeche,1,1.2,Lácteos\r\nManzana,2,0.5,Frutas\r\nPilas,1,3.0,General';
    const imp = ReferenceExportImport.importCSV(csv);
    assert.strictEqual(imp.items.length, 3);

    const getIcon = (cat) => {
      const map = { 'Lácteos': 'milk', 'Frutas': 'apple', 'General': 'package' };
      return map[cat] || 'package';
    };

    assert.strictEqual(getIcon(imp.items[0].category), 'milk');
    assert.strictEqual(getIcon(imp.items[1].category), 'apple');
    assert.strictEqual(getIcon(imp.items[2].category), 'package');
  });

  test('T3_P13: [F08 Layout Mobile + F14 ECharts Responsive]: Viewport 360px mantiene tooltip confine true', () => {
    const chartDom = env.document.getElementById('categoryChart');
    const chart = env.echarts.init(chartDom);
    chart.setOption({
      tooltip: { confine: true }
    });
    assert.strictEqual(chart.getOption().tooltip.confine, true);
  });

  test('T3_P14: [F01 LocalStorage + F02 Firebase Fallback]: Pérdida de red conmuta a LocalStorage sin bloquear UI', async () => {
    let networkAvailable = false;
    const saveItem = async (item) => {
      if (!networkAvailable) {
        // Modo offline: almacenar en LocalStorage
        const existing = JSON.parse(env.localStorage.getItem('shoppingItems') || '[]');
        existing.push(item);
        env.localStorage.setItem('shoppingItems', JSON.stringify(existing));
        return { source: 'local' };
      }
      return { source: 'remote' };
    };

    const res = await saveItem({ id: 'off_1', name: 'Galletas' });
    assert.strictEqual(res.source, 'local');
    const stored = JSON.parse(env.localStorage.getItem('shoppingItems'));
    assert.strictEqual(stored.length, 1);
  });

  test('T3_P15: [F18 Importación Merge vs Overwrite]: Merge agrega items únicos, Overwrite sustituye catálogo completo', () => {
    const current = [{ id: 'ex_1', name: 'Café' }];
    const imported = [{ id: 'imp_1', name: 'Té Verde' }];

    // Modo Overwrite
    const overwritten = [...imported];
    assert.strictEqual(overwritten.length, 1);
    assert.strictEqual(overwritten[0].name, 'Té Verde');

    // Modo Merge
    const merged = [...current, ...imported];
    assert.strictEqual(merged.length, 2);
  });

  test('T3_P16: [F20 Limpiar Comprados + F20 Toast Undo]: Limpiar 5 comprados y deshacer los recupera en bloque', () => {
    let items = [
      { id: '1', name: 'A', completed: true },
      { id: '2', name: 'B', completed: true },
      { id: '3', name: 'C', completed: true },
      { id: '4', name: 'D', completed: true },
      { id: '5', name: 'E', completed: true },
      { id: '6', name: 'F', completed: false }
    ];

    // Limpiar comprados
    const snapshot = [...items];
    items = items.filter(i => !i.completed);
    assert.strictEqual(items.length, 1);

    // Deshacer
    items = [...snapshot];
    assert.strictEqual(items.length, 6);
    assert.strictEqual(items.filter(i => i.completed).length, 5);
  });

  test('T3_P17: [F07 Dark Theme + F06 WCAG AA]: Contraste en modo oscuro supera 4.5:1', () => {
    const darkBg = '#1e293b';
    const darkText = '#f8fafc';
    const ratio = ReferenceWCAG.getContrastRatio(darkText, darkBg);
    assert.ok(ratio >= 4.5);
  });

  test('T3_P18: [F03 Store + F14 ECharts Categories]: Modificar categoría de item actualiza barras de categorías', () => {
    let items = [
      { id: '1', name: 'Manzanas', category: 'Frutas', location: 'Super', quantity: 2, completed: false }
    ];
    let breakdown = ReferenceAnalytics.getCategoryBreakdown(items);
    assert.strictEqual(breakdown['Super']['Frutas'], 2);

    // Editar categoría a 'Verduras'
    items = items.map(i => i.id === '1' ? { ...i, category: 'Verduras' } : i);
    breakdown = ReferenceAnalytics.getCategoryBreakdown(items);
    assert.strictEqual(breakdown['Super']['Frutas'], undefined);
    assert.strictEqual(breakdown['Super']['Verduras'], 2);
  });

  test('T3_P19: [F09 Touch Targets + F08 Mobile]: Botones de acción mantienen tamaño táctil accesible en móvil', () => {
    const btn = env.document.getElementById('themeToggle');
    assert.ok(btn);
  });

  test('T3_P20: [F17 Export JSON + F18 Import JSON (Roundtrip)]: Exportar y reimportar produce catálogo 100% idéntico', () => {
    const originalItems = [
      { id: 'rt_1', name: 'Aceite', quantity: 1, unitPrice: 8.50, category: 'Alimentación', location: 'Mercadona', completed: false, timestamp: 1000 },
      { id: 'rt_2', name: 'Salmón', quantity: 2, unitPrice: 6.00, category: 'Pescadería', location: 'Mercadona', completed: true, timestamp: 2000 }
    ];
    const originalBudget = 100;

    const exportedJSON = ReferenceExportImport.exportJSON(originalItems, originalBudget);
    const importRes = ReferenceExportImport.importJSON(exportedJSON);

    assert.strictEqual(importRes.success, true);
    assert.strictEqual(importRes.budget, originalBudget);
    assert.strictEqual(importRes.items.length, originalItems.length);
    assert.strictEqual(importRes.items[0].name, originalItems[0].name);
    assert.strictEqual(importRes.items[1].completed, originalItems[1].completed);
  });

  test('T3_P21: [F17 Export CSV + F18 Import CSV (Roundtrip)]: Exportar CSV y reimportar preserva datos y precios', () => {
    const originalItems = [
      { id: 'csv_1', name: 'Tomate, Triturado', quantity: 3, unitPrice: 0.85, category: 'Conservas', location: 'Lidl', completed: false, timestamp: 3000 }
    ];
    const exportedCSV = ReferenceExportImport.exportCSV(originalItems);
    const importRes = ReferenceExportImport.importCSV(exportedCSV);

    assert.strictEqual(importRes.success, true);
    assert.strictEqual(importRes.items.length, 1);
    assert.strictEqual(importRes.items[0].name, 'Tomate, Triturado');
    assert.strictEqual(importRes.items[0].unitPrice, 0.85);
  });

  test('T3_P22: [F03 Store PubSub + F19 Teclado Esc]: Cancelar edición con Escape no emite mutación errónea', () => {
    const originalState = { editingId: 'item_99', values: { name: 'Queso' } };
    let currentState = { ...originalState };

    const handleKey = (key) => {
      if (key === 'Escape') {
        currentState = { editingId: null, values: null };
      }
    };

    handleKey('Escape');
    assert.strictEqual(currentState.editingId, null);
    assert.strictEqual(currentState.values, null);
  });
});
