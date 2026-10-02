import { randomUUID } from 'crypto';
import RegistrationModel from '../models/registration.model.js';
import { buildCreditFiscalDraftFromRegistration } from '../services/creditFiscalDraft.service.js';
import { renderFacturaOperativaHtml } from '../services/creditFiscalPrint.template.js';
import { SAMPLE_FACTURA_OPERAHOTEL } from '../domain/creditFiscalInvoice.schema.js';

const nowISO = () => new Date().toISOString();
const asNumber = (v) => {
  if (v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  // Quitar símbolos de moneda (RD$, $, etc.) y separadores de miles
  const s = String(v)
    .replace(/[^\d.,\-]/g, '')        // deja solo dígitos, puntos, comas, guión
    .replace(/\.(?=\d{3}(\D|$))/g, '') // quita puntos usados como separador de miles
    .replace(/,/g, '');                // quita comas
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

export const recomputeEstado = async (req, res, next) => {
  try {
    const { id } = req.params;
    const payload = parseJwtPayload(req.headers['authorization'] || '');
    const userId = String(payload.sub || payload.user_id || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();

    let item = await RegistrationModel.getById(id);
    if (!item) item = await RegistrationModel.getByShortCode(id);
    if (!item) return res.status(404).json({ success:false, message:'No encontrado' });

    const belongs = (
      (item.userId && userId && String(item.userId) === userId) ||
      (item?.datosPersona?.email && email && String(item.datosPersona.email).toLowerCase() === email)
    );
    if (!belongs) return res.status(403).json({ success:false, message:'No autorizado' });

    const updated = await RegistrationModel.recomputeEstado(item.id);
    return res.json({ success:true, data: updated });
  } catch (err) { next(err); }
};

export const listPayments = async (req, res, next) => {
  try {
    const estado = String(req.query.estado || '').trim();
    const items = await RegistrationModel.listPaymentsByEstado(estado);
    return res.json({ success:true, data: items });
  } catch (err) { next(err); }
};

function isAdminEmailFromJwt(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return false;
  if (e.endsWith('@buenohotel.com.do')) return true;
  const raw = String(process.env.FACTURA_ADMIN_EMAILS || process.env.ADMIN_NOTIFY_EMAILS || '');
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

function detallePermiteVerComprobanteCliente(det) {
  if (!det || typeof det !== 'object') return false;
  const flag = (raw) => {
    let v = raw;
    if (v && typeof v === 'object' && Object.prototype.hasOwnProperty.call(v, 'BOOL')) v = v.BOOL;
    return v === true || v === 'true' || String(v).toLowerCase() === 'on';
  };
  return flag(det.permite_ver_comprobante_cliente) && flag(det.comprobanteGeneradoPorAdmin);
}

function escapeHtmlLite(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export const getFacturaBorrador = async (req, res, _next) => {
  try {
    const { id } = req.params;
    const ref = String(req.query?.referenciaOperahotel || '').trim();
    if (ref === '1' || ref.toLowerCase() === 'true') {
      return res.json({ success: true, data: SAMPLE_FACTURA_OPERAHOTEL, esSoloReferenciaVisual: true });
    }

    const payload = parseJwtPayload(req.headers['authorization'] || '');
    const email = String(payload.email || '').trim().toLowerCase();
    const userId = String(payload.sub || payload.user_id || '').trim();
    if (!userId && !email) {
      return res.status(401).json({ success: false, message: 'Inicia sesión para ver el comprobante.' });
    }

    let item = await RegistrationModel.getById(id);
    if (!item) item = await RegistrationModel.getByShortCode(id);
    if (!item) return res.status(404).json({ success: false, message: 'Registro no encontrado' });

    const belongs =
      (item.userId && userId && String(item.userId) === userId) ||
      (item?.datosPersona?.email && email && String(item.datosPersona.email).toLowerCase() === email);
    const admin = isAdminEmailFromJwt(email) || isAdminFromJwtPayload(payload);

    if (!admin && !belongs) {
      return res.status(403).json({ success: false, message: 'No autorizado' });
    }

    const det = item.detalles && typeof item.detalles === 'object' ? item.detalles : {};
    if (!admin && belongs && !detallePermiteVerComprobanteCliente(det)) {
      return res.status(403).json({
        success: false,
        code: 'COMPROBANTE_NO_DISPONIBLE',
        message:
          'Tu comprobante fiscal aún no está listo. Administración lo publica en Mis reservas cuando lo configure y genere.'
      });
    }

    const draft = await buildCreditFiscalDraftFromRegistration(item.id);
    const formato = String(req.query.formato || '').trim().toLowerCase();
    if (formato === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(renderFacturaOperativaHtml(draft));
    }
    return res.json({ success: true, data: draft });
  } catch (err) {
    const msgRaw = String(err?.message || err || 'Error');
    if (msgRaw.includes('No hay pagos aprobados')) {
      return res.status(403).json({
        success: false,
        code: 'SIN_PAGOS_APROBADOS',
        message: msgRaw
      });
    }
    if (err?.code === 'SIN_PRECIO_EVENTO' || msgRaw.includes('precio total del evento')) {
      return res.status(403).json({
        success: false,
        code: 'SIN_PRECIO_EVENTO',
        message: msgRaw
      });
    }
    if (err?.code === 'PAGO_INCOMPLETO' || msgRaw.includes('total aprobado cubre el precio')) {
      return res.status(403).json({
        success: false,
        code: 'PAGO_INCOMPLETO',
        message: msgRaw,
        ...(err?.meta || {})
      });
    }
    if (msgRaw.toLowerCase().includes('no encontrado')) {
      return res.status(404).json({ success: false, message: msgRaw });
    }
    console.error('[getFacturaBorrador]', err);
    const formato = String(req.query?.formato || '').trim().toLowerCase();
    if (formato === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(500).send(
        `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>Error</title></head><body style="font-family:system-ui,sans-serif;padding:24px;"><h1>No se pudo generar el comprobante</h1><p>${escapeHtmlLite(msgRaw)}</p></body></html>`
      );
    }
    return res.status(500).json({ success: false, message: msgRaw || 'Error generando comprobante' });
  }
};

export const getRegistrationById = async (req, res, next) => {
  try {
    const { id } = req.params;
    let item = await RegistrationModel.getById(id);
    if (!item) {
      // Permitir buscar por codigo corto
      item = await RegistrationModel.getByShortCode(id);
    }
    if (!item) return res.status(404).json({ success:false, message:'No encontrado' });
    return res.json({ success:true, data: item });
  } catch (err) { next(err); }
};

export const updatePagoEstado = async (req, res, next) => {
  try {
    const { id, pagoId } = req.params;
    const { estado } = req.body || {};
    if (!estado) return res.status(400).json({ success:false, message:'estado es requerido' });
    const ts = nowISO();
    const updated = await RegistrationModel.updatePagoEstado(id, pagoId, String(estado).toLowerCase(), ts);
    return res.json({ success:true, data: updated });
  } catch (err) { next(err); }
};

// Extraer sub/email desde JWT (Authorization: Bearer ...)
function parseJwtPayload(authHeader){
  try {
    const m = String(authHeader||'').match(/^Bearer\s+(.+)$/i);
    const token = m ? m[1] : '';
    if (!token || token.split('.').length<3) return {};
    const payload = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString('utf8'));
    return payload || {};
  } catch { return {}; }
}

export const getMyReservations = async (req, res, next) => {
  try {
    const payload = parseJwtPayload(req.headers['authorization'] || '');
    const userId = String(payload.sub || payload.user_id || '').trim();
    const email = String(payload.email || '').trim();

    if (!userId && !email){
      return res.status(401).json({ success:false, message:'No autenticado' });
    }

    let items = [];
    if (userId) {
      items = await RegistrationModel.getByUserId(userId);
    }
    if ((!items || items.length === 0) && email){
      items = await RegistrationModel.getByEmail(email);
    }

    return res.json({ success:true, data: items });
  } catch (err) {
    next(err);
  }
};

export const createRegistration = async (req, res, next) => {
  try {
    const {
      eventoId,
      eventId,                 // admite ambos nombres
      nombre,
      apellido,
      email,
      telefono,
      montoPago,               // opcional
      metodoPago,              // 'tarjeta' | 'transferencia'
      aceptaTerminos = true,
      ...rest                  // campos adicionales (iglesia, fechas, etc.)
    } = req.body || {};

    const _eventId = eventId || eventoId;

    // Validaciones mínimas
    if (!_eventId) return res.status(400).json({ success:false, message:'eventId es requerido' });
    if (!email)   return res.status(400).json({ success:false, message:'email es requerido' });
    if (!telefono)return res.status(400).json({ success:false, message:'telefono es requerido' });
    if (!metodoPago) return res.status(400).json({ success:false, message:'metodoPago es requerido' });

    // IDs / timestamps
    const id = randomUUID();
    const ts  = nowISO();

    // Generar código corto entendible (prefijo del evento + base36 tiempo + 2 letras)
    function slugLetters(str){
      const s = String(str||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z]/g,'').toUpperCase();
      if (!s) return 'EV';
      // tomar primeras 3 letras distintas
      const uniq=[]; for(const ch of s){ if(!uniq.includes(ch)) uniq.push(ch); if(uniq.length>=3) break; }
      return (uniq.join('')||'EV').slice(0,3);
    }
    async function genCodigoCorto(){
      const pref = slugLetters(rest.eventoNombre || rest.nombreEvento || rest.eventName || _eventId);
      const t = Date.now().toString(36).toUpperCase().slice(-6);
      const r = Math.random().toString(36).toUpperCase().slice(2,4);
      return `${pref}-${t}${r}`;
    }
    // asegurar (mejor esfuerzo) no duplicado
    let codigoCorto = await genCodigoCorto();
    for (let i=0; i<2; i++){
      const exists = await RegistrationModel.getByShortCode(codigoCorto);
      if (!exists) break;
      codigoCorto = await genCodigoCorto();
    }

    // Armar estructura TAL CUAL el ejemplo
    const pagos = [];
    // Si viene 'OTRO' desde el front, usar montoPagoOtro como respaldo
    let monto = asNumber(montoPago);
    if (!Number.isFinite(monto) || monto <= 0) {
      const alt = asNumber(rest?.montoPagoOtro);
      if (Number.isFinite(alt) && alt > 0) monto = alt;
    }

    if (monto > 0) {
      pagos.push({
        id: randomUUID(),
        metodo: metodoPago,
        tipo: 'abono',
        monto,
        estado: 'pendiente',          // aún no cobrado
        fecha: ts
      });
    }

    // userId: tomar de body o derivar de JWT; sólo si no vacío
    const jwtPayload = parseJwtPayload(req.headers['authorization'] || '');
    const userIdCandidate = String(rest.usuarioId || rest.userId || jwtPayload.sub || jwtPayload.user_id || '').trim();

    const detallesFromRest = (() => {
      const out = {};
      const src = (rest && typeof rest === 'object') ? rest : {};
      for (const k of Object.keys(src)) {
        const v = src[k];
        if (v === undefined || v === null) continue;
        if (typeof v === 'string' && v.trim() === '') continue;
        out[k] = v;
      }
      const doc = src.cedula || src.cédula || src.pasaporte || src.documento || src.identificacion || src.identificación || src.documentoIdentidad || src.documento_identidad || src.numeroDocumento || src.numero_documento || src.cedulaPasaporte || src.cedula_pasaporte || src.cedulaOPasaporte || src.cedula_o_pasaporte;
      if (doc != null && String(doc).trim() !== '') out.documento = doc;
      return out;
    })();

    // Consolidación: buscar registro existente por (userId OR email) + eventId
    const existing = await RegistrationModel.findExistingByUserOrEmailEvent({ userId: userIdCandidate || null, email, eventId: _eventId });
    if (existing) {
      try {
        if (detallesFromRest && Object.keys(detallesFromRest).length) {
          await RegistrationModel.upsertDetallesAndTouch(existing.id, detallesFromRest, ts);
        }
      } catch (_) {}
      // Si ya existe, agregar abono si se envió monto; si no, sólo tocar fecha
      if (pagos.length) {
        await RegistrationModel.appendPagoAndTouch(existing.id, pagos[0], ts);
        return res.status(200).json({ success:true, message:'Abono agregado al registro existente', data:{ registroId: existing.id, codigo: existing.codigoCorto || null, appended:true } });
      } else {
        await RegistrationModel.touchOnly(existing.id, ts);
        return res.status(200).json({ success:true, message:'Registro existente actualizado', data:{ registroId: existing.id, codigo: existing.codigoCorto || null, appended:false } });
      }
    }

    // Si no existe, crear nuevo item
    // Sanitizar: no enviar strings vaccos a DynamoDB
    const datosPersona = {};
    if (nombre) datosPersona.nombre = nombre;
    if (apellido) datosPersona.apellido = apellido;
    if (email) datosPersona.email = email;
    if (telefono) datosPersona.telefono = telefono;

    const detalles = { ...detallesFromRest };
    const eventoNombreVal = rest.eventoNombre || rest.nombreEvento || rest.eventName;
    if (eventoNombreVal) detalles.eventoNombre = eventoNombreVal;

    const item = {
      id,
      eventId: _eventId,
      eventoId: _eventId,
      codigoCorto,
      aceptaTerminos: !!aceptaTerminos,
      metodoPago,
      estado: 'pendiente',
      fechaRegistro: ts,
      fechaActualizacion: ts,
      totalAprobado: 0,
      datosPersona,
      detalles,
      ...(pagos.length ? { pagos } : {})
    };
    if (userIdCandidate) item.userId = userIdCandidate;

    await RegistrationModel.createRegistration(item);
    return res.status(201).json({ success:true, message:'Registro creado', data:{ registroId: id, codigo: codigoCorto } });
  } catch (err) {
    // Conditionally return conflict if ya existe id (muy raro con UUID)
    if (String(err?.name).includes('ConditionalCheckFailed')) {
      return res.status(409).json({ success:false, message:'Registro ya existe' });
    }
    next(err);
  }
};
