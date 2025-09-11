import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import config from './config/config.js';
import authRoutes from './routes/authRoutes.js';
import registrationRoutes from './routes/registrationRoutes.js';
import userRoutes from './routes/userRoutes.js';
import azulRoutes from './routes/azulRoutes.js';

// Inicializar la aplicación Express
const app = express();

// Advertencias de variables de entorno requeridas
(['EMAIL_API_BASE','FRONTEND_URL']).forEach((k)=>{
  if (!process.env[k]) {
    console.warn(`[WARN] Variable de entorno ${k} no está configurada. Algunas funcionalidades pueden no funcionar.`);
  }
});

// Configuración de CORS
// FRONTEND_URL puede no estar seteado en prod (se usa FRONTEND_URL_PARAM en SSM),
// por lo que añadimos explícitamente el dominio en producción y un chequeo permisivo para subdominios de buenohotel.com.do
const allowedOrigins = [
  'http://localhost:3001',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'https://eventos.buenohotel.com.do',
  config.cors?.origin
].filter(Boolean);

const buenohotelRegex = /^(https?:\/\/)([a-z0-9-]+\.)*buenohotel\.com\.do(?::\d+)?$/i;

const corsOptions = {
  origin: function (origin, callback) {
    // Permitir solicitudes sin "origin" (por ejemplo, herramientas locales, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || buenohotelRegex.test(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: config.cors?.methods || ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: config.cors?.allowedHeaders || ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors(corsOptions));
// Responder preflights
app.options('*', cors(corsOptions));
app.use(morgan('dev'));

// Rutas base
app.get('/', (req, res) => {
  res.json({ 
    message: 'API de Eventos BuenoHotel',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        profile: 'GET /api/auth/me (requiere autenticación)'
      },
      registrations: {
        create: 'POST /api/registrations',
        mine: 'GET /api/registrations/mine (requiere autenticación)',
        byUser: 'GET /api/registrations?userId=...'
      },
      reservasAlias: {
        mine: 'GET /api/reservas/mias (requiere autenticación)',
        byUser: 'GET /api/reservas?userId=...'
      }
    }
  });
});

// Rutas de autenticación
app.use('/api/auth', authRoutes);
// Rutas de registros de eventos
app.use('/api/registrations', registrationRoutes);
// Alias en español para compatibilidad con frontend existente
app.use('/api/reservas', registrationRoutes);
// Rutas de usuarios (admin)
app.use('/api/users', userRoutes);
// Rutas de pago AZUL
app.use('/api/pagos/azul', azulRoutes);

// Manejo de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false,
    message: 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// Iniciar el servidor solo si no estamos en modo test ni dentro de AWS Lambda
// Lambda expone AWS_LAMBDA_FUNCTION_NAME en el entorno. En ese caso, no debemos llamar app.listen.
if (process.env.NODE_ENV !== 'test' && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const PORT = config.port || 3000;
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
}

export default app;
