import { Router } from 'express';
import { getUserById, listUsers, updateUser } from '../controllers/users.controller.js';
import { requirePanelJwt } from '../middleware/jwtGuard.middleware.js';

const router = Router();
router.use(requirePanelJwt);
router.get('/', listUsers);
router.get('/:id', getUserById);
router.put('/:id', updateUser);
export default router;
