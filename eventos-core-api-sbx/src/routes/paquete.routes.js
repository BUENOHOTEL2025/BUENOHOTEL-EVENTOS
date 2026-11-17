import { Router } from 'express';
import { requirePanelJwt } from '../middleware/jwtGuard.middleware.js';
import {
  listPublic,
  getPublic,
  listAdmin,
  saveAdmin,
  traducirAdmin,
  uploadImagen,
  deleteAdmin
} from '../controllers/paquete.controller.js';

const router = Router();

router.get('/', listPublic);
router.get('/admin', requirePanelJwt, listAdmin);
router.post('/admin/traducir', requirePanelJwt, traducirAdmin);
router.post('/admin/imagen', requirePanelJwt, uploadImagen);
router.post('/admin', requirePanelJwt, saveAdmin);
router.delete('/admin/:slug', requirePanelJwt, deleteAdmin);
router.get('/:slug', getPublic);

export default router;
