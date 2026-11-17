import { Transformer } from 'dgii-ecf';
import { decimalRD } from '../domain/creditFiscalInvoice.schema.js';
import { digitsOnly, normalizeTipoeCF } from '../domain/facturacionEmit.schema.js';

function str(v) {
  return v != null ? String(v).trim() : '';
}

const TEL_DGII_RE = /^8(09|29|49)-\d{3}-\d{4}$/;
const FECHA_DGII_RE = /^\d{2}-\d{2}-\d{4}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 10 dígitos RD (809/829/849), sin +1 ni barras. */
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

/** XSD DGII: ###-###-#### (códigos 1273 / 1503 si va pegado o con +1). */
export function telefonoDgiiXml(raw) {
  const d = telefonoDgii(raw);
  if (!d) return '';
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
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
    str(e.nombreComercial) ||
    str(process.env.FACTURA_EMISOR_NOMBRE) ||
    str(process.env.FACTURA_EMISOR_RAZON) ||
    'BUENOHOTEL S.R.L';
  const telXml = telefonoDgiiXml(
    e.telefono || process.env.FACTURA_EMISOR_TELEFONO || '8095664292'
  );
  if (!TEL_DGII_RE.test(telXml)) {
    throw Object.assign(
      new Error('El teléfono del emisor debe ser ###-###-#### (809/829/849). No se enviará.'),
      { status: 400, code: 'DGII_XML_PREFLIGHT' }
    );
  }

  return prune({
    RNCEmisor: rnc,
    RazonSocialEmisor: razon.slice(0, 150),
    NombreComercial: str(e.nombreComercial || razon).slice(0, 150),
    DireccionEmisor: str(
      e.direccion || 'C/ Dario Concepción no. 18, San Gerónimo, Santo Domingo DN. 10104'
    )
      .replace(/\s+/g, ' ')
      .slice(0, 100),
    Municipio: str(process.env.DGII_EMISOR_MUNICIPIO || '010100'),
    Provincia: str(process.env.DGII_EMISOR_PROVINCIA || '010000'),
    TablaTelefonoEmisor: { TelefonoEmisor: telXml },
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
  if (Number(tipoeCF) === 31 && (rnc.length < 9 || rnc.length > 11)) {
    throw Object.assign(
      new Error('El RNC del comprador es obligatorio (9 a 11 dígitos) para crédito fiscal. No se enviará.'),
      { status: 400, code: 'DGII_XML_PREFLIGHT' }
    );
  }
  const razon = str(c.nombreRazon || c.razonSocialComprador).slice(0, 150);
  if (razon.length < 2) {
    throw Object.assign(new Error('Falta la razón social del comprador. No se enviará a Impuestos Internos.'), {
      status: 400,
      code: 'DGII_XML_PREFLIGHT'
    });
  }
  const telComp = telefonoDgiiXml(c.telefono);
  if (!telComp) {
    throw Object.assign(
      new Error('El teléfono del comprador debe ser ###-###-#### (809/829/849). No se enviará a Impuestos Internos.'),
      { status: 400, code: 'DGII_XML_PREFLIGHT' }
    );
  }
  const email = str(c.email).slice(0, 80);
  if (!EMAIL_RE.test(email)) {
    throw Object.assign(new Error('El correo del comprador es obligatorio y debe ser válido. No se enviará.'), {
      status: 400,
      code: 'DGII_XML_PREFLIGHT'
    });
  }
  const dir = str(c.direccion).replace(/\s+/g, ' ').slice(0, 100);
  if (dir.length < 5) {
    throw Object.assign(new Error('La dirección del comprador es obligatoria. No se enviará.'), {
      status: 400,
      code: 'DGII_XML_PREFLIGHT'
    });
  }
  // XSD DGII: RNCComprador (o IdentificadorExtranjero) y después RazonSocialComprador.
  const out = {};
  if (rnc.length >= 9) {
    out.RNCComprador = rnc;
  } else {
    const idExt = digitsOnly(c.identificadorExtranjero);
    if (idExt) out.IdentificadorExtranjero = idExt.slice(0, 20);
  }
  out.RazonSocialComprador = razon;
  out.CorreoComprador = email;
  out.DireccionComprador = dir;
  out.TelefonoAdicional = telComp;
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
  const desc = round2(linea.descuentoLinea ?? linea.DescuentoMonto ?? 0);
  const baseMonto = round2(Math.max(0, round2(precio * qty) - desc));
  const gravado = indicadorFacturacion(linea) !== 4;
  const montoItem = gravado
    ? baseMonto
    : round2(
        Number.isFinite(Number(linea.importeLinea)) ? Math.max(0, Number(linea.importeLinea)) : baseMonto
      );

  return prune({
    NumeroLinea: index + 1,
    IndicadorFacturacion: indicadorFacturacion(linea),
    NombreItem: str(linea.descripcion || linea.NombreItem || 'Servicio').slice(0, 80),
    IndicadorBienoServicio: 2,
    DescripcionItem: str(linea.descripcion || '').slice(0, 1000) || undefined,
    CantidadItem: round2(qty),
    UnidadMedida: 43,
    PrecioUnitarioItem: precio,
    DescuentoMonto: desc > 0 ? desc : undefined,
    MontoItem: montoItem
  });
}

function lineImporte(linea) {
  const qty = Number(linea.cantidad ?? 1) || 1;
  const precio = Number(linea.precioUnitario ?? 0) || 0;
  const desc = Number(linea.descuentoLinea ?? 0) || 0;
  const base = round2(Math.max(0, round2(precio * qty) - desc));
  if (linea.gravadoItbis === false || indicadorFacturacion(linea) === 4) {
    const imp = Number(linea.importeLinea);
    if (Number.isFinite(imp) && imp !== 0) return round2(imp);
    return base;
  }
  return base;
}

function esLineaLey10(linea) {
  return /10\s*%\s*ley/i.test(String(linea?.descripcion || linea?.NombreItem || '').trim());
}

/**
 * En XML DGII, MontoExento junta 10% ley y otras exentas.
 * En impresión se separan: ley10 vs Otras Tasas Exentas (como Eventos).
 */
function splitExentoPrint(draft, totales) {
  const montoExento = round2(Number(totales?.MontoExento || 0));
  const lineas = Array.isArray(draft?.lineas) ? draft.lineas : [];
  const leyFromLines = round2(lineas.filter(esLineaLey10).reduce((s, ln) => s + lineImporte(ln), 0));
  const draftLey = round2(Number(draft?.totales?.ley10 || 0));
  let ley10 = leyFromLines > 0 ? leyFromLines : draftLey;
  if (ley10 > montoExento) ley10 = montoExento;
  const otras = round2(Math.max(0, montoExento - ley10));
  return { ley10, otras, montoExento };
}

function totalesFromDraft(draft) {
  const t = draft.totales || {};
  const lineas = draft.lineas || [];
  const flagged = lineas.some((ln) => ln.gravadoItbis === true || ln.gravadoItbis === false);
  let gravadoCalc = 0;
  let exentoCalc = 0;
  const itbis = round2(t.itbis ?? t.TotalITBIS ?? 0);
  for (const ln of lineas) {
    const monto = lineImporte(ln);
    if (flagged) {
      if (ln.gravadoItbis) gravadoCalc += monto;
      else exentoCalc += monto;
    } else if (itbis > 0) {
      gravadoCalc += monto;
    } else {
      exentoCalc += monto;
    }
  }
  gravadoCalc = round2(gravadoCalc || t.subtotalGravado || t.tarifaBase || 0);
  exentoCalc = round2(exentoCalc || t.subtotalExento || 0);

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

/**
 * Vista / impresión con los mismos valores que el XML DGII
 * (teléfono 10 dígitos, dirección en una línea, montos de ítem sin ITBIS).
 */
export function printModelFromDraft(draft, { encf, esPreview } = {}) {
  const tipo = normalizeTipoeCF(draft?.tipoeCF, draft?.comprador || {});
  const ncfReal = str(encf || draft?.documento?.ncf);
  const ncfMap = ncfReal || `E${String(tipo).padStart(2, '0')}0000000000`;
  const { document, totales } = draftToIecfDocument(draft, { encf: ncfMap, tipoeCF: tipo });
  const enc = document?.ECF?.Encabezado || {};
  const em = enc.Emisor || {};
  const co = enc.Comprador || {};
  const idDoc = enc.IdDoc || {};
  let items = document?.ECF?.DetallesItems?.Item;
  if (!Array.isArray(items)) items = items ? [items] : [];
  const telRaw = em.TablaTelefonoEmisor?.TelefonoEmisor;
  const telEmisor = Array.isArray(telRaw) ? telRaw[0] : telRaw;
  const ncfVista = esPreview && !ncfReal ? 'SIN e-NCF (se asigna al emitir)' : ncfMap;
  const tipoTitulo =
    tipo === 31 ? 'FACTURA DE CRÉDITO FISCAL ELECTRÓNICA' : `e-CF tipo ${tipo}`;
  return {
    emisor: {
      nombreComercial: em.NombreComercial || em.RazonSocialEmisor || '',
      rnc: em.RNCEmisor || '',
      direccion: em.DireccionEmisor || '',
      telefono: telEmisor || '',
      email: em.CorreoEmisor || ''
    },
    comprador: {
      nombreRazon: co.RazonSocialComprador || '',
      rncCliente: co.RNCComprador || '',
      email: co.CorreoComprador || '',
      telefono: co.TelefonoAdicional || '',
      direccion: co.DireccionComprador || ''
    },
    documento: {
      ncf: ncfVista,
      tipo: tipoTitulo,
      tipoTituloContrato: tipoTitulo,
      validaHastaLabel: idDoc.FechaVencimientoSecuencia
        ? `Válida hasta ${idDoc.FechaVencimientoSecuencia}`
        : ''
    },
    transaccion: {
      fechaEmisionEtiqueta: em.FechaEmision || '',
      numeroFacturaInterna: em.NumeroFacturaInterna || '',
      condicionPago: idDoc.TipoPago === 1 ? 'CONTADO' : ''
    },
    lineas: items.map((it) => ({
      descripcion: it.DescripcionItem || it.NombreItem || '',
      cantidad: it.CantidadItem,
      unidad: 'UND',
      precioUnitario: it.PrecioUnitarioItem,
      descuentoLinea: it.DescuentoMonto != null ? it.DescuentoMonto : null,
      itbisLinea: null,
      importeLinea: it.MontoItem,
      gravadoItbis: Number(it.IndicadorFacturacion) !== 4
    })),
    totales: (() => {
      const split = splitExentoPrint(draft, totales);
      const src = draft?.totales || {};
      return {
        totalRD: totales.MontoTotal,
        MontoTotal: totales.MontoTotal,
        itbis: totales.TotalITBIS,
        subtotalGravado: totales.MontoGravadoTotal,
        tarifaBase: totales.MontoGravadoTotal,
        subtotalExento: split.otras,
        ley10: split.ley10,
        ley10Pct: src.ley10Pct != null ? src.ley10Pct : 10,
        subTotal: round2(Number(totales.MontoGravadoTotal || 0) + Number(split.montoExento || 0)),
        descuento: src.descuento,
        descuentoPct: src.descuentoPct,
        tieneDescuento: src.tieneDescuento,
        moneda: src.moneda === 'USD' ? 'USD' : 'DOP'
      };
    })(),
    verificacion: draft?.verificacion || {},
    observacionLegal: draft?.observacionLegal
  };
}

export function forzarTelefonosEnXml(xml) {
  const fmt = (raw) => {
    const d = telefonoDgii(raw);
    return d ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : '';
  };
  return String(xml || '')
    .replace(/<TelefonoEmisor>([^<]*)<\/TelefonoEmisor>/g, (m, v) => {
      const t = fmt(v);
      return t ? `<TelefonoEmisor>${t}</TelefonoEmisor>` : m;
    })
    .replace(/<TelefonoAdicional>([^<]*)<\/TelefonoAdicional>/g, (m, v) => {
      const t = fmt(v);
      return t ? `<TelefonoAdicional>${t}</TelefonoAdicional>` : m;
    });
}

export function iecfDocumentToXml(document) {
  const transformer = new Transformer();
  return forzarTelefonosEnXml(ordenarCompradorXml(transformer.json2xml(document, true)));
}

function failXml(message) {
  const err = new Error(message);
  err.status = 400;
  err.code = 'DGII_XML_PREFLIGHT';
  throw err;
}

function tagsXml(xml, tag) {
  const out = [];
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'gi');
  let m;
  while ((m = re.exec(xml))) {
    const inner = String(m[1] || '').replace(/\s+/g, ' ').trim();
    if (!inner || inner.includes('<')) continue;
    out.push(inner);
  }
  return out;
}

/**
 * Cero excepciones: si un campo del XML no cumple el formato DGII, no se envía.
 */
export function assertXmlCumpleDgii(xml, { tipoeCF, encf } = {}) {
  const raw = String(xml || '');
  if (!raw.includes('<ECF')) failXml('El XML no es un e-CF. No se enviará a Impuestos Internos.');
  const tipo = Number(tipoeCF) || Number((tagsXml(raw, 'TipoeCF')[0] || '').replace(/\D/g, '')) || 31;

  const mun = tagsXml(raw, 'Municipio')[0] || '';
  if (!/^\d{6}$/.test(mun)) {
    failXml('El Municipio del emisor en el XML debe ser 6 dígitos DGII. No se enviará.');
  }
  const prov = tagsXml(raw, 'Provincia')[0] || '';
  if (!/^\d{6}$/.test(prov)) {
    failXml('La Provincia del emisor en el XML debe ser 6 dígitos DGII. No se enviará.');
  }

  const telsEmisor = tagsXml(raw, 'TelefonoEmisor');
  if (!telsEmisor.length) failXml('Falta TelefonoEmisor en el XML (###-###-#### 809/829/849). No se enviará.');
  for (const t of telsEmisor) {
    if (!TEL_DGII_RE.test(t)) {
      failXml(`TelefonoEmisor inválido (${t || 'vacío'}). Debe ser ###-###-#### con 809, 829 o 849. No se enviará.`);
    }
  }
  const telsComp = tagsXml(raw, 'TelefonoAdicional');
  if (!telsComp.length) failXml('Falta TelefonoAdicional del comprador en el XML. No se enviará.');
  for (const t of telsComp) {
    if (!TEL_DGII_RE.test(t)) {
      failXml(`TelefonoAdicional inválido (${t || 'vacío'}). Debe ser ###-###-#### con 809, 829 o 849. No se enviará.`);
    }
  }
  if (/<TelefonoEmisor>\s*\+?1?\s*\d{10}\s*</i.test(raw) || /<TelefonoAdicional>\s*\+?1?\s*\d{10}\s*</i.test(raw)) {
    failXml('Hay un teléfono en el XML sin el formato ###-###-####. No se enviará (evita códigos 1273/1503).');
  }

  const rncEmisor = (tagsXml(raw, 'RNCEmisor')[0] || '').replace(/\D/g, '');
  if (rncEmisor.length !== 9 && rncEmisor.length !== 11) {
    failXml('El RNC del emisor en el XML no es válido. No se enviará.');
  }
  const rncComp = (tagsXml(raw, 'RNCComprador')[0] || '').replace(/\D/g, '');
  if (tipo === 31 && (rncComp.length < 9 || rncComp.length > 11)) {
    failXml('El RNC del comprador en el XML es obligatorio (9 a 11 dígitos) para crédito fiscal. No se enviará.');
  }
  const razon = tagsXml(raw, 'RazonSocialComprador')[0] || '';
  if (razon.length < 2) failXml('Falta la razón social del comprador en el XML. No se enviará.');
  const dirEm = tagsXml(raw, 'DireccionEmisor')[0] || '';
  if (dirEm.length < 5) failXml('Falta la dirección del emisor en el XML. No se enviará.');
  const dirCo = tagsXml(raw, 'DireccionComprador')[0] || '';
  if (dirCo.length < 5) failXml('Falta la dirección del comprador en el XML. No se enviará.');

  const mailEm = tagsXml(raw, 'CorreoEmisor')[0] || '';
  if (!EMAIL_RE.test(mailEm)) failXml('El correo del emisor en el XML no es válido. No se enviará.');
  const mailCo = tagsXml(raw, 'CorreoComprador')[0] || '';
  if (!EMAIL_RE.test(mailCo)) failXml('El correo del comprador en el XML no es válido. No se enviará.');

  const fecha = tagsXml(raw, 'FechaEmision')[0] || '';
  if (!FECHA_DGII_RE.test(fecha)) failXml('La fecha de emisión en el XML debe ser DD-MM-AAAA. No se enviará.');

  const encfXml = (tagsXml(raw, 'eNCF')[0] || '').toUpperCase();
  if (encf) {
    if (encfXml !== String(encf).toUpperCase()) {
      failXml('El e-NCF del XML no coincide con el reservado. No se enviará.');
    }
  } else if (!/^E\d{12,}$/.test(encfXml)) {
    failXml('El e-NCF del XML no tiene el formato de Impuestos Internos. No se enviará.');
  }

  const monto = Number(String(tagsXml(raw, 'MontoTotal')[0] || '').replace(',', '.'));
  if (!Number.isFinite(monto) || monto <= 0) {
    failXml('El MontoTotal del XML es inválido. No se enviará.');
  }
  return true;
}

/**
 * Arma el XML con un e-NCF ficticio y valida todos los requisitos DGII
 * ANTES de reservar secuencia real. Sin excepciones.
 */
export function assertXmlListoParaEmitir(draft, tipoeCF) {
  const tipo = normalizeTipoeCF(tipoeCF ?? draft?.tipoeCF, draft?.comprador || {});
  const dummy = `E${String(tipo).padStart(2, '0')}0000000000`;
  const mun = digitsOnly(process.env.DGII_EMISOR_MUNICIPIO || '010100');
  const prov = digitsOnly(process.env.DGII_EMISOR_PROVINCIA || '010000');
  if (mun.length !== 6) {
    failXml('El Municipio del emisor no está configurado (6 dígitos DGII). No se gastará e-NCF.');
  }
  if (prov.length !== 6) {
    failXml('La Provincia del emisor no está configurada (6 dígitos DGII). No se gastará e-NCF.');
  }
  if (!telefonoDgii(draft?.comprador?.telefono)) {
    failXml(
      'El teléfono de la empresa no es válido para Impuestos Internos: un solo número de 10 dígitos (809, 829 o 849). No se gastará e-NCF.'
    );
  }
  if (!telefonoDgii(draft?.emisor?.telefono || process.env.FACTURA_EMISOR_TELEFONO || '8095664292')) {
    failXml('El teléfono del emisor no es válido (809/829/849). No se gastará e-NCF.');
  }
  const rnc = digitsOnly(
    draft?.comprador?.rncCliente || draft?.comprador?.rncComprador || draft?.comprador?.rnc
  );
  if (tipo === 31 && (rnc.length < 9 || rnc.length > 11)) {
    failXml('El RNC de la empresa no es válido para crédito fiscal (9 a 11 dígitos). No se gastará e-NCF.');
  }
  const emailCo = String(draft?.comprador?.email || '').trim();
  if (!EMAIL_RE.test(emailCo)) {
    failXml('El correo de la empresa es obligatorio y debe ser válido. No se gastará e-NCF.');
  }
  const dirCo = String(draft?.comprador?.direccion || '').trim();
  if (dirCo.length < 5) {
    failXml('La dirección de la empresa es obligatoria. No se gastará e-NCF.');
  }
  let xml = '';
  try {
    const { document } = draftToIecfDocument(draft, { encf: dummy, tipoeCF: tipo });
    xml = setFechaHoraFirma(iecfDocumentToXml(document));
  } catch (e) {
    failXml(`No se pudo armar el XML (${e?.message || 'error'}). No se gastará e-NCF.`);
  }
  assertXmlCumpleDgii(xml, { tipoeCF: tipo });
  return xml;
}
