import serverless from 'serverless-http';
import AWS from 'aws-sdk';

// Cargar parámetros SSM una sola vez (cold start)
let cachedHandler = null;
async function bootstrap() {
  // Si ya está construido, reutilizar
  if (cachedHandler) return cachedHandler;

  const ssm = new AWS.SSM({ region: process.env.AWS_REGION || 'us-east-1' });
  const names = [
    process.env.EMAIL_API_BASE_PARAM,
    process.env.FRONTEND_URL_PARAM,
    process.env.JWT_SECRET_PARAM,
  ].filter(Boolean);

  if (names.length) {
    try {
      const resp = await ssm.getParameters({ Names: names, WithDecryption: true }).promise();
      for (const p of resp.Parameters || []) {
        const name = p.Name || '';
        const val = p.Value || '';
        if (name === process.env.EMAIL_API_BASE_PARAM) process.env.EMAIL_API_BASE = val;
        if (name === process.env.FRONTEND_URL_PARAM) process.env.FRONTEND_URL = val;
        if (name === process.env.JWT_SECRET_PARAM) process.env.JWT_SECRET = val;
      }
    } catch (e) {
      console.error('Error cargando parámetros SSM:', e);
    }
  }

  // Importar la app DESPUÉS de setear process.env
  const { default: app } = await import('./server.js');
  cachedHandler = serverless(app, { binary: [] });
  return cachedHandler;
}

export const handler = async (event, context) => {
  const h = await bootstrap();
  return h(event, context);
};
