/**
 * Parsea nombres de columna del set DGII: "FormaPago[1]", "CodigoItem[2][3]".
 */
export function parseColumnName(raw) {
  const name = String(raw || '').trim();
  if (!name) return { base: '', indices: [] };
  const match = name.match(/^([A-Za-z0-9_]+)((?:\[\d+\])+)?$/);
  if (!match) return { base: name, indices: [] };
  const base = match[1];
  const indices = [...(match[2] || '').matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  return { base, indices };
}

export function isEmptyDgiiValue(v) {
  if (v === null || v === undefined) return true;
  const s = String(v).trim();
  return s === '' || s === '#e';
}
