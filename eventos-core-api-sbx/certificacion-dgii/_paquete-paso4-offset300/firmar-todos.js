#!/usr/bin/env node
/**
 * Firma los 29 XML del Paso 2 DGII con P12 (preserva <eNCF>).
 *
 *   25 ECF  → ecf-firmados/
 *   4 RFCE  → generados desde los 4 FC32 firmados → rfce-firmados/
 *
 * Uso:
 *   npm run preparar          (parchear + validar ECF)
 *   npm run firmar-todos
 *   npm run enviar-api        (25 por API)
 *   portal: 4 FC32 <250k desde ecf-firmados/
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Signature, convertECF32ToRFCE } from 'dgii-ecf';
import {
  fechaHoraFirmaNow,
  isDgiiFeCertConfigured,
  loadCerts,
  loadEnvCert,
  readEncf,
  setFechaHoraFirma
} from './lib/certUtils.js';

import { isPaso4Manifest } from './lib/paso4EncfMap.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvCert(__dirname);

const salida = path.join(__dirname, 'salida');
const ecfSinFirmar = path.join(salida, 'ecf-sin-firmar');
const ecfFirmados = path.join(salida, 'ecf-firmados');
const rfceSinFirmar = path.join(salida, 'rfce-sin-firmar');
const rfceFirmados = path.join(salida, 'rfce-firmados');
const manifestPath = path.join(salida, 'manifest.json');

const FC32_PORTAL_FALLBACK = [
  '131631088E320000000011.xml',
  '131631088E320000000012.xml',
  '131631088E320000000013.xml',
  '131631088E320000000014.xml'
];

function fc32PortalArchivos(manifest) {
  const omitidos = manifest.omitidosEnvioApi || manifest.ecf?.filter((e) => e.omitirEnvioApi) || [];
  const fromManifest = omitidos.map((e) => e.archivo).filter(Boolean);
  return fromManifest.length ? fromManifest : FC32_PORTAL_FALLBACK;
}

function signEcf(signer, srcPath, destDir) {
  const base = path.basename(srcPath);
  let xml = fs.readFileSync(srcPath, 'utf8');
  if (!/<eNCF>/.test(xml)) {
    throw new Error(`${base}: sin <eNCF> — ejecute npm run parchear-xml`);
  }
  xml = setFechaHoraFirma(xml);
  const signed = signer.signXml(xml, 'ECF');
  if (!/<eNCF>/.test(signed) || /<ENCF>/.test(signed)) {
    throw new Error(`${base}: la firma no conservó <eNCF>`);
  }
  fs.writeFileSync(path.join(destDir, base), signed, 'utf8');
  return { base, encf: readEncf(signed) };
}

function generarRfceDesdeEcfFirmado(entry) {
  const ecfPath = path.join(ecfFirmados, entry.archivo);
  const signedEcf = fs.readFileSync(ecfPath, 'utf8');
  if (!signedEcf.includes('<Signature')) {
    throw new Error(`ECF no firmado: ${entry.archivo}`);
  }
  const { xml: rawXml, securityCode } = convertECF32ToRFCE(signedEcf);
  let xml = rawXml;
  if (!xml.includes('<eNCF>')) {
    xml = xml.replace(/(<TipoeCF>\d+<\/TipoeCF>)/, `$1\n      <eNCF>${entry.encf}</eNCF>`);
  }
  if (xml.includes('<FechaHoraFirma>')) {
    throw new Error(`RFCE generado con FechaHoraFirma: ${entry.archivo}`);
  }
  if (!xml.includes('<CodigoSeguridadeCF>')) {
    throw new Error(`RFCE sin CodigoSeguridadeCF: ${entry.archivo}`);
  }
  fs.writeFileSync(path.join(rfceSinFirmar, entry.archivo), xml, 'utf8');
  return securityCode;
}

function signRfce(signer, srcPath) {
  const base = path.basename(srcPath);
  const xml = fs.readFileSync(srcPath, 'utf8');
  if (!/<eNCF>/.test(xml)) {
    throw new Error(`${base}: RFCE sin <eNCF>`);
  }
  if (!xml.includes('<CodigoSeguridadeCF>')) {
    throw new Error(`${base}: RFCE sin CodigoSeguridadeCF — regenere con firmar-todos`);
  }
  const signed = signer.signXml(xml, 'RFCE');
  if (!/<eNCF>/.test(signed) || /<ENCF>/.test(signed)) {
    throw new Error(`${base}: la firma RFCE no conservó <eNCF>`);
  }
  fs.writeFileSync(path.join(rfceFirmados, base), signed, 'utf8');
  return { base, encf: readEncf(signed) };
}

function main() {
  if (!fs.existsSync(manifestPath)) {
    console.error('No hay manifest.json');
    process.exit(1);
  }
  if (!isDgiiFeCertConfigured()) {
    console.error('Configure .env.cert con DGII_FE_CERT_P12_PATH y DGII_FE_CERT_PASSWORD');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const ecfList = manifest.ecf || [];
  const rfceList = manifest.rfce || [];
  const FC32_PORTAL = fc32PortalArchivos(manifest);
  const pasoLabel = isPaso4Manifest(manifest) ? 'Paso 4' : 'Paso 2';

  if (ecfList.length !== 25) {
    console.warn(`AVISO: manifest tiene ${ecfList.length} ECF (esperado 25).`);
  }

  const missingEcf = ecfList.filter((e) => !fs.existsSync(path.join(ecfSinFirmar, e.archivo)));
  if (missingEcf.length) {
    console.error('Faltan ECF sin firmar (' + missingEcf.length + '):');
    for (const m of missingEcf) console.error('  -', m.archivo);
    process.exit(1);
  }

  const certs = loadCerts();
  const signer = new Signature(certs.key, certs.cert);
  fs.mkdirSync(ecfFirmados, { recursive: true });
  fs.mkdirSync(rfceSinFirmar, { recursive: true });
  fs.mkdirSync(rfceFirmados, { recursive: true });

  console.log(`=== Firmar 29 XML (${pasoLabel}, P12, <eNCF>) ===`);
  console.log('FechaHoraFirma ECF:', fechaHoraFirmaNow(), '\n');

  console.log('--- Paso 1/3: 25 ECF ---');
  const fc32First = [
    ...FC32_PORTAL.map((f) => ecfList.find((e) => e.archivo === f)).filter(Boolean),
    ...ecfList.filter((e) => !FC32_PORTAL.includes(e.archivo))
  ];

  for (const entry of fc32First) {
    const src = path.join(ecfSinFirmar, entry.archivo);
    const { base, encf } = signEcf(signer, src, ecfFirmados);
    console.log('OK ECF', base, `(${encf})`);
  }

  console.log('\n--- Paso 2/3: generar 4 RFCE desde FC32 firmados ---');
  const rfceReport = [];
  for (const entry of rfceList) {
    const code = generarRfceDesdeEcfFirmado(entry);
    rfceReport.push({ archivo: entry.archivo, encf: entry.encf, codigoSeguridadeCF: code });
    console.log('OK RFCE gen', entry.archivo, '→ CodigoSeguridadeCF:', code);
  }
  fs.writeFileSync(
    path.join(salida, 'rfce-generados-desde-ecf.json'),
    JSON.stringify({ generadoEn: new Date().toISOString(), report: rfceReport }, null, 2),
    'utf8'
  );

  console.log('\n--- Paso 3/3: firmar 4 RFCE ---');
  for (const entry of rfceList) {
    const src = path.join(rfceSinFirmar, entry.archivo);
    const { base, encf } = signRfce(signer, src);
    console.log('OK RFCE', base, `(${encf})`);
  }

  console.log('\n=== Listo: 29/29 firmados ===');
  console.log('  ecf-firmados/  → 25 ECF');
  console.log('  rfce-firmados/ → 4 RFCE');
  console.log('\nSiguiente (API — los 25 juntos, nunca solo los rechazados):');
  console.log('  npm run enviar-api');
  console.log('  (o npm run reenviar-api-25 si aún no parcheó/firmó en este paso)');
  console.log('\nCuando API = 25/25 Aceptados → portal web (solo 4 FC32 ECF):');
  console.log('  archivos omitidosEnvioApi desde ecf-firmados/ → Facturas consumo < 250Mil');
  for (const f of FC32_PORTAL) console.log('   -', f);
}

main();
