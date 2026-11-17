import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDBClient } from '../config/db.config.js';

const docClient = DynamoDBDocumentClient.from(dynamoDBClient);
const FIVE = 5 * 60 * 1000;
const THIRTY = 30 * 60 * 1000;

export function loginLockTableName() {
  return String(process.env.DGII_LOGIN_LOCK_TABLE || 'ecf_login_lock').trim();
}

function keyOf(email) {
  return String(email || '')
    .trim()
    .toLowerCase()
    .slice(0, 120);
}

export default class LoginLockEcfModel {
  static async get(email) {
    const id = keyOf(email);
    if (!id) return null;
    const res = await docClient.send(
      new GetCommand({ TableName: loginLockTableName(), Key: { id } })
    );
    return res.Item || null;
  }

  static async put(item) {
    await docClient.send(new PutCommand({ TableName: loginLockTableName(), Item: item }));
    return item;
  }

  static async clear(email) {
    const id = keyOf(email);
    if (!id) return;
    await docClient.send(new DeleteCommand({ TableName: loginLockTableName(), Key: { id } }));
  }

  static remainingMs(item) {
    const until = Date.parse(String(item?.lockUntil || ''));
    if (!Number.isFinite(until)) return 0;
    return Math.max(0, until - Date.now());
  }

  static nextLockMs(item) {
    const n = Number(item?.nextLockMs);
    if (n === THIRTY || n === 10 * 60 * 1000) return THIRTY;
    return FIVE;
  }
}

export { FIVE as LOCK_FIVE_MS, THIRTY as LOCK_THIRTY_MS };
