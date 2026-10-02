import { Router } from 'express';
import { updatePagoEstado } from '../controllers/pagos.controller.js';

const router = Router();

// PATCH /api/reservas/:registroId/pagos/:pagoId/estado
router.patch('/:registroId/pagos/:pagoId/estado', updatePagoEstado);

export default router;
