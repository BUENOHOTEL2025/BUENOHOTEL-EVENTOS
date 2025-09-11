import { getAzulConfig, buildHostedPaymentPayload, getPaymentPageUrl, verifySignature } from '../utils/azul.js';
import { v4 as uuidv4 } from 'uuid';
import EventRegistration from '../models/EventRegistration.js';

/**
 * Crea una sesión de pago en AZUL (Hosted Payment) y registra un pago pendiente en el registro del evento.
 * Body: { eventoId, monto, registroId? }
 */
export async function createSession(req, res){
  try {
    const user = req.user; // authenticateJWT
    const { eventoId, monto, registroId } = req.body || {};
    if (!eventoId || !monto) return res.status(400).json({ success:false, message:'eventoId y monto son requeridos' });

    // Asegurar que exista un registro para el usuario/evento
    let registro = null;
    if (registroId){
      registro = await EventRegistration.getById(registroId);
    } else {
      registro = await EventRegistration.getByUserAndEvent(user?.sub || user?.id || user?.userId, eventoId);
      if (!registro){
        // Crear registro básico si no existe
        registro = await EventRegistration.create({
          usuarioId: user?.sub || user?.id || user?.userId,
          eventoId,
          detalles: { eventoNombre: req.body?.eventoNombre || undefined },
          estado: 'pendiente'
        });
      }
    }
    if (!registro) return res.status(400).json({ success:false, message:'No se pudo crear/obtener el registro' });

    const pagoId = uuidv4();
    const pago = {
      id: pagoId,
      fecha: new Date().toISOString(),
      monto: Number(monto),
      metodo: 'tarjeta',
      estado: 'pendiente',
      tipo: 'azul',
    };
    // Guardar pago pendiente en el registro
    try {
      await EventRegistration.addPayment(registro.id, pago);
    } catch (e) {
      console.error('azul addPayment error', e);
      return res.status(500).json({ success:false, message:'No se pudo preparar el pago' });
    }

    // Armar payload AZUL
    const cfg = getAzulConfig();
    const orderNumber = `${registro.id}-${pagoId}`;
    const payload = buildHostedPaymentPayload({
      orderNumber,
      amount: Number(monto),
      currency: cfg.AZUL_CURRENCY,
      customerEmail: (req.body?.email || req.user?.email || ''),
      approvedUrl: cfg.PAY_RETURN_URL,
      declinedUrl: cfg.PAY_RETURN_URL,
      cancelUrl: cfg.PAY_RETURN_URL,
    });

    const paymentPageUrl = getPaymentPageUrl();
    return res.json({ success:true, data: { paymentPageUrl, payload, registroId: registro.id, pagoId } });
  } catch (e) {
    console.error('azul createSession error', e);
    return res.status(500).json({ success:false, message:'No se pudo iniciar el pago' });
  }
}

/**
 * Webhook de AZUL (Notification URL). Debe validar firma y actualizar el estado del pago.
 * Nota: ajusta los nombres de campos según la notificación real de AZUL.
 */
export async function webhook(req, res){
  try {
    const body = req.body || {};
    // Ejemplo: { OrderNumber, Amount, CurrencyCode, Status, Signature }
    const provided = body.Signature;
    const fieldsToVerify = { ...body }; delete fieldsToVerify.Signature;
    const ok = verifySignature(fieldsToVerify, provided, process.env.AZUL_AUTH_KEY || '');
    if (!ok){
      console.warn('AZUL webhook firma inválida');
      return res.status(400).json({ success:false });
    }
    const order = String(body.OrderNumber || '');
    const status = String(body.Status || '').toLowerCase(); // approved/declined/canceled
    const monto = Number(body.Amount || 0);

    // Extraer registroId y pagoId del OrderNumber: formato `${registro.id}-${pagoId}`
    const [registroId, pagoId] = order.split('-');
    if (!registroId || !pagoId) return res.json({ success:true });

    let finalEstado = 'pendiente';
    if (status.includes('approved')) finalEstado = 'aprobado';
    else if (status.includes('declin') || status.includes('denied')) finalEstado = 'cancelado';
    else if (status.includes('cancel')) finalEstado = 'cancelado';

    try {
      await EventRegistration.updatePaymentStatus(registroId, pagoId, finalEstado);
    } catch (e) {
      console.error('azul webhook updatePaymentStatus error', e);
    }
    return res.json({ success:true });
  } catch (e) {
    console.error('azul webhook error', e);
    return res.status(200).json({ success:true }); // responder 200 para evitar reintentos infinitos, pero logueamos
  }
}

/**
 * Confirmación desde el front (Return URL). Valida y devuelve estado amigable.
 */
export async function confirm(req, res){
  try {
    const body = req.body || {};
    const provided = body.Signature;
    const fieldsToVerify = { ...body }; delete fieldsToVerify.Signature;
    const ok = verifySignature(fieldsToVerify, provided, process.env.AZUL_AUTH_KEY || '');
    const order = String(body.OrderNumber || '');
    const [registroId, pagoId] = order.split('-');

    const status = String(body.Status || '').toLowerCase();
    let finalEstado = 'pendiente';
    if (status.includes('approved')) finalEstado = 'aprobado';
    else if (status.includes('declin') || status.includes('denied')) finalEstado = 'cancelado';
    else if (status.includes('cancel')) finalEstado = 'cancelado';

    if (registroId && pagoId){
      try {
        await EventRegistration.updatePaymentStatus(registroId, pagoId, finalEstado);
      } catch (e) {
        console.error('azul confirm updatePaymentStatus error', e);
      }
    }

    return res.json({ success:true, data:{ registroId, pagoId, estado: finalEstado, signatureValid: !!ok } });
  } catch (e) {
    console.error('azul confirm error', e);
    return res.status(500).json({ success:false, message:'No se pudo confirmar el pago' });
  }
}
