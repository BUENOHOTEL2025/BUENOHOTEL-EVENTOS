#!/usr/bin/env node
/**
 * Genera XML ACECF sin firmar desde el Excel/CSV del portal (Paso 3 DGII).
 *
 * Uso:
 *   npm run generar-acecf
 *   node generar-acecf-sin-firmar.js --excel ../../131631088-01072026143856.xlsx
 *   node generar-acecf-sin-firmar.js --csv datos/aprobaciones-comerciales.csv
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  acecfFileName,
  acecfManifestPath,
  buildAcecfxml,
  parseCommercialApprovalCsv
} from './lib/acecfUtils.js';
import { parseCommercialApprovalExcel } from './lib/acecfExcel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return '';
}

const excelPath = path.resolve(ROOT, argValue('--excel') || '131631088-01072026143856.xlsx');
const csvPath = path.resolve(__dirname, argValue('--csv') || 'datos/aprobaciones-comerciales.csv');
const salida = path.join(__dirname, 'salida');
const outDir = path.join(salida, 'acecf-sin-firmar');

function loadRows() {
  if (argValue('--csv')) {
    if (!fs.existsSync(csvPath)) {
      console.error('No existe el CSV:', csvPath);
      process.exit(1);
    }
    return { rows: parseCommercialApprovalCsv(csvPath), origen: path.basename(csvPath) };
  }
  if (fs.existsSync(excelPath)) {
    return { rows: parseCommercialApprovalExcel(excelPath), origen: path.basename(excelPath) };
  }
  if (fs.existsSync(csvPath)) {
    return { rows: parseCommercialApprovalCsv(csvPath), origen: path.basename(csvPath) };
  }
  console.error('No existe el Excel del Paso 3:', excelPath);
  console.error('Descargue "APROBACIONES COMERCIALES" y colóquelo en la raíz del proyecto.');
  console.error('O use: node generar-acecf-sin-firmar.js --excel ruta\\al\\archivo.xlsx');
  process.exit(1);
}

function main() {
  const { rows, origen } = loadRows();
  fs.mkdirSync(outDir, { recursive: true });

  const manifest = {
    generadoEn: new Date().toISOString(),
    origen,
    total: rows.length,
    registros: []
  };

  console.log(`Generando ${rows.length} ACECF desde ${origen}...\n`);

  for (const row of rows) {
    const xml = buildAcecfxml(row);
    const archivo = acecfFileName(row);
    fs.writeFileSync(path.join(outDir, archivo), xml, 'utf8');
    manifest.registros.push({
      archivo,
      encf: row.eNCF,
      rncComprador: row.RNCComprador,
      rncEmisor: row.RNCEmisor,
      montoTotal: row.MontoTotal
    });
    console.log('OK', archivo, `(${row.eNCF})`);
  }

  fs.writeFileSync(acecfManifestPath(__dirname), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\n${rows.length} XML en salida/acecf-sin-firmar/`);
  console.log('Siguiente: npm run firmar-acecf');
}

main();
