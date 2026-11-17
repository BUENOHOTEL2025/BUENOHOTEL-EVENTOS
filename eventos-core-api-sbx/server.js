import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import eventRoutes from './src/routes/event.routes.js';
import registrationRoutes from './src/routes/registrations.routes.js';
import pagosRoutes from './src/routes/pagos.routes.js';
import usersRoutes from './src/routes/users.routes.js';
import reservasRoutes from './src/routes/reservas.routes.js';
import { getFacturaBorrador } from './src/controllers/registration.controller.js';
import configRoutes from './src/routes/config.routes.js';
import facturacionRoutes from './src/routes/facturacion.routes.js';
import dgiiFeRoutes from './src/routes/dgiiFe.routes.js';
import newsletterRoutes from './src/routes/newsletter.routes.js';
import paqueteRoutes from './src/routes/paquete.routes.js';
import vuelosRoutes from './src/routes/vuelos.routes.js';
import googleReviewsRoutes from './src/routes/googleReviews.routes.js';
import eventosFotosRoutes from './src/routes/eventosFotos.routes.js';


// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

function stripApiGatewayStageMiddleware(req, _res, next) {
  const stageRx = /^\/(sandbox|prod|dev)(?=\/|$)/;
  const rewrite = (u) => String(u || '').replace(stageRx, '');
  const nextUrl = rewrite(req.url);
  const nextOriginal = rewrite(req.originalUrl || '');
  if (nextUrl !== req.url || nextOriginal !== (req.originalUrl || '')) {
    req.url = nextUrl;
    if (typeof req.originalUrl === 'string') req.originalUrl = nextOriginal || nextUrl;
    delete req._parsedUrl;
  }
  next();
}

app.use(stripApiGatewayStageMiddleware);
app.set('etag', false);
const CORS_ALLOWED = [
  'https://eventos.buenohotel.com.do',
  'https://ecommerce.buenohotel.com.do',
  'https://booking.buenohotel.com.do',
  'https://www.buenohotel.com',
  'https://buenohotel.com',
  'https://www.buenohotel.com.do',
  'https://buenohotel.com.do'
];

function corsOriginAllowed(origin) {
  if (!origin) return true;
  if (CORS_ALLOWED.includes(origin)) return true;
  return /^https:\/\/([a-z0-9-]+\.)?buenohotel\.com(\.do)?$/i.test(origin);
}

const CORS_HEADERS = [
  'content-type',
  'authorization',
  'cookie',
  'accept',
  'origin',
  'x-requested-with',
  'x-user-email',
  'x-user-name',
  'x-user-id',
  'cache-control',
  'pragma',
  'if-none-match'
];
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (corsOriginAllowed(origin)) return cb(null, origin);
      return cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: CORS_HEADERS,
    maxAge: 86400
  })
);
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  const origin = String(req.headers.origin || '');
  if (origin && corsOriginAllowed(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Vary', 'Origin');
  }
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.charset = 'utf-8';
  next();
});
app.use(express.json({ limit: '6mb', type: ['application/json', 'text/json', 'text/plain'] }));
app.use(morgan('dev'));

const FACTURA_BORRADOR_GET_PATHS = [
  '/api/registrations/:id/factura-borrador',
  '/sandbox/api/registrations/:id/factura-borrador',
  '/prod/api/registrations/:id/factura-borrador',
  '/dev/api/registrations/:id/factura-borrador'
];
for (const path of FACTURA_BORRADOR_GET_PATHS) {
  app.get(path, getFacturaBorrador);
}

app.get(['/api/_deploy-check', '/sandbox/api/_deploy-check'], (_req, res) => {
  res.json({
    ok: true,
    package: 'eventos-core-api-sbx',
    facturaBorrador: true,
    dgiiFe: true,
    facturacionEmitir: true,
    emitirJwtRequired: true,
    tokenDesdeBooking: true,
    facturacionJwtAll: true,
    newsletter: true,
    paquetes: true,
    vuelosSearch: true,
    googleReviews: true,
    ts: new Date().toISOString()
  });
});

const API_STAGES = ['sandbox', 'prod', 'dev'];

/** Servicios emisor-receptor DGII (certificación e-CF) — sin prefijo /api */
const DGII_FE_STAGES = ['', ...API_STAGES.map((s) => `/${s}`)];
for (const prefix of DGII_FE_STAGES) {
  app.use(prefix, dgiiFeRoutes);
}

function mountRoutesAtBaseAndStages(suffixPath, router) {
  app.use(suffixPath, router);
  for (const stage of API_STAGES) app.use(`/${stage}${suffixPath}`, router);
}

mountRoutesAtBaseAndStages('/api/eventos', eventRoutes);
mountRoutesAtBaseAndStages('/api/config', configRoutes);
mountRoutesAtBaseAndStages('/api/registrations', registrationRoutes);
mountRoutesAtBaseAndStages('/api/reservas', reservasRoutes); // rutas de reservas con POST /:id/pagos
mountRoutesAtBaseAndStages('/api/usuarios', usersRoutes);
mountRoutesAtBaseAndStages('/api/facturacion', facturacionRoutes);
mountRoutesAtBaseAndStages('/api/newsletter', newsletterRoutes);
mountRoutesAtBaseAndStages('/api/paquetes', paqueteRoutes);
mountRoutesAtBaseAndStages('/api/vuelos', vuelosRoutes);
mountRoutesAtBaseAndStages('/api/google-reviews', googleReviewsRoutes);
mountRoutesAtBaseAndStages('/api/eventos-fotos', eventosFotosRoutes);
mountRoutesAtBaseAndStages('/api/facturacion/newsletter', newsletterRoutes);
// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ message: 'API de Eventos de BuenoHotel' });
});

// Manejador de errores global
app.use((err, req, res, _next) => {
  const status = Number(err?.status) || Number(err?.statusCode) || 500;
  const message = String(err?.message || 'Error interno del servidor').slice(0, 500);
  const code = err?.code != null ? String(err.code).slice(0, 80) : undefined;
  console.error('[api-error]', status, message);
  res.status(status).json({
    success: false,
    message: status >= 500 ? 'Error interno del servidor' : (message || 'Error'),
    code
  });
});

export default app;