import { randomUUID } from 'crypto';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand
} from '@aws-sdk/lib-dynamodb';
import { dynamoDBClient } from '../config/db.config.js';
import { auditoriaTableName } from './auditoriaEcf.model.js';

const docClient = DynamoDBDocumentClient.from(dynamoDBClient, {
  marshallOptions: { removeUndefinedValues: true }
});

const PK = 'PKG';

function table() {
  return auditoriaTableName();
}

export function slugify(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function lines(v) {
  if (Array.isArray(v)) return v.map((x) => String(x || '').trim()).filter(Boolean);
  return String(v || '')
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function langBlock(raw = {}) {
  return {
    titulo: String(raw.titulo || '').trim().slice(0, 160),
    subtitulo: String(raw.subtitulo || '').trim().slice(0, 240),
    intro: String(raw.intro || '').trim().slice(0, 8000),
    incluye: lines(raw.incluye).slice(0, 40),
    noIncluye: lines(raw.noIncluye).slice(0, 40),
    itinerario: lines(raw.itinerario).slice(0, 40),
    terminos: lines(raw.terminos).slice(0, 30),
    nota: String(raw.nota || '').trim().slice(0, 800),
    ctaLabel: String(raw.ctaLabel || '').trim().slice(0, 60)
  };
}

export function normalizePaquete(body, prev = {}) {
  const titulo = String(body?.es?.titulo || body?.titulo || prev.es?.titulo || '').trim();
  const slug = slugify(body?.slug || prev.slug || titulo);
  const salidas = Array.isArray(body?.salidas) ? body.salidas : prev.salidas || [];
  return {
    pk: PK,
    sk: slug,
    slug,
    id: prev.id || randomUUID(),
    activo: typeof body?.activo === 'boolean' ? body.activo : prev.activo !== false,
    precioDesde: String(body?.precioDesde || prev.precioDesde || '').trim().slice(0, 40),
    moneda: ['USD', 'DOP', 'EUR'].includes(String(body?.moneda || prev.moneda || 'USD').trim().toUpperCase())
      ? String(body?.moneda || prev.moneda || 'USD').trim().toUpperCase()
      : 'USD',
    imagenHero: String(body?.imagenHero || prev.imagenHero || '').trim().slice(0, 2000),
    imagenOpciones: lines(body?.imagenOpciones || prev.imagenOpciones).slice(0, 2),
    galeria: lines(body?.galeria || prev.galeria).slice(0, 12),
    whatsapp: String(body?.whatsapp || prev.whatsapp || '').replace(/\D/g, '').slice(0, 15),
    ctaUrl: (function () {
      const n = String(body?.whatsapp || prev.whatsapp || '').replace(/\D/g, '').slice(0, 15);
      return n ? 'https://wa.me/' + n : '';
    })(),
    salidas: salidas
      .map((s) => ({
        fecha: String(s.fecha || '').trim().slice(0, 32),
        cupo: String(s.cupo || '').trim().slice(0, 20),
        notas: String(s.notas || '').trim().slice(0, 200)
      }))
      .filter((s) => s.fecha)
      .slice(0, 24),
    es: langBlock(body?.es && typeof body.es === 'object' ? body.es : prev.es || {}),
    en: langBlock(body?.en && typeof body.en === 'object' ? body.en : prev.en || {}),
    createdAt: prev.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function publicPaquete(item, lang = 'es') {
  if (!item) return null;
  const L = lang === 'en' ? 'en' : 'es';
  const block = { ...item.es, ...(item[L] || {}) };
  if (!block.titulo && item.es?.titulo) Object.assign(block, item.es);
  return {
    slug: item.slug,
    activo: item.activo !== false,
    precioDesde: item.precioDesde || '',
    moneda: item.moneda || 'USD',
    imagenHero: item.imagenHero || '',
    imagenOpciones: item.imagenOpciones || [],
    galeria: item.galeria || [],
    ctaUrl: item.ctaUrl || '',
    whatsapp: item.whatsapp || '',
    salidas: item.salidas || [],
    ...block
  };
}

export default class PaqueteModel {
  static async listAll() {
    const items = [];
    let start;
    do {
      const res = await docClient.send(
        new QueryCommand({
          TableName: table(),
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': PK },
          ExclusiveStartKey: start
        })
      );
      items.push(...(res.Items || []));
      start = res.LastEvaluatedKey;
    } while (start);
    items.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    return items;
  }

  static async getBySlug(slug) {
    const sk = slugify(slug);
    if (!sk) return null;
    const res = await docClient.send(
      new GetCommand({ TableName: table(), Key: { pk: PK, sk } })
    );
    return res.Item || null;
  }

  static async save(item) {
    await docClient.send(new PutCommand({ TableName: table(), Item: item }));
    return item;
  }

  static async remove(slug) {
    const sk = slugify(slug);
    await docClient.send(new DeleteCommand({ TableName: table(), Key: { pk: PK, sk } }));
  }
}
