import UserModel from '../models/user.model.js';
import AuditoriaEcfModel from '../models/auditoriaEcf.model.js';
import LoginLockEcfModel, { LOCK_FIVE_MS, LOCK_THIRTY_MS } from '../models/loginLockEcf.model.js';

export const AUDITOR_EMAIL = 'elmerluissainthilarerojo@gmail.com';

export function auditorEmails() {
  const extra = String(process.env.ECF_AUDITOR_EMAILS || '')
    .split(/[,;]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set([AUDITOR_EMAIL, ...extra]);
}

export function isAuditorEmail(email) {
  return auditorEmails().has(String(email || '').trim().toLowerCase());
}

export function parseJwtPayload(authHeader) {
  try {
    const m = String(authHeader || '').match(/^Bearer\s+(.+)$/i);
    if (!m) return {};
    const parts = m[1].split('.');
    if (parts.length < 2) return {};
    const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const p = JSON.parse(json);
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}

export function userFromReq(req) {
  const p = parseJwtPayload(req?.headers?.authorization);
  const body = req?.body && typeof req.body === 'object' ? req.body : {};
  const hdrEmail = String(req?.headers?.['x-user-email'] || '').trim().toLowerCase();
  const email = String(
    p.email || p.correo || p.username || hdrEmail || body.email || body.savedBy || ''
  )
    .trim()
    .toLowerCase();
  const jwtNombre = String(
    p.nombreCompleto ||
      p.name ||
      p.fullName ||
      [p.nombre || p.given_name, p.apellido || p.family_name].filter(Boolean).join(' ') ||
      ''
  ).trim();
  const nombre = String(req?.headers?.['x-user-name'] || jwtNombre || body.usuarioNombre || '').trim();
  return {
    email,
    nombre,
    userId: String(p.sub || p.user_id || p.userId || '').trim(),
    rol: String(p.rol || p.role || '').trim()
  };
}

const nombreCache = new Map();
let usuariosCacheAt = 0;
let usuariosCache = [];

function nombreDeUsuario(u) {
  if (!u || typeof u !== 'object') return '';
  return String(
    u.nombreCompleto ||
      [u.nombre, u.apellido].filter(Boolean).join(' ') ||
      u.name ||
      u.fullName ||
      ''
  )
    .replace(/\s+/g, ' ')
    .trim();
}

async function ensureUsuariosCache() {
  if (usuariosCache.length && Date.now() - usuariosCacheAt < 5 * 60 * 1000) return;
  try {
    usuariosCache = await UserModel.listPanelAdmins();
    usuariosCacheAt = Date.now();
    for (const u of usuariosCache) {
      const email = String(u.email || u.correo || '')
        .trim()
        .toLowerCase();
      const n = nombreDeUsuario(u);
      if (email && n) nombreCache.set(email, n);
    }
  } catch (err) {
    console.error('auditoria usuarios cache:', err?.message || err);
  }
}

export async function resolveNombre({ email, nombre, userId } = {}) {
  const n0 = String(nombre || '').trim();
  const em = String(email || '')
    .trim()
    .toLowerCase();
  if (n0) {
    if (em) nombreCache.set(em, n0);
    return n0;
  }
  if (em && nombreCache.has(em)) return nombreCache.get(em);
  if (userId) {
    try {
      const u = await UserModel.getById(userId);
      const n = nombreDeUsuario(u);
      if (n) {
        if (em) nombreCache.set(em, n);
        return n;
      }
    } catch {
      /* sigue */
    }
  }
  if (em) {
    await ensureUsuariosCache();
    return nombreCache.get(em) || '';
  }
  return '';
}

export function clientIp(req) {
  const xf = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const real = String(req?.headers?.['x-real-ip'] || '').trim();
  const ip = xf || real || String(req?.ip || req?.socket?.remoteAddress || '').trim();
  return ip.replace(/^::ffff:/, '');
}

export function navegadorDe(ua) {
  const s = String(ua || '');
  if (/edg\//i.test(s)) return 'Edge';
  if (/chrome\//i.test(s) && !/edg\//i.test(s)) return 'Chrome';
  if (/firefox\//i.test(s)) return 'Firefox';
  if (/safari\//i.test(s) && !/chrome\//i.test(s)) return 'Safari';
  if (/opr\//i.test(s)) return 'Opera';
  return s.slice(0, 40) || 'desconocido';
}

const SECRET_RX = /password|passwd|token|authorization|secret|p12|cert/i;

export function sanitizeValue(v, depth = 0) {
  if (v == null) return v;
  if (depth > 6) return '[…]';
  if (typeof v === 'string') {
    if (v.length > 8000) return v.slice(0, 8000) + '…';
    if (/^-----BEGIN/i.test(v) || v.includes('<eCF') || v.includes('xmlFirmado')) return `[omitido ${v.length} chars]`;
    return v;
  }
  if (typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.slice(0, 80).map((x) => sanitizeValue(x, depth + 1));
  const out = {};
  for (const [k, val] of Object.entries(v)) {
    if (SECRET_RX.test(k)) {
      out[k] = '[omitido]';
      continue;
    }
    if (/xmlFirmado|html|pdfBase64/i.test(k)) {
      out[k] = `[omitido ${String(val || '').length}]`;
      continue;
    }
    out[k] = sanitizeValue(val, depth + 1);
  }
  return out;
}

export async function writeAudit(entry) {
  const usuarioEmail = String(entry.usuarioEmail || '').trim().toLowerCase();
  const usuarioNombre = await resolveNombre({
    email: usuarioEmail,
    nombre: entry.usuarioNombre,
    userId: entry.userId
  });
  const rec = {
    canal: entry.canal || 'panel',
    accion: String(entry.accion || 'accion').slice(0, 120),
    resultado: entry.resultado || 'ok',
    statusCode: entry.statusCode ?? null,
    usuarioEmail,
    usuarioNombre,
    userId: String(entry.userId || '').trim(),
    ip: String(entry.ip || '').trim(),
    userAgent: String(entry.userAgent || '').slice(0, 500),
    navegador: entry.navegador || navegadorDe(entry.userAgent),
    method: entry.method || '',
    path: String(entry.path || '').slice(0, 300),
    query: sanitizeValue(entry.query || null),
    payload: sanitizeValue(entry.payload || null),
    respuesta: sanitizeValue(entry.respuesta || null),
    duracionMs: entry.duracionMs ?? null,
    motivo: String(entry.motivo || '').slice(0, 500),
    lockMinutos: entry.lockMinutos ?? null,
    intentos: entry.intentos ?? null,
    loginCanal: entry.loginCanal || '',
    extra: sanitizeValue(entry.extra || null)
  };
  return AuditoriaEcfModel.put(rec);
}

export async function listAudit({ limit, canal, q, exclusiveStartKey } = {}) {
  const data = await AuditoriaEcfModel.listRecent({ limit: limit || 250, exclusiveStartKey });
  let items = data.items;
  const c = String(canal || '').toLowerCase();
  if (c === 'api' || c === 'panel') items = items.filter((x) => String(x.canal || '') === c);
  const needle = String(q || '').trim().toLowerCase();
  if (needle) {
    items = items.filter((x) => JSON.stringify(x).toLowerCase().includes(needle));
  }
  await Promise.all(
    items.map(async (x) => {
      if (x.usuarioNombre || !x.usuarioEmail) return;
      x.usuarioNombre = await resolveNombre({
        email: x.usuarioEmail,
        nombre: '',
        userId: x.userId
      });
    })
  );
  return { items, lastKey: data.lastKey };
}

export async function lockStatus(email) {
  const item = await LoginLockEcfModel.get(email);
  const remainingMs = LoginLockEcfModel.remainingMs(item);
  if (remainingMs > 0) {
    const lockMinutos = Math.round(remainingMs / 60000) || (remainingMs > LOCK_FIVE_MS ? 30 : 5);
    return {
      locked: true,
      remainingMs,
      remainingSeg: Math.ceil(remainingMs / 1000),
      lockMinutos
    };
  }
  return { locked: false, remainingMs: 0, remainingSeg: 0 };
}

export async function registerLoginFail(email, meta = {}) {
  const id = String(email || '').trim().toLowerCase();
  if (!id) return { locked: false };
  const current = (await LoginLockEcfModel.get(id)) || {
    id,
    fails: 0,
    nextLockMs: LOCK_FIVE_MS,
    totalLocks: 0
  };
  const remainingMs = LoginLockEcfModel.remainingMs(current);
  if (remainingMs > 0) {
    return {
      locked: true,
      remainingMs,
      remainingSeg: Math.ceil(remainingMs / 1000),
      lockMinutos: Math.round(remainingMs / 60000),
      wroteAudit: false
    };
  }
  const fails = Number(current.fails || 0) + 1;
  if (fails < 3) {
    await LoginLockEcfModel.put({
      ...current,
      id,
      fails,
      lockUntil: '',
      updatedAt: new Date().toISOString()
    });
    return { locked: false, fails, wroteAudit: false };
  }
  const lockMs = LoginLockEcfModel.nextLockMs(current);
  const lockUntil = new Date(Date.now() + lockMs).toISOString();
  const nextLockMs = lockMs === LOCK_FIVE_MS ? LOCK_THIRTY_MS : LOCK_FIVE_MS;
  const lockMinutos = Math.round(lockMs / 60000);
  await LoginLockEcfModel.put({
    id,
    fails: 0,
    lockUntil,
    nextLockMs,
    totalLocks: Number(current.totalLocks || 0) + 1,
    lastLockMinutos: lockMinutos,
    updatedAt: new Date().toISOString()
  });
  await writeAudit({
    canal: 'panel',
    accion: 'login_bloqueado',
    resultado: 'bloqueo',
    statusCode: 429,
    usuarioEmail: id,
    usuarioNombre: meta.usuarioNombre || '',
    ip: meta.ip,
    userAgent: meta.userAgent,
    navegador: navegadorDe(meta.userAgent),
    motivo: meta.motivo || 'Tres intentos de login fallidos. Login inhabilitado.',
    lockMinutos,
    intentos: 3,
    loginCanal: meta.loginCanal || 'panel',
    extra: {
      pantalla: meta.pantalla || null,
      idioma: meta.idioma || '',
      zona: meta.zona || ''
    }
  });
  return {
    locked: true,
    remainingMs: lockMs,
    remainingSeg: Math.ceil(lockMs / 1000),
    lockMinutos,
    wroteAudit: true
  };
}

export async function registerLoginOk(email) {
  const id = String(email || '').trim().toLowerCase();
  if (id) await LoginLockEcfModel.clear(id);
}
