#!/usr/bin/env node
/**
 * Firma XML ACECF con certificado .p12 (Paso 3 DGII).
 *
 * Uso:
 *   npm run firmar-acecf
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Signature } from 'dgii-ecf';
import { acecfManifestPath } from './lib/acecfUtils.js';
import { isDgiiFeCertConfigured, loadCerts, loadEnvCert, readEncf } from './lib/certUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvCert(__dirname);

const salida = path.join(__dirname, 'salida');
const sinFirmar = path.join(salida, 'acecf-sin-firmar');
const firmados = path.join(salida, 'acecf-firmados');

function main() {
  if (!isDgiiFeCertConfigured()) {
    console.error('Configure .env.cert con DGII_FE_CERT_P12_PATH y DGII_FE_CERT_PASSWORD');
    process.exit(1);
  }

  const manifestPath = acecfManifestPath(__dirname);
  if (!fs.existsSync(manifestPath)) {
    console.error('No hay acecf-manifest.json. Ejecute primero: npm run generar-acecf');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const registros = manifest.registros || [];
  if (!registros.length) {
    console.error('acecf-manifest.json no tiene registros.');
    process.exit(1);
  }

  const missing = registros.filter((r) => !fs.existsSync(path.join(sinFirmar, r.archivo)));
  if (missing.length) {
    console.error('Faltan XML sin firmar:', missing.map((m) => m.archivo).join(', '));
    process.exit(1);
  }

  const certs = loadCerts();
  const signer = new Signature(certs.key, certs.cert);
  fs.mkdirSync(firmados, { recursive: true });

  console.log(`Firmando ${registros.length} ACECF con P12...\n`);

  for (const row of registros) {
    const src = path.join(sinFirmar, row.archivo);
    const xml = fs.readFileSync(src, 'utf8');
    if (!/<eNCF>/.test(xml)) {
      console.error(row.archivo, '— sin <eNCF> en origen');
      process.exit(1);
    }
    const signed = signer.signXml(xml, 'ACECF');
    if (!/<eNCF>/.test(signed) || /<ENCF>/.test(signed)) {
      console.error(row.archivo, '— la firma no conservó <eNCF>');
      process.exit(1);
    }
    const dest = path.join(firmados, row.archivo);
    fs.writeFileSync(dest, signed, 'utf8');
    console.log('OK', row.archivo, `(${readEncf(signed)})`);
  }

  console.log(`\n${registros.length} XML en salida/acecf-firmados/`);
  console.log('Siguiente: npm run enviar-acecf');
}

main();
