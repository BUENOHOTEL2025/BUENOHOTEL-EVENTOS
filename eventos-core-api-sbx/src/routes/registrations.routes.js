import { Router } from 'express';
import { createRegistration, getMyReservations, listPayments, getRegistrationById, getFacturaBorrador, updatePagoEstado, recomputeEstado } from '../controllers/registration.controller.js';

const router = Router();

// Crear registro
router.post('/', createRegistration);
router.get('/mias', getMyReservations);
// Admin/payments
router.get('/pagos', listPayments);
router.get('/:id/factura-borrador', getFacturaBorrador);
router.get('/:id', getRegistrationById);
router.patch('/:id/pagos/:pagoId/estado', updatePagoEstado);
router.post('/:id/recompute-estado', recomputeEstado);

export default router;
