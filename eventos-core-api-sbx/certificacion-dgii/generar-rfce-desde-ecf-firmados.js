#!/usr/bin/env node
/**
 * Genera RFCE sin firmar a partir de los ECF 32 ya firmados.
 * El CodigoSeguridadeCF son los primeros 6 caracteres del SignatureValue del ECF.
 *
 * Orden correcto:
 *   1) Firmar los 4 ECF 32 (ecf-sin-firmar → ecf-firmados)
 *   2) npm run generar-rfce
 *   3) Firmar los 4 RFCE generados (rfce-sin-firmar → rfce-firmados)
 *
 * Uso: npm run generar-rfce
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { convertECF32ToRFCE } from 'dgii-ecf';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const salida = path.join(__dirname, 'salida');
const ecfFirmados = path.join(salida, 'ecf-firmados');
const rfceSinFirmar = path.join(salida, 'rfce-sin-firmar');
const manifestPath = path.join(salida, 'manifest.json');

function main() {
  if (!fs.existsSync(manifestPath)) {
    console.error('No hay manifest.json. Ejecute primero: npm run generar-xml');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const rfceList = manifest.rfce || [];
  if (!rfceList.length) {
    console.error('manifest.json no tiene entradas RFCE.');
    process.exit(1);
  }

  fs.mkdirSync(rfceSinFirmar, { recursive: true });

  const report = [];
  let errors = 0;

  for (const entry of rfceList) {
    const ecfPath = path.join(ecfFirmados, entry.archivo);
    const rfcePath = path.join(rfceSinFirmar, entry.archivo);

    if (!fs.existsSync(ecfPath)) {
      console.error('Falta ECF firmado:', ecfPath);
      errors++;
      continue;
    }

    const signedEcf = fs.readFileSync(ecfPath, 'utf8');
    if (!signedEcf.includes('<Signature')) {
      console.error('El ECF no está firmado:', entry.archivo);
      errors++;
      continue;
    }

    try {
      const { xml: rawXml, securityCode } = convertECF32ToRFCE(signedEcf);
      let xml = rawXml;
      if (!xml.includes('<eNCF>')) {
        if (!entry.encf) throw new Error('Falta encf en manifest para insertar eNCF');
        xml = xml.replace(
          /(<TipoeCF>\d+<\/TipoeCF>)/,
          `$1\n      <eNCF>${entry.encf}</eNCF>`
        );
      }
      if (xml.includes('<FechaHoraFirma>')) {
        throw new Error('RFCE generado no debe incluir FechaHoraFirma');
      }
      if (!xml.includes('<CodigoSeguridadeCF>')) {
        throw new Error('RFCE generado sin CodigoSeguridadeCF');
      }
      fs.writeFileSync(rfcePath, xml, 'utf8');
      report.push({ archivo: entry.archivo, encf: entry.encf, codigoSeguridadeCF: securityCode });
      console.log('OK', entry.archivo, '→ CodigoSeguridadeCF:', securityCode);
    } catch (err) {
      console.error('ERROR', entry.archivo, '-', err?.message || err);
      errors++;
    }
  }

  const outReport = path.join(salida, 'rfce-generados-desde-ecf.json');
  fs.writeFileSync(outReport, JSON.stringify({ generadoEn: new Date().toISOString(), report }, null, 2), 'utf8');

  if (errors) {
    console.error('\n', errors, 'error(es). Revise que los 4 ECF 32 estén firmados en ecf-firmados/.');
    process.exit(1);
  }

  console.log('\nListo —', report.length, 'RFCE en rfce-sin-firmar/.');
  console.log('Siguiente: firmar esos 4 XML con la App DGII → rfce-firmados/');
}

main();
