import { getGoogleReviews } from '../services/googleReviews.service.js';

export async function getReviews(req, res) {
  try {
    const q = String(req.query.lang || req.headers['accept-language'] || 'es').toLowerCase();
    const lang = q.startsWith('en') ? 'en' : 'es';
    const fresh = String(req.query.fresh || '') === '1';
    const data = await getGoogleReviews(lang, { fresh });
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ success: true, ...data });
  } catch (err) {
    console.error('google-reviews controller:', err?.message || err);
    res.status(500).json({ success: false, message: 'No se pudieron cargar las opiniones de Google.' });
  }
}
