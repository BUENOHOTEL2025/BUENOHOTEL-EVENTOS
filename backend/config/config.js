import 'dotenv/config';

const config = {
  // Configuración del servidor
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Configuración de AWS
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
  },
  
  // Configuración de JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'your_jwt_secret_key',
    expiresIn: process.env.JWT_EXPIRES_IN || '30d'
  },
  
  // Nombres de tablas de DynamoDB
  dynamoDB: {
    usersTable: process.env.DYNAMODB_USERS_TABLE || 'usuarios',
    eventsTable: process.env.DYNAMODB_EVENTS_TABLE || 'eventos',
    registrationsTable: process.env.DYNAMODB_REGISTRATIONS_TABLE || 'registros_eventos'
  },
  
  // Configuración de CORS
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }
};

export default config;
