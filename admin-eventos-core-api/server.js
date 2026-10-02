import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import eventRoutes from './src/routes/event.routes.js';
import registrationRoutes from './src/routes/registrations.routes.js';
import pagosRoutes from './src/routes/pagos.routes.js';
import usersRoutes from './src/routes/users.routes.js';
import reservasRoutes from './src/routes/reservas.routes.js';
import uploadRoutes from './src/routes/upload.routes.js';
import { getFacturaBorrador } from './src/controllers/registration.controller.js';
import configRoutes from './src/routes/config.routes.js';


// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

/** API GW suele anteponer /sandbox | /prod | /dev — hay que quitarlo sin borrar la / inicial del recurso real. */
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

// Primero normalizar path (express cachea pathname en req._parsedUrl)
app.use(stripApiGatewayStageMiddleware);
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

/**
 * Registro explícito: con API GW + mismo Router montado varias veces a veces el GET no llega bien.
 * Debe declararse ANTES de app.use(..., registrationRoutes).
 */
const FACTURA_BORRADOR_GET_PATHS = [
  '/api/registrations/:id/factura-borrador',
  '/sandbox/api/registrations/:id/factura-borrador',
  '/prod/api/registrations/:id/factura-borrador',
  '/dev/api/registrations/:id/factura-borrador'
];
for (const path of FACTURA_BORRADOR_GET_PATHS) {
  app.get(path, getFacturaBorrador);
}

/** Comprobación rápida de que desplegaron este código (opcional): GET .../api/_deploy-check */
app.get(['/api/_deploy-check', '/sandbox/api/_deploy-check'], (_req, res) => {
  res.json({
    ok: true,
    facturaBorradorRutasExplicitas: true,
    ts: new Date().toISOString()
  });
});

/**
 * La integración suele llegar con el stage como primer segmento (/sandbox/api/...),
 * aunque el dominio público muestre /api/... — registramos rutas también bajo ese prefijo.
 */
const API_STAGES = ['sandbox', 'prod', 'dev'];
function mountRoutesAtBaseAndStages(suffixPath, router) {
  app.use(suffixPath, router);
  for (const stage of API_STAGES) app.use(`/${stage}${suffixPath}`, router);
}

// Rutas con prefijo /api (legacy) + mismo path con prefijo /{stage}
mountRoutesAtBaseAndStages('/api/eventos', eventRoutes);
mountRoutesAtBaseAndStages('/api/config', configRoutes);
mountRoutesAtBaseAndStages('/api/registrations', registrationRoutes);
mountRoutesAtBaseAndStages('/api/reservas', reservasRoutes);
mountRoutesAtBaseAndStages('/api/usuarios', usersRoutes);

// Rutas /admin (+ stage)
mountRoutesAtBaseAndStages('/admin/eventos/upload-imagen', uploadRoutes);
mountRoutesAtBaseAndStages('/admin/eventos', eventRoutes);
mountRoutesAtBaseAndStages('/admin/registrations', registrationRoutes);
mountRoutesAtBaseAndStages('/admin/reservas', reservasRoutes);
mountRoutesAtBaseAndStages('/admin/usuarios', usersRoutes);
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