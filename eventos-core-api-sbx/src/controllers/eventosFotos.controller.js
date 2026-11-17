import { requirePanelAdmin } from './adminsEcf.controller.js';
import { userFromReq } from '../services/auditoriaEcf.service.js';
import * as Fotos from '../services/eventosFotos.service.js';

function sendError(res, err) {
  const status = Number(err?.status) || 500;
  res.status(status).json({ success: false, message: err?.message || 'Error de fotos de eventos' });
}

export async function listPublic(req, res) {
  try {
    const categoria = String(req.query?.categoria || '').trim();
    const fotos = await Fotos.listFotosPublico(categoria);
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      success: true,
      fotos,
      categorias: Fotos.FOTO_CATEGORIAS
    });
  } catch (err) {
    sendError(res, err);
  }
}

export async function listAdmin(req, res) {
  try {
    await requirePanelAdmin(req);
    const items = await Fotos.listFotos();
    res.json({
      success: true,
      fotos: items,
      categorias: Fotos.FOTO_CATEGORIAS,
      carpeta: 'https://buenohotel.com/assets/eventos-reales/'
    });
  } catch (err) {
    sendError(res, err);
  }
}

export async function presignAdmin(req, res) {
  try {
    await requirePanelAdmin(req);
    const data = await Fotos.createUpload({
      filename: req.body?.filename,
      contentType: req.body?.contentType,
      size: req.body?.size,
      kind: req.body?.kind
    });
    res.status(201).json({ success: true, ...data });
  } catch (err) {
    sendError(res, err);
  }
}

export async function loteAdmin(req, res) {
  try {
    await requirePanelAdmin(req);
    const user = userFromReq(req);
    const data = await Fotos.saveLote({
      note: req.body?.note,
      categoria: req.body?.categoria,
      photos: req.body?.photos,
      refs: req.body?.refs,
      uploadedBy: user?.email || ''
    });
    res.status(201).json({ success: true, ...data });
  } catch (err) {
    sendError(res, err);
  }
}

export async function deleteAdmin(req, res) {
  try {
    await requirePanelAdmin(req);
    const key = String(req.body?.key || req.query?.key || '').trim();
    await Fotos.deleteFoto(key);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
}

export async function patchAdmin(req, res) {
  try {
    await requirePanelAdmin(req);
    const data = await Fotos.updateFoto({
      key: req.body?.key,
      note: req.body?.note,
      categoria: req.body?.categoria
    });
    res.json({ success: true, foto: data });
  } catch (err) {
    sendError(res, err);
  }
}
