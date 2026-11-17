import crypto from 'crypto';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

let cachedSecret = '';
let smClient = null;

function deny(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  throw err;
}

function b64urlToBuf(s) {
  const pad = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(pad, 'base64');
}

async function jwtSecret() {
  const inline = String(process.env.JWT_SECRET || '').trim();
  if (inline) return inline;
  if (cachedSecret) return cachedSecret;
  const arn = String(process.env.JWT_SECRET_ARN || '').trim();
  if (!arn) deny(500, 'JWT no configurado en el servidor.', 'JWT_SECRET_MISSING');
  smClient =
    smClient ||
    new SecretsManagerClient({ region: process.env.AWSREGION || process.env.AWS_REGION || 'us-east-1' });
  const r = await smClient.send(new GetSecretValueCommand({ SecretId: arn }));
  const raw = r.SecretString || (r.SecretBinary ? Buffer.from(r.SecretBinary).toString('utf8') : '');
  cachedSecret = String(raw || '').trim();
  if (!cachedSecret) deny(500, 'JWT no configurado en el servidor.', 'JWT_SECRET_EMPTY');
  return cachedSecret;
}

export function extractBearerToken(req) {
  const raw = String(req?.headers?.authorization || req?.headers?.Authorization || '').trim();
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

export function tokenFromRequest(req) {
  const header = extractBearerToken(req);
  if (header) return header;
  const cookie = String(req?.headers?.cookie || '');
  const m = cookie.match(/(?:^|;\s*)buenohotel_auth_token=([^;]+)/i);
  if (!m) return '';
  try {
    return decodeURIComponent(m[1].trim());
  } catch {
    return String(m[1] || '').trim();
  }
}

/**
 * Solo acepta JWT HS256 firmado con el secreto de BuenoHotel (mismo de /api/auth/login).
 * Rechaza Cognito/RS256 y tokens inventados.
 */
export async function verifyBuenoHotelJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    deny(401, 'Token JWT inválido.', 'JWT_INVALID');
  }
  let header;
  try {
    header = JSON.parse(b64urlToBuf(parts[0]).toString('utf8'));
  } catch {
    deny(401, 'Token JWT inválido.', 'JWT_INVALID');
  }
  const alg = String(header?.alg || '');
  if (alg !== 'HS256') {
    deny(
      401,
      'El token no es de BuenoHotel. Use el JWT de /api/auth/login (no Cognito de Booking).',
      'JWT_NOT_BUENOHOTEL'
    );
  }
  const secret = await jwtSecret();
  const expected = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
  const actual = b64urlToBuf(parts[2]);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    deny(401, 'Token JWT inválido o no es de BuenoHotel.', 'JWT_BAD_SIGNATURE');
  }
  let payload;
  try {
    payload = JSON.parse(b64urlToBuf(parts[1]).toString('utf8'));
  } catch {
    deny(401, 'Token JWT inválido.', 'JWT_INVALID');
  }
  if (payload?.exp && Number(payload.exp) * 1000 < Date.now()) {
    deny(401, 'Sesión expirada. Vuelva a iniciar sesión.', 'JWT_EXPIRED');
  }
  return payload && typeof payload === 'object' ? payload : {};
}

function b64urlJson(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}

/** Mismo JWT que POST /api/auth/login (HS256, 12 h). */
export async function signBuenoHotelJwt(claims = {}) {
  const secret = await jwtSecret();
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: String(claims.sub || claims.id || ''),
    email: String(claims.email || '').trim().toLowerCase(),
    rol: String(claims.rol || claims.role || 'usuario'),
    iat: now,
    exp: now + 12 * 60 * 60
  };
  const h = b64urlJson({ alg: 'HS256', typ: 'JWT' });
  const p = b64urlJson(payload);
  const sig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}
