import { Router } from 'express';
import { requirePanelJwt } from '../middleware/jwtGuard.middleware.js';
import { listPublic, listAdmin, presignAdmin, loteAdmin, deleteAdmin, patchAdmin } from '../controllers/eventosFotos.controller.js';

const router = Router();
router.get('/publico', listPublic);
router.use(requirePanelJwt);
router.get('/', listAdmin);
router.post('/presign', presignAdmin);
router.post('/lote', loteAdmin);
router.patch('/', patchAdmin);
router.put('/', patchAdmin);
router.delete('/', deleteAdmin);

export default router;
