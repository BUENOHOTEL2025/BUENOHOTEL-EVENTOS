import { Router } from 'express';
import {
  getAllEvents,
  getEventById,
  updateChurchRequirement
} from '../controllers/event.controller.js';

const router = Router();

router.get('/', getAllEvents);
router.get('/:id', getEventById);
router.put('/:id/church-requirement', updateChurchRequirement);

export default router;
