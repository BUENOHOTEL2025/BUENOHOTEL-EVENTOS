#!/usr/bin/env node
/**
 * Envía XML ya firmados por la dueña al ambiente CerteCF (Paso 2 DGII).
 * Requiere certificado .p12 solo para autenticación API (no firma aquí).
 *
 * Uso:
 *   DGII_FE_CERT_P12_PATH=../cert.p12 DGII_FE_CERT_PASSWORD=xxx npm run cert:enviar
 *   node certificacion-dgii/enviar-set-firmados.js --dry-run
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { ECF, ENVIRONMENT } from 'dgii-ecf';
import {
  formatError,
  isDgiiFeCertConfigured,
  loadCerts,
  pollStatus,
  validateSignedEncf
} from './lib/certUtils.js';
import { isPaso4Manifest } from './lib/paso4EncfMap.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

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

dotenv.config({ path: path.join(ROOT, '.env') });
dotenv.config({ path: path.join(__dirname, '.env.cert') });
applyCertFromArgs();

function argFlag(name) {
  return process.argv.includes(name);
}

/** Comprobantes ya Aceptados en CerteCF — no reenviar (secuenciaUtilizada). */
const YA_ACEPTADOS = new Set([
  'E320000000011',
  'E320000000012',
  'E320000000013',
  'E320000000014',
  'E410000000001',
  'E320000000006',
  'E310000000034',
  'E310000000007',
  'E310000000005',
  'E440000000007',
  'E450000000008',
  'E450000000001',
  'E460000000009',
  'E470000000008',
  'E430000000010',
  'E430000000011',
  'E410000000008',
  'E440000000010',
  'E310000000004',
  'E320000000004',
  'E330000000001',
  'E340000000002',
  'E340000000015'
]);

function sortOrdenByDependency(orden) {
  const rfce = orden.filter((e) => e.tipo === 'RFCE' || e.hoja === 'RFCE');
  const ecf = orden.filter((e) => e.tipo === 'ECF' || (e.hoja === 'ECF' && e.tipo !== 'RFCE'));
  const byEncf = new Map(ecf.map((e) => [e.encf, e]));
  const sorted = [];
  const done = new Set();

  function visit(entry) {
    if (!entry || done.has(entry.encf)) return;
    const dep = entry.ncfModificado || '';
    if (dep && byEncf.has(dep) && !done.has(dep)) visit(byEncf.get(dep));
    done.add(entry.encf);
    sorted.push(entry);
  }

  for (const entry of ecf) visit(entry);

  let paso = 0;
  return [...rfce, ...sorted].map((e) => ({ ...e, paso: ++paso }));
}

function filterOrden(orden, manifest) {
  const sorted = sortOrdenByDependency(orden);
  if (!argFlag('--omitir-aceptados')) return sorted;
  if (isPaso4Manifest(manifest)) {
    console.log('Paso 4 — enviando los 25 comprobantes (sin omitir aceptados previos).');
    return sorted;
  }

  const aceptados = new Set([...YA_ACEPTADOS, ...(manifest.yaAceptados || [])]);
  const filtered = sorted.filter((e) => !aceptados.has(e.encf));
  console.log(
    `Omitiendo ${sorted.length - filtered.length} ya aceptados (--omitir-aceptados). Quedan ${filtered.length}.`
  );
  return filtered.map((e, i) => ({ ...e, paso: i + 1 }));
}

const salida = path.resolve(__dirname, 'salida');
const manifestPath = path.join(salida, 'manifest.json');
const outResults = path.join(salida, 'envio-resultados');

function signedPath(entry) {
  const dir = entry.tipo === 'RFCE' || entry.hoja === 'RFCE' ? 'rfce-firmados' : 'ecf-firmados';
  return path.join(salida, dir, entry.archivo);
}

async function main() {
  if (!fs.existsSync(manifestPath)) {
    console.error('No hay manifest.json. Ejecute primero: npm run cert:generar-xml');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const orden = filterOrden(manifest.ordenEnvio || [], manifest);
  if (!orden.length) {
    console.error('manifest.json no tiene ordenEnvio.');
    process.exit(1);
  }

  const missing = orden.filter((e) => !fs.existsSync(signedPath(e)));
  if (missing.length) {
    console.error('Faltan XML firmados (' + missing.length + '):');
    for (const m of missing) console.error('  -', signedPath(m));
    console.error('\nLa dueña debe firmar y copiar a ecf-firmados/ y rfce-firmados/.');
    process.exit(1);
  }

  if (argFlag('--dry-run')) {
    console.log('Dry-run OK —', orden.length, 'archivos firmados listos para enviar.');
    for (const e of orden) {
      const isRfce = e.tipo === 'RFCE' || e.hoja === 'RFCE';
      if (!isRfce) {
        const xml = fs.readFileSync(signedPath(e), 'utf8');
        if (xml.includes('<ENCF>')) {
          console.warn(`  AVISO: ${e.archivo} tiene <ENCF> — use npm run firmar-p12`);
        }
      }
      console.log(`  ${e.paso}. [${e.tipo || e.hoja}] ${e.archivo} (${e.encf})`);
    }
    return;
  }

  if (!isDgiiFeCertConfigured()) {
    console.error('Certificado no configurado.');
    console.error('Cree el archivo .env.cert en esta carpeta (copie .env.cert.example).');
    console.error('O ejecute: node enviar-set-firmados.js --p12 "C:\\ruta\\cert.p12" --password "clave"');
    process.exit(1);
  }

  fs.mkdirSync(outResults, { recursive: true });
  const certs = loadCerts();
  const ecf = new ECF(certs, ENVIRONMENT.CERT);

  console.log('Autenticando en CerteCF (ecf.dgii.gov.do / fc.dgii.gov.do)...');
  await ecf.authenticate();
  const rfceCount = orden.filter((e) => e.tipo === 'RFCE' || e.hoja === 'RFCE').length;
  const ecfCount = orden.length - rfceCount;
  console.log(
    `OK — token obtenido. API: ${orden.length} comprobantes (${rfceCount} RFCE + ${ecfCount} ECF).`
  );
  console.log('IMPORTANTE: DGII exige enviar los 25 en un solo lote (orden del manifest).');
  console.log('No envíe solo los rechazados — reinicia el progreso en CerteCF.');
  console.log('(Los 4 FC32 ECF íntegros van solo por portal, después de 25/25 API.)\n');

  const report = {
    enviadoEn: new Date().toISOString(),
    ambiente: 'CerteCF',
    resultados: []
  };

  for (const entry of orden) {
    const filePath = signedPath(entry);
    const xml = fs.readFileSync(filePath, 'utf8');
    const isRfce = entry.tipo === 'RFCE' || entry.hoja === 'RFCE';
    const label = `${entry.paso}. ${entry.archivo}`;

    if (!isRfce) {
      try {
        validateSignedEncf(xml, entry.archivo);
      } catch (err) {
        console.error('\n' + err.message);
        process.exit(1);
      }
    }

    process.stdout.write(`Enviando ${label}... `);
    try {
      const sendRes = isRfce
        ? await ecf.sendSummary(xml, entry.archivo)
        : await ecf.sendElectronicDocument(xml, entry.archivo);

      const trackId = sendRes?.trackId || sendRes?.TrackId;
      let status = null;
      if (trackId) {
        status = await pollStatus(ecf, trackId);
      }

      const row = {
        archivo: entry.archivo,
        tipo: isRfce ? 'RFCE' : 'ECF',
        encf: entry.encf,
        trackId,
        envio: sendRes,
        consulta: status
      };
      report.resultados.push(row);
      console.log(status?.estado || sendRes?.estado || 'enviado', trackId ? `(${trackId})` : '');
    } catch (err) {
      const row = {
        archivo: entry.archivo,
        tipo: isRfce ? 'RFCE' : 'ECF',
        encf: entry.encf,
        error: formatError(err)
      };
      report.resultados.push(row);
      console.log('ERROR');
      console.error(row.error);
    }
  }

  const outFile = path.join(outResults, `envio-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');
  console.log('\nReporte:', outFile);

  const failed = report.resultados.filter((r) => r.error || (r.consulta && r.consulta.estado !== 'Aceptado'));
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
