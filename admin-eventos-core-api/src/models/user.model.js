import { DynamoDBDocumentClient, ScanCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDBClient } from '../config/db.config.js';

const docClient = DynamoDBDocumentClient.from(dynamoDBClient);
const TABLE_NAME = process.env.DDB_USUARIOS_TABLE || 'usuarios';

function unmarshal(val){
  if (Array.isArray(val)) return val.map(unmarshal);
  if (val && typeof val === 'object'){
    const keys = Object.keys(val);
    if (keys.length === 1 && ['S','N','BOOL','M','L'].includes(keys[0])){
      const t = keys[0];
      const v = val[t];
      switch(t){
        case 'S': return v;
        case 'N': return Number(v);
        case 'BOOL': return Boolean(v);
        case 'M': return unmarshal(v);
        case 'L': return Array.isArray(v) ? v.map(unmarshal) : v;
        default: return v;
      }
    }
    const out={}; for (const k in val) out[k]=unmarshal(val[k]); return out;
  }
  return val;
}

function pickUser(raw){
  const item = unmarshal(raw || {});
  let id = item.id || item.userId || item.usuarioId || item.pk || '';
  if (typeof id === 'string' && id.startsWith('USER#')) id = id.slice(5);
  const nombre = item.nombre || item.firstName || '';
  const apellido = item.apellido || item.lastName || '';
  const nombreCompleto = item.nombreCompleto || [nombre, apellido].filter(Boolean).join(' ').trim() || item.name || '';
  const email = item.email || item.correo || '';
  return { id: String(id||'').trim(), nombreCompleto: String(nombreCompleto||'').trim(), email: String(email||'').trim() };
}

function pickUserFull(raw){
  const item = unmarshal(raw || {});
  let id = item.id || item.userId || item.usuarioId || item.pk || '';
  if (typeof id === 'string' && id.startsWith('USER#')) id = id.slice(5);
  const out = { ...item, id: String(id || '').trim() };
  if ('password' in out) delete out.password;
  if ('passwordHash' in out) delete out.passwordHash;
  if ('hash' in out) delete out.hash;
  return out;
}

export default class UserModel {
  static async listAll(){
    const params = { TableName: TABLE_NAME };
    const acc = [];
    let LastEvaluatedKey = undefined;
    do {
      const res = await docClient.send(new ScanCommand({ ...params, ExclusiveStartKey: LastEvaluatedKey }));
      const items = Array.isArray(res.Items) ? res.Items : [];
      for (const it of items){ acc.push(pickUserFull(it)); }
      LastEvaluatedKey = res.LastEvaluatedKey;
    } while (LastEvaluatedKey);
    const map = new Map();
    acc.filter(u=>u && (u.id || u.email)).forEach(u => map.set(u.id || u.email, u));
    return Array.from(map.values());
  }

  static async getById(id){
    const key = String(id || '').trim();
    if (!key) return null;

    const tryKeys = [
      { id: key },
      { id: `USER#${key}` }
    ];

    for (const Key of tryKeys){
      try {
        const res = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key }));
        if (res && res.Item) return pickUserFull(res.Item);
      } catch (_){
        // seguir intentando con otras variantes
      }
    }
    return null;
  }

  static async updateById(id, data){
    const key = String(id || '').trim();
    if (!key) throw new Error('id requerido');

    const allowedFields = ['nombre', 'apellido', 'telefono', 'documento', 'tipoDocumento', 'fechaNacimiento', 'rol', 'activo'];
    const updates = {};
    for (const field of allowedFields){
      if (data[field] !== undefined) updates[field] = data[field];
    }
    
    if (Object.keys(updates).length === 0) throw new Error('No hay campos para actualizar');

    updates.fechaActualizacion = new Date().toISOString();

    const exprParts = [];
    const exprNames = {};
    const exprValues = {};
    
    Object.entries(updates).forEach(([k, v], i) => {
      exprParts.push(`#f${i} = :v${i}`);
      exprNames[`#f${i}`] = k;
      exprValues[`:v${i}`] = v;
    });

    const params = {
      TableName: TABLE_NAME,
      Key: { id: key },
      UpdateExpression: 'SET ' + exprParts.join(', '),
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues,
      ReturnValues: 'ALL_NEW'
    };

    const res = await docClient.send(new UpdateCommand(params));
    return pickUserFull(res.Attributes);
  }
}
