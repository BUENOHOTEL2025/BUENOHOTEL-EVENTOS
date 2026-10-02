import { Router } from 'express';
import { getUploadUrl } from '../controllers/upload.controller.js';

const router = Router();

// POST /admin/eventos/upload-imagen
router.post('/', getUploadUrl);

export default router;
