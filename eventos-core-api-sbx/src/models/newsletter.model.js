import { randomBytes, randomUUID } from 'crypto';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand
} from '@aws-sdk/lib-dynamodb';
import { dynamoDBClient } from '../config/db.config.js';
import { auditoriaTableName } from './auditoriaEcf.model.js';

const docClient = DynamoDBDocumentClient.from(dynamoDBClient, {
  marshallOptions: { removeUndefinedValues: true }
});

const NL_PK = 'NL';
const NLC_PK = 'NLC';

function table() {
  return auditoriaTableName();
}

function normEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

export function emailValido(raw) {
  const e = normEmail(raw);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 160;
}

export default class NewsletterModel {
  static async upsertSubscriber({ email, origen, ip, userAgent }) {
    const key = normEmail(email);
    if (!emailValido(key)) return { ok: false, code: 400, message: 'Correo no válido.' };
    const now = new Date().toISOString();
    const existing = await this.getByEmail(key);
    const token = existing?.unsubToken || randomBytes(18).toString('base64url');
    const item = {
      pk: NL_PK,
      sk: key,
      email: key,
      activo: true,
      createdAt: existing?.createdAt || now,
      lastSeenAt: now,
      origen: String(origen || existing?.origen || '').slice(0, 120),
      ip: String(ip || '').slice(0, 64),
      userAgent: String(userAgent || '').slice(0, 180),
      unsubToken: token,
      unsubAt: null
    };
    await docClient.send(new PutCommand({ TableName: table(), Item: item }));
    return { ok: true, already: Boolean(existing?.activo), item };
  }

  static async reactivate(email) {
    const item = await this.getByEmail(email);
    if (!item) return { ok: false, code: 404, message: 'Ese correo no está en la lista.' };
    const now = new Date().toISOString();
    const token = item.unsubToken || randomBytes(18).toString('base64url');
    const next = {
      ...item,
      activo: true,
      unsubAt: null,
      unsubToken: token,
      lastSeenAt: now
    };
    delete next.bounceKind;
    delete next.bounceMotivo;
    await docClient.send(new PutCommand({ TableName: table(), Item: next }));
    return { ok: true, item: { ...item, activo: true, unsubToken: token } };
  }

  static async getByEmail(email) {
    const sk = normEmail(email);
    if (!sk) return null;
    const res = await docClient.send(
      new GetCommand({ TableName: table(), Key: { pk: NL_PK, sk } })
    );
    return res.Item || null;
  }

  static async unsubscribe({ email, token, requireToken = false }) {
    const item = await this.getByEmail(email);
    if (!item) return { ok: false, code: 404, message: 'Ese correo no está en la lista.' };
    const got = String(token || '').trim();
    const need = String(item.unsubToken || '').trim();
    if (requireToken && (!got || got !== need)) {
      return { ok: false, code: 400, message: 'Ese enlace de baja no es válido.' };
    }
    if (!item.activo) return { ok: true, already: true, item };
    const now = new Date().toISOString();
    await docClient.send(
      new UpdateCommand({
        TableName: table(),
        Key: { pk: NL_PK, sk: item.sk },
        UpdateExpression: 'SET activo = :f, unsubAt = :n',
        ExpressionAttributeValues: { ':f': false, ':n': now }
      })
    );
    return { ok: true, already: false, item: { ...item, activo: false, unsubAt: now } };
  }

  static async deactivate(email) {
    return this.unsubscribe({ email, requireToken: false });
  }

  static async remove(email) {
    const item = await this.getByEmail(email);
    if (!item) return { ok: false, code: 404, message: 'Ese correo no está en la lista.' };
    await docClient.send(
      new DeleteCommand({ TableName: table(), Key: { pk: NL_PK, sk: item.sk } })
    );
    return { ok: true, item };
  }

  static async listAll() {
    const items = [];
    let start;
    do {
      const res = await docClient.send(
        new QueryCommand({
          TableName: table(),
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': NL_PK },
          ExclusiveStartKey: start
        })
      );
      items.push(...(res.Items || []));
      start = res.LastEvaluatedKey;
    } while (start);
    items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return items;
  }

  static async markMailboxIssue({ email, kind, motivo }) {
    const item = await this.getByEmail(email);
    if (!item) return { ok: false };
    const now = new Date().toISOString();
    const permanent = kind === 'bounce' || kind === 'complaint';
    await docClient.send(
      new UpdateCommand({
        TableName: table(),
        Key: { pk: NL_PK, sk: item.sk },
        UpdateExpression:
          'SET bounceKind = :k, bounceMotivo = :m, lastBounceAt = :n' +
          (permanent ? ', activo = :f' : ''),
        ExpressionAttributeValues: permanent
          ? { ':k': kind, ':m': String(motivo || '').slice(0, 240), ':n': now, ':f': false }
          : { ':k': kind, ':m': String(motivo || '').slice(0, 240), ':n': now }
      })
    );
    return { ok: true };
  }

  static async applySesEvent({ email, messageId, status, motivo }) {
    const mail = String(email || '').trim().toLowerCase();
    const mid = String(messageId || '').trim();
    const camps = await this.listCampaigns({ limit: 40 });
    for (const c of camps) {
      const recs = Array.isArray(c.recipients) ? [...c.recipients] : [];
      const i = recs.findIndex(
        (r) => (mid && r.messageId && r.messageId === mid) || (mail && String(r.email || '').toLowerCase() === mail)
      );
      if (i < 0) continue;
      recs[i] = {
        ...recs[i],
        status,
        motivo: String(motivo || recs[i].motivo || '').slice(0, 240),
        at: new Date().toISOString()
      };
      const entregados = recs.filter((r) => r.status === 'entregado').length;
      const rebotes = recs.filter((r) => r.status === 'rebote').length;
      const quejas = recs.filter((r) => r.status === 'queja').length;
      const errores = recs.filter((r) => r.status === 'error').length;
      await docClient.send(
        new UpdateCommand({
          TableName: table(),
          Key: { pk: c.pk, sk: c.sk },
          UpdateExpression:
            'SET recipients = :r, entregados = :e, rebotes = :b, quejas = :q, fallidos = :f',
          ExpressionAttributeValues: {
            ':r': recs,
            ':e': entregados,
            ':b': rebotes,
            ':q': quejas,
            ':f': rebotes + quejas + errores
          }
        })
      );
      return { ok: true, campaignId: c.id };
    }
    return { ok: false };
  }

  static publicSub(item) {
    if (!item) return null;
    return {
      email: item.email || item.sk,
      activo: item.activo !== false,
      createdAt: item.createdAt || '',
      origen: item.origen || '',
      unsubAt: item.unsubAt || null,
      bounceKind: item.bounceKind || '',
      bounceMotivo: item.bounceMotivo || ''
    };
  }

  static async putCampaign(item) {
    const id = item.id || randomUUID();
    const createdAt = item.createdAt || new Date().toISOString();
    const rec = {
      ...item,
      pk: NLC_PK,
      sk: `${createdAt}#${id}`,
      id,
      createdAt
    };
    await docClient.send(new PutCommand({ TableName: table(), Item: rec }));
    return rec;
  }

  static async listCampaigns({ limit = 40 } = {}) {
    const res = await docClient.send(
      new QueryCommand({
        TableName: table(),
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': NLC_PK },
        ScanIndexForward: false,
        Limit: Math.max(1, Math.min(80, Number(limit) || 40))
      })
    );
    return res.Items || [];
  }

  static publicCampaign(item) {
    if (!item) return null;
    return {
      id: item.id,
      createdAt: item.createdAt,
      asunto: item.asunto || '',
      preview: String(item.cuerpo || '').slice(0, 160),
      prueba: Boolean(item.prueba),
      total: Number(item.total) || 0,
      enviados: Number(item.enviados) || 0,
      fallidos: Number(item.fallidos) || 0,
      entregados: Number(item.entregados) || 0,
      rebotes: Number(item.rebotes) || 0,
      quejas: Number(item.quejas) || 0,
      recipients: Array.isArray(item.recipients)
        ? item.recipients.slice(0, 200).map((r) => ({
            email: r.email || '',
            status: r.status || 'enviado',
            motivo: r.motivo || ''
          }))
        : [],
      createdByEmail: item.createdByEmail || '',
      createdByNombre: item.createdByNombre || ''
    };
  }
}
