import fs from 'fs';
import XLSX from 'xlsx';

/** El ESM de xlsx 0.20 no enlaza fs; leer/escribir por buffer. */
export function readWorkbook(filePath, opts = {}) {
  return XLSX.read(fs.readFileSync(filePath), { type: 'buffer', ...opts });
}

export function writeWorkbook(workbook, filePath, opts = {}) {
  const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', ...opts });
  fs.writeFileSync(filePath, buf);
  return filePath;
}

export { XLSX };
