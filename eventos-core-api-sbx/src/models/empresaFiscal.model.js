import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  DeleteCommand
} from '@aws-sdk/lib-dynamodb';
import { dynamoDBClient } from '../config/db.config.js';

const docClient = DynamoDBDocumentClient.from(dynamoDBClient);
const CFG_RNC = '_cfg';

export function empresasTableName() {
  return String(process.env.DGII_EMPRESAS_TABLE || 'empresas_fiscales').trim();
}

function digits(v, max) {
  return String(v || '')
    .replace(/\D/g, '')
    .slice(0, max || 32);
}

export function normEmpresa(x) {
  const rnc = digits(x?.rnc, 11);
  const nombreRazon = String(x?.nombreRazon || x?.razonSocial || '').trim();
  if (rnc.length < 8 || rnc.length > 11 || !nombreRazon) return null;
  return {
    rnc,
    nombreRazon: nombreRazon.slice(0, 150),
    email: String(x?.email || '').trim().slice(0, 80),
    telefono: digits(x?.telefono, 10),
    direccion: String(x?.direccion || '').trim().slice(0, 100),
    updatedAt: String(x?.updatedAt || new Date().toISOString()),
    usos: Number(x?.usos) || 0
  };
}

export default class EmpresaFiscalModel {
  static async listAll() {
    const TableName = empresasTableName();
    const out = [];
    let ExclusiveStartKey;
    do {
      const res = await docClient.send(new ScanCommand({ TableName, ExclusiveStartKey }));
      out.push(...(res.Items || []));
      ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return out
      .filter((x) => x && x.rnc && x.rnc !== CFG_RNC)
      .map((x) => normEmpresa(x))
      .filter(Boolean);
  }

  static async get(rnc) {
    const key = digits(rnc, 11);
    if (!key) return null;
    const res = await docClient.send(
      new GetCommand({ TableName: empresasTableName(), Key: { rnc: key } })
    );
    return normEmpresa(res.Item);
  }

  static async upsert(data) {
    const next = normEmpresa({ ...data, updatedAt: new Date().toISOString() });
    if (!next) {
      const err = new Error('RNC (8–11 dígitos) y nombre de la empresa son requeridos.');
      err.status = 400;
      throw err;
    }
    const prev = await this.get(next.rnc);
    if (prev && data.usos == null) next.usos = prev.usos;
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email || '');
    if (!emailOk) {
      const err = new Error('El correo de la empresa es requerido.');
      err.status = 400;
      throw err;
    }
    if (next.telefono.length !== 10 || !/^8(09|29|49)/.test(next.telefono)) {
      const err = new Error('El teléfono de la empresa debe tener 10 dígitos (809, 829 o 849).');
      err.status = 400;
      throw err;
    }
    if (!next.direccion) {
      const err = new Error('La dirección de la empresa es requerida.');
      err.status = 400;
      throw err;
    }
    await docClient.send(
      new PutCommand({
        TableName: empresasTableName(),
        Item: next
      })
    );
    return next;
  }

  static async touchUso(rnc) {
    const prev = await this.get(rnc);
    if (!prev) return null;
    prev.usos = (Number(prev.usos) || 0) + 1;
    prev.updatedAt = new Date().toISOString();
    await docClient.send(new PutCommand({ TableName: empresasTableName(), Item: prev }));
    return prev;
  }

  static async remove(rnc) {
    const key = digits(rnc, 11);
    if (!key) return;
    await docClient.send(
      new DeleteCommand({ TableName: empresasTableName(), Key: { rnc: key } })
    );
  }

  static async getCfg() {
    const res = await docClient.send(
      new GetCommand({ TableName: empresasTableName(), Key: { rnc: CFG_RNC } })
    );
    const n = Number(res.Item?.tagCount);
    const tagCount = Number.isFinite(n) ? Math.max(0, Math.min(20, Math.floor(n))) : 3;
    return { rnc: CFG_RNC, tagCount };
  }

  static async setTagCount(n) {
    const tagCount = Math.max(0, Math.min(20, Math.floor(Number(n) || 0)));
    const item = { rnc: CFG_RNC, tagCount, updatedAt: new Date().toISOString() };
    await docClient.send(new PutCommand({ TableName: empresasTableName(), Item: item }));
    return { tagCount };
  }
}
