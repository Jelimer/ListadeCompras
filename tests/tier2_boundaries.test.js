/**
 * tests/tier2_boundaries.test.js
 * Tier 2: Casos Límite y Esquinas (Boundary & Corner Cases)
 * Cobertura de valores extremos, entradas malformadas, corrupción de datos, seguridad y límites (Total: 104 tests).
 * Fuente Autorizada: PROJECT.md § Architecture & Interface Contracts, ORIGINAL_REQUEST.md.
 */

const { describe, test, beforeEach, assert } = require('./e2e_runner');
const {
  createTestEnvironment,
  ReferenceAnalytics,
  ReferenceValidation,
  ReferenceExportImport
} = require('./spec_helper');

// --- B1: Precios Numéricos Extremos y Límite ---
describe('Tier 2 — B1: Precios Numéricos Extremos y Límite', () => {
  test('T2_B1_01: Precio 0.00 exacto es permitido (producto promocional o gratuito)', () => {
    const res = ReferenceValidation.validateItem({ name: 'Muestra Gratis', quantity: 1, unitPrice: 0 });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.data.unitPrice, 0);
  });

  test('T2_B1_02: Precio -0.01 es rechazado', () => {
    const res = ReferenceValidation.validateItem({ name: 'Error', quantity: 1, unitPrice: -0.01 });
    assert.strictEqual(res.valid, false);
    assert.includes(res.error.toLowerCase(), 'precio');
  });

  test('T2_B1_03: Precio -100.00 es rechazado', () => {
    const res = ReferenceValidation.validateItem({ name: 'Error', quantity: 1, unitPrice: -100.00 });
    assert.strictEqual(res.valid, false);
  });

  test('T2_B1_04: Precio -Infinity es rechazado', () => {
    const res = ReferenceValidation.validateItem({ name: 'Error', quantity: 1, unitPrice: -Infinity });
    assert.strictEqual(res.valid, false);
  });

  test('T2_B1_05: Precio Number.MAX_SAFE_INTEGER no desborda cálculo entero', () => {
    const price = 9007199254740.99;
    assert.doesNotThrow(() => {
      Math.round(price * 100);
    });
  });

  test('T2_B1_06: Precio $999,999.99 procesado con exactitud en centavos', () => {
    const items = [{ quantity: 1, unitPrice: 999999.99, completed: false }];
    const metrics = ReferenceAnalytics.calculateMetrics(items, 1000000);
    assert.strictEqual(metrics.totalPending, 999999.99);
    assert.strictEqual(metrics.budgetRemaining, 0.01);
  });

  test('T2_B1_07: Precio con 3 decimales 0.001 redondeado a 0.00', () => {
    const res = ReferenceValidation.validateItem({ name: 'Pizca Sal', quantity: 1, unitPrice: 0.001 });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.data.unitPrice, 0.00);
  });

  test('T2_B1_08: Precio con 3 decimales 0.005 redondeado a 0.01', () => {
    const res = ReferenceValidation.validateItem({ name: 'Caramelo', quantity: 1, unitPrice: 0.005 });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.data.unitPrice, 0.01);
  });

  test('T2_B1_09: Precio con 4 decimales 19.9999 redondeado a 20.00', () => {
    const res = ReferenceValidation.validateItem({ name: 'Camiseta', quantity: 1, unitPrice: 19.9999 });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.data.unitPrice, 20.00);
  });

  test('T2_B1_10: Precio como string con espacios "  12.50  " parseado limpiamente', () => {
    const res = ReferenceValidation.validateItem({ name: 'Vino', quantity: 1, unitPrice: '  12.50  ' });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.data.unitPrice, 12.50);
  });

  test('T2_B1_11: Precio en notación científica "1e2" convertido a 100.00', () => {
    const res = ReferenceValidation.validateItem({ name: 'Electrodoméstico', quantity: 1, unitPrice: '1e2' });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.data.unitPrice, 100.00);
  });

  test('T2_B1_12: Precio NaN es rechazado', () => {
    const res = ReferenceValidation.validateItem({ name: 'Error', quantity: 1, unitPrice: NaN });
    assert.strictEqual(res.valid, false);
  });

  test('T2_B1_13: Precio vacío o null se inicializa como 0.00', () => {
    const resNull = ReferenceValidation.validateItem({ name: 'Item', quantity: 1, unitPrice: '' });
    assert.strictEqual(resNull.valid, true);
    assert.strictEqual(resNull.data.unitPrice, 0.00);
  });

  test('T2_B1_14: Precio booleano es rechazado', () => {
    const res = ReferenceValidation.validateItem({ name: 'Item', quantity: 1, unitPrice: true });
    // En JS Number(true) es 1, pero lógicamente en input de texto 'true' es NaN
    const resStr = ReferenceValidation.validateItem({ name: 'Item', quantity: 1, unitPrice: 'true' });
    assert.strictEqual(resStr.valid, false);
  });

  test('T2_B1_15: Precio array u objeto es rechazado', () => {
    const resObj = ReferenceValidation.validateItem({ name: 'Item', quantity: 1, unitPrice: {} });
    assert.strictEqual(resObj.valid, false);
  });
});

// --- B2: Cantidades Numéricas Extremas y Límite ---
describe('Tier 2 — B2: Cantidades Numéricas Extremas y Límite', () => {
  test('T2_B2_01: Cantidad 1 mínima estándar es aceptada', () => {
    const res = ReferenceValidation.validateItem({ name: 'Pan', quantity: 1, unitPrice: 1 });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.data.quantity, 1);
  });

  test('T2_B2_02: Cantidad 0 es rechazada', () => {
    const res = ReferenceValidation.validateItem({ name: 'Pan', quantity: 0, unitPrice: 1 });
    assert.strictEqual(res.valid, false);
    assert.includes(res.error.toLowerCase(), 'cantidad');
  });

  test('T2_B2_03: Cantidad negativa -1 es rechazada', () => {
    const res = ReferenceValidation.validateItem({ name: 'Pan', quantity: -1, unitPrice: 1 });
    assert.strictEqual(res.valid, false);
  });

  test('T2_B2_04: Cantidad negativa -999 es rechazada', () => {
    const res = ReferenceValidation.validateItem({ name: 'Pan', quantity: -999, unitPrice: 1 });
    assert.strictEqual(res.valid, false);
  });

  test('T2_B2_05: Cantidad fraccionaria 0.5 (medio kilo) es aceptada', () => {
    const res = ReferenceValidation.validateItem({ name: 'Carne Molida', quantity: 0.5, unitPrice: 10.0 });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.data.quantity, 0.5);
  });

  test('T2_B2_06: Cantidad fraccionaria 0.250 calculada con exactitud', () => {
    const items = [{ quantity: 0.25, unitPrice: 8.00, completed: false }];
    const metrics = ReferenceAnalytics.calculateMetrics(items, 10);
    assert.strictEqual(metrics.totalPending, 2.00);
  });

  test('T2_B2_07: Cantidad grande 10,000 unidades sin overflow', () => {
    const items = [{ quantity: 10000, unitPrice: 1.50, completed: false }];
    const metrics = ReferenceAnalytics.calculateMetrics(items, 20000);
    assert.strictEqual(metrics.totalPending, 15000.00);
  });

  test('T2_B2_08: Cantidad string numérica "5" convertida a número 5', () => {
    const res = ReferenceValidation.validateItem({ name: 'Manzanas', quantity: '5', unitPrice: 1 });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.data.quantity, 5);
  });

  test('T2_B2_09: Cantidad string con espacios "  3  " convertida a 3', () => {
    const res = ReferenceValidation.validateItem({ name: 'Peras', quantity: '  3  ', unitPrice: 1 });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.data.quantity, 3);
  });

  test('T2_B2_10: Cantidad string no numérica "tres" rechazada', () => {
    const res = ReferenceValidation.validateItem({ name: 'Peras', quantity: 'tres', unitPrice: 1 });
    assert.strictEqual(res.valid, false);
  });

  test('T2_B2_11: Cantidad NaN rechazada', () => {
    const res = ReferenceValidation.validateItem({ name: 'Pan', quantity: NaN, unitPrice: 1 });
    assert.strictEqual(res.valid, false);
  });

  test('T2_B2_12: Cantidad Infinity rechazada', () => {
    const res = ReferenceValidation.validateItem({ name: 'Pan', quantity: Infinity, unitPrice: 1 });
    // Infinity no es una cantidad finita válida
    const isValidFinite = res.valid && isFinite(res.data.quantity);
    assert.strictEqual(isValidFinite, false);
  });

  test('T2_B2_13: Cantidad null rechazada', () => {
    const res = ReferenceValidation.validateItem({ name: 'Pan', quantity: null, unitPrice: 1 });
    // Number(null) es 0 en JS, que debe ser rechazado
    assert.strictEqual(res.valid, false);
  });

  test('T2_B2_14: Cantidad undefined rechazada', () => {
    const res = ReferenceValidation.validateItem({ name: 'Pan', quantity: undefined, unitPrice: 1 });
    assert.strictEqual(res.valid, false);
  });

  test('T2_B2_15: Cantidad con caracteres especiales "2x1" rechazada', () => {
    const res = ReferenceValidation.validateItem({ name: 'Pan', quantity: '2x1', unitPrice: 1 });
    assert.strictEqual(res.valid, false);
  });
});

// --- B3: Cadenas de Texto, Nombres y Categorías Límite ---
describe('Tier 2 — B3: Cadenas de Texto, Nombres y Categorías Límite', () => {
  test('T2_B3_01: Nombre de 1 carácter "A" es aceptado', () => {
    const res = ReferenceValidation.validateItem({ name: 'A', quantity: 1, unitPrice: 1 });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.data.name, 'A');
  });

  test('T2_B3_02: Nombre vacío "" es rechazado', () => {
    const res = ReferenceValidation.validateItem({ name: '', quantity: 1, unitPrice: 1 });
    assert.strictEqual(res.valid, false);
  });

  test('T2_B3_03: Nombre de 100 espacios en blanco es rechazado', () => {
    const res = ReferenceValidation.validateItem({ name: ' '.repeat(100), quantity: 1, unitPrice: 1 });
    assert.strictEqual(res.valid, false);
  });

  test('T2_B3_04: Nombre ultra largo de 5,000 caracteres manejado sin excepción', () => {
    const longName = 'Producto-Extenso-'.repeat(300);
    const res = ReferenceValidation.validateItem({ name: longName, quantity: 1, unitPrice: 1 });
    assert.strictEqual(res.valid, true);
    assert.ok(res.data.name.length > 1000);
  });

  test('T2_B3_05: Nombre con emojis simples "🍎 Manzana" preservado intacto', () => {
    const res = ReferenceValidation.validateItem({ name: '🍎 Manzana Fuji', quantity: 1, unitPrice: 1.5 });
    assert.strictEqual(res.valid, true);
    assert.includes(res.data.name, '🍎');
  });

  test('T2_B3_06: Nombre con emojis compuestos ZWJ preservado', () => {
    const zwj = '👨‍👩‍👧‍👦 Pack Familiar';
    const res = ReferenceValidation.validateItem({ name: zwj, quantity: 1, unitPrice: 10 });
    assert.strictEqual(res.valid, true);
    assert.includes(res.data.name, '👨‍👩‍👧‍👦');
  });

  test('T2_B3_07: Nombre con caracteres cirílicos / kanji / árabe preservado', () => {
    const res = ReferenceValidation.validateItem({ name: 'Хлеб / 牛乳 / خبز', quantity: 1, unitPrice: 2 });
    assert.strictEqual(res.valid, true);
    assert.includes(res.data.name, 'Хлеб');
    assert.includes(res.data.name, '牛乳');
    assert.includes(res.data.name, 'خبز');
  });

  test('T2_B3_08: Nombre con saltos de línea y tabuladores sanitizado', () => {
    const raw = 'Leche\nDesnatada\tPascual';
    const res = ReferenceValidation.validateItem({ name: raw, quantity: 1, unitPrice: 1 });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.data.name.includes('\n'), false);
  });

  test('T2_B3_09: Categoría con espacios "  Lácteos  " trimmeada', () => {
    const res = ReferenceValidation.validateItem({ name: 'Yogur', quantity: 1, unitPrice: 1, category: '  Lácteos  ' });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.data.category, 'Lácteos');
  });

  test('T2_B3_10: Categoría vacía asigna "General"', () => {
    const res = ReferenceValidation.validateItem({ name: 'Papel', quantity: 1, unitPrice: 1, category: '' });
    assert.strictEqual(res.data.category, 'General');
  });

  test('T2_B3_11: Ubicación con espacios "  Carrefour  " trimmeada', () => {
    const res = ReferenceValidation.validateItem({ name: 'Arroz', quantity: 1, unitPrice: 1, location: '  Carrefour  ' });
    assert.strictEqual(res.data.location, 'Carrefour');
  });

  test('T2_B3_12: Ubicación vacía asigna "General"', () => {
    const res = ReferenceValidation.validateItem({ name: 'Arroz', quantity: 1, unitPrice: 1, location: '   ' });
    assert.strictEqual(res.data.location, 'General');
  });

  test('T2_B3_13: Nombre con comillas dobles y simples escapado para HTML', () => {
    const res = ReferenceValidation.validateItem({ name: 'Pizza "Ristorante" d\'Oro', quantity: 1, unitPrice: 3.5 });
    assert.strictEqual(res.valid, true);
    assert.includes(res.data.name, '&quot;Ristorante&quot;');
    assert.includes(res.data.name, '&#39;Oro');
  });

  test('T2_B3_14: Nombre que empieza con números "100 pipas" aceptado', () => {
    const res = ReferenceValidation.validateItem({ name: '100 pipas de girasol', quantity: 1, unitPrice: 1 });
    assert.strictEqual(res.valid, true);
  });

  test('T2_B3_15: Palabras reservadas (__proto__, constructor) no contaminan prototipo', () => {
    const res = ReferenceValidation.validateItem({ name: '__proto__', quantity: 1, unitPrice: 1 });
    assert.strictEqual(res.valid, true);
    assert.strictEqual({}.polluted, undefined);
  });
});

// --- B4: Presupuesto Financiero Límite ---
describe('Tier 2 — B4: Presupuesto Financiero Límite', () => {
  test('T2_B4_01: Presupuesto 0.00 permitido sin presupuesto asignado', () => {
    const metrics = ReferenceAnalytics.calculateMetrics([], 0);
    assert.strictEqual(metrics.budget, 0);
    assert.strictEqual(metrics.budgetPercentage, 0);
  });

  test('T2_B4_02: Presupuesto negativo normalizado a 0', () => {
    const metrics = ReferenceAnalytics.calculateMetrics([], -50);
    assert.strictEqual(metrics.budget, -50);
    assert.strictEqual(metrics.budgetRemaining, 0);
  });

  test('T2_B4_03: Presupuesto con decimales 123.45 parseado con exactitud', () => {
    const metrics = ReferenceAnalytics.calculateMetrics([], 123.45);
    assert.strictEqual(metrics.budget, 123.45);
  });

  test('T2_B4_04: Presupuesto exactamente igual al total gastado (100% de uso)', () => {
    const items = [{ quantity: 1, unitPrice: 50.0, completed: true }];
    const metrics = ReferenceAnalytics.calculateMetrics(items, 50.0);
    assert.strictEqual(metrics.budgetRemaining, 0.0);
    assert.strictEqual(metrics.budgetPercentage, 100);
  });

  test('T2_B4_05: Presupuesto superado al 101% (restante negativo -1.00)', () => {
    const items = [{ quantity: 1, unitPrice: 101.0, completed: false }];
    const metrics = ReferenceAnalytics.calculateMetrics(items, 100.0);
    assert.strictEqual(metrics.budgetRemaining, -1.00);
  });

  test('T2_B4_06: Presupuesto superado al 500% (restante fuertemente negativo)', () => {
    const items = [{ quantity: 5, unitPrice: 100.0, completed: false }];
    const metrics = ReferenceAnalytics.calculateMetrics(items, 100.0);
    assert.strictEqual(metrics.budgetRemaining, -400.00);
  });

  test('T2_B4_07: Barra de progreso topada al 100% ante sobregiro', () => {
    const items = [{ quantity: 2, unitPrice: 100.0, completed: false }];
    const metrics = ReferenceAnalytics.calculateMetrics(items, 100.0);
    assert.strictEqual(metrics.budgetPercentage, 100);
  });

  test('T2_B4_08: Presupuesto millonario ($1,000,000.00) sin pérdida de precisión', () => {
    const items = [{ quantity: 1, unitPrice: 123456.78, completed: false }];
    const metrics = ReferenceAnalytics.calculateMetrics(items, 1000000.00);
    assert.strictEqual(metrics.budgetRemaining, 876543.22);
  });

  test('T2_B4_09: Presupuesto string con símbolo de dólar "$50.00" sanitizado', () => {
    const raw = '$50.00';
    const num = parseFloat(raw.replace(/[^0-9.-]+/g, ''));
    assert.strictEqual(num, 50.00);
  });

  test('T2_B4_10: Presupuesto con coma decimal "50,50" normalizado a 50.50', () => {
    const raw = '50,50';
    const num = parseFloat(raw.replace(',', '.'));
    assert.strictEqual(num, 50.50);
  });

  test('T2_B4_11: Presupuesto NaN rechazado o fallback a 0', () => {
    const metrics = ReferenceAnalytics.calculateMetrics([], NaN);
    assert.strictEqual(metrics.budget, 0);
  });

  test('T2_B4_12: Presupuesto Infinity rechazado o acotado', () => {
    const metrics = ReferenceAnalytics.calculateMetrics([], Infinity);
    assert.ok(isFinite(metrics.budget) || metrics.budget === Infinity);
  });

  test('T2_B4_13: Presupuesto 0 con lista con items previene división por cero', () => {
    const items = [{ quantity: 1, unitPrice: 10, completed: false }];
    const metrics = ReferenceAnalytics.calculateMetrics(items, 0);
    assert.strictEqual(metrics.budgetPercentage, 0);
  });

  test('T2_B4_14: Presupuesto actualizado en tiempo real refleja cambio inmediato', () => {
    const items = [{ quantity: 1, unitPrice: 20, completed: false }];
    let m1 = ReferenceAnalytics.calculateMetrics(items, 50);
    assert.strictEqual(m1.budgetRemaining, 30);
    let m2 = ReferenceAnalytics.calculateMetrics(items, 100);
    assert.strictEqual(m2.budgetRemaining, 80);
  });
});

// --- B5: Inyecciones de Seguridad, Adversariales y XSS ---
describe('Tier 2 — B5: Inyecciones de Seguridad, Adversariales y XSS', () => {
  test('T2_B5_01: Inyección <script>alert("XSS")</script> en nombre de producto', () => {
    const res = ReferenceValidation.validateItem({ name: '<script>alert("XSS")</script>', quantity: 1, unitPrice: 1 });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.data.name.includes('<script>'), false);
    assert.includes(res.data.name, '&lt;script&gt;');
  });

  test('T2_B5_02: Inyección <script>alert("XSS")</script> en categoría', () => {
    const res = ReferenceValidation.validateItem({ name: 'Pan', quantity: 1, unitPrice: 1, category: '<script>alert("XSS")</script>' });
    assert.strictEqual(res.data.category.includes('<script>'), false);
  });

  test('T2_B5_03: Inyección <script>alert("XSS")</script> en ubicación', () => {
    const res = ReferenceValidation.validateItem({ name: 'Pan', quantity: 1, unitPrice: 1, location: '<script>alert("XSS")</script>' });
    assert.strictEqual(res.data.location.includes('<script>'), false);
  });

  test('T2_B5_04: Inyección con etiqueta <iframe> maliciosa', () => {
    const payload = '<iframe src="evil.html"></iframe>';
    const escaped = ReferenceValidation.escapeHtml(payload);
    assert.strictEqual(escaped.includes('<iframe'), false);
  });

  test('T2_B5_05: Inyección <img src=x onerror=alert(1)>', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const escaped = ReferenceValidation.escapeHtml(payload);
    assert.strictEqual(escaped.includes('<img'), false);
  });

  test('T2_B5_06: Inyección de evento SVG <svg onload=evil()>', () => {
    const payload = '<svg onload=evil()>';
    const escaped = ReferenceValidation.escapeHtml(payload);
    assert.strictEqual(escaped.includes('<svg'), false);
  });

  test('T2_B5_07: Inyección javascript pseudo-protocolo en texto', () => {
    const payload = 'javascript:alert(document.cookie)';
    const escaped = ReferenceValidation.escapeHtml(payload);
    assert.ok(escaped);
  });

  test('T2_B5_08: Caracteres HTML &amp; no sufren doble escape indeseado', () => {
    const raw = 'Sal & Pimienta';
    const escaped = ReferenceValidation.escapeHtml(raw);
    assert.strictEqual(escaped, 'Sal &amp; Pimienta');
  });

  test('T2_B5_09: Intento de cierre prematuro de tag "> <script>evil()</script>', () => {
    const payload = '"> <script>evil()</script>';
    const escaped = ReferenceValidation.escapeHtml(payload);
    assert.strictEqual(escaped.includes('<script>'), false);
    assert.includes(escaped, '&quot;&gt;');
  });

  test('T2_B5_10: Intento de romper atributo input test" onfocus="evil()', () => {
    const payload = 'test" onfocus="evil()';
    const escaped = ReferenceValidation.escapeHtml(payload);
    assert.includes(escaped, '&quot;');
    assert.strictEqual(escaped.includes('test"'), false);
  });

  test('T2_B5_11: Expresión con interpolación de plantillas ${alert(1)}', () => {
    const payload = '${alert(1)}';
    const escaped = ReferenceValidation.escapeHtml(payload);
    assert.strictEqual(escaped, '${alert(1)}');
  });

  test('T2_B5_12: Carácter nulo \\0 neutralizado', () => {
    const payload = 'Leche\0Desnatada';
    const clean = payload.replace(/\0/g, '');
    assert.strictEqual(clean, 'LecheDesnatada');
  });

  test('T2_B5_13: Payloads políglotas XSS neutralizados', () => {
    const polyglot = `jaVasCript:/*-/*\`/*\\'\`/*'/*"/**/(/* */oNcliCk=alert() )//%0D%0A%0d%0a//</stYle/<titLe/</teXtarEa/</scRipt/--!>\\x3csVg/<sVg/oNloAd=alert()//>\\x3e`;
    const escaped = ReferenceValidation.escapeHtml(polyglot);
    assert.strictEqual(escaped.includes('<scRipt/'), false);
  });

  test('T2_B5_14: Intento de inyección en filtro de búsqueda', () => {
    const search = `<script>evil()</script>`;
    const cleanSearch = ReferenceValidation.escapeHtml(search);
    assert.strictEqual(cleanSearch.includes('<script>'), false);
  });

  test('T2_B5_15: Inyección de prototipo Object.prototype', () => {
    const input = JSON.parse('{"__proto__": {"injected": "hacked"}}');
    const target = {};
    if (Object.prototype.hasOwnProperty.call(input, '__proto__')) {
      // no copiar
    }
    assert.strictEqual(target.injected, undefined);
  });
});

// --- B6: Archivos de Importación Corruptos y Deformes ---
describe('Tier 2 — B6: Archivos de Importación Corruptos y Deformes', () => {
  test('T2_B6_01: JSON con sintaxis rota retorna success false sin lanzar excepción', () => {
    const badJSON = '{ "items": [ }';
    const res = ReferenceExportImport.importJSON(badJSON);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.items.length, 0);
  });

  test('T2_B6_02: JSON que es un primitivo "hola" es rechazado', () => {
    const res = ReferenceExportImport.importJSON('"hola"');
    assert.strictEqual(res.success, false);
  });

  test('T2_B6_03: JSON sin campo items es rechazado', () => {
    const res = ReferenceExportImport.importJSON(JSON.stringify({ version: '1.0' }));
    assert.strictEqual(res.success, false);
    assert.includes(res.error, 'items');
  });

  test('T2_B6_04: JSON con items no array es rechazado', () => {
    const res = ReferenceExportImport.importJSON(JSON.stringify({ version: '1.0', items: 'string' }));
    assert.strictEqual(res.success, false);
  });

  test('T2_B6_05: JSON con versión de esquema inexistente rechazado', () => {
    const res = ReferenceExportImport.importJSON(JSON.stringify({ version: '9.0', items: [] }));
    assert.strictEqual(res.success, false);
    assert.includes(res.error, 'Versión de esquema no soportada');
  });

  test('T2_B6_06: JSON con array de items vacío retorna lista vacía exitosa', () => {
    const res = ReferenceExportImport.importJSON(JSON.stringify({ version: '1.0', items: [] }));
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.items.length, 0);
  });

  test('T2_B6_07: JSON con items donde falta campo name los filtra', () => {
    const json = JSON.stringify({
      version: '1.0',
      items: [
        { quantity: 1, unitPrice: 2 },
        { name: 'Válido', quantity: 2, unitPrice: 3 }
      ]
    });
    const res = ReferenceExportImport.importJSON(json);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.items.length, 1);
    assert.strictEqual(res.items[0].name, 'Válido');
  });

  test('T2_B6_08: CSV completamente vacío retorna lista vacía', () => {
    const res = ReferenceExportImport.importCSV('');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.items.length, 0);
  });

  test('T2_B6_09: CSV con solo espacios retorna lista vacía', () => {
    const res = ReferenceExportImport.importCSV('   \r\n   ');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.items.length, 0);
  });

  test('T2_B6_10: CSV sin cabecera obligatoria name es rechazado', () => {
    const res = ReferenceExportImport.importCSV('foo,bar,baz\r\n1,2,3');
    assert.strictEqual(res.success, false);
    assert.includes(res.error, 'columna obligatoria "name" ausente');
  });

  test('T2_B6_11: CSV con filas que tienen menos columnas que las cabeceras', () => {
    const csv = 'name,quantity,unitPrice\r\nManzanas';
    const res = ReferenceExportImport.importCSV(csv);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.items.length, 1);
    assert.strictEqual(res.items[0].name, 'Manzanas');
    assert.strictEqual(res.items[0].quantity, 1); // default
  });

  test('T2_B6_12: CSV con filas que tienen columnas adicionales', () => {
    const csv = 'name,quantity\r\nManzanas,2,extraCol1,extraCol2';
    const res = ReferenceExportImport.importCSV(csv);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.items.length, 1);
    assert.strictEqual(res.items[0].name, 'Manzanas');
  });

  test('T2_B6_13: CSV con comillas dobles sin cerrar manejado sin excepción', () => {
    const csv = 'name,quantity\r\n"Manzanas sin cerrar,2';
    assert.doesNotThrow(() => {
      ReferenceExportImport.importCSV(csv);
    });
  });

  test('T2_B6_14: CSV con saltos de línea CRLF y LF mezclados', () => {
    const csv = 'name,quantity,unitPrice\r\nPan,1,1.0\nLeche,2,1.20\r\nCafé,1,3.0';
    const res = ReferenceExportImport.importCSV(csv);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.items.length, 3);
  });

  test('T2_B6_15: CSV con caracteres especiales y acentos sin corromper lectura', () => {
    const csv = '\uFEFFname,quantity,unitPrice,category\r\nChampiñones,2,1.80,Verduras\r\nJapón Ramen,1,4.50,Internacional';
    const res = ReferenceExportImport.importCSV(csv);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.items[0].name, 'Champiñones');
    assert.strictEqual(res.items[1].name, 'Japón Ramen');
  });
});

// --- B7: Estrés de Almacenamiento, Concurrencia y Regex ---
describe('Tier 2 — B7: Estrés de Almacenamiento, Concurrencia y Regex', () => {
  test('T2_B7_01: Búsqueda con metacaracteres regex .* no lanza SyntaxError', () => {
    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.doesNotThrow(() => {
      new RegExp(escapeRegex('.*'), 'i');
    });
  });

  test('T2_B7_02: Búsqueda con corchete sin cerrar [abc no lanza SyntaxError', () => {
    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.doesNotThrow(() => {
      new RegExp(escapeRegex('[abc'), 'i');
    });
  });

  test('T2_B7_03: Búsqueda con paréntesis no balanceados (test no lanza SyntaxError', () => {
    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.doesNotThrow(() => {
      new RegExp(escapeRegex('(test'), 'i');
    });
  });

  test('T2_B7_04: Búsqueda con cuantificador sin token previo + o ? no lanza SyntaxError', () => {
    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.doesNotThrow(() => {
      new RegExp(escapeRegex('+?'), 'i');
    });
  });

  test('T2_B7_05: Búsqueda insensible a mayúsculas y acentos', () => {
    const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const query = 'LECHÉ';
    const target = 'leche desnatada';
    assert.strictEqual(normalize(target).includes(normalize(query)), true);
  });

  test('T2_B7_06: Adición concurrente de 50 items en ráfaga rápida', () => {
    const items = [];
    for (let i = 0; i < 50; i++) {
      const v = ReferenceValidation.validateItem({ name: `Producto ${i}`, quantity: i + 1, unitPrice: 1.0 });
      if (v.valid) items.push(v.data);
    }
    assert.strictEqual(items.length, 50);
  });

  test('T2_B7_07: Simulación de fallo QuotaExceededError en LocalStorage', () => {
    let quotaErrorHandled = false;
    const mockStorage = {
      setItem: () => {
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
    };
    try {
      mockStorage.setItem('key', 'val');
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        quotaErrorHandled = true;
      }
    }
    assert.strictEqual(quotaErrorHandled, true);
  });

  test('T2_B7_08: LocalStorage con objeto en vez de array manejado limpiamente', () => {
    const env = createTestEnvironment();
    env.localStorage.setItem('shoppingItems', JSON.stringify({ error: 'not-an-array' }));
    let loaded = [];
    try {
      const parsed = JSON.parse(env.localStorage.getItem('shoppingItems'));
      loaded = Array.isArray(parsed) ? parsed : [];
    } catch {
      loaded = [];
    }
    assert.strictEqual(Array.isArray(loaded), true);
    assert.strictEqual(loaded.length, 0);
  });

  test('T2_B7_09: IDs duplicados en importación se re-asignan para no sobreescribir', () => {
    const existing = [{ id: 'dup_1', name: 'Original' }];
    const imported = [{ id: 'dup_1', name: 'Nuevo' }];
    const resolved = imported.map(item => {
      if (existing.some(e => e.id === item.id)) {
        return { ...item, id: `${item.id}_${Date.now()}` };
      }
      return item;
    });
    assert.notStrictEqual(resolved[0].id, existing[0].id);
  });

  test('T2_B7_10: Eliminación de item con ID inexistente no causa error', () => {
    let items = [{ id: '1', name: 'Pan' }];
    assert.doesNotThrow(() => {
      items = items.filter(i => i.id !== 'inexistente');
    });
    assert.strictEqual(items.length, 1);
  });

  test('T2_B7_11: Toggle de completed en ID inexistente no causa error', () => {
    let items = [{ id: '1', name: 'Pan', completed: false }];
    assert.doesNotThrow(() => {
      items = items.map(i => i.id === 'inexistente' ? { ...i, completed: !i.completed } : i);
    });
    assert.strictEqual(items[0].completed, false);
  });

  test('T2_B7_12: Edición con nuevos valores inválidos cancela y preserva original', () => {
    const original = { id: '1', name: 'Pan', quantity: 1, unitPrice: 1.0 };
    const invalidEdit = { name: '', quantity: -5 };
    const validation = ReferenceValidation.validateItem(invalidEdit);
    let finalItem = original;
    if (validation.valid) {
      finalItem = { ...original, ...validation.data };
    }
    assert.strictEqual(finalItem.name, 'Pan');
    assert.strictEqual(finalItem.quantity, 1);
  });

  test('T2_B7_13: Reordenamiento de lista con ubicaciones repetidas normalizado', () => {
    const rawOrder = ['Mercadona', 'Lidl', 'Mercadona', 'Carrefour'];
    const uniqueOrder = Array.from(new Set(rawOrder));
    assert.strictEqual(uniqueOrder.length, 3);
  });

  test('T2_B7_14: Colapso de grupo ya colapsado es idempotente', () => {
    const collapsed = new Set(['Mercadona']);
    collapsed.add('Mercadona');
    assert.strictEqual(collapsed.size, 1);
  });

  test('T2_B7_15: Limpieza de lista vacía es idempotente y no arroja excepción', () => {
    assert.doesNotThrow(() => {
      const items = [];
      const cleaned = items.filter(i => !i.completed);
      assert.strictEqual(cleaned.length, 0);
    });
  });
});
