import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  exportJSON,
  importJSON,
  exportCSV,
  importCSV,
} from '../src/utils/exportImport';
import { ShoppingItem } from '../src/types';

describe('exportImport utility suite', () => {
  const sampleItems: ShoppingItem[] = [
    {
      id: 'prod_1',
      seqNumber: 1,
      skuCode: '#001',
      name: 'Yerba Mate Playadito 1kg',
      quantity: 2,
      unitPrice: 3200,
      category: 'Despensa',
      location: 'Supermercado Impulso',
      completed: false,
      timestamp: 1700000000000,
      updatedAt: 1700000000000,
    },
    {
      id: 'prod_2',
      seqNumber: 2,
      skuCode: '#002',
      name: 'Café Torrado "La Morenita", Molido',
      quantity: 1,
      unitPrice: 2850.5,
      category: 'Despensa',
      location: 'Carrefour Express',
      completed: true,
      timestamp: 1700000100000,
      updatedAt: 1700000100000,
    },
  ];

  describe('JSON Export & Import', () => {
    it('exporta JSON con esquema v1.0, metadatos y SKUs secuenciales', () => {
      const exported = exportJSON(sampleItems, 15000);
      assert.ok(typeof exported === 'string');

      const parsed = JSON.parse(exported);
      assert.strictEqual(parsed.version, '1.0');
      assert.strictEqual(parsed.budget, 15000);
      assert.ok(parsed.exportedAt);
      assert.strictEqual(parsed.items.length, 2);
      assert.strictEqual(parsed.items[0].skuCode, '#001');
      assert.strictEqual(parsed.items[1].skuCode, '#002');
      assert.strictEqual(parsed.items[1].completed, true);
    });

    it('importa exitosamente el JSON exportado manteniendo integridad de datos', () => {
      const exported = exportJSON(sampleItems, 20000);
      const imported = importJSON(exported);

      assert.strictEqual(imported.success, true);
      assert.strictEqual(imported.budget, 20000);
      assert.strictEqual(imported.items.length, 2);
      assert.strictEqual(imported.items[0].name, 'Yerba Mate Playadito 1kg');
      assert.strictEqual(imported.items[0].quantity, 2);
      assert.strictEqual(imported.items[1].name, 'Café Torrado "La Morenita", Molido');
      assert.strictEqual(imported.items[1].unitPrice, 2850.5);
      assert.strictEqual(imported.items[1].completed, true);
    });

    it('rechaza archivos JSON con versiones de esquema incompatibles', () => {
      const invalidVersionJson = JSON.stringify({
        version: '2.0',
        budget: 5000,
        items: [],
      });
      const result = importJSON(invalidVersionJson);
      assert.strictEqual(result.success, false);
      assert.match(result.error || '', /Versión de esquema no soportada/);
    });

    it('rechaza JSON malformado o sin lista de items', () => {
      const malformedResult = importJSON('{ esto no es json válido }');
      assert.strictEqual(malformedResult.success, false);
      assert.ok(malformedResult.error);

      const noItemsResult = importJSON(JSON.stringify({ version: '1.0', budget: 100 }));
      assert.strictEqual(noItemsResult.success, false);
      assert.match(noItemsResult.error || '', /El campo "items" debe ser una lista/);
    });
  });

  describe('CSV Export & Import', () => {
    it('exporta CSV con cabeceras requeridas, BOM UTF-8 y escapado de caracteres especiales', () => {
      const csv = exportCSV(sampleItems);
      // Debe comenzar con UTF-8 BOM \uFEFF
      assert.strictEqual(csv.charCodeAt(0), 0xfeff);

      // Verificación de cabeceras
      assert.ok(csv.includes('id,skuCode,name,quantity,unitPrice,category,location,completed,timestamp'));

      // El nombre con comillas y comas debe estar escapado con comillas dobles
      assert.ok(csv.includes('"Café Torrado ""La Morenita"", Molido"'));
    });

    it('importa exitosamente CSV exportado con BOM UTF-8 y preserva campos', () => {
      const csv = exportCSV(sampleItems);
      const imported = importCSV(csv);

      assert.strictEqual(imported.success, true);
      assert.strictEqual(imported.items.length, 2);
      assert.strictEqual(imported.items[0].name, 'Yerba Mate Playadito 1kg');
      assert.strictEqual(imported.items[0].quantity, 2);
      assert.strictEqual(imported.items[0].completed, false);
      assert.strictEqual(imported.items[1].name, 'Café Torrado "La Morenita", Molido');
      assert.strictEqual(imported.items[1].completed, true);
      assert.strictEqual(imported.items[1].unitPrice, 2850.5);
    });

    it('importa correctamente CSV con celdas multilínea que contienen saltos de línea dentro de comillas', () => {
      const multilineCSV =
        'id,skuCode,name,quantity,unitPrice,category,location,completed,timestamp\r\n' +
        'it_1,#001,"Producto con\r\nsalto de línea",1,500,Despensa,Super,false,1700000000000';

      const imported = importCSV(multilineCSV);
      assert.strictEqual(imported.success, true);
      assert.strictEqual(imported.items.length, 1);
      assert.strictEqual(imported.items[0].name, 'Producto con\r\nsalto de línea');
      assert.strictEqual(imported.items[0].unitPrice, 500);
    });

    it('interpreta variantes booleanas de completitud (true, 1, yes)', () => {
      const boolCSV =
        'id,skuCode,name,quantity,unitPrice,category,location,completed,timestamp\r\n' +
        '1,#001,Item 1,1,10,Cat,Loc,true,100\r\n' +
        '2,#002,Item 2,1,10,Cat,Loc,1,100\r\n' +
        '3,#003,Item 3,1,10,Cat,Loc,yes,100\r\n' +
        '4,#004,Item 4,1,10,Cat,Loc,false,100\r\n' +
        '5,#005,Item 5,1,10,Cat,Loc,0,100';

      const imported = importCSV(boolCSV);
      assert.strictEqual(imported.success, true);
      assert.strictEqual(imported.items.length, 5);
      assert.strictEqual(imported.items[0].completed, true);
      assert.strictEqual(imported.items[1].completed, true);
      assert.strictEqual(imported.items[2].completed, true);
      assert.strictEqual(imported.items[3].completed, false);
      assert.strictEqual(imported.items[4].completed, false);
    });

    it('falla con mensaje descriptivo si el CSV tiene menos de 2 líneas o cabeceras incompatibles', () => {
      const emptyResult = importCSV('');
      assert.strictEqual(emptyResult.success, false);
      assert.match(emptyResult.error || '', /El archivo CSV debe tener al menos una cabecera/);

      const invalidHeadersCSV = 'col1,col2\r\nval1,val2';
      const headerResult = importCSV(invalidHeadersCSV);
      assert.strictEqual(headerResult.success, false);
      assert.match(headerResult.error || '', /Cabeceras CSV incompatibles/);
    });
  });
});
