#!/usr/bin/env node
/**
 * scripts/generate_pwa_icons.js
 * Generador estático de iconos PNG binarios para PWA (192x192 y 512x512).
 * Conforme con ISO/IEC 15948 (firma 89 50 4E 47 0D 0A 1A 0A, chunks IHDR, IDAT zlib, IEND CRC32).
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const rootDir = path.resolve(__dirname, '..');
const iconsDir = path.join(rootDir, 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
})();

function calcCrc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const typeAndData = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(calcCrc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

function generatePng(width, height) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // Chunk IHDR: 13 bytes
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth: 8
  ihdrData[9] = 6;  // color type: RGBA (6)
  ihdrData[10] = 0; // compression: deflate (0)
  ihdrData[11] = 0; // filter: standard (0)
  ihdrData[12] = 0; // interlace: none (0)
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Scanlines con filtro 0 (None)
  const rowLength = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowLength);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLength;
    rawData[rowOffset] = 0; // Byte de filtro: None
    const t = y / height;
    // Degradado índigo a azul (#4f46e5 a #1d4ed8)
    const r = Math.round(79 + (29 - 79) * t);
    const g = Math.round(70 + (78 - 70) * t);
    const b = Math.round(229 + (216 - 229) * t);

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const cornerRadius = width * 0.22;
      const dx = Math.min(x, width - 1 - x);
      const dy = Math.min(y, height - 1 - y);

      let alpha = 255;
      if (dx < cornerRadius && dy < cornerRadius) {
        const dist = Math.hypot(cornerRadius - dx, cornerRadius - dy);
        if (dist > cornerRadius) {
          alpha = 0;
        }
      }

      if (alpha === 0) {
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
      } else {
        const cx = x / width;
        const cy = y / height;
        let isWhite = false;

        // Cesta del carrito de compras
        if (cy >= 0.45 && cy <= 0.65 && cx >= 0.35 && cx <= 0.72) {
          const borderThick = 0.035;
          if (
            cy <= 0.45 + borderThick ||
            cy >= 0.65 - borderThick ||
            cx <= 0.35 + borderThick ||
            cx >= 0.72 - borderThick
          ) {
            isWhite = true;
          }
        }

        // Mango del carrito
        if (cy >= 0.38 && cy <= 0.45 && cx >= 0.25 && cx <= 0.35) {
          if (Math.abs((cy - 0.38) * 1.4 - (cx - 0.25)) < 0.04) {
            isWhite = true;
          }
        }

        // Ruedas del carrito
        if (
          Math.hypot(cx - 0.43, cy - 0.75) <= 0.05 ||
          Math.hypot(cx - 0.65, cy - 0.75) <= 0.05
        ) {
          isWhite = true;
        }

        if (isWhite) {
          rawData[pxOffset] = 255;
          rawData[pxOffset + 1] = 255;
          rawData[pxOffset + 2] = 255;
          rawData[pxOffset + 3] = 255;
        } else {
          rawData[pxOffset] = r;
          rawData[pxOffset + 1] = g;
          rawData[pxOffset + 2] = b;
          rawData[pxOffset + 3] = alpha;
        }
      }
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function writeAndVerifyIcon(filename, width, height) {
  const filePath = path.join(iconsDir, filename);
  const buf = generatePng(width, height);
  fs.writeFileSync(filePath, buf);

  // Verificación forense estricta
  const readBack = fs.readFileSync(filePath);
  const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (readBack[i] !== magic[i]) {
      throw new Error(`Fallo de firma en ${filename}: byte ${i} es 0x${readBack[i].toString(16)}`);
    }
  }
  if (readBack.length <= 100) {
    throw new Error(`Tamaño insuficiente en ${filename}: ${readBack.length} bytes`);
  }

  console.log(`✓ Generado ${filename} (${width}x${height}): ${readBack.length} bytes | Firma PNG válida [89 50 4E 47 0D 0A 1A 0A]`);
}

function main() {
  console.log('--- Generando Iconos PWA Binarios Estáticos ---');
  writeAndVerifyIcon('icon-192.png', 192, 192);
  writeAndVerifyIcon('icon-512.png', 512, 512);
  console.log('✓ Iconos PWA generados con éxito sin contaminación de código cliente.\n');
}

if (require.main === module) {
  main();
}

module.exports = { generatePng, writeAndVerifyIcon };
