#!/usr/bin/env node
/**
 * Firma XML con el certificado .p12 preservando <eNCF> (la App DGII suele cambiarlo a <ENCF>).
 *
 * Uso:
 *   npm run firmar-p12 -- --pendientes-notas
 *   npm run firmar-p12 -- salida/ecf-sin-firmar/131631088E330000000001.xml
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Signature } from 'dgii-ecf';
import {
  fechaHoraFirmaNow,
  isDgiiFeCertConfigured,
  loadCerts,
  loadEnvCert,
  readEncf,
  setFechaHoraFirma
} from './lib/certUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvCert(__dirname);

const salida = path.join(__dirname, 'salida');
const sinFirmar = path.join(salida, 'ecf-sin-firmar');
const firmados = path.join(salida, 'ecf-firmados');

const PENDIENTES_NOTAS = [
  '131631088E320000000006.xml',
  '131631088E330000000001.xml',
  '131631088E310000000034.xml',
  '131631088E340000000002.xml',
  '131631088E410000000001.xml',
  '131631088E340000000015.xml'
];

const RESTANTE_NOTAS = ['131631088E410000000001.xml', '131631088E340000000015.xml'];

const FC32_PORTAL = new Set([
  '131631088E320000000011.xml',
  '131631088E320000000012.xml',
  '131631088E320000000013.xml',
  '131631088E320000000014.xml'
]);

function printSiguiente(basenames) {
  const set = new Set(basenames);
  if (set.size === 4 && [...set].every((b) => FC32_PORTAL.has(b))) {
    console.log(
      '\nGuardados en ecf-firmados/. Siguiente: portal DGII → Facturas de consumo < 250Mil (4 archivos ECF, NO RFCE).'
    );
    return;
  }
  if (argFlag('--restante')) {
    console.log('\nGuardados en ecf-firmados/. Siguiente: node notas-restante.js');
    return;
  }
  if (argFlag('--pendientes-notas') || [...set].some((b) => PENDIENTES_NOTAS.includes(b))) {
    console.log('\nGuardados en ecf-firmados/. Siguiente: npm run enviar-notas');
    return;
  }
  console.log('\nGuardados en ecf-firmados/.');
}

function argFlag(name) {
  return process.argv.includes(name);
}

function resolveInputs() {
  if (argFlag('--restante')) {
    return RESTANTE_NOTAS.map((f) => path.join(sinFirmar, f));
  }
  if (argFlag('--pendientes-notas')) {
    return PENDIENTES_NOTAS.map((f) => path.join(sinFirmar, f));
  }
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!args.length) {
    console.error('Indique archivos, use --pendientes-notas o --restante');
    process.exit(1);
  }
  return args.map((a) => path.resolve(process.cwd(), a));
}

function main() {
  if (!isDgiiFeCertConfigured()) {
    console.error('Configure .env.cert con DGII_FE_CERT_P12_PATH y DGII_FE_CERT_PASSWORD');
    process.exit(1);
  }

  const inputs = resolveInputs();
  const certs = loadCerts();
  const signer = new Signature(certs.key, certs.cert);
  fs.mkdirSync(firmados, { recursive: true });

  console.log('Firmando con P12 (preserva <eNCF>). FechaHoraFirma:', fechaHoraFirmaNow(), '\n');

  const signedBases = [];

  for (const src of inputs) {
    if (!fs.existsSync(src)) {
      console.error('No existe:', src);
      process.exit(1);
    }
    const base = path.basename(src);
    let xml = fs.readFileSync(src, 'utf8');
    if (!/<eNCF>/.test(xml)) {
      console.error(base, '— sin <eNCF> en origen; regenere con npm run generar-xml');
      process.exit(1);
    }
    xml = setFechaHoraFirma(xml);
    const signed = signer.signXml(xml, 'ECF');
    if (!/<eNCF>/.test(signed) || /<ENCF>/.test(signed)) {
      console.error(base, '— la firma no conservó <eNCF>');
      process.exit(1);
    }
    const encf = readEncf(signed);
    const dest = path.join(firmados, base);
    fs.writeFileSync(dest, signed, 'utf8');
    signedBases.push(base);
    console.log('OK', base, `(${encf})`);
  }

  printSiguiente(signedBases);
}

main();
