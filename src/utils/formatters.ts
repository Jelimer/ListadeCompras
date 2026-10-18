const arCurrencyFormatter = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formatea un número con punto (.) para miles y coma (,) para decimales (ej: 1.250,50)
 */
export function formatCurrency(value: number | string | undefined | null): string {
  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) return '0,00';
  return arCurrencyFormatter.format(num);
}

/**
 * Formatea un monto monetario con símbolo $ y formato argentino (ej: $1.250,50)
 */
export function formatMoney(value: number | string | undefined | null): string {
  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) return '$0,00';
  if (num < 0) {
    return `-$${arCurrencyFormatter.format(Math.abs(num))}`;
  }
  return `$${arCurrencyFormatter.format(num)}`;
}

/**
 * Formatea cantidades, distancias o porcentajes con punto para miles y coma para decimales (ej: 1.500 o 2,5)
 */
export function formatNumber(
  value: number | string | undefined | null,
  maxDecimals = 2,
  minDecimals = 0
): string {
  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) return '0';
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  }).format(num);
}

/**
 * Parsea un string numérico ingresado con formato argentino (1.250,50) o estándar (1250.50)
 */
export function parseLocaleNumber(raw: string | number | undefined | null): number {
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
  if (!raw) return 0;
  let str = String(raw).trim().replace(/\$/g, '').replace(/\s+/g, '');
  if (!str) return 0;

  const hasDot = str.includes('.');
  const hasComma = str.includes(',');

  if (hasDot && hasComma) {
    // Determinar cuál aparece último como separador decimal
    const lastDot = str.lastIndexOf('.');
    const lastComma = str.lastIndexOf(',');
    if (lastComma > lastDot) {
      // Formato 1.250,50 -> quitar puntos, cambiar coma por punto
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // Formato 1,250.50 -> quitar comas
      str = str.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Formato 1250,50 -> cambiar coma por punto
    str = str.replace(',', '.');
  } else if (hasDot) {
    // Si tiene múltiples puntos (ej: 1.000.000) o exactamente 3 dígitos tras el punto en enteros grandes
    const parts = str.split('.');
    if (parts.length > 2) {
      str = parts.join('');
    }
  }

  const parsed = parseFloat(str);
  return isNaN(parsed) || !isFinite(parsed) ? 0 : parsed;
}
