import { Transformer } from 'dgii-ecf';
import { decimalRD } from '../domain/creditFiscalInvoice.schema.js';
import { digitsOnly, normalizeTipoeCF } from '../domain/facturacionEmit.schema.js';

function str(v) {
  return v != null ? String(v).trim() : '';
}

/** DGII: un solo teléfono, 10 dígitos RD (809/829/849), sin +1 ni barras. */
export function telefonoDgii(raw) {
  const parts = String(raw || '')
    .split(/[/;,|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const candidates = parts.length ? parts : [String(raw || '')];
  for (const c of candidates) {
    let d = String(c).replace(/\D/g, '');
    if (!d) continue;
    if (d.startsWith('1') && d.length === 11) d = d.slice(1);
    if (d.length === 10 && /^8(09|29|49)/.test(d)) return d;
  }
  return '';
}

function round2(n) {
  return decimalRD(n, 2);
}

function round4(n) {
  return decimalRD(n, 4);
}

/** DD-MM-YYYY en America/Santo_Domingo */
export function formatFechaDgii(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('es-DO', {
    timeZone: 'America/Santo_Domingo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).formatToParts(Number.isNaN(d.getTime()) ? new Date() : d);
  const get = (t) => parts.find((p) => p.type === t)?.value || '01';
  return `${get('day')}-${get('month')}-${get('year')}`;
}

export function fechaHoraFirmaNow() {
  const parts = new Intl.DateTimeFormat('es-DO', {
    timeZone: 'America/Santo_Domingo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value || '00';
  return `${get('day')}-${get('month')}-${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

export function setFechaHoraFirma(xml) {
  const now = fechaHoraFirmaNow();
  if (/<FechaHoraFirma>/.test(xml)) {
    return xml.replace(/<FechaHoraFirma>[^<]*<\/FechaHoraFirma>/, `<FechaHoraFirma>${now}</FechaHoraFirma>`);
  }
  return xml.replace(/<\/ECF>\s*$/, `  <FechaHoraFirma>${now}</FechaHoraFirma>\n</ECF>`);
}

function prune(value) {
  if (value == null) return undefined;
  if (typeof value === 'string') return value === '' ? undefined : value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    const arr = value.map(prune).filter((x) => x !== undefined);
    return arr.length ? arr : undefined;
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const p = prune(v);
      if (p !== undefined) out[k] = p;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return undefined;
}

function emisorFromDraft(draft) {
  const e = draft.emisor || {};
  const rnc = digitsOnly(e.rnc || process.env.FACTURA_EMISOR_RNC || process.env.DGII_FE_RNC || '131631088');
  const razon =
    str(process.env.FACTURA_EMISOR_RAZON) ||
    str(e.nombreComercial) ||
    'BUENOHOTEL, S.R.L.';
  const telNorm = telefonoDgii(e.telefono || process.env.FACTURA_EMISOR_TELEFONO);
  const tels = telNorm ? [telNorm] : undefined;

  return prune({
    RNCEmisor: rnc,
    RazonSocialEmisor: razon.slice(0, 150),
    NombreComercial: str(e.nombreComercial || razon).slice(0, 150),
    DireccionEmisor: str(e.direccion || process.env.FACTURA_EMISOR_DIRECCION)
      .replace(/\s+/g, ' ')
      .slice(0, 100),
    Municipio: str(process.env.DGII_EMISOR_MUNICIPIO || '010100'),
    Provincia: str(process.env.DGII_EMISOR_PROVINCIA || '010000'),
    TablaTelefonoEmisor: tels ? { TelefonoEmisor: tels } : undefined,
    CorreoEmisor: str(e.email || process.env.FACTURA_EMISOR_EMAIL || 'info@buenohotel.com'),
    NumeroFacturaInterna: str(draft.transaccion?.numeroFacturaInterna || '').slice(0, 20) || undefined,
    FechaEmision: formatFechaDgii(
      draft.transaccion?.fechaEmisionISO ? new Date(draft.transaccion.fechaEmisionISO) : new Date()
    )
  });
}

function compradorFromDraft(draft, tipoeCF) {
  const c = draft.comprador || {};
  const rnc = digitsOnly(c.rncCliente || c.rncComprador || c.rnc);
  const razon = str(c.nombreRazon || c.razonSocialComprador).slice(0, 150) || 'EMPRESA';
  // XSD DGII: RNCComprador (o IdentificadorExtranjero) y después RazonSocialComprador.
  const out = {};
  if (rnc.length >= 9) {
    out.RNCComprador = rnc;
  } else {
    const idExt = digitsOnly(c.identificadorExtranjero);
    if (idExt) out.IdentificadorExtranjero = idExt.slice(0, 20);
  }
  out.RazonSocialComprador = razon;
  if (str(c.email)) out.CorreoComprador = str(c.email).slice(0, 80);
  if (str(c.direccion)) out.DireccionComprador = str(c.direccion).replace(/\s+/g, ' ').slice(0, 100);
  const telComp = telefonoDgii(c.telefono);
  if (telComp) out.TelefonoAdicional = telComp;
  return prune(out);
}

const COMPRADOR_XML_ORDER = [
  'RNCComprador',
  'IdentificadorExtranjero',
  'RazonSocialComprador',
  'ContactoComprador',
  'CorreoComprador',
  'DireccionComprador',
  'MunicipioComprador',
  'ProvinciaComprador',
  'PaisComprador',
  'FechaNacimiento',
  'TelefonoAdicional'
];

/** Reordena nodos de <Comprador> al orden del formato XML DGII. */
export function ordenarCompradorXml(xml) {
  return String(xml || '').replace(/<Comprador>([\s\S]*?)<\/Comprador>/g, (_, inner) => {
    const map = {};
    const re = /<([A-Za-z0-9]+)>([\s\S]*?)<\/\1>/g;
    let m;
    while ((m = re.exec(inner))) {
      map[m[1]] = m[0];
    }
    const used = new Set();
    const parts = [];
    for (const k of COMPRADOR_XML_ORDER) {
      if (map[k]) {
        parts.push(map[k]);
        used.add(k);
      }
    }
    for (const k of Object.keys(map)) {
      if (!used.has(k)) parts.push(map[k]);
    }
    return `<Comprador>${parts.join('')}</Comprador>`;
  });
}

/**
 * IndicadorFacturacion DGII:
 * 1 = gravado ITBIS 18%, 4 = exento
 */
function indicadorFacturacion(linea) {
  if (linea.gravadoItbis === false) return 4;
  if (linea.IndicadorFacturacion != null) return Number(linea.IndicadorFacturacion);
  return 1;
}

function mapItem(linea, index) {
  const qty = Number(linea.cantidad ?? linea.CantidadItem ?? 1) || 1;
  const precio = round4(linea.precioUnitario ?? linea.PrecioUnitarioItem ?? 0);
  const monto = round2(
    linea.importeLinea != null && linea.itbisLinea == null && !linea.gravadoItbis
      ? linea.importeLinea
      : linea.MontoItem != null
        ? linea.MontoItem
        : precio * qty
  );
  // Para gravados: MontoItem = cantidad * precio (sin ITBIS) cuando IndicadorMontoGravado=0
  const montoItem = linea.gravadoItbis
    ? round2(precio * qty)
    : round2(linea.importeLinea ?? monto);

  return prune({
    NumeroLinea: index + 1,
    IndicadorFacturacion: indicadorFacturacion(linea),
    NombreItem: str(linea.descripcion || linea.NombreItem || 'Servicio').slice(0, 80),
    IndicadorBienoServicio: 2,
    DescripcionItem: str(linea.descripcion || '').slice(0, 1000) || undefined,
    CantidadItem: round2(qty),
    UnidadMedida: 43,
    PrecioUnitarioItem: precio,
    MontoItem: montoItem
  });
}

function totalesFromDraft(draft) {
  const t = draft.totales || {};
  let gravadoCalc = 0;
  let exentoCalc = 0;
  for (const ln of draft.lineas || []) {
    const qty = Number(ln.cantidad ?? 1) || 1;
    const precio = Number(ln.precioUnitario ?? 0) || 0;
    if (ln.gravadoItbis) gravadoCalc += precio * qty;
    else exentoCalc += Number(ln.importeLinea ?? precio * qty) || 0;
  }
  gravadoCalc = round2(gravadoCalc || t.subtotalGravado || t.tarifaBase || 0);
  exentoCalc = round2(exentoCalc || t.subtotalExento || 0);

  const itbis = round2(t.itbis ?? t.TotalITBIS ?? 0);
  const montoTotal = round2(t.totalRD ?? t.MontoTotal ?? gravadoCalc + exentoCalc + itbis);

  return prune({
    MontoGravadoTotal: gravadoCalc,
    MontoGravadoI1: gravadoCalc,
    MontoExento: exentoCalc,
    ITBIS1: 18,
    TotalITBIS: itbis,
    TotalITBIS1: itbis,
    MontoTotal: montoTotal,
    MontoPeriodo: montoTotal,
    ValorPagar: montoTotal
  });
}

/**
 * Construye documento IECF listo para Transformer.json2xml
 */
export function draftToIecfDocument(draft, { encf, tipoeCF } = {}) {
  const compradorSrc = draft.comprador || {};
  const tipo = normalizeTipoeCF(tipoeCF ?? draft.tipoeCF, compradorSrc);
  const eNCF = str(encf || draft.documento?.ncf);
  if (!eNCF) throw new Error('eNCF requerido para mapear IECF');

  const totales = totalesFromDraft(draft);
  const items = (draft.lineas || []).map(mapItem);
  if (!items.length) throw new Error('Se requiere al menos una línea');

  const fechaVenc =
    str(process.env.DGII_NCF_FECHA_VENCIMIENTO) ||
    str(draft.documento?.validaHastaLabel)?.replace(/[^\d-]/g, '') ||
    '31-12-2026';

  const idDoc = prune({
    TipoeCF: tipo,
    eNCF,
    FechaVencimientoSecuencia: fechaVenc,
    IndicadorMontoGravado: 0,
    TipoIngresos: str(process.env.DGII_TIPO_INGRESOS || '01'),
    TipoPago: 1,
    TablaFormasPago: {
      FormaDePago: [
        {
          FormaPago: 1,
          MontoPago: totales.MontoTotal
        }
      ]
    }
  });

  const doc = {
    ECF: prune({
      Encabezado: {
        Version: '1.0',
        IdDoc: idDoc,
        Emisor: emisorFromDraft(draft),
        Comprador: compradorFromDraft(draft, tipo),
        Totales: totales
      },
      DetallesItems: { Item: items },
      FechaHoraFirma: fechaHoraFirmaNow()
    })
  };

  return { document: doc, tipoeCF: tipo, encf: eNCF, totales };
}

export function iecfDocumentToXml(document) {
  const transformer = new Transformer();
  return ordenarCompradorXml(transformer.json2xml(document, true));
}
