import { ECF } from 'dgii-ecf';
import RegistrationModel from '../models/registration.model.js';
import ComprobanteEcfModel from '../models/comprobanteEcf.model.js';
import { requireFeStack, isDgiiFeCertConfigured, getDgiiFeRnc } from './dgiiFeCert.service.js';
import { consultarEstadoValidacionDgii } from './facturacionEmitir.service.js';
import {
  draftToIecfDocument,
  iecfDocumentToXml,
  setFechaHoraFirma
} from './facturacionIecf.mapper.js';
import { buildCreditFiscalDraftFromRegistration } from './creditFiscalDraft.service.js';
import { renderFacturaOperativaHtml } from './creditFiscalPrint.template.js';
import { enrichVerificacionQr } from './ecfQr.service.js';
import { resolveDgiiEnvironment } from '../domain/facturacionEmit.schema.js';
import { ENVIRONMENT } from 'dgii-ecf';

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
    clienteNombre: item.razonSocial || null,
    clienteEmail: null,
    rncComprador: item.rncComprador || null,
    razonSocial: item.razonSocial || null,
    encf: item.encf,
    tipoeCF: item.tipoeCF || null,
    trackId: item.trackId || null,
    estado: item.estado || null,
    codigoDgii: item.codigoDgii ?? null,
    codigoSeguridad: item.codigoSeguridad || null,
    fechaFirmaDigital: item.fechaFirmaDigital || null,
    emitidoAt: item.emitidoAt || null,
    environment: item.environment || null,
    dryRun: item.dryRun ?? null,
    fileName: item.fileName || null,
    mensajes: item.mensajes || null,
    origen: item.origen || (item.registroId ? 'eventos' : 'booking'),
    montoTotal: item.montoTotal ?? null,
    errorEnvio: Boolean(item.errorEnvio),
    tieneXml: Boolean(item.xmlFirmado) || Boolean(item.tieneXml),
    tieneImpresion: Boolean(item.tieneImpresion) || Boolean(item.snapshot) || Boolean(item.registroId)
  };
}

async function seedLedgerFromEventos(eventosRows) {
  const existing = await ComprobanteEcfModel.listAll({ includeHeavy: false });
  const have = new Set(existing.map((x) => String(x.encf || '').toUpperCase()));
  for (const row of eventosRows) {
    const encf = String(row.encf || '').trim().toUpperCase();
    if (!encf || have.has(encf)) continue;
    await ComprobanteEcfModel.put({
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
      mensajes: row.mensajes || null
    });
    have.add(encf);
  }
}

export async function listarComprobantesEmitidos() {
  const eventos = await RegistrationModel.listComprobantesFiscales();
  try {
    await seedLedgerFromEventos(eventos);
    const ledger = await ComprobanteEcfModel.listAll();
    const byEncf = new Map();
    for (const row of eventos) {
      const k = String(row.encf || '').toUpperCase();
      if (k) byEncf.set(k, { ...row, origen: 'eventos', tieneImpresion: true, tieneXml: true });
    }
    for (const item of ledger) {
      const k = String(item.encf || '').toUpperCase();
      if (!k) continue;
      const prev = byEncf.get(k) || {};
      byEncf.set(k, {
        ...prev,
        ...ledgerToListRow(item),
        registroId: item.registroId || prev.registroId || null,
        tieneImpresion: Boolean(item.tieneImpresion || item.registroId || prev.registroId),
        tieneXml: Boolean(item.tieneXml || item.registroId || prev.registroId)
      });
    }
    const items = [...byEncf.values()].sort((a, b) =>
      String(b.emitidoAt || '').localeCompare(String(a.emitidoAt || ''))
    );
    return {
      environment: resolveDgiiEnvironment(),
      consultaResultadoUrl: urlConsultaResultado(),
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
    emisor: s.emisor || {},
    comprador: s.comprador || {},
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
    return renderFacturaOperativaHtml(draft);
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
  return renderFacturaOperativaHtml(draft);
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

  if (ledger?.encf && consultaResultado) {
    await ComprobanteEcfModel.patch(ledger.encf, {
      estado: consultaResultado.estado || ledger.estado,
      codigoDgii: consultaResultado.codigo ?? ledger.codigoDgii,
      mensajes: consultaResultado.mensajes || ledger.mensajes || []
    });
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
      razonSocial: ledger.razonSocial || null
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
