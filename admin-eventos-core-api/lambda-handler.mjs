/**
 * Handler estándar para AWS Lambda + API Gateway (proxy).
 *
 * Configuración en Lambda: archivo `lambda-handler.mjs`, método exportado `handler`
 * (o el nombre que use tu plantilla SAM/CloudFormation).
 */
import configure from '@vendia/serverless-express';
import app from './server.js';

export const handler = configure({ app });
