import XLSX from 'xlsx';

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
