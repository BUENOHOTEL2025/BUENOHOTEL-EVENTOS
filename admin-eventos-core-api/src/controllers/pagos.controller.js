import RegistrationModel from '../models/registration.model.js';

export async function updatePagoEstado(req, res) {
  try {
    const registroId = req.params.registroId;
    const pagoId = req.params.pagoId;
    const { estado } = req.body;
    const ts = new Date().toISOString();

    if (!estado) {
      return res.status(400).json({ success: false, message: 'Estado requerido' });
    }

    const actualizado = await RegistrationModel.updatePagoEstado(registroId, pagoId, estado, ts);
    
    return res.json({ success: true, data: actualizado });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Error actualizando pago' });
  }
}
