import { Router } from 'express';
import { requirePanelJwt } from '../middleware/jwtGuard.middleware.js';
import {
  postSubscribe,
  getBaja,
  postUnsubscribe,
  getNewsletterMe,
  postNewsletterRemember,
  postSesEvents,
  getSubscribers,
  getCampaigns,
  postCampaign,
  postReactivate,
  postDeactivate,
  postRemoveSubscriber
} from '../controllers/newsletter.controller.js';

const router = Router();

router.post('/subscribe', postSubscribe);
router.get('/baja', getBaja);
router.post('/unsubscribe', postUnsubscribe);
router.get('/me', getNewsletterMe);
router.post('/remember', postNewsletterRemember);
router.post('/ses-events', postSesEvents);

router.use(requirePanelJwt);
router.get('/subscribers', getSubscribers);
router.post('/subscribers/reactivate', postReactivate);
router.post('/subscribers/deactivate', postDeactivate);
router.post('/subscribers/remove', postRemoveSubscriber);
router.get('/campaigns', getCampaigns);
router.post('/campaigns', postCampaign);

export default router;
