import { randomUUID } from 'crypto';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDBClient } from '../config/db.config.js';

const docClient = DynamoDBDocumentClient.from(dynamoDBClient);
const PK = 'AUD';

export function auditoriaTableName() {
  return String(process.env.DGII_AUDITORIA_TABLE || 'ecf_auditoria').trim();
}

export default class AuditoriaEcfModel {
  static async put(item) {
    const createdAt = item.createdAt || new Date().toISOString();
    const id = item.id || randomUUID();
    const rec = {
      ...item,
      pk: PK,
      sk: `${createdAt}#${id}`,
      id,
      createdAt
    };
    await docClient.send(new PutCommand({ TableName: auditoriaTableName(), Item: rec }));
    return rec;
  }

  static async listRecent({ limit = 200, exclusiveStartKey } = {}) {
    const res = await docClient.send(
      new QueryCommand({
        TableName: auditoriaTableName(),
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': PK },
        ScanIndexForward: false,
        Limit: Math.max(1, Math.min(500, Number(limit) || 200)),
        ExclusiveStartKey: exclusiveStartKey || undefined
      })
    );
    return {
      items: res.Items || [],
      lastKey: res.LastEvaluatedKey || null
    };
  }
}
