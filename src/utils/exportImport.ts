import { ShoppingItem } from '../types';
import { ensureSequentialSkus, formatSkuCode } from './storage';

export function exportJSON(items: ShoppingItem[] = [], budget: number = 0): string {
  const normalized = ensureSequentialSkus(items || []);
  const payload = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    budget: Number(budget) || 0,
    items: normalized.map((it, idx) => ({
      id: String(it.id || ''),
      seqNumber: Number(it.seqNumber) || idx + 1,
      skuCode: String(it.skuCode || formatSkuCode(idx + 1)),
      name: String(it.name || ''),
      quantity: Number(it.quantity) || 1,
      unitPrice: Number(it.unitPrice) || 0,
      category: String(it.category || 'General'),
      location: String(it.location || 'General'),
      completed: Boolean(it.completed),
      timestamp: Number(it.timestamp || Date.now()),
    })),
  };
  return JSON.stringify(payload, null, 2);
}

function escapeCSVCell(val: unknown): string {
  let str = String(val ?? '');
  str = str.replace(/&quot;/g, '"');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportCSV(items: ShoppingItem[] = []): string {
  const BOM = '\uFEFF';
  const normalized = ensureSequentialSkus(items || []);
  const headers = ['id', 'skuCode', 'name', 'quantity', 'unitPrice', 'category', 'location', 'completed', 'timestamp'];
  const rows = [headers.join(',')];

  for (let i = 0; i < normalized.length; i++) {
    const it = normalized[i];
    const row = [
      escapeCSVCell(it.id),
      escapeCSVCell(it.skuCode || formatSkuCode(i + 1)),
      escapeCSVCell(it.name),
      it.quantity,
      it.unitPrice,
      escapeCSVCell(it.category || 'General'),
      escapeCSVCell(it.location || 'General'),
      it.completed ? 'true' : 'false',
      it.timestamp || Date.now(),
    ];
    rows.push(row.join(','));
  }

  return BOM + rows.join('\r\n');
}

export function importJSON(jsonString: string): {
  success: boolean;
  budget: number;
  items: ShoppingItem[];
  error?: string;
} {
  try {
    const data = JSON.parse(jsonString);
    if (!data || typeof data !== 'object') {
      throw new Error('Estructura JSON raíz inválida.');
    }
    if (data.version && data.version !== '1.0') {
      throw new Error(`Versión de esquema no soportada: ${data.version}. Se requiere versión 1.0.`);
    }
    if (!Array.isArray(data.items)) {
      throw new Error('El campo "items" debe ser una lista.');
    }

    const validItems: ShoppingItem[] = [];
    for (const raw of data.items) {
      if (!raw || typeof raw !== 'object') continue;
      const name = String(raw.name || '').trim();
      if (!name) continue;

      const qty = parseFloat(raw.quantity);
      const price = parseFloat(raw.unitPrice);

      validItems.push({
        id: String(raw.id || `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`),
        seqNumber: typeof raw.seqNumber === 'number' ? raw.seqNumber : undefined,
        skuCode: typeof raw.skuCode === 'string' ? raw.skuCode : undefined,
        name,
        quantity: !isNaN(qty) && qty > 0 ? qty : 1,
        unitPrice: !isNaN(price) && price >= 0 ? Math.round(price * 100) / 100 : 0,
        category: String(raw.category || 'General').trim() || 'General',
        location: String(raw.location || 'General').trim() || 'General',
        completed: Boolean(raw.completed),
        timestamp: Number(raw.timestamp) || Date.now(),
        updatedAt: Number(raw.updatedAt) || Date.now(),
      });
    }

    return {
      success: true,
      budget: Math.max(0, Number(data.budget) || 0),
      items: ensureSequentialSkus(validItems),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message, items: [], budget: 0 };
  }
}

function parseCSVLines(text: string): string[][] {
  const lines: string[][] = [];
  let currentLine: string[] = [];
  let currentCell = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (insideQuotes) {
      if (char === '"' && nextChar === '"') {
        currentCell += '"';
        i++;
      } else if (char === '"') {
        insideQuotes = false;
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ',') {
        currentLine.push(currentCell.trim());
        currentCell = '';
      } else if (char === '\r' && nextChar === '\n') {
        currentLine.push(currentCell.trim());
        lines.push(currentLine);
        currentLine = [];
        currentCell = '';
        i++;
      } else if (char === '\n' || char === '\r') {
        currentLine.push(currentCell.trim());
        lines.push(currentLine);
        currentLine = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
  }

  if (currentCell.length > 0 || currentLine.length > 0) {
    currentLine.push(currentCell.trim());
    lines.push(currentLine);
  }

  return lines;
}

export function importCSV(csvString: string): {
  success: boolean;
  items: ShoppingItem[];
  error?: string;
} {
  try {
    let cleanText = csvString;
    if (cleanText.charCodeAt(0) === 0xfeff) {
      cleanText = cleanText.substring(1);
    }

    const lines = parseCSVLines(cleanText).filter((row) => row.length > 0 && row.some((c) => c.length > 0));

    if (lines.length < 2) {
      throw new Error('El archivo CSV debe tener al menos una cabecera y una fila de datos.');
    }

    const rawHeaders = lines[0].map((h) => h.toLowerCase().trim().replace(/^["']|["']$/g, ''));
    const expectedHeaders = ['id', 'name', 'quantity', 'unitprice', 'category', 'location', 'completed', 'timestamp'];
    const hasValidHeaders = expectedHeaders.every((eh) => rawHeaders.includes(eh));

    if (!hasValidHeaders) {
      throw new Error('Cabeceras CSV incompatibles. Deben incluir: id, name, quantity, unitPrice, category, location, completed, timestamp.');
    }

    const idxMap: Record<string, number> = {};
    expectedHeaders.forEach((eh) => {
      idxMap[eh] = rawHeaders.indexOf(eh);
    });
    const skuIdx = rawHeaders.indexOf('skucode');

    const validItems: ShoppingItem[] = [];

    for (let r = 1; r < lines.length; r++) {
      const row = lines[r];
      if (row.length <= idxMap.name) continue;

      const rawName = row[idxMap.name];
      if (!rawName || !rawName.trim()) continue;

      const rawQty = row[idxMap.quantity];
      const parsedQty = parseFloat(rawQty);
      const rawPrice = row[idxMap.unitprice];
      const parsedPrice = parseFloat(rawPrice);
      const rawCompleted = (row[idxMap.completed] || '').toLowerCase();
      const completed = rawCompleted === 'true' || rawCompleted === '1' || rawCompleted === 'yes';

      validItems.push({
        id: row[idxMap.id] || `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        skuCode: skuIdx !== -1 && row[skuIdx] ? row[skuIdx].trim() : undefined,
        name: rawName.trim(),
        quantity: !isNaN(parsedQty) && parsedQty > 0 ? parsedQty : 1,
        unitPrice: !isNaN(parsedPrice) && parsedPrice >= 0 ? Math.round(parsedPrice * 100) / 100 : 0,
        category: (row[idxMap.category] || 'General').trim() || 'General',
        location: (row[idxMap.location] || 'General').trim() || 'General',
        completed,
        timestamp: Number(row[idxMap.timestamp]) || Date.now(),
        updatedAt: Date.now(),
      });
    }

    return {
      success: true,
      items: ensureSequentialSkus(validItems),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message, items: [] };
  }
}
