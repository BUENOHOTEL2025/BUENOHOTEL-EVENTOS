/** Códigos de unidad de medida frecuentes en casos DGII (fallback: código numérico). */
const UNIDAD_LABEL = {
  6: 'LAT',
  18: 'CAJ',
  23: 'PZA',
  34: 'CAJ',
  43: 'CAJ',
  47: 'GL',
  55: 'UND'
};

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function itbisRate(indicador, doc) {
  const i = String(indicador || '');
  if (i === '1') return Number(doc.itbis1) || 18;
  if (i === '2') return Number(doc.itbis2) || 16;
  if (i === '3') return Number(doc.itbis3) || 0;
  return 0;
}

export function unidadLabel(code) {
  const c = String(code || '').trim();
  return UNIDAD_LABEL[c] || c || '—';
}

/**
 * Modelo DGII 1.1: Valor = monto gravado de línea sin impuestos (MontoItem o precio × cantidad).
 * ITBIS por línea según IndicadorFacturacion.
 */
export function enrichLineItems(doc) {
  return (doc.items || []).map((item) => {
    const cantidad = Number(item.cantidad) || 0;
    const precio = Number(item.precio) || 0;
    const montoItem = Number(item.monto);
    const valor = Number.isFinite(montoItem) && montoItem > 0 ? montoItem : round2(cantidad * precio);
    const rate = itbisRate(item.indicadorFacturacion, doc);
    const itbis = rate > 0 ? round2((valor * rate) / 100) : 0;
    return {
      ...item,
      cantidad,
      precio,
      valor,
      itbis,
      unidadLabel: unidadLabel(item.unidad)
    };
  });
}

export function totalesRepresentacion(doc, lineas) {
  const subtotalGravado =
    Number(doc.montoGravado) ||
    Number(doc.montoExento) ||
    round2(lineas.reduce((s, ln) => s + ln.valor, 0));
  const totalItbis = Number(doc.totalItbis) || round2(lineas.reduce((s, ln) => s + ln.itbis, 0));
  const total = Number(doc.montoTotal) || round2(subtotalGravado + totalItbis);
  return { subtotalGravado, totalItbis, total };
}
