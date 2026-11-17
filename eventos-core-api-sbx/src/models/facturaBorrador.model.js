import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDBClient } from '../config/db.config.js';

const docClient = DynamoDBDocumentClient.from(dynamoDBClient);
const ID = 'compartido';

export function borradorTableName() {
  return String(process.env.DGII_BORRADOR_TABLE || 'ecf_borradores').trim();
}

export default class FacturaBorradorModel {
  static async getShared() {
    const res = await docClient.send(
      new GetCommand({ TableName: borradorTableName(), Key: { id: ID } })
    );
    return res.Item || null;
  }

  static async putShared(snap, savedBy = '') {
    const item = {
      id: ID,
      snap: snap && typeof snap === 'object' ? snap : {},
      savedBy: String(savedBy || '').trim(),
      updatedAt: new Date().toISOString()
    };
    await docClient.send(new PutCommand({ TableName: borradorTableName(), Item: item }));
    return item;
  }
}
