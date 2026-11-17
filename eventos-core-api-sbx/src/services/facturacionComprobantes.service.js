import { ECF } from 'dgii-ecf';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDBClient } from '../config/db.config.js';
import RegistrationModel from '../models/registration.model.js';
import ComprobanteEcfModel, { pickMontoFiscal, montoFromXml } from '../models/comprobanteEcf.model.js';
import { requireFeStack, isDgiiFeCertConfigured, getDgiiFeRnc } from './dgiiFeCert.service.js';
import { consultarEstadoValidacionDgii } from './facturacionEmitir.service.js';
import {
  draftToIecfDocument,
  iecfDocumentToXml,
  setFechaHoraFirma,
  telefonoDgii,
  printModelFromDraft
} from './facturacionIecf.mapper.js';
import {
  buildCreditFiscalDraftFromRegistration,
  mergeEmisorFactura
} from './creditFiscalDraft.service.js';
import { renderFacturaOperativaHtml } from './creditFiscalPrint.template.js';
import { enrichVerificacionQr } from './ecfQr.service.js';
import { resolveDgiiEnvironment } from '../domain/facturacionEmit.schema.js';
import { peekNextEncf } from './ncfSequence.service.js';
import { ENVIRONMENT } from 'dgii-ecf';

const bookingDoc = DynamoDBDocumentClient.from(dynamoDBClient, {
  marshallOptions: { removeUndefinedValues: true }
});
const BOOKING_TABLE = String(process.env.BOOKING_ENTITIES_TABLE || 'booking-buenohotel-entities-table').trim();

function arreglarAcentos(s) {
  let t = String(s || '').trim();
  if (!t) return '';
  for (let i = 0; i < 2 && /Ã[\u0080-\u00BF]|Â[\u0080-\u00BF]/.test(t); i += 1) {
    try {
      const next = Buffer.from(t, 'latin1').toString('utf8');
      if (!next || next.includes('\uFFFD')) break;
      t = next;
    } catch {
      break;
    }
  }
  if (/hipermercados/i.test(t) && /compa/i.test(t)) {
    return 'Compa\u00f1\u00eda Dominicana de Hipermercados';
  }
  return t;
}

function limpiaRazonSocial(s) {
  return arreglarAcentos(s);
}

function rowDesdeBooking(item) {
  const f = item?.factura;
  const encf = String(f?.encf || f?.respuesta?.encf || '').trim().toUpperCase();
  if (!/^E\d{12,}$/i.test(encf)) return null;
  const c = f.comprador || {};
  const tot = f.totales || {};
  const resp = f.respuesta || {};
  const razon = limpiaRazonSocial(c.nombreRazon || c.razonSocial);
  const ley = Number(tot.ley10) || 0;
  const otras = Number(tot.subtotalExento) || 0;
  const monto = pickMontoFiscal(resp.montoTotal, tot.totalRD, tot.MontoTotal, tot);
  return {
    encf,
    origen: 'booking',
    registroId: null,
    referenciaInterna: f.transaccion?.numeroFacturaInterna || item.bookingReference || null,
    rncComprador: String(c.rncCliente || c.rnc || '').replace(/\D/g, '') || null,
    razonSocial: razon || null,
    clienteNombre: razon || null,
    clienteEmail: c.email || null,
    emailComprador: c.email || null,
    telefonoComprador: c.telefono || null,
    direccionComprador: c.direccion || null,
    trackId: resp.trackId || f.trackId || null,
    estado: resp.estado || null,
    codigoSeguridad: resp.codigoSeguridad || null,
    fechaFirmaDigital: resp.fechaFirmaDigital || null,
    fileName: resp.fileName || null,
    codigoQrUrl: resp.codigoQrUrl || null,
    emitidoAt: f.emitidaEl || f.transaccion?.fechaEmisionISO || null,
    environment: resp.environment || null,
    dryRun: resp.dryRun ?? null,
    montoTotal: monto,
    snapshot: {
      comprador: { ...c, nombreRazon: razon || c.nombreRazon },
      lineas: Array.isArray(f.lineas) ? f.lineas : [],
      totales: {
        ...tot,
        ley10: ley,
        subtotalExento: otras && Math.abs(otras - ley) > 0.009 ? otras : 0,
        totalRD: tot.totalRD || monto,
        MontoTotal: monto
      },
      transaccion: f.transaccion || {},
      documento: { ncf: encf, tipo: 'e-CF' }
    },
    tieneImpresion: true,
    tieneXml: false
  };
}

async function listFacturasBooking() {
  try {
    const out = [];
    let ExclusiveStartKey;
    do {
      const res = await bookingDoc.send(
        new ScanCommand({ TableName: BOOKING_TABLE, ExclusiveStartKey })
      );
      for (const item of res.Items || []) {
        const row = rowDesdeBooking(item);
        if (row) out.push(row);
      }
      ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return out;
  } catch (e) {
    console.error('listar facturas booking:', e?.message || e);
    return [];
  }
}

function mergeComprobante(prev, next) {
  const p = prev || {};
  const n = next || {};
  return {
    ...p,
    ...n,
    razonSocial: arreglarAcentos(n.razonSocial || p.razonSocial) || null,
    clienteNombre: arreglarAcentos(n.clienteNombre || n.razonSocial || p.clienteNombre || p.razonSocial) || null,
    rncComprador: n.rncComprador || p.rncComprador || null,
    emailComprador: n.emailComprador || n.clienteEmail || p.emailComprador || p.clienteEmail || null,
    telefonoComprador: n.telefonoComprador || p.telefonoComprador || null,
    direccionComprador: n.direccionComprador || p.direccionComprador || null,
    montoTotal: pickMontoFiscal(n.montoTotal, p.montoTotal),
    trackId: n.trackId || p.trackId || null,
    codigoSeguridad: n.codigoSeguridad || p.codigoSeguridad || null,
    fechaFirmaDigital: n.fechaFirmaDigital || p.fechaFirmaDigital || null,
    registroId: n.registroId || p.registroId || null,
    fileName: n.fileName || p.fileName || null,
    referenciaInterna: n.referenciaInterna || n.codigoCorto || p.referenciaInterna || p.codigoCorto || null,
    tieneImpresion: Boolean(
      n.tieneImpresion || p.tieneImpresion || n.snapshot || n.registroId || p.registroId
    ),
    tieneXml: Boolean(n.tieneXml || p.tieneXml || n.xmlFirmado || p.xmlFirmado || n.registroId || p.registroId)
  };
}

function envToLibrary(envName) {
  if (envName === 'PROD') return ENVIRONMENT.PROD;
  if (envName === 'DEV') return ENVIRONMENT.DEV;
  return ENVIRONMENT.CERT;
}

export function urlConsultaResultado(envName) {
  const env = String(envName || resolveDgiiEnvironment() || 'CERT').toUpperCase();
  if (env === 'PROD') return 'https://ecf.dgii.gov.do/ecf/consultaresultado';
  if (env === 'DEV') return 'https://ecf.dgii.gov.do/testecf/consultaresultado';
  return 'https://ecf.dgii.gov.do/certecf/consultaresultado';
}

function esAprobado(row) {
  const codigo = Number(row?.codigoDgii);
  if (codigo === 1 || codigo === 4) return true;
  const est = String(row?.estado || '').toLowerCase();
  return est.includes('aceptado');
}

function decorate(row) {
  const env = row.environment || resolveDgiiEnvironment();
  return {
    ...row,
    aprobadoDgii: esAprobado(row),
    consultaResultadoUrl: urlConsultaResultado(env)
  };
}

function ledgerToListRow(item) {
  return {
    registroId: item.registroId || null,
    codigoCorto: item.referenciaInterna || null,
    eventoId: null,
    eventoNombre: item.origen === 'booking' ? 'Booking' : item.origen === 'eventos' ? 'Eventos' : item.origen || null,
    clienteNombre: arreglarAcentos(item.razonSocial) || null,
    clienteEmail: item.emailComprador || null,
    telefonoComprador: item.telefonoComprador || null,
    rncComprador: item.rncComprador || null,
    razonSocial: arreglarAcentos(item.razonSocial) || null,
    encf: item.encf,
    tipoeCF: item.tipoeCF || null,
    trackId: item.trackId || null,
    estado: item.estado || null,
    codigoDgii: item.codigoDgii != null && item.codigoDgii !== '' ? Number(item.codigoDgii) : null,
    codigoSeguridad: item.codigoSeguridad || null,
    fechaFirmaDigital: item.fechaFirmaDigital || null,
    emitidoAt: item.emitidoAt || null,
    environment: item.environment || null,
    dryRun: item.dryRun ?? null,
    fileName: item.fileName || null,
    mensajes: item.mensajes || null,
    origen: item.origen || (item.registroId ? 'eventos' : 'booking'),
    montoTotal: pickMontoFiscal(item.montoTotal, montoFromXml(item.xmlFirmado)),
    direccionComprador: item.direccionComprador || null,
    errorEnvio: Boolean(item.errorEnvio),
    tieneXml: Boolean(item.xmlFirmado) || Boolean(item.tieneXml),
    tieneImpresion: Boolean(item.tieneImpresion) || Boolean(item.snapshot) || Boolean(item.registroId)
  };
}

async function seedLedgerFromEventos(eventosRows) {
  const existing = await ComprobanteEcfModel.listAll({ includeHeavy: false });
  const byEncf = new Map(existing.map((x) => [String(x.encf || '').toUpperCase(), x]));
  for (const row of eventosRows) {
    const encf = String(row.encf || '').trim().toUpperCase();
    if (!encf) continue;
    const cur = byEncf.get(encf);
    if (cur?.razonSocial && pickMontoFiscal(cur.montoTotal)) continue;
    await ComprobanteEcfModel.upsert({
      encf,
      tipoeCF: row.tipoeCF || 31,
      origen: 'eventos',
      registroId: row.registroId || null,
      referenciaInterna: row.codigoCorto || null,
      rncComprador: row.rncComprador || null,
      razonSocial: row.razonSocial || row.clienteNombre || null,
      trackId: row.trackId || null,
      estado: row.estado || null,
      codigoDgii: row.codigoDgii ?? null,
      codigoSeguridad: row.codigoSeguridad || null,
      fechaFirmaDigital: row.fechaFirmaDigital || null,
      fileName: row.fileName || null,
      environment: row.environment || null,
      dryRun: row.dryRun ?? null,
      emitidoAt: row.emitidoAt || null,
      montoTotal: row.montoTotal ?? null,
      mensajes: row.mensajes || null
    });
    byEncf.set(encf, { ...(cur || {}), encf });
  }
}

async function seedLedgerFromBooking(bookingRows) {
  const existing = await ComprobanteEcfModel.listAll({ includeHeavy: false });
  const byEncf = new Map(existing.map((x) => [String(x.encf || '').toUpperCase(), x]));
  for (const row of bookingRows) {
    const encf = String(row.encf || '').trim().toUpperCase();
    if (!encf) continue;
    const cur = byEncf.get(encf);
    if (cur?.razonSocial && pickMontoFiscal(cur.montoTotal) && cur.tieneImpresion) continue;
    try {
      await ComprobanteEcfModel.upsert({
        encf,
        tipoeCF: row.tipoeCF || 31,
        origen: cur?.origen || 'booking',
        referenciaInterna: row.referenciaInterna || null,
        rncComprador: row.rncComprador || null,
        razonSocial: row.razonSocial || null,
        emailComprador: row.emailComprador || null,
        telefonoComprador: row.telefonoComprador || null,
        direccionComprador: row.direccionComprador || null,
        trackId: row.trackId || null,
        estado: cur?.estado || row.estado || null,
        codigoSeguridad: row.codigoSeguridad || null,
        fechaFirmaDigital: row.fechaFirmaDigital || null,
        fileName: row.fileName || null,
        codigoQrUrl: row.codigoQrUrl || null,
        environment: row.environment || null,
        emitidoAt: row.emitidoAt || cur?.emitidoAt || null,
        montoTotal: row.montoTotal ?? null,
        snapshot: row.snapshot || null,
        tieneImpresion: true
      });
    } catch (e) {
      console.error('seed ledger booking', encf, e?.message || e);
    }
  }
}

export async function listarComprobantesEmitidos() {
  let eventos = [];
  let booking = [];
  try {
    eventos = await RegistrationModel.listComprobantesFiscales();
  } catch (e) {
    console.error('listar eventos fiscales:', e?.message || e);
  }
  try {
    booking = await listFacturasBooking();
  } catch (e) {
    console.error('listar booking fiscales:', e?.message || e);
  }
  try {
    try {
      await seedLedgerFromEventos(eventos);
    } catch (e) {
      console.error('seed ledger eventos:', e?.message || e);
    }
    try {
      await seedLedgerFromBooking(booking);
    } catch (e) {
      console.error('seed ledger booking:', e?.message || e);
    }
    const ledger = await ComprobanteEcfModel.listAll();
    const byEncf = new Map();
    for (const row of booking) {
      const k = String(row.encf || '').toUpperCase();
      if (k) byEncf.set(k, mergeComprobante(byEncf.get(k), row));
    }
    for (const row of eventos) {
      const k = String(row.encf || '').toUpperCase();
      if (k) {
        byEncf.set(
          k,
          mergeComprobante(byEncf.get(k), { ...row, origen: 'eventos', tieneImpresion: true, tieneXml: true })
        );
      }
    }
    for (const item of ledger) {
      const k = String(item.encf || '').toUpperCase();
      if (!k) continue;
      byEncf.set(k, mergeComprobante(byEncf.get(k), ledgerToListRow(item)));
    }
    const items = [...byEncf.values()].sort((a, b) =>
      String(b.emitidoAt || '').localeCompare(String(a.emitidoAt || ''))
    );
    for (const row of items) {
      if (!row.registroId) continue;
      try {
        const draft = await buildCreditFiscalDraftFromRegistration(row.registroId);
        const m = pickMontoFiscal(draft?.totales);
        if (m) row.montoTotal = m;
      } catch (_) {
        /* keep ledger/eventos amount */
      }
    }
    let secuencia = null;
    try {
      secuencia = await peekNextEncf(31);
    } catch (_) {}
    return {
      environment: resolveDgiiEnvironment(),
      consultaResultadoUrl: urlConsultaResultado(),
      secuencia,
      total: items.length,
      items: items.map(decorate)
    };
  } catch (err) {
    console.error('listar comprobantes ledger:', err?.message || err);
    return {
      environment: resolveDgiiEnvironment(),
      consultaResultadoUrl: urlConsultaResultado(),
      total: eventos.length,
      items: eventos.map((row) => decorate({ ...row, origen: 'eventos', tieneImpresion: true, tieneXml: true }))
    };
  }
}

export async function refrescarEstadoComprobante(registroId) {
  const id = String(registroId || '').trim();
  let ledger = /^E\d{12,}$/i.test(id)
    ? await ComprobanteEcfModel.getByEncf(id)
    : await ComprobanteEcfModel.getByRegistroId(id);
  let item = null;
  if (!/^E\d{12,}$/i.test(id)) {
    item = await RegistrationModel.getById(id);
  }
  if (!item && ledger?.registroId) {
    item = await RegistrationModel.getById(ledger.registroId);
  }
  const det = item?.detalles && typeof item.detalles === 'object' ? item.detalles : {};
  const trackId = String(ledger?.trackId || det.dgiiTrackId || '').trim();
  if (!trackId) {
    const err = new Error('Este comprobante no tiene TrackId de DGII');
    err.status = 400;
    throw err;
  }
  const dgii = await consultarEstadoValidacionDgii(trackId);
  if (item?.id) {
    await RegistrationModel.upsertDetallesAndTouch(
      item.id,
      {
        dgiiEstado: dgii.estado,
        dgiiCodigo: dgii.codigo,
        dgiiMensajes: dgii.mensajes || [],
        dgiiConsultadoAt: new Date().toISOString()
      },
      new Date().toISOString()
    );
  }
  if (ledger?.encf) {
    await ComprobanteEcfModel.patch(ledger.encf, {
      estado: dgii.estado,
      codigoDgii: dgii.codigo,
      mensajes: dgii.mensajes || []
    });
  }
  const list = await listarComprobantesEmitidos();
  const row =
    list.items.find((x) => x.registroId === (item?.id || id) || x.encf === ledger?.encf) || {
      registroId: item?.id || null,
      trackId,
      encf: ledger?.encf || det.ncfElectronico,
      estado: dgii.estado,
      codigoDgii: dgii.codigo
    };
  return { ...decorate(row), dgii: dgii.dgii };
}

export async function refrescarEstadosComprobantes({ max = 40 } = {}) {
  const listed = await listarComprobantesEmitidos();
  const pending = listed.items
    .filter((x) => x.trackId && !esAprobado(x))
    .slice(0, Math.max(1, Number(max) || 40));
  const results = [];
  for (const row of pending) {
    try {
      results.push(await refrescarEstadoComprobante(row.registroId || row.encf));
    } catch (err) {
      results.push({
        registroId: row.registroId,
        encf: row.encf,
        trackId: row.trackId,
        error: err?.message || String(err)
      });
    }
  }
  const fresh = await listarComprobantesEmitidos();
  return { refreshed: results.length, ...fresh, detalleConsulta: results };
}

async function resolveLedger(id) {
  const raw = String(id || '').trim();
  if (!raw) return null;
  if (/^E\d{12,}$/i.test(raw)) return ComprobanteEcfModel.getByEncf(raw);
  const byReg = await ComprobanteEcfModel.getByRegistroId(raw);
  if (byReg) return byReg;
  return ComprobanteEcfModel.getByEncf(raw);
}

function ledgerToPrintDraft(item) {
  const s = item.snapshot && typeof item.snapshot === 'object' ? item.snapshot : {};
  return {
    emisor: mergeEmisorFactura(s.emisor),
    comprador: {
      ...(s.comprador || {}),
      nombreRazon: arreglarAcentos(
        (s.comprador || {}).nombreRazon || item.razonSocial || (s.comprador || {}).razonSocial
      ),
      telefono: telefonoDgii((s.comprador || {}).telefono || (s.comprador || {}).telefonoFiscal)
        || String((s.comprador || {}).telefono || '').replace(/\D/g, '').slice(-10)
    },
    documento: { ...(s.documento || {}), ncf: item.encf, tipo: s.documento?.tipo || 'e-CF' },
    transaccion: s.transaccion || {},
    lineas: Array.isArray(s.lineas) ? s.lineas : [],
    totales: s.totales || { totalRD: item.montoTotal, MontoTotal: item.montoTotal },
    verificacion: {
      codigoSeguridad: item.codigoSeguridad || null,
      fechaFirmaDigital: item.fechaFirmaDigital || null,
      codigoQrUrl: item.codigoQrUrl || null
    }
  };
}

export async function xmlFirmadoComprobante(registroId) {
  const id = String(registroId || '').trim();
  const ledger = await resolveLedger(id);
  if (ledger?.xmlFirmado) {
    return {
      xml: ledger.xmlFirmado,
      fileName: ledger.fileName || `${getDgiiFeRnc()}${ledger.encf}.xml`,
      encf: ledger.encf
    };
  }
  const regId = ledger?.registroId || id;
  const item = await RegistrationModel.getById(regId);
  if (!item) {
    const err = new Error(
      'No hay XML guardado de este comprobante. Las emisiones nuevas (Booking y Eventos) sí quedarán para descargar.'
    );
    err.status = 404;
    throw err;
  }
  const det = item.detalles && typeof item.detalles === 'object' ? item.detalles : {};
  const encf = String(det.ncfElectronico || ledger?.encf || '').trim();
  if (!encf) {
    const err = new Error('Este registro no tiene eNCF');
    err.status = 400;
    throw err;
  }
  if (!isDgiiFeCertConfigured()) {
    const err = new Error('Certificado DGII no configurado');
    err.status = 503;
    throw err;
  }
  const draft = await buildCreditFiscalDraftFromRegistration(item.id);
  const tipoeCF = Number(det.tipoeCF || ledger?.tipoeCF) || 31;
  const { document } = draftToIecfDocument(draft, { encf, tipoeCF });
  let xml = iecfDocumentToXml(document);
  xml = setFechaHoraFirma(xml);
  const stack = requireFeStack();
  const signedXml = stack.signature.signXml(xml, 'ECF');
  const fileName = String(det.dgiiFileName || ledger?.fileName || `${getDgiiFeRnc()}${encf}.xml`);
  return { xml: signedXml, fileName, encf };
}

export async function htmlComprobante(id) {
  const raw = String(id || '').trim();
  const ledger = await resolveLedger(raw);
  if (ledger?.snapshot && (ledger.snapshot.lineas?.length || ledger.snapshot.comprador)) {
    const draft = ledgerToPrintDraft(ledger);
    draft.verificacion = await enrichVerificacionQr(draft.verificacion, {
      encf: ledger.encf,
      rncComprador: ledger.rncComprador,
      montoTotal: ledger.montoTotal,
      fechaFirma: ledger.fechaFirmaDigital,
      codigoSeguridad: ledger.codigoSeguridad,
      environment: ledger.environment
    });
    return renderFacturaOperativaHtml(printModelFromDraft(draft, { encf: ledger.encf }));
  }
  const regId = ledger?.registroId || raw;
  const item = await RegistrationModel.getById(regId);
  if (!item) {
    const err = new Error(
      'No hay datos de impresión de este comprobante. Las emisiones hechas antes de guardar el libro no se pueden reimprimir; las nuevas sí.'
    );
    err.status = 404;
    throw err;
  }
  const draft = await buildCreditFiscalDraftFromRegistration(item.id);
  const encf = String(item?.detalles?.ncfElectronico || ledger?.encf || draft?.documento?.ncf || '').trim();
  return renderFacturaOperativaHtml(printModelFromDraft(draft, { encf }));
}

async function clienteDgiiAutenticado() {
  if (!isDgiiFeCertConfigured()) {
    const err = new Error('Certificado DGII no configurado');
    err.status = 503;
    throw err;
  }
  const envName = resolveDgiiEnvironment();
  const stack = requireFeStack();
  const ecf = new ECF(stack.keys, envToLibrary(envName));
  await ecf.authenticate();
  return { ecf, envName, rncEmisor: getDgiiFeRnc() };
}

export async function tracksPorEncf(encf) {
  const ncf = String(encf || '').trim();
  if (!ncf) {
    const err = new Error('eNCF requerido');
    err.status = 400;
    throw err;
  }
  const { ecf, rncEmisor } = await clienteDgiiAutenticado();
  const tracks = await ecf.trackStatuses(rncEmisor, ncf);
  return { encf: ncf, rncEmisor, tracks: tracks || [] };
}

function safeCall(label, fn) {
  return fn()
    .then((data) => ({ ok: true, label, data }))
    .catch((err) => ({ ok: false, label, error: err?.message || String(err) }));
}

export function tracksArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.tracks)) return raw.tracks;
  return [];
}

export async function previewCompradorDesdeRegistro(registroId) {
  const id = String(registroId || '').trim();
  const item = await RegistrationModel.getById(id);
  if (!item) return null;
  const det = item.detalles && typeof item.detalles === 'object' ? item.detalles : {};
  const encf = String(det.ncfElectronico || 'E310000000000').trim();
  const tipoeCF = Number(det.tipoeCF) || 31;
  const draft = await buildCreditFiscalDraftFromRegistration(id);
  const { document } = draftToIecfDocument(draft, { encf, tipoeCF });
  const xml = iecfDocumentToXml(document);
  const m = xml.match(/<Comprador>[\s\S]*?<\/Comprador>/);
  const compradorXml = m ? m[0] : '';
  return {
    compradorXml,
    ordenRncLuegoRazon: /<Comprador>\s*<RNCComprador>/.test(compradorXml),
    rnc: (compradorXml.match(/<RNCComprador>([^<]*)<\/RNCComprador>/) || [])[1] || null,
    razonSocial: (compradorXml.match(/<RazonSocialComprador>([^<]*)<\/RazonSocialComprador>/) || [])[1] || null
  };
}

/**
 * Consulta en vivo las APIs DGII (consultaresultado, tracks por eNCF, estado público).
 */
export async function consultarComprobanteDgii({ registroId, trackId, encf } = {}) {
  let id = String(registroId || '').trim();
  let track = String(trackId || '').trim();
  let ncf = String(encf || '').trim().toUpperCase();
  let item = null;
  let det = {};

  if (id && /^E\d{12,}$/i.test(id) && !ncf) {
    ncf = id.toUpperCase();
    id = '';
  }

  if (id) {
    item = await RegistrationModel.getById(id);
    if (item) {
      det = item.detalles && typeof item.detalles === 'object' ? item.detalles : {};
      if (!track) track = String(det.dgiiTrackId || '').trim();
      if (!ncf) ncf = String(det.ncfElectronico || '').trim();
    } else {
      id = '';
    }
  }
  if (!item && (track || ncf)) {
    const list = await RegistrationModel.listComprobantesFiscales();
    const row = list.find(
      (x) => (track && x.trackId === track) || (ncf && String(x.encf || '').toUpperCase() === ncf)
    );
    if (row) {
      id = row.registroId;
      item = await RegistrationModel.getById(id);
      det = item?.detalles && typeof item.detalles === 'object' ? item.detalles : {};
      if (!track) track = String(row.trackId || '').trim();
      if (!ncf) ncf = String(row.encf || '').trim();
    }
  }

  let ledger = null;
  try {
    if (ncf) ledger = await ComprobanteEcfModel.getByEncf(ncf);
    if (!ledger && id) ledger = await ComprobanteEcfModel.getByRegistroId(id);
  } catch (_) {
    ledger = null;
  }
  if (ledger) {
    if (!ncf) ncf = String(ledger.encf || '').trim();
    if (!track) track = String(ledger.trackId || '').trim();
    if (!id && ledger.registroId) {
      id = ledger.registroId;
      item = item || (await RegistrationModel.getById(id));
      det = item?.detalles && typeof item.detalles === 'object' ? item.detalles : det;
    }
  }

  if (!track && !ncf) {
    const err = new Error('Indica TrackId, eNCF o un registro emitido');
    err.status = 400;
    throw err;
  }

  const rncComprador = String(
    det.rncComprobanteFiscal || det.rncCliente || ledger?.rncComprador || ''
  ).replace(/\D/g, '');
  const codigoSeguridad = String(det.codigoSeguridad || ledger?.codigoSeguridad || '').trim();
  const { ecf, envName, rncEmisor } = await clienteDgiiAutenticado();

  const jobs = [];
  if (ncf) jobs.push(safeCall('tracks', () => ecf.trackStatuses(rncEmisor, ncf)));
  if (ncf && rncComprador && codigoSeguridad) {
    jobs.push(safeCall('estadoPublico', () => ecf.inquiryStatus(rncEmisor, ncf, rncComprador, codigoSeguridad)));
  }
  const settled = await Promise.all(jobs);
  const by = Object.fromEntries(settled.map((x) => [x.label, x]));

  if (!track) {
    const t0 = tracksArray(by.tracks?.ok ? by.tracks.data : null)[0];
    track = String(t0?.trackId || t0?.trackid || '').trim();
  }
  if (track) {
    by.consultaResultado = await safeCall('consultaResultado', () => ecf.statusTrackId(track));
  }

  const consultaResultado = by.consultaResultado?.ok ? by.consultaResultado.data : null;
  const tracksData = by.tracks?.ok ? by.tracks.data : null;
  const t0 = tracksArray(tracksData)[0] || {};
  const pub = by.estadoPublico?.ok && by.estadoPublico.data && typeof by.estadoPublico.data === 'object'
    ? by.estadoPublico.data
    : {};
  if (id && consultaResultado) {
    await RegistrationModel.upsertDetallesAndTouch(
      id,
      {
        dgiiEstado: consultaResultado.estado || det.dgiiEstado,
        dgiiCodigo: consultaResultado.codigo ?? det.dgiiCodigo,
        dgiiMensajes: consultaResultado.mensajes || [],
        dgiiConsultadoAt: new Date().toISOString()
      },
      new Date().toISOString()
    );
  }

  const encfLibro = String(ncf || consultaResultado?.encf || t0.encf || ledger?.encf || '').trim().toUpperCase();
  if (encfLibro) {
    try {
      const codigoRaw = consultaResultado?.codigo ?? ledger?.codigoDgii;
      const codigoNum = codigoRaw == null || codigoRaw === '' ? undefined : Number(codigoRaw);
      ledger = await ComprobanteEcfModel.upsert({
        encf: encfLibro,
        tipoeCF: Number(String(encfLibro).replace(/^E/, '').slice(0, 2)) || ledger?.tipoeCF || 31,
        origen: ledger?.origen && ledger.origen !== 'consulta' ? ledger.origen : (id ? 'eventos' : ledger?.origen || 'consulta'),
        registroId: id || ledger?.registroId || undefined,
        trackId: track || consultaResultado?.trackId || t0.trackId || t0.trackid || ledger?.trackId || undefined,
        estado: consultaResultado?.estado || t0.estado || ledger?.estado || undefined,
        codigoDgii: Number.isFinite(codigoNum) ? codigoNum : undefined,
        mensajes: Array.isArray(consultaResultado?.mensajes)
          ? consultaResultado.mensajes
          : ledger?.mensajes || [],
        rncComprador: ledger?.rncComprador || rncComprador || pub.rncComprador || pub.RNCComprador || undefined,
        razonSocial: ledger?.razonSocial || pub.razonSocial || pub.RazonSocialComprador || undefined,
        montoTotal: pickMontoFiscal(
          ledger?.montoTotal,
          pub.montoTotal,
          pub.MontoTotal,
          t0.montoTotal
        ),
        environment: ledger?.environment || envName,
        fechaRecepcion: consultaResultado?.fechaRecepcion || t0.fechaRecepcion || ledger?.fechaRecepcion || undefined,
        emitidoAt: ledger?.emitidoAt || undefined,
        consultadoAt: new Date().toISOString()
      });
    } catch (e) {
      console.error('consulta no pudo guardar libro:', e?.message || e);
    }
  }

  let previewComprador = null;
  if (id) {
    try {
      previewComprador = await previewCompradorDesdeRegistro(id);
    } catch (_) {
      previewComprador = null;
    }
  }
  if (!previewComprador && ledger) {
    previewComprador = {
      rnc: ledger.rncComprador || null,
      razonSocial: ledger.razonSocial || null,
      email: ledger.emailComprador || null,
      telefono: ledger.telefonoComprador || null,
      direccion: ledger.direccionComprador || ledger.snapshot?.comprador?.direccion || null
    };
  }

  const list = id ? await RegistrationModel.listComprobantesFiscales() : [];
  const local =
    list.find((x) => x.registroId === id) ||
    (ledger ? ledgerToListRow(ledger) : null);

  return {
    environment: envName,
    consultaResultadoUrl: urlConsultaResultado(envName),
    rncEmisor,
    registroId: id || null,
    trackId: track || consultaResultado?.trackId || ledger?.trackId || null,
    encf: ncf || consultaResultado?.encf || ledger?.encf || null,
    local: local ? decorate(local) : null,
    apis: {
      consultaResultado: by.consultaResultado || { ok: false, skipped: !track },
      tracks: by.tracks || { ok: false, skipped: !ncf },
      estadoPublico: by.estadoPublico || {
        ok: false,
        skipped: !(ncf && rncComprador && codigoSeguridad)
      }
    },
    previewComprador
  };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export async function duplicarComprobante(id) {
  const ledger = await resolveLedger(id);
  if (!ledger) {
    const err = new Error('No se encontró ese comprobante.');
    err.status = 404;
    throw err;
  }
  const s = ledger.snapshot && typeof ledger.snapshot === 'object' ? ledger.snapshot : {};
  const tot = s.totales && typeof s.totales === 'object' ? s.totales : {};
  const cobrado = round2(pickMontoFiscal(tot.totalRD, tot.MontoTotal, ledger.montoTotal) || 0);
  const ley = round2(Number(tot.ley10) || 0);
  const rawLineas = Array.isArray(s.lineas) ? s.lineas : [];
  const gravadas = rawLineas.filter((ln) => {
    if (ln?.gravadoItbis === false) return false;
    return !/^10\s*%\s*ley/i.test(String(ln?.descripcion || '').trim());
  });
  const sumImp = gravadas.reduce((acc, ln) => acc + (Number(ln?.importeLinea) || 0), 0);
  let lineas = gravadas.map((ln) => {
    const cantidad = Number(ln?.cantidad) > 0 ? Number(ln.cantidad) : 1;
    const imp = Number(ln?.importeLinea) || 0;
    const shareLey = sumImp > 0 ? ley * (imp / sumImp) : 0;
    const inclusive = round2(imp + shareLey);
    return {
      descripcion: String(ln?.descripcion || '').trim(),
      cantidad,
      precioUnitario: round2(inclusive / cantidad),
      descuento: 0
    };
  });
  if (!lineas.length && cobrado > 0) {
    lineas = [
      {
        descripcion: 'Servicio',
        cantidad: 1,
        precioUnitario: cobrado,
        descuento: 0
      }
    ];
  }
  const c = s.comprador || {};
  return {
    form: {
      origen: ledger.origen || 'manual',
      origenOtro: '',
      nombreRazon: String(c.nombreRazon || ledger.razonSocial || '').trim(),
      rnc: String(c.rncCliente || c.rnc || ledger.rncComprador || '').replace(/\D/g, ''),
      email: String(c.email || ledger.emailComprador || '').trim(),
      telefono: String(c.telefono || ledger.telefonoComprador || '').replace(/\D/g, '').slice(0, 10),
      direccion: String(c.direccion || ledger.direccionComprador || '').trim(),
      itbis: 0,
      totalRD: cobrado,
      moneda: 'DOP',
      descGlobal: 0
    },
    lineas,
    encfOrigen: ledger.encf || null
  };
}

