import https from 'https';
import { URL } from 'url';

/**
 * Posts JSON to a URL and returns parsed JSON.
 * No external deps; works with API Gateway endpoints.
 */
export async function postJson(urlString, payload, extraHeaders = {}) {
  const url = new URL(urlString);
  const body = JSON.stringify(payload || {});

  const options = {
    method: 'POST',
    hostname: url.hostname,
    path: url.pathname + (url.search || ''),
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      ...extraHeaders,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const isJson = (res.headers['content-type'] || '').includes('application/json');
          const parsed = isJson ? JSON.parse(data || '{}') : { raw: data };
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            const err = new Error(parsed?.message || `HTTP ${res.statusCode}`);
            err.statusCode = res.statusCode;
            err.response = parsed;
            reject(err);
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Sends an email using the existing API Gateway + Lambda (/email).
 * Requires process.env.EMAIL_API_BASE (e.g., https://abc.execute-api.us-east-1.amazonaws.com/prod)
 * and process.env.SENDER_EMAIL configured on the Lambda side.
 */
export async function sendEmailViaLambda({ to, subject, text, html }) {
  const base = process.env.EMAIL_API_BASE;
  if (!base) throw new Error('EMAIL_API_BASE no configurado');
  const endpoint = base.replace(/\/$/, '') + '/email';

  const payload = {
    recipientEmail: to,
    subject: subject || 'Mensaje',
    message: text || '',
    htmlMessage: html || undefined,
  };

  return postJson(endpoint, payload);
}
