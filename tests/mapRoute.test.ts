import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineDistance,
  calculateUrbanDistance,
  calculateEstimatedMinutes,
  generateGoogleMapsUrl,
  calculateOptimalRoute,
} from '../src/utils/mapRoute';
import { DEFAULT_ORIGIN, saveStoreCoordinate } from '../src/utils/storage';
import { ShoppingItem, RouteOrigin, RouteStop } from '../src/types';

describe('mapRoute utility suite', () => {
  const origin: RouteOrigin = {
    lat: -27.469213,
    lng: -58.830635,
    address: 'Plaza 25 de Mayo, Corrientes, Argentina',
    type: 'default',
    accuracy: null,
  };

  describe('haversineDistance', () => {
    it('retorna 0 para el mismo punto geográfico o puntos nulos', () => {
      assert.strictEqual(haversineDistance(origin, origin), 0);
      assert.strictEqual(haversineDistance({ lat: -27.5, lng: -58.8 }, { lat: -27.5, lng: -58.8 }), 0);
      assert.strictEqual(haversineDistance(null as unknown as { lat: number; lng: number }, origin), 0);
      assert.strictEqual(haversineDistance({ lat: NaN, lng: 0 }, origin), 0);
    });

    it('calcula con precisión la distancia esférica entre dos puntos conocidos', () => {
      // Coordenadas entre Corrientes (-27.469213, -58.830635) y Resistencia (-27.451389, -58.986667): aprox 15.5 km
      const resistencia = { lat: -27.451389, lng: -58.986667 };
      const dist = haversineDistance(origin, resistencia);
      assert.ok(dist > 14 && dist < 17, `Distancia esperada ~15.5 km, obtenida: ${dist}`);
    });
  });

  describe('calculateUrbanDistance & calculateEstimatedMinutes', () => {
    it('aplica el factor de circuidad urbana (1.25 por defecto)', () => {
      const haversineKm = 10;
      const urbanKm = calculateUrbanDistance(haversineKm);
      assert.strictEqual(urbanKm, 12.5);

      assert.strictEqual(calculateUrbanDistance(0), 0);
      assert.strictEqual(calculateUrbanDistance(-5), 0);
      assert.strictEqual(calculateUrbanDistance(NaN), 0);
    });

    it('calcula el tiempo de viaje estimado a 30 km/h con mínimo de 1 minuto', () => {
      // A 30 km/h: 15 km = 30 minutos
      assert.strictEqual(calculateEstimatedMinutes(15), 30);
      // Menos de 0.5 km debe dar mínimo 1 minuto
      assert.strictEqual(calculateEstimatedMinutes(0.2), 1);
      // 0 km devuelve 0 minutos
      assert.strictEqual(calculateEstimatedMinutes(0), 0);
    });
  });

  describe('generateGoogleMapsUrl', () => {
    it('retorna cadena vacía si no hay paradas o el origen es inválido', () => {
      assert.strictEqual(generateGoogleMapsUrl(origin, []), '');
      assert.strictEqual(
        generateGoogleMapsUrl({ lat: NaN, lng: NaN, address: '', type: 'default', accuracy: null }, []),
        ''
      );
    });

    it('genera URL simple para 1 única parada de destino', () => {
      const stops: RouteStop[] = [
        {
          storeName: 'Carrefour',
          lat: -27.465,
          lng: -58.825,
          address: 'Av. Ferré 2000',
          pendingItems: [],
          itemCount: 2,
          estimatedTotal: 5000,
        },
      ];
      const url = generateGoogleMapsUrl(origin, stops);
      assert.ok(url.includes('destination=-27.465%2C-58.825'));
      assert.ok(url.includes('origin=-27.469213%2C-58.830635'));
      assert.ok(!url.includes('waypoints='));
    });

    it('genera URL con waypoints intermedias para múltiples paradas', () => {
      const stops: RouteStop[] = [
        { storeName: 'Parada 1', lat: -27.461, lng: -58.821, address: 'Dir 1', pendingItems: [], itemCount: 1, estimatedTotal: 100 },
        { storeName: 'Parada 2', lat: -27.462, lng: -58.822, address: 'Dir 2', pendingItems: [], itemCount: 1, estimatedTotal: 200 },
        { storeName: 'Destino', lat: -27.463, lng: -58.823, address: 'Dir 3', pendingItems: [], itemCount: 1, estimatedTotal: 300 },
      ];
      const url = generateGoogleMapsUrl(origin, stops);
      assert.ok(url.includes('origin='));
      assert.ok(url.includes('destination=-27.463%2C-58.823'));
      assert.ok(url.includes('waypoints='));
      assert.ok(url.includes('%7C') || url.includes('|')); // Separador pipe
    });
  });

  describe('calculateOptimalRoute', () => {
    it('retorna resultado vacío ante lista de items vacía', () => {
      const route = calculateOptimalRoute([], origin);
      assert.strictEqual(route.orderedStops.length, 0);
      assert.strictEqual(route.totalDistanceKm, 0);
      assert.strictEqual(route.estimatedDurationMinutes, 0);
      assert.strictEqual(route.isCustomOrder, false);
    });

    it('excluye comercios "Por averiguar" o "Sin asignar" a menos que estén completados', () => {
      const items: ShoppingItem[] = [
        {
          id: '1',
          name: 'Item Sin Asignar',
          quantity: 1,
          unitPrice: 100,
          location: 'Por averiguar',
          category: 'General',
          completed: false,
          timestamp: 1,
          updatedAt: 1,
        },
        {
          id: '2',
          name: 'Item Real',
          quantity: 1,
          unitPrice: 200,
          location: 'Supermercado Impulso',
          category: 'General',
          completed: false,
          timestamp: 2,
          updatedAt: 2,
        },
      ];

      const route = calculateOptimalRoute(items, origin);
      assert.strictEqual(route.orderedStops.length, 1);
      assert.strictEqual(route.orderedStops[0].storeName, 'Supermercado Impulso');
    });

    it('calcula dispersión determinista offline y resuelve ruta TSP priorizando tiendas con pendientes', () => {
      const items: ShoppingItem[] = [
        {
          id: '1',
          name: 'Arroz',
          quantity: 2,
          unitPrice: 1000,
          location: 'Comercio A',
          category: 'Despensa',
          completed: false, // pendiente
          timestamp: 1,
          updatedAt: 1,
        },
        {
          id: '2',
          name: 'Carne',
          quantity: 1,
          unitPrice: 5000,
          location: 'Comercio B',
          category: 'Carnes',
          completed: false, // pendiente
          timestamp: 2,
          updatedAt: 2,
        },
        {
          id: '3',
          name: 'Pan',
          quantity: 1,
          unitPrice: 500,
          location: 'Comercio C',
          category: 'Panadería',
          completed: true, // completado (0 pendientes)
          timestamp: 3,
          updatedAt: 3,
        },
      ];

      const route = calculateOptimalRoute(items, origin);
      assert.strictEqual(route.orderedStops.length, 3);
      assert.strictEqual(route.isCustomOrder, false);

      // Los comercios con pendientes (A y B) deben preceder a los comercios sin pendientes (C)
      assert.strictEqual(route.orderedStops[0].hasPending, true);
      assert.strictEqual(route.orderedStops[1].hasPending, true);
      assert.strictEqual(route.orderedStops[2].storeName, 'Comercio C');
      assert.strictEqual(route.orderedStops[2].hasPending, false);

      // Verificación de pasos y distancias
      assert.strictEqual(route.orderedStops[0].stepIndex, 1);
      assert.strictEqual(route.orderedStops[1].stepIndex, 2);
      assert.strictEqual(route.orderedStops[2].stepIndex, 3);
      assert.ok(route.totalDistanceKm > 0);
      assert.ok(route.totalUrbanDistanceKm >= route.totalDistanceKm);
      assert.ok(route.estimatedDurationMinutes > 0);
    });

    it('respeta el orden manual de paradas (customStopOrder)', () => {
      const items: ShoppingItem[] = [
        { id: '1', name: 'Item 1', quantity: 1, unitPrice: 10, location: 'Tienda Alpha', category: 'C', completed: false, timestamp: 1, updatedAt: 1 },
        { id: '2', name: 'Item 2', quantity: 1, unitPrice: 20, location: 'Tienda Beta', category: 'C', completed: false, timestamp: 2, updatedAt: 2 },
      ];

      const route = calculateOptimalRoute(items, origin, {
        customStopOrder: ['Tienda Beta', 'Tienda Alpha'],
      });

      assert.strictEqual(route.isCustomOrder, true);
      assert.strictEqual(route.orderedStops.length, 2);
      assert.strictEqual(route.orderedStops[0].storeName, 'Tienda Beta');
      assert.strictEqual(route.orderedStops[1].storeName, 'Tienda Alpha');
    });

    it('filtra paradas según comercios incluidos (includedStores)', () => {
      const items: ShoppingItem[] = [
        { id: '1', name: 'Item 1', quantity: 1, unitPrice: 10, location: 'Tienda 1', category: 'C', completed: false, timestamp: 1, updatedAt: 1 },
        { id: '2', name: 'Item 2', quantity: 1, unitPrice: 20, location: 'Tienda 2', category: 'C', completed: false, timestamp: 2, updatedAt: 2 },
      ];

      const route = calculateOptimalRoute(items, origin, {
        includedStores: ['Tienda 2'],
      });

      assert.strictEqual(route.orderedStops.length, 1);
      assert.strictEqual(route.orderedStops[0].storeName, 'Tienda 2');
    });
  });
});
