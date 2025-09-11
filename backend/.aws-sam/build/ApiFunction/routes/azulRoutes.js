import { Router } from 'express';
import { authenticateJWT } from '../utils/jwt.js';
import { createSession, webhook, confirm } from '../controllers/azulController.js';

const router = Router();

// Crear sesión de pago (usuario autenticado)
router.post('/session', authenticateJWT, createSession);

// Webhook (AZUL -> backend). No requiere auth, valida firma internamente.
router.post('/webhook', webhook);

// Confirmación desde return URL (front llama al backend para validar)
router.post('/confirm', authenticateJWT, confirm);

export default router;
