/**
 * Entrada Lambda con handler `index.handler` (archivo index.js, export handler).
 * Duplicado de index.mjs para máxima compatibilidad con la consola AWS.
 */
import serverlessExpress from '@vendia/serverless-express';
import app from './server.js';

export const handler = serverlessExpress({ app });
