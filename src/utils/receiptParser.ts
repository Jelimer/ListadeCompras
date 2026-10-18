import { ShoppingItem, ReceiptLineItem } from '../types';
import { parseLocaleNumber } from './formatters';
import { formatSkuCode } from './storage';

export interface ParsedReceiptData {
  storeName: string;
  storeAddress: string;
  date: string;
  receiptNumber: string;
  items: ReceiptLineItem[];
  total: number;
  source: 'gemini' | 'ocr-local';
  thumbnailDataUrl?: string;
}

const KNOWN_ARG_STORES = [
  'Carrefour',
  'Facor',
  'Supermercado Impulso',
  'Impulso',
  'La Reina',
  'Supermercados Día',
  'Dia',
  'Coto',
  'Changomás',
  'ChangoMas',
  'Jumbo',
  'Disco',
  'Vea',
  'Vital',
  'Maxiconsumo',
  'Diarco',
  'Makro',
  'Farmacity',
  'Don Pepe',
  'Candy Plast',
  'Sabor y Aroma',
];

function normalizeTextForMatch(str: string): string {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findMatchingShoppingItem(
  receiptItemName: string,
  existingItems: ShoppingItem[]
): { id: string; skuCode: string; name: string; category: string } | null {
  const target = normalizeTextForMatch(receiptItemName);
  if (!target || target.length < 3) return null;

  const targetTokens = target.split(' ').filter((t) => t.length >= 3);
  let bestItem: ShoppingItem | null = null;
  let bestScore = 0;

  existingItems.forEach((item) => {
    const candidate = normalizeTextForMatch(item.name);
    if (!candidate) return;

    if (candidate === target || candidate.includes(target) || target.includes(candidate)) {
      const score = item.completed ? 0.85 : 1.0;
      if (score > bestScore) {
        bestScore = score;
        bestItem = item;
      }
      return;
    }

    if (targetTokens.length > 0) {
      const matchedTokens = targetTokens.filter((tok) => candidate.includes(tok));
      const ratio = matchedTokens.length / targetTokens.length;
      if (ratio >= 0.6 && ratio > bestScore) {
        bestScore = ratio;
        bestItem = item;
      }
    }
  });

  if (!bestItem) return null;
  const found = bestItem as ShoppingItem;
  return {
    id: found.id,
    skuCode: found.skuCode || formatSkuCode(found.seqNumber || 1),
    name: found.name,
    category: found.category || 'General',
  };
}

export async function resizeImageFile(
  file: File,
  maxWidth = 1400,
  quality = 0.82
): Promise<{ dataUrl: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo de imagen.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagen inválido.'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ dataUrl: String(reader.result), mimeType: file.type || 'image/jpeg' });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const outDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve({ dataUrl: outDataUrl, mimeType: 'image/jpeg' });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function inferCategoryFromName(name: string): string {
  const n = normalizeTextForMatch(name);
  if (/(leche|yogur|queso|manteca|crema|ricota|dulce de leche)/.test(n)) return 'Lácteos';
  if (/(carne|pollo|cerdo|asado|milanesa|chorizo|jamon|salchicha|bife|molida)/.test(n))
    return 'Carnes';
  if (/(papa|tomate|cebolla|lechuga|manzana|banana|naranja|limon|verdura|fruta|zanahoria)/.test(n))
    return 'Frutas y Verduras';
  if (/(pan|factura|galletita|tostada|budin|medialuna)/.test(n)) return 'Panadería';
  if (/(agua|gaseosa|coca|cerveza|vino|jugo|soda|fernet)/.test(n)) return 'Bebidas';
  if (/(detergente|lavandina|jabon|papel higienico|rollo|desodorante|limpiador|suavizante)/.test(n))
    return 'Limpieza';
  if (/(shampoo|acondicionador|dentifrico|crema dental|cepillo)/.test(n)) return 'Cuidado Personal';
  if (/(perro|gato|balanceado|mascota)/.test(n)) return 'Mascotas';
  if (/(fideo|arroz|aceite|harina|azucar|yerba|cafe|te|sal|pure|atun|conserva)/.test(n))
    return 'Despensa';
  return 'General';
}

export function parseRawReceiptText(
  rawText: string,
  existingItems: ShoppingItem[]
): Omit<ParsedReceiptData, 'source' | 'thumbnailDataUrl'> {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 1);

  const todayStr = new Date().toLocaleDateString('es-AR');
  let detectedStore = 'Comercio en Ticket';
  let detectedDate = todayStr;
  let detectedReceiptNum = '';
  let detectedTotal = 0;

  // 1. Detect store name
  for (const line of lines.slice(0, 10)) {
    const cleanLine = normalizeTextForMatch(line);
    const known = KNOWN_ARG_STORES.find((st) =>
      cleanLine.includes(normalizeTextForMatch(st))
    );
    if (known) {
      detectedStore = known;
      break;
    }
  }
  if (detectedStore === 'Comercio en Ticket' && lines.length > 0) {
    const firstAlphaLine = lines.find(
      (l) =>
        l.length >= 3 &&
        l.length <= 35 &&
        !/cuit|iva|ingresos|brutos|ticket|factura|fecha|hora|original/i.test(l)
    );
    if (firstAlphaLine) {
      detectedStore = firstAlphaLine;
    }
  }

  // 2. Detect date and receipt number
  for (const line of lines) {
    const dateMatch = line.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/);
    if (dateMatch && detectedDate === todayStr) {
      detectedDate = dateMatch[1].replace(/-/g, '/');
    }
    const numMatch = line.match(/(?:nro|n°|ticket|pv|comp)[:\.\s#]*(\d{4}[\-\s]?\d{6,8}|\d{5,10})/i);
    if (numMatch && !detectedReceiptNum) {
      detectedReceiptNum = numMatch[1].trim();
    }
  }

  // 3. Parse item lines & total
  const extractedItems: ReceiptLineItem[] = [];
  const skipRegex =
    /\b(subtotal|total|efectivo|tarjeta|debito|credito|vuelto|cambio|cuit|iva|consumidor|final|descuento|ahorro|cae|vto|gracias|cajero|caja|sucursal|domicilio)\b/i;

  let pendingQtyForNextLine: { qty: number; unitPrice: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if total line
    const totalMatch = line.match(/\btotal\b.*?\$?\s*([\d\.,]+)$/i);
    if (totalMatch) {
      const val = parseLocaleNumber(totalMatch[1]);
      if (val > detectedTotal) detectedTotal = val;
      continue;
    }

    // Check if "2 x 1.250,00" or "2,000 x 1500,00" multiplier line
    const qtyMultMatch = line.match(/^(\d+(?:[\.,]\d+)?)\s*[xX\*]\s*\$?\s*([\d\.,]+)/);
    if (qtyMultMatch) {
      const q = parseLocaleNumber(qtyMultMatch[1]);
      const up = parseLocaleNumber(qtyMultMatch[2]);
      if (q > 0 && up > 0) {
        pendingQtyForNextLine = { qty: q, unitPrice: up };
        continue;
      }
    }

    if (skipRegex.test(line)) continue;

    // Match "PRODUCT NAME ... $ 1.450,00" or "2 PRODUCT NAME 1.450,00"
    const itemPriceMatch = line.match(
      /^(?:(\d+(?:[\.,]\d+)?)\s+(?:x\s*)?)?([A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-z0-9ÁÉÍÓÚÑáéíóúñ\s\.\-\/]{2,42}?)\s+\$?\s*(\d{1,3}(?:[\.\,]\d{3})*(?:[\.,]\d{2})|\d+(?:[\.,]\d{2})?)\s*[A-Z0-9\(\)]*$/
    );

    if (itemPriceMatch) {
      const inlineQty = itemPriceMatch[1] ? parseLocaleNumber(itemPriceMatch[1]) : 0;
      const rawName = itemPriceMatch[2].trim();
      const lineAmount = parseLocaleNumber(itemPriceMatch[3]);

      if (rawName.length >= 3 && lineAmount > 0) {
        const quantity =
          pendingQtyForNextLine?.qty || (inlineQty > 0 && inlineQty < 100 ? inlineQty : 1);
        const unitPrice =
          pendingQtyForNextLine?.unitPrice ||
          Math.round((lineAmount / quantity) * 100) / 100;
        const lineTotal = Math.round(quantity * unitPrice * 100) / 100;

        pendingQtyForNextLine = null;
        const match = findMatchingShoppingItem(rawName, existingItems);

        extractedItems.push({
          id: `rcpt_item_${Date.now()}_${i}`,
          name: match ? match.name : rawName,
          rawTicketName: rawName,
          quantity,
          unitPrice,
          lineTotal,
          category: match ? match.category : inferCategoryFromName(rawName),
          matchedItemId: match?.id,
          matchedSkuCode: match?.skuCode,
          included: true,
        });
      }
    }
  }

  const sumItems = extractedItems.reduce((acc, it) => acc + it.lineTotal, 0);
  if (detectedTotal <= 0 || detectedTotal < sumItems) {
    detectedTotal = Math.round(sumItems * 100) / 100;
  }

  return {
    storeName: detectedStore,
    storeAddress: '',
    date: detectedDate,
    receiptNumber: detectedReceiptNum,
    items: extractedItems,
    total: detectedTotal,
  };
}

export async function processReceiptImage(
  file: File,
  existingItems: ShoppingItem[],
  onProgress?: (statusText: string) => void
): Promise<ParsedReceiptData> {
  onProgress?.('Optimizando imagen del ticket...');
  const [{ dataUrl, mimeType }, { dataUrl: thumbnailDataUrl }] = await Promise.all([
    resizeImageFile(file, 1400, 0.84),
    resizeImageFile(file, 320, 0.65),
  ]);

  // 1. Try server-side Gemini Vision API first
  try {
    onProgress?.('Analizando productos, comercio y precios del ticket...');
    const response = await fetch('/api/parse-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: dataUrl,
        mimeType,
      }),
    });

    if (response.ok) {
      const json = await response.json();
      if (json && json.success && json.data) {
        const d = json.data;
        const rawItems = Array.isArray(d.items) ? d.items : [];
        const mappedItems: ReceiptLineItem[] = rawItems
          .filter((it: any) => it && String(it.name || '').trim())
          .map((it: any, idx: number) => {
            const name = String(it.name).trim();
            const quantity = Math.max(0.01, Number(it.quantity) || 1);
            const unitPrice = Math.max(0, Number(it.unitPrice) || 0);
            const lineTotal =
              Number(it.lineTotal) > 0
                ? Math.round(Number(it.lineTotal) * 100) / 100
                : Math.round(quantity * unitPrice * 100) / 100;
            const match = findMatchingShoppingItem(name, existingItems);

            return {
              id: `rcpt_item_${Date.now()}_${idx}`,
              name: match ? match.name : name,
              rawTicketName: name,
              quantity: Math.round(quantity * 1000) / 1000,
              unitPrice: Math.round(unitPrice * 100) / 100,
              lineTotal,
              category:
                (match ? match.category : String(it.category || inferCategoryFromName(name)).trim()) ||
                'General',
              matchedItemId: match?.id,
              matchedSkuCode: match?.skuCode,
              included: true,
            };
          });

        const computedTotal = mappedItems.reduce((acc, i) => acc + i.lineTotal, 0);

        return {
          storeName: String(d.storeName || 'Comercio en Ticket').trim(),
          storeAddress: String(d.storeAddress || '').trim(),
          date: String(d.date || new Date().toLocaleDateString('es-AR')).trim(),
          receiptNumber: String(d.receiptNumber || '').trim(),
          items: mappedItems,
          total:
            Number(d.total) > 0
              ? Math.round(Number(d.total) * 100) / 100
              : Math.round(computedTotal * 100) / 100,
          source: 'gemini',
          thumbnailDataUrl,
        };
      }
    }
  } catch {
    // Fallback to client-side OCR below
  }

  // 2. Fallback: Client-side OCR with Tesseract.js
  onProgress?.('Ejecutando reconocimiento óptico local (OCR) sobre el ticket...');
  const Tesseract = await import('tesseract.js');
  const result = await Tesseract.recognize(dataUrl, 'spa', {});
  const rawText = result?.data?.text || '';
  const parsedLocal = parseRawReceiptText(rawText, existingItems);

  return {
    ...parsedLocal,
    source: 'ocr-local',
    thumbnailDataUrl,
  };
}
