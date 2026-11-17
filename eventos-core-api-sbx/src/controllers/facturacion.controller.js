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
  consultarComprobanteDgii,
  duplicarComprobante
} from '../services/facturacionComprobantes.service.js';
import { peekNextEncf } from '../services/ncfSequence.service.js';
import {
  listarEmpresasFiscales,
  guardarEmpresaFiscal,
  borrarEmpresaFiscal,
  tocarUsoEmpresaFiscal,
  guardarTagCountEmpresas,
  historialEmpresasFiscales,
  historialEmpresaFiscal
} from '../services/empresasFiscales.service.js';
import FacturaBorradorModel from '../models/facturaBorrador.model.js';
import { consultarRncEmpresa } from '../services/consultaRnc.service.js';
import { requirePanelAdmin, findUserByEmail, isPanelAdminUser, publicAdmin } from './adminsEcf.controller.js';
import { hasPermiso } from '../domain/ecfPermisos.js';
import { isAuditorEmail } from '../services/auditoriaEcf.service.js';
import { extractBearerToken, verifyBuenoHotelJwt, signBuenoHotelJwt } from '../services/jwtBuenoHotel.service.js';
import { verifyBookingCognitoIdToken } from '../services/jwtBookingCognito.service.js';

async function requireEmitirAuth(req) {
  const token = extractBearerToken(req);
  if (!token) {
    const err = new Error(
      'Se requiere Authorization Bearer (JWT de BuenoHotel). Sin sesión no se emite a la DGII.'
    );
    err.status = 401;
    err.code = 'EMITIR_AUTH_REQUIRED';
    throw err;
  }
  await verifyBuenoHotelJwt(token);
  const me = await requirePanelAdmin(req);
  if (!hasPermiso(me.permisosEcf, 'emitir') && !isAuditorEmail(me.email)) {
    const err = new Error('Esta cuenta no tiene permiso para emitir e-CF.');
    err.status = 403;
    err.code = 'EMITIR_FORBIDDEN';
    throw err;
  }
  return me;
}

/**
 * Booking ya tiene sesión Cognito. Canjea ese IdToken por el JWT de BuenoHotel
 * (el mismo de /api/auth/login). Booking no guarda correo/clave del panel.
 */
export async function postTokenDesdeBooking(req, res) {
  try {
    const cognito = extractBearerToken(req);
    if (!cognito) {
      const err = new Error('Mande el IdToken de Cognito de Booking en Authorization Bearer.');
      err.status = 401;
      err.code = 'BOOKING_TOKEN_REQUIRED';
      throw err;
    }
    const claims = await verifyBookingCognitoIdToken(cognito);
    const email = String(claims.email || claims['cognito:username'] || '')
      .trim()
      .toLowerCase();
    if (!email) {
      const err = new Error('El token de Booking no trae correo.');
      err.status = 401;
      err.code = 'BOOKING_EMAIL_MISSING';
      throw err;
    }
    const db = await findUserByEmail(email);
    if (!db) {
      const err = new Error(
        'Ese usuario de Booking no es administrador del panel de comprobantes. Pida invitación y permisos de emitir.'
      );
      err.status = 403;
      err.code = 'BOOKING_NOT_PANEL_ADMIN';
      throw err;
    }
    const merged = { ...db, email, rol: db?.rol || '' };
    if (!isPanelAdminUser(merged) && !isAuditorEmail(email)) {
      const err = new Error(
        'Ese usuario de Booking no es administrador del panel de comprobantes. Pida invitación y permisos de emitir.'
      );
      err.status = 403;
      err.code = 'BOOKING_NOT_PANEL_ADMIN';
      throw err;
    }
    if (db && db.activo === false) {
      const err = new Error('Tu cuenta del panel está inactiva.');
      err.status = 403;
      err.code = 'CUENTA_INACTIVA';
      throw err;
    }
    const pub = publicAdmin({ ...merged, activo: true });
    if (!hasPermiso(pub.permisosEcf, 'emitir') && !isAuditorEmail(email)) {
      const err = new Error('Esta cuenta no tiene permiso para emitir e-CF.');
      err.status = 403;
      err.code = 'EMITIR_FORBIDDEN';
      throw err;
    }
    const token = await signBuenoHotelJwt({
      sub: pub.id || claims.sub,
      email: pub.email,
      rol: pub.rol || 'admin'
    });
    res.status(200).json({
      success: true,
      token,
      user: pub,
      expiresIn: '12h',
      origen: 'booking-cognito'
    });
  } catch (err) {
    console.error('facturacion token-booking:', err?.message || err);
    sendError(res, err);
  }
}

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
    await requireEmitirAuth(req);
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

export async function getSecuencia(_req, res) {
  try {
    const result = await peekNextEncf(31);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('facturacion secuencia:', err?.message || err);
    sendError(res, err);
  }
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

export async function getConsultaRnc(req, res) {
  try {
    const result = await consultarRncEmpresa(req.params.rnc || req.query.rnc);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('facturacion rnc:', err?.message || err);
    sendError(res, err);
  }
}

export async function getEmpresas(_req, res) {
  try {
    const result = await listarEmpresasFiscales();
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('facturacion empresas listar:', err?.message || err);
    sendError(res, err);
  }
}

export async function putEmpresasConfig(req, res) {
  try {
    const result = await guardarTagCountEmpresas(req.body?.tagCount ?? req.body?.n);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('facturacion empresas config:', err?.message || err);
    sendError(res, err);
  }
}

export async function postEmpresa(req, res) {
  try {
    const empresa = await guardarEmpresaFiscal(req.body || {});
    res.status(200).json({ success: true, empresa });
  } catch (err) {
    console.error('facturacion empresas guardar:', err?.message || err);
    sendError(res, err);
  }
}

export async function postEmpresaUso(req, res) {
  try {
    const empresa = await tocarUsoEmpresaFiscal(req.params.rnc);
    res.status(200).json({ success: true, empresa });
  } catch (err) {
    console.error('facturacion empresas uso:', err?.message || err);
    sendError(res, err);
  }
}

export async function deleteEmpresa(req, res) {
  try {
    await borrarEmpresaFiscal(req.params.rnc);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('facturacion empresas borrar:', err?.message || err);
    sendError(res, err);
  }
}

export async function getHistorialEmpresas(_req, res) {
  try {
    const result = await historialEmpresasFiscales();
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('facturacion historial empresas:', err?.message || err);
    sendError(res, err);
  }
}

export async function getHistorialEmpresa(req, res) {
  try {
    const result = await historialEmpresaFiscal(req.params.rnc);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('facturacion historial empresa:', err?.message || err);
    sendError(res, err);
  }
}

export async function getDuplicarComprobante(req, res) {
  try {
    const result = await duplicarComprobante(req.params.registroId);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('facturacion duplicar:', err?.message || err);
    sendError(res, err);
  }
}

export async function getBorrador(_req, res) {
  try {
    const item = await FacturaBorradorModel.getShared();
    res.status(200).json({ success: true, borrador: item || null });
  } catch (err) {
    console.error('facturacion borrador get:', err?.message || err);
    sendError(res, err);
  }
}

export async function putBorrador(req, res) {
  try {
    const snap = req.body?.snap || req.body;
    if (!snap || typeof snap !== 'object') {
      const err = new Error('No hay datos de factura para guardar.');
      err.status = 400;
      throw err;
    }
    const savedBy = String(req.body?.savedBy || '').trim();
    const item = await FacturaBorradorModel.putShared(snap.form ? snap : snap.snap || snap, savedBy);
    res.status(200).json({ success: true, borrador: item });
  } catch (err) {
    console.error('facturacion borrador put:', err?.message || err);
    sendError(res, err);
  }
}


