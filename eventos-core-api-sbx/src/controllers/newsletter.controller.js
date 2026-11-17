import NewsletterModel, { emailValido } from '../models/newsletter.model.js';
import { sendCampaignToList } from '../services/newsletterMail.service.js';
import { requirePanelAdmin } from './adminsEcf.controller.js';
import { writeAudit, userFromReq, clientIp } from '../services/auditoriaEcf.service.js';

function sendError(res, err) {
  const status = Number(err?.status) || 500;
  res.status(status).json({ success: false, message: err?.message || 'Error de lista de difusión' });
}

function deny(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

export function normalizeHttps(raw) {
  let u = String(raw || '').trim();
  if (!u) return '';
  if (/^https:\/\//i.test(u)) return u;
  if (/^http:\/\//i.test(u)) return 'https://' + u.slice(7);
  if (u.startsWith('//')) return 'https:' + u;
  return 'https://' + u.replace(/^\/+/, '');
}

const NL_COOKIE = 'bh_nl_sub';
const NL_COOKIE_MAX = 365 * 24 * 60 * 60 * 1000;

function parseNlCookie(req) {
  const raw = String(req.headers.cookie || '');
  const parts = raw.split(';');
  for (const part of parts) {
    const p = part.trim();
    if (!p.startsWith(`${NL_COOKIE}=`)) continue;
    try {
      const o = JSON.parse(decodeURIComponent(p.slice(NL_COOKIE.length + 1)));
      if (o && o.email) {
        return { email: String(o.email).trim().toLowerCase(), token: String(o.token || '') };
      }
    } catch {
      return null;
    }
  }
  return null;
}

function setNlCookie(res, sub) {
  const val = encodeURIComponent(JSON.stringify({
    email: String(sub.email || '').trim().toLowerCase(),
    token: String(sub.token || '')
  }));
  res.append(
    'Set-Cookie',
    `${NL_COOKIE}=${val}; Path=/; Max-Age=${Math.floor(NL_COOKIE_MAX / 1000)}; Secure; SameSite=None`
  );
}

function clearNlCookie(res) {
  res.append(
    'Set-Cookie',
    `${NL_COOKIE}=; Path=/; Max-Age=0; Secure; SameSite=None`
  );
}

function origenDe(req) {
  const body = String(req.body?.origen || '').trim();
  if (body) return body.slice(0, 120);
  try {
    return new URL(String(req.headers.origin || req.headers.referer || '')).hostname.slice(0, 120);
  } catch {
    return '';
  }
}

export async function postSubscribe(req, res) {
  try {
    if (String(req.body?.company || req.body?.website || '').trim()) {
      return res.status(200).json({ success: true });
    }
    const email = String(req.body?.email || '').trim();
    if (!emailValido(email)) deny(400, 'Escribe un correo válido.');
    const r = await NewsletterModel.upsertSubscriber({
      email,
      origen: origenDe(req),
      ip: clientIp(req),
      userAgent: String(req.headers['user-agent'] || '')
    });
    if (!r.ok) deny(r.code || 400, r.message);
    const emailOut = r.item?.email || email.toLowerCase();
    const tokenOut = r.item?.unsubToken || '';
    setNlCookie(res, { email: emailOut, token: tokenOut });
    res.status(200).json({
      success: true,
      already: Boolean(r.already),
      email: emailOut,
      unsubToken: tokenOut
    });
  } catch (err) {
    sendError(res, err);
  }
}

export async function getBaja(req, res) {
  try {
    const email = String(req.query.e || req.query.email || '').trim();
    const token = String(req.query.t || req.query.token || '').trim();
    const r = await NewsletterModel.unsubscribe({ email, token, requireToken: true });
    if (!r.ok) deny(r.code || 400, r.message);
    const wantsHtml = String(req.headers.accept || '').includes('text/html');
    if (wantsHtml) {
      res
        .status(200)
        .type('html')
        .send(
          `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>Baja</title></head><body style="font-family:Arial;padding:40px;text-align:center;"><p>Listo. Ya no te enviaremos ofertas a ${String(email).replace(/</g, '')}.</p><p><a href="https://buenohotel.com/">Volver a BUENOHOTEL</a></p></body></html>`
        );
      return;
    }
    res.status(200).json({ success: true, already: Boolean(r.already) });
  } catch (err) {
    sendError(res, err);
  }
}

export async function postUnsubscribe(req, res) {
  try {
    const email = String(req.body?.email || req.query?.e || '').trim();
    const token = String(req.body?.token || req.body?.t || req.query?.t || '').trim();
    const r = await NewsletterModel.unsubscribe({ email, token, requireToken: false });
    if (!r.ok) deny(r.code || 400, r.message);
    clearNlCookie(res);
    res.status(200).json({ success: true, already: Boolean(r.already) });
  } catch (err) {
    sendError(res, err);
  }
}

/** Cookie cross-sitio (SameSite=None) para Eventos/Tours/Ecommerce y buenohotel.com. */
export async function getNewsletterMe(req, res) {
  try {
    const sub = parseNlCookie(req);
    if (!sub?.email) {
      return res.status(200).json({ success: true, subscribed: false });
    }
    const item = await NewsletterModel.getByEmail(sub.email);
    if (!item || item.activo === false) {
      clearNlCookie(res);
      return res.status(200).json({ success: true, subscribed: false });
    }
    setNlCookie(res, { email: item.email, token: item.unsubToken || sub.token || '' });
    res.status(200).json({
      success: true,
      subscribed: true,
      email: item.email,
      unsubToken: item.unsubToken || ''
    });
  } catch (err) {
    sendError(res, err);
  }
}

/** Publica en la cookie de API una suscripción ya guardada en este navegador. */
export async function postNewsletterRemember(req, res) {
  try {
    const email = String(req.body?.email || '').trim();
    const token = String(req.body?.token || '').trim();
    if (!emailValido(email)) deny(400, 'Escribe un correo válido.');
    const item = await NewsletterModel.getByEmail(email);
    if (!item || item.activo === false) {
      clearNlCookie(res);
      return res.status(200).json({ success: true, subscribed: false });
    }
    const need = String(item.unsubToken || '').trim();
    if (need && token && token !== need) {
      deny(400, 'No se pudo recordar esa suscripción.');
    }
    setNlCookie(res, { email: item.email, token: item.unsubToken || token });
    res.status(200).json({
      success: true,
      subscribed: true,
      email: item.email,
      unsubToken: item.unsubToken || ''
    });
  } catch (err) {
    sendError(res, err);
  }
}

export async function getSubscribers(req, res) {
  try {
    await requirePanelAdmin(req);
    const all = await NewsletterModel.listAll();
    const activos = all.filter((x) => x.activo !== false);
    res.json({
      success: true,
      total: all.length,
      activos: activos.length,
      subscribers: all.map((x) => NewsletterModel.publicSub(x))
    });
  } catch (err) {
    sendError(res, err);
  }
}

export async function postReactivate(req, res) {
  try {
    await requirePanelAdmin(req);
    const email = String(req.body?.email || '').trim();
    const r = await NewsletterModel.reactivate(email);
    if (!r.ok) deny(r.code || 400, r.message);
    res.json({ success: true, subscriber: NewsletterModel.publicSub(r.item) });
  } catch (err) {
    sendError(res, err);
  }
}

export async function postDeactivate(req, res) {
  try {
    await requirePanelAdmin(req);
    const email = String(req.body?.email || '').trim();
    const r = await NewsletterModel.deactivate(email);
    if (!r.ok) deny(r.code || 400, r.message);
    res.json({ success: true, subscriber: NewsletterModel.publicSub(r.item) });
  } catch (err) {
    sendError(res, err);
  }
}

export async function postRemoveSubscriber(req, res) {
  try {
    await requirePanelAdmin(req);
    const email = String(req.body?.email || req.query?.email || '').trim();
    const r = await NewsletterModel.remove(email);
    if (!r.ok) deny(r.code || 400, r.message);
    res.json({ success: true, email: r.item?.email || email.toLowerCase() });
  } catch (err) {
    sendError(res, err);
  }
}

export async function getCampaigns(req, res) {
  try {
    await requirePanelAdmin(req);
    const items = await NewsletterModel.listCampaigns();
    res.json({ success: true, campaigns: items.map((x) => NewsletterModel.publicCampaign(x)) });
  } catch (err) {
    sendError(res, err);
  }
}

export async function postCampaign(req, res) {
  try {
    const me = await requirePanelAdmin(req);
    const asunto = String(req.body?.asunto || '').trim();
    const cuerpo = String(req.body?.cuerpo || req.body?.mensaje || '').trim();
    const ctaUrl = normalizeHttps(req.body?.ctaUrl || '');
    const ctaLabel = String(req.body?.ctaLabel || 'Ver oferta').trim();
    const prueba = Boolean(req.body?.prueba);
    if (asunto.length < 4 || asunto.length > 120) deny(400, 'El asunto debe tener entre 4 y 120 caracteres.');
    if (cuerpo.length < 10 || cuerpo.length > 8000) deny(400, 'El mensaje debe tener entre 10 y 8000 caracteres.');
    if (ctaUrl && !/^https:\/\/[^\s]+/i.test(ctaUrl)) deny(400, 'El enlace del botón no es válido.');

    const all = await NewsletterModel.listAll();
    let recipients = all.filter(
      (x) =>
        x.activo !== false &&
        x.email &&
        x.bounceKind !== 'bounce' &&
        x.bounceKind !== 'complaint'
    );
    if (prueba) {
      recipients = [
        {
          email: me.email,
          unsubToken: 'preview'
        }
      ];
    }
    if (!recipients.length) deny(400, 'No hay correos activos en la lista.');

    const result = await sendCampaignToList({
      asunto,
      cuerpo,
      ctaUrl,
      ctaLabel,
      recipients
    });

    const saved = await NewsletterModel.putCampaign({
      asunto,
      cuerpo,
      ctaUrl,
      ctaLabel,
      prueba,
      total: recipients.length,
      enviados: result.enviados,
      fallidos: result.fallidos,
      entregados: 0,
      rebotes: 0,
      quejas: 0,
      recipients: result.results || [],
      errors: result.errors,
      createdByEmail: me.email,
      createdByNombre: me.nombreCompleto || me.nombre || ''
    });

    writeAudit({
      canal: 'panel',
      accion: prueba ? 'Prueba lista de difusión' : 'Envío lista de difusión',
      resultado: result.fallidos && !result.enviados ? 'error' : 'ok',
      payload: {
        asunto,
        prueba,
        total: recipients.length,
        enviados: result.enviados,
        fallidos: result.fallidos
      },
      usuarioEmail: me.email,
      usuarioNombre: me.nombreCompleto || me.nombre || '',
      method: 'POST',
      path: '/api/newsletter/campaigns'
    }).catch(() => {});

    res.status(201).json({
      success: true,
      campaign: NewsletterModel.publicCampaign(saved),
      enviados: result.enviados,
      fallidos: result.fallidos,
      errors: result.errors
    });
  } catch (err) {
    sendError(res, err);
  }
}

function parseSnsBody(req) {
  let b = req.body;
  if (Buffer.isBuffer(b)) b = b.toString('utf8');
  if (typeof b === 'string') {
    const s = b.trim();
    if (!s) return null;
    try {
      b = JSON.parse(s);
    } catch {
      return null;
    }
  }
  if (!b || typeof b !== 'object') return null;
  if (typeof b.Message === 'string') {
    try {
      b.ses = JSON.parse(b.Message);
    } catch {
      b.ses = null;
    }
  } else if (b.Message && typeof b.Message === 'object') {
    b.ses = b.Message;
  } else {
    b.ses = b.notificationType || b.eventType ? b : null;
  }
  return b;
}

function sesEventParts(inner) {
  if (!inner || typeof inner !== 'object') return [];
  const type = String(inner.notificationType || inner.eventType || '').toLowerCase();
  const mail = inner.mail || {};
  const messageId = String(mail.messageId || inner.mail?.messageId || '').trim();
  const out = [];
  if (type === 'bounce') {
    const bounce = inner.bounce || {};
    const permanent = String(bounce.bounceType || '').toLowerCase() === 'permanent';
    const recs = bounce.bouncedRecipients || [];
    for (const r of recs) {
      out.push({
        email: r.emailAddress,
        messageId,
        status: 'rebote',
        kind: permanent ? 'bounce' : 'soft',
        motivo: r.diagnosticCode || bounce.bounceType || 'Correo no disponible'
      });
    }
  } else if (type === 'complaint') {
    const recs = inner.complaint?.complainedRecipients || [];
    for (const r of recs) {
      out.push({
        email: r.emailAddress,
        messageId,
        status: 'queja',
        kind: 'complaint',
        motivo: 'Marcado como no deseado'
      });
    }
  } else if (type === 'delivery') {
    const recs = inner.delivery?.recipients || mail.destination || [];
    for (const addr of recs) {
      out.push({
        email: typeof addr === 'string' ? addr : addr.emailAddress,
        messageId,
        status: 'entregado',
        kind: '',
        motivo: ''
      });
    }
  }
  return out.filter((x) => x.email);
}

export async function postSesEvents(req, res) {
  try {
    const body = parseSnsBody(req);
    if (!body) return res.status(200).json({ ok: true });
    if (body.Type === 'SubscriptionConfirmation' && body.SubscribeURL) {
      await fetch(body.SubscribeURL);
      return res.status(200).json({ ok: true, confirmed: true });
    }
    if (body.Type === 'UnsubscribeConfirmation') return res.status(200).json({ ok: true });
    const parts = sesEventParts(body.ses || body);
    for (const p of parts) {
      await NewsletterModel.applySesEvent(p);
      if (p.kind === 'bounce' || p.kind === 'complaint') {
        await NewsletterModel.markMailboxIssue({
          email: p.email,
          kind: p.kind,
          motivo: p.motivo
        });
      }
    }
    res.status(200).json({ ok: true, n: parts.length });
  } catch (err) {
    sendError(res, err);
  }
}
