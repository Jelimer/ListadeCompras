import { GoogleGenAI, Type } from '@google/genai';

export const RECEIPT_EXTRACTION_PROMPT = `Analiza esta foto de un ticket, factura o comprobante de compra de supermercado o comercio.
Extrae con máxima precisión:
1. storeName: Nombre del supermercado o comercio (ej: "Carrefour", "Facor", "Supermercado Impulso", "La Reina", "Farmacity", etc.). Si no se distingue, usa "Comercio en Ticket".
2. storeAddress: Dirección del comercio si aparece en el ticket (o cadena vacía).
3. date: Fecha del comprobante en formato DD/MM/YYYY (si aparece, o la fecha de hoy).
4. receiptNumber: Número de ticket o factura si aparece (o cadena vacía).
5. items: Lista completa de cada producto comprado que figure en el ticket. Para cada producto:
   - name: Nombre limpio y legible del producto (corrige abreviaturas típicas de ticket fiscal argentino, ej: "LECH ENT SANCOR 1L" -> "Leche Entera Sancor 1L").
   - quantity: Cantidad comprada (número, por defecto 1).
   - unitPrice: Precio unitario del producto en números decimales (si el ticket muestra cantidad x precio unitario, usa ese precio unitario; si solo muestra el subtotal de la línea, divide por la cantidad).
   - lineTotal: Subtotal pagado por esa línea (quantity * unitPrice).
   - category: Categoría sugerida entre: "Lácteos", "Carnes", "Frutas y Verduras", "Panadería", "Despensa", "Bebidas", "Limpieza", "Cuidado Personal", "Congelados", "Mascotas" o "General".
6. total: Monto total final del ticket.`;

export const RECEIPT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    storeName: {
      type: Type.STRING,
      description: 'Nombre del supermercado o comercio donde se realizó la compra.',
    },
    storeAddress: {
      type: Type.STRING,
      description: 'Dirección física de la sucursal si figura en el ticket.',
    },
    date: {
      type: Type.STRING,
      description: 'Fecha de compra en formato DD/MM/YYYY.',
    },
    receiptNumber: {
      type: Type.STRING,
      description: 'Número de ticket o comprobante.',
    },
    items: {
      type: Type.ARRAY,
      description: 'Lista de productos extraídos del ticket con sus cantidades y precios.',
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Nombre limpio del producto.' },
          quantity: { type: Type.NUMBER, description: 'Cantidad comprada.' },
          unitPrice: { type: Type.NUMBER, description: 'Precio unitario del producto.' },
          lineTotal: { type: Type.NUMBER, description: 'Subtotal de la línea.' },
          category: { type: Type.STRING, description: 'Categoría sugerida del producto.' },
        },
        required: ['name', 'quantity', 'unitPrice', 'lineTotal', 'category'],
      },
    },
    total: {
      type: Type.NUMBER,
      description: 'Monto total abonado en el ticket.',
    },
  },
  required: ['storeName', 'date', 'items', 'total'],
};

export async function parseReceiptWithGemini(imageBase64: string, mimeType: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_NOT_CONFIGURED');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: mimeType || 'image/jpeg',
            data: cleanBase64,
          },
        },
        {
          text: RECEIPT_EXTRACTION_PROMPT,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: RECEIPT_RESPONSE_SCHEMA,
      temperature: 0.1,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error('El modelo no devolvió datos del ticket.');
  }

  return JSON.parse(text.trim());
}

// Vercel Serverless Function Default Handler
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const { imageBase64, mimeType } = req.body || {};
    if (!imageBase64) {
      res.status(400).json({ error: 'Falta la imagen del ticket (imageBase64).' });
      return;
    }

    const parsed = await parseReceiptWithGemini(imageBase64, mimeType || 'image/jpeg');
    res.status(200).json({ success: true, source: 'gemini', data: parsed });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      success: false,
      error: message,
    });
  }
}
