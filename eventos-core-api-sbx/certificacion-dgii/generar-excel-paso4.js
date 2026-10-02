#!/usr/bin/env node
/**
 * Genera Excel Paso 4 (simulación) desde plantilla Paso 2 con nuevas secuencias eNCF.
 *
 * Uso:
 *   npm run paso4-excel
 *   node generar-excel-paso4.js --base ../../131631088-26062026133112.xlsx
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

process.env.PASO4_OFFSET = argValue('--offset', process.env.PASO4_OFFSET || '300');

const { buildEncfMap, mapText, paso4Offset } = await import('./lib/paso4EncfMap.js');
const ENCF_MAP = buildEncfMap();

const baseExcel = path.resolve(ROOT, argValue('--base', '131631088-26062026133112.xlsx'));
const outName = argValue('--out', '131631088-paso4-simulacion-v2.xlsx');
const outExcel = path.resolve(ROOT, outName);
const outCopy = path.join(__dirname, 'datos', path.basename(outName));

function mapSheetRows(rows) {
  return rows.map((row) => row.map((cell) => mapText(cell)));
}

function main() {
  if (!fs.existsSync(baseExcel)) {
    console.error('No existe Excel base:', baseExcel);
    process.exit(1);
  }

  const wb = XLSX.readFile(baseExcel, { cellDates: true });
  const outWb = XLSX.utils.book_new();

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const mapped = mapSheetRows(rows);

    if (sheetName === 'ECF') {
      const headers = mapped[0] || [];
      const encfIdx = headers.indexOf('ENCF');
      const fechaIdx = headers.indexOf('FechaEmision');
      const ncfModIdx = headers.indexOf('NCFModificado');
      const fechaNcfModIdx = headers.indexOf('FechaNCFModificado');
      const infoIdx = headers.indexOf('InformacionAdicionalEmisor');
      for (let i = 1; i < mapped.length; i++) {
        if (fechaIdx >= 0 && mapped[i][fechaIdx]) {
          mapped[i][fechaIdx] = '01-07-2026';
        }
        if (infoIdx >= 0) {
          mapped[i][infoIdx] = 'Simulacion Paso 4 - BUENOHOTEL SRL';
        }
      }
      const fechaByEncf = new Map();
      for (let i = 1; i < mapped.length; i++) {
        const encf = String(mapped[i][encfIdx] || '').trim();
        const fecha = String(mapped[i][fechaIdx] || '').trim();
        if (encf && fecha) fechaByEncf.set(encf, fecha);
      }
      for (let i = 1; i < mapped.length; i++) {
        const parent = String(mapped[i][ncfModIdx] || '').trim();
        if (parent && fechaNcfModIdx >= 0 && fechaByEncf.has(parent)) {
          mapped[i][fechaNcfModIdx] = fechaByEncf.get(parent);
        }
      }
    }

    const outWs = XLSX.utils.aoa_to_sheet(mapped);
    XLSX.utils.book_append_sheet(outWb, outWs, sheetName);
  }

  fs.mkdirSync(path.dirname(outCopy), { recursive: true });
  XLSX.writeFile(outWb, outExcel);
  XLSX.writeFile(outWb, outCopy);

  console.log('Excel Paso 4 generado:');
  console.log(' ', outExcel);
  console.log(' ', outCopy);
  console.log('\nMapeo eNCF (muestra):');
  for (const [oldEncf, newEncf] of Object.entries(ENCF_MAP).slice(0, 6)) {
    console.log(`  ${oldEncf} → ${newEncf}`);
  }
  console.log(`  ... (${Object.keys(ENCF_MAP).length} comprobantes, offset +${paso4Offset()})`);
  console.log('\nSiguiente: npm run paso4-generar-xml');
}

main();
