import UserModel from '../models/user.model.js';
import PanelInviteModel, { inviteTtlMs } from '../models/panelInvite.model.js';
import { emptyPermisosEcf, hasPermiso } from '../domain/ecfPermisos.js';
import { validarPasswordAdmin, passwordSinEspacios } from '../domain/passwordAdmin.js';
import { requirePanelAdmin, invalidateAdminsCache, publicAdmin } from './adminsEcf.controller.js';
import { writeAudit, userFromReq, clientIp, navegadorDe, isAuditorEmail } from '../services/auditoriaEcf.service.js';

function sendError(res, err) {
  const status = Number(err?.status) || 500;
  res.status(status).json({ success: false, message: err?.message || 'Error de invitación' });
}

function deny(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function logPanel(req, entry) {
  const user = userFromReq(req);
  const ua = String(req.headers['user-agent'] || '');
  return writeAudit({
    canal: 'panel',
    accion: entry.accion,
    resultado: entry.resultado || 'ok',
    motivo: entry.motivo || '',
    payload: entry.payload || null,
    statusCode: entry.statusCode ?? 200,
    usuarioEmail: user.email || entry.usuarioEmail || '',
    usuarioNombre: user.nombre || entry.usuarioNombre || '',
    userId: user.userId,
    ip: clientIp(req),
    userAgent: ua,
    navegador: navegadorDe(ua),
    method: req.method,
    path: String(req.originalUrl || req.path || '').split('?')[0]
  }).catch((e) => console.error('auditoria invite:', e?.message || e));
}

function publicNotif(n) {
  return {
    id: n.id,
    tipo: n.tipo,
    createdAt: n.createdAt,
    visto: Boolean(n.visto),
    vistoAt: n.vistoAt || null,
    vistoPorEmail: n.vistoPorEmail || null,
    usuarioId: n.usuarioId || '',
    usuarioEmail: n.usuarioEmail,
    usuarioNombre: n.usuarioNombre,
    mensaje: n.mensaje || ''
  };
}

export async function postInviteLink(req, res) {
  try {
    const me = await requirePanelAdmin(req);
    if (!hasPermiso(me.permisosEcf, 'usuarios') && !isAuditorEmail(me.email)) {
      deny(403, 'No puedes generar enlaces de alta.');
    }
    const horas = Number(req.body?.horas);
    const ttlMs =
      Number.isFinite(horas) && horas >= 1 && horas <= 72 ? Math.round(horas * 60 * 60 * 1000) : inviteTtlMs();
    const invite = await PanelInviteModel.createInvite({
      createdByEmail: me.email,
      createdByNombre: me.nombreCompleto || me.nombre,
      ttlMs
    });
    const mins = Math.max(1, Math.round((new Date(invite.expiresAt).getTime() - Date.now()) / 60000));
    const labelHoras = mins >= 60 ? `${Math.round(mins / 60)} h` : `${mins} min`;
    await logPanel(req, {
      accion: 'Generar enlace de alta',
      payload: {
        creadoPorEmail: me.email,
        creadoPorNombre: me.nombreCompleto || me.nombre,
        expiraMin: mins,
        expiresAt: invite.expiresAt,
        tokenTail: String(invite.token).slice(-6),
        resumen: `${me.nombreCompleto || me.email} generó un enlace de cuenta (${labelHoras}). Caduca ${invite.expiresAt}.`
      }
    });
    res.status(201).json({
      success: true,
      token: invite.token,
      expiresAt: invite.expiresAt,
      remainingSeg: PanelInviteModel.remainingSeg(invite.expiresAt),
      expiraMinutos: mins,
      invite: PanelInviteModel.publicInvite(invite, { includeToken: true }),
      message: `Enlace listo. Expira en ${mins} minutos.`
    });
  } catch (err) {
    sendError(res, err);
  }
}

export async function getInviteLink(req, res) {
  try {
    const st = PanelInviteModel.inviteStatus(await PanelInviteModel.getInvite(req.params.token));
    if (!st.ok) deny(st.code, st.message);
    res.status(200).json({
      success: true,
      expiresAt: st.item.expiresAt,
      remainingSeg: PanelInviteModel.remainingSeg(st.item.expiresAt),
      expiraMinutos: Math.max(1, Math.round(PanelInviteModel.remainingSeg(st.item.expiresAt) / 60))
    });
  } catch (err) {
    sendError(res, err);
  }
}

export async function postInviteRegister(req, res) {
  try {
    const token = String(req.params.token || '').trim();
    const st = PanelInviteModel.inviteStatus(await PanelInviteModel.getInvite(token));
    if (!st.ok) deny(st.code, st.message);
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const password = passwordSinEspacios(body.password);
    const nombre = String(body.nombre || '').trim();
    const apellido = String(body.apellido || '').trim();
    const telefono = String(body.telefono || '').replace(/\D/g, '').slice(0, 10);
    if (!email || !email.includes('@')) deny(400, 'Escribe un correo válido.');
    if (nombre.length < 2) deny(400, 'Escribe el nombre.');
    const passErr = validarPasswordAdmin(password);
    if (passErr) deny(400, passErr);
    const existing = await UserModel.getByEmail(email);
    if (existing) deny(409, 'Ese correo ya tiene cuenta. Entra con tu contraseña.');
    const created = await UserModel.createAdmin({
      email,
      password,
      nombre,
      apellido,
      telefono,
      permisosEcf: emptyPermisosEcf()
    });
    const nombreCompleto = `${nombre} ${apellido}`.trim();
    const ip = clientIp(req);
    const invite = await PanelInviteModel.markInviteUsed(token, {
      email,
      nombre: nombreCompleto,
      userId: created.id,
      ip
    });
    invalidateAdminsCache();
    await PanelInviteModel.putNotif({
      tipo: 'alta_enlace',
      usuarioId: created.id,
      usuarioEmail: email,
      usuarioNombre: nombreCompleto,
      mensaje:
        `${nombreCompleto} (${email}) creó su cuenta con el enlace de ` +
        `${invite?.createdByNombre || invite?.createdByEmail || 'un administrador'}` +
        `${invite?.createdByEmail ? ` (${invite.createdByEmail})` : ''}.`
    });
    await logPanel(req, {
      accion: 'Alta por enlace',
      usuarioEmail: email,
      usuarioNombre: nombreCompleto,
      payload: {
        email,
        nombre: nombreCompleto,
        usuarioId: created.id,
        usadoPorEmail: email,
        usadoPorNombre: nombreCompleto,
        usadoPorIp: ip,
        enlaceCreadoPorEmail: invite?.createdByEmail || '',
        enlaceCreadoPorNombre: invite?.createdByNombre || '',
        tokenTail: String(token).slice(-6),
        expiresAt: invite?.expiresAt || '',
        resumen:
          `${nombreCompleto} (${email}) creó su cuenta con el enlace de ` +
          `${invite?.createdByNombre || invite?.createdByEmail || 'un administrador'}` +
          `${invite?.createdByEmail ? ` (${invite.createdByEmail})` : ''}.`
      }
    });
    res.status(201).json({
      success: true,
      message: 'Cuenta creada. Ya puedes entrar. Un administrador te asignará permisos cuando se lo pidas.',
      user: publicAdmin(created)
    });
  } catch (err) {
    sendError(res, err);
  }
}

export async function listInvitesEcf(req, res) {
  try {
    const me = await requirePanelAdmin(req);
    if (!hasPermiso(me.permisosEcf, 'usuarios') && !isAuditorEmail(me.email)) {
      deny(403, 'No puedes ver enlaces de alta.');
    }
    const items = (await PanelInviteModel.listInvites({ limit: 20 })).map((x) =>
      PanelInviteModel.publicInvite(x)
    );
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.status(200).json({ success: true, items });
  } catch (err) {
    sendError(res, err);
  }
}

export async function postSolicitarPermisos(req, res) {
  try {
    const me = await requirePanelAdmin(req);
    const pending = await PanelInviteModel.pendingByEmail(me.email);
    if (pending) {
      return res.status(200).json({
        success: true,
        already: true,
        message: 'Ya enviaste una solicitud. Espera a que un administrador la revise.',
        notificacion: publicNotif(pending)
      });
    }
    const nombre = me.nombreCompleto || [me.nombre, me.apellido].filter(Boolean).join(' ') || me.email;
    const rec = await PanelInviteModel.putNotif({
      tipo: 'solicitud_permisos',
      usuarioId: me.id,
      usuarioEmail: me.email,
      usuarioNombre: nombre,
      mensaje: `${nombre} (${me.email}) solicita permisos para usar el panel.`
    });
    await logPanel(req, {
      accion: 'Solicitar permisos',
      payload: {
        email: me.email,
        nombre,
        resumen: `${nombre} (${me.email}) solicitó permisos para usar el panel.`
      }
    });
    res.status(201).json({
      success: true,
      message: 'Solicitud enviada. Un administrador la verá en Avisos.',
      notificacion: publicNotif(rec)
    });
  } catch (err) {
    sendError(res, err);
  }
}

export async function getNotificaciones(req, res) {
  try {
    const me = await requirePanelAdmin(req);
    if (!hasPermiso(me.permisosEcf, 'usuarios') && !isAuditorEmail(me.email)) {
      deny(403, 'No puedes ver avisos de usuarios.');
    }
    const items = (await PanelInviteModel.listNotifs({ limit: 80 })).map(publicNotif);
    const pendientes = items.filter((x) => !x.visto).length;
    res.status(200).json({ success: true, pendientes, items });
  } catch (err) {
    sendError(res, err);
  }
}

export async function postNotificacionVisto(req, res) {
  try {
    const me = await requirePanelAdmin(req);
    if (!hasPermiso(me.permisosEcf, 'usuarios') && !isAuditorEmail(me.email)) {
      deny(403, 'No puedes gestionar avisos.');
    }
    const updated = await PanelInviteModel.markVisto(req.params.id, me.email);
    if (!updated) deny(404, 'No se encontró ese aviso.');
    await logPanel(req, {
      accion: 'Ver aviso',
      payload: {
        id: updated.id,
        usuarioEmail: updated.usuarioEmail,
        usuarioNombre: updated.usuarioNombre || '',
        vistoPorEmail: me.email,
        vistoPorNombre: me.nombreCompleto || me.nombre,
        resumen: `${me.nombreCompleto || me.email} vio el aviso de ${updated.usuarioNombre || updated.usuarioEmail}.`
      }
    });
    res.status(200).json({ success: true, item: publicNotif(updated) });
  } catch (err) {
    sendError(res, err);
  }
}

export async function deleteNotificaciones(req, res) {
  try {
    const me = await requirePanelAdmin(req);
    if (!hasPermiso(me.permisosEcf, 'usuarios') && !isAuditorEmail(me.email)) {
      deny(403, 'No puedes limpiar avisos.');
    }
    const borrados = await PanelInviteModel.clearAllNotifs();
    await logPanel(req, {
      accion: 'Limpiar avisos',
      payload: {
        borrados,
        limpiadoPorEmail: me.email,
        limpiadoPorNombre: me.nombreCompleto || me.nombre,
        resumen: `${me.nombreCompleto || me.email} borró ${borrados} aviso${borrados === 1 ? '' : 's'}.`
      }
    });
    res.status(200).json({
      success: true,
      borrados,
      message: borrados
        ? `Se borraron ${borrados} aviso${borrados === 1 ? '' : 's'}.`
        : 'No había avisos que borrar.'
    });
  } catch (err) {
    sendError(res, err);
  }
}
