import { Router } from 'express';
import {
  getMyReservas,
  getReservasByUser,
  getReservaById,
  listPagos,
  updatePagoEstado,
  addPago,
  deleteReserva,
  deletePago,
  patchComprobanteCliente,
  patchFacturaConfig
} from '../controllers/reservas.controller.js';
import { requirePanelJwt, requireVerifiedJwt } from '../middleware/jwtGuard.middleware.js';

const router = Router();

router.get('/mias', requireVerifiedJwt, getMyReservas);
router.get('/pagos', requirePanelJwt, listPagos);
router.get('/', requirePanelJwt, getReservasByUser);
router.patch('/:id/comprobante-cliente', requirePanelJwt, patchComprobanteCliente);
router.patch('/:id/factura-config', requirePanelJwt, patchFacturaConfig);
router.get('/:id', requireVerifiedJwt, getReservaById);
router.post('/:id/pagos', requirePanelJwt, addPago);
router.patch('/:id/pagos/:pagoId/estado', requirePanelJwt, updatePagoEstado);
router.delete('/:id/pagos/:pagoId', requirePanelJwt, deletePago);
router.delete('/:id', requirePanelJwt, deleteReserva);

export default router;
