import { Router } from 'express';
import {
  postEmitir,
  postPreviewFactura,
  getEstado,
  getValidacion,
  getFacturacionHealth,
  getComprobantes,
  postComprobantesRefrescar,
  getComprobanteXml,
  getComprobanteHtml,
  getTracksEncf,
  getConsultaDgii
} from '../controllers/facturacion.controller.js';

const router = Router();

router.get('/_health', getFacturacionHealth);
router.post('/emitir', postEmitir);
router.post('/preview', postPreviewFactura);
router.get('/validacion/:trackId', getValidacion);
router.get('/comprobantes', getComprobantes);
router.post('/comprobantes/refrescar', postComprobantesRefrescar);
router.get('/comprobantes/:registroId/xml', getComprobanteXml);
router.get('/comprobantes/:registroId/html', getComprobanteHtml);
router.get('/consulta', getConsultaDgii);
router.get('/tracks/:encf', getTracksEncf);
router.get('/estado/:id', getEstado);

export default router;
