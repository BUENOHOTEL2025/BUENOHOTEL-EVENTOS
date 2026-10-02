import { createRequire } from 'module';
import { generateEcfQRCodeURL, ENVIRONMENT } from 'dgii-ecf';
import { getDgiiFeRnc } from './dgiiFeCert.service.js';
import { formatFechaDgii } from './facturacionIecf.mapper.js';
import { digitsOnly, resolveDgiiEnvironment } from '../domain/facturacionEmit.schema.js';
import { decimalRD } from '../domain/creditFiscalInvoice.schema.js';

const require = createRequire(import.meta.url);
const QRCode = require('qrcode');

function str(v) {
  return v != null ? String(v).trim() : '';
}

export function envToQrLibrary(envName) {
  const n = String(envName || resolveDgiiEnvironment()).trim().toUpperCase();
  if (n === 'PROD' || n === 'ECF') return ENVIRONMENT.PROD;
  if (n === 'DEV' || n === 'TESTECF') return ENVIRONMENT.DEV;
  return ENVIRONMENT.CERT;
}

export function buildConsultaTimbreUrl({
  rncEmisor,
  rncComprador,
  encf,
  montoTotal,
  fechaEmision,
  fechaFirma,
  codigoSeguridad,
  environment
} = {}) {
  const emisor = digitsOnly(rncEmisor || getDgiiFeRnc());
  const ncf = str(encf);
  const codigo = str(codigoSeguridad);
  if (!emisor || !ncf || !codigo) return '';
  const monto = decimalRD(Number(montoTotal) || 0, 2).toFixed(2);
  const emision = str(fechaEmision) || formatFechaDgii(new Date());
  const firma = str(fechaFirma) || emision;
  return generateEcfQRCodeURL(
    emisor,
    digitsOnly(rncComprador || ''),
    ncf,
    monto,
    emision,
    firma,
    codigo,
    envToQrLibrary(environment)
  );
}

export async function qrDataUrlFromText(text) {
  const payload = str(text);
  if (!payload) return '';
  return QRCode.toDataURL(payload, {
    margin: 1,
    width: 180,
    errorCorrectionLevel: 'M',
    color: { dark: '#1a365d', light: '#ffffff' }
  });
}

export async function buildCodigoQrDataUrl(params) {
  const url = buildConsultaTimbreUrl(params);
  if (!url) return { url: '', dataUrl: '' };
  const dataUrl = await qrDataUrlFromText(url);
  return { url, dataUrl };
}

/**
 * Completa verificacion.codigoQrDataUrl si hay e-CF firmado (código + eNCF).
 * Funciona al imprimir aunque Dynamo no tenga la imagen guardada.
 */
export async function enrichVerificacionQr(verificacion, ctx = {}) {
  const v = verificacion && typeof verificacion === 'object' ? verificacion : {};
  const codigo = str(v.codigoSeguridad || ctx.codigoSeguridad);
  const encf = str(ctx.encf || ctx.ncf);
  if (!codigo || !encf) {
    v.tieneCodigoQr = Boolean(v.codigoQrDataUrl);
    return v;
  }
  try {
    const { url, dataUrl } = await buildCodigoQrDataUrl({
      rncEmisor: ctx.rncEmisor,
      rncComprador: ctx.rncComprador,
      encf,
      montoTotal: ctx.montoTotal,
      fechaEmision: ctx.fechaEmision,
      fechaFirma: str(v.fechaFirmaDigital || ctx.fechaFirma),
      codigoSeguridad: codigo,
      environment: ctx.environment
    });
    if (url) v.codigoQrUrl = url;
    if (dataUrl) v.codigoQrDataUrl = dataUrl;
  } catch (_) {
    /* impresión sin QR si el encoder falla */
  }
  v.tieneCodigoQr = Boolean(v.codigoQrDataUrl || v.codigoQrUrl);
  return v;
}
