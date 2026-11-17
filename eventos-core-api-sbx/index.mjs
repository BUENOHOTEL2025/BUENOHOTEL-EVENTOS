import serverlessExpress from '@vendia/serverless-express';
import app from './server.js';
import { hydrateAppSecrets } from './src/services/appSecrets.service.js';

const serverless = serverlessExpress({ app });

export const handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  await hydrateAppSecrets();
  return serverless(event, context);
};
