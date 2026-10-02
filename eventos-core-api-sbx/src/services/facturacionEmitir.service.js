import { ECF, ENVIRONMENT, getCodeSixDigitfromSignature } from 'dgii-ecf';
import RegistrationModel from '../models/registration.model.js';
import ComprobanteEcfModel from '../models/comprobanteEcf.model.js';
import { buildCreditFiscalDraftFromRegistration } from './creditFiscalDraft.service.js';
import { requireFeStack, isDgiiFeCertConfigured, getDgiiFeRnc } from './dgiiFeCert.service.js';
import { allocateNextEncf } from './ncfSequence.service.js';
import {
  draftToIecfDocument,
  iecfDocumentToXml,
  setFechaHoraFirma,
  fechaHoraFirmaNow,
  formatFechaDgii
} from './facturacionIecf.mapper.js';
import {
  isDryRunDefault,
  normalizeTipoeCF,
  resolveDgiiEnvironment,
  validateDirectEmitPayload
} from '../domain/facturacionEmit.schema.js';
import { buildCodigoQrDataUrl } from './ecfQr.service.js';
import { renderFacturaOperativaHtml } from './creditFiscalPrint.template.js';

function envToLibrary(envName) {
  if (envName === 'PROD') return ENVIRONMENT.PROD;
  if (envName === 'DEV') return ENVIRONMENT.DEV;
  return ENVIRONMENT.CERT;
}

function resolveDryRun(body) {
  if (body && typeof body.dryRun === 'boolean') return body.dryRun;
  return isDryRunDefault();
}

/**
 * Convierte payload directo al shape del draft interno.
 */
function directPayloadToDraft(body) {
  return {
    tipoeCF: body.tipoeCF,
    emisor: body.emisor || {},
    comprador: body.comprador || {},
    documento: body.documento || {},
    transaccion: body.transaccion || {
      fechaEmisionISO: new Date().toISOString(),
      numeroFacturaInterna: body.numeroFacturaInterna || undefined
    },
    lineas: body.lineas || [],
    totales: body.totales || {}
  };
}

async function loadDraft(body) {
  const registroId = String(body?.registroId || '').trim();
  if (registroId) {
    const draft = await buildCreditFiscalDraftFromRegistration(registroId);
    return { draft, registroId: draft._meta?.registroId || registroId, fromRegistro: true };
  }
  const v = validateDirectEmitPayload(body);
  if (!v.ok) {
    const err = new Error(v.error);
    err.status = 400;
    throw err;
  }
  return { draft: directPayloadToDraft(body), registroId: null, fromRegistro: false };
}

function compactDraft(draft) {
  return {
    tipoeCF: draft?.tipoeCF,
    emisor: draft?.emisor || {},
    comprador: draft?.comprador || {},
    documento: draft?.documento || {},
    transaccion: draft?.transaccion || {},
    lineas: Array.isArray(draft?.lineas) ? draft.lineas : [],
    totales: draft?.totales || {}
  };
}

export function resolveOrigenEmision(body, registroId) {
  if (registroId) return 'eventos';
  const raw = String(body?.origen || body?.fuente || body?.source || body?.sistema || '')
    .trim()
    .toLowerCase();
  const allowed = ['eventos', 'booking', 'ecommerce', 'manual', 'seguro', 'tours'];
  if (allowed.includes(raw)) return raw;
  return 'booking';
}

function ledgerErrorText(err) {
  return String(err?.mensaje || err?.error || err?.message || err || 'Error de envío');
}

async function guardarEnLibro(record) {
  try {
    await ComprobanteEcfModel.put(record);
  } catch (e) {
    console.error('libro comprobantes_ecf:', e?.message || e);
  }
}

/**
 * Emite (o simula) un e-CF.
 */
export async function emitirFacturaElectronica(body = {}) {
  if (!isDgiiFeCertConfigured()) {
    const err = new Error('Certificado DGII no configurado en Lambda');
    err.status = 503;
    err.code = 'DGII_FE_CERT_MISSING';
    throw err;
  }

  const dryRun = resolveDryRun(body);
  const envName = resolveDgiiEnvironment();
  const { draft, registroId, fromRegistro } = await loadDraft(body);

  if (fromRegistro && draft.documento?.ncf && !body.force) {
    const err = new Error(
      `Este registro ya tiene eNCF ${draft.documento.ncf}. Use force=true solo si debe reemitir.`
    );
    err.status = 409;
    err.code = 'NCF_ALREADY_ASSIGNED';
    throw err;
  }

  const tipoeCF = normalizeTipoeCF(body.tipoeCF ?? draft.tipoeCF, draft.comprador);
  if (envName === 'PROD' && tipoeCF !== 31) {
    const err = new Error(
      'En producción solo está autorizado el rango e-CF tipo 31 (crédito fiscal). El cliente debe tener RNC. Aún no hay secuencias tipo 32.'
    );
    err.status = 409;
    err.code = 'DGII_NCF_TIPO_32_NO_AUTORIZADO';
    throw err;
  }
  const { encf, sequence } = await allocateNextEncf(tipoeCF);
  const origen = resolveOrigenEmision(body, registroId);
  const snapshot = compactDraft(draft);
  const rncComprador = String(
    draft.comprador?.rncCliente || draft.comprador?.rnc || draft.comprador?.rncComprador || ''
  ).replace(/\D/g, '');
  const razonSocial = String(
    draft.comprador?.nombreRazon ||
      draft.comprador?.razonSocialComprador ||
      draft.comprador?.razonSocial ||
      ''
  ).trim();

  const { document, totales } = draftToIecfDocument(draft, { encf, tipoeCF });
  let xml = iecfDocumentToXml(document);
  xml = setFechaHoraFirma(xml);

  const stack = requireFeStack();
  let signedXml = '';
  let codigoSeguridad = null;
  const fechaFirma = fechaHoraFirmaNow();
  const fileName = `${getDgiiFeRnc()}${encf}.xml`;
  let trackId = null;
  let dgiiEstado = dryRun ? 'DRY_RUN' : null;
  let dgiiRaw = null;
  let codigoQrDataUrl = null;
  let codigoQrUrl = null;

  try {
    signedXml = stack.signature.signXml(xml, 'ECF');
    codigoSeguridad = getCodeSixDigitfromSignature(signedXml) || null;

    if (!dryRun) {
      const montoTotal = Number(totales?.MontoTotal || 0);
      if (tipoeCF === 32 && montoTotal < 250000) {
        // TODO sprint 2: RFCE sendSummary
      }
      const ecf = new ECF(stack.keys, envToLibrary(envName));
      await ecf.authenticate();
      const sendRes = await ecf.sendElectronicDocument(signedXml, fileName);
      dgiiRaw = sendRes || null;
      trackId = sendRes?.trackId || sendRes?.TrackId || null;
      dgiiEstado = sendRes?.estado || sendRes?.Estado || (trackId ? 'Enviado' : 'EnviadoSinTrack');
    }

    const fechaEmisionQr = formatFechaDgii(
      draft.transaccion?.fechaEmisionISO ? new Date(draft.transaccion.fechaEmisionISO) : new Date()
    );
    try {
      const qr = await buildCodigoQrDataUrl({
        rncEmisor: getDgiiFeRnc(),
        rncComprador,
        encf,
        montoTotal: totales?.MontoTotal,
        fechaEmision: fechaEmisionQr,
        fechaFirma,
        codigoSeguridad,
        environment: envName
      });
      codigoQrUrl = qr.url || null;
      codigoQrDataUrl = qr.dataUrl || null;
    } catch (_) {
      codigoQrDataUrl = null;
    }
  } catch (err) {
    if (!dryRun) {
      await guardarEnLibro({
        encf,
        tipoeCF,
        sequence,
        origen,
        registroId: registroId || null,
        referenciaInterna: draft.transaccion?.numeroFacturaInterna || body.reservaId || body.bookingId || null,
        rncEmisor: getDgiiFeRnc(),
        rncComprador: rncComprador || null,
        razonSocial: razonSocial || null,
        montoTotal: totales?.MontoTotal ?? null,
        trackId,
        estado: ledgerErrorText(err),
        errorEnvio: true,
        codigoSeguridad,
        fechaFirmaDigital: fechaFirma,
        fileName,
        environment: envName,
        dryRun,
        snapshot,
        xmlFirmado: signedXml || null
      });
    }
    throw err;
  }

  const persistPatch = {
    ncfElectronico: encf,
    tipoeCF,
    codigoSeguridad,
    fechaFirmaDigital: fechaFirma,
    codigoQrDataUrl,
    codigoQrUrl,
    dgiiTrackId: trackId,
    dgiiEstado,
    dgiiEnvironment: envName,
    dgiiDryRun: dryRun,
    dgiiSequence: sequence,
    dgiiFileName: fileName,
    dgiiEmitidoAt: new Date().toISOString()
  };

  let registro = null;
  if (registroId) {
    registro = await RegistrationModel.upsertDetallesAndTouch(
      registroId,
      persistPatch,
      new Date().toISOString()
    );
  }

  if (!dryRun) {
    await guardarEnLibro({
      encf,
      tipoeCF,
      sequence,
      origen,
      registroId: registroId || null,
      referenciaInterna:
        draft.transaccion?.numeroFacturaInterna || body.reservaId || body.bookingId || null,
      rncEmisor: getDgiiFeRnc(),
      rncComprador: rncComprador || null,
      razonSocial: razonSocial || null,
      montoTotal: totales?.MontoTotal ?? null,
      trackId,
      estado: dgiiEstado,
      errorEnvio: false,
      codigoSeguridad,
      fechaFirmaDigital: fechaFirma,
      codigoQrUrl,
      fileName,
      environment: envName,
      dryRun,
      snapshot,
      xmlFirmado: signedXml || null
    });
  }

  return {
    ok: true,
    dryRun,
    environment: envName,
    tipoeCF,
    encf,
    sequence,
    codigoSeguridad,
    fechaFirmaDigital: fechaFirma,
    codigoQrUrl,
    tieneQr: Boolean(codigoQrDataUrl),
    trackId,
    estado: dgiiEstado,
    fileName,
    registroId: registroId || null,
    montoTotal: totales?.MontoTotal ?? null,
    // XML firmado solo en respuesta (no se guarda completo en Dynamo)
    xmlFirmado: signedXml,
    dgiiResponse: dgiiRaw,
    registroActualizado: Boolean(registro)
  };
}

export async function consultarEstadoValidacionDgii(trackId) {
  const id = String(trackId || '').trim();
  if (!id) {
    const err = new Error('trackId requerido');
    err.status = 400;
    throw err;
  }
  if (!isDgiiFeCertConfigured()) {
    const err = new Error('Certificado DGII no configurado para consultar validación');
    err.status = 503;
    err.code = 'DGII_FE_CERT_MISSING';
    throw err;
  }
  const envName = resolveDgiiEnvironment();
  const stack = requireFeStack();
  const ecf = new ECF(stack.keys, envToLibrary(envName));
  await ecf.authenticate();
  const st = await ecf.statusTrackId(id);
  return {
    ok: true,
    source: 'dgii',
    trackId: st?.trackId || id,
    codigo: st?.codigo ?? null,
    estado: st?.estado || null,
    rnc: st?.rnc || null,
    encf: st?.encf || null,
    secuenciaUtilizada: st?.secuenciaUtilizada ?? null,
    fechaRecepcion: st?.fechaRecepcion || null,
    mensajes: st?.mensajes || [],
    environment: envName,
    dgii: st || null
  };
}

export async function getEstadoEmision(registroIdOrTrack, opts = {}) {
  const id = String(registroIdOrTrack || '').trim();
  if (!id) {
    const err = new Error('id requerido');
    err.status = 400;
    throw err;
  }
  const consultarDgii = opts.consultarDgii === true;

  let reg = await RegistrationModel.getById(id);
  if (!reg) {
    try {
      reg = await RegistrationModel.getByShortCode(id);
    } catch (_) {
      reg = null;
    }
  }

  if (reg) {
    const det = reg.detalles && typeof reg.detalles === 'object' ? reg.detalles : {};
    const local = {
      ok: true,
      source: 'registro',
      registroId: reg.id,
      encf: det.ncfElectronico || null,
      tipoeCF: det.tipoeCF || null,
      codigoSeguridad: det.codigoSeguridad || null,
      fechaFirmaDigital: det.fechaFirmaDigital || null,
      trackId: det.dgiiTrackId || null,
      estado: det.dgiiEstado || (det.ncfElectronico ? 'Local' : null),
      dryRun: det.dgiiDryRun ?? null,
      environment: det.dgiiEnvironment || null,
      emitidoAt: det.dgiiEmitidoAt || null
    };
    if (consultarDgii && local.trackId) {
      const dgii = await consultarEstadoValidacionDgii(local.trackId);
      return {
        ...local,
        source: 'registro+dgii',
        codigo: dgii.codigo,
        estado: dgii.estado,
        fechaRecepcion: dgii.fechaRecepcion,
        mensajes: dgii.mensajes,
        dgii: dgii.dgii
      };
    }
    return local;
  }

  return consultarEstadoValidacionDgii(id);
}

/** Vista previa HTML: no reserva e-NCF y no envía a DGII. */
export async function previewFacturaHtml(body = {}) {
  const { draft } = await loadDraft(body);
  const printDraft = {
    ...draft,
    documento: {
      ...(draft.documento || {}),
      ncf: String(draft.documento?.ncf || '').trim() || 'SIN e-NCF (vista previa)',
      tipo: draft.documento?.tipo || 'DOCUMENTO DE COBRO'
    }
  };
  return renderFacturaOperativaHtml(printDraft);
}

export function facturacionEmitHealth() {
  return {
    facturacionEmitir: true,
    dryRunDefault: isDryRunDefault(),
    environment: resolveDgiiEnvironment(),
    certConfigured: isDgiiFeCertConfigured(),
    ncfTable: String(process.env.DGII_NCF_TABLE || 'ncf_secuencias')
  };
}
