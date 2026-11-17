import crypto from 'crypto';

const BOOKING_POOL = 'us-east-1_Y1cNVVIUQ';
const BOOKING_CLIENT = '3vf216eaocie4gm1b5clpmi0h6';
const BOOKING_ISS = `https://cognito-idp.us-east-1.amazonaws.com/${BOOKING_POOL}`;
const JWKS_URL = `${BOOKING_ISS}/.well-known/jwks.json`;

let jwksCache = { at: 0, keys: [] };

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

async function bookingJwks() {
  if (jwksCache.keys.length && Date.now() - jwksCache.at < 60 * 60 * 1000) return jwksCache.keys;
  const resp = await fetch(JWKS_URL, { method: 'GET' });
  if (!resp.ok) deny(503, 'No se pudo validar la sesión de Booking.', 'COGNITO_JWKS');
  const data = await resp.json();
  const keys = Array.isArray(data?.keys) ? data.keys : [];
  jwksCache = { at: Date.now(), keys };
  return keys;
}

/**
 * Valida el IdToken de Cognito de booking.buenohotel.com.do.
 * No emite el JWT de BuenoHotel: eso lo firma jwtBuenoHotel.service.
 */
export async function verifyBookingCognitoIdToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) deny(401, 'Sesión de Booking inválida.', 'BOOKING_JWT_INVALID');
  let header;
  let payload;
  try {
    header = JSON.parse(b64urlToBuf(parts[0]).toString('utf8'));
    payload = JSON.parse(b64urlToBuf(parts[1]).toString('utf8'));
  } catch {
    deny(401, 'Sesión de Booking inválida.', 'BOOKING_JWT_INVALID');
  }
  if (String(header?.alg || '') !== 'RS256') {
    deny(401, 'Sesión de Booking inválida.', 'BOOKING_JWT_ALG');
  }
  if (String(payload?.iss || '') !== BOOKING_ISS) {
    deny(401, 'El token no es del login de Booking BuenoHotel.', 'BOOKING_JWT_ISS');
  }
  const aud = payload?.aud || payload?.client_id;
  if (String(aud || '') !== BOOKING_CLIENT) {
    deny(401, 'El token no es del cliente de Booking.', 'BOOKING_JWT_AUD');
  }
  const use = String(payload?.token_use || '');
  if (use && use !== 'id') {
    deny(401, 'Use el IdToken de Cognito de Booking (no el access token).', 'BOOKING_JWT_USE');
  }
  if (payload?.exp && Number(payload.exp) * 1000 < Date.now()) {
    deny(401, 'La sesión de Booking expiró. Vuelva a entrar.', 'BOOKING_JWT_EXPIRED');
  }
  const keys = await bookingJwks();
  const jwk = keys.find((k) => k.kid === header.kid) || keys[0];
  if (!jwk) deny(401, 'Sesión de Booking inválida.', 'BOOKING_JWT_KID');
  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const ok = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    key,
    b64urlToBuf(parts[2])
  );
  if (!ok) deny(401, 'Sesión de Booking inválida.', 'BOOKING_JWT_SIG');
  return payload;
}
