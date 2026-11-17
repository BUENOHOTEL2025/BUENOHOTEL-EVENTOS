import { Router } from 'express';
import {
  getAllEvents,
  getEventById,
  updateChurchRequirement
} from '../controllers/event.controller.js';
import { requirePanelJwt } from '../middleware/jwtGuard.middleware.js';

const router = Router();

router.get('/', getAllEvents);
router.get('/:id', getEventById);
router.put('/:id/church-requirement', requirePanelJwt, updateChurchRequirement);

export default router;
