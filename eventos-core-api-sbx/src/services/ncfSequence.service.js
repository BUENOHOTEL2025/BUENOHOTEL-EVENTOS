import { DynamoDBDocumentClient, UpdateCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDBClient } from '../config/db.config.js';

const docClient = DynamoDBDocumentClient.from(dynamoDBClient);

function tableName() {
  return String(process.env.DGII_NCF_TABLE || 'ncf_secuencias').trim();
}

function tipoeCFKey(tipoeCF) {
  return String(Number(tipoeCF));
}

function startFor(tipoeCF) {
  const t = Number(tipoeCF);
  const envKey = t === 32 ? 'DGII_NCF_START_32' : 'DGII_NCF_START_31';
  const n = Number(process.env[envKey] || 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function maxFor(tipoeCF) {
  const t = Number(tipoeCF);
  const envKey = t === 32 ? 'DGII_NCF_MAX_32' : 'DGII_NCF_MAX_31';
  const n = Number(process.env[envKey] || 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function formatEncf(tipoeCF, seq) {
  const t = String(Number(tipoeCF)).padStart(2, '0');
  const n = String(Number(seq)).padStart(10, '0');
  return `E${t}${n}`;
}

/**
 * Asegura que exista el item del contador (idempotente).
 */
export async function ensureNcfSequenceSeed(tipoeCF) {
  const TableName = tableName();
  const tipoeCFId = tipoeCFKey(tipoeCF);
  try {
    const existing = await docClient.send(
      new GetCommand({ TableName, Key: { tipoeCF: tipoeCFId } })
    );
    if (existing.Item) return existing.Item;
  } catch (e) {
    // Si la tabla no existe, el emit fallará con mensaje claro
    throw e;
  }

  const start = startFor(tipoeCF);
  const max = maxFor(tipoeCF);
  // lastAssigned = start - 1 → el próximo ADD entrega `start`
  const item = {
    tipoeCF: tipoeCFId,
    lastAssigned: start - 1,
    prefix: `E${String(Number(tipoeCF)).padStart(2, '0')}`,
    maxSequence: max || null,
    updatedAt: new Date().toISOString()
  };
  try {
    await docClient.send(
      new PutCommand({
        TableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(tipoeCF)'
      })
    );
  } catch (e) {
    if (!String(e?.name || '').includes('ConditionalCheckFailed')) throw e;
  }
  return item;
}

/**
 * Reserva el siguiente eNCF de forma atómica (ADD).
 * @returns {{ encf: string, tipoeCF: number, sequence: number }}
 */
export async function allocateNextEncf(tipoeCF) {
  const t = Number(tipoeCF);
  if (t !== 31 && t !== 32) {
    const err = new Error('tipoeCF debe ser 31 o 32');
    err.status = 400;
    throw err;
  }

  await ensureNcfSequenceSeed(t);

  const TableName = tableName();
  const tipoeCFId = tipoeCFKey(t);

  let res;
  try {
    res = await docClient.send(
      new UpdateCommand({
        TableName,
        Key: { tipoeCF: tipoeCFId },
        UpdateExpression: 'ADD lastAssigned :one SET updatedAt = :ts',
        ExpressionAttributeValues: {
          ':one': 1,
          ':ts': new Date().toISOString()
        },
        ReturnValues: 'UPDATED_NEW'
      })
    );
  } catch (e) {
    const msg = String(e?.message || e);
    if (/Requested resource not found|Cannot do operations on a non-existent table/i.test(msg)) {
      const err = new Error(
        `Tabla Dynamo ${TableName} no existe. Créela con PK tipoeCF (S) antes de emitir.`
      );
      err.status = 503;
      err.code = 'DGII_NCF_TABLE_MISSING';
      throw err;
    }
    throw e;
  }

  const sequence = Number(res?.Attributes?.lastAssigned);
  if (!Number.isFinite(sequence) || sequence < 1) {
    const err = new Error('No se pudo asignar secuencia eNCF');
    err.status = 500;
    throw err;
  }

  const max = maxFor(t);
  if (max > 0 && sequence > max) {
    const err = new Error(
      `Se agotó el rango autorizado de e-CF tipo ${t} (máximo ${max}: ${formatEncf(t, max)}). Solicite un nuevo rango en OFV.`
    );
    err.status = 409;
    err.code = 'DGII_NCF_RANGE_EXHAUSTED';
    throw err;
  }

  return {
    tipoeCF: t,
    sequence,
    encf: formatEncf(t, sequence)
  };
}

export function peekNcfConfig(tipoeCF) {
  return {
    table: tableName(),
    tipoeCF: Number(tipoeCF),
    start: startFor(tipoeCF),
    max: maxFor(tipoeCF)
  };
}
