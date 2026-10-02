import { DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand, UpdateCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDBClient } from '../config/db.config.js';

const docClient = DynamoDBDocumentClient.from(dynamoDBClient);
const TABLE_NAME = process.env.DDB_REGISTROS_TABLE || 'registros_eventos';

/**
 * 🧩 Convierte un item del formato DynamoDB (con .S, .N, .M, .L) a JSON limpio
 */
function cleanDynamo(item) {
  if (Array.isArray(item)) return item.map(cleanDynamo);
  if (item && typeof item === 'object') {
    const keys = Object.keys(item);
    if (keys.length === 1 && ['S', 'N', 'BOOL', 'M', 'L'].includes(keys[0])) {
      const type = keys[0];
      const val = item[type];
      switch (type) {
        case 'S': return val;
        case 'N': return Number(val);
        case 'BOOL': return Boolean(val);
        case 'M': return cleanDynamo(val);
        case 'L': return val.map(cleanDynamo);
        default: return val;
      }
    } else {
      const out = {};
      for (const k in item) out[k] = cleanDynamo(item[k]);
      return out;
    }
  }
  return item;
}

class RegistrationModel {
  static async createRegistration(item) {
    const params = {
      TableName: TABLE_NAME,
      Item: item,
      ConditionExpression: 'attribute_not_exists(id)', // evita sobrescribir
    };
    await docClient.send(new PutCommand(params));
    return item;
  }

  static async upsertDetallesAndTouch(registroId, detallesPatch, ts) {
    const id = String(registroId || '').trim();
    if (!id) throw new Error('registroId requerido');
    const patch = (detallesPatch && typeof detallesPatch === 'object') ? detallesPatch : {};
    const keys = Object.keys(patch);
    if (!keys.length) return await this.getById(id);

    const item = await this.getById(id);
    if (!item) throw new Error('Registro no encontrado');
    const prev = (item.detalles && typeof item.detalles === 'object') ? item.detalles : {};
    const merged = { ...prev, ...patch };

    const baseUpdate = {
      TableName: TABLE_NAME,
      UpdateExpression: 'SET detalles = :det, fechaActualizacion = :ts',
      ExpressionAttributeValues: { ':det': merged, ':ts': ts },
      ReturnValues: 'ALL_NEW'
    };

    try {
      const res1 = await docClient.send(new UpdateCommand({
        ...baseUpdate,
        Key: { id },
        ConditionExpression: 'attribute_exists(id)'
      }));
      return cleanDynamo(res1.Attributes || {});
    } catch (err1) {
      const evId = item?.eventoId || item?.eventId;
      if (!evId || !String(err1?.name).includes('ValidationException')) throw err1;
      const res2 = await docClient.send(new UpdateCommand({
        ...baseUpdate,
        Key: { eventId: evId, id },
        ConditionExpression: 'attribute_exists(id)'
      }));
      return cleanDynamo(res2.Attributes || {});
    }
  }

  static async getByUserId(userId) {
    if (!userId) return [];
    try {
      const params = {
        TableName: TABLE_NAME,
        IndexName: 'UserIndex',
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': userId }
      };
      const res = await docClient.send(new QueryCommand(params));
      const items = res.Items || [];
      return items.map(cleanDynamo);
    } catch (err) {
      const scanParams = {
        TableName: TABLE_NAME,
        FilterExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': userId }
      };
      const sres = await docClient.send(new ScanCommand(scanParams));
      const items = sres.Items || [];
      return items.map(cleanDynamo);
    }
  }

  static async getByEmail(email) {
    if (!email) return [];
    const params = {
      TableName: TABLE_NAME,
      FilterExpression: '#dp.#em = :email',
      ExpressionAttributeNames: { '#dp': 'datosPersona', '#em': 'email' },
      ExpressionAttributeValues: { ':email': email }
    };
    const res = await docClient.send(new ScanCommand(params));
    const items = res.Items || [];
    return items.map(cleanDynamo);
  }

  static async getByShortCode(code){
    if (!code) return null;
    const params = {
      TableName: TABLE_NAME,
      FilterExpression: '#cc = :c',
      ExpressionAttributeNames: { '#cc': 'codigoCorto' },
      ExpressionAttributeValues: { ':c': code }
    };
    const res = await docClient.send(new ScanCommand(params));
    const items = res.Items || [];
    const first = items[0];
    return first ? cleanDynamo(first) : null;
  }

  static async findExistingByUserOrEmailEvent({ userId, email, eventId }) {
    let items = [];
    if (userId) {
      items = await this.getByUserId(userId);
    } else if (email) {
      items = await this.getByEmail(email);
    }
    if (!Array.isArray(items)) items = [];
    const target = String(eventId || '').trim();
    const match = items.find(it => {
      const eid = it?.eventId || it?.eventoId || it?.ID || '';
      return String(eid) === target;
    });
    return match || null;
  }

  static async appendPagoAndTouch(id, pago, ts){
    const base = {
      TableName: TABLE_NAME,
      UpdateExpression: 'SET pagos = list_append(if_not_exists(pagos, :empty), :nuevo), fechaActualizacion = :ts',
      ExpressionAttributeValues: {
        ':empty': [],
        ':nuevo': [pago],
        ':ts': ts
      },
      ReturnValues: 'UPDATED_NEW'
    };
    try {
      return await docClient.send(new UpdateCommand({
        ...base,
        Key: { id },
        ConditionExpression: 'attribute_exists(id)'
      }));
    } catch (err1) {
      if (!String(err1?.name).includes('ValidationException')) throw err1;
      const item = await this.getById(id);
      const evId = item?.eventoId || item?.eventId;
      if (!evId) throw err1;
      return await docClient.send(new UpdateCommand({
        ...base,
        Key: { eventId: evId, id },
        ConditionExpression: 'attribute_exists(id)'
      }));
    }
  }

  static async touchOnly(id, ts){
    const base = {
      TableName: TABLE_NAME,
      UpdateExpression: 'SET fechaActualizacion = :ts',
      ExpressionAttributeValues: { ':ts': ts },
      ReturnValues: 'UPDATED_NEW'
    };
    try {
      return await docClient.send(new UpdateCommand({
        ...base,
        Key: { id },
        ConditionExpression: 'attribute_exists(id)'
      }));
    } catch (err1) {
      if (!String(err1?.name).includes('ValidationException')) throw err1;
      const item = await this.getById(id);
      const evId = item?.eventoId || item?.eventId;
      if (!evId) throw err1;
      return await docClient.send(new UpdateCommand({
        ...base,
        Key: { eventId: evId, id },
        ConditionExpression: 'attribute_exists(id)'
      }));
    }
  }

  static async getById(id) {
    // Intento directo por clave { id }
    try {
      const params = { TableName: TABLE_NAME, Key: { id } };
      const res = await docClient.send(new GetCommand(params));
      if (res.Item) return cleanDynamo(res.Item);
    } catch (err) {
      if (!String(err?.name).includes('ValidationException')) throw err;
      // Fallback a escaneo por id si el esquema requiere clave compuesta
    }
    // Fallback: Scan filtrando por id
    const scanParams = {
      TableName: TABLE_NAME,
      FilterExpression: '#id = :id',
      ExpressionAttributeNames: { '#id': 'id' },
      ExpressionAttributeValues: { ':id': id }
    };
    const sres = await docClient.send(new ScanCommand(scanParams));
    const first = (sres.Items || [])[0];
    return first ? cleanDynamo(first) : null;
  }

  static async listPaymentsByEstado(estado) {
    const params = { TableName: TABLE_NAME };
    const out = [];
    let LastEvaluatedKey = undefined;

    do {
      const res = await docClient.send(new ScanCommand({ ...params, ExclusiveStartKey: LastEvaluatedKey }));
      const items = (res.Items || []).map(cleanDynamo);

      for (const it of items) {
        const pagos = Array.isArray(it.pagos) ? it.pagos : [];
        if (!pagos.length) continue;

        const totalAprobado = pagos
          .filter(p => String(p.estado || '').toLowerCase() === 'aprobado')
          .reduce((s, p) => s + (Number(p.monto) || 0), 0);

        const montoTotal = Number(
          it?.montoTotal ||
          it?.detalles?.precioTotal ||
          it?.detalles?.montoTotal ||
          it?.total ||
          0
        ) || 0;

        const det = it.detalles && typeof it.detalles === 'object' ? it.detalles : {};
        const solFiscal = !!(
          det.solicitaComprobanteFiscal === true ||
          det.solicitaComprobanteFiscal === 'true' ||
          String(det.solicitaComprobanteFiscal || '').toLowerCase() === 'on'
        );
        const rncFiscal = det.rncComprobanteFiscal || det.rncCliente || '';

        for (const p of pagos) {
          const est = String(p.estado || '').toLowerCase();
          if (!estado || est === String(estado).toLowerCase()) {
            out.push({
              registroId: it.id,
              codigoCorto: it.codigoCorto || null,
              eventoId: it.eventoId || it.eventId,
              usuarioId: it.userId || '',
              usuario: {
                nombreCompleto: [it?.datosPersona?.nombre, it?.datosPersona?.apellido].filter(Boolean).join(' '),
                email: it?.datosPersona?.email || '',
                telefono: it?.datosPersona?.telefono || ''
              },
              solicitaComprobanteFiscal: solFiscal,
              rncComprobanteFiscal: rncFiscal || null,
              pago: {
                id: p.id,
                metodo: p.metodo,
                tipo: p.tipo,
                monto: Number(p.monto) || 0,
                estado: est,
                fecha: p.fecha
              },
              totalAprobado,
              montoTotal
            });
          }
        }
      }
      LastEvaluatedKey = res.LastEvaluatedKey;
    } while (LastEvaluatedKey);

    return out;
  }

  /**
   * ✅ Actualiza el estado de un pago y recalcula el total aprobado
   * Si el total abonado >= total del evento → cambia el registro a confirmado
   */
  static async updatePagoEstado(registroId, pagoId, estado, ts) {
    const item = await this.getById(registroId);
    if (!item) throw new Error('Registro no encontrado');

    const pagos = Array.isArray(item.pagos) ? item.pagos : [];
    const idx = pagos.findIndex(p => String(p.id) === String(pagoId));
    if (idx === -1) throw new Error('Pago no encontrado');

    // Cambiar estado del pago seleccionado
    pagos[idx].estado = String(estado).toLowerCase();

    // Recalcular totales por estado (solo usamos aprobados para el estado global)
    const totalAprobado = pagos
      .filter(p => String(p.estado).toLowerCase() === 'aprobado')
      .reduce((s, p) => s + (Number(p.monto) || 0), 0);

    // Calcular monto total del evento
    let montoTotal = Number(
      item?.montoTotal ||
      item?.detalles?.precioTotal ||
      item?.detalles?.montoTotal ||
      item?.total ||
      0
    ) || 0;
    // Si no hay montoTotal definido pero sí hay abonos aprobados, usar totalAprobado como total efectivo
    if (montoTotal <= 0 && totalAprobado > 0) {
      montoTotal = totalAprobado;
    }

    // Determinar nuevo estado general: solo pagos APROBADOS cuentan
    // Si el total aprobado cubre el monto total, marcamos el registro como "pagado"
    const nuevoEstado = totalAprobado >= montoTotal && montoTotal > 0
      ? 'pagado'
      : 'pendiente';

    const baseUpdate = {
      TableName: TABLE_NAME,
      UpdateExpression: 'SET #pagos = :pagos, fechaActualizacion = :ts, totalAprobado = :tot, #estado = :estado',
      ExpressionAttributeNames: { '#pagos': 'pagos', '#estado': 'estado' },
      ExpressionAttributeValues: {
        ':pagos': pagos,
        ':ts': ts,
        ':tot': totalAprobado,
        ':estado': nuevoEstado
      },
      ReturnValues: 'ALL_NEW'
    };

    // Intento 1: clave simple { id }
    try {
      const res1 = await docClient.send(new UpdateCommand({
        ...baseUpdate,
        Key: { id: registroId },
        ConditionExpression: 'attribute_exists(id)'
      }));
      return cleanDynamo(res1.Attributes || {});
    } catch (err1) {
      // Intento 2: clave compuesta { eventId, id }
      const evId = item?.eventoId || item?.eventId;
      if (!evId || !String(err1?.name).includes('ValidationException')) throw err1;
      const res2 = await docClient.send(new UpdateCommand({
        ...baseUpdate,
        Key: { eventId: evId, id: registroId },
        ConditionExpression: 'attribute_exists(id)'
      }));
      return cleanDynamo(res2.Attributes || {});
    }
  }

  static async recomputeEstado(registroId){
    const ts = new Date().toISOString();
    const item = await this.getById(registroId);
    if (!item) throw new Error('Registro no encontrado');

    const pagos = Array.isArray(item.pagos) ? item.pagos : [];
    const totalAprobado = pagos
      .filter(p => String(p.estado || '').toLowerCase() === 'aprobado')
      .reduce((s, p) => s + (Number(p.monto) || 0), 0);

    let montoTotal = Number(
      item?.montoTotal ||
      item?.detalles?.precioTotal ||
      item?.detalles?.montoTotal ||
      item?.total ||
      0
    ) || 0;
    // Si no hay montoTotal definido pero sí hay abonos aprobados, usar totalAprobado como total efectivo
    if (montoTotal <= 0 && totalAprobado > 0) {
      montoTotal = totalAprobado;
    }

    const nuevoEstado = totalAprobado >= montoTotal && montoTotal > 0 ? 'pagado' : 'pendiente';

    const prevTot = Number(item.totalAprobado || 0);
    const prevEst = String(item.estado || 'pendiente').toLowerCase();
    if (prevTot === totalAprobado && prevEst === nuevoEstado) return item;

    const baseUpdate = {
      TableName: TABLE_NAME,
      UpdateExpression: 'SET fechaActualizacion = :ts, totalAprobado = :tot, #estado = :estado',
      ExpressionAttributeNames: { '#estado': 'estado' },
      ExpressionAttributeValues: { ':ts': ts, ':tot': totalAprobado, ':estado': nuevoEstado },
      ReturnValues: 'ALL_NEW'
    };

    try {
      const res1 = await docClient.send(new UpdateCommand({ ...baseUpdate, Key: { id: registroId }, ConditionExpression: 'attribute_exists(id)' }));
      return cleanDynamo(res1.Attributes || {});
    } catch (err1) {
      const evId = item?.eventoId || item?.eventId;
      if (!evId || !String(err1?.name).includes('ValidationException')) throw err1;
      const res2 = await docClient.send(new UpdateCommand({ ...baseUpdate, Key: { eventId: evId, id: registroId }, ConditionExpression: 'attribute_exists(id)' }));
      return cleanDynamo(res2.Attributes || {});
    }
  }

  /**
   * 🗑️ Elimina un registro completo de DynamoDB
   */
  static async deleteRegistration(registroId) {
    const id = String(registroId || '').trim();
    if (!id) throw new Error('registroId es requerido');

    const item = await this.getById(id);
    if (!item) throw new Error('Registro no encontrado');

    try {
      await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id },
        ConditionExpression: 'attribute_exists(id)'
      }));
      return { success: true, deletedId: id };
    } catch (err1) {
      const evId = item?.eventoId || item?.eventId;
      if (!evId || !String(err1?.name).includes('ValidationException')) throw err1;
      await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { eventId: evId, id },
        ConditionExpression: 'attribute_exists(id)'
      }));
      return { success: true, deletedId: id };
    }
  }

  /**
   * 🗑️ Elimina un pago/abono individual de un registro
   */
  static async deletePago(registroId, pagoId) {
    const id = String(registroId || '').trim();
    const pId = String(pagoId || '').trim();
    if (!id) throw new Error('registroId es requerido');
    if (!pId) throw new Error('pagoId es requerido');

    const item = await this.getById(id);
    if (!item) throw new Error('Registro no encontrado');

    const pagos = Array.isArray(item.pagos) ? item.pagos : [];
    const pagoIndex = pagos.findIndex(p => String(p?.id || p?.pagoId || '') === pId);
    
    if (pagoIndex === -1) throw new Error('Pago no encontrado');

    const pagoEliminado = pagos[pagoIndex];
    const nuevosPagos = pagos.filter((_, idx) => idx !== pagoIndex);

    // Recalcular totalAprobado
    const nuevoTotalAprobado = nuevosPagos
      .filter(p => String(p?.estado || '').toLowerCase() === 'aprobado')
      .reduce((sum, p) => sum + (Number(p?.monto) || 0), 0);

    const baseUpdate = {
      TableName: TABLE_NAME,
      UpdateExpression: 'SET pagos = :pagos, totalAprobado = :total, fechaActualizacion = :ts',
      ExpressionAttributeValues: {
        ':pagos': nuevosPagos,
        ':total': nuevoTotalAprobado,
        ':ts': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    };

    try {
      await docClient.send(new UpdateCommand({ ...baseUpdate, Key: { id }, ConditionExpression: 'attribute_exists(id)' }));
      return { success: true, deletedPagoId: pId, pagoEliminado, nuevoTotalAprobado };
    } catch (err1) {
      const evId = item?.eventoId || item?.eventId;
      if (!evId || !String(err1?.name).includes('ValidationException')) throw err1;
      await docClient.send(new UpdateCommand({ ...baseUpdate, Key: { eventId: evId, id }, ConditionExpression: 'attribute_exists(id)' }));
      return { success: true, deletedPagoId: pId, pagoEliminado, nuevoTotalAprobado };
    }
  }

  /** Comprobantes e-CF ya emitidos (tienen eNCF o trackId DGII). */
  static async listComprobantesFiscales() {
    const params = {
      TableName: TABLE_NAME,
      FilterExpression: 'attribute_exists(#d.#ncf) OR attribute_exists(#d.#tid)',
      ExpressionAttributeNames: {
        '#d': 'detalles',
        '#ncf': 'ncfElectronico',
        '#tid': 'dgiiTrackId'
      }
    };
    const out = [];
    let LastEvaluatedKey = undefined;
    do {
      const res = await docClient.send(new ScanCommand({ ...params, ExclusiveStartKey: LastEvaluatedKey }));
      const items = (res.Items || []).map(cleanDynamo);
      for (const it of items) {
        const det = it.detalles && typeof it.detalles === 'object' ? it.detalles : {};
        const encf = String(det.ncfElectronico || '').trim();
        const trackId = String(det.dgiiTrackId || '').trim();
        if (!encf && !trackId) continue;
        const persona = it.datosPersona && typeof it.datosPersona === 'object' ? it.datosPersona : {};
        out.push({
          registroId: it.id,
          codigoCorto: it.codigoCorto || null,
          eventoId: it.eventoId || it.eventId || null,
          eventoNombre: det.eventoNombre || null,
          clienteNombre: [persona.nombre, persona.apellido].filter(Boolean).join(' ').trim() || null,
          clienteEmail: persona.email || det.emailFiscalCliente || det.email || null,
          rncComprador: String(det.rncComprobanteFiscal || det.rncCliente || '').replace(/\D/g, '') || null,
          razonSocial: det.razonSocialCliente || null,
          encf: encf || null,
          tipoeCF: det.tipoeCF || null,
          trackId: trackId || null,
          estado: det.dgiiEstado || (encf ? 'Emitido' : null),
          codigoDgii: det.dgiiCodigo ?? null,
          codigoSeguridad: det.codigoSeguridad || null,
          fechaFirmaDigital: det.fechaFirmaDigital || null,
          emitidoAt: det.dgiiEmitidoAt || it.fechaActualizacion || null,
          environment: det.dgiiEnvironment || null,
          dryRun: det.dgiiDryRun ?? null,
          fileName: det.dgiiFileName || null,
          mensajes: det.dgiiMensajes || null
        });
      }
      LastEvaluatedKey = res.LastEvaluatedKey;
    } while (LastEvaluatedKey);
    out.sort((a, b) => String(b.emitidoAt || '').localeCompare(String(a.emitidoAt || '')));
    return out;
  }
}

export default RegistrationModel;
