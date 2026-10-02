import { Router } from 'express';
import multer from 'multer';
import {
  getSemilla,
  postValidacionCertificado,
  postRecepcionEcf,
  postAprobacionComercial,
  getFeHealth
} from '../controllers/dgiiFe.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

const router = Router();

/** Rutas case-insensitive según norma DGII */
router.get(/^\/fe\/autenticacion\/api\/semilla\/?$/i, getSemilla);
router.post(
  /^\/fe\/autenticacion\/api\/validacioncertificado\/?$/i,
  upload.single('xml'),
  postValidacionCertificado
);
router.post(/^\/fe\/recepcion\/api\/ecf\/?$/i, upload.single('xml'), postRecepcionEcf);
router.post(/^\/fe\/aprobacioncomercial\/api\/ecf\/?$/i, upload.single('xml'), postAprobacionComercial);

router.get('/fe/_health', getFeHealth);
router.get(/^\/fe\/_health\/?$/i, getFeHealth);

export default router;
