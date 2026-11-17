import {
  writeAudit,
  listAudit,
  isAuditorEmail,
  userFromReq,
  clientIp,
  navegadorDe,
  lockStatus,
  registerLoginFail,
  registerLoginOk
} from '../services/auditoriaEcf.service.js';
import { permisosDeReq } from './adminsEcf.controller.js';
import { hasPermiso } from '../domain/ecfPermisos.js';

function sendError(res, err) {
  const status = Number(err?.status) || 500;
  res.status(status).json({
    success: false,
    message: err?.message || 'Error de auditoría'
  });
}

function metaFromReq(req) {
  const ua = String(req.headers['user-agent'] || '');
  const client = req.body?.client && typeof req.body.client === 'object' ? req.body.client : {};
  return {
    ip: clientIp(req),
    userAgent: ua,
    navegador: navegadorDe(ua),
    pantalla: client.pantalla || null,
    idioma: client.idioma || req.headers['accept-language'] || '',
    zona: client.zona || '',
    loginCanal: String(req.body?.loginCanal || req.body?.canal || 'panel')
  };
}

export async function getAuditoria(req, res) {
  try {
    const user = userFromReq(req);
    const perms = await permisosDeReq(req);
    if (!isAuditorEmail(user.email) && !hasPermiso(perms, 'auditoria')) {
      const err = new Error('No autorizado para ver el registro de auditoría.');
      err.status = 403;
      throw err;
    }
    const result = await listAudit({
      limit: req.query.limit,
      canal: req.query.canal,
      q: req.query.q
    });
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('auditoria listar:', err?.message || err);
    sendError(res, err);
  }
}

export async function postAuditoriaEvento(req, res) {
  try {
    const user = userFromReq(req);
    if (!user.email) {
      const err = new Error('Sesión requerida.');
      err.status = 401;
      throw err;
    }
    const body = req.body || {};
    const meta = metaFromReq(req);
    const rec = await writeAudit({
      canal: String(body.canal || 'panel'),
      accion: body.accion || 'evento',
      resultado: body.resultado || 'ok',
      statusCode: body.statusCode ?? 200,
      usuarioEmail: user.email,
      usuarioNombre: body.usuarioNombre || user.nombre,
      userId: user.userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      navegador: meta.navegador,
      method: body.method || 'PANEL',
      path: body.path || '/admin/comprobantes',
      query: body.query || null,
      payload: body.payload || null,
      respuesta: body.respuesta || null,
      motivo: body.motivo || '',
      loginCanal: meta.loginCanal,
      extra: {
        pantalla: meta.pantalla,
        idioma: meta.idioma,
        zona: meta.zona,
        ...(body.extra && typeof body.extra === 'object' ? body.extra : {})
      }
    });
    res.status(200).json({ success: true, id: rec.id });
  } catch (err) {
    console.error('auditoria evento:', err?.message || err);
    sendError(res, err);
  }
}

export async function getLoginLock(req, res) {
  try {
    const email = String(req.query.email || req.body?.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(200).json({ success: true, locked: false });
    }
    const st = await lockStatus(email);
    if (!st.locked) {
      return res.status(200).json({ success: true, locked: false, remainingSeg: 0 });
    }
    res.status(200).json({
      success: true,
      locked: true,
      remainingSeg: st.remainingSeg,
      remainingMs: st.remainingMs,
      lockMinutos: st.lockMinutos,
      message: `Login inhabilitado ${st.lockMinutos || 5} minutos por 3 intentos fallidos.`
    });
  } catch (err) {
    console.error('auditoria lock:', err?.message || err);
    sendError(res, err);
  }
}

export async function postAuditoriaSesion(req, res) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const ok = Boolean(req.body?.ok);
    const meta = metaFromReq(req);
    const user = userFromReq(req);
    if (!email) {
      const err = new Error('Indica el correo.');
      err.status = 400;
      throw err;
    }
    if (ok) {
      await registerLoginOk(email);
      await writeAudit({
        canal: 'panel',
        accion: 'login',
        resultado: 'ok',
        statusCode: 200,
        usuarioEmail: email,
        usuarioNombre: req.body?.usuarioNombre || user.nombre,
        userId: user.userId,
        ip: meta.ip,
        userAgent: meta.userAgent,
        navegador: meta.navegador,
        motivo: '',
        loginCanal: meta.loginCanal,
        extra: {
          pantalla: meta.pantalla,
          idioma: meta.idioma,
          zona: meta.zona
        }
      });
      return res.status(200).json({ success: true, locked: false });
    }
    const lockedNow = await lockStatus(email);
    if (lockedNow.locked) {
      return res.status(429).json({
        success: false,
        locked: true,
        remainingSeg: lockedNow.remainingSeg,
        remainingMs: lockedNow.remainingMs,
        lockMinutos: lockedNow.lockMinutos
      });
    }
    const fail = await registerLoginFail(email, {
      ...meta,
      motivo: String(req.body?.motivo || 'Correo o contraseña incorrectos').slice(0, 400),
      usuarioNombre: req.body?.usuarioNombre || ''
    });
    if (fail.locked) {
      return res.status(429).json({
        success: false,
        locked: true,
        remainingMs: fail.remainingMs,
        remainingSeg: fail.remainingSeg,
        lockMinutos: fail.lockMinutos,
        message: `Login inhabilitado ${fail.lockMinutos} minutos por 3 intentos fallidos.`
      });
    }
    res.status(200).json({ success: true, locked: false });
  } catch (err) {
    console.error('auditoria sesion:', err?.message || err);
    sendError(res, err);
  }
}
