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

const router = Router();

// Admin
router.get('/mias', getMyReservas);
router.get('/pagos', listPagos); // <── AQUÍ, ANTES DE "/:id"
router.get('/', getReservasByUser);
router.patch('/:id/comprobante-cliente', patchComprobanteCliente);
router.patch('/:id/factura-config', patchFacturaConfig);
router.get('/:id', getReservaById);
router.post('/:id/pagos', addPago);
router.patch('/:id/pagos/:pagoId/estado', updatePagoEstado);
// Eliminar pago individual
router.delete('/:id/pagos/:pagoId', deletePago);
// Eliminar registro completo
router.delete('/:id', deleteReserva);

export default router;
