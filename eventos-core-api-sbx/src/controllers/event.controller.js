import EventService from '../services/event.service.js';

const SENSITIVE_EVENT_KEY =
  /password|secret|token|apikey|api_key|private|accesskey|internal|costo_interno|notas_internas/i;

function publicEvent(ev) {
  if (!ev || typeof ev !== 'object') return ev;
  const out = {};
  for (const [k, v] of Object.entries(ev)) {
    if (SENSITIVE_EVENT_KEY.test(k)) continue;
    out[k] = v;
  }
  return out;
}

export const getAllEvents = async (req, res, next) => {
  try {
    const events = await EventService.getAll();
    const data = (events || []).map(publicEvent);
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    console.error('Error en getAllEvents:', error);
    next(error);
  }
};

export const getEventById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const event = await EventService.getById(id);
    if (!event)
      return res.status(404).json({ success: false, message: 'Evento no encontrado' });
    res.json({ success: true, data: publicEvent(event) });
  } catch (error) {
    console.error('Error en getEventById:', error);
    next(error);
  }
};

export const updateChurchRequirement = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { requireChurch } = req.body;

    if (typeof requireChurch !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'El campo requireChurch debe ser boolean (true/false)'
      });
    }

    const updated = await EventService.updateChurchRequirement(id, requireChurch);
    if (!updated)
      return res.status(404).json({ success: false, message: 'Evento no encontrado' });

    res.json({
      success: true,
      message: 'Requerimiento de iglesia actualizado correctamente',
      data: updated
    });
  } catch (error) {
    console.error('Error en updateChurchRequirement:', error);
    res.status(500).json({ success: false, message: 'Error interno', error: error.message });
  }
};
