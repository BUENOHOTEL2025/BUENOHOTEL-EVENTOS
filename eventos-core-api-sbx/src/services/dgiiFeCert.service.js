import path from 'path';
import {
  P12Reader,
  CustomAuthentication,
  Signature,
  SenderReceiver,
  validateXMLCertificate
} from 'dgii-ecf';

/** @type {{ keys: object, customAuth: CustomAuthentication, signature: Signature, senderReceiver: SenderReceiver } | null} */
let cached = null;

export function getDgiiFeRnc() {
  return String(process.env.DGII_FE_RNC || '131631088').replace(/\D/g, '');
}

export function getDgiiFeSoftwareInfo() {
  return {
    nombre: String(process.env.DGII_FE_SOFTWARE_NAME || 'BuenoHotel Eventos').trim(),
    version: String(process.env.DGII_FE_SOFTWARE_VERSION || '1.0.0').trim(),
    rnc: getDgiiFeRnc()
  };
}

export function isDgiiFeCertConfigured() {
  const b64 = String(process.env.DGII_FE_CERT_P12_BASE64 || '').trim();
  const filePath = String(process.env.DGII_FE_CERT_P12_PATH || '').trim();
  const pass = process.env.DGII_FE_CERT_PASSWORD;
  if (pass == null || String(pass) === '') return false;
  return Boolean(b64 || filePath);
}

function loadCerts() {
  if (cached) return cached;

  const pass = String(process.env.DGII_FE_CERT_PASSWORD || '');
  const b64 = String(process.env.DGII_FE_CERT_P12_BASE64 || '').trim();
  const filePath = String(process.env.DGII_FE_CERT_P12_PATH || '').trim();

  if (!pass) return null;

  const reader = new P12Reader(pass);
  let keys;
  try {
    if (b64) {
      keys = reader.getKeyFromStringBase64(b64);
    } else if (filePath) {
      keys = reader.getKeyFromFile(path.resolve(filePath));
    } else {
      return null;
    }
  } catch (e) {
    console.error('❌ DGII FE: error leyendo certificado .p12:', e?.message || e);
    return null;
  }

  if (!keys?.key || !keys?.cert || !keys?.publicKey) {
    console.error('❌ DGII FE: certificado incompleto (key/cert/publicKey).');
    return null;
  }

  cached = {
    keys,
    customAuth: new CustomAuthentication(keys),
    signature: new Signature(keys.key, keys.cert),
    senderReceiver: new SenderReceiver()
  };
  return cached;
}

export function requireFeStack() {
  const stack = loadCerts();
  if (!stack) {
    const err = new Error(
      'Certificado DGII no configurado. Defina DGII_FE_CERT_PASSWORD y DGII_FE_CERT_P12_BASE64 (o DGII_FE_CERT_P12_PATH).'
    );
    err.status = 503;
    err.code = 'DGII_FE_CERT_MISSING';
    throw err;
  }
  return stack;
}

export function resetFeCertCache() {
  cached = null;
}

export { validateXMLCertificate };
