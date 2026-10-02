#!/usr/bin/env node
/**
 * Convierte los HTML de Paso 5 a PDF automáticamente (Puppeteer/Chrome).
 *
 *   npm run paso5-pdf
 *   npm run paso5          (generar HTML + PDF)
 *
 * Salida: salida/representacion-impresa/pdf/*.pdf
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { buildPaso5Slots } from './lib/paso5Slots.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadPuppeteer() {
  try {
    return require('puppeteer');
  } catch {
    console.error('ERROR: falta el paquete puppeteer.');
    console.error('Ejecute primero:  npm install');
    console.error('O doble clic en:    instalar-paso5.bat');
    console.error('');
    console.error('Si solo va a subir al portal, use los PDF ya incluidos en la carpeta pdf\\ del ZIP.');
    process.exit(1);
  }
}
const htmlDir = path.join(__dirname, 'salida', 'representacion-impresa');
const pdfDir = path.join(htmlDir, 'pdf');

async function main() {
  const puppeteer = loadPuppeteer();
  const slots = buildPaso5Slots();
  const missing = slots.filter((s) => !fs.existsSync(path.join(htmlDir, s.htmlName)));
  if (missing.length) {
    console.error('Faltan HTML. Ejecute primero: npm run paso5-generar');
    for (const s of missing) console.error(' -', s.htmlName);
    process.exit(1);
  }

  fs.mkdirSync(pdfDir, { recursive: true });

  console.log('Generando PDF (Chrome headless)...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.emulateMediaType('print');

    let totalBytes = 0;
    for (const slot of slots) {
      const htmlPath = path.join(htmlDir, slot.htmlName);
      const pdfPath = path.join(pdfDir, slot.pdfName);
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0', timeout: 60000 });
      await page.pdf({
        path: pdfPath,
        format: 'Letter',
        printBackground: true,
        preferCSSPageSize: false,
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
      });
      const size = fs.statSync(pdfPath).size;
      totalBytes += size;
      console.log(`OK ${slot.pdfName} (${(size / 1024).toFixed(1)} KB) — ${slot.portalLabel}`);
    }

    const totalMb = totalBytes / (1024 * 1024);
    console.log(`\nListo — ${pdfDir}`);
    console.log(`Total: ${slots.length} PDF, ${totalMb.toFixed(2)} MB (límite DGII: 10 MB)`);
    if (totalMb > 10) {
      console.warn('AVISO: supera 10 MB — comprima o suba en lotes si el portal lo permite.');
    }
    console.log('\nSubir cada PDF al campo correspondiente en CerteCF Paso 5.');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('ERROR', err.message || err);
  process.exit(1);
});
