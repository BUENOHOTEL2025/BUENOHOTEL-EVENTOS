#!/usr/bin/env node
/**
 * Firma y envía solo E410000000001 + E340000000015 (última nota pendiente).
 * Un solo archivo — no depende de flags en firmar-xml-p12.js ni enviar-notas-pendientes.js.
 *
 * Uso: npm run notas-restante
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ECF, ENVIRONMENT, Signature } from 'dgii-ecf';
import {
  formatError,
  isDgiiFeCertConfigured,
  loadCerts,
  loadEnvCert,
  pollStatus,
  readEncf,
  setFechaHoraFirma,
  validateSignedEncf,
  fechaHoraFirmaNow
} from './lib/certUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvCert(__dirname);

const salida = path.join(__dirname, 'salida');
const sinFirmar = path.join(salida, 'ecf-sin-firmar');
const firmados = path.join(salida, 'ecf-firmados');
const outResults = path.join(salida, 'envio-resultados');

const ARCHIVOS = [
  { archivo: '131631088E410000000001.xml', encf: 'E410000000001', rol: 'referencia' },
  { archivo: '131631088E340000000015.xml', encf: 'E340000000015', rol: 'nota' }
];

function firmarPendientes() {
  const certs = loadCerts();
  const signer = new Signature(certs.key, certs.cert);
  fs.mkdirSync(firmados, { recursive: true });

  console.log('Firmando con P12 (preserva <eNCF>). FechaHoraFirma:', fechaHoraFirmaNow(), '\n');

  for (const entry of ARCHIVOS) {
    const src = path.join(sinFirmar, entry.archivo);
    if (!fs.existsSync(src)) {
      console.error('No existe:', src);
      console.error('Descargue dgii-xml-notas-restante-v10.zip y copie a salida/ecf-sin-firmar/');
      process.exit(1);
    }
    let xml = fs.readFileSync(src, 'utf8');
    if (!/<eNCF>/.test(xml)) {
      console.error(entry.archivo, '— sin <eNCF>; use el XML corregido de S3');
      process.exit(1);
    }
    if (entry.encf === 'E410000000001' && xml.includes('<PrecioUnitarioItem>10000.0000</PrecioUnitarioItem>')) {
      console.error(entry.archivo, '— PrecioUnitarioItem debe ser 10000.00 (no 10000.0000)');
      console.error('Descargue el XML actualizado desde S3.');
      process.exit(1);
    }
    xml = setFechaHoraFirma(xml);
    const signed = signer.signXml(xml, 'ECF');
    if (!/<eNCF>/.test(signed) || /<ENCF>/.test(signed)) {
      console.error(entry.archivo, '— la firma no conservó <eNCF>');
      process.exit(1);
    }
    fs.writeFileSync(path.join(firmados, entry.archivo), signed, 'utf8');
    console.log('OK', entry.archivo, `(${readEncf(signed)})`);
  }
  console.log('');
}

async function enviarCadena() {
  for (const entry of ARCHIVOS) {
    const filePath = path.join(firmados, entry.archivo);
    validateSignedEncf(fs.readFileSync(filePath, 'utf8'), entry.archivo);
  }

  fs.mkdirSync(outResults, { recursive: true });
  const ecf = new ECF(loadCerts(), ENVIRONMENT.CERT);

  console.log('Autenticando CerteCF...');
  await ecf.authenticate();
  console.log('Enviando E410001 → E340015...\n');

  const report = {
    enviadoEn: new Date().toISOString(),
    ambiente: 'CerteCF',
    modo: 'notas-restante',
    resultados: []
  };

  for (let i = 0; i < ARCHIVOS.length; i++) {
    const entry = ARCHIVOS[i];
    const xml = fs.readFileSync(path.join(firmados, entry.archivo), 'utf8');
    const label = `${i + 1}. [${entry.rol}] ${entry.archivo}`;
    process.stdout.write(`Enviando ${label}... `);

    try {
      const sendRes = await ecf.sendElectronicDocument(xml, entry.archivo);
      const trackId = sendRes?.trackId || sendRes?.TrackId;
      let status = null;
      if (trackId) status = await pollStatus(ecf, trackId);

      report.resultados.push({ ...entry, trackId, envio: sendRes, consulta: status });
      console.log(status?.estado || 'enviado', trackId ? `(${trackId})` : '');
      const msg = status?.mensajes?.map((m) => m.valor).filter(Boolean).join(' ');
      if (msg) console.log('  ', msg);
    } catch (err) {
      report.resultados.push({ ...entry, error: formatError(err) });
      console.log('ERROR');
      console.error(formatError(err));
    }
  }

  const outFile = path.join(outResults, `envio-notas-restante-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');
  console.log('\nReporte:', outFile);

  const nota = report.resultados.find((r) => r.rol === 'nota');
  const ok = nota?.consulta?.estado === 'Aceptado';
  console.log(ok ? '\n[OK] E340000000015 Aceptada — Paso 2 completo.' : '\n[AVISO] Revise el reporte JSON.');
  process.exit(ok ? 0 : 1);
}

async function main() {
  if (!isDgiiFeCertConfigured()) {
    console.error('Configure .env.cert con DGII_FE_CERT_P12_PATH y DGII_FE_CERT_PASSWORD');
    process.exit(1);
  }
  firmarPendientes();
  await enviarCadena();
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
