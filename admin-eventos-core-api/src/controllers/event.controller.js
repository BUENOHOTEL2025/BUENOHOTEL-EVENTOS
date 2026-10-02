import EventService from '../services/event.service.js';

export const getAllEvents = async (req, res, next) => {
  try {
    const events = await EventService.getAll();
    res.json({ success: true, count: events.length, data: events });
  } catch (error) {
    console.error('Error en getAllEvents:', error);
    next(error);
  }
};

export const createOrUpdateEvent = async (req, res, next) => {
  try {
    const eventData = req.body;
    
    if (!eventData.id) {
      return res.status(400).json({ ok: false, message: 'Se requiere un ID para el evento' });
    }

    const result = await EventService.createOrUpdate(eventData);
    res.json({ ok: true, success: true, data: result, message: 'Evento guardado correctamente' });
  } catch (error) {
    console.error('Error en createOrUpdateEvent:', error);
    res.status(500).json({ ok: false, success: false, message: error.message });
  }
};

export const getEventById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const event = await EventService.getById(id);
    if (!event)
      return res.status(404).json({ success: false, message: 'Evento no encontrado' });
    res.json({ success: true, data: event });
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
