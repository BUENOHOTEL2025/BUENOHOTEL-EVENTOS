import { ReceivedStatus } from 'dgii-ecf';
import {
  getDgiiFeRnc,
  getDgiiFeSoftwareInfo,
  isDgiiFeCertConfigured,
  requireFeStack,
  validateXMLCertificate
} from '../services/dgiiFeCert.service.js';

function extractBearerToken(req) {
  const raw = String(req.headers.authorization || '').trim();
  const m = raw.match(/^bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

function wantsXmlResponse(req) {
  const accept = String(req.headers.accept || '').toLowerCase();
  return accept.includes('application/xml') || accept.includes('text/xml');
}

function jwtTimestamps(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    const fmt = (sec) => {
      if (!Number.isFinite(sec)) return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
      return new Date(sec * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    };
    return {
      expedido: fmt(payload.iat),
      expira: fmt(payload.exp)
    };
  } catch {
    const now = new Date();
    const exp = new Date(now.getTime() + 60 * 60 * 1000);
    const z = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
    return { expedido: z(now), expira: z(exp) };
  }
}

function sendAuthTokenResponse(req, res, token) {
  const { expedido, expira } = jwtTimestamps(token);
  if (wantsXmlResponse(req)) {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.status(200).send(
      `<?xml version="1.0" encoding="utf-8"?>\n` +
        `<RespuestaAutenticacion>\n` +
        `  <token>${escapeXml(token)}</token>\n` +
        `  <expira>${escapeXml(expira)}</expira>\n` +
        `  <expedido>${escapeXml(expedido)}</expedido>\n` +
        `</RespuestaAutenticacion>`
    );
  }
  return res.status(200).json({ token, expira, expedido });
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function xmlFromUpload(req) {
  if (req.file?.buffer) return req.file.buffer.toString('utf8');
  if (typeof req.body === 'string' && req.body.trim().startsWith('<?xml')) return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  return '';
}

async function verifyBearer(req) {
  const token = extractBearerToken(req);
  if (!token) {
    const err = new Error('Authorization Bearer requerido');
    err.status = 401;
    throw err;
  }
  const { customAuth } = requireFeStack();
  const { isExpired } = await customAuth.verifyToken(token);
  if (isExpired) {
    const err = new Error('Token expirado');
    err.status = 401;
    throw err;
  }
  return token;
}

/** GET /fe/autenticacion/api/semilla */
export async function getSemilla(req, res) {
  try {
    const { customAuth } = requireFeStack();
    const seed = customAuth.generateSeed();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.status(200).send(seed.trim());
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({
      success: false,
      code: e.code || 'DGII_FE_ERROR',
      message: e.message || 'Error generando semilla'
    });
  }
}

/** POST /fe/autenticacion/api/validacioncertificado */
export async function postValidacionCertificado(req, res) {
  try {
    const xml = xmlFromUpload(req);
    if (!xml.trim()) {
      return res.status(400).json({ success: false, message: 'Parámetro xml requerido (multipart form-data)' });
    }

    const sigCheck = validateXMLCertificate(xml, { silent: true });
    if (!sigCheck.isValid) {
      return res.status(400).json({
        success: false,
        message: sigCheck.error || 'Firma digital del archivo semilla inválida'
      });
    }

    const { customAuth } = requireFeStack();
    const token = await customAuth.verifySignedSeed(xml);
    return sendAuthTokenResponse(req, res, token);
  } catch (e) {
    return res.status(400).json({
      success: false,
      message: e.message || 'No se pudo validar el certificado / semilla firmada'
    });
  }
}

/** POST /fe/recepcion/api/ecf */
export async function postRecepcionEcf(req, res) {
  try {
    await verifyBearer(req);
    const xml = xmlFromUpload(req);
    if (!xml.trim()) {
      return res.status(400).json({ success: false, message: 'Parámetro xml requerido' });
    }

    const sigCheck = validateXMLCertificate(xml, { silent: true });
    if (!sigCheck.isValid) {
      return res.status(400).json({
        success: false,
        message: sigCheck.error || 'Firma digital del e-CF inválida'
      });
    }

    const { senderReceiver, signature } = requireFeStack();
    const rncReceptor = getDgiiFeRnc();
    const acuseXml = senderReceiver.getECFDataFromXML(xml, rncReceptor, ReceivedStatus['e-CF Recibido']);
    const signedAcuse = signature.signXml(acuseXml, 'ARECF');

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.status(200).send(signedAcuse);
  } catch (e) {
    const status = e.status || 400;
    return res.status(status).json({
      success: false,
      message: e.message || 'Error procesando recepción e-CF'
    });
  }
}

/** POST /fe/aprobacioncomercial/api/ecf */
export async function postAprobacionComercial(req, res) {
  try {
    await verifyBearer(req);
    const xml = xmlFromUpload(req);
    if (!xml.trim()) {
      return res.status(400).json({ success: false, message: 'Parámetro xml requerido' });
    }

    const sigCheck = validateXMLCertificate(xml, { silent: true });
    if (!sigCheck.isValid) {
      return res.status(400).json({
        success: false,
        message: sigCheck.error || 'Firma digital de la aprobación comercial inválida'
      });
    }

    return res.status(200).send();
  } catch (e) {
    const status = e.status || 400;
    return res.status(status).json({
      success: false,
      message: e.message || 'Error procesando aprobación comercial'
    });
  }
}

/** GET /fe/_health — verificación de despliegue (no es endpoint DGII) */
export function getFeHealth(_req, res) {
  const sw = getDgiiFeSoftwareInfo();
  res.json({
    ok: true,
    dgiiFe: {
      certConfigured: isDgiiFeCertConfigured(),
      rnc: sw.rnc,
      software: sw.nombre,
      version: sw.version,
      endpoints: {
        semilla: '/fe/autenticacion/api/semilla',
        validacionCertificado: '/fe/autenticacion/api/validacioncertificado',
        recepcion: '/fe/recepcion/api/ecf',
        aprobacionComercial: '/fe/aprobacioncomercial/api/ecf'
      }
    },
    ts: new Date().toISOString()
  });
}
