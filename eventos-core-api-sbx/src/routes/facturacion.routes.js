import { Router } from 'express';
import {
  postEmitir,
  postTokenDesdeBooking,
  postPreviewFactura,
  getEstado,
  getValidacion,
  getFacturacionHealth,
  getComprobantes,
  postComprobantesRefrescar,
  getComprobanteXml,
  getComprobanteHtml,
  getTracksEncf,
  getConsultaDgii,
  getSecuencia,
  getEmpresas,
  putEmpresasConfig,
  postEmpresa,
  postEmpresaUso,
  deleteEmpresa,
  getHistorialEmpresas,
  getHistorialEmpresa,
  getDuplicarComprobante,
  getBorrador,
  putBorrador,
  getConsultaRnc
} from '../controllers/facturacion.controller.js';
import {
  getAuditoria,
  postAuditoriaEvento,
  postAuditoriaSesion,
  getLoginLock
} from '../controllers/auditoria.controller.js';
import { auditoriaFacturacion } from '../middleware/auditoriaFacturacion.middleware.js';
import { requirePanelJwt } from '../middleware/jwtGuard.middleware.js';
import {
  getMeEcf,
  listAdminsEcf,
  putAdminEcf,
  postAdminEcf,
  deleteAdminEcf
} from '../controllers/adminsEcf.controller.js';
import {
  postInviteLink,
  getInviteLink,
  postInviteRegister,
  listInvitesEcf,
  postSolicitarPermisos,
  getNotificaciones,
  postNotificacionVisto,
  deleteNotificaciones
} from '../controllers/inviteEcf.controller.js';

const router = Router();

router.use(auditoriaFacturacion);

// Públicos: health, canje Cognito Booking, alta por invitación, lock de login.
router.get('/_health', getFacturacionHealth);
router.post('/token-booking', postTokenDesdeBooking);
router.get('/admins/invite/:token', getInviteLink);
router.post('/admins/invite/:token/register', postInviteRegister);
router.post('/auditoria/sesion', postAuditoriaSesion);
router.get('/auditoria/lock', getLoginLock);

router.use(requirePanelJwt);

router.get('/me', getMeEcf);
router.post('/me/solicitar-permisos', postSolicitarPermisos);
router.get('/notificaciones', getNotificaciones);
router.delete('/notificaciones', deleteNotificaciones);
router.post('/notificaciones/:id/visto', postNotificacionVisto);
router.post('/admins/invite', postInviteLink);
router.get('/admins/invites', listInvitesEcf);
router.get('/admins', listAdminsEcf);
router.post('/admins', postAdminEcf);
router.put('/admins/:id', putAdminEcf);
router.delete('/admins/:id', deleteAdminEcf);
router.get('/auditoria', getAuditoria);
router.post('/auditoria/evento', postAuditoriaEvento);
router.get('/empresas/rnc/:rnc', getConsultaRnc);
router.get('/empresas/historial', getHistorialEmpresas);
router.get('/empresas/:rnc/historial', getHistorialEmpresa);
router.get('/empresas', getEmpresas);
router.put('/empresas/config', putEmpresasConfig);
router.post('/empresas', postEmpresa);
router.post('/empresas/:rnc/uso', postEmpresaUso);
router.delete('/empresas/:rnc', deleteEmpresa);
router.get('/borrador', getBorrador);
router.put('/borrador', putBorrador);
router.post('/emitir', postEmitir);
router.post('/preview', postPreviewFactura);
router.get('/validacion/:trackId', getValidacion);
router.get('/comprobantes', getComprobantes);
router.get('/secuencia', getSecuencia);
router.post('/comprobantes/refrescar', postComprobantesRefrescar);
router.get('/comprobantes/:registroId/duplicar', getDuplicarComprobante);
router.get('/comprobantes/:registroId/xml', getComprobanteXml);
router.get('/comprobantes/:registroId/html', getComprobanteHtml);
router.get('/consulta', getConsultaDgii);
router.get('/tracks/:encf', getTracksEncf);
router.get('/estado/:id', getEstado);

export default router;
