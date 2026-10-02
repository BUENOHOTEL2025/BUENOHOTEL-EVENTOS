import { Router } from 'express';
import { getUserById, listUsers, updateUser } from '../controllers/users.controller.js';

const router = Router();
router.get('/', listUsers);
router.get('/:id', getUserById);
router.put('/:id', updateUser);
export default router;
