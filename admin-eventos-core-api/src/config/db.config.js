import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import dotenv from 'dotenv';

dotenv.config();

// ✅ Configuración para AWS (producción o Lambda)
const dynamoDBConfig = {
  region: process.env.AWS_REGION || 'us-east-1'
  // No agregamos endpoint para que en AWS use el DynamoDB real
};

// ❗Solo activar DynamoDB Local si estás desarrollando EN TU PC
// y NO corremos dentro de Lambda
if (
  process.env.NODE_ENV === 'development' &&
  !process.env.AWS_EXECUTION_ENV // Asegura que NO es AWS Lambda
) {
  dynamoDBConfig.endpoint = 'http://localhost:8000';
  dynamoDBConfig.sslEnabled = false;
  console.log('⚠️ Conectado a DynamoDB LOCAL (solo desarrollo)');
} else {
  console.log('✅ Conectado a DynamoDB AWS');
}

// Cliente final
const dynamoDBClient = new DynamoDBClient(dynamoDBConfig);

export { dynamoDBClient };
