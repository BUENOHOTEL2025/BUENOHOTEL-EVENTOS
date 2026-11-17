import PaqueteModel, { normalizePaquete, publicPaquete, slugify } from '../models/paquete.model.js';
import { requirePanelAdmin } from './adminsEcf.controller.js';
import { translateEsToEn } from '../services/translate.service.js';
import { savePaqueteImage } from '../services/paqueteUpload.service.js';

function sendError(res, err) {
  const status = Number(err?.status) || 500;
  res.status(status).json({ success: false, message: err?.message || 'Error de paquetes' });
}

function deny(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function langOf(req) {
  const q = String(req.query.lang || req.headers['accept-language'] || 'es').toLowerCase();
  return q.startsWith('en') ? 'en' : 'es';
}

export async function listPublic(req, res) {
  try {
    const lang = langOf(req);
    const all = await PaqueteModel.listAll();
    const items = all.filter((x) => x.activo !== false).map((x) => publicPaquete(x, lang));
    res.json({ success: true, paquetes: items });
  } catch (err) {
    sendError(res, err);
  }
}

export async function getPublic(req, res) {
  try {
    const item = await PaqueteModel.getBySlug(req.params.slug);
    if (!item || item.activo === false) deny(404, 'Ese paquete no está publicado.');
    res.json({ success: true, paquete: publicPaquete(item, langOf(req)), raw: { es: item.es, en: item.en } });
  } catch (err) {
    sendError(res, err);
  }
}

export async function listAdmin(req, res) {
  try {
    await requirePanelAdmin(req);
    const items = await PaqueteModel.listAll();
    res.json({ success: true, paquetes: items });
  } catch (err) {
    sendError(res, err);
  }
}

export async function saveAdmin(req, res) {
  try {
    await requirePanelAdmin(req);
    const prev = req.body?.slug ? await PaqueteModel.getBySlug(req.body.slug) : null;
    const item = normalizePaquete(req.body, prev || {});
    if (!item.slug || !item.es.titulo) deny(400, 'Pon un título en español. Con eso se arma el enlace.');
    await PaqueteModel.save(item);
    res.status(prev ? 200 : 201).json({ success: true, paquete: item });
  } catch (err) {
    sendError(res, err);
  }
}

export async function uploadImagen(req, res) {
  try {
    await requirePanelAdmin(req);
    const url = await savePaqueteImage(req.body?.image);
    res.status(201).json({ success: true, url });
  } catch (err) {
    sendError(res, err);
  }
}

export async function traducirAdmin(req, res) {
  try {
    await requirePanelAdmin(req);
    const es = req.body?.es || req.body || {};
    const keys = ['titulo', 'subtitulo', 'intro', 'incluye', 'noIncluye', 'itinerario', 'terminos', 'nota', 'ctaLabel'];
    const listKeys = new Set(['incluye', 'noIncluye', 'itinerario', 'terminos']);
    const en = {};
    for (const key of keys) {
      const raw = es[key];
      const asText = Array.isArray(raw)
        ? raw.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 40).join('\n')
        : String(raw || '');
      const translated = await translateEsToEn(asText);
      en[key] = listKeys.has(key)
        ? translated.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
        : translated;
    }
    res.json({ success: true, en });
  } catch (err) {
    sendError(res, err);
  }
}

export async function deleteAdmin(req, res) {
  try {
    await requirePanelAdmin(req);
    const slug = slugify(req.params.slug);
    if (!slug) deny(400, 'Falta el paquete.');
    await PaqueteModel.remove(slug);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
}
