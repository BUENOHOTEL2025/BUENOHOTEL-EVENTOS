#!/usr/bin/env node
/**
 * Envía solo 2 comprobantes de prueba (1 RFCE + 1 ECF) ya firmados.
 * Uso: npm run enviar-prueba
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { ECF, ENVIRONMENT, P12Reader } from 'dgii-ecf';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env.cert') });

const salida = path.join(__dirname, 'salida');
const PRUEBA = [
  { archivo: '131631088E320000000014.xml', tipo: 'RFCE', encf: 'E320000000014' },
  { archivo: '131631088E330000000001.xml', tipo: 'ECF', encf: 'E330000000001' }
];

function formatError(err) {
  const data = err?.response?.data;
  if (data != null && typeof data === 'object') {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }
  if (data != null) return String(data);
  return err?.message || String(err);
}

function validateSignedXml(entry, xml) {
  if (!xml.includes('<eNCF>')) {
    throw new Error(`Falta <eNCF> en ${entry.archivo}`);
  }
  if (xml.includes('<ENCF>')) {
    throw new Error(`Tag invalido <ENCF> en ${entry.archivo} — refirmar desde sin-firmar corregido`);
  }
  if (entry.tipo === 'RFCE') {
    if (!xml.includes('<CodigoSeguridadeCF>')) {
      throw new Error(
        `RFCE ${entry.archivo} sin CodigoSeguridadeCF. Ejecute: npm run generar-rfce (después de firmar el ECF 32 correspondiente)`
      );
    }
    if (xml.includes('<FechaHoraFirma>')) {
      throw new Error(
        `RFCE ${entry.archivo} tiene FechaHoraFirma — refirmar desde rfce-sin-firmar generado con npm run generar-rfce`
      );
    }
  }
}

function signedPath(entry) {
  const dir = entry.tipo === 'RFCE' ? 'rfce-firmados' : 'ecf-firmados';
  return path.join(salida, dir, entry.archivo);
}

function loadCerts() {
  const pass = String(process.env.DGII_FE_CERT_PASSWORD || '');
  const filePath = String(process.env.DGII_FE_CERT_P12_PATH || '').trim();
  if (!pass || !filePath) throw new Error('Configure .env.cert con DGII_FE_CERT_P12_PATH y DGII_FE_CERT_PASSWORD');
  return new P12Reader(pass).getKeyFromFile(path.resolve(filePath));
}

async function main() {
  for (const e of PRUEBA) {
    if (!fs.existsSync(signedPath(e))) {
      console.error('Falta firmado:', signedPath(e));
      process.exit(1);
    }
  }

  const ecf = new ECF(loadCerts(), ENVIRONMENT.CERT);
  console.log('Autenticando CerteCF...');
  await ecf.authenticate();

  for (const entry of PRUEBA) {
    const xml = fs.readFileSync(signedPath(entry), 'utf8');
    try {
      validateSignedXml(entry, xml);
    } catch (err) {
      console.error('ERROR:', err.message);
      process.exit(1);
    }
    process.stdout.write(`Enviando ${entry.tipo} ${entry.archivo}... `);
    try {
      const res =
        entry.tipo === 'RFCE'
          ? await ecf.sendSummary(xml, entry.archivo)
          : await ecf.sendElectronicDocument(xml, entry.archivo);
      console.log('OK', res?.trackId || res?.estado || '');
      if (res?.trackId) {
        const st = await ecf.statusTrackId(res.trackId);
        console.log('  Estado:', st?.estado, st?.mensajes?.[0]?.valor || '');
      }
    } catch (err) {
      console.log('ERROR');
      console.error(formatError(err));
      process.exit(1);
    }
  }
  console.log('\nPrueba OK — puede firmar y enviar los 25 (vía API).');
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
