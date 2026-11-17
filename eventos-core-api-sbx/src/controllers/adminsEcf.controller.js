import UserModel from '../models/user.model.js';
import {
  userFromReq,
  isAuditorEmail,
  writeAudit,
  clientIp,
  navegadorDe
} from '../services/auditoriaEcf.service.js';
import {
  ECF_PERM_CATALOG,
  defaultPermisosEcf,
  emptyPermisosEcf,
  normalizePermisosEcf,
  hasPermiso,
  resumenPermisos,
  diffPermisosEcf
} from '../domain/ecfPermisos.js';
import { validarPasswordAdmin, passwordSinEspacios } from '../domain/passwordAdmin.js';
import { tokenFromRequest, verifyBuenoHotelJwt } from '../services/jwtBuenoHotel.service.js';

function sendError(res, err) {
  const status = Number(err?.status) || 500;
  res.status(status).json({ success: false, message: err?.message || 'Error de usuarios' });
}

function deny(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

export const CUENTAS_PROTEGIDAS = [
  'elmerluissainthilarerojo@gmail.com',
  'info@buenohotel.com',
  'soporte@buenohotel.com.do'
];

export function esCuentaProtegida(u) {
  const email = String(u?.email || '').trim().toLowerCase();
  if (CUENTAS_PROTEGIDAS.includes(email) || isAuditorEmail(email)) return true;
  const nom = `${u?.nombre || ''} ${u?.apellido || ''} ${u?.nombreCompleto || ''}`.toLowerCase();
  return nom.includes('claudia');
}

function logAdminAccion(req, entry) {
  const user = userFromReq(req);
  const ua = String(req.headers['user-agent'] || '');
  return writeAudit({
    canal: 'panel',
    accion: entry.accion,
    resultado: entry.resultado || 'ok',
    motivo: entry.motivo || '',
    payload: entry.payload || null,
    respuesta: entry.respuesta || null,
    statusCode: entry.statusCode ?? (entry.resultado === 'ok' ? 200 : 400),
    usuarioEmail: user.email,
    usuarioNombre: user.nombre,
    userId: user.userId,
    ip: clientIp(req),
    userAgent: ua,
    navegador: navegadorDe(ua),
    method: req.method,
    path: String(req.originalUrl || req.path || '').split('?')[0]
  }).catch((e) => console.error('auditoria usuarios:', e?.message || e));
}

export function isPanelAdminUser(u) {
  const rol = String(u?.rol || u?.role || '').toLowerCase();
  const email = String(u?.email || '').toLowerCase();
  if (rol === 'admin' || rol === 'administrador') return true;
  if (email.endsWith('@buenohotel.com.do') || email === 'info@buenohotel.com') return true;
  if (isAuditorEmail(email)) return true;
  if (u?.permisosEcf && typeof u.permisosEcf === 'object') return true;
  return false;
}

export function publicAdmin(u) {
  const email = String(u?.email || '').trim().toLowerCase();
  const nombre = String(u?.nombre || '').trim();
  const apellido = String(u?.apellido || '').trim();
  const nombreCompleto = String(u?.nombreCompleto || [nombre, apellido].filter(Boolean).join(' ')).trim();
  const protegida = esCuentaProtegida({ email, nombre, apellido, nombreCompleto });
  const permisosEcf = normalizePermisosEcf(u?.permisosEcf);
  if (protegida) permisosEcf.usuarios = true;
  return {
    id: String(u?.id || '').trim(),
    email,
    nombre,
    apellido,
    nombreCompleto,
    telefono: String(u?.telefono || '').trim(),
    rol: String(u?.rol || 'usuario').trim() || 'usuario',
    activo: protegida ? true : u?.activo !== false,
    protegida,
    permisosEcf,
    fechaActualizacion: u?.fechaActualizacion || ''
  };
}

let usersCache = { at: 0, items: [] };

export function invalidateAdminsCache() {
  usersCache = { at: 0, items: [] };
}

async function allUsers() {
  if (usersCache.items.length && Date.now() - usersCache.at < 60 * 1000) return usersCache.items;
  const items = await UserModel.listPanelAdmins();
  usersCache = { at: Date.now(), items };
  return items;
}

export async function findUserByEmail(email) {
  const key = String(email || '').trim().toLowerCase();
  if (!key) return null;
  return UserModel.getByEmail(key);
}

export async function permisosDeReq(req) {
  const auth = userFromReq(req);
  if (!auth.email) return emptyPermisosEcf();
  if (isAuditorEmail(auth.email)) return defaultPermisosEcf();
  const db = await findUserByEmail(auth.email);
  if (db?.permisosEcf && typeof db.permisosEcf === 'object') return normalizePermisosEcf(db.permisosEcf);
  return emptyPermisosEcf();
}

export async function requirePanelAdmin(req) {
  const token = tokenFromRequest(req);
  if (!token) deny(401, 'Sesión requerida.');
  const claims = await verifyBuenoHotelJwt(token);
  req.jwtPayload = claims;
  const auth = {
    email: String(claims.email || '').trim().toLowerCase(),
    rol: String(claims.rol || claims.role || '').trim(),
    userId: String(claims.sub || claims.user_id || '').trim()
  };
  if (!auth.email) deny(401, 'Sesión requerida.');
  const db = await findUserByEmail(auth.email);
  const merged = { ...(db || {}), email: auth.email, rol: db?.rol || auth.rol };
  if (!isPanelAdminUser(merged) && !isAuditorEmail(auth.email)) {
    deny(403, 'Esta cuenta no es de administración.');
  }
  if (db && db.activo === false && !esCuentaProtegida(merged)) {
    deny(403, 'Tu cuenta está inactiva. Ponte en contacto con un administrador.');
  }
  const permisos = isAuditorEmail(auth.email)
    ? defaultPermisosEcf()
    : normalizePermisosEcf(db?.permisosEcf);
  const pub = publicAdmin({ ...merged, permisosEcf: permisos, activo: true });
  return { ...pub, permisosEcf: pub.permisosEcf };
}

export async function getMeEcf(req, res) {
  try {
    const me = await requirePanelAdmin(req);
    res.status(200).json({
      success: true,
      user: me,
      catalogo: ECF_PERM_CATALOG
    });
  } catch (err) {
    sendError(res, err);
  }
}

export async function listAdminsEcf(req, res) {
  try {
    const me = await requirePanelAdmin(req);
    if (!hasPermiso(me.permisosEcf, 'usuarios') && !isAuditorEmail(me.email)) {
      deny(403, 'No puedes administrar usuarios.');
    }
    const items = (await UserModel.listPanelAdmins([me.email])).filter(isPanelAdminUser).map(publicAdmin);
    items.sort(
      (a, b) =>
        String(a.nombreCompleto || '').localeCompare(String(b.nombreCompleto || ''), 'es') ||
        String(a.email || '').localeCompare(String(b.email || ''))
    );
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.status(200).json({ success: true, catalogo: ECF_PERM_CATALOG, items });
  } catch (err) {
    sendError(res, err);
  }
}

export async function putAdminEcf(req, res) {
  try {
    const me = await requirePanelAdmin(req);
    if (!hasPermiso(me.permisosEcf, 'usuarios') && !isAuditorEmail(me.email)) {
      deny(403, 'No puedes administrar usuarios.');
    }
    const id = String(req.params.id || '').trim();
    if (!id) deny(400, 'id requerido');
    let target = await UserModel.getById(id);
    if (!target) {
      const items = await allUsers();
      target = items.find((u) => String(u.id) === id) || null;
    }
    if (!target) deny(404, 'Usuario no encontrado');
    const body = req.body || {};
    const patch = {};
    if (body.permisosEcf && typeof body.permisosEcf === 'object') {
      patch.permisosEcf = normalizePermisosEcf(body.permisosEcf);
    }
    if (body.activo !== undefined) patch.activo = body.activo !== false && body.activo !== 'false';
    if (body.rol === 'admin' || body.rol === 'usuario') patch.rol = body.rol;
    if (esCuentaProtegida(target) && patch.activo === false) {
      deny(400, 'Esa cuenta no se puede inactivar.');
    }
    if (esCuentaProtegida(target) && patch.permisosEcf && patch.permisosEcf.usuarios === false) {
      deny(400, 'Esa cuenta no puede perder el permiso de administrar usuarios.');
    }
    if (esCuentaProtegida(target) && patch.permisosEcf) {
      patch.permisosEcf.usuarios = true;
    }

    const nextPerm = patch.permisosEcf || normalizePermisosEcf(target.permisosEcf);
    const nextActivo = patch.activo !== undefined ? patch.activo : target.activo !== false;
    const nextRol = patch.rol || target.rol;
    const stillAdmin =
      nextActivo &&
      (nextRol === 'admin' || nextRol === 'administrador' || isAuditorEmail(target.email));
    if (String(target.id) === String(me.id) || String(target.email).toLowerCase() === me.email) {
      if (!stillAdmin || nextPerm.usuarios === false) {
        deny(400, 'No puedes quitarte a ti mismo el acceso de administración.');
      }
    }

    const prevPerm = normalizePermisosEcf(target.permisosEcf);
    const activoAntes = target.activo !== false;
    const rolAntes = String(target.rol || '').trim();
    const updated = await UserModel.updateById(id, patch);
    invalidateAdminsCache();
    const pub = publicAdmin(updated);
    const resPerm = resumenPermisos(nextPerm);
    const diff = diffPermisosEcf(prevPerm, nextPerm);
    await logAdminAccion(req, {
      accion: 'Guardar permisos',
      resultado: 'ok',
      statusCode: 200,
      payload: {
        hechoPorEmail: me.email,
        hechoPorNombre: me.nombreCompleto || me.nombre,
        usuarioAfectado: pub.nombreCompleto || pub.email,
        email: pub.email,
        nombre: pub.nombreCompleto,
        activoAntes,
        activoDespues: pub.activo,
        rolAntes,
        rolDespues: pub.rol,
        permisosActivados: diff.activados,
        permisosDesactivados: diff.desactivados,
        permisosDados: resPerm.dados,
        permisosQuitados: resPerm.quitados,
        resumen:
          `${me.nombreCompleto || me.email} guardó permisos de ${pub.nombreCompleto || pub.email}` +
          (diff.activados.length ? `. Activó: ${diff.activados.join(', ')}` : '') +
          (diff.desactivados.length ? `. Quitó: ${diff.desactivados.join(', ')}` : '') +
          (activoAntes !== pub.activo ? `. Cuenta ${pub.activo ? 'activada' : 'inactivada'}` : '') +
          (!diff.activados.length && !diff.desactivados.length && activoAntes === pub.activo
            ? '. Sin cambios de permisos.'
            : '')
      },
      respuesta: { success: true, email: pub.email }
    });
    res.status(200).json({ success: true, user: pub });
  } catch (err) {
    await logAdminAccion(req, {
      accion: 'Guardar permisos',
      resultado: Number(err?.status) === 400 ? 'validacion' : 'error',
      statusCode: Number(err?.status) || 500,
      motivo: err?.message || 'No se pudieron guardar los permisos.',
      payload: { id: String(req.params.id || '') }
    });
    sendError(res, err);
  }
}

export async function postAdminEcf(req, res) {
  try {
    const me = await requirePanelAdmin(req);
    if (!hasPermiso(me.permisosEcf, 'usuarios') && !isAuditorEmail(me.email)) {
      deny(403, 'No puedes crear usuarios.');
    }
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const password = passwordSinEspacios(body.password);
    const nombre = String(body.nombre || '').trim();
    const apellido = String(body.apellido || '').trim();
    const telefono = String(body.telefono || '').replace(/\D/g, '').slice(0, 10);
    if (!email || !email.includes('@')) deny(400, 'Escribe un correo válido.');
    if (nombre.length < 2) deny(400, 'Escribe el nombre.');

    const existing = await UserModel.getByEmail(email);
    if (existing) {
      const rol = String(existing.rol || '').toLowerCase();
      if (rol === 'admin' || rol === 'administrador') {
        deny(409, 'Ese correo ya es administrador.');
      }
      const updated = await UserModel.updateById(existing.id, {
        rol: 'admin',
        activo: true,
        permisosEcf: normalizePermisosEcf(body.permisosEcf)
      });
      invalidateAdminsCache();
      const pub = publicAdmin(updated);
      const msg = `Se dio acceso de admin a ${email}. Sigue usando su contraseña actual.`;
      await logAdminAccion(req, {
        accion: 'Crear usuario',
        resultado: 'ok',
        statusCode: 200,
        payload: {
          hechoPorEmail: me.email,
          hechoPorNombre: me.nombreCompleto || me.nombre,
          usuarioAfectado: pub.nombreCompleto || pub.email,
          email: pub.email,
          nombre: pub.nombreCompleto,
          telefono: pub.telefono || '',
          promovido: true,
          permisosDados: resumenPermisos(pub.permisosEcf).dados,
          resumen: `${me.nombreCompleto || me.email} dio acceso de admin a ${pub.nombreCompleto || pub.email} (${pub.email}). Conserva su contraseña actual.`
        },
        respuesta: { success: true, message: msg }
      });
      res.status(200).json({
        success: true,
        promoted: true,
        message: msg,
        user: pub
      });
      return;
    }

    const passErr = validarPasswordAdmin(password);
    if (passErr) deny(400, passErr);

    const created = await UserModel.createAdmin({
      email,
      password,
      nombre,
      apellido,
      telefono,
      permisosEcf: normalizePermisosEcf(body.permisosEcf)
    });
    invalidateAdminsCache();
    const pub = publicAdmin(created);
    const msg = `Se creó el usuario ${email}. Ya puede entrar a este panel.`;
    await logAdminAccion(req, {
      accion: 'Crear usuario',
      resultado: 'ok',
      statusCode: 201,
      payload: {
        hechoPorEmail: me.email,
        hechoPorNombre: me.nombreCompleto || me.nombre,
        usuarioAfectado: pub.nombreCompleto || pub.email,
        email: pub.email,
        nombre: pub.nombreCompleto,
        apellido,
        telefono: pub.telefono || '',
        promovido: false,
        permisosDados: resumenPermisos(pub.permisosEcf).dados,
        resumen: `${me.nombreCompleto || me.email} creó el usuario ${pub.nombreCompleto || pub.email} (${pub.email}).`
      },
      respuesta: { success: true, message: msg }
    });
    res.status(201).json({
      success: true,
      message: msg,
      user: pub
    });
  } catch (err) {
    await logAdminAccion(req, {
      accion: 'Crear usuario',
      resultado: Number(err?.status) === 400 || Number(err?.status) === 409 ? 'validacion' : 'error',
      statusCode: Number(err?.status) || 500,
      motivo: err?.message || 'No se pudo crear el usuario.',
      payload: { email: String(req.body?.email || '').trim().toLowerCase() }
    });
    sendError(res, err);
  }
}

export async function deleteAdminEcf(req, res) {
  try {
    const me = await requirePanelAdmin(req);
    if (!hasPermiso(me.permisosEcf, 'usuarios') && !isAuditorEmail(me.email)) {
      deny(403, 'No puedes eliminar usuarios.');
    }
    const id = String(req.params.id || '').trim();
    if (!id) deny(400, 'id requerido');
    let target = await UserModel.getById(id);
    if (!target) {
      const items = await allUsers();
      target = items.find((u) => String(u.id) === id) || null;
    }
    if (!target) deny(404, 'Usuario no encontrado');
    if (esCuentaProtegida(target)) deny(400, 'Esa cuenta no se puede eliminar.');
    if (String(target.id) === String(me.id) || String(target.email || '').toLowerCase() === me.email) {
      deny(400, 'No puedes eliminarte a ti mismo.');
    }
    const pub = publicAdmin(target);
    await UserModel.deleteById(target.id);
    invalidateAdminsCache();
    await logAdminAccion(req, {
      accion: 'Eliminar usuario',
      resultado: 'ok',
      statusCode: 200,
      payload: {
        hechoPorEmail: me.email,
        hechoPorNombre: me.nombreCompleto || me.nombre,
        usuarioAfectado: pub.nombreCompleto || pub.email,
        email: pub.email,
        nombre: pub.nombreCompleto,
        eliminadoPorEmail: me.email,
        eliminadoPorNombre: me.nombreCompleto || me.nombre,
        resumen: `${me.nombreCompleto || me.email} eliminó a ${pub.nombreCompleto || pub.email} (${pub.email}).`
      }
    });
    res.status(200).json({
      success: true,
      message: `Se eliminó a ${pub.nombreCompleto || pub.email}.`,
      user: pub
    });
  } catch (err) {
    await logAdminAccion(req, {
      accion: 'Eliminar usuario',
      resultado: Number(err?.status) === 400 ? 'validacion' : 'error',
      statusCode: Number(err?.status) || 500,
      motivo: err?.message || 'No se pudo eliminar el usuario.',
      payload: { id: String(req.params.id || '') }
    });
    sendError(res, err);
  }
}
