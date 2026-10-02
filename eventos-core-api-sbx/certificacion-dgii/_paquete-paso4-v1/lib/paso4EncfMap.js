/**
 * Mapeo eNCF Paso 2 → Paso 4 (simulación).
 * Offset +100 en la secuencia para no reutilizar comprobantes del Paso 2.
 */
const PASO2_ENCF_LIST = [
  'E310000000004',
  'E310000000005',
  'E310000000007',
  'E310000000034',
  'E320000000004',
  'E320000000006',
  'E320000000011',
  'E320000000012',
  'E320000000013',
  'E320000000014',
  'E330000000001',
  'E340000000002',
  'E340000000015',
  'E410000000001',
  'E410000000008',
  'E430000000010',
  'E430000000011',
  'E440000000007',
  'E440000000010',
  'E450000000001',
  'E450000000008',
  'E460000000009',
  'E460000000010',
  'E470000000008',
  'E470000000010'
];

export function toPaso4Encf(oldEncf) {
  const m = /^E(\d{2})(\d{10})$/.exec(String(oldEncf || '').trim());
  if (!m) throw new Error(`eNCF inválido: ${oldEncf}`);
  const seq = parseInt(m[2], 10) + 100;
  if (seq < 1 || seq > 10_000_000) {
    throw new Error(`Secuencia fuera de rango DGII: ${oldEncf} → ${seq}`);
  }
  return `E${m[1]}${String(seq).padStart(10, '0')}`;
}

export const ENCF_MAP = Object.fromEntries(PASO2_ENCF_LIST.map((old) => [old, toPaso4Encf(old)]));

export function mapEncf(value) {
  const s = String(value || '').trim();
  if (!s) return s;
  if (ENCF_MAP[s]) return ENCF_MAP[s];
  const m = s.match(/^(131631088)(E\d{12})$/);
  if (m && ENCF_MAP[m[2]]) return m[1] + ENCF_MAP[m[2]];
  return s;
}

export function mapText(value) {
  let out = String(value ?? '');
  for (const [oldEncf, newEncf] of Object.entries(ENCF_MAP)) {
    const oldCaso = `131631088${oldEncf}`;
    const newCaso = `131631088${newEncf}`;
    out = out.split(oldCaso).join(newCaso);
    out = out.split(oldEncf).join(newEncf);
  }
  return out;
}

export function mapEncfSet(oldSet) {
  return new Set([...oldSet].map((e) => ENCF_MAP[e] || e));
}

/** RFCE FC32 <250k (Paso 4) */
export const RFCE_FC32 = mapEncfSet(
  new Set(['E320000000011', 'E320000000012', 'E320000000013', 'E320000000014'])
);

export const PRECIO_2DEC_ENCF = mapEncfSet(
  new Set([
    'E310000000004',
    'E330000000001',
    'E340000000015',
    'E410000000001',
    'E450000000001',
    'E320000000011',
    'E320000000012',
    'E320000000013',
    'E320000000014'
  ])
);

/** E460/E470 del Paso 2 usan 4 decimales — mismas filas, nuevos eNCF */
export const PRECIO_4DEC_ENCF = mapEncfSet(new Set(['E460000000010', 'E470000000010']));

export const DOCUMENT_DOR = {
  [ENCF_MAP.E310000000004]: [
    { numeroLinea: 1, tipoAjuste: 'D', descripcion: 'N', monto: 200, indicadorFacturacion: 1 },
    { numeroLinea: 2, tipoAjuste: 'D', descripcion: 'D', monto: 50, indicadorFacturacion: 2 }
  ],
  [ENCF_MAP.E320000000004]: [
    { numeroLinea: 1, tipoAjuste: 'R', descripcion: 'Pronto Pago', monto: 3500, indicadorFacturacion: 1 },
    { numeroLinea: 2, tipoAjuste: 'R', descripcion: 'Pronto Pago', monto: 2000, indicadorFacturacion: 2 }
  ]
};

export function isPaso4Manifest(manifest) {
  if (!manifest) return false;
  if (manifest.paso === 4) return true;
  const excel = String(manifest.excel || '');
  return /paso4|simulaci/i.test(excel);
}

export function listPaso4Encf() {
  return Object.values(ENCF_MAP);
}
