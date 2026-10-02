import EventService from './event.service.js';
import RegistrationModel from '../models/registration.model.js';
import { TIPO_COMPROBANTE, decimalRD } from '../domain/creditFiscalInvoice.schema.js';
import { getTasaCambio } from './tasaCambio.service.js';
import { enrichVerificacionQr } from './ecfQr.service.js';
import { formatFechaDgii } from './facturacionIecf.mapper.js';
import { resolveDgiiEnvironment } from '../domain/facturacionEmit.schema.js';

function str(v) {
  return v != null ? String(v).trim() : '';
}

/** Desenvuelve atributos Dynamo { S, N, BOOL } si el DocumentClient no los normalizó. */
function unwrapScalar(v) {
  if (v == null) return v;
  if (typeof v === 'object' && v.S !== undefined && v.S !== null) return v.S;
  if (typeof v === 'object' && v.N !== undefined && v.N !== null) return Number(v.N);
  if (typeof v === 'object' && v.BOOL !== undefined) return Boolean(v.BOOL);
  return v;
}

/** Evita RangeError en toISOString() cuando fechaRegistro viene vacío o mal formado. */
function safeEmissionDate(reg) {
  const raw = unwrapScalar(reg?.fechaRegistro) ?? unwrapScalar(reg?.fechaCreacion) ?? unwrapScalar(reg?.fechaActualizacion);
  let d;
  if (raw instanceof Date) {
    d = raw;
  } else if (typeof raw === 'number' && Number.isFinite(raw)) {
    d = new Date(raw);
  } else if (typeof raw === 'string' && String(raw).trim()) {
    const t = Date.parse(raw);
    d = Number.isNaN(t) ? new Date() : new Date(t);
  } else {
    d = new Date();
  }
  if (Number.isNaN(d.getTime())) d = new Date();
  return d;
}

function pagoEstadoAprobado(p) {
  return String(p?.estado || '')
    .toLowerCase()
    .trim() === 'aprobado';
}

function montoPagoNum(v) {
  const u = unwrapScalar(v);
  if (u == null) return 0;
  if (typeof u === 'number') return Number.isFinite(u) ? u : 0;
  const s = String(u)
    .replace(/[^\d.,\-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function normalizePagoRow(p) {
  if (!p || typeof p !== 'object') return p;
  if (p.M && typeof p.M === 'object') {
    return normalizePagoRow(unwrapMapShallow(p.M));
  }
  const out = { ...p };
  out.estado = unwrapScalar(out.estado);
  out.monto = unwrapScalar(out.monto);
  out.metodo = unwrapScalar(out.metodo);
  out.fecha = unwrapScalar(out.fecha);
  out.id = unwrapScalar(out.id) ?? out.id;
  return out;
}

/** Lista de abonos tolerante a L/M sin unmarshalling completo (reg.pagos o detalles.pagos). */
function parsePagosList(raw) {
  if (!raw) return [];
  let list = raw;
  if (typeof list === 'object' && Array.isArray(list.L)) {
    list = list.L.map((cell) => {
      if (!cell || typeof cell !== 'object') return {};
      return cell.M ? unwrapMapShallow(cell.M) : unwrapMapShallow(cell);
    });
  }
  if (!Array.isArray(list)) return [];
  return list.filter((p) => p && typeof p === 'object').map((p) => normalizePagoRow(p));
}

function pagosArrayFromReg(reg) {
  const top = parsePagosList(reg?.pagos);
  if (top.length) return top;
  const det = reg?.detalles && typeof reg.detalles === 'object' ? reg.detalles : {};
  return parsePagosList(det.pagos);
}

function unwrapMapShallow(m) {
  if (!m || typeof m !== 'object') return m;
  const out = {};
  for (const [k, v] of Object.entries(m)) {
    out[k] = unwrapScalar(v);
  }
  return out;
}

function resumenPagosDesdeLista(pagos, tasaCambio = 1) {
  const arr = Array.isArray(pagos) ? pagos : [];
  return arr
    .filter((p) => pagoEstadoAprobado(p))
    .map((p) => ({
      fecha: str(p.fecha || ''),
      metodo: str(p.metodo || ''),
      estado: str(p.estado || ''),
      monto: decimalRD(montoPagoNum(p.monto) * (Number(tasaCambio) || 1))
    }));
}

/** Valor simple o envuelto tipo Dynamo { S, N } */
function dynField(v) {
  const u = unwrapScalar(v);
  if (u == null || u === '') return '';
  if (typeof u === 'object' && u.S != null) return String(u.S);
  if (typeof u === 'object' && u.N != null) return String(u.N);
  return String(u);
}

/** USD | DOP según evento en panel o dato guardado en el registro */
export function resolveMonedaDocumento(evento, det) {
  const fromReg = dynField(det?.monedaEvento) || dynField(det?.monedaDocumento) || dynField(det?.precio_moneda);
  if (fromReg) {
    const u = String(fromReg).trim().toUpperCase();
    return u === 'USD' ? 'USD' : 'DOP';
  }
  if (evento) {
    const m = String(dynField(evento.precio_moneda) || '').trim().toUpperCase();
    return m === 'USD' ? 'USD' : 'DOP';
  }
  return 'DOP';
}

function resolveMonedaMontoExento(det, monedaEvento) {
  const raw = unwrapScalar(det?.montoFacturaExentoMoneda) ?? det?.montoFacturaExentoMoneda;
  const u = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (u === 'USD') return 'USD';
  if (u === 'DOP') return 'DOP';
  return monedaEvento;
}

/** Datos legales del emisor por defecto (sobrescribibles con FACTURA_EMISOR_* en el servidor). */
const EMISOR_DEFECTO_EVENTOS = Object.freeze({
  nombreComercial: 'BUENOHOTEL S.R.L',
  rnc: '131631088',
  email: 'info@buenohotel.com',
  telefono: '+1 809 566 4292',
  direccion: 'C/ Dario Concepción no. 18, San Gerónimo,\nSanto Domingo DN. 10104'
});

function loadEmisorFromEnv() {
  const d = EMISOR_DEFECTO_EVENTOS;
  return {
    nombreComercial: str(process.env.FACTURA_EMISOR_NOMBRE) || d.nombreComercial,
    direccion: str(process.env.FACTURA_EMISOR_DIRECCION) || d.direccion,
    telefono: str(process.env.FACTURA_EMISOR_TELEFONO) || d.telefono,
    rnc: str(process.env.FACTURA_EMISOR_RNC) || d.rnc,
    email: str(process.env.FACTURA_EMISOR_EMAIL) || d.email,
    sloganLeyenda: str(process.env.FACTURA_EMISOR_SLOGAN)
  };
}

export function taxableBaseFromTotalIncluyeItbis(totalIncluyeItbis, itbisPct) {
  const t = decimalRD(totalIncluyeItbis);
  const pct = Number(itbisPct);
  const rate = Number.isFinite(pct) && pct > 0 ? 1 + pct / 100 : 1;
  return rate > 0 ? decimalRD(t / rate) : t;
}

/**
 * Desglose fiscal RD: total cobrado incluye tarifa base + % ley + % ITBIS.
 * Por defecto factor 1.28 (10% ley + 18% ITBIS sobre la tarifa base).
 */
/**
 * Otras Tasas Exentas: monto >= 0 en DOP.
 * Independiente de los abonos aprobados en la web; se suman al total del comprobante.
 */
export function normalizeMontoFacturaExento(montoExento) {
  return decimalRD(Math.max(0, montoExento));
}

export function desgloseFiscalDesdeTotalIncluyeImpuestos(totalIncluye, opts = {}) {
  const propinaPct = Number(opts.propinaPct ?? process.env.FACTURA_PROPINA_LEGAL_PCT ?? 10);
  const itbisPct = Number(opts.itbisPct ?? process.env.FACTURA_ITBIS_PCT ?? 18);
  const propinaRate = Number.isFinite(propinaPct) && propinaPct > 0 ? propinaPct / 100 : 0;
  const itbisRate = Number.isFinite(itbisPct) && itbisPct > 0 ? itbisPct / 100 : 0;
  const factor = 1 + propinaRate + itbisRate;
  const total = decimalRD(totalIncluye);
  const tarifaBase = factor > 0 ? decimalRD(total / factor) : total;
  const ley10 = decimalRD(tarifaBase * propinaRate);
  const itbis = decimalRD(tarifaBase * itbisRate);
  const precioAPagar = decimalRD(tarifaBase + ley10 + itbis);
  return {
    tarifaBase,
    ley10,
    ley10Pct: propinaPct,
    itbis,
    itbisPct,
    precioAPagar,
    factor
  };
}

function resumenPagosDesdeRegistro(reg, tasaCambio = 1) {
  return resumenPagosDesdeLista(pagosArrayFromReg(reg), tasaCambio);
}

function totalPagosAprobados(pagos) {
  const arr = Array.isArray(pagos) ? pagos : [];
  return arr
    .filter((p) => pagoEstadoAprobado(p))
    .reduce((s, p) => s + montoPagoNum(p?.monto), 0);
}

function resolveTotalAprobadoDesdeRegistro(reg, pagosArr) {
  const fromPagos = totalPagosAprobados(pagosArr);
  if (fromPagos > 0) return fromPagos;
  const fromReg = montoPagoNum(unwrapScalar(reg?.totalAprobado) ?? reg?.totalAprobado);
  if (fromReg > 0) return fromReg;
  const det = reg?.detalles && typeof reg.detalles === 'object' ? reg.detalles : {};
  return montoPagoNum(unwrapScalar(det?.totalAprobado) ?? det?.totalAprobado);
}

function cantHuespedesDesdeDetalles(det) {
  let cant = montoPagoNum(unwrapScalar(det?.cantidadHuespedes) ?? unwrapScalar(det?.cantHuespedes));
  if (cant > 0) return Math.max(1, Math.floor(cant));
  if (Array.isArray(det?.huespedes) && det.huespedes.length) return det.huespedes.length;
  if (det && typeof det === 'object') {
    const idxs = Object.keys(det)
      .map((k) => {
        const m = String(k).match(/huesped_(\d+)_/);
        return m ? parseInt(m[1], 10) : -1;
      })
      .filter((n) => n >= 0);
    if (idxs.length) return Math.max(...idxs) + 1;
  }
  return 1;
}

function precioBaseHuespedesDesdeEvento(evento, cant) {
  const precioEvento = montoPagoNum(
    unwrapScalar(evento?.precio) ??
      unwrapScalar(evento?.precio_por_persona) ??
      unwrapScalar(evento?.precioPorPersona) ??
      unwrapScalar(evento?.precioBase)
  );
  const pp = evento?.preciosPredefinidos || evento?.precios_predefinidos || null;
  const precios = Array.isArray(pp?.precios)
    ? pp.precios
    : [];
  const usable = precios.filter((p) => montoPagoNum(p?.precio) > 0);
  const usaPP = usable.length > 0;
  if (!usaPP) return decimalRD(precioEvento * cant);
  const match = usable.find((p) => Number(p?.cantidad) === cant);
  if (match) return decimalRD(montoPagoNum(match.precio));
  const menores = usable
    .filter((p) => Number(p?.cantidad) < cant)
    .sort((a, b) => Number(b.cantidad) - Number(a.cantidad));
  if (menores.length > 0) {
    const base = menores[0];
    const diff = cant - Number(base.cantidad);
    const unit =
      montoPagoNum(usable.find((p) => Number(p?.cantidad) === 1)?.precio) || precioEvento;
    return decimalRD(montoPagoNum(base.precio) + diff * unit);
  }
  return decimalRD(precioEvento * cant);
}

function totalToursDesdeDetalles(det) {
  let totalTours = montoPagoNum(unwrapScalar(det?.totalTours) ?? det?.totalTours);
  if (totalTours > 0) return decimalRD(totalTours);
  if (Array.isArray(det?.tours)) {
    return decimalRD(
      det.tours.reduce(
        (s, t) => s + montoPagoNum(t?.precio) * Math.max(1, montoPagoNum(t?.cantidad) || 1),
        0
      )
    );
  }
  // tours_0_precio / tours_0_cantidad
  if (det && typeof det === 'object') {
    let sum = 0;
    Object.keys(det).forEach((k) => {
      const m = String(k).match(/^tour_(\d+)_precio$/);
      if (!m) return;
      const idx = m[1];
      const precio = montoPagoNum(unwrapScalar(det[k]));
      const cantidad = Math.max(1, montoPagoNum(unwrapScalar(det[`tour_${idx}_cantidad`])) || 1);
      if (precio > 0) sum += precio * cantidad;
    });
    return decimalRD(sum);
  }
  return 0;
}

/**
 * Precio total del evento/registro (misma moneda de abonos: DOP o USD del evento).
 * Preferencia: montoTotal/precioTotal guardado; si no, precio evento × pax + tours.
 */
export function resolvePrecioTotalEvento(reg, evento = null) {
  const det = reg?.detalles && typeof reg.detalles === 'object' ? reg.detalles : {};
  const stored = montoPagoNum(
    unwrapScalar(reg?.montoTotal) ??
      unwrapScalar(det?.precioTotal) ??
      unwrapScalar(det?.montoTotal) ??
      unwrapScalar(reg?.total)
  );
  if (stored > 0) return decimalRD(stored);
  if (!evento) return 0;
  const cant = cantHuespedesDesdeDetalles(det);
  return decimalRD(precioBaseHuespedesDesdeEvento(evento, cant) + totalToursDesdeDetalles(det));
}

export function pagoCubrePrecioEvento(totalAprobado, precioTotal) {
  const a = Math.round(Number(totalAprobado || 0) * 100);
  const t = Math.round(Number(precioTotal || 0) * 100);
  return t > 0 && a >= t;
}

/**
 * @throws {Error} con code PAGO_INCOMPLETO si aprobado < precio del evento
 */
export function assertPagoCompletoParaComprobante(reg, evento = null) {
  const pagosArr = pagosArrayFromReg(reg);
  const totalAprobado = resolveTotalAprobadoDesdeRegistro(reg, pagosArr);
  const precioTotal = resolvePrecioTotalEvento(reg, evento);
  if (!(precioTotal > 0)) {
    const err = new Error(
      'No hay un precio total del evento (DOP o USD) para validar el pago. Configúralo en el evento; el comprobante solo se genera cuando lo aprobado cubre ese total.'
    );
    err.code = 'SIN_PRECIO_EVENTO';
    err.status = 403;
    throw err;
  }
  if (!pagoCubrePrecioEvento(totalAprobado, precioTotal)) {
    const falta = decimalRD(Math.max(0, precioTotal - totalAprobado));
    const err = new Error(
      `El comprobante fiscal solo se emite cuando el total aprobado cubre el precio del evento. Aprobado: ${totalAprobado}; precio: ${precioTotal}; falta: ${falta}.`
    );
    err.code = 'PAGO_INCOMPLETO';
    err.status = 403;
    err.meta = { totalAprobado, precioTotal, falta };
    throw err;
  }
  return { totalAprobado, precioTotal, ok: true };
}

export async function buildCreditFiscalDraftFromRegistration(registroId) {
  const id = str(registroId);
  if (!id) throw new Error('registroId requerido');

  let reg = await RegistrationModel.getById(id);
  if (!reg) reg = await RegistrationModel.getByShortCode(id);
  if (!reg) throw new Error('Registro no encontrado');

  const det = reg.detalles && typeof reg.detalles === 'object' ? reg.detalles : {};
  const dp = reg.datosPersona && typeof reg.datosPersona === 'object' ? reg.datosPersona : {};

  const eventId = reg.eventId || reg.eventoId;
  let evento = null;
  if (eventId) {
    try {
      evento = await EventService.getById(eventId);
    } catch (_) {
      evento = null;
    }
  }

  const monedaEvento = resolveMonedaDocumento(evento, det);
  const monedaMontoExento = resolveMonedaMontoExento(det, monedaEvento);
  const monedaDocumento = 'DOP';
  const itbisPct = Number(process.env.FACTURA_ITBIS_PCT || 18);
  const needTasa = monedaEvento === 'USD' || monedaMontoExento === 'USD';
  let tasaCambio = 1;
  if (needTasa) {
    try {
      const t = await getTasaCambio();
      if (Number.isFinite(Number(t)) && Number(t) > 0) tasaCambio = Number(t);
    } catch {
      tasaCambio = 1;
    }
  }
  const tasaPagos = monedaEvento === 'USD' ? tasaCambio : 1;
  const pagosArr = pagosArrayFromReg(reg);
  const totalAprobadoCalc = resolveTotalAprobadoDesdeRegistro(reg, pagosArr);
  if (totalAprobadoCalc <= 0) {
    throw new Error(
      'No hay pagos aprobados para este registro. Cuando administración confirme al menos un abono, podrás generar tu comprobante desde Mis reservas.'
    );
  }
  assertPagoCompletoParaComprobante(reg, evento);
  const totalCobrado = decimalRD(decimalRD(totalAprobadoCalc) * tasaPagos);

  // Configuración ingresada por admin (antes de generar)
  const descuentoPct = Math.max(
    0,
    Math.min(100, Number(unwrapScalar(det.descuentoPct) ?? unwrapScalar(det.descuentoPorcentaje) ?? 0) || 0)
  );
  const exentoRaw = montoPagoNum(unwrapScalar(det.montoFacturaExento) ?? det.montoFacturaExento);
  const otrasExentas = normalizeMontoFacturaExento(
    monedaMontoExento === 'USD' ? decimalRD(exentoRaw * tasaCambio) : decimalRD(exentoRaw)
  );

  // Fórmula solicitada: luego del descuento, dividir entre 1.28, sacar 10% y 18% sobre la base.
  const propinaPct = Number(process.env.FACTURA_PROPINA_LEGAL_PCT || 10);
  const itbisRate = Number.isFinite(itbisPct) && itbisPct > 0 ? itbisPct / 100 : 0;
  const propinaRate = Number.isFinite(propinaPct) && propinaPct > 0 ? propinaPct / 100 : 0;
  const factor = 1 + propinaRate + itbisRate; // por defecto 1.28 (10% + 18%)

  // Desglose fiscal solo sobre abonos aprobados en la web (no se restan las exentas adicionales).
  const totalSujeto = decimalRD(totalCobrado);
  const descuentoMonto = decimalRD(totalSujeto * (descuentoPct / 100));
  const totalTrasDescuento = decimalRD(Math.max(0, totalSujeto - descuentoMonto));

  const desglose = desgloseFiscalDesdeTotalIncluyeImpuestos(totalTrasDescuento, {
    propinaPct,
    itbisPct
  });
  const baseGravada = desglose.tarifaBase;
  const subtotalGravado = baseGravada;
  const propinaLegal = desglose.ley10;
  const itbisTotal = desglose.itbis;
  const subtotalExento = decimalRD(otrasExentas);

  const baseAntes = factor > 0 ? decimalRD(totalSujeto / factor) : totalSujeto;
  const subTotal = decimalRD(baseAntes + decimalRD(baseAntes * propinaRate) + otrasExentas);

  const totalRD = decimalRD(totalTrasDescuento + otrasExentas);
  const tieneDescuento = descuentoPct > 0 && descuentoMonto > 0;

  const nombreEv = str(
    dynField(det?.eventoNombre) ||
      dynField(evento?.nombre) ||
      dynField(evento?.titulo) ||
      dynField(evento?.tituloEs) ||
      eventId
  );
  const pax = str(
    dynField(det?.nombreParticipante) ||
      dynField(det?.paxNombre) ||
      [dynField(dp?.nombre), dynField(dp?.apellido)].filter(Boolean).join(' ')
  );
  const descripcionPrincipal =
    str(det.descripcionServicioPrincipal) ||
    [`Inscripción / Servicio — ${nombreEv}`, det.fechaDesde && det.fechaHasta ? `Desde ${det.fechaDesde} hasta ${det.fechaHasta}` : '', pax ? `Pax ${pax}` : '']
      .filter(Boolean)
      .join(' ');

  const lineas = [];
  lineas.push({
    descripcion: descripcionPrincipal,
    codigo: det.codigoProductoServicio || null,
    cantidad: 1,
    unidad: str(det.unidadMedida || 'UND'),
    precioUnitario: baseGravada,
    descuentoLinea: null,
    itbisLinea: itbisTotal,
    importeLinea: decimalRD(baseGravada + itbisTotal),
    gravadoItbis: true
  });

  if (propinaLegal > 0) {
    lineas.push({
      descripcion: str(det.descripcionPropinaLegal) || `${propinaPct}% ley`,
      codigo: null,
      cantidad: 1,
      unidad: str(det.unidadMedida || 'UND'),
      precioUnitario: propinaLegal,
      descuentoLinea: null,
      itbisLinea: null,
      importeLinea: propinaLegal,
      gravadoItbis: false
    });
  }

  if (otrasExentas > 0) {
    lineas.push({
      descripcion: det.descripcionFacturaExenta || 'Otras Tasas Exentas',
      codigo: null,
      cantidad: 1,
      unidad: str(det.unidadMedida || 'UND'),
      precioUnitario: otrasExentas,
      descuentoLinea: null,
      itbisLinea: null,
      importeLinea: otrasExentas,
      gravadoItbis: false
    });
  }
  const ncfReal = str(det.ncfElectronico);
  const sinNcfFiscal = !ncfReal;
  const observacionLegal = str(
    process.env.FACTURA_NOTA_LEGAL ||
      (sinNcfFiscal
        ? 'Documento generado desde el sistema de eventos. No sustituye un comprobante fiscal electrónico (e-CF) hasta contar con NCF DGII y firma.'
        : '')
  );

  const fechaEmision = safeEmissionDate(reg);

  const rncCliente = str(det.rncComprobanteFiscal || det.rncCliente || det.rnc);
  const razonCliente = str(det.razonSocialCliente);
  const direccionCliente = str(det.direccionFiscalCliente).replace(/\s+/g, ' ').slice(0, 100);
  const emailCliente = str(det.emailFiscalCliente);
  const telefonoCliente = str(det.telefonoFiscalCliente);
  const refInterna =
    str(det.numeroFacturaInterna) ||
    (reg.codigoCorto ? `REG-${String(reg.codigoCorto)}` : `REG-${String(reg.id).slice(0, 8)}`);

  const tituloSinNcf = str(process.env.FACTURA_TITULO_SIN_NCF) || 'DOCUMENTO DE COBRO (EVENTOS)';
  const tipoTituloContrato = ncfReal
    ? TIPO_COMPROBANTE.FACTURA_CREDITO_FISCAL_ELECTRONICA
    : tituloSinNcf;

  const avisoOperativoHtml = sinNcfFiscal
    ? '<strong>Proforma / control interno.</strong> Sin NCF asignado; no tiene validez tributaria como e-CF hasta integrar y firmar ante DGII.'
    : '';

  const verificacionBase = {
    codigoSeguridad: det.codigoSeguridad || null,
    fechaFirmaDigital: det.fechaFirmaDigital || null,
    codigoQrDataUrl: str(det.codigoQrDataUrl) || null,
    codigoQrUrl: str(det.codigoQrUrl) || null,
    tieneCodigoQr: Boolean(det.codigoSeguridad || det.codigoQrDataUrl)
  };

  const emisor = loadEmisorFromEnv();

  let resumenPagos = resumenPagosDesdeLista(pagosArr, tasaPagos);
  if (!resumenPagos.length && totalCobrado > 0) {
    resumenPagos = [
      {
        fecha: '',
        metodo: 'Abonos aprobados',
        estado: 'aprobado',
        monto: totalCobrado
      }
    ];
  }

  const out = {
    _meta: {
      registroId: reg.id,
      codigoRegistroCorto: reg.codigoCorto || null,
      eventId: eventId || null,
      esProformaInterna: sinNcfFiscal,
      ...(avisoOperativoHtml ? { avisoOperativoHtml } : {})
    },
    emisor,
    documento: {
      tipo: TIPO_COMPROBANTE.FACTURA_CREDITO_FISCAL_ELECTRONICA,
      tipoTituloContrato,
      moneda: monedaDocumento,
      ncf: ncfReal || null,
      validaHastaLabel: det.fechaValidezNcf || str(process.env.FACTURA_VALIDA_HASTA_LABEL) || null
    },
    transaccion: {
      fechaEmisionISO: fechaEmision.toISOString(),
      fechaEmisionEtiqueta: fechaEmision.toLocaleDateString('es-DO', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      }),
      condicionPago: det.condicionPago || str(process.env.FACTURA_CONDICION_DEFECTO) || 'CONTADO',
      fechaVencimientoEtiqueta: det.fechaVencimiento || det.condicionVencimiento || null,
      numeroFacturaInterna: refInterna,
      vendedor: det.vendedorNombre || str(process.env.FACTURA_VENDEDOR_DEFECTO) || null,
      expediente: det.expedienteResolucion || str(process.env.FACTURA_EXPEDIENTE_RESOLUCION) || null
    },
    comprador: {
      rncCliente: rncCliente || null,
      nombreRazon: razonCliente || null,
      documentoIdentidad: null,
      direccion: direccionCliente || null,
      email: emailCliente || null,
      telefono: telefonoCliente || null
    },
    lineas,
    observacionLegal,
    resumenPagos,
    totales: {
      moneda: monedaDocumento,
      subTotal,
      descuento: descuentoMonto,
      descuentoPct,
      tieneDescuento,
      totalCobradoAprobado: totalCobrado,
      totalAntesDescuento: totalSujeto,
      totalTrasDescuento,
      subtotalExento,
      subtotalGravado,
      tarifaBase: baseGravada,
      ley10: propinaLegal,
      ley10Pct: propinaPct,
      itbis: itbisTotal,
      itbisPct,
      precioAPagarGravado: desglose.precioAPagar,
      precioAPagar: decimalRD(desglose.precioAPagar + otrasExentas),
      /** Monto total en la moneda del evento (nombre legacy totalRD) */
      totalRD
    }
  };

  if (
    verificacionBase.codigoSeguridad ||
    verificacionBase.fechaFirmaDigital ||
    verificacionBase.codigoQrDataUrl ||
    ncfReal
  ) {
    await enrichVerificacionQr(verificacionBase, {
      encf: ncfReal,
      rncEmisor: emisor.rnc,
      rncComprador: rncCliente,
      montoTotal: totalRD,
      fechaEmision: formatFechaDgii(fechaEmision),
      fechaFirma: det.fechaFirmaDigital,
      environment: det.dgiiEnvironment || resolveDgiiEnvironment()
    });
    out.verificacion = verificacionBase;
  }

  const emisorIncomplete = !(str(emisor.nombreComercial) && str(emisor.rnc));
  if (emisorIncomplete && out._meta) {
    out._meta.avisoEmisorCfg =
      'Complete FACTURA_EMISOR_NOMBRE y FACTURA_EMISOR_RNC (y opcional dirección/tel/email) en el servidor para imprimir datos legales del emisor.';
  }

  return out;
}
