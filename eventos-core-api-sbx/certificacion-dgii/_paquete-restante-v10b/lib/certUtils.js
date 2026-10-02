import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { P12Reader } from 'dgii-ecf';

export function loadEnvCert(certDir) {
  dotenv.config({ path: path.join(certDir, '.env.cert') });
}

export function isDgiiFeCertConfigured() {
  const pass = String(process.env.DGII_FE_CERT_PASSWORD || '');
  const b64 = String(process.env.DGII_FE_CERT_P12_BASE64 || '').trim();
  const filePath = String(process.env.DGII_FE_CERT_P12_PATH || '').trim();
  return Boolean(pass && (b64 || filePath));
}

export function loadCerts() {
  const pass = String(process.env.DGII_FE_CERT_PASSWORD || '');
  const b64 = String(process.env.DGII_FE_CERT_P12_BASE64 || '').trim();
  const filePath = String(process.env.DGII_FE_CERT_P12_PATH || '').trim();
  if (!pass) throw new Error('Falta DGII_FE_CERT_PASSWORD');
  const reader = new P12Reader(pass);
  if (b64) return reader.getKeyFromStringBase64(b64);
  if (filePath) return reader.getKeyFromFile(path.resolve(filePath));
  throw new Error('Falta DGII_FE_CERT_P12_PATH o DGII_FE_CERT_P12_BASE64');
}

export function fechaHoraFirmaNow() {
  const parts = new Intl.DateTimeFormat('es-DO', {
    timeZone: 'America/Santo_Domingo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value || '00';
  return `${get('day')}-${get('month')}-${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

export function setFechaHoraFirma(xml) {
  const now = fechaHoraFirmaNow();
  if (/<FechaHoraFirma>/.test(xml)) {
    return xml.replace(/<FechaHoraFirma>[^<]*<\/FechaHoraFirma>/, `<FechaHoraFirma>${now}</FechaHoraFirma>`);
  }
  return xml.replace(/<\/ECF>\s*$/, `  <FechaHoraFirma>${now}</FechaHoraFirma>\n</ECF>`);
}

export function validateSignedEncf(xml, archivo) {
  if (!/<eNCF>[^<]+<\/eNCF>/.test(xml)) {
    throw new Error(`${archivo}: falta <eNCF> — refirmar desde ecf-sin-firmar/`);
  }
  if (/<ENCF>/.test(xml)) {
    throw new Error(
      `${archivo}: tiene <ENCF> (tag inválido). La App DGII lo corrompe; use: npm run firmar-p12`
    );
  }
}

export function formatError(err) {
  const data = err?.response?.data;
  if (data != null && typeof data === 'object') {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }
  if (data != null) return String(data);
  return err?.message || String(err);
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function pollStatus(ecf, trackId, maxAttempts = 12) {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(3000);
    try {
      const st = await ecf.statusTrackId(trackId);
      if (st?.estado && st.estado !== 'En Proceso') return st;
    } catch (e) {
      if (i === maxAttempts - 1) throw e;
    }
  }
  return { estado: 'Timeout', trackId };
}

export function readEncf(xml) {
  return (
    xml.match(/<eNCF>([^<]+)<\/eNCF>/i)?.[1]?.trim() ||
    xml.match(/<ENCF>([^<]+)<\/ENCF>/i)?.[1]?.trim() ||
    ''
  );
}
