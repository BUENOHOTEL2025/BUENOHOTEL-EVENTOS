import {
  emitirFacturaElectronica,
  getEstadoEmision,
  consultarEstadoValidacionDgii,
  facturacionEmitHealth,
  previewFacturaHtml
} from '../services/facturacionEmitir.service.js';
import {
  listarComprobantesEmitidos,
  refrescarEstadoComprobante,
  refrescarEstadosComprobantes,
  xmlFirmadoComprobante,
  htmlComprobante,
  tracksPorEncf,
  consultarComprobanteDgii
} from '../services/facturacionComprobantes.service.js';

function sendError(res, err) {
  const status = Number(err?.status) || 500;
  res.status(status).json({
    success: false,
    message: err?.message || 'Error al emitir e-CF',
    code: err?.code || undefined,
    ...(err?.meta && typeof err.meta === 'object' ? err.meta : {})
  });
}

export async function postEmitir(req, res) {
  try {
    const result = await emitirFacturaElectronica(req.body || {});
    // Evitar devolver XML enorme si el cliente no lo pide
    const includeXml = String(req.query?.xml || req.body?.includeXml || '').toLowerCase();
    const wantXml = includeXml === '1' || includeXml === 'true';
    const payload = { ...result };
    if (!wantXml) delete payload.xmlFirmado;
    res.status(200).json({ success: true, ...payload });
  } catch (err) {
    console.error('facturacion emitir:', err?.message || err);
    sendError(res, err);
  }
}

export async function postPreviewFactura(req, res) {
  try {
    const html = await previewFacturaHtml(req.body || {});
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch (err) {
    console.error('facturacion preview:', err?.message || err);
    sendError(res, err);
  }
}

export async function getEstado(req, res) {
  try {
    const q = String(req.query?.consultarDgii || req.query?.dgii || '').toLowerCase();
    const consultarDgii = q === '1' || q === 'true';
    const result = await getEstadoEmision(req.params.id, { consultarDgii });
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('facturacion estado:', err?.message || err);
    sendError(res, err);
  }
}

export async function getValidacion(req, res) {
  try {
    const trackId = String(req.params.trackId || req.query.trackId || '').trim();
    const result = await consultarEstadoValidacionDgii(trackId);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('facturacion validacion:', err?.message || err);
    sendError(res, err);
  }
}

export async function getFacturacionHealth(_req, res) {
  res.json({ ok: true, ...facturacionEmitHealth() });
}

export async function getComprobantes(_req, res) {
  try {
    const result = await listarComprobantesEmitidos();
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('facturacion comprobantes:', err?.message || err);
    sendError(res, err);
  }
}

export async function postComprobantesRefrescar(req, res) {
  try {
    const id = String(req.body?.registroId || req.query?.registroId || '').trim();
    if (id) {
      const result = await refrescarEstadoComprobante(id);
      return res.status(200).json({ success: true, ...result });
    }
    const max = Number(req.body?.max || req.query?.max || 40);
    const result = await refrescarEstadosComprobantes({ max });
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('facturacion refrescar:', err?.message || err);
    sendError(res, err);
  }
}

export async function getComprobanteXml(req, res) {
  try {
    const { xml, fileName, encf } = await xmlFirmadoComprobante(req.params.registroId);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName || encf + '.xml'}"`);
    res.status(200).send(xml);
  } catch (err) {
    console.error('facturacion xml:', err?.message || err);
    sendError(res, err);
  }
}

export async function getComprobanteHtml(req, res) {
  try {
    const html = await htmlComprobante(req.params.registroId);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch (err) {
    console.error('facturacion html:', err?.message || err);
    sendError(res, err);
  }
}

export async function getTracksEncf(req, res) {
  try {
    const result = await tracksPorEncf(req.params.encf);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('facturacion tracks:', err?.message || err);
    sendError(res, err);
  }
}

export async function getConsultaDgii(req, res) {
  try {
    const result = await consultarComprobanteDgii({
      registroId: req.query.registroId || req.query.id,
      trackId: req.query.trackId || req.query.trackid,
      encf: req.query.encf || req.query.eNCF
    });
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('facturacion consulta:', err?.message || err);
    sendError(res, err);
  }
}
