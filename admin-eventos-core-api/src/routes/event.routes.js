import { Router } from 'express';
import {
  getAllEvents,
  getEventById,
  createOrUpdateEvent,
  updateChurchRequirement
} from '../controllers/event.controller.js';
import { getTasaCambio, updateTasaCambio, getConfigDias, updateConfigDias } from '../controllers/config.controller.js';

const router = Router();

router.get('/', getAllEvents);
router.post('/', createOrUpdateEvent);

// Tasa de cambio (DEBE ir antes de /:id)
router.get('/tasa-cambio', getTasaCambio);
router.post('/tasa-cambio', updateTasaCambio);
router.put('/tasa-cambio', updateTasaCambio);

// Configuración de días de entrada/salida (DEBE ir antes de /:id)
router.get('/config-dias', getConfigDias);
router.put('/config-dias', updateConfigDias);

router.get('/:id', getEventById);
router.put('/:id/church-requirement', updateChurchRequirement);

export default router;
