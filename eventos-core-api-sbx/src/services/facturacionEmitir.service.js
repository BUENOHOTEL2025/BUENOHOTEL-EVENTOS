import { ECF, ENVIRONMENT, getCodeSixDigitfromSignature } from 'dgii-ecf';
import RegistrationModel from '../models/registration.model.js';
import ComprobanteEcfModel from '../models/comprobanteEcf.model.js';
import {
  buildCreditFiscalDraftFromRegistration,
  mergeEmisorFactura
} from './creditFiscalDraft.service.js';
import { requireFeStack, isDgiiFeCertConfigured, getDgiiFeRnc } from './dgiiFeCert.service.js';
import { allocateNextEncf, peekNextEncf } from './ncfSequence.service.js';
import {
  draftToIecfDocument,
  iecfDocumentToXml,
  setFechaHoraFirma,
  fechaHoraFirmaNow,
  formatFechaDgii,
  assertXmlListoParaEmitir,
  assertXmlCumpleDgii,
  telefonoDgii,
  printModelFromDraft
} from './facturacionIecf.mapper.js';
import {
  isDryRunDefault,
  normalizeTipoeCF,
  resolveDgiiEnvironment,
  validateDirectEmitPayload,
  validateDraftEmit,
  digitsOnly
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
  const c = body.comprador || {};
  const comprador = {
    ...c,
    nombreRazon: String(c.nombreRazon || c.razonSocialComprador || '').trim(),
    rncCliente: digitsOnly(c.rncCliente || c.rncComprador || c.rnc),
    email: String(c.email || c.correo || c.emailFiscal || '').trim(),
    telefono: telefonoDgii(c.telefono || c.telefonoFiscal || ''),
    direccion: String(c.direccion || c.direccionFiscal || '').trim()
  };
  return {
    tipoeCF: body.tipoeCF,
    emisor: mergeEmisorFactura(body.emisor),
    comprador,
    documento: body.documento || {},
    transaccion: body.transaccion || {
      fechaEmisionISO: new Date().toISOString(),
      numeroFacturaInterna: body.numeroFacturaInterna || undefined
    },
    lineas: body.lineas || [],
    totales: body.totales || {}
  };
}

function denyEmit(message, code = 'DGII_XML_PREFLIGHT') {
  const err = new Error(message);
  err.status = 400;
  err.code = code;
  throw err;
}

async function loadDraft(body) {
  const registroId = String(body?.registroId || '').trim();
  let draft;
  let fromRegistro = false;
  let id = null;
  if (registroId) {
    draft = await buildCreditFiscalDraftFromRegistration(registroId);
    fromRegistro = true;
    id = draft._meta?.registroId || registroId;
  } else {
    const v = validateDirectEmitPayload(body);
    if (!v.ok) denyEmit(`${v.error}. No se enviará a Impuestos Internos.`);
    draft = directPayloadToDraft(body);
  }
  draft.emisor = mergeEmisorFactura(draft.emisor);
  const all = validateDraftEmit(draft);
  if (!all.ok) {
    denyEmit(
      `${all.error}. Completa RNC, razón social, teléfono 809/829/849, correo y dirección (Booking, Eventos o panel). No se enviará a Impuestos Internos.`
    );
  }
  return { draft, registroId: id, fromRegistro };
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
  const raw = String(body?.origen || body?.fuente || body?.source || body?.sistema || '').trim();
  if (!raw) return 'booking';
  const key = raw.toLowerCase();
  const allowed = ['eventos', 'booking', 'ecommerce', 'manual', 'seguro', 'tours'];
  if (allowed.includes(key)) return key;
  if (key === 'otro') return 'manual';
  const custom = raw.replace(/[^a-zA-Z0-9áéíóúñüÁÉÍÓÚÑÜ ._-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  return custom || 'manual';
}

function ledgerErrorText(err) {
  return String(err?.mensaje || err?.error || err?.message || err || 'Error de envío');
}

function flagsLibro(record) {
  return {
    tieneXml: Boolean(record.xmlFirmado || record.tieneXml),
    tieneImpresion: Boolean(
      record.tieneImpresion ||
        (record.snapshot && (record.snapshot.lineas?.length || record.snapshot.comprador)) ||
        record.registroId
    )
  };
}

async function guardarEnLibro(record) {
  const flags = flagsLibro(record);
  const { xmlFirmado, snapshot, ...rest } = record;
  const light = { ...rest, ...flags };
  try {
    await ComprobanteEcfModel.upsert(light);
  } catch (e) {
    console.error('libro comprobantes_ecf light:', e?.name, e?.message || e);
  }
  try {
    await ComprobanteEcfModel.upsert({ ...record, ...flags });
  } catch (e) {
    console.error('libro comprobantes_ecf:', e?.name, e?.message || e);
    try {
      await ComprobanteEcfModel.upsert({
        ...light,
        snapshot,
        ...flags,
        tieneXml: Boolean(xmlFirmado)
      });
      console.error('libro comprobantes_ecf: guardado sin XML firmado');
    } catch (e2) {
      console.error('libro comprobantes_ecf FALLÓ:', e2?.name, e2?.message || e2);
    }
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

  const xmlPreflight = assertXmlListoParaEmitir(draft, tipoeCF);
  try {
    requireFeStack().signature.signXml(xmlPreflight, 'ECF');
  } catch (signErr) {
    if (signErr?.code === 'DGII_XML_PREFLIGHT') throw signErr;
    const err = new Error(
      `El XML no se pudo firmar (${signErr?.message || 'error'}). No se gastará e-NCF.`
    );
    err.status = 400;
    err.code = 'DGII_XML_PREFLIGHT';
    throw err;
  }

  if (dryRun) {
    const peek = await peekNextEncf(tipoeCF);
    return {
      ok: true,
      dryRun: true,
      environment: envName,
      tipoeCF,
      encf: null,
      sequence: null,
      proximoEncf: peek.proximoEncf,
      remaining: peek.remaining,
      maxSequence: peek.maxSequence,
      estado: 'DRY_RUN',
      mensaje: 'Vista de prueba: no se reservó e-NCF ni se envió a Impuestos Internos.'
    };
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
  try {
    assertXmlCumpleDgii(xml, { tipoeCF, encf });
  } catch (preErr) {
    await guardarEnLibro({
      encf,
      tipoeCF,
      sequence,
      origen,
      registroId: registroId || null,
      rncComprador: rncComprador || null,
      razonSocial: razonSocial || null,
      montoTotal: totales?.MontoTotal ?? null,
      estado: preErr?.message || 'XML no cumple requisitos DGII',
      errorEnvio: true,
      environment: envName,
      dryRun,
      snapshot
    });
    throw preErr;
  }
  const fileName = `${getDgiiFeRnc()}${encf}.xml`;

  const libroBase = () => ({
    encf,
    tipoeCF,
    sequence,
    origen,
    registroId: registroId || null,
    referenciaInterna: draft.transaccion?.numeroFacturaInterna || body.reservaId || body.bookingId || null,
    rncEmisor: getDgiiFeRnc(),
    rncComprador: rncComprador || null,
    razonSocial: razonSocial || null,
    emailComprador: draft.comprador?.email || null,
    telefonoComprador: draft.comprador?.telefono || null,
    direccionComprador: draft.comprador?.direccion || null,
    montoTotal: totales?.MontoTotal ?? null,
    fileName,
    environment: envName,
    dryRun,
    snapshot,
    tieneImpresion: true
  });

  if (!dryRun) {
    await guardarEnLibro({
      ...libroBase(),
      estado: 'Reservado',
      errorEnvio: false,
      xmlFirmado: null,
      tieneXml: false
    });
  }

  const stack = requireFeStack();
  let signedXml = '';
  let codigoSeguridad = null;
  const fechaFirma = fechaHoraFirmaNow();
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
      assertXmlCumpleDgii(signedXml, { tipoeCF, encf });
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
        ...libroBase(),
        trackId,
        estado: ledgerErrorText(err),
        errorEnvio: true,
        codigoSeguridad,
        fechaFirmaDigital: fechaFirma,
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
    dgiiEmitidoAt: new Date().toISOString(),
    dgiiMontoTotal: totales?.MontoTotal ?? draft.totales?.totalRD ?? null
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
      ...libroBase(),
      trackId,
      estado: dgiiEstado,
      errorEnvio: false,
      codigoSeguridad,
      fechaFirmaDigital: fechaFirma,
      codigoQrUrl,
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
  const encf = String(st?.encf || '').trim().toUpperCase();
  if (encf) {
    try {
      await ComprobanteEcfModel.upsert({
        encf,
        trackId: st?.trackId || id,
        estado: st?.estado || null,
        codigoDgii: st?.codigo ?? null,
        mensajes: st?.mensajes || [],
        rncEmisor: st?.rnc || getDgiiFeRnc(),
        fechaRecepcion: st?.fechaRecepcion || null,
        environment: envName,
        consultadoAt: new Date().toISOString()
      });
    } catch (e) {
      console.error('validacion no pudo guardar libro:', e?.message || e);
    }
  }
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
  return renderFacturaOperativaHtml(printModelFromDraft(draft, { esPreview: true }));
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
