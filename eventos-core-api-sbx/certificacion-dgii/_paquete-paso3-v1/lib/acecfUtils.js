import fs from 'fs';
import XLSX from 'xlsx';
import { Transformer } from 'dgii-ecf';

const ACECF_COLUMNS = [
  'Version',
  'RNCEmisor',
  'eNCF',
  'FechaEmision',
  'MontoTotal',
  'RNCComprador',
  'Estado',
  'DetalleMotivoRechazo',
  'FechaHoraAprobacionComercial'
];

function rowToRecord(headers, values) {
  const row = {};
  headers.forEach((h, i) => {
    const key = String(h || '').trim();
    if (!key) return;
    const val = values[i];
    row[key] = val == null ? '' : String(val).trim();
  });
  return row;
}

export function parseCommercialApprovalExcel(excelPath) {
  const wb = XLSX.readFile(excelPath);
  const sheetName = wb.SheetNames.find((n) => /aceecf/i.test(n)) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error('Excel sin hojas: ' + excelPath);

  const all = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const headers = (all[0] || []).map((h) => String(h || '').trim());
  const missing = ACECF_COLUMNS.filter((c) => !headers.includes(c));
  if (missing.length) {
    throw new Error(`Excel ${sheetName} sin columnas: ${missing.join(', ')}`);
  }

  const rows = all
    .slice(1)
    .filter((r) => r.some((c) => String(c ?? '').trim() !== ''))
    .map((values, idx) => {
      const row = rowToRecord(headers, values);
      if (!row.eNCF) throw new Error(`Fila ${idx + 2} sin eNCF en ${excelPath}`);
      return row;
    });

  if (!rows.length) throw new Error('Excel sin filas de datos: ' + excelPath);
  return rows;
}

export function parseCommercialApprovalCsv(csvPath) {
  const raw = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    throw new Error('CSV vacío o sin filas de datos: ' + csvPath);
  }
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line, idx) => {
    const values = line.split(',');
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] ?? '').trim();
    });
    if (!row.eNCF) {
      throw new Error(`Fila ${idx + 2} sin eNCF en ${csvPath}`);
    }
    return row;
  });
}

function parseMontoTotal(value) {
  const s = String(value ?? '').trim();
  if (!s) return '0';
  if (/^\d+$/.test(s)) return s;
  if (/^\d+\.\d+$/.test(s)) return s;
  const n = Number(s);
  if (Number.isFinite(n)) return String(n);
  return s;
}

export function buildAcecfxml(record) {
  const detalle = {
    Version: record.Version || '1.0',
    RNCEmisor: record.RNCEmisor,
    eNCF: record.eNCF,
    FechaEmision: record.FechaEmision,
    MontoTotal: parseMontoTotal(record.MontoTotal),
    RNCComprador: record.RNCComprador,
    Estado: record.Estado
  };
  if (record.DetalleMotivoRechazo) {
    detalle.DetalleMotivoRechazo = record.DetalleMotivoRechazo;
  }
  if (!record.FechaHoraAprobacionComercial) {
    throw new Error(`Falta FechaHoraAprobacionComercial para ${record.eNCF}`);
  }
  detalle.FechaHoraAprobacionComercial = record.FechaHoraAprobacionComercial;

  const transform = new Transformer();
  return transform.json2xml({ ACECF: { DetalleAprobacionComercial: detalle } });
}

export function acecfFileName(record) {
  return `${record.RNCComprador}${record.eNCF}.xml`;
}

export function acecfManifestPath(baseDir) {
  return `${baseDir}/salida/acecf-manifest.json`;
}
