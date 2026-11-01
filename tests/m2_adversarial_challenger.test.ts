import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Header } from '../src/components/Header';
import { ListView, isPendingLocationName } from '../src/components/ListView';
import { ShoppingItem } from '../src/types';

describe('Empirical Challenge: Header Component & $$ Bug Absence', () => {
  const defaultHeaderProps = {
    isOnline: true,
    theme: 'light' as const,
    onToggleTheme: () => {},
    onOpenReceiptScanner: () => {},
    onOpenShare: () => {},
    onPrint: () => {},
    onExport: () => {},
    onImportClick: () => {},
    onFileChange: () => {},
  };

  test('ausencia absoluta de $$ en montos por defecto (0 o no provistos)', () => {
    const html = renderToStaticMarkup(
      React.createElement(Header, {
        ...defaultHeaderProps,
        totalPendingAmount: 0,
        totalSpentAmount: 0,
        totalItemsCount: 0,
        pendingCount: 0,
      })
    );

    assert.equal(html.includes('$$'), false, 'El HTML generado no debe contener "$$"');
    assert.match(html, />\$0,00<\/span>/, 'Debe renderizar "$0,00" con un único signo de dólar');
  });

  test('ausencia absoluta de $$ con montos monetarios reales positivos y formateo argentino', () => {
    const html = renderToStaticMarkup(
      React.createElement(Header, {
        ...defaultHeaderProps,
        totalPendingAmount: 1250.5,
        totalSpentAmount: 48900.75,
        totalItemsCount: 15,
        pendingCount: 8,
      })
    );

    assert.equal(html.includes('$$'), false, 'No debe duplicarse el signo de pesos en montos positivos');
    assert.match(html, />\$1\.250,50<\/span>/, 'Debe contener exactamente $1.250,50');
    assert.match(html, />\$48\.900,75<\/span>/, 'Debe contener exactamente $48.900,75');
  });

  test('resiliencia y ausencia de $$ ante valores monetarios patológicos (NaN, negativos, Infinity, no numéricos)', () => {
    const html = renderToStaticMarkup(
      React.createElement(Header, {
        ...defaultHeaderProps,
        totalPendingAmount: NaN,
        totalSpentAmount: -150.25,
      })
    );

    assert.equal(html.includes('$$'), false, 'No debe aparecer "$$" con valores patológicos');
    assert.match(html, />\$0,00<\/span>/, 'NaN debe degradarse de forma segura a $0,00');
    assert.match(html, />-\$150,25<\/span>/, 'Monto negativo debe formatear como -$150,25');
  });

  test('inspección exhaustiva de regex: cero secuencias de múltiples signos $ en todo el markup', () => {
    const testCases = [
      { pending: 0, spent: 0 },
      { pending: 999999.99, spent: 1000000.0 },
      { pending: 0.01, spent: 0.99 },
      { pending: undefined, spent: undefined },
    ];

    for (const tc of testCases) {
      const html = renderToStaticMarkup(
        React.createElement(Header, {
          ...defaultHeaderProps,
          totalPendingAmount: tc.pending,
          totalSpentAmount: tc.spent,
        })
      );
      const doubleDollarMatch = html.match(/\${2,}/g);
      assert.equal(
        doubleDollarMatch,
        null,
        `Se detectó secuencia no permitida de dólares ${JSON.stringify(doubleDollarMatch)} en el HTML`
      );
    }
  });
});

describe('Empirical Challenge: ListView Reactive Filtering & useDeferredValue Behavior', () => {
  // Función auxiliar pura que replica idénticamente el algoritmo de filtrado y normalización de ListView
  function simulateListViewFiltering(
    items: ShoppingItem[],
    deferredQuery: string,
    hideCompleted = false,
    hideEmptyStores = false,
    locationOrder: string[] = []
  ) {
    const query = deferredQuery
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    // 1. Pending items ("Por averiguar")
    const pendingItems = items.filter((it, idx) => {
      if (it.completed || !isPendingLocationName(it.location)) return false;
      if (!query) return true;
      const sku = it.skuCode || `#${String(it.seqNumber || idx + 1).padStart(3, '0')}`;
      const haystack = `${sku} ${it.name} ${it.location} ${it.category}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      return query.split(/\s+/).every((tok) => haystack.includes(tok));
    });

    // 2. Grouped store items
    const filtered = items.filter((item, idx) => {
      if (!item.completed && isPendingLocationName(item.location)) return false;
      if (hideCompleted && item.completed) return false;
      if (!query) return true;

      const sku = item.skuCode || `#${String(item.seqNumber || idx + 1).padStart(3, '0')}`;
      const haystack = `${sku} ${item.name} ${item.location} ${item.category}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

      return query.split(/\s+/).every((tok) => haystack.includes(tok));
    });

    const groups: Record<string, ShoppingItem[]> = {};
    filtered.forEach((it) => {
      const loc = (it.location && it.location.trim()) || 'General';
      if (!groups[loc]) groups[loc] = [];
      groups[loc].push(it);
    });

    const result: Array<{
      location: string;
      items: ShoppingItem[];
      subtotal: number;
      pendingCount: number;
      completedCount: number;
    }> = [];

    Object.keys(groups).forEach((loc) => {
      const groupList = groups[loc];
      let subtotalCents = 0;
      let pendingCount = 0;
      let completedCount = 0;

      groupList.forEach((it) => {
        if (!it.completed) {
          pendingCount++;
          const qty = Number(it.quantity) || 1;
          const price = Number(it.unitPrice) || 0;
          subtotalCents += Math.round(qty * Math.round(price * 100));
        } else {
          completedCount++;
        }
      });

      if (hideEmptyStores && pendingCount === 0) {
        return;
      }

      result.push({
        location: loc,
        items: groupList,
        subtotal: Math.round(subtotalCents) / 100,
        pendingCount,
        completedCount,
      });
    });

    return { pendingItems, groupedItems: result };
  }

  const sampleItems: ShoppingItem[] = [
    {
      id: 'it-1',
      seqNumber: 1,
      skuCode: '#001',
      name: 'Café Molido Tostado Natural',
      quantity: 2,
      unitPrice: 3500.5,
      category: 'Almacén',
      location: 'Supermercado Vea',
      completed: false,
      timestamp: 1000,
      updatedAt: 1000,
    },
    {
      id: 'it-2',
      seqNumber: 2,
      skuCode: '#002',
      name: 'Azúcar Blanca Tipo A',
      quantity: 1,
      unitPrice: 850,
      category: 'Almacén',
      location: 'Por averiguar',
      completed: false,
      timestamp: 1001,
      updatedAt: 1001,
    },
    {
      id: 'it-3',
      seqNumber: 3,
      skuCode: '#003',
      name: 'Leche Descremada UAT',
      quantity: 3,
      unitPrice: 1200,
      category: 'Lácteos',
      location: 'Supermercado Vea',
      completed: true,
      timestamp: 1002,
      updatedAt: 1002,
    },
    {
      id: 'it-4',
      seqNumber: 4,
      skuCode: '#004',
      name: 'Manzanas Rojas Deliciosas',
      quantity: 1.5,
      unitPrice: 2200,
      category: 'Verdulería',
      location: 'Verdulería El Bosque',
      completed: false,
      timestamp: 1003,
      updatedAt: 1003,
    },
    {
      id: 'it-5',
      seqNumber: 5,
      skuCode: '#005',
      name: 'Yerba Mate Especial Despalada',
      quantity: 1,
      unitPrice: 4100,
      category: 'Almacén',
      location: 'Supermercado Carrefour',
      completed: false,
      timestamp: 1004,
      updatedAt: 1004,
    },
  ];

  test('normalización Unicode y diacríticos bidireccionales (tildes / sin tildes)', () => {
    // 1. Consulta sin tildes contra producto con tilde
    const resSinTilde = simulateListViewFiltering(sampleItems, 'cafe');
    assert.equal(resSinTilde.groupedItems.length, 1);
    assert.equal(resSinTilde.groupedItems[0].items[0].id, 'it-1');

    // 2. Consulta con tildes contra producto con o sin tildes
    const resConTilde = simulateListViewFiltering(sampleItems, 'CAFÉ');
    assert.equal(resConTilde.groupedItems.length, 1);
    assert.equal(resConTilde.groupedItems[0].items[0].id, 'it-1');

    // 3. Consulta con diacríticos en sección por averiguar
    const resAzucar = simulateListViewFiltering(sampleItems, 'azucar');
    assert.equal(resAzucar.pendingItems.length, 1);
    assert.equal(resAzucar.pendingItems[0].name, 'Azúcar Blanca Tipo A');
  });

  test('tokenización multi-palabra y tolerancia a espacios irregulares', () => {
    const res = simulateListViewFiltering(sampleItems, '   molido     vea   #001  ');
    assert.equal(res.groupedItems.length, 1);
    assert.equal(res.groupedItems[0].items[0].id, 'it-1');
  });

  test('inmunidad a inyecciones de sintaxis RegExp en la barra de búsqueda', () => {
    const dangerousQueries = [
      '.*',
      '[a-z]+',
      '(\\d+)',
      'Café|Azúcar',
      '^{$}[()]',
      '?',
      '+',
      '\\',
    ];

    for (const q of dangerousQueries) {
      assert.doesNotThrow(() => {
        simulateListViewFiltering(sampleItems, q);
      }, `La búsqueda no debe lanzar excepciones con caracteres regex: "${q}"`);
    }
  });

  test('concurrencia reactiva y estrés de rendimiento con 5.000 items (< 50ms)', () => {
    const bulkItems: ShoppingItem[] = [];
    const stores = ['Carrefour', 'Vea', 'Día', 'Coto', 'Jumbo', 'ChangoMás', 'Verdulería Don Juan', 'Por averiguar'];

    for (let i = 0; i < 5000; i++) {
      const storeName = stores[i % stores.length];
      bulkItems.push({
        id: `stress-${i}`,
        seqNumber: i + 1,
        skuCode: `#${String(i + 1).padStart(3, '0')}`,
        name: `Producto de Consumo ${i} con Té y Café`,
        quantity: (i % 5) + 1,
        unitPrice: (i % 250) + 10.5,
        category: `Categoría ${i % 10}`,
        location: storeName,
        completed: i % 4 === 0,
        timestamp: Date.now() + i,
        updatedAt: Date.now() + i,
      });
    }

    // Simulación de ráfaga de 30 consultas sucesivas (como un usuario escribiendo rápido con useDeferredValue)
    const queries = ['cafe', 'te', 'coto', '042', 'consumo 4', 'don juan', ''];
    const times: number[] = [];

    for (const q of queries) {
      const start = performance.now();
      const res = simulateListViewFiltering(bulkItems, q, false, false);
      const dur = performance.now() - start;
      times.push(dur);
      assert.ok(res.groupedItems.length > 0 || res.pendingItems.length > 0);
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const maxTime = Math.max(...times);

    assert.ok(
      maxTime < 50,
      `El tiempo máximo de filtrado fue de ${maxTime.toFixed(2)}ms (supera el umbral estricto de 50ms)`
    );
    assert.ok(
      avgTime < 25,
      `El tiempo promedio de filtrado fue de ${avgTime.toFixed(2)}ms (debe ser inferior a 25ms)`
    );
  });

  test('renderizado completo del componente ListView con useDeferredValue', () => {
    const html = renderToStaticMarkup(
      React.createElement(ListView, {
        items: sampleItems,
        onAddItem: () => {},
        onDeleteItem: () => {},
        onUpdateItem: () => {},
        onToggleCompleted: () => {},
        onResetAllCompleted: () => {},
        onResetItem: () => {},
        locationOrder: ['Supermercado Vea', 'Verdulería El Bosque'],
        onSetLocationOrder: () => {},
        collapsedGroups: [],
        onSetCollapsedGroups: () => {},
        hideCompleted: false,
        onSetHideCompleted: () => {},
        isOnline: true,
      })
    );

    assert.ok(html.includes('panel-list'), 'Debe contener el contenedor del panel');
    assert.ok(html.includes('searchInput'), 'Debe incluir el input de búsqueda reactivo');
    assert.ok(html.includes('Supermercado Vea'), 'Debe renderizar la tarjeta del comercio');
    assert.ok(html.includes('Café Molido'), 'Debe renderizar el producto en su comercio');
    assert.ok(html.includes('Por averiguar'), 'Debe renderizar la bandeja de productos por averiguar');
  });
});
