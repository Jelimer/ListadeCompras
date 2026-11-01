import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCurrency,
  formatMoney,
  formatNumber,
  parseLocaleNumber,
} from '../src/utils/formatters';

describe('formatters utility suite', () => {
  describe('formatMoney', () => {
    it('formatea números positivos con formato monetario argentino', () => {
      const result = formatMoney(1250.5);
      // Formato es-AR usa punto para miles y coma para decimales
      assert.match(result, /^\$1[.,]250[.,]50$/);
      assert.ok(result.startsWith('$'));
    });

    it('formatea números enteros agregando dos decimales', () => {
      const result = formatMoney(100);
      assert.match(result, /^\$100[.,]00$/);
    });

    it('formatea números negativos anteponiendo el signo menos antes del símbolo $', () => {
      const result = formatMoney(-450.75);
      assert.ok(result.startsWith('-$'));
      assert.match(result, /^-\$450[.,]75$/);
    });

    it('retorna $0,00 ante 0, valores nulos, indefinidos o NaN', () => {
      assert.match(formatMoney(0), /^\$0[.,]00$/);
      assert.match(formatMoney(null), /^\$0[.,]00$/);
      assert.match(formatMoney(undefined), /^\$0[.,]00$/);
      assert.match(formatMoney(NaN), /^\$0[.,]00$/);
      assert.match(formatMoney('invalido'), /^\$0[.,]00$/);
      assert.match(formatMoney(Infinity), /^\$0[.,]00$/);
    });

    it('acepta números como strings válidos', () => {
      const result = formatMoney('2500');
      assert.match(result, /^\$2[.,]500[.,]00$/);
    });
  });

  describe('formatCurrency', () => {
    it('formatea números sin el símbolo $ con 2 decimales', () => {
      const result = formatCurrency(1250.5);
      assert.match(result, /^1[.,]250[.,]50$/);
      assert.ok(!result.includes('$'));
    });

    it('retorna 0,00 ante valores no numéricos o vacíos', () => {
      assert.match(formatCurrency(null), /^0[.,]00$/);
      assert.match(formatCurrency(undefined), /^0[.,]00$/);
      assert.match(formatCurrency(NaN), /^0[.,]00$/);
    });
  });

  describe('formatNumber', () => {
    it('formatea cantidades enteras sin decimales por defecto', () => {
      const result = formatNumber(1500);
      assert.match(result, /^1[.,]500$/);
    });

    it('respeta la cantidad máxima y mínima de decimales configurada', () => {
      const result = formatNumber(3.14159, 2, 2);
      assert.match(result, /^3[.,]14$/);

      const withMin = formatNumber(5, 3, 2);
      assert.match(withMin, /^5[.,]00$/);
    });

    it('retorna "0" ante valores nulos o inválidos', () => {
      assert.strictEqual(formatNumber(null), '0');
      assert.strictEqual(formatNumber(undefined), '0');
      assert.strictEqual(formatNumber('abc'), '0');
      assert.strictEqual(formatNumber(NaN), '0');
    });
  });

  describe('parseLocaleNumber', () => {
    it('parsea números directos sin alteración', () => {
      assert.strictEqual(parseLocaleNumber(42), 42);
      assert.strictEqual(parseLocaleNumber(12.34), 12.34);
      assert.strictEqual(parseLocaleNumber(0), 0);
    });

    it('retorna 0 ante valores nulos, vacíos o NaN', () => {
      assert.strictEqual(parseLocaleNumber(null), 0);
      assert.strictEqual(parseLocaleNumber(undefined), 0);
      assert.strictEqual(parseLocaleNumber(''), 0);
      assert.strictEqual(parseLocaleNumber('   '), 0);
      assert.strictEqual(parseLocaleNumber(NaN), 0);
      assert.strictEqual(parseLocaleNumber('abc'), 0);
    });

    it('parsea formato argentino con punto de miles y coma decimal', () => {
      assert.strictEqual(parseLocaleNumber('1.250,50'), 1250.5);
      assert.strictEqual(parseLocaleNumber('$ 1.250,50'), 1250.5);
      assert.strictEqual(parseLocaleNumber('  $  15.000,75 '), 15000.75);
    });

    it('parsea formato estándar con coma de miles y punto decimal', () => {
      assert.strictEqual(parseLocaleNumber('1,250.50'), 1250.5);
      assert.strictEqual(parseLocaleNumber('$1,250.50'), 1250.5);
    });

    it('parsea formato con solo coma decimal', () => {
      assert.strictEqual(parseLocaleNumber('1250,50'), 1250.5);
      assert.strictEqual(parseLocaleNumber('0,99'), 0.99);
    });

    it('parsea formato con múltiples puntos de miles (ej: 1.000.000)', () => {
      assert.strictEqual(parseLocaleNumber('1.000.000'), 1000000);
      assert.strictEqual(parseLocaleNumber('$ 2.500.000,00'), 2500000);
    });
  });
});
