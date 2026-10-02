#!/usr/bin/env node
/**
 * Genera HTML de Representación Impresa (Paso 5) desde los ECF firmados del Paso 4.
 *
 *   npm run paso5-generar
 *
 * Salida: salida/representacion-impresa/*.html + index.html
 * Luego: abrir cada HTML → Ctrl+P → Guardar como PDF → subir al portal CerteCF.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';
import {
  ENVIRONMENT,
  generateEcfQRCodeURL,
  generateFcQRCodeURL,
  getCodeSixDigitfromSignature
} from 'dgii-ecf';
import { buildPaso5Slots } from './lib/paso5Slots.js';
import { parseEcfXml } from './lib/parseEcfXml.js';
import { renderPaso5IndexHtml, renderRepresentacionImpresaHtml } from './lib/renderRepresentacionImpresa.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const salida = path.join(__dirname, 'salida');
const ecfFirmados = path.join(salida, 'ecf-firmados');
const outDir = path.join(salida, 'representacion-impresa');

function readSignedXml(archivo) {
  const firmado = path.join(ecfFirmados, archivo);
  if (fs.existsSync(firmado)) return { xml: fs.readFileSync(firmado, 'utf8'), source: firmado };
  const sinFirmar = path.join(salida, 'ecf-sin-firmar', archivo);
  if (fs.existsSync(sinFirmar)) {
    console.warn(`AVISO: ${archivo} sin firma — use ecf-firmados/ para QR válido`);
    return { xml: fs.readFileSync(sinFirmar, 'utf8'), source: sinFirmar };
  }
  throw new Error(`No se encontró ${archivo} en ecf-firmados/ ni ecf-sin-firmar/`);
}

async function buildQr(doc, slot, signedXml) {
  if (!signedXml.includes('<SignatureValue>')) {
    return { qrUrl: '(sin firma)', qrDataUrl: '', codigoSeguridad: '------' };
  }
  const codigoSeguridad = getCodeSixDigitfromSignature(signedXml);
  const monto = Number(doc.montoTotal || 0);
  const montoStr = Number.isFinite(monto) ? monto.toFixed(2) : String(doc.montoTotal || '0.00');

  const qrUrl = slot.qrFc
    ? generateFcQRCodeURL(doc.rncEmisor, doc.encf, monto, codigoSeguridad, ENVIRONMENT.CERT)
    : generateEcfQRCodeURL(
        doc.rncEmisor,
        doc.rncComprador,
        doc.encf,
        montoStr,
        doc.fechaEmision,
        doc.fechaHoraFirma,
        codigoSeguridad,
        ENVIRONMENT.CERT
      );

  const qrDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, width: 200 });
  return { qrUrl, qrDataUrl, codigoSeguridad };
}

async function main() {
  const slots = buildPaso5Slots();
  fs.mkdirSync(outDir, { recursive: true });

  const manifest = [];
  for (const slot of slots) {
    const { xml, source } = readSignedXml(slot.archivo);
    const doc = parseEcfXml(xml);
    const { qrUrl, qrDataUrl, codigoSeguridad } = await buildQr(doc, slot, xml);
    const html = renderRepresentacionImpresaHtml({ slot, doc, qrDataUrl, codigoSeguridad });
    const htmlPath = path.join(outDir, slot.htmlName);
    fs.writeFileSync(htmlPath, html, 'utf8');
    manifest.push({ ...slot, source, codigoSeguridad, qrUrl });
    console.log(`OK ${slot.htmlName} ← ${path.basename(source)} (${doc.encf})`);
  }

  fs.writeFileSync(path.join(outDir, 'index.html'), renderPaso5IndexHtml(manifest), 'utf8');
  fs.writeFileSync(
    path.join(outDir, 'manifest-paso5.json'),
    JSON.stringify({ generadoEn: new Date().toISOString(), archivos: manifest }, null, 2),
    'utf8'
  );

  console.log('\nListo —', outDir);
  console.log('Abra index.html → imprima cada representación como PDF → suba al portal Paso 5.');
  console.log('Total archivos:', slots.length, '(deben ser < 10 MB en conjunto).');
}

main().catch((err) => {
  console.error('ERROR', err.message || err);
  process.exit(1);
});
