import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { createHash, createHmac, randomBytes } from 'crypto';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const ses = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });
const REGION = process.env.AWS_REGION || 'us-east-1';
const BUCKET = process.env.PAQUETES_IMAGE_BUCKET || 'buenohotel-com-website-bucket';
const PUBLIC = process.env.PAQUETES_IMAGE_PUBLIC || 'https://buenohotel.com';
export const PREFIX = 'assets/eventos-reales/';
const PREFIX_REFS = `${PREFIX}refs/`;
const PREFIX_THUMBS = `${PREFIX}thumbs/`;
const PREFIX_META = `${PREFIX}meta/`;
const NOTIFY_KEY = `${PREFIX_META}_notify.json`;
const NOTIFY_WINDOW_MS = 60 * 60 * 1000;
const REVIEW_EMAIL = process.env.FOTOS_REVIEW_EMAIL || 'elmerluissainthilarerojo@gmail.com';
const FROM = process.env.NEWSLETTER_FROM || 'BUENOHOTEL <info@buenohotel.com>';
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

function deny(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function hmac(key, data) {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data) {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

function encodeRfc3986(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function slugName(raw) {
  const base = String(raw || 'foto')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'foto';
}

function publicUrl(key) {
  return `${PUBLIC}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

function amzDate(d) {
  return d.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function presignPutUrl(key, contentType, expiresSec) {
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secret = process.env.AWS_SECRET_ACCESS_KEY;
  const token = process.env.AWS_SESSION_TOKEN || '';
  if (!accessKey || !secret) deny(500, 'No hay credenciales para firmar la subida.');
  const now = new Date();
  const date = amzDate(now);
  const stamp = date.slice(0, 8);
  const host = `${BUCKET}.s3.${REGION}.amazonaws.com`;
  const encodedKey = key.split('/').map(encodeRfc3986).join('/');
  const credential = `${accessKey}/${stamp}/${REGION}/s3/aws4_request`;
  const params = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': date,
    'X-Amz-Expires': String(expiresSec),
    'X-Amz-SignedHeaders': 'content-type;host'
  };
  if (token) params['X-Amz-Security-Token'] = token;
  const qs = Object.keys(params)
    .sort()
    .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(params[k])}`)
    .join('&');
  const canonical = [
    'PUT',
    `/${encodedKey}`,
    qs,
    `content-type:${contentType}\nhost:${host}\n`,
    'content-type;host',
    'UNSIGNED-PAYLOAD'
  ].join('\n');
  const scope = `${stamp}/${REGION}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', date, scope, sha256Hex(canonical)].join('\n');
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${secret}`, stamp), REGION), 's3'), 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(toSign, 'utf8').digest('hex');
  return `https://${host}/${encodedKey}?${qs}&X-Amz-Signature=${signature}`;
}

function isGalleryKey(key) {
  if (!key || key.endsWith('/') || /\.(txt|json)$/i.test(key)) return false;
  if (key.startsWith(PREFIX_REFS) || key.startsWith(PREFIX_THUMBS) || key.startsWith(PREFIX_META)) return false;
  return key.startsWith(PREFIX);
}

export async function createUpload({ filename, contentType, size, kind }) {
  const type = String(contentType || '').toLowerCase();
  const ext = ALLOWED[type];
  if (!ext) deny(400, 'Solo JPG, PNG o WebP.');
  const bytes = Number(size) || 0;
  if (bytes < 40) deny(400, 'Esa foto está vacía.');
  if (bytes > MAX_BYTES) deny(400, 'Máximo 25 MB por foto.');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const folder = String(kind || '') === 'ref' ? PREFIX_REFS : String(kind || '') === 'thumb' ? PREFIX_THUMBS : PREFIX;
  const key = `${folder}${stamp}-${slugName(filename)}.${ext}`;
  return {
    key,
    kind: folder === PREFIX_REFS ? 'ref' : folder === PREFIX_THUMBS ? 'thumb' : 'foto',
    uploadUrl: presignPutUrl(key, type === 'image/jpg' ? 'image/jpeg' : type, 300),
    publicUrl: publicUrl(key),
    contentType: type === 'image/jpg' ? 'image/jpeg' : type,
    expiresIn: 300
  };
}

async function listPrefix(prefix) {
  const items = [];
  let token;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: token
      })
    );
    items.push(...(res.Contents || []));
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return items;
}

async function loadLotes() {
  const objs = await listPrefix(PREFIX_META);
  const lotes = [];
  for (const obj of objs) {
    const key = String(obj.Key || '');
    if (!key.endsWith('.json') || key.endsWith('_notify.json')) continue;
    try {
      const got = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
      const raw = await got.Body.transformToString();
      const j = JSON.parse(raw);
      if (j && j.id) lotes.push(j);
    } catch {
      /* ignore broken meta */
    }
  }
  return lotes;
}

function attachLotes(fotos, lotes) {
  const byKey = new Map();
  for (const lote of lotes) {
    for (const p of lote.photos || []) {
      if (p?.key) byKey.set(p.key, lote);
    }
  }
  return fotos.map((f) => {
    const lote = byKey.get(f.key);
    if (!lote) return { ...f, note: '', refs: [], loteId: '' };
    return {
      ...f,
      note: String(lote.note || ''),
      refs: Array.isArray(lote.refs) ? lote.refs : [],
      loteId: String(lote.id || ''),
      uploadedBy: lote.uploadedBy || ''
    };
  });
}

export async function listFotos() {
  const items = [];
  for (const obj of await listPrefix(PREFIX)) {
    const key = String(obj.Key || '');
    if (!isGalleryKey(key)) continue;
    items.push({
      key,
      name: key.slice(PREFIX.length),
      url: publicUrl(key),
      size: Number(obj.Size) || 0,
      updatedAt: obj.LastModified ? obj.LastModified.toISOString() : ''
    });
  }
  items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const lotes = await loadLotes();
  return attachLotes(items, lotes);
}

async function putMeta(item) {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: `${PREFIX_META}${item.id}.json`,
      Body: JSON.stringify(item),
      ContentType: 'application/json; charset=utf-8',
      CacheControl: 'no-store'
    })
  );
}

export async function deleteFoto(key) {
  const k = String(key || '').replace(/^\/+/, '');
  if (!k.startsWith(PREFIX) || k.includes('..')) deny(400, 'Esa ruta no es válida.');
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: k }));
  return { ok: true };
}

export async function updateFoto({ key, note }) {
  const k = String(key || '').replace(/^\/+/, '');
  if (!k.startsWith(PREFIX) || k.includes('..')) deny(400, 'Esa ruta no es válida.');
  const noteStr = String(note || '').trim().slice(0, 2000);
  const lotes = await loadLotes();
  const lote = lotes.find((l) => (l.photos || []).some((p) => p && p.key === k));
  if (lote) {
    lote.note = noteStr;
    lote.updatedAt = new Date().toISOString();
    await putMeta(lote);
    return { key: k, url: publicUrl(k), note: noteStr, loteId: lote.id };
  }
  const item = {
    id: `lote-${Date.now()}-${randomBytes(3).toString('hex')}`,
    note: noteStr,
    photos: [{ key: k, url: publicUrl(k) }],
    refs: [],
    uploadedBy: '',
    uploadedAt: new Date().toISOString()
  };
  await putMeta(item);
  return { key: k, url: publicUrl(k), note: noteStr, loteId: item.id };
}

function normFiles(list) {
  return (Array.isArray(list) ? list : [])
    .map((x) => {
      const key = String(x?.key || '').replace(/^\/+/, '');
      const thumbKey = String(x?.thumbKey || '').replace(/^\/+/, '');
      return {
        key,
        url: String(x?.url || (key ? publicUrl(key) : '')),
        thumbKey,
        thumbUrl: String(x?.thumbUrl || (thumbKey ? publicUrl(thumbKey) : ''))
      };
    })
    .filter((x) => x.key.startsWith(PREFIX) && !x.key.includes('..'));
}

export async function saveLote({ note, photos, refs, uploadedBy }) {
  const pics = normFiles(photos);
  const rfs = normFiles(refs);
  if (!pics.length) deny(400, 'No hay fotos en este lote.');
  const id = `lote-${Date.now()}-${randomBytes(3).toString('hex')}`;
  const item = {
    id,
    note: String(note || '').trim().slice(0, 2000),
    photos: pics,
    refs: rfs,
    uploadedBy: String(uploadedBy || '').slice(0, 160),
    uploadedAt: new Date().toISOString()
  };
  await putMeta(item);
  const reviewUrl = `https://buenohotel.com/admin/fotos-eventos#${id}`;
  try {
    await queueOrNotify(item);
  } catch (err) {
    console.error('fotos notify', err?.message || err);
  }
  return { ...item, reviewUrl };
}

async function loadNotifyState() {
  try {
    const got = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: NOTIFY_KEY }));
    const raw = await got.Body.transformToString();
    const j = JSON.parse(raw);
    return {
      lastSentAt: String(j?.lastSentAt || ''),
      pending: Array.isArray(j?.pending) ? j.pending : []
    };
  } catch {
    return { lastSentAt: '', pending: [] };
  }
}

async function saveNotifyState(state) {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: NOTIFY_KEY,
      Body: JSON.stringify({
        lastSentAt: String(state?.lastSentAt || ''),
        pending: Array.isArray(state?.pending) ? state.pending : []
      }),
      ContentType: 'application/json; charset=utf-8',
      CacheControl: 'no-store'
    })
  );
}

async function queueOrNotify(lote) {
  const state = await loadNotifyState();
  const pending = state.pending.slice();
  pending.push({
    id: lote.id,
    note: lote.note,
    photos: lote.photos,
    refs: lote.refs,
    uploadedBy: lote.uploadedBy,
    uploadedAt: lote.uploadedAt
  });
  const last = Date.parse(state.lastSentAt || '') || 0;
  await saveNotifyState({ lastSentAt: state.lastSentAt, pending });
  if (last && Date.now() - last < NOTIFY_WINDOW_MS) return;
  await notifyDigest(pending);
  await saveNotifyState({ lastSentAt: new Date().toISOString(), pending: [] });
}

async function s3Bytes(key) {
  const got = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const bytes = await got.Body.transformToByteArray();
  return {
    bytes,
    contentType: got.ContentType || 'image/jpeg',
    name: String(key).split('/').pop() || 'foto.jpg'
  };
}

async function cidBlock(items, prefix, maxN) {
  const files = [];
  const html = [];
  const list = (items || []).slice(0, maxN);
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const cid = `${prefix}${i}@buenohotel.com`;
    const tryKeys = [p.thumbKey, p.key].filter(Boolean);
    let attached = false;
    for (const key of tryKeys) {
      try {
        const file = await s3Bytes(key);
        if (file.bytes.length > 3.5 * 1024 * 1024) continue;
        files.push({ ...file, cid });
        html.push(
          `<a href="${esc(p.url)}"><img src="cid:${cid}" alt="" width="280" style="width:280px;max-width:100%;height:auto;border:0;display:block;margin:8px 0;" /></a>`
        );
        attached = true;
        break;
      } catch {
        /* next key */
      }
    }
    if (!attached) {
      html.push(`<p><a href="${esc(p.url)}">Ver foto en el panel</a></p>`);
    }
  }
  return { files, html: html.join('') };
}

function wrapB64(s) {
  return String(s || '').replace(/(.{76})/g, '$1\r\n');
}

function buildRawEmail({ html, files, subject }) {
  const boundary = `BH${randomBytes(8).toString('hex')}`;
  const nl = '\r\n';
  const subj = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
  let raw =
    `From: ${FROM}${nl}` +
    `To: ${REVIEW_EMAIL}${nl}` +
    `Reply-To: info@buenohotel.com${nl}` +
    `Subject: ${subj}${nl}` +
    `MIME-Version: 1.0${nl}` +
    `Content-Type: multipart/related; boundary="${boundary}"${nl}${nl}`;
  raw +=
    `--${boundary}${nl}` +
    `Content-Type: text/html; charset=UTF-8${nl}` +
    `Content-Transfer-Encoding: base64${nl}${nl}` +
    wrapB64(Buffer.from(html, 'utf8').toString('base64')) +
    nl;
  for (const f of files) {
    raw +=
      `--${boundary}${nl}` +
      `Content-Type: ${f.contentType || 'image/jpeg'}${nl}` +
      `Content-Transfer-Encoding: base64${nl}` +
      `Content-ID: <${f.cid}>${nl}` +
      `Content-Disposition: inline; filename="${String(f.name || 'foto.jpg').replace(/"/g, '')}"${nl}${nl}` +
      wrapB64(Buffer.from(f.bytes).toString('base64')) +
      nl;
  }
  raw += `--${boundary}--${nl}`;
  return Buffer.from(raw, 'utf8');
}

async function notifyDigest(lotes) {
  const list = Array.isArray(lotes) ? lotes : [];
  if (!list.length) return;
  const photos = list.flatMap((l) => l.photos || []);
  const refs = list.flatMap((l) => l.refs || []);
  const notes = list.map((l) => String(l.note || '').trim()).filter(Boolean);
  const fotoBlock = await cidBlock(photos, 'foto', 8);
  const refBlock = await cidBlock(refs, 'ref', 6);
  const extraFotos = photos.length > 8 ? `<p style="color:#666;">Y ${photos.length - 8} foto(s) más en el panel.</p>` : '';
  const notaHtml = notes.length
    ? notes
        .map((n) => `<p style="margin:12px 0;padding:12px;background:#f8fafc;border-radius:8px;color:#111;">${esc(n).replace(/\n/g, '<br/>')}</p>`)
        .join('')
    : '<p style="color:#666;">Sin nota.</p>';
  const cargas = list.length > 1 ? ` en ${list.length} cargas` : '';
  const reviewUrl = 'https://buenohotel.com/admin/fotos-eventos';
  const html = `<!DOCTYPE html><html lang="es"><body style="font-family:Arial,sans-serif;color:#111;">
    <p>Claudia subió ${photos.length} foto(s)${cargas} a la galería de BUENOHOTEL.</p>
    ${notaHtml}
    ${refBlock.html ? `<p><strong>Referencias</strong></p>${refBlock.html}` : ''}
    <p><strong>Fotos</strong></p>
    ${fotoBlock.html || '<p>No se pudo incrustar la foto. Ábrela en el panel.</p>'}
    ${extraFotos}
    <p><a href="${esc(reviewUrl)}" style="display:inline-block;background:#fbb03b;color:#111;font-weight:700;text-decoration:none;padding:12px 18px;border-radius:8px;">Revisar fotos</a></p>
    <p style="font-size:12px;color:#666;">${esc(reviewUrl)}</p>
  </body></html>`;
  await ses.send(
    new SendRawEmailCommand({
      RawMessage: {
        Data: buildRawEmail({
          html,
          files: [...refBlock.files, ...fotoBlock.files],
          subject: `Fotos de la galería (${photos.length})`
        })
      }
    })
  );
}

export async function putLeeme() {
  const body = `Galería de eventos — BUENOHOTEL
https://buenohotel.com/admin/fotos-eventos
https://buenohotel.com/assets/eventos-reales/
`;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: `${PREFIX}LEEME.txt`,
      Body: body,
      ContentType: 'text/plain; charset=utf-8',
      CacheControl: 'no-store'
    })
  );
}
