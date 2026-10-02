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
app.use(cors());
app.use(express.json({ limit: '2mb' }));
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
// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ message: 'API de Eventos de BuenoHotel' });
});

// Manejador de errores global
app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

export default app;