import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ORIGIN,
  DEFAULT_TRIP,
  formatSkuCode,
  parseSeqFromSku,
  ensureSequentialSkus,
  getNextSequentialSku,
  sanitizeShoppingItem,
  loadStoredItems,
  saveStoredItems,
  loadStoredBudget,
  saveStoredBudget,
  loadStoredTheme,
  saveStoredTheme,
  loadStoredLayout,
  saveStoredLayout,
  loadStoredHideEmptyStores,
  saveStoredHideEmptyStores,
  loadStoredLocationOrder,
  saveStoredLocationOrder,
  loadStoredCollapsedGroups,
  saveStoredCollapsedGroups,
  normalizeStoreKey,
  loadStoredCoordinates,
  saveStoreCoordinate,
  removeStoreCoordinate,
  loadStoredOrigin,
  saveStoredOrigin,
  loadStoredTripsData,
  saveStoredTripsData,
  loadStoredReceipts,
  saveStoredReceipts,
} from '../src/utils/storage';
import { ShoppingItem, RouteOrigin, TripsData } from '../src/types';

describe('storage utility suite', () => {
  describe('formatSkuCode & parseSeqFromSku', () => {
    it('formatea números de secuencia con prefijo # y relleno a 3 dígitos', () => {
      assert.strictEqual(formatSkuCode(1), '#001');
      assert.strictEqual(formatSkuCode(42), '#042');
      assert.strictEqual(formatSkuCode(999), '#999');
      assert.strictEqual(formatSkuCode(1050), '#1050');
    });

    it('restringe números inválidos, nulos o negativos a un mínimo de 1', () => {
      assert.strictEqual(formatSkuCode(0), '#001');
      assert.strictEqual(formatSkuCode(-5), '#001');
      assert.strictEqual(formatSkuCode(NaN), '#001');
      assert.strictEqual(formatSkuCode(3.7), '#003');
    });

    it('parsea secuencias numéricas y códigos SKU con formato variado', () => {
      assert.strictEqual(parseSeqFromSku(undefined, 5), 5);
      assert.strictEqual(parseSeqFromSku('#042'), 42);
      assert.strictEqual(parseSeqFromSku('#001'), 1);
      assert.strictEqual(parseSeqFromSku('007'), 7);
      assert.strictEqual(parseSeqFromSku('#999'), 999);
      assert.strictEqual(parseSeqFromSku(''), null);
      assert.strictEqual(parseSeqFromSku('invalido'), null);
      assert.strictEqual(parseSeqFromSku(null, null), null);
    });
  });

  describe('ensureSequentialSkus', () => {
    it('retorna array vacío ante entrada nula o vacía', () => {
      assert.deepStrictEqual(ensureSequentialSkus([]), []);
    });

    it('preserva seqNumbers válidos y no duplicados', () => {
      const items: ShoppingItem[] = [
        { id: '1', name: 'Leche', quantity: 1, unitPrice: 100, location: 'Super', category: 'Lácteos', completed: false, timestamp: 100, updatedAt: 100, seqNumber: 1, skuCode: '#001' },
        { id: '2', name: 'Pan', quantity: 2, unitPrice: 50, location: 'Super', category: 'Panadería', completed: false, timestamp: 200, updatedAt: 200, seqNumber: 2, skuCode: '#002' },
      ];
      const result = ensureSequentialSkus(items);
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].seqNumber, 1);
      assert.strictEqual(result[0].skuCode, '#001');
      assert.strictEqual(result[1].seqNumber, 2);
      assert.strictEqual(result[1].skuCode, '#002');
    });

    it('reasigna secuenciales a items con números duplicados o ausentes cronológicamente', () => {
      const items: ShoppingItem[] = [
        { id: '1', name: 'Yerba', quantity: 1, unitPrice: 200, location: 'Super', category: 'Despensa', completed: false, timestamp: 300, updatedAt: 300, seqNumber: 1, skuCode: '#001' },
        { id: '2', name: 'Azúcar', quantity: 1, unitPrice: 150, location: 'Super', category: 'Despensa', completed: false, timestamp: 100, updatedAt: 100, seqNumber: 1, skuCode: '#001' }, // Duplicado
        { id: '3', name: 'Café', quantity: 1, unitPrice: 300, location: 'Super', category: 'Despensa', completed: false, timestamp: 200, updatedAt: 200 }, // Sin sku
      ];

      const result = ensureSequentialSkus(items);
      assert.strictEqual(result.length, 3);
      // El primero retiene #001
      assert.strictEqual(result[0].seqNumber, 1);
      assert.strictEqual(result[0].skuCode, '#001');
      // Los no asignados se ordenan por timestamp: Azúcar (timestamp 100) recibe #002, Café (timestamp 200) recibe #003
      assert.strictEqual(result[1].seqNumber, 2);
      assert.strictEqual(result[1].skuCode, '#002');
      assert.strictEqual(result[2].seqNumber, 3);
      assert.strictEqual(result[2].skuCode, '#003');
    });
  });

  describe('getNextSequentialSku', () => {
    it('calcula el siguiente SKU basándose en el máximo existente', () => {
      const items: ShoppingItem[] = [
        { id: '1', name: 'Item 1', quantity: 1, unitPrice: 10, location: 'A', category: 'C', completed: false, timestamp: 1, updatedAt: 1, seqNumber: 5, skuCode: '#005' },
      ];
      const next = getNextSequentialSku(items);
      assert.strictEqual(next.seqNumber, 6);
      assert.strictEqual(next.skuCode, '#006');
    });

    it('devuelve #001 para lista vacía', () => {
      const next = getNextSequentialSku([]);
      assert.strictEqual(next.seqNumber, 1);
      assert.strictEqual(next.skuCode, '#001');
    });
  });

  describe('sanitizeShoppingItem', () => {
    it('retorna null para entradas nulas o no objetos', () => {
      assert.strictEqual(sanitizeShoppingItem(null), null);
      assert.strictEqual(sanitizeShoppingItem(undefined), null);
      assert.strictEqual(sanitizeShoppingItem('string'), null);
      assert.strictEqual(sanitizeShoppingItem(123), null);
    });

    it('retorna null si el nombre está vacío', () => {
      assert.strictEqual(sanitizeShoppingItem({ name: '' }), null);
      assert.strictEqual(sanitizeShoppingItem({ name: '   ' }), null);
    });

    it('sanitiza un objeto válido con defaults robustos', () => {
      const sanitized = sanitizeShoppingItem({
        name: '  Arroz 1kg  ',
        quantity: '2,5',
        unitPrice: '150,75',
        completed: 'true',
      });

      assert.ok(sanitized);
      assert.strictEqual(sanitized?.name, 'Arroz 1kg');
      assert.strictEqual(sanitized?.quantity, 2.5);
      assert.strictEqual(sanitized?.unitPrice, 150.75);
      assert.strictEqual(sanitized?.location, 'General');
      assert.strictEqual(sanitized?.category, 'General');
      assert.strictEqual(sanitized?.completed, true);
      assert.ok(sanitized?.id.startsWith('item_'));
    });

    it('corrige precios negativos a 0 y cantidades menores o iguales a cero a 1', () => {
      const sanitized = sanitizeShoppingItem({
        name: 'Aceite',
        quantity: -2,
        unitPrice: -50,
      });

      assert.ok(sanitized);
      assert.strictEqual(sanitized?.quantity, 1);
      assert.strictEqual(sanitized?.unitPrice, 0);
    });

    it('parsea coordenadas de tienda válidas e ignora coordenadas inválidas', () => {
      const withCoords = sanitizeShoppingItem({
        name: 'Carne',
        storeCoords: { lat: -27.469, lng: -58.83 },
      });
      assert.deepStrictEqual(withCoords?.storeCoords, { lat: -27.469, lng: -58.83 });

      const withBadCoords = sanitizeShoppingItem({
        name: 'Carne',
        storeCoords: { lat: 'invalido', lng: null },
      });
      assert.strictEqual(withBadCoords?.storeCoords, undefined);
    });
  });

  describe('persistencia de Items, Presupuesto, Tema y Layout', () => {
    it('guarda y recupera items con normalización y deduplicación de IDs', () => {
      const items: ShoppingItem[] = [
        { id: 'item_1', name: 'Manzanas', quantity: 2, unitPrice: 50, location: 'Verdulería', category: 'Frutas', completed: false, timestamp: 100, updatedAt: 100 },
        { id: 'item_1', name: 'Naranjas', quantity: 3, unitPrice: 40, location: 'Verdulería', category: 'Frutas', completed: true, timestamp: 200, updatedAt: 200 }, // ID duplicado
      ];

      saveStoredItems(items);
      const loaded = loadStoredItems();

      assert.strictEqual(loaded.length, 2);
      assert.strictEqual(loaded[0].id, 'item_1');
      assert.strictEqual(loaded[1].id, 'item_1_1'); // Deduplicado
      assert.strictEqual(loaded[0].skuCode, '#001');
      assert.strictEqual(loaded[1].skuCode, '#002');
    });

    it('persiste y recupera el presupuesto financiero', () => {
      saveStoredBudget(15000);
      assert.strictEqual(loadStoredBudget(), 15000);

      saveStoredBudget(-500); // Negativo
      assert.strictEqual(loadStoredBudget(), 0);
    });

    it('persiste y recupera preferencias de tema y vista', () => {
      saveStoredTheme('dark');
      assert.strictEqual(loadStoredTheme(), 'dark');

      saveStoredTheme('light');
      assert.strictEqual(loadStoredTheme(), 'light');

      saveStoredLayout('grid');
      assert.strictEqual(loadStoredLayout(), 'grid');

      saveStoredLayout('list');
      assert.strictEqual(loadStoredLayout(), 'list');

      saveStoredHideEmptyStores(true);
      assert.strictEqual(loadStoredHideEmptyStores(), true);

      saveStoredHideEmptyStores(false);
      assert.strictEqual(loadStoredHideEmptyStores(), false);
    });
  });

  describe('coordenadas de comercios y origen de ruta', () => {
    it('normaliza nombres de comercios removiendo acentos y convirtiendo a minúsculas', () => {
      assert.strictEqual(normalizeStoreKey('Súper Álzaga'), 'super alzaga');
      assert.strictEqual(normalizeStoreKey('  Hipermercado CARREFOUR  '), 'hipermercado carrefour');
      assert.strictEqual(normalizeStoreKey('Ñandú & Cía.'), 'nandu & cia.');
      assert.strictEqual(normalizeStoreKey(''), '');
    });

    it('almacena, recupera y elimina coordenadas de tiendas', () => {
      const coord = { lat: -27.47, lng: -58.83, displayName: 'Comercio Test' };
      saveStoreCoordinate('Supermercado Impulso', coord);

      const all = loadStoredCoordinates();
      const key = normalizeStoreKey('Supermercado Impulso');
      assert.ok(all[key]);
      assert.strictEqual(all[key].lat, -27.47);
      assert.strictEqual(all[key].displayName, 'Comercio Test');

      removeStoreCoordinate('Supermercado Impulso');
      const updated = loadStoredCoordinates();
      assert.strictEqual(updated[key], undefined);
    });

    it('persiste origen de ruta y migra automáticamente coordenadas heredadas de Madrid a Corrientes', () => {
      const origin: RouteOrigin = {
        lat: -27.4692,
        lng: -58.8306,
        address: 'Corrientes Capital',
        type: 'gps',
        accuracy: 15,
      };
      saveStoredOrigin(origin);
      const loaded = loadStoredOrigin();
      assert.strictEqual(loaded.address, 'Corrientes Capital');
      assert.strictEqual(loaded.type, 'gps');

      // Prueba de migración de Madrid
      const legacyMadridOrigin: RouteOrigin = {
        lat: 40.416775,
        lng: -3.70379,
        address: 'Puerta del Sol, Madrid, España',
        type: 'default',
        accuracy: null,
      };
      saveStoredOrigin(legacyMadridOrigin);
      const migrated = loadStoredOrigin();
      assert.strictEqual(migrated.lat, DEFAULT_ORIGIN.lat);
      assert.strictEqual(migrated.lng, DEFAULT_ORIGIN.lng);
      assert.ok(migrated.address.includes('Corrientes'));
    });
  });

  describe('gestor de viajes (trips) y recibos', () => {
    it('devuelve viaje predeterminado cuando no hay viajes almacenados', () => {
      const tripsData = loadStoredTripsData();
      assert.strictEqual(tripsData.activeTripId, DEFAULT_TRIP.id);
      assert.strictEqual(tripsData.trips.length, 1);
      assert.strictEqual(tripsData.trips[0].name, 'Viaje 1');
    });

    it('persiste y recupera viajes con sanitización', () => {
      const customTrips: TripsData = {
        activeTripId: 'trip_2',
        trips: [
          { id: 'trip_1', name: 'Supermercado Mensual', includedStores: ['Super A'], customOrder: null },
          { id: 'trip_2', name: 'Verdulería Express', includedStores: ['Verdulería'], customOrder: ['Verdulería'] },
        ],
      };
      saveStoredTripsData(customTrips);
      const loaded = loadStoredTripsData();
      assert.strictEqual(loaded.activeTripId, 'trip_2');
      assert.strictEqual(loaded.trips.length, 2);
      assert.strictEqual(loaded.trips[1].name, 'Verdulería Express');
    });

    it('persiste historial de recibos escaneados', () => {
      saveStoredReceipts([
        {
          id: 'rec_1',
          storeName: 'Carrefour',
          date: '01/11/2026',
          total: 12500,
          createdAt: Date.now(),
          items: [
            { name: 'Arroz', quantity: 2, unitPrice: 1500, lineTotal: 3000, category: 'Despensa' },
          ],
        },
      ]);
      const receipts = loadStoredReceipts();
      assert.strictEqual(receipts.length, 1);
      assert.strictEqual(receipts[0].storeName, 'Carrefour');
      assert.strictEqual(receipts[0].total, 12500);
    });
  });

  describe('resiliencia de almacenamiento ante errores (in-memory fallback)', () => {
    it('persiste y recupera correctamente datos en memoria cuando no hay window/localStorage', () => {
      saveStoredLocationOrder(['Supermercado', 'Verdulería', 'Farmacia']);
      const order = loadStoredLocationOrder();
      assert.deepStrictEqual(order, ['Supermercado', 'Verdulería', 'Farmacia']);

      saveStoredCollapsedGroups(['Supermercado']);
      const collapsed = loadStoredCollapsedGroups();
      assert.deepStrictEqual(collapsed, ['Supermercado']);
    });
  });
});
