import { Router } from 'express';
import User from '../models/User.js';
import { authenticateJWT, authorize } from '../utils/jwt.js';

const router = Router();

// Admin: listar usuarios (con paginación sencilla)
router.get('/', authenticateJWT, authorize('admin'), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 100), 500);
    const exclusiveStartKey = req.query.exclusiveStartKey || null;
    const result = await User.list({ limit, exclusiveStartKey });
    // Minimal fields for selector
    const items = (result.items || result.items === undefined ? result.items : result.items) || result.items;
    const users = (result.items || []).map(u => ({ id: u.id, email: u.email, nombre: u.nombre, apellido: u.apellido }));
    return res.json({ success: true, data: users, meta: { lastEvaluatedKey: result.lastEvaluatedKey, count: result.count } });
  } catch (error) {
    console.error('GET /api/users error', error);
    return res.status(500).json({ success: false, message: 'No se pudieron listar usuarios' });
  }
});

export default router;
