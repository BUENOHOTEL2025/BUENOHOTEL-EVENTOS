import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDBClient } from '../config/db.config.js';

const docClient = DynamoDBDocumentClient.from(dynamoDBClient);

export function ledgerTableName() {
  return String(process.env.DGII_ECF_LEDGER_TABLE || 'comprobantes_ecf').trim();
}

function stripHeavy(item) {
  if (!item || typeof item !== 'object') return item;
  const { xmlFirmado, snapshot, ...rest } = item;
  return {
    ...rest,
    tieneXml: Boolean(xmlFirmado),
    tieneImpresion: Boolean(snapshot && (snapshot.lineas?.length || snapshot.comprador)) || Boolean(rest.registroId)
  };
}

export default class ComprobanteEcfModel {
  static async getByEncf(encf) {
    const ncf = String(encf || '').trim().toUpperCase();
    if (!ncf) return null;
    const res = await docClient.send(
      new GetCommand({ TableName: ledgerTableName(), Key: { encf: ncf } })
    );
    return res.Item || null;
  }

  static async getByRegistroId(registroId) {
    const id = String(registroId || '').trim();
    if (!id) return null;
    const all = await this.listAll({ includeHeavy: true });
    return all.find((x) => String(x.registroId || '') === id) || null;
  }

  static async put(item) {
    const encf = String(item?.encf || '').trim().toUpperCase();
    if (!encf) {
      const err = new Error('encf requerido para el libro de comprobantes');
      err.status = 400;
      throw err;
    }
    const now = new Date().toISOString();
    const record = {
      ...item,
      encf,
      updatedAt: now,
      emitidoAt: item.emitidoAt || now
    };
    await docClient.send(
      new PutCommand({
        TableName: ledgerTableName(),
        Item: record
      })
    );
    return record;
  }

  static async patch(encf, fields = {}) {
    const ncf = String(encf || '').trim().toUpperCase();
    const existing = await this.getByEncf(ncf);
    if (!existing) return null;
    return this.put({ ...existing, ...fields, encf: ncf });
  }

  static async listAll({ includeHeavy = false } = {}) {
    const TableName = ledgerTableName();
    const out = [];
    let ExclusiveStartKey;
    do {
      const res = await docClient.send(
        new ScanCommand({ TableName, ExclusiveStartKey })
      );
      out.push(...(res.Items || []));
      ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    const rows = includeHeavy ? out : out.map(stripHeavy);
    rows.sort((a, b) => String(b.emitidoAt || '').localeCompare(String(a.emitidoAt || '')));
    return rows;
  }
}
