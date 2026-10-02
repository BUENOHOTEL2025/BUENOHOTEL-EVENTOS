#!/usr/bin/env node
/**
 * Envía ACECF firmados al servicio AprobacionComercial (Paso 3 DGII).
 *
 * Uso:
 *   npm run enviar-acecf
 *   node enviar-acecf-paso3.js --dry-run
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { ECF, ENVIRONMENT } from 'dgii-ecf';
import { acecfManifestPath } from './lib/acecfUtils.js';
import { formatError, isDgiiFeCertConfigured, loadCerts, loadEnvCert } from './lib/certUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(ROOT, '.env') });
loadEnvCert(__dirname);

function argFlag(name) {
  return process.argv.includes(name);
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return '';
}

function applyCertFromArgs() {
  const p12 = argValue('--p12');
  const pass = argValue('--password');
  if (p12) process.env.DGII_FE_CERT_P12_PATH = p12;
  if (pass) process.env.DGII_FE_CERT_PASSWORD = pass;
}

applyCertFromArgs();

const salida = path.join(__dirname, 'salida');
const firmados = path.join(salida, 'acecf-firmados');
const outResults = path.join(salida, 'acecf-resultados');

async function main() {
  const manifestPath = acecfManifestPath(__dirname);
  if (!fs.existsSync(manifestPath)) {
    console.error('No hay acecf-manifest.json. Ejecute: npm run generar-acecf');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const registros = manifest.registros || [];
  if (!registros.length) {
    console.error('acecf-manifest.json vacío.');
    process.exit(1);
  }

  const missing = registros.filter((r) => !fs.existsSync(path.join(firmados, r.archivo)));
  if (missing.length) {
    console.error('Faltan XML firmados (' + missing.length + '):');
    for (const m of missing) console.error('  -', m.archivo);
    console.error('\nEjecute: npm run firmar-acecf');
    process.exit(1);
  }

  if (argFlag('--dry-run')) {
    console.log('Dry-run OK —', registros.length, 'ACECF listos para enviar.');
    registros.forEach((r, i) => console.log(`  ${i + 1}. ${r.archivo} (${r.encf})`));
    return;
  }

  if (!isDgiiFeCertConfigured()) {
    console.error('Certificado no configurado (.env.cert).');
    process.exit(1);
  }

  fs.mkdirSync(outResults, { recursive: true });
  const certs = loadCerts();
  const ecf = new ECF(certs, ENVIRONMENT.CERT);

  console.log('Autenticando en CerteCF (AprobacionComercial)...');
  await ecf.authenticate();
  console.log(`OK — enviando ${registros.length} aprobaciones comerciales.\n`);

  const report = {
    enviadoEn: new Date().toISOString(),
    ambiente: 'CerteCF',
    servicio: 'AprobacionComercial',
    resultados: []
  };

  for (let i = 0; i < registros.length; i++) {
    const row = registros[i];
    const filePath = path.join(firmados, row.archivo);
    const xml = fs.readFileSync(filePath, 'utf8');
    const label = `${i + 1}. ${row.archivo}`;

    process.stdout.write(`Enviando ${label}... `);
    try {
      const res = await ecf.sendCommercialApproval(xml, row.archivo);
      const ok =
        res?.codigo === '01' ||
        /Aprobada/i.test(String(res?.estado || ''));
      const result = {
        archivo: row.archivo,
        encf: row.encf,
        respuesta: res,
        aceptado: ok
      };
      report.resultados.push(result);
      console.log(res?.estado || res?.codigo || 'enviado');
      if (!ok && res?.mensaje?.length) {
        console.error('  ', res.mensaje.join('; '));
      }
    } catch (err) {
      const result = {
        archivo: row.archivo,
        encf: row.encf,
        error: formatError(err),
        aceptado: false
      };
      report.resultados.push(result);
      console.log('ERROR');
      console.error(result.error);
    }
  }

  const outFile = path.join(outResults, `envio-acecf-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');
  console.log('\nReporte:', outFile);

  const failed = report.resultados.filter((r) => !r.aceptado);
  const okCount = report.resultados.length - failed.length;
  console.log(`\nResumen: ${okCount}/${report.resultados.length} aceptadas por DGII`);
  console.log('Verifique en el portal Paso 3: debe mostrar 11/11 aprobaciones aceptadas.');

  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
