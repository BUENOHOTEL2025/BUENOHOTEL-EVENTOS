import { randomUUID } from 'crypto';
import { createRequire } from 'module';
import { DynamoDBDocumentClient, ScanCommand, GetCommand, UpdateCommand, QueryCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');
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

function looksMarshalled(val) {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
  const keys = Object.keys(val);
  return keys.length === 1 && ['S', 'N', 'BOOL', 'M', 'L'].includes(keys[0]);
}

function pickUserFull(raw){
  const item = looksMarshalled(raw) || (raw && typeof raw === 'object' && looksMarshalled(Object.values(raw)[0]))
    ? unmarshal(raw || {})
    : { ...(raw || {}) };
  let id = item.id || item.userId || item.usuarioId || item.pk || '';
  if (typeof id === 'string' && id.startsWith('USER#')) id = id.slice(5);
  const out = { ...item, id: String(id || '').trim() };
  if ('password' in out) delete out.password;
  if ('passwordHash' in out) delete out.passwordHash;
  if ('hash' in out) delete out.hash;
  return out;
}

const EMAIL_GSI = process.env.EMAIL_GSI || 'EmailIndex';
const ADMIN_PROJECTION =
  'id, email, #r, activo, nombre, apellido, nombreCompleto, telefono, permisosEcf, fechaActualizacion';

export default class UserModel {
  static async getByEmail(email) {
    const key = String(email || '').trim().toLowerCase();
    if (!key) return null;
    try {
      const res = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: EMAIL_GSI,
          KeyConditionExpression: 'email = :e',
          ExpressionAttributeValues: { ':e': key },
          Limit: 1
        })
      );
      const item = Array.isArray(res.Items) && res.Items[0] ? res.Items[0] : null;
      return item ? pickUserFull(item) : null;
    } catch (err) {
      console.error('usuarios getByEmail:', err?.message || err);
      return null;
    }
  }

  static async listByEmails(emails) {
    const uniq = [
      ...new Set(
        (emails || [])
          .map((e) => String(e || '').trim().toLowerCase())
          .filter(Boolean)
      )
    ];
    const rows = await Promise.all(uniq.map((e) => this.getByEmail(e)));
    return rows.filter(Boolean);
  }

  static async listPanelAdmins(extraEmails = []) {
    const seeds = String(
      process.env.ECF_ADMIN_EMAILS ||
        'soporte@buenohotel.com.do,elmerluissainthilarerojo@gmail.com,info@buenohotel.com'
    )
      .split(/[,;]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const queried = await this.listByEmails([...seeds, ...(extraEmails || [])]);
    try {
      const scanned = await Promise.race([
        this.scanRolAdmin(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('scan-timeout')), 3500))
      ]);
      const map = new Map();
      [...queried, ...scanned].forEach((u) => {
        if (u && (u.id || u.email)) map.set(String(u.email || u.id).toLowerCase(), u);
      });
      return Array.from(map.values());
    } catch (err) {
      console.error('listPanelAdmins scan:', err?.message || err);
      return queried;
    }
  }

  static async scanRolAdmin() {
    const acc = [];
    let LastEvaluatedKey = undefined;
    do {
      const res = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          ProjectionExpression: ADMIN_PROJECTION,
          FilterExpression: '#r IN (:a, :b)',
          ExpressionAttributeNames: { '#r': 'rol' },
          ExpressionAttributeValues: { ':a': 'admin', ':b': 'administrador' },
          ExclusiveStartKey: LastEvaluatedKey
        })
      );
      const items = Array.isArray(res.Items) ? res.Items : [];
      for (const it of items) acc.push(pickUserFull(it));
      LastEvaluatedKey = res.LastEvaluatedKey;
    } while (LastEvaluatedKey);
    return acc;
  }

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

    const allowedFields = [
      'nombre',
      'apellido',
      'telefono',
      'documento',
      'tipoDocumento',
      'fechaNacimiento',
      'rol',
      'activo',
      'permisosEcf'
    ];
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

  static async createAdmin({ email, password, nombre, apellido, telefono, permisosEcf }) {
    const now = new Date().toISOString();
    const id = randomUUID();
    const hash = bcrypt.hashSync(String(password || '').replace(/\s+/g, ''), 10);
    const item = {
      id,
      email: String(email).trim().toLowerCase(),
      nombre: String(nombre || '').trim(),
      apellido: String(apellido || '').trim(),
      nombreCompleto: [String(nombre || '').trim(), String(apellido || '').trim()].filter(Boolean).join(' '),
      telefono: String(telefono || '').trim(),
      rol: 'admin',
      activo: true,
      password: hash,
      permisosEcf: permisosEcf || {},
      fechaCreacion: now,
      fechaActualizacion: now
    };
    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
    return pickUserFull(item);
  }

  static async deleteById(id) {
    const key = String(id || '').trim();
    if (!key) throw new Error('id requerido');
    const existing = await this.getById(key);
    if (!existing) return null;
    await docClient.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { id: existing.id || key } }));
    return existing;
  }
}
