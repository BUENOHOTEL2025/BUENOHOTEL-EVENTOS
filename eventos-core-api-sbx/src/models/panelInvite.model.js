import { randomBytes, randomUUID } from 'crypto';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDBClient } from '../config/db.config.js';
import { auditoriaTableName } from './auditoriaEcf.model.js';

const docClient = DynamoDBDocumentClient.from(dynamoDBClient, {
  marshallOptions: { removeUndefinedValues: true }
});

const INV_PK = 'INV';
const NTF_PK = 'NTF';
const TTL_MS = 15 * 60 * 1000;

export function inviteTtlMs() {
  return TTL_MS;
}

export default class PanelInviteModel {
  static async createInvite({ createdByEmail, createdByNombre, ttlMs } = {}) {
    const token = randomBytes(24).toString('base64url');
    const now = Date.now();
    const life = Number(ttlMs) > 0 ? Number(ttlMs) : TTL_MS;
    const expiresAt = new Date(now + life).toISOString();
    const item = {
      pk: INV_PK,
      sk: token,
      token,
      createdAt: new Date(now).toISOString(),
      expiresAt,
      createdByEmail: String(createdByEmail || '').toLowerCase(),
      createdByNombre: String(createdByNombre || '').trim()
    };
    await docClient.send(new PutCommand({ TableName: auditoriaTableName(), Item: item }));
    return item;
  }

  static async getInvite(token) {
    const sk = String(token || '').trim();
    if (!sk) return null;
    const res = await docClient.send(
      new GetCommand({ TableName: auditoriaTableName(), Key: { pk: INV_PK, sk } })
    );
    return res.Item || null;
  }

  static inviteStatus(item) {
    if (!item) return { ok: false, code: 404, message: 'Ese enlace no existe o ya no sirve.' };
    if (item.usedAt) return { ok: false, code: 410, message: 'Este enlace ya se usó. Pide uno nuevo.' };
    if (new Date(item.expiresAt).getTime() <= Date.now()) {
      return { ok: false, code: 410, message: 'Este enlace expiró. Pide uno nuevo.' };
    }
    return { ok: true, item };
  }

  static remainingSeg(expiresAt) {
    const t = new Date(expiresAt || 0).getTime();
    if (!Number.isFinite(t)) return 0;
    return Math.max(0, Math.floor((t - Date.now()) / 1000));
  }

  static publicInvite(item, { includeToken = false } = {}) {
    if (!item) return null;
    const used = Boolean(item.usedAt);
    const remaining = used ? 0 : this.remainingSeg(item.expiresAt);
    const expired = !used && remaining <= 0;
    return {
      token: includeToken && !used && !expired ? item.token : undefined,
      tokenTail: String(item.token || item.sk || '').slice(-6),
      createdAt: item.createdAt || '',
      expiresAt: item.expiresAt || '',
      remainingSeg: remaining,
      createdByEmail: item.createdByEmail || '',
      createdByNombre: item.createdByNombre || '',
      usedAt: item.usedAt || null,
      usedByEmail: item.usedByEmail || '',
      usedByNombre: item.usedByNombre || '',
      usedById: item.usedById || '',
      usedByIp: item.usedByIp || '',
      estado: used ? 'usado' : expired ? 'expirado' : 'vigente'
    };
  }

  static async listInvites({ limit = 20 } = {}) {
    const res = await docClient.send(
      new QueryCommand({
        TableName: auditoriaTableName(),
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': INV_PK },
        ScanIndexForward: false,
        Limit: Math.max(1, Math.min(80, Number(limit) || 20))
      })
    );
    const items = (res.Items || [])
      .slice()
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return items.slice(0, Math.max(1, Math.min(40, Number(limit) || 20)));
  }

  static async markInviteUsed(token, { email, nombre, userId, ip } = {}) {
    const sk = String(token || '').trim();
    const now = new Date().toISOString();
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: auditoriaTableName(),
          Key: { pk: INV_PK, sk },
          ConditionExpression: 'attribute_not_exists(usedAt)',
          UpdateExpression:
            'SET usedAt = :u, usedByEmail = :e, usedByNombre = :n, usedById = :id, usedByIp = :ip',
          ExpressionAttributeValues: {
            ':u': now,
            ':e': String(email || '').toLowerCase(),
            ':n': String(nombre || '').trim(),
            ':id': String(userId || '').trim(),
            ':ip': String(ip || '').trim()
          }
        })
      );
    } catch (err) {
      const name = String(err?.name || '');
      if (name.includes('ConditionalCheckFailed')) {
        const e = new Error('Este enlace ya se usó. Pide uno nuevo.');
        e.status = 410;
        throw e;
      }
      throw err;
    }
    return this.getInvite(sk);
  }

  static async putNotif(entry) {
    const createdAt = entry.createdAt || new Date().toISOString();
    const id = entry.id || randomUUID();
    const rec = {
      pk: NTF_PK,
      sk: `${createdAt}#${id}`,
      id,
      createdAt,
      tipo: entry.tipo || 'solicitud_permisos',
      visto: false,
      vistoAt: null,
      vistoPorEmail: null,
      usuarioId: entry.usuarioId || '',
      usuarioEmail: String(entry.usuarioEmail || '').toLowerCase(),
      usuarioNombre: String(entry.usuarioNombre || '').trim(),
      mensaje: String(entry.mensaje || '').trim()
    };
    await docClient.send(new PutCommand({ TableName: auditoriaTableName(), Item: rec }));
    return rec;
  }

  static async listNotifs({ limit = 80 } = {}) {
    const res = await docClient.send(
      new QueryCommand({
        TableName: auditoriaTableName(),
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': NTF_PK },
        ScanIndexForward: false,
        Limit: Math.max(1, Math.min(200, Number(limit) || 80))
      })
    );
    return res.Items || [];
  }

  static async pendingByEmail(email) {
    const key = String(email || '').trim().toLowerCase();
    if (!key) return null;
    const items = await this.listNotifs({ limit: 80 });
    return (
      items.find((x) => !x.visto && String(x.usuarioEmail || '').toLowerCase() === key) || null
    );
  }

  static async markVisto(id, vistoPorEmail) {
    const nid = String(id || '').trim();
    const items = await this.listNotifs({ limit: 120 });
    const hit = items.find((x) => String(x.id) === nid);
    if (!hit) return null;
    const now = new Date().toISOString();
    await docClient.send(
      new UpdateCommand({
        TableName: auditoriaTableName(),
        Key: { pk: NTF_PK, sk: hit.sk },
        UpdateExpression: 'SET visto = :v, vistoAt = :t, vistoPorEmail = :e',
        ExpressionAttributeValues: {
          ':v': true,
          ':t': now,
          ':e': String(vistoPorEmail || '').toLowerCase()
        }
      })
    );
    return { ...hit, visto: true, vistoAt: now, vistoPorEmail: String(vistoPorEmail || '').toLowerCase() };
  }

  static async clearAllNotifs() {
    let ExclusiveStartKey;
    let n = 0;
    do {
      const res = await docClient.send(
        new QueryCommand({
          TableName: auditoriaTableName(),
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': NTF_PK },
          ExclusiveStartKey
        })
      );
      for (const item of res.Items || []) {
        await docClient.send(
          new DeleteCommand({
            TableName: auditoriaTableName(),
            Key: { pk: NTF_PK, sk: item.sk }
          })
        );
        n += 1;
      }
      ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return n;
  }
}
