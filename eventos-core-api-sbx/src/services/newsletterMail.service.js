import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });

const FROM = process.env.NEWSLETTER_FROM || 'BUENOHOTEL <info@buenohotel.com>';
const REPLY = process.env.NEWSLETTER_REPLY || 'info@buenohotel.com';

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bodyToHtml(cuerpo) {
  const parts = String(cuerpo || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return '<p></p>';
  return parts
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55;color:#333;">${esc(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

export function bajaUrl(email, token) {
  const u = new URL('https://buenohotel.com/baja-ofertas.html');
  u.searchParams.set('e', email);
  u.searchParams.set('t', token);
  return u.toString();
}

export function renderCampaignHtml({ asunto, cuerpo, ctaUrl, ctaLabel, baja }) {
  const cta = String(ctaUrl || '').trim();
  const label = String(ctaLabel || 'Ver oferta').trim() || 'Ver oferta';
  const btn = cta
    ? `<p style="margin:24px 0 8px;text-align:center;">
        <a href="${esc(cta)}" style="display:inline-block;background:#fbb03b;color:#1f2937;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:8px;">${esc(label)}</a>
      </p>`
    : '';
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#fbb03b;padding:18px 24px;text-align:center;">
          <img src="https://buenohotel.com/assets/logo/logotipo-buenohotel.png" alt="BUENOHOTEL" width="160" style="display:inline-block;height:auto;border:0;"/>
        </td></tr>
        <tr><td style="padding:28px 24px 8px;">
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1a365d;">${esc(asunto)}</h1>
          ${bodyToHtml(cuerpo)}
          ${btn}
        </td></tr>
        <tr><td style="padding:8px 24px 24px;color:#777;font-size:12px;line-height:1.5;">
          Recibes este correo porque te suscribiste a ofertas de BUENOHOTEL.
          <br/><br/>
          Si no quieres seguir recibiendo ofertas, entra a
          <a href="https://buenohotel.com/" style="color:#1a365d;">buenohotel.com</a>,
          baja hasta el pie de la página y pulsa <strong>Desuscribirme</strong>
          (con el mismo correo). También puedes darte de baja aquí:
          <a href="${esc(baja)}" style="color:#1a365d;">dejar de recibir ofertas</a>.
          <br/><a href="mailto:info@buenohotel.com" style="color:#1a365d;">info@buenohotel.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

const CONFIG_SET = process.env.SES_CONFIG_SET || 'buenohotel-nl';

export async function sendNewsletterEmail({ to, asunto, html }) {
  const params = {
    Source: FROM,
    Destination: { ToAddresses: [to] },
    ReplyToAddresses: [REPLY],
    Message: {
      Subject: { Data: asunto, Charset: 'UTF-8' },
      Body: { Html: { Data: html, Charset: 'UTF-8' } }
    }
  };
  if (CONFIG_SET) params.ConfigurationSetName = CONFIG_SET;
  try {
    const out = await ses.send(new SendEmailCommand(params));
    return { ok: true, messageId: out?.MessageId || '' };
  } catch (err) {
    if (CONFIG_SET && /ConfigurationSet/i.test(String(err?.message || err?.name || ''))) {
      delete params.ConfigurationSetName;
      const out = await ses.send(new SendEmailCommand(params));
      return { ok: true, messageId: out?.MessageId || '' };
    }
    throw err;
  }
}

export async function sendCampaignToList({ asunto, cuerpo, ctaUrl, ctaLabel, recipients }) {
  let enviados = 0;
  let fallidos = 0;
  const errors = [];
  const results = [];
  const queue = [...recipients];
  const workers = 4;
  async function worker() {
    while (queue.length) {
      const r = queue.shift();
      if (!r?.email) continue;
      const baja = bajaUrl(r.email, r.unsubToken || '');
      const html = renderCampaignHtml({ asunto, cuerpo, ctaUrl, ctaLabel, baja });
      try {
        const sent = await sendNewsletterEmail({ to: r.email, asunto, html });
        enviados += 1;
        results.push({
          email: r.email,
          messageId: sent.messageId || '',
          status: 'enviado'
        });
      } catch (err) {
        fallidos += 1;
        const motivo = String(err?.message || err).slice(0, 180);
        results.push({ email: r.email, messageId: '', status: 'error', motivo });
        if (errors.length < 8) errors.push(`${r.email}: ${motivo}`);
      }
    }
  }
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return { enviados, fallidos, errors, results };
}
