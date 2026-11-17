import { Router } from 'express';
import {
  createRegistration,
  getMyReservations,
  listPayments,
  getRegistrationById,
  getFacturaBorrador,
  updatePagoEstado,
  recomputeEstado
} from '../controllers/registration.controller.js';
import { requirePanelJwt, requireVerifiedJwt } from '../middleware/jwtGuard.middleware.js';

const router = Router();

router.post('/', createRegistration);
router.get('/mias', requireVerifiedJwt, getMyReservations);
router.get('/pagos', requirePanelJwt, listPayments);
router.get('/:id/factura-borrador', requireVerifiedJwt, getFacturaBorrador);
router.get('/:id', requireVerifiedJwt, getRegistrationById);
router.patch('/:id/pagos/:pagoId/estado', requirePanelJwt, updatePagoEstado);
router.post('/:id/recompute-estado', requireVerifiedJwt, recomputeEstado);

export default router;
