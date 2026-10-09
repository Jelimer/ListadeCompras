/**
 * tests/pwa_offline.test.js
 * Suite de Pruebas Unitarias para Milestone 1 (PWA & Offline Resilience)
 * Valida F01 a F06:
 * - manifest.json (sintaxis y metadatos)
 * - icons (icon.svg, icon-192.png, icon-512.png)
 * - index.html (enlaces y metadatos PWA, #networkStatusBadge)
 * - sw.js (eventos install, activate, fetch, SWR, Cache-First)
 * - script.js (registerServiceWorker con guardas, initNetworkConnectivity con online/offline)
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const { createTestEnvironment } = require('./mock_dom.js');

let total = 0;
let passed = 0;
let failed = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.stack || err.message}`);
  }
}

async function runPwaOfflineTests() {
  console.log('\n==================================================');
  console.log('SUITE: PWA & Service Worker Offline Resilience (M1)');
  console.log('==================================================\n');

  // F01: manifest.json
  await test('F01: manifest.json existe y es un JSON válido con todos los metadatos PWA', () => {
    const manifestPath = path.resolve(__dirname, '../manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'manifest.json debe existir en la raíz');
    const content = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(content);

    assert.strictEqual(manifest.name, 'Lista de Compra | PRO');
    assert.strictEqual(manifest.short_name, 'Lista PRO');
    assert.strictEqual(manifest.theme_color, '#4f46e5');
    assert.strictEqual(manifest.background_color, '#0f172a');
    assert.strictEqual(manifest.display, 'standalone');
    assert.strictEqual(manifest.scope, '/');
    assert.strictEqual(manifest.start_url, '/');
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3, 'Debe incluir iconos any y maskable');

    const hasAny = manifest.icons.some(i => i.purpose && i.purpose.includes('any'));
    const hasMaskable = manifest.icons.some(i => i.purpose && i.purpose.includes('maskable'));
    assert.ok(hasAny, 'Debe incluir al menos un icono con purpose any');
    assert.ok(hasMaskable, 'Debe incluir al menos un icono con purpose maskable');
  });

  // F02: Iconos PWA
  await test('F02: Directorio icons/ contiene icon.svg, icon-192.png y icon-512.png válidos', () => {
    const iconsDir = path.resolve(__dirname, '../icons');
    assert.ok(fs.existsSync(iconsDir), 'Directorio icons/ debe existir');

    const svgPath = path.join(iconsDir, 'icon.svg');
    assert.ok(fs.existsSync(svgPath), 'icon.svg debe existir');
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    assert.ok(svgContent.includes('<svg'), 'icon.svg debe ser un SVG válido');
    assert.ok(svgContent.includes('4f46e5') || svgContent.includes('indigo') || svgContent.includes('linearGradient'), 'icon.svg debe contener degradado');

    const png192Path = path.join(iconsDir, 'icon-192.png');
    assert.ok(fs.existsSync(png192Path), 'icon-192.png debe existir');
    const png192Buf = fs.readFileSync(png192Path);
    assert.ok(png192Buf.length >= 8, 'icon-192.png debe tener longitud mínima');
    const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let i = 0; i < 8; i++) {
      assert.strictEqual(png192Buf[i], pngMagic[i], `Byte ${i} debe coincidir con la firma PNG`);
    }

    const png512Path = path.join(iconsDir, 'icon-512.png');
    assert.ok(fs.existsSync(png512Path), 'icon-512.png debe existir');
    const png512Buf = fs.readFileSync(png512Path);
    for (let i = 0; i < 8; i++) {
      assert.strictEqual(png512Buf[i], pngMagic[i], `Byte ${i} debe coincidir con la firma PNG`);
    }
  });

  // F03: Metadatos PWA en index.html
  await test('F03: index.html contiene directivas y enlaces PWA requeridos en <head>', () => {
    const indexPath = path.resolve(__dirname, '../index.html');
    const html = fs.readFileSync(indexPath, 'utf8');
    assert.ok(html.includes('<link rel="manifest" href="manifest.json">'), 'Debe enlazar manifest.json');
    assert.ok(html.includes('<meta name="theme-color" content="#4f46e5">'), 'Debe definir theme-color #4f46e5');
    assert.ok(html.includes('<meta name="apple-mobile-web-app-capable" content="yes">'), 'Debe definir apple-mobile-web-app-capable');
    assert.ok(html.includes('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'), 'Debe definir apple-mobile-web-app-status-bar-style');
    assert.ok(html.includes('<link rel="apple-touch-icon" href="icons/icon-192.png">'), 'Debe enlazar apple-touch-icon');
  });

  // F04: Service Worker sw.js
  await test('F04: sw.js implementa caché versionado, pre-caché, skipWaiting, activate y fetch diferenciado', () => {
    const swPath = path.resolve(__dirname, '../sw.js');
    assert.ok(fs.existsSync(swPath), 'sw.js debe existir');
    const swContent = fs.readFileSync(swPath, 'utf8');

    assert.ok(swContent.includes('lista-compra-pro-v2.5.0-cache'), 'sw.js debe usar nombre de caché versionado');
    assert.ok(swContent.includes('skipWaiting'), 'sw.js debe llamar skipWaiting');
    assert.ok(swContent.includes('caches.delete'), 'sw.js debe limpiar cachés antiguas en activate');
    assert.ok(swContent.includes('clients.claim'), 'sw.js debe reclamar clientes en activate');
    assert.ok(swContent.includes('ignoreSearch'), 'sw.js debe usar ignoreSearch para SWR');
    assert.ok(swContent.includes('fetch'), 'sw.js debe manejar evento fetch');
    assert.ok(swContent.includes('firebase') && swContent.includes('firestore'), 'sw.js debe excluir URLs de Firebase/Firestore');
  });

  // F05: Registro seguro en script.js
  await test('F05: script.js contiene registerServiceWorker con guardas defensivas', () => {
    const scriptPath = path.resolve(__dirname, '../script.js');
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');

    assert.ok(scriptContent.includes('registerServiceWorker'), 'script.js debe definir registerServiceWorker');
    assert.ok(scriptContent.includes("'serviceWorker' in navigator"), 'Debe comprobar serviceWorker in navigator');
    assert.ok(scriptContent.includes("navigator.serviceWorker.register('./sw.js'"), 'Debe registrar sw.js con scope ./');
  });

  // F06: Componente #networkStatusBadge en DOM, CSS y eventos
  await test('F06.1: index.html contiene #networkStatusBadge con atributos accesibles', () => {
    const indexPath = path.resolve(__dirname, '../index.html');
    const html = fs.readFileSync(indexPath, 'utf8');
    assert.ok(html.includes('id="networkStatusBadge"'), 'index.html debe contener #networkStatusBadge');
    assert.ok(html.includes('class="network-badge online"'), 'Debe iniciar con clase network-badge online');
    assert.ok(html.includes('role="status"'), 'Debe tener role status');
    assert.ok(html.includes('aria-live="polite"'), 'Debe tener aria-live polite');
    assert.ok(html.includes('badge-dot'), 'Debe contener badge-dot');
    assert.ok(html.includes('badge-text'), 'Debe contener badge-text');
  });

  await test('F06.2: style.css contiene estilos para .network-badge, .online, .offline y .badge-dot', () => {
    const cssPath = path.resolve(__dirname, '../style.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    assert.ok(css.includes('.network-badge'), 'style.css debe definir .network-badge');
    assert.ok(css.includes('.network-badge.online'), 'style.css debe definir .network-badge.online');
    assert.ok(css.includes('.network-badge.offline'), 'style.css debe definir .network-badge.offline');
    assert.ok(css.includes('.badge-dot'), 'style.css debe definir .badge-dot');
  });

  await test('F06.3: initNetworkConnectivity responde a eventos online y offline actualizando el badge', () => {
    const env = createTestEnvironment();
    global.window = env.window;
    global.document = env.document;
    global.navigator = env.navigator;
    global.localStorage = env.localStorage;

    const scriptPath = path.resolve(__dirname, '../script.js');
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');
    eval(scriptContent);

    // Disparar DOMContentLoaded
    env.document.dispatchEvent(new env.DOMEvent('DOMContentLoaded'));

    const badge = env.document.getElementById('networkStatusBadge');
    assert.ok(badge, '#networkStatusBadge debe encontrarse en el documento');
    assert.ok(badge.classList.contains('online'), 'Debe iniciar en modo online');
    const textEl = badge.querySelector('.badge-text');
    assert.strictEqual(textEl.textContent, 'Online');

    // Simular evento offline en window
    env.window.dispatchEvent(new env.DOMEvent('offline'));
    assert.ok(badge.classList.contains('offline'), 'Debe conmutar a clase offline');
    assert.strictEqual(badge.classList.contains('online'), false, 'Debe remover clase online');
    assert.strictEqual(textEl.textContent, 'Offline');

    // Simular evento online en window
    env.window.dispatchEvent(new env.DOMEvent('online'));
    assert.ok(badge.classList.contains('online'), 'Debe retornar a clase online');
    assert.strictEqual(badge.classList.contains('offline'), false, 'Debe remover clase offline');
    assert.strictEqual(textEl.textContent, 'Online');
  });

  console.log('\n==================================================');
  console.log(`RESUMEN PWA OFFLINE: Total: ${total} | Aprobadas: ${passed} | Falladas: ${failed}`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runPwaOfflineTests().catch(err => {
    console.error('Fallo no controlado en tests de PWA:', err);
    process.exit(1);
  });
}

module.exports = { runPwaOfflineTests };
