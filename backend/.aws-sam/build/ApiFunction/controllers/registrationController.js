import EventRegistration from '../models/EventRegistration.js';
import User from '../models/User.js';

/**
 * Crea un registro de evento
 * Espera en req.body:
 * - eventoId (string) [obligatorio]
 * - nombre, apellido, email, telefono, iglesia [obligatorios]
 * - otraIglesia, liderIglesia, contactoLider [obligatorios si iglesia=="Otra"]
 * - montoPago (number) [obligatorio]
 * - aceptaTerminos (boolean true) [obligatorio]
 * - usuarioId (opcional si hay auth; si no, null)
 * - detalles (opcional)
 */
export const createRegistration = async (req, res) => {
  try {
    const {
      eventoId,
      usuarioId: usuarioIdFromBody = null,
      nombre,
      apellido,
      email,
      telefono,
      iglesia,
      otraIglesia,
      liderIglesia,
      contactoLider,
      montoPago,
      metodoPago,
      aceptaTerminos,
      detalles = {},
      // Campos adicionales para hotel (se aceptan tanto en raíz como en detalles)
      tipoHabitacion,
      categoria,
      fechaEntrada,
      fechaSalida,
      documento,
      fechaNacimiento,
      telefono: telefonoAlt,
      email: emailAlt
    } = req.body;

    // Preferir el usuario autenticado si está disponible
    const usuarioId = req.user?.sub || usuarioIdFromBody || null;

    // Unificar detalles con campos del hotel (sin sobrescribir los ya presentes en detalles)
    const detallesHotel = {
      ...(detalles || {}),
      ...(tipoHabitacion !== undefined ? { tipoHabitacion } : {}),
      ...(categoria !== undefined ? { categoria } : {}),
      ...(fechaEntrada !== undefined ? { fechaEntrada } : {}),
      ...(fechaSalida !== undefined ? { fechaSalida } : {}),
      ...(documento !== undefined ? { documento } : {}),
      ...(fechaNacimiento !== undefined ? { fechaNacimiento } : {}),
      // permitir override opcional de contacto en detalles
      ...(telefonoAlt !== undefined ? { telefono: telefonoAlt } : {}),
      ...(emailAlt !== undefined ? { email: emailAlt } : {})
    };

    const payload = {
      eventoId,
      usuarioId,
      metodoPago: metodoPago || 'tarjeta',
      datosPersona: {
        nombre,
        apellido,
        email: emailAlt || email,
        telefono: telefonoAlt || telefono,
        iglesia,
        ...(iglesia === 'Otra' ? { otraIglesia, liderIglesia, contactoLider } : {})
      },
      pagos: [],
      aceptaTerminos: !!aceptaTerminos,
      detalles: detallesHotel
    };

    // Si hay usuarioId y eventoId, intentar UPSERT: agregar abono al existente
    if (usuarioId && eventoId) {
      try {
        const existente = await EventRegistration.getByUserAndEvent(usuarioId, eventoId);
        if (existente && existente.id) {
          const updated = await EventRegistration.addPayment(existente.id, {
            monto: Number(montoPago),
            metodo: metodoPago || 'tarjeta',
            tipo: 'abono',
          });
          return res.status(200).json({ success: true, data: updated, upsert: true });
        }
      } catch (e) {
        // Si falla la consulta, continuamos con creación normal
        console.warn('getByUserAndEvent fallo, se procede a crear nuevo:', e?.message);
      }
    }

    const created = await EventRegistration.create(payload);
    // Añadir el primer abono usando la lógica del modelo (id/estado)
    const withFirstPayment = await EventRegistration.addPayment(created.id, {
      monto: Number(montoPago),
      metodo: metodoPago || 'tarjeta',
      tipo: 'abono'
    });
    return res.status(201).json({ success: true, data: withFirstPayment });
  } catch (error) {
    console.error('createRegistration error:', error);
    return res.status(500).json({ success: false, message: 'No se pudo crear el registro', error: error.message });
  }
};

/**
 * Lista todos los pagos pendientes (admin)
 * GET /api/registrations/pagos/pendientes/todos
 */
export const listAllPendingPayments = async (_req, res) => {
  try {
    const pendientes = await EventRegistration.getAllPendingPayments();
    // Enriquecer con datos de usuario (nombre, apellido, email)
    const ids = [...new Set(pendientes.map(p => p.usuarioId).filter(Boolean))];
    const usersMap = {};
    await Promise.all(ids.map(async (uid) => {
      try {
        const u = await User.getById(uid);
        if (u) usersMap[uid] = u;
      } catch(_) {}
    }));
    const enriched = pendientes.map(p => {
      const u = p.usuarioId ? usersMap[p.usuarioId] : null;
      const nombreCompleto = u ? [u.nombre, u.apellido].filter(Boolean).join(' ').trim() : null;
      return { ...p, usuario: u ? { id: u.id, email: u.email, nombre: u.nombre, apellido: u.apellido, nombreCompleto } : null };
    });
    return res.json({ success: true, data: enriched });
  } catch (error) {
    console.error('listAllPendingPayments error:', error);
    return res.status(500).json({ success: false, message: 'No se pudieron obtener pagos pendientes' });
  }
};

/**
 * Lista pagos por estado (admin)
 * GET /api/reservas/pagos?estado=pendiente|aprobado|cancelado|todos
 */
export const listPaymentsByEstadoAdmin = async (req, res) => {
  try {
    const estado = (req.query?.estado || 'pendiente').toString();
    const filtroUser = req.query?.userId ? String(req.query.userId) : null;
    const filtroEvento = req.query?.eventoId ? String(req.query.eventoId) : null;
    let items = await EventRegistration.getAllPaymentsByEstado(estado);
    if (filtroUser) items = items.filter(x => String(x.usuarioId||'') === filtroUser);
    if (filtroEvento) items = items.filter(x => String(x.eventoId||'') === filtroEvento);
    const ids = [...new Set(items.map(p => p.usuarioId).filter(Boolean))];
    const usersMap = {};
    await Promise.all(ids.map(async (uid) => {
      try { const u = await User.getById(uid); if (u) usersMap[uid] = u; } catch(_) {}
    }));
    const enriched = items.map(p => {
      const u = p.usuarioId ? usersMap[p.usuarioId] : null;
      const nombreCompleto = u ? [u.nombre, u.apellido].filter(Boolean).join(' ').trim() : null;
      return { ...p, usuario: u ? { id: u.id, email: u.email, nombre: u.nombre, apellido: u.apellido, nombreCompleto } : null };
    });
    return res.json({ success: true, data: enriched });
  } catch (error) {
    console.error('listPaymentsByEstadoAdmin error:', error);
    return res.status(500).json({ success: false, message: 'No se pudieron obtener pagos' });
  }
};

/**
 * Lista registros del usuario autenticado
 */
export const listMine = async (req, res) => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'No autenticado' });
    }
    const items = await EventRegistration.getByUserId(userId);
    return res.json({ success: true, data: items });
  } catch (error) {
    console.error('listMine error:', error);
    return res.status(500).json({ success: false, message: 'No se pudieron obtener tus registros' });
  }
};

/**
 * Lista registros por userId (query ?userId=)
 */
export const listByUser = async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Falta userId' });
    }
    const items = await EventRegistration.getByUserId(userId);
    return res.json({ success: true, data: items });
  } catch (error) {
    console.error('listByUser error:', error);
    return res.status(500).json({ success: false, message: 'No se pudieron obtener los registros del usuario' });
  }
};

/**
 * Obtiene un registro por id, incluyendo totales computados
 */
export const getOne = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, message: 'Falta id' });
    const item = await EventRegistration.getWithComputedTotals(id);
    if (!item) return res.status(404).json({ success: false, message: 'Registro no encontrado' });
    return res.json({ success: true, data: item });
  } catch (error) {
    console.error('getOne error:', error);
    return res.status(500).json({ success: false, message: 'No se pudo obtener el registro' });
  }
};

/**
 * Agrega un pago (abono) a un registro
 * Body: { monto:number, metodo?:string, referencia?:string, tipo?:string }
 */
export const addPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { monto, metodo, referencia, tipo } = req.body || {};
    if (!id) return res.status(400).json({ success: false, message: 'Falta id' });
    if (monto === undefined || monto === null || isNaN(Number(monto))) {
      return res.status(400).json({ success: false, message: 'Monto inválido' });
    }
    const updated = await EventRegistration.addPayment(id, { monto: Number(monto), metodo, referencia, tipo });
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('addPayment error:', error);
    return res.status(500).json({ success: false, message: 'No se pudo agregar el pago' });
  }
};

/**
 * Lista pagos pendientes por usuario (admin)
 * GET /api/registrations/pagos/pendientes?userId=...
 */
export const listPendingPaymentsByUser = async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Falta userId' });
    }
    const pendientes = await EventRegistration.getPendingPaymentsByUser(userId);
    return res.json({ success: true, data: pendientes });
  } catch (error) {
    console.error('listPendingPaymentsByUser error:', error);
    return res.status(500).json({ success: false, message: 'No se pudieron obtener pagos pendientes' });
  }
};

/**
 * Actualiza el estado de un pago específico (admin)
 * PATCH /api/registrations/:id/pagos/:pagoId/estado { estado: 'aprobado'|'pendiente'|'cancelado' }
 */
export const updatePaymentStatus = async (req, res) => {
  try {
    const { id, pagoId } = req.params;
    const { estado } = req.body || {};
    if (!id || !pagoId) return res.status(400).json({ success: false, message: 'Faltan parámetros' });
    const allowed = ['pendiente','aprobado','cancelado'];
    if (!allowed.includes(String(estado).toLowerCase())){
      return res.status(400).json({ success: false, message: 'Estado inválido' });
    }
    const updated = await EventRegistration.updatePaymentStatus(id, pagoId, String(estado).toLowerCase());
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('updatePaymentStatus error:', error);
    return res.status(500).json({ success: false, message: 'No se pudo actualizar el estado del pago', error: error.message });
  }
};

export default { createRegistration };
