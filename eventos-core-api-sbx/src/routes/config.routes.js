import { Router } from 'express';
import { getTasaCambio } from '../services/tasaCambio.service.js';

const router = Router();

router.get('/tasa-cambio', async (_req, res) => {
  try {
    const tasa = await getTasaCambio();
    res.json({ tasa });
  } catch (e) {
    res.status(500).json({ message: e?.message || 'No se pudo obtener la tasa de cambio' });
  }
});

export default router;

