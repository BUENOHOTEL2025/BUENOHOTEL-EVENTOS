import { Router } from 'express';
import { createRegistration, listMine, listByUser, getOne, addPayment, listPendingPaymentsByUser, updatePaymentStatus, listAllPendingPayments, listPaymentsByEstadoAdmin } from '../controllers/registrationController.js';
import { authenticateJWT, authorize } from '../utils/jwt.js';
import { eventRegistrationValidations } from '../middleware/validation.js';

const router = Router();

// Crear un registro de evento
router.post('/', eventRegistrationValidations, createRegistration);
// Listar mis registros (usuario autenticado)
router.get('/mine', authenticateJWT, listMine);
// Compatibilidad con español: alias /mias
router.get('/mias', authenticateJWT, listMine);
// Listar por userId (query)
router.get('/', listByUser);

// Agregar un pago (abono) a un registro
router.post('/:id/pagos', authenticateJWT, addPayment);

// Admin: listar pagos pendientes por usuario
router.get('/pagos/pendientes', authenticateJWT, authorize('admin'), listPendingPaymentsByUser);
// Admin: listar todos los pagos pendientes
router.get('/pagos/pendientes/todos', authenticateJWT, authorize('admin'), listAllPendingPayments);
// Admin: listar pagos por estado
router.get('/pagos', authenticateJWT, authorize('admin'), listPaymentsByEstadoAdmin);
// Admin: actualizar estado de un pago
router.patch('/:id/pagos/:pagoId/estado', authenticateJWT, authorize('admin'), updatePaymentStatus);

// Obtener un registro por id (con totales) - debe ir AL FINAL para no capturar rutas como /pagos/...
router.get('/:id', authenticateJWT, getOne);

export default router;
