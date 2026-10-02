#!/usr/bin/env node
/**
 * Envía las 3 notas pendientes junto con sus comprobantes referenciados (orden padre → nota).
 * Necesario cuando los padres se aceptaron con <ENCF> y las notas fallan con error 614.
 *
 * Uso: npm run enviar-notas
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ECF, ENVIRONMENT } from 'dgii-ecf';
import {
  formatError,
  isDgiiFeCertConfigured,
  loadCerts,
  loadEnvCert,
  pollStatus,
  validateSignedEncf
} from './lib/certUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvCert(__dirname);

const salida = path.join(__dirname, 'salida');
const firmados = path.join(salida, 'ecf-firmados');
const outResults = path.join(salida, 'envio-resultados');

/** Padre inmediatamente antes de cada nota (6 envíos). */
const CADENA = [
  { archivo: '131631088E320000000006.xml', encf: 'E320000000006', rol: 'referencia' },
  { archivo: '131631088E330000000001.xml', encf: 'E330000000001', rol: 'nota' },
  { archivo: '131631088E310000000034.xml', encf: 'E310000000034', rol: 'referencia' },
  { archivo: '131631088E340000000002.xml', encf: 'E340000000002', rol: 'nota' },
  { archivo: '131631088E410000000001.xml', encf: 'E410000000001', rol: 'referencia' },
  { archivo: '131631088E340000000015.xml', encf: 'E340000000015', rol: 'nota' }
];

async function main() {
  if (!isDgiiFeCertConfigured()) {
    console.error('Configure .env.cert con DGII_FE_CERT_P12_PATH y DGII_FE_CERT_PASSWORD');
    process.exit(1);
  }

  for (const entry of CADENA) {
    const filePath = path.join(firmados, entry.archivo);
    if (!fs.existsSync(filePath)) {
      console.error('Falta firmado:', filePath);
      console.error('Ejecute primero: npm run firmar-p12 -- --pendientes-notas');
      process.exit(1);
    }
    const xml = fs.readFileSync(filePath, 'utf8');
    try {
      validateSignedEncf(xml, entry.archivo);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }

  fs.mkdirSync(outResults, { recursive: true });
  const ecf = new ECF(loadCerts(), ENVIRONMENT.CERT);

  console.log('Autenticando CerteCF...');
  await ecf.authenticate();
  console.log('Enviando cadena referencia → nota (6 comprobantes)...\n');

  const report = {
    enviadoEn: new Date().toISOString(),
    ambiente: 'CerteCF',
    modo: 'notas-con-referencias',
    resultados: []
  };

  for (let i = 0; i < CADENA.length; i++) {
    const entry = CADENA[i];
    const xml = fs.readFileSync(path.join(firmados, entry.archivo), 'utf8');
    const label = `${i + 1}. [${entry.rol}] ${entry.archivo}`;
    process.stdout.write(`Enviando ${label}... `);

    try {
      const sendRes = await ecf.sendElectronicDocument(xml, entry.archivo);
      const trackId = sendRes?.trackId || sendRes?.TrackId;
      let status = null;
      if (trackId) status = await pollStatus(ecf, trackId);

      const row = { archivo: entry.archivo, encf: entry.encf, rol: entry.rol, trackId, envio: sendRes, consulta: status };
      report.resultados.push(row);
      console.log(status?.estado || 'enviado', trackId ? `(${trackId})` : '');
      if (status?.mensajes?.length) {
        const msg = status.mensajes.map((m) => m.valor).filter(Boolean).join(' ');
        if (msg) console.log('  ', msg);
      }
    } catch (err) {
      report.resultados.push({ archivo: entry.archivo, encf: entry.encf, rol: entry.rol, error: formatError(err) });
      console.log('ERROR');
      console.error(formatError(err));
    }
  }

  const outFile = path.join(outResults, `envio-notas-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');
  console.log('\nReporte:', outFile);

  const notas = report.resultados.filter((r) => r.rol === 'nota');
  const notasOk = notas.filter((r) => r.consulta?.estado === 'Aceptado');
  const notasFail = notas.filter((r) => r.error || r.consulta?.estado !== 'Aceptado');

  console.log(`\nNotas: ${notasOk.length}/3 Aceptadas`);
  if (notasFail.length) {
    console.log('\nSi los padres responden "secuencia utilizada" pero las notas siguen en 614,');
    console.log('contacte soporte DGII CerteCF para reiniciar secuencias del Paso 2.');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
