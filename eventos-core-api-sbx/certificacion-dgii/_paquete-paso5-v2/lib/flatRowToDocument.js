import { isEmptyDgiiValue, parseColumnName } from './parseColumnName.js';

const ID_DOC = new Set([
  'TipoeCF',
  'ENCF', // columna Excel → XML eNCF
  'FechaVencimientoSecuencia',
  'IndicadorNotaCredito',
  'IndicadorEnvioDiferido',
  'IndicadorMontoGravado',
  'IndicadorServicioTodoIncluido',
  'TipoIngresos',
  'TipoPago',
  'FechaLimitePago',
  'TerminoPago',
  'TipoCuentaPago',
  'NumeroCuentaPago',
  'BancoPago',
  'FechaDesde',
  'FechaHasta',
  'TotalPaginas'
]);

const EMISOR = new Set([
  'RNCEmisor',
  'RazonSocialEmisor',
  'NombreComercial',
  'Sucursal',
  'DireccionEmisor',
  'Municipio',
  'Provincia',
  'CorreoEmisor',
  'WebSite',
  'ActividadEconomica',
  'CodigoVendedor',
  'NumeroFacturaInterna',
  'NumeroPedidoInterno',
  'ZonaVenta',
  'RutaVenta',
  'InformacionAdicionalEmisor',
  'FechaEmision'
]);

const COMPRADOR = new Set([
  'RNCComprador',
  'IdentificadorExtranjero',
  'RazonSocialComprador',
  'ContactoComprador',
  'CorreoComprador',
  'DireccionComprador',
  'MunicipioComprador',
  'ProvinciaComprador',
  'PaisComprador',
  'FechaEntrega',
  'ContactoEntrega',
  'DireccionEntrega',
  'TelefonoAdicional',
  'FechaOrdenCompra',
  'NumeroOrdenCompra',
  'CodigoInternoComprador',
  'ResponsablePago',
  'InformacionAdicionalComprador'
]);

const INFO_ADICIONAL = new Set([
  'FechaEmbarque',
  'NumeroEmbarque',
  'NumeroContenedor',
  'NumeroReferencia',
  'PesoBruto',
  'PesoNeto',
  'UnidadPesoBruto',
  'UnidadPesoNeto',
  'CantidadBulto',
  'UnidadBulto',
  'VolumenBulto',
  'UnidadVolumen'
]);

const TRANSPORTE = new Set([
  'Conductor',
  'DocumentoTransporte',
  'Ficha',
  'Placa',
  'RutaTransporte',
  'ZonaTransporte',
  'NumeroAlbaran',
  'NombreCompaniaTransportista',
  'RNCIdentificacionCompaniaTransportista',
  'NombrePuertoEmbarque',
  'CondicionesEntrega',
  'TotalFob',
  'TotalCif',
  'ViaTransporte',
  'PaisOrigen',
  'DireccionDestino',
  'PaisDestino',
  'NombrePuertoSalida',
  'NombrePuertoDesembarque',
  'NumeroViaje',
  'Flete',
  'Seguro',
  'OtrosGastos'
]);

const TOTALES = new Set([
  'MontoGravadoTotal',
  'MontoGravadoI1',
  'MontoGravadoI2',
  'MontoGravadoI3',
  'MontoExento',
  'ITBIS1',
  'ITBIS2',
  'ITBIS3',
  'TotalITBIS',
  'TotalITBIS1',
  'TotalITBIS2',
  'TotalITBIS3',
  'MontoImpuestoAdicional',
  'MontoTotal',
  'MontoNoFacturable',
  'MontoPeriodo',
  'SaldoAnterior',
  'MontoAvancePago',
  'ValorPagar',
  'TotalITBISRetenido',
  'TotalISRRetencion',
  'TotalITBISPercepcion',
  'TotalISRPercepcion'
]);

const OTRA_MONEDA = new Set([
  'TipoMoneda',
  'TipoCambio',
  'MontoGravadoTotalOtraMoneda',
  'MontoGravado1OtraMoneda',
  'MontoGravado2OtraMoneda',
  'MontoGravado3OtraMoneda',
  'MontoExentoOtraMoneda',
  'TotalITBISOtraMoneda',
  'TotalITBIS1OtraMoneda',
  'TotalITBIS2OtraMoneda',
  'TotalITBIS3OtraMoneda',
  'MontoImpuestoAdicionalOtraMoneda',
  'MontoTotalOtraMoneda'
]);

const INFO_REF = new Set([
  'NCFModificado',
  'FechaNCFModificado',
  'CodigoModificacion',
  'RazonModificacion',
  'RNCOtroContribuyente'
]);

const ITEM_FIELDS = new Set([
  'NumeroLinea',
  'IndicadorFacturacion',
  'Retencion',
  'IndicadorAgenteRetencionoPercepcion',
  'MontoITBISRetenido',
  'MontoISRRetenido',
  'NombreItem',
  'IndicadorBienoServicio',
  'DescripcionItem',
  'CantidadItem',
  'UnidadMedida',
  'CantidadReferencia',
  'UnidadReferencia',
  'GradosAlcohol',
  'PrecioUnitarioReferencia',
  'FechaElaboracion',
  'FechaVencimientoItem',
  'PesoNetoKilogramo',
  'PesoNetoMineria',
  'TipoAfiliacion',
  'Liquidacion',
  'PrecioUnitarioItem',
  'DescuentoMonto',
  'RecargoMonto',
  'PrecioOtraMoneda',
  'DescuentoOtraMoneda',
  'RecargoOtraMoneda',
  'MontoItemOtraMoneda',
  'MontoItem'
]);

const SUB_DESCUENTO_FIELDS = new Set(['TipoSubDescuento', 'SubDescuentoPorcentaje', 'MontoSubDescuento']);

const SUB_RECARGO_FIELDS = new Set([
  'TipoSubRecargo',
  'SubRecargoPorcentaje',
  'MontoSubRecargo',
  'MontosubRecargo'
]);

const DOR_FIELDS = new Set([
  'NumeroLineaDoR',
  'TipoAjuste',
  'IndicadorNorma1007',
  'DescripcionDescuentooRecargo',
  'TipoValor',
  'ValorDescuentooRecargo',
  'MontoDescuentooRecargo',
  'MontoDescuentooRecargoOtraMoneda',
  'IndicadorFacturacionDescuentooRecargo'
]);

/** Precios: conservar decimales del Excel (220.00 vs 450.0000). */
const FOUR_DEC_FIELDS = new Set(['GradosAlcohol']);

const PRECIO_FIELDS = new Set(['PrecioUnitarioItem', 'PrecioUnitarioReferencia']);

/** Montos/cantidades con 2 decimales. */
const TWO_DEC_FIELDS = new Set([
  'CantidadItem',
  'CantidadReferencia',
  'MontoItem',
  'DescuentoMonto',
  'RecargoMonto',
  'PrecioOtraMoneda',
  'DescuentoOtraMoneda',
  'RecargoOtraMoneda',
  'MontoItemOtraMoneda',
  'MontoPago',
  'MontoGravadoTotal',
  'MontoGravadoI1',
  'MontoGravadoI2',
  'MontoGravadoI3',
  'MontoExento',
  'TotalITBIS',
  'TotalITBIS1',
  'TotalITBIS2',
  'TotalITBIS3',
  'MontoImpuestoAdicional',
  'MontoTotal',
  'MontoNoFacturable',
  'MontoPeriodo',
  'SaldoAnterior',
  'MontoAvancePago',
  'ValorPagar',
  'TotalITBISRetenido',
  'TotalISRRetencion',
  'TotalITBISPercepcion',
  'TotalISRPercepcion',
  'MontoSubDescuento',
  'MontoITBISRetenido',
  'MontoISRRetenido',
  'PesoNetoKilogramo',
  'PesoNetoMineria'
]);

const THREE_DEC_FIELDS = new Set(['SubDescuentoPorcentaje']);

const PAGINA_FIELDS = new Set([
  'PaginaNo',
  'NoLineaDesde',
  'NoLineaHasta',
  'SubtotalMontoGravadoPagina',
  'SubtotalMontoGravado1Pagina',
  'SubtotalMontoGravado2Pagina',
  'SubtotalMontoGravado3Pagina',
  'SubtotalExentoPagina',
  'SubtotalItbisPagina',
  'SubtotalItbis1Pagina',
  'SubtotalItbis2Pagina',
  'SubtotalItbis3Pagina',
  'MontoSubtotalPagina',
  'SubtotalMontoNoFacturablePagina',
  'SubtotalImpuestoAdicionalPagina'
]);

function setAt(obj, path, value) {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (cur[key] == null) cur[key] = typeof path[i + 1] === 'number' ? [] : {};
    cur = cur[key];
  }
  cur[path[path.length - 1]] = value;
}

function ensureArraySlot(arr, idx0) {
  while (arr.length <= idx0) arr.push({});
  if (arr[idx0] == null || typeof arr[idx0] !== 'object') arr[idx0] = {};
  return arr[idx0];
}

function formatNumber(v, decimals) {
  return Number(v).toFixed(decimals);
}

function preserveDecimalString(s) {
  if (!/^-?\d+(\.\d+)?$/.test(s)) return s;
  if (!s.includes('.')) return String(Number(s));
  const decimals = s.split('.')[1].length;
  return formatNumber(Number(s), decimals);
}

function normalizeValue(v, fieldName = '') {
  if (typeof v === 'number') {
    if (PRECIO_FIELDS.has(fieldName)) return formatNumber(v, 4);
    if (FOUR_DEC_FIELDS.has(fieldName)) return formatNumber(v, 4);
    if (THREE_DEC_FIELDS.has(fieldName)) return formatNumber(v, 3);
    if (TWO_DEC_FIELDS.has(fieldName)) return formatNumber(v, 2);
    if (Number.isInteger(v)) return String(v);
    return formatNumber(v, 2);
  }
  const s = String(v).trim();
  if (fieldName && PRECIO_FIELDS.has(fieldName) && /^-?\d+(\.\d+)?$/.test(s)) {
    return preserveDecimalString(s);
  }
  if (fieldName && FOUR_DEC_FIELDS.has(fieldName) && /^-?\d+(\.\d+)?$/.test(s)) {
    return formatNumber(Number(s), 4);
  }
  if (fieldName && TWO_DEC_FIELDS.has(fieldName) && /^-?\d+(\.\d+)?$/.test(s)) {
    return formatNumber(Number(s), 2);
  }
  return s;
}

function nowFirmaRd() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function routeField(rootKey, base, indices, value, doc) {
  const enc = doc[rootKey].Encabezado;

  if (base === 'Version') {
    enc.Version = value;
    return;
  }

  if (base === 'FormaPago' || base === 'MontoPago') {
    const i = (indices[0] || 1) - 1;
    enc.IdDoc.TablaFormasPago = enc.IdDoc.TablaFormasPago || { FormaDePago: [] };
    const slot = ensureArraySlot(enc.IdDoc.TablaFormasPago.FormaDePago, i);
    slot[base] = value;
    return;
  }

  if (base === 'TelefonoEmisor') {
    const i = (indices[0] || 1) - 1;
    enc.Emisor.TablaTelefonoEmisor = enc.Emisor.TablaTelefonoEmisor || { TelefonoEmisor: [] };
    enc.Emisor.TablaTelefonoEmisor.TelefonoEmisor[i] = value;
    return;
  }

  if (base === 'TipoImpuesto' && indices.length === 1) {
    const i = indices[0] - 1;
    enc.Totales.ImpuestosAdicionales = enc.Totales.ImpuestosAdicionales || { ImpuestoAdicional: [] };
    const slot = ensureArraySlot(enc.Totales.ImpuestosAdicionales.ImpuestoAdicional, i);
    slot.TipoImpuesto = value;
    return;
  }

  if (
    (base.startsWith('MontoImpuesto') || base === 'TasaImpuestoAdicional' || base === 'OtrosImpuestosAdicionales') &&
    indices.length === 1 &&
    !base.includes('OtraMoneda')
  ) {
    const i = indices[0] - 1;
    enc.Totales.ImpuestosAdicionales = enc.Totales.ImpuestosAdicionales || { ImpuestoAdicional: [] };
    const slot = ensureArraySlot(enc.Totales.ImpuestosAdicionales.ImpuestoAdicional, i);
    slot[base] = value;
    return;
  }

  if (base === 'TipoCodigo' || base === 'CodigoItem') {
    const itemIdx = (indices[0] || 1) - 1;
    const codeIdx = (indices[1] || 1) - 1;
    const items = doc[rootKey].DetallesItems.Item;
    const item = ensureArraySlot(items, itemIdx);
    item.TablaCodigosItem = item.TablaCodigosItem || { CodigosItem: [] };
    const codeSlot = ensureArraySlot(item.TablaCodigosItem.CodigosItem, codeIdx);
    codeSlot[base] = value;
    return;
  }

  if (
    SUB_DESCUENTO_FIELDS.has(base) &&
    indices.length >= 2
  ) {
    const itemIdx = indices[0] - 1;
    const subIdx = indices[1] - 1;
    const items = doc[rootKey].DetallesItems.Item;
    const item = ensureArraySlot(items, itemIdx);
    item.TablaSubDescuento = item.TablaSubDescuento || { SubDescuento: [] };
    const slot = ensureArraySlot(item.TablaSubDescuento.SubDescuento, subIdx);
    slot[base] = value;
    return;
  }

  if (SUB_RECARGO_FIELDS.has(base) && indices.length >= 2) {
    const itemIdx = indices[0] - 1;
    const subIdx = indices[1] - 1;
    const items = doc[rootKey].DetallesItems.Item;
    const item = ensureArraySlot(items, itemIdx);
    item.TablaSubRecargo = item.TablaSubRecargo || { SubRecargo: [] };
    const slot = ensureArraySlot(item.TablaSubRecargo.SubRecargo, subIdx);
    const field = base === 'MontosubRecargo' ? 'MontoSubRecargo' : base;
    slot[field] = value;
    return;
  }

  if (DOR_FIELDS.has(base) && indices.length >= 1) {
    const dorIdx = indices[0] - 1;
    doc[rootKey].DescuentosORecargos = doc[rootKey].DescuentosORecargos || { DescuentoORecargo: [] };
    const slot = ensureArraySlot(doc[rootKey].DescuentosORecargos.DescuentoORecargo, dorIdx);
    const xmlField = base === 'NumeroLineaDoR' ? 'NumeroLinea' : base;
    slot[xmlField] = value;
    return;
  }

  if (ITEM_FIELDS.has(base) && indices.length >= 1) {
    const itemIdx = indices[0] - 1;
    const items = doc[rootKey].DetallesItems.Item;
    const item = ensureArraySlot(items, itemIdx);
    if (base === 'IndicadorAgenteRetencionoPercepcion' || base === 'MontoITBISRetenido' || base === 'MontoISRRetenido') {
      item.Retencion = item.Retencion || {};
      item.Retencion[base] = value;
      return;
    }
    if (base === 'PesoNetoKilogramo' || base === 'PesoNetoMineria' || base === 'TipoAfiliacion' || base === 'Liquidacion') {
      item.Mineria = item.Mineria || {};
      item.Mineria[base] = value;
      return;
    }
    if (base === 'PrecioOtraMoneda' || base === 'DescuentoOtraMoneda' || base === 'RecargoOtraMoneda' || base === 'MontoItemOtraMoneda') {
      item.OtraMonedaDetalle = item.OtraMonedaDetalle || {};
      item.OtraMonedaDetalle[base] = value;
      return;
    }
    item[base] = value;
    return;
  }

  if (PAGINA_FIELDS.has(base) && indices.length >= 1) {
    const pIdx = indices[0] - 1;
    doc[rootKey].Paginacion = doc[rootKey].Paginacion || { Pagina: [] };
    const page = ensureArraySlot(doc[rootKey].Paginacion.Pagina, pIdx);
    page[base] = value;
    return;
  }

  if (ID_DOC.has(base)) {
    enc.IdDoc[xmlFieldName(base)] = value;
    return;
  }
  if (EMISOR.has(base)) {
    enc.Emisor[base] = value;
    return;
  }
  if (COMPRADOR.has(base)) {
    enc.Comprador = enc.Comprador || {};
    enc.Comprador[base] = value;
    return;
  }
  if (INFO_ADICIONAL.has(base)) {
    enc.InformacionesAdicionales = enc.InformacionesAdicionales || {};
    enc.InformacionesAdicionales[base] = value;
    return;
  }
  if (TRANSPORTE.has(base)) {
    enc.Transporte = enc.Transporte || {};
    enc.Transporte[base] = value;
    return;
  }
  if (TOTALES.has(base)) {
    enc.Totales = enc.Totales || {};
    enc.Totales[base] = value;
    return;
  }
  if (OTRA_MONEDA.has(base)) {
    enc.OtraMoneda = enc.OtraMoneda || {};
    enc.OtraMoneda[base] = value;
    return;
  }
  if (INFO_REF.has(base)) {
    doc[rootKey].InformacionReferencia = doc[rootKey].InformacionReferencia || {};
    doc[rootKey].InformacionReferencia[base] = value;
    return;
  }
  if (base === 'CodigoSeguridadeCF') {
    enc.CodigoSeguridadeCF = value;
    return;
  }
  if (base === 'FechaHoraFirma') {
    if (rootKey === 'ECF') doc[rootKey].FechaHoraFirma = value;
    return;
  }
}

function isEmptyObject(obj) {
  return obj != null && typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj).length === 0;
}

function pruneEmptySections(enc) {
  if (isEmptyObject(enc.Comprador)) delete enc.Comprador;
  if (isEmptyObject(enc.InformacionesAdicionales)) delete enc.InformacionesAdicionales;
  if (isEmptyObject(enc.Transporte)) delete enc.Transporte;
  if (isEmptyObject(enc.OtraMoneda)) delete enc.OtraMoneda;
}

function normalizeItem(item) {
  if (!item || typeof item !== 'object') return;

  const subs = item.TablaSubDescuento?.SubDescuento;
  if (Array.isArray(subs) && subs.length === 1) {
    item.TablaSubDescuento.SubDescuento = subs[0];
  }

  const recs = item.TablaSubRecargo?.SubRecargo;
  if (Array.isArray(recs) && recs.length === 1) {
    item.TablaSubRecargo.SubRecargo = recs[0];
  }
}

function ensureTablaSubDescuento(item) {
  if (!item?.DescuentoMonto || item.TablaSubDescuento) return;
  item.TablaSubDescuento = {
    SubDescuento: {
      TipoSubDescuento: '$',
      MontoSubDescuento: formatNumber(item.DescuentoMonto, 2)
    }
  };
}

function ensureTablaSubRecargo(item) {
  if (!item?.RecargoMonto || item.TablaSubRecargo) return;
  item.TablaSubRecargo = {
    SubRecargo: {
      TipoSubRecargo: '$',
      MontoSubRecargo: formatNumber(item.RecargoMonto, 2)
    }
  };
}

function recalcMontoItem(item) {
  if (!item?.CantidadItem || item.PrecioUnitarioItem == null) return;
  const disc = Number(item.DescuentoMonto || 0);
  const rec = Number(item.RecargoMonto || 0);
  if (!disc && !rec) return;
  const net = Number(item.CantidadItem) * Number(item.PrecioUnitarioItem) - disc + rec;
  item.MontoItem = formatNumber(net, 2);
}

const ITEM_XML_ORDER = [
  'NumeroLinea',
  'TablaCodigosItem',
  'IndicadorFacturacion',
  'Retencion',
  'NombreItem',
  'IndicadorBienoServicio',
  'DescripcionItem',
  'CantidadItem',
  'UnidadMedida',
  'CantidadReferencia',
  'UnidadReferencia',
  'TablaSubcantidad',
  'GradosAlcohol',
  'PrecioUnitarioReferencia',
  'FechaElaboracion',
  'FechaVencimientoItem',
  'Mineria',
  'PrecioUnitarioItem',
  'DescuentoMonto',
  'TablaSubDescuento',
  'RecargoMonto',
  'TablaSubRecargo',
  'TablaImpuestoAdicional',
  'OtraMonedaDetalle',
  'MontoItem'
];

function reorderItemKeys(item) {
  const out = {};
  for (const k of ITEM_XML_ORDER) {
    if (item[k] != null) out[k] = item[k];
  }
  for (const k of Object.keys(item)) {
    if (!(k in out)) out[k] = item[k];
  }
  return out;
}

function normalizeDescuentosORecargos(doc) {
  const dor = doc.ECF.DescuentosORecargos?.DescuentoORecargo;
  if (!dor) return;

  const DOR_ORDER = [
    'NumeroLinea',
    'TipoAjuste',
    'IndicadorNorma1007',
    'DescripcionDescuentooRecargo',
    'TipoValor',
    'ValorDescuentooRecargo',
    'MontoDescuentooRecargo',
    'MontoDescuentooRecargoOtraMoneda',
    'IndicadorFacturacionDescuentooRecargo'
  ];

  const list = Array.isArray(dor) ? dor : [dor];
  const reordered = list.map((row) => {
    if (!row || typeof row !== 'object') return row;
    delete row.IndicadorNorma1007;
    const out = {};
    for (const k of DOR_ORDER) {
      if (row[k] != null) out[k] = row[k];
    }
    for (const k of Object.keys(row)) {
      if (!(k in out)) out[k] = row[k];
    }
    return out;
  });

  doc.ECF.DescuentosORecargos.DescuentoORecargo =
    reordered.length === 1 ? reordered[0] : reordered;
}

function finalizeEcfDocument(doc) {
  const enc = doc.ECF.Encabezado;
  pruneEmptySections(enc);

  const items = doc.ECF.DetallesItems?.Item;
  if (Array.isArray(items)) {
    for (let i = 0; i < items.length; i++) {
      normalizeItem(items[i]);
      ensureTablaSubDescuento(items[i]);
      ensureTablaSubRecargo(items[i]);
      recalcMontoItem(items[i]);
      items[i] = reorderItemKeys(items[i]);
    }
  } else if (items) {
    normalizeItem(items);
    ensureTablaSubDescuento(items);
    ensureTablaSubRecargo(items);
    recalcMontoItem(items);
    doc.ECF.DetallesItems.Item = reorderItemKeys(items);
  }

  normalizeDescuentosORecargos(doc);
}

function xmlFieldName(base) {
  if (base === 'ENCF') return 'eNCF';
  return base;
}

function reorderEncabezado(enc) {
  const order = [
    'Version',
    'IdDoc',
    'Emisor',
    'Comprador',
    'InformacionesAdicionales',
    'Transporte',
    'Totales',
    'OtraMoneda',
    'CodigoSeguridadeCF'
  ];
  const out = {};
  for (const k of order) {
    if (enc[k] != null) out[k] = enc[k];
  }
  for (const k of Object.keys(enc)) {
    if (!(k in out)) out[k] = enc[k];
  }
  return out;
}

function emptyDoc(rootKey) {
  if (rootKey === 'RFCE') {
    return {
      RFCE: {
        Encabezado: {
          IdDoc: {},
          Emisor: {},
          Comprador: {},
          Totales: {}
        }
      }
    };
  }
  return {
    ECF: {
      Encabezado: {
        IdDoc: {},
        Emisor: {},
        Totales: {}
      },
      DetallesItems: { Item: [] }
    }
  };
}

/**
 * Convierte una fila plana del Excel DGII a objeto JSON ECF/RFCE (sin firmar).
 */
export function flatRowToDocument(headers, row, rootKey = 'ECF') {
  const doc = emptyDoc(rootKey);
  const meta = {
    casoPrueba: String(row[0] || '').trim(),
    tipoeCF: '',
    encf: '',
    rncEmisor: ''
  };

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    if (!header || header === 'CasoPrueba') continue;
    const raw = row[i];
    if (isEmptyDgiiValue(raw)) continue;

    const { base, indices } = parseColumnName(header);
    const value = normalizeValue(raw, base);

    if (header === 'CasoPrueba') meta.casoPrueba = value;
    if (base === 'TipoeCF') meta.tipoeCF = value;
    if (base === 'ENCF') meta.encf = value;
    if (base === 'RNCEmisor') meta.rncEmisor = value;

    routeField(rootKey, base, indices, value, doc);
  }

  // RFCE no lleva FechaHoraFirma en la raíz (solo Encabezado + firma digital).
  if (rootKey === 'ECF' && !doc[rootKey].FechaHoraFirma) {
    doc[rootKey].FechaHoraFirma = nowFirmaRd();
  }

  // Un solo ítem: dgii-ecf acepta objeto o array
  if (rootKey === 'ECF') {
    finalizeEcfDocument(doc);
    doc.ECF.Encabezado = reorderEncabezado(doc.ECF.Encabezado);
    const items = doc.ECF.DetallesItems?.Item || [];
    if (items.length === 1) doc.ECF.DetallesItems.Item = items[0];
    else if (items.length === 0) delete doc.ECF.DetallesItems;

    const pages = doc.ECF.Paginacion?.Pagina;
    if (Array.isArray(pages) && pages.length === 1) doc.ECF.Paginacion.Pagina = pages[0];

    const formas = doc.ECF.Encabezado?.IdDoc?.TablaFormasPago?.FormaDePago;
    if (Array.isArray(formas) && formas.length === 1) {
      doc.ECF.Encabezado.IdDoc.TablaFormasPago.FormaDePago = formas[0];
    }

    const tels = doc.ECF.Encabezado?.Emisor?.TablaTelefonoEmisor?.TelefonoEmisor;
    if (Array.isArray(tels) && tels.length === 1) {
      doc.ECF.Encabezado.Emisor.TablaTelefonoEmisor.TelefonoEmisor = tels[0];
    }
  }

  if (rootKey === 'RFCE') {
    doc.RFCE.Encabezado = reorderEncabezado(doc.RFCE.Encabezado);
  }

  return { doc, meta };
}
