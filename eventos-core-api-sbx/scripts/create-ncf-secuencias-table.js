#!/usr/bin/env node
/**
 * Crea la tabla DynamoDB ncf_secuencias (PK tipoeCF S) y siembra contadores 31/32.
 *
 * Uso:
 *   node scripts/create-ncf-secuencias-table.js
 *   node scripts/create-ncf-secuencias-table.js --table ncf_secuencias --start31 1 --start32 1
 */
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  waitUntilTableExists
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  return def;
}

const table = arg('table', process.env.DGII_NCF_TABLE || 'ncf_secuencias');
const region = arg('region', process.env.AWS_REGION || 'us-east-1');
const start31 = Number(arg('start31', process.env.DGII_NCF_START_31 || '1'));
const start32 = Number(arg('start32', process.env.DGII_NCF_START_32 || '1'));

const client = new DynamoDBClient({ region });
const doc = DynamoDBDocumentClient.from(client);

async function tableExists() {
  try {
    await client.send(new DescribeTableCommand({ TableName: table }));
    return true;
  } catch (e) {
    if (String(e?.name) === 'ResourceNotFoundException') return false;
    throw e;
  }
}

async function main() {
  if (!(await tableExists())) {
    console.log(`Creando tabla ${table}…`);
    await client.send(
      new CreateTableCommand({
        TableName: table,
        AttributeDefinitions: [{ AttributeName: 'tipoeCF', AttributeType: 'S' }],
        KeySchema: [{ AttributeName: 'tipoeCF', KeyType: 'HASH' }],
        BillingMode: 'PAY_PER_REQUEST'
      })
    );
    await waitUntilTableExists({ client, maxWaitTime: 120 }, { TableName: table });
    console.log('Tabla activa.');
  } else {
    console.log(`Tabla ${table} ya existe.`);
  }

  for (const [tipoeCF, start] of [
    ['31', start31],
    ['32', start32]
  ]) {
    const lastAssigned = Math.max(0, Math.floor(start) - 1);
    try {
      await doc.send(
        new PutCommand({
          TableName: table,
          Item: {
            tipoeCF,
            lastAssigned,
            prefix: `E${tipoeCF}`,
            updatedAt: new Date().toISOString()
          },
          ConditionExpression: 'attribute_not_exists(tipoeCF)'
        })
      );
      console.log(`Seed tipoeCF=${tipoeCF} lastAssigned=${lastAssigned} (próximo=${lastAssigned + 1})`);
    } catch (e) {
      if (String(e?.name).includes('ConditionalCheckFailed')) {
        console.log(`Seed tipoeCF=${tipoeCF} omitido (ya existe)`);
      } else throw e;
    }
  }
  console.log('Listo.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
