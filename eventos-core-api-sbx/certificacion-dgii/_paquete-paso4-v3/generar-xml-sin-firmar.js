#!/usr/bin/env node
/**
 * Genera XML sin firmar desde el Excel oficial del Paso 2 DGII.
 * La dueña firma después con la App de Firma Digital DGII.
 *
 * Uso:
 *   node certificacion-dgii/generar-xml-sin-firmar.js
 *   node certificacion-dgii/generar-xml-sin-firmar.js --excel ../131631088-26062026133112.xlsx
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { Transformer } from 'dgii-ecf';
import { flatRowToDocument } from './lib/flatRowToDocument.js';
import { buildPaso4PatchSets, isPaso4Manifest } from './lib/paso4EncfMap.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const excelPath = path.resolve(ROOT, argValue('--excel', '../131631088-26062026133112.xlsx'));
const outDir = path.resolve(__dirname, 'salida');
const outEcf = path.join(outDir, 'ecf-sin-firmar');
const outRfce = path.join(outDir, 'rfce-sin-firmar');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function cleanXmlDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (f.toLowerCase().endsWith('.xml')) fs.unlinkSync(path.join(dir, f));
  }
}

function sheetRows(wb, name) {
  const ws = wb.Sheets[name];
  if (!ws) return { headers: [], rows: [] };
  const all = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const headers = all[0] || [];
  const rows = all.slice(1).filter((r) => r.some((c) => String(c || '').trim() !== ''));
  return { headers, rows };
}

function writeXml(transformer, docObj, filePath) {
  const xml = transformer.json2xml(docObj, true);
  fs.writeFileSync(filePath, xml, 'utf8');
}

const PASO2_RFCE_FC32_ENCF = new Set(['E320000000011', 'E320000000012', 'E320000000013', 'E320000000014']);

function isFc32ResumenB2c(entry, doc, rfceFc32Set) {
  const monto = Number(doc?.ECF?.Encabezado?.Totales?.MontoTotal || entry.montoTotal || 0);
  return entry.tipoeCF === '32' && rfceFc32Set.has(entry.encf) && monto < 250000;
}

function sortEcfByNcfDependency(entries) {
  const byEncf = new Map(entries.map((e) => [e.encf, e]));
  const sorted = [];
  const done = new Set();

  function visit(entry) {
    if (!entry || done.has(entry.encf)) return;
    const dep = entry.ncfModificado;
    if (dep && byEncf.has(dep) && !done.has(dep)) {
      visit(byEncf.get(dep));
    }
    done.add(entry.encf);
    sorted.push(entry);
  }

  for (const entry of entries) visit(entry);
  return sorted;
}

function main() {
  if (!fs.existsSync(excelPath)) {
    console.error('No se encontró el Excel:', excelPath);
    process.exit(1);
  }

  ensureDir(outEcf);
  ensureDir(outRfce);
  cleanXmlDir(outEcf);
  cleanXmlDir(outRfce);
  ensureDir(path.join(outDir, 'ecf-firmados'));
  ensureDir(path.join(outDir, 'rfce-firmados'));
  ensureDir(path.join(outDir, 'envio-resultados'));

  const wb = XLSX.readFile(excelPath, { cellDates: true });
  const rfceFc32Set = /paso4|simulaci/i.test(path.basename(excelPath))
    ? buildPaso4PatchSets().RFCE_FC32
    : PASO2_RFCE_FC32_ENCF;
  const transformer = new Transformer();
  const manifest = {
    generadoEn: new Date().toISOString(),
    excel: path.basename(excelPath),
    instruccionesFirma:
      'Firmar cada XML con la App de Firma Digital DGII. Guardar los firmados en certificacion-dgii/salida/ecf-firmados/ y rfce-firmados/',
    ecf: [],
    rfce: [],
    ordenEnvio: []
  };

  const ecfSheet = sheetRows(wb, 'ECF');
  const ecfEntries = [];
  for (const row of ecfSheet.rows) {
    const { doc, meta } = flatRowToDocument(ecfSheet.headers, row, 'ECF');
    if (!meta.casoPrueba && meta.rncEmisor && meta.encf) {
      meta.casoPrueba = meta.rncEmisor + meta.encf;
    }
    const fileName = `${meta.casoPrueba || meta.rncEmisor + meta.encf}.xml`;
    const filePath = path.join(outEcf, fileName);
    writeXml(transformer, doc, filePath);
    const entry = {
      archivo: fileName,
      casoPrueba: meta.casoPrueba,
      tipoeCF: meta.tipoeCF,
      encf: meta.encf,
      hoja: 'ECF',
      montoTotal: doc?.ECF?.Encabezado?.Totales?.MontoTotal,
      ncfModificado: doc?.ECF?.InformacionReferencia?.NCFModificado || '',
      nota:
        meta.tipoeCF === '32' && Number(doc?.ECF?.Encabezado?.Totales?.MontoTotal || 0) < 250000
          ? 'RFCE ya enviado por API; factura íntegra FC32 <250k no va por Recepcion (portal DGII si aplica)'
          : 'Enviar a CerteCF/Recepcion una vez firmado'
    };
    if (isFc32ResumenB2c(entry, doc, rfceFc32Set)) {
      entry.omitirEnvioApi = true;
      entry.nota = 'No enviar ECF íntegro por API — solo RFCE (resumen B2C). RFCE ya aceptado.';
    }
    manifest.ecf.push(entry);
    ecfEntries.push(entry);
  }

  const rfceSheet = sheetRows(wb, 'RFCE');
  let paso = 0;
  for (const row of rfceSheet.rows) {
    const { doc, meta } = flatRowToDocument(rfceSheet.headers, row, 'RFCE');
    if (!meta.casoPrueba && meta.rncEmisor && meta.encf) {
      meta.casoPrueba = `RFCE-${meta.encf}`;
    }
    const fileName = `${meta.casoPrueba || `RFCE-${meta.encf}`}.xml`;
    const filePath = path.join(outRfce, fileName);
    writeXml(transformer, doc, filePath);
    const entry = {
      archivo: fileName,
      casoPrueba: meta.casoPrueba,
      tipoeCF: meta.tipoeCF,
      encf: meta.encf,
      hoja: 'RFCE',
      nota: 'Enviar resumen a fc.dgii.gov.do/CerteCF/RecepcionFC antes de la factura 32 íntegra'
    };
    manifest.rfce.push(entry);
    manifest.ordenEnvio.push({
      paso: ++paso,
      tipo: 'RFCE',
      ...entry
    });
  }

  const ecfOrden = sortEcfByNcfDependency(ecfEntries.filter((e) => !e.omitirEnvioApi));
  for (const entry of ecfOrden) {
    manifest.ordenEnvio.push({
      paso: ++paso,
      tipo: 'ECF',
      ...entry
    });
  }

  manifest.omitidosEnvioApi = ecfEntries.filter((e) => e.omitirEnvioApi);
  if (/paso4|simulaci/i.test(path.basename(excelPath))) {
    process.env.PASO4_OFFSET = process.env.PASO4_OFFSET || '200';
    manifest.paso = 4;
    manifest.paso4Offset = Number(process.env.PASO4_OFFSET || 200);
    manifest.nota = `Paso 4 Simulación e-CF — secuencias nuevas (+${manifest.paso4Offset} vs Paso 2)`;
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  const readme = `CERTIFICACIÓN DGII — Paso 2 (XML sin firmar)
============================================
RNC: 131631088 — BUENOHOTEL SRL
Excel: ${path.basename(excelPath)}

GENERADOS (${new Date().toLocaleString('es-DO')}):
  - ecf-sin-firmar/  → ${manifest.ecf.length} comprobantes ECF
  - rfce-sin-firmar/ → ${manifest.rfce.length} resúmenes RFCE (FC 32 < 250k)

PASO A — DUEÑA (firma digital, en su PC):
  1. Abrir "App de Firma Digital" de DGII
  2. Firmar los 4 ECF 32 (< 250k) de ecf-sin-firmar/ primero
     → Guardar en ecf-firmados/ (mismo nombre)
     Archivos: ...E320000000011, E320000000012, E320000000013, E320000000014
  3. El programador ejecuta: npm run generar-rfce
     (crea rfce-sin-firmar/ con CodigoSeguridadeCF correcto)
  4. Firmar los 4 XML de rfce-sin-firmar/
     → Guardar en rfce-firmados/ (mismo nombre)
  5. Firmar el resto de ecf-sin-firmar/ (21 ECF)
     → Guardar en ecf-firmados/
  No enviar nada a DGII desde la app; solo firmar y guardar.

PASO B — PROGRAMADOR (después de tener los firmados):
  Configurar variables (archivo .env en eventos-core-api-sbx/):
    DGII_FE_CERT_P12_PATH=ruta/al/certificado.p12
    DGII_FE_CERT_PASSWORD=clave_del_certificado

  Ejecutar:
    npm run cert:enviar

  El script envía a ambiente CerteCF en este orden:
    1) Resúmenes RFCE → fc.dgii.gov.do/CerteCF/RecepcionFC
    2) Comprobantes ECF → ecf.dgii.gov.do/CerteCF/Recepcion
  Resultados en envio-resultados/

NOTA FC 32 < 250k:
  Primero RFCE aceptado, luego la factura íntegra ECF 32 correspondiente.

Ver manifest.json para lista completa con tipos y eNCF.
`;

  fs.writeFileSync(path.join(outDir, 'LEEME.txt'), readme, 'utf8');

  console.log('OK — XML sin firmar generados');
  console.log('  ECF:', manifest.ecf.length, '→', outEcf);
  console.log('  RFCE:', manifest.rfce.length, '→', outRfce);
  console.log('  Orden envío API:', manifest.ordenEnvio.length, '(omitidos FC32 B2C:', manifest.omitidosEnvioApi?.length || 0, ')');
  console.log('  Manifest:', path.join(outDir, 'manifest.json'));
}

main();
