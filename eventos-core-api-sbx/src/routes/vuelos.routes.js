import { Router } from 'express';
import { getVuelosHealth, postVuelosSearch } from '../controllers/vuelos.controller.js';

const router = Router();
router.get('/_health', getVuelosHealth);
router.post('/search', postVuelosSearch);
export default router;
