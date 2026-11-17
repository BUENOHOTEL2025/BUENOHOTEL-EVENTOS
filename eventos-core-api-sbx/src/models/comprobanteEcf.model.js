import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDBClient } from '../config/db.config.js';

const docClient = DynamoDBDocumentClient.from(dynamoDBClient, {
  marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true }
});

function omitUndef(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map(omitUndef).filter((x) => x !== undefined);
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const next = omitUndef(v);
    if (next !== undefined) out[k] = next;
  }
  return out;
}

/** Quita undefined (Dynamo no los acepta) aunque el marshaller no esté configurado. */
function dynamoSafe(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return omitUndef(value);
  }
}

export function ledgerTableName() {
  return String(process.env.DGII_ECF_LEDGER_TABLE || 'comprobantes_ecf').trim();
}

export function pickMontoFiscal(...vals) {
  for (const v of vals) {
    if (v == null || v === '') continue;
    if (typeof v === 'object') {
      const n = pickMontoFiscal(
        v.MontoTotal,
        v.MontoPeriodo,
        v.ValorPagar,
        v.totalRD,
        v.montoTotal,
        v.precioTotal,
        v.MontoPago
      );
      if (n != null) return n;
      continue;
    }
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
    const cleaned = Number(String(v).replace(/,/g, ''));
    if (Number.isFinite(cleaned) && cleaned > 0) return cleaned;
  }
  return null;
}

export function montoFromXml(xml) {
  if (!xml || typeof xml !== 'string') return null;
  const m = xml.match(/<MontoTotal>\s*([^<]+)\s*<\/MontoTotal>/i);
  return m ? pickMontoFiscal(m[1]) : null;
}

function stripHeavy(item) {
  if (!item || typeof item !== 'object') return item;
  const { xmlFirmado, snapshot, ...rest } = item;
  const snapTot = snapshot?.totales || {};
  const monto = pickMontoFiscal(
    montoFromXml(xmlFirmado),
    snapTot,
    snapshot?.MontoTotal,
    snapshot?.totalRD,
    snapshot?.montoTotal,
    rest.montoTotal
  );
  return {
    ...rest,
    montoTotal: monto,
    direccionComprador:
      rest.direccionComprador ||
      snapshot?.comprador?.direccion ||
      snapshot?.comprador?.direccionFiscal ||
      null,
    tieneXml: Boolean(xmlFirmado) || Boolean(rest.tieneXml),
    tieneImpresion:
      Boolean(rest.tieneImpresion) ||
      Boolean(snapshot && (snapshot.lineas?.length || snapshot.comprador)) ||
      Boolean(rest.registroId)
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
    const record = dynamoSafe(
      omitUndef({
        ...item,
        encf,
        updatedAt: now,
        emitidoAt: item.emitidoAt || now
      })
    );
    await docClient.send(
      new PutCommand({
        TableName: ledgerTableName(),
        Item: record
      })
    );
    return record;
  }

  static async upsert(fields = {}) {
    const encf = String(fields?.encf || '').trim().toUpperCase();
    if (!encf) {
      const err = new Error('encf requerido para el libro de comprobantes');
      err.status = 400;
      throw err;
    }
    const existing = await this.getByEncf(encf);
    const origenReal = (v) => v && v !== 'consulta';
    const merged = {
      ...(existing || {}),
      ...fields,
      encf,
      origen: origenReal(existing?.origen)
        ? existing.origen
        : fields.origen || existing?.origen || 'consulta',
      snapshot: fields.snapshot || existing?.snapshot,
      xmlFirmado: fields.xmlFirmado || existing?.xmlFirmado,
      registroId: fields.registroId || existing?.registroId || null,
      rncComprador: fields.rncComprador || existing?.rncComprador || null,
      razonSocial: fields.razonSocial || existing?.razonSocial || null,
      tieneXml: Boolean(fields.xmlFirmado || existing?.xmlFirmado || fields.tieneXml || existing?.tieneXml),
      tieneImpresion: Boolean(
        fields.tieneImpresion ||
          existing?.tieneImpresion ||
          fields.snapshot ||
          existing?.snapshot ||
          fields.registroId ||
          existing?.registroId
      ),
      emitidoAt: existing?.emitidoAt || fields.emitidoAt
    };
    return this.put(merged);
  }

  static async patch(encf, fields = {}) {
    const ncf = String(encf || '').trim().toUpperCase();
    const existing = await this.getByEncf(ncf);
    if (!existing) return this.upsert({ ...fields, encf: ncf });
    return this.put({ ...existing, ...fields, encf: ncf });
  }

  static dropNulls(item) {
    if (!item || typeof item !== 'object') return item;
    const out = {};
    for (const [k, v] of Object.entries(item)) {
      if (v === undefined || v === null) continue;
      out[k] = v;
    }
    return out;
  }

  static async listAll({ includeHeavy = false, projectLight = !includeHeavy } = {}) {
    const TableName = ledgerTableName();
    const out = [];
    let ExclusiveStartKey;
    try {
      do {
        const params = { TableName, ExclusiveStartKey };
        if (projectLight) {
          params.ProjectionExpression = [
            'encf, tipoeCF, origen, registroId, referenciaInterna, rncComprador, razonSocial',
            'emailComprador, telefonoComprador, direccionComprador, trackId, #est, codigoDgii',
            'codigoSeguridad, fechaFirmaDigital, emitidoAt, #env, dryRun, fileName',
            'mensajes, montoTotal, tieneXml, tieneImpresion, fechaRecepcion, consultadoAt, errorEnvio'
          ].join(', ');
          params.ExpressionAttributeNames = { '#est': 'estado', '#env': 'environment' };
        }
        const res = await docClient.send(new ScanCommand(params));
        out.push(...(res.Items || []).map((x) => this.dropNulls(x)));
        ExclusiveStartKey = res.LastEvaluatedKey;
      } while (ExclusiveStartKey);
    } catch (e) {
      if (projectLight) {
        console.error('listAll proyección, reintento completo:', e?.message || e);
        return this.listAll({ includeHeavy, projectLight: false });
      }
      throw e;
    }
    const rows = includeHeavy ? out : out.map(stripHeavy);
    rows.sort((a, b) => String(b.emitidoAt || '').localeCompare(String(a.emitidoAt || '')));
    return rows;
  }
}
