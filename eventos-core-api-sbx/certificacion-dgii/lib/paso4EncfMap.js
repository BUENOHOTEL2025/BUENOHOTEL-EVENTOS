/**
 * Mapeo eNCF Paso 2 → Paso 4 (simulación).
 * Offset configurable: +100 (intento 1), +200 (intento 2), +300 (QR BUENOHOTEL), etc.
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

const PASO2_RFCE_FC32 = ['E320000000011', 'E320000000012', 'E320000000013', 'E320000000014'];
const PASO2_PRECIO_2DEC = [
  'E310000000004',
  'E330000000001',
  'E340000000015',
  'E410000000001',
  'E450000000001',
  'E320000000011',
  'E320000000012',
  'E320000000013',
  'E320000000014'
];
const PASO2_PRECIO_4DEC = ['E460000000010', 'E470000000010'];
const PASO2_DOCUMENT_DOR_KEYS = {
  E310000000004: [
    { numeroLinea: 1, tipoAjuste: 'D', descripcion: 'N', monto: 200, indicadorFacturacion: 1 },
    { numeroLinea: 2, tipoAjuste: 'D', descripcion: 'D', monto: 50, indicadorFacturacion: 2 }
  ],
  E320000000004: [
    { numeroLinea: 1, tipoAjuste: 'R', descripcion: 'Pronto Pago', monto: 3500, indicadorFacturacion: 1 },
    { numeroLinea: 2, tipoAjuste: 'R', descripcion: 'Pronto Pago', monto: 2000, indicadorFacturacion: 2 }
  ]
};

export function paso4Offset() {
  const n = Number(process.env.PASO4_OFFSET || 300);
  return Number.isFinite(n) && n > 0 ? n : 300;
}

export function toPaso4Encf(oldEncf, offset = paso4Offset()) {
  const m = /^E(\d{2})(\d{10})$/.exec(String(oldEncf || '').trim());
  if (!m) throw new Error(`eNCF inválido: ${oldEncf}`);
  const seq = parseInt(m[2], 10) + offset;
  if (seq < 1 || seq > 10_000_000) {
    throw new Error(`Secuencia fuera de rango DGII: ${oldEncf} → ${seq}`);
  }
  return `E${m[1]}${String(seq).padStart(10, '0')}`;
}

export function buildEncfMap(offset = paso4Offset()) {
  return Object.fromEntries(PASO2_ENCF_LIST.map((old) => [old, toPaso4Encf(old, offset)]));
}

function mapEncfSetFromMap(map, oldSet) {
  return new Set([...oldSet].map((e) => map[e] || e));
}

export function buildPaso4PatchSets(offset = paso4Offset()) {
  const ENCF_MAP = buildEncfMap(offset);
  const DOCUMENT_DOR = {};
  for (const [oldKey, rows] of Object.entries(PASO2_DOCUMENT_DOR_KEYS)) {
    DOCUMENT_DOR[ENCF_MAP[oldKey]] = rows;
  }
  return {
    offset,
    ENCF_MAP,
    RFCE_FC32: mapEncfSetFromMap(ENCF_MAP, new Set(PASO2_RFCE_FC32)),
    PRECIO_2DEC_ENCF: mapEncfSetFromMap(ENCF_MAP, new Set(PASO2_PRECIO_2DEC)),
    PRECIO_4DEC_ENCF: mapEncfSetFromMap(ENCF_MAP, new Set(PASO2_PRECIO_4DEC)),
    DOCUMENT_DOR,
    NOTAS_REENVIO: [
      ENCF_MAP.E330000000001,
      ENCF_MAP.E340000000002,
      ENCF_MAP.E340000000015
    ].map((encf) => `131631088${encf}.xml`)
  };
}

/** @deprecated use buildEncfMap() — lazy default offset */
export const ENCF_MAP = buildEncfMap();

export function mapEncf(value, map = ENCF_MAP) {
  const s = String(value || '').trim();
  if (!s) return s;
  if (map[s]) return map[s];
  const m = s.match(/^(131631088)(E\d{12})$/);
  if (m && map[m[2]]) return m[1] + map[m[2]];
  return s;
}

export function mapText(value, map = ENCF_MAP) {
  let out = String(value ?? '');
  for (const [oldEncf, newEncf] of Object.entries(map)) {
    const oldCaso = `131631088${oldEncf}`;
    const newCaso = `131631088${newEncf}`;
    out = out.split(oldCaso).join(newCaso);
    out = out.split(oldEncf).join(newEncf);
  }
  return out;
}

export function isPaso4Manifest(manifest) {
  if (!manifest) return false;
  if (manifest.paso === 4) return true;
  const excel = String(manifest.excel || '');
  return /paso4|simulaci/i.test(excel);
}

export function listPaso4Encf(offset = paso4Offset()) {
  return Object.values(buildEncfMap(offset));
}
