import { Router } from 'express';
import { updatePagoEstado } from '../controllers/pagos.controller.js';
import { requirePanelJwt } from '../middleware/jwtGuard.middleware.js';

const router = Router();

router.patch('/:registroId/pagos/:pagoId/estado', requirePanelJwt, updatePagoEstado);

export default router;
