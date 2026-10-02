import RegistrationModel from '../models/registration.model.js';
import { normalizeMontoFacturaExento } from '../services/creditFiscalDraft.service.js';

function totalAprobadoDesdeRegistro(reg) {
  const pagos = Array.isArray(reg?.pagos) ? reg.pagos : [];
  const fromPagos = pagos
    .filter((p) => String(p?.estado || '').toLowerCase() === 'aprobado')
    .reduce((s, p) => s + (Number(p?.monto) || 0), 0);
  if (fromPagos > 0) return fromPagos;
  return Number(reg?.totalAprobado) || 0;
}

function decodeJwtSubFromAuthHeader(authHeader) {
  try {
    if (!authHeader) return '';
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = m ? m[1] : '';
    if (!token || token.split('.').length < 3) return '';
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(decodeURIComponent(escape(atob(payload))));
    return json && json.sub ? String(json.sub) : '';
  } catch {
    return '';
  }
}

/**
 * 🔹 GET /api/reservas/mias
 * Obtiene las reservas del usuario autenticado
 */
export async function getMyReservas(req, res) {
  try {
    const userId = decodeJwtSubFromAuthHeader(req.headers['authorization'] || '');
    if (!userId) return res.status(401).json({ success: false, message: 'No autorizado' });
    const items = await RegistrationModel.getByUserId(userId);
    res.json({ success: true, data: items });
  } catch (e) {
    console.error('❌ Error en getMyReservas:', e);
    res.status(500).json({ success: false, message: e.message || 'Error obteniendo reservas' });
  }
}

/**
 * 🔹 GET /api/reservas
 * Obtiene reservas por userId (admin)
 */
export async function getReservasByUser(req, res) {
  try {
    const userId = String(req.query.userId || '').trim();
    if (!userId) return res.status(400).json({ success: false, message: 'userId requerido' });
    const items = await RegistrationModel.getByUserId(userId);
    res.json({ success: true, data: items });
  } catch (e) {
    console.error('❌ Error en getReservasByUser:', e);
    res.status(500).json({ success: false, message: e.message || 'Error obteniendo reservas' });
  }
}

/**
 * 🔹 GET /api/reservas/:id
 * Obtiene una reserva específica
 */
export async function getReservaById(req, res) {
  try {
    const id = req.params.id;
    let item = await RegistrationModel.getById(id);
    if (!item) item = await RegistrationModel.getByShortCode(id);
    if (!item) return res.status(404).json({ success: false, message: 'No encontrado' });
    res.json({ success: true, data: item });
  } catch (e) {
    console.error('❌ Error en getReservaById:', e);
    res.status(500).json({ success: false, message: e.message || 'Error obteniendo reserva' });
  }
}

/**
 * 🔹 GET /api/reservas/pagos?estado=pending|approved|cancelled
 * Lista todos los pagos (usado por admin.html)
 */
export async function listPagos(req, res) {
  try {
    const estado = req.query.estado || null;
    const pagos = await RegistrationModel.listPaymentsByEstado(estado);
    res.json({ success: true, data: pagos });
  } catch (e) {
    console.error('❌ Error en listPagos:', e);
    res.status(500).json({ success: false, message: e.message || 'Error listando pagos' });
  }
}

/**
 * 🔹 PATCH /api/reservas/:id/pagos/:pagoId/estado
 * Actualiza el estado de un pago (admin.html → aprobar/cancelar)
 */
export async function updatePagoEstado(req, res) {
  try {
    const { id, pagoId } = req.params;
    const { estado } = req.body || {};
    if (!estado) return res.status(400).json({ success: false, message: 'estado requerido' });

    const ts = new Date().toISOString();
    const updated = await RegistrationModel.updatePagoEstado(id, pagoId, estado, ts);

    res.json({
      success: true,
      message: `Pago ${estado}`,
      data: updated
    });
  } catch (e) {
    console.error('❌ Error en updatePagoEstado:', e);
    res.status(500).json({ success: false, message: e.message || 'Error actualizando estado del pago' });
  }
}

/**
 * 🔹 POST /api/reservas/:id/pagos
 * Agrega un nuevo pago (si decides permitir abonos manuales)
 */
export async function addPago(req, res) {
  try {
    const id = req.params.id;
    const pago = req.body || {};
    const ts = new Date().toISOString();

    const result = await RegistrationModel.appendPagoAndTouch(id, pago, ts);
    res.json({ success: true, message: 'Pago agregado', data: result });
  } catch (e) {
    console.error('❌ Error en addPago:', e);
    res.status(400).json({ success: false, message: e.message || 'No se pudo agregar el pago' });
  }
}

/**
 * 🗑️ DELETE /api/reservas/:id
 * Elimina un registro completo
 */
export async function deleteReserva(req, res) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, message: 'id es requerido' });
    
    const result = await RegistrationModel.deleteRegistration(id);
    return res.json({ success: true, message: 'Registro eliminado correctamente', data: result });
  } catch (err) {
    if (err.message === 'Registro no encontrado') {
      return res.status(404).json({ success: false, message: err.message });
    }
    console.error('❌ Error en deleteReserva:', err);
    return res.status(500).json({ success: false, message: err.message || 'Error eliminando registro' });
  }
}

/**
 * 🗑️ DELETE /api/reservas/:id/pagos/:pagoId
 * Elimina un pago individual de un registro
 */
export async function deletePago(req, res) {
  try {
    const { id, pagoId } = req.params;
    if (!id) return res.status(400).json({ success: false, message: 'id es requerido' });
    if (!pagoId) return res.status(400).json({ success: false, message: 'pagoId es requerido' });
    
    const result = await RegistrationModel.deletePago(id, pagoId);
    return res.json({ success: true, message: 'Pago eliminado correctamente', data: result });
  } catch (err) {
    if (err.message === 'Registro no encontrado' || err.message === 'Pago no encontrado') {
      return res.status(404).json({ success: false, message: err.message });
    }
    console.error('❌ Error en deletePago:', err);
    return res.status(500).json({ success: false, message: err.message || 'Error eliminando pago' });
  }
}

function parseJwtPayloadReservas(authHeader) {
  try {
    const m = String(authHeader || '').match(/^Bearer\s+(.+)$/i);
    const token = m ? m[1] : '';
    if (!token || token.split('.').length < 3) return {};
    const payload = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return payload || {};
  } catch {
    return {};
  }
}

function isAdminEmailReservas(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return false;
  if (e.endsWith('@buenohotel.com.do')) return true;
  const raw = String(process.env.FACTURA_ADMIN_EMAILS || '');
  const allow = raw.split(/[,;]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  return allow.length > 0 && allow.includes(e);
}

function isAdminFromJwtPayload(payload) {
  try {
    const p = payload && typeof payload === 'object' ? payload : {};
    const candidates = [
      p.rol,
      p.role,
      p.user_role,
      p['custom:rol'],
      p['custom:role']
    ]
      .map((v) => String(v || '').trim().toLowerCase())
      .filter(Boolean);
    if (candidates.includes('admin') || candidates.includes('administrador')) return true;
    const groups = p['cognito:groups'] || p.groups || p.group || [];
    const arr = Array.isArray(groups) ? groups : String(groups || '').split(/[,;]/);
    const norm = arr.map((g) => String(g || '').trim().toLowerCase()).filter(Boolean);
    return norm.includes('admin') || norm.includes('administradores') || norm.includes('administrador');
  } catch {
    return false;
  }
}

export async function patchComprobanteCliente(req, res) {
  try {
    const { id } = req.params;
    const { permite_ver_comprobante_cliente, comprobanteGeneradoPorAdmin } = req.body || {};
    const payload = parseJwtPayloadReservas(req.headers['authorization'] || '');
    const email = String(payload.email || '').trim().toLowerCase();
    if (!isAdminEmailReservas(email) && !isAdminFromJwtPayload(payload)) {
      return res.status(403).json({
        success: false,
        message: 'Solo administración puede habilitar el comprobante para el cliente.'
      });
    }
    if (typeof permite_ver_comprobante_cliente === 'undefined') {
      return res.status(400).json({ success: false, message: 'permite_ver_comprobante_cliente (boolean) requerido' });
    }
    const ts = new Date().toISOString();
    const publicado = !!permite_ver_comprobante_cliente;
    const generado = !!comprobanteGeneradoPorAdmin;
    if (publicado && !generado) {
      return res.status(400).json({
        success: false,
        message: 'El cliente solo puede ver el comprobante después de configurarlo y abrirlo con Comprobante fiscal.'
      });
    }
    const updated = await RegistrationModel.upsertDetallesAndTouch(id, {
      permite_ver_comprobante_cliente: publicado && generado,
      comprobanteGeneradoPorAdmin: publicado && generado,
      comprobanteGeneradoEn: publicado && generado ? ts : null
    }, ts);
    return res.json({ success: true, data: updated });
  } catch (e) {
    console.error('❌ patchComprobanteCliente:', e);
    if (String(e.message || '').toLowerCase().includes('no encontrado')) {
      return res.status(404).json({ success: false, message: e.message });
    }
    return res.status(500).json({ success: false, message: e.message || 'Error actualizando registro' });
  }
}

// Configuración de factura (admin): datos del cliente (a nombre de quién), descuento % y tasas exentas
export async function patchFacturaConfig(req, res) {
  try {
    const { id } = req.params;
    const payload = parseJwtPayloadReservas(req.headers['authorization'] || '');
    const email = String(payload.email || '').trim().toLowerCase();
    if (!isAdminEmailReservas(email) && !isAdminFromJwtPayload(payload)) {
      return res.status(403).json({ success: false, message: 'Solo administración puede configurar la factura.' });
    }

    const {
      descuento_pct,
      monto_exento,
      monto_exento_moneda,
      rnc_cliente,
      rncCliente,
      razon_social_cliente,
      razonSocialCliente,
      email_cliente,
      emailCliente,
      email_fiscal_cliente,
      direccion_cliente,
      direccionFiscalCliente,
      telefono_fiscal_cliente,
      telefonoFiscalCliente
    } = req.body || {};
    const pct = Number(descuento_pct);
    const ex = Number(monto_exento);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({ success: false, message: 'descuento_pct debe ser número entre 0 y 100' });
    }
    if (!Number.isFinite(ex) || ex < 0) {
      return res.status(400).json({ success: false, message: 'monto_exento debe ser número >= 0' });
    }

    const exGuardado = normalizeMontoFacturaExento(ex);

    const detPatch = {
      descuentoPct: pct,
      montoFacturaExento: exGuardado
    };
    if (monto_exento_moneda !== undefined && monto_exento_moneda !== null && String(monto_exento_moneda).trim() !== '') {
      const exMon = String(monto_exento_moneda).trim().toUpperCase();
      if (exMon !== 'USD' && exMon !== 'DOP') {
        return res.status(400).json({ success: false, message: 'monto_exento_moneda debe ser DOP o USD' });
      }
      detPatch.montoFacturaExentoMoneda = exMon;
    }

    const rncIn = rnc_cliente !== undefined ? rnc_cliente : rncCliente;
    if (rncIn !== undefined && rncIn !== null) {
      const digits = String(rncIn).replace(/\D/g, '');
      if (digits && (digits.length < 8 || digits.length > 11)) {
        return res.status(400).json({ success: false, message: 'El RNC del cliente debe tener entre 8 y 11 dígitos' });
      }
      detPatch.rncCliente = digits;
      detPatch.rncComprobanteFiscal = digits;
    }

    const razonIn = razon_social_cliente !== undefined ? razon_social_cliente : razonSocialCliente;
    if (razonIn !== undefined && razonIn !== null) {
      detPatch.razonSocialCliente = String(razonIn).trim().slice(0, 150);
    }

    const emailIn = email_fiscal_cliente !== undefined
      ? email_fiscal_cliente
      : (email_cliente !== undefined ? email_cliente : emailCliente);
    if (emailIn !== undefined && emailIn !== null) {
      const em = String(emailIn).trim();
      if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        return res.status(400).json({ success: false, message: 'El email fiscal del cliente no es válido' });
      }
      detPatch.emailFiscalCliente = em.slice(0, 80);
    }

    const dirIn = direccion_cliente !== undefined ? direccion_cliente : direccionFiscalCliente;
    if (dirIn !== undefined && dirIn !== null) {
      detPatch.direccionFiscalCliente = String(dirIn).trim().slice(0, 100);
    }

    const telIn = telefono_fiscal_cliente !== undefined ? telefono_fiscal_cliente : telefonoFiscalCliente;
    if (telIn !== undefined && telIn !== null) {
      detPatch.telefonoFiscalCliente = String(telIn).trim().slice(0, 40);
    }

    const ts = new Date().toISOString();
    const updated = await RegistrationModel.upsertDetallesAndTouch(id, detPatch, ts);
    return res.json({
      success: true,
      data: updated
    });
  } catch (e) {
    console.error('❌ patchFacturaConfig:', e);
    if (String(e.message || '').toLowerCase().includes('no encontrado')) {
      return res.status(404).json({ success: false, message: e.message });
    }
    return res.status(500).json({ success: false, message: e.message || 'Error actualizando registro' });
  }
}
