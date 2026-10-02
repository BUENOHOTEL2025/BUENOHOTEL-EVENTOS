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

const MODELO_DGII = {
  'tipo-31': '1.1',
  'tipo-32-ge-250': '2.1',
  'tipo-33': '1.5',
  'tipo-34': '1.6',
  'tipo-41': '1.1',
  'tipo-43': '1.1',
  'tipo-44': '1.1',
  'tipo-45': '1.1',
  'tipo-46': '1.1',
  'tipo-47': '1.1',
  'tipo-32-lt-250': '2.2'
};

const TIPO_TITULOS = {
  '31': 'Factura de Crédito Fiscal Electrónica',
  '32': 'Factura de Consumo Electrónica',
  '33': 'Nota de Débito Electrónica',
  '34': 'Nota de Crédito Electrónica',
  '41': 'Comprobante de Compras Electrónico',
  '43': 'Comprobante para Gastos Menores Electrónico',
  '44': 'Comprobante Especial de Regímenes Especiales de Tributación Electrónico',
  '45': 'Comprobante Gubernamental Electrónico',
  '46': 'Comprobante de Pagos al Exterior Electrónico',
  '47': 'Comprobante de Exportaciones Electrónico'
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
      tipoTitulo: TIPO_TITULOS[tipoeCF] || `Comprobante tipo ${tipoeCF}`,
      modeloDgii: MODELO_DGII[slotId] || '1.1',
      qrFc: slotId === 'tipo-32-lt-250',
      pdfName: `${slotId}.pdf`,
      htmlName: `${slotId}.html`
    };
  });
}
