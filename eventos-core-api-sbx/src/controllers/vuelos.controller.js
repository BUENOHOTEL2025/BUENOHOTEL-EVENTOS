import { searchFlights, vuelosProviderName } from '../services/vuelosProvider.service.js';

function sendError(res, err) {
  const status = Number(err?.status) || 500;
  res.status(status).json({ success: false, message: err?.message || 'Error de vuelos' });
}

export async function getVuelosHealth(_req, res) {
  res.json({
    success: true,
    ok: true,
    provider: vuelosProviderName(),
    search: 'POST /api/vuelos/search'
  });
}

export async function postVuelosSearch(req, res) {
  try {
    const data = await searchFlights(req.body || {});
    res.json({ success: true, ...data });
  } catch (err) {
    sendError(res, err);
  }
}
