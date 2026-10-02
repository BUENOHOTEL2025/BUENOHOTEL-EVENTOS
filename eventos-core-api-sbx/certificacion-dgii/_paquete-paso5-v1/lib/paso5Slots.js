import { buildEncfMap, paso4Offset } from './paso4EncfMap.js';

/** Un comprobante representativo por tipo — mismos casos base que Paso 2, mapeados al offset Paso 4. */
const PASO5_BASE_ENCF = {
  'tipo-31': 'E310000000004',
  'tipo-32-ge-250': 'E320000000006',
  'tipo-33': 'E330000000001',
  'tipo-34': 'E340000000002',
  'tipo-41': 'E410000000001',
  'tipo-43': 'E430000000010',
  'tipo-44': 'E440000000007',
  'tipo-45': 'E450000000001',
  'tipo-46': 'E460000000009',
  'tipo-47': 'E470000000008',
  'tipo-32-lt-250': 'E320000000011'
};

const PORTAL_LABELS = {
  'tipo-31': 'Representación para comprobante tipo 31',
  'tipo-32-ge-250': 'Representación para comprobante tipo 32 >= RD$250mil',
  'tipo-33': 'Representación para comprobante tipo 33',
  'tipo-34': 'Representación para comprobante tipo 34',
  'tipo-41': 'Representación para comprobante tipo 41',
  'tipo-43': 'Representación para comprobante tipo 43',
  'tipo-44': 'Representación para comprobante tipo 44',
  'tipo-45': 'Representación para comprobante tipo 45',
  'tipo-46': 'Representación para comprobante tipo 46',
  'tipo-47': 'Representación para comprobante tipo 47',
  'tipo-32-lt-250': 'Representación para comprobante tipo 32 < RD$250mil'
};

const TIPO_TITULOS = {
  '31': 'FACTURA DE CRÉDITO FISCAL ELECTRÓNICA',
  '32': 'FACTURA DE CONSUMO ELECTRÓNICA',
  '33': 'NOTA DE DÉBITO ELECTRÓNICA',
  '34': 'NOTA DE CRÉDITO ELECTRÓNICA',
  '41': 'COMPROBANTE DE COMPRAS ELECTRÓNICO',
  '43': 'COMPROBANTE PARA GASTOS MENORES ELECTRÓNICO',
  '44': 'COMPROBANTE ESPECIAL DE REGÍMENES ELECTRÓNICO',
  '45': 'COMPROBANTE GUBERNAMENTAL ELECTRÓNICO',
  '46': 'COMPROBANTE DE PAGOS AL EXTERIOR ELECTRÓNICO',
  '47': 'COMPROBANTE DE EXPORTACIONES ELECTRÓNICO'
};

export function buildPaso5Slots(offset = paso4Offset()) {
  const map = buildEncfMap(offset);
  return Object.entries(PASO5_BASE_ENCF).map(([slotId, oldEncf]) => {
    const encf = map[oldEncf] || oldEncf;
    const tipoeCF = encf.slice(1, 3);
    return {
      slotId,
      portalLabel: PORTAL_LABELS[slotId],
      archivo: `131631088${encf}.xml`,
      encf,
      tipoeCF,
      tipoTitulo: TIPO_TITULOS[tipoeCF] || `COMPROBANTE TIPO ${tipoeCF}`,
      qrFc: slotId === 'tipo-32-lt-250',
      pdfName: `${slotId}.pdf`,
      htmlName: `${slotId}.html`
    };
  });
}
