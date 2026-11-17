import { Router } from 'express';
import { getReviews } from '../controllers/googleReviews.controller.js';

const router = Router();
router.get('/', getReviews);
export default router;
