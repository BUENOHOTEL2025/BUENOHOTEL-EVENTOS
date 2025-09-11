import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/config.js';

// Configurar AWS SDK
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1'
});

const docClient = new AWS.DynamoDB.DocumentClient();

export class EventRegistration {
  /**
   * Crea un nuevo registro de evento
   * @param {Object} registrationData - Datos del registro
   * @returns {Promise<Object>} Registro creado
   */
  static async create(registrationData) {
    const registrationId = uuidv4();
    const timestamp = new Date().toISOString();
    
    const params = {
      TableName: config.dynamoDB.registrationsTable,
      Item: {
        id: registrationId,
        eventoId: registrationData.eventoId,
        usuarioId: registrationData.usuarioId,
        fechaRegistro: timestamp,
        estado: 'pendiente', // pendiente, confirmado, cancelado
        asistentes: registrationData.asistentes || 1,
        detalles: registrationData.detalles || {},
        fechaActualizacion: timestamp,
        ...registrationData // Incluye cualquier otro campo adicional
      }
    };

    try {
      await docClient.put(params).promise();
      return params.Item;
    } catch (error) {
      console.error('Error al crear registro de evento:', error);
      throw error;
    }
  }

  /**
   * Obtiene un registro por su ID
   * @param {string} registrationId - ID del registro
   * @returns {Promise<Object|null>} Registro encontrado o null
   */
  static async getById(registrationId, eventoId = null) {
    // Si conocemos eventoId (sort key), usamos get directo; de lo contrario intentamos un scan como fallback
    if (eventoId) {
      const params = {
        TableName: config.dynamoDB.registrationsTable,
        Key: { id: registrationId, eventoId }
      };
      const result = await docClient.get(params).promise();
      return result.Item || null;
    }
    // Fallback: escanear por id (útil si el esquema requiere sort key)
    const scanParams = {
      TableName: config.dynamoDB.registrationsTable,
      FilterExpression: '#id = :id',
      ExpressionAttributeNames: { '#id': 'id' },
      ExpressionAttributeValues: { ':id': registrationId },
      Limit: 1
    };
    const scanRes = await docClient.scan(scanParams).promise();
    return (scanRes.Items && scanRes.Items[0]) || null;
  }

  /**
   * Obtiene un registro e incluye totales computados de pagos
   * @param {string} registrationId
   */
  static async getWithComputedTotals(registrationId){
    const item = await this.getById(registrationId);
    if (!item) return null;
    const pagos = Array.isArray(item.pagos) ? item.pagos : [];
    // Sumar solo pagos aprobados (o sin estado pero no transferencias antiguas con cancelado)
    const totalAbonado = pagos.reduce((sum, p)=>{
      const estado = (p?.estado || p?.status || '').toLowerCase();
      const metodo = (p?.metodo || '').toLowerCase();
      const aprobado = estado === 'aprobado' || (!estado && metodo !== 'transferencia');
      const cancelado = estado === 'cancelado';
      return aprobado && !cancelado ? sum + Number(p?.monto || 0) : sum;
    }, 0);
    const montoTotal = item.detalles?.precioTotal || item.detalles?.montoTotal || item.total || null;
    return { ...item, totalAbonado, montoTotal };
  }

  /**
   * Busca registros por ID de evento
   * @param {string} eventId - ID del evento
   * @returns {Promise<Array>} Lista de registros
   */
  static async getByEventId(eventId) {
    const params = {
      TableName: config.dynamoDB.registrationsTable,
      IndexName: 'EventoIndex',
      KeyConditionExpression: 'eventoId = :eventoId',
      ExpressionAttributeValues: {
        ':eventoId': eventId
      }
    };

    const result = await docClient.query(params).promise();
    return result.Items || [];
  }

  /**
   * Obtiene un registro (si existe) para un usuario y evento específicos.
   * Usa el índice UsuarioIndex y filtra por eventoId. Retorna el primero encontrado o null.
   */
  static async getByUserAndEvent(usuarioId, eventoId) {
    if (!usuarioId || !eventoId) return null;
    const params = {
      TableName: config.dynamoDB.registrationsTable,
      IndexName: 'UsuarioIndex',
      KeyConditionExpression: 'usuarioId = :uid',
      FilterExpression: 'eventoId = :eid',
      ExpressionAttributeValues: {
        ':uid': usuarioId,
        ':eid': eventoId
      },
      Limit: 1
    };
    const result = await docClient.query(params).promise();
    const items = result.Items || [];
    return items[0] || null;
  }

  /**
   * Busca registros por ID de usuario
   * @param {string} userId - ID del usuario
   * @returns {Promise<Array>} Lista de registros
   */
  static async getByUserId(userId) {
    const params = {
      TableName: config.dynamoDB.registrationsTable,
      IndexName: 'UsuarioIndex',
      KeyConditionExpression: 'usuarioId = :usuarioId',
      ExpressionAttributeValues: {
        ':usuarioId': userId
      }
    };

    const result = await docClient.query(params).promise();
    return result.Items || [];
  }

  /**
   * Actualiza un registro
   * @param {string} registrationId - ID del registro
   * @param {Object} updates - Campos a actualizar
   * @returns {Promise<Object>} Registro actualizado
   */
  static async update(registrationId, updates) {
    // No permitir actualización de IDs
    const { id, eventoId: _skipEventoId, usuarioId, ...safeUpdates } = updates;

    // Obtener item para conocer eventoId (clave compuesta)
    const existing = await this.getById(registrationId);
    if (!existing) throw new Error('Registro no encontrado');
    const eventoId = existing.eventoId;

    // Generar la expresión de actualización dinámica
    const updateExpressions = [];
    const expressionAttributeValues = {};
    let expressionAttributeNames = {};

    Object.entries(safeUpdates).forEach(([key, value], index) => {
      const attrKey = `#attr${index}`;
      const valKey = `:val${index}`;
      updateExpressions.push(`${attrKey} = ${valKey}`);
      expressionAttributeNames[attrKey] = key;
      expressionAttributeValues[valKey] = value;
    });

    // Agregar fecha de actualización
    updateExpressions.push('#updatedAt = :now');
    expressionAttributeNames['#updatedAt'] = 'fechaActualizacion';
    expressionAttributeValues[':now'] = new Date().toISOString();

    const params = {
      TableName: config.dynamoDB.registrationsTable,
      Key: { id: registrationId, eventoId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    };

    try {
      const result = await docClient.update(params).promise();
      return result.Attributes;
    } catch (error) {
      console.error('Error al actualizar registro:', error);
      throw error;
    }
  }

  /**
   * Elimina un registro
   * @param {string} registrationId - ID del registro
   * @returns {Promise<boolean>} true si se eliminó correctamente
   */
  static async delete(registrationId) {
    // Obtener item para conocer eventoId (clave compuesta)
    const existing = await this.getById(registrationId);
    if (!existing) return false;
    const params = {
      TableName: config.dynamoDB.registrationsTable,
      Key: { id: registrationId, eventoId: existing.eventoId }
    };

    try {
      await docClient.delete(params).promise();
      return true;
    } catch (error) {
      console.error('Error al eliminar registro:', error);
      return false;
    }
  }

  /**
   * Cambia el estado de un registro
   * @param {string} registrationId - ID del registro
   * @param {string} newStatus - Nuevo estado (pendiente, confirmado, cancelado)
   * @returns {Promise<Object>} Registro actualizado
   */
  static async changeStatus(registrationId, newStatus) {
    const validStatuses = ['pendiente', 'confirmado', 'cancelado'];
    if (!validStatuses.includes(newStatus)) {
      throw new Error('Estado no válido');
    }

    return this.update(registrationId, {
      estado: newStatus
    });
  }

  /**
   * Agrega un pago (abono) al registro y retorna el registro actualizado.
   * Si existe un monto total y se completa, actualiza estado a 'confirmado'.
   */
  static async addPayment(registrationId, payment){
    const now = new Date().toISOString();
    const pago = {
      id: payment?.id || uuidv4(),
      tipo: payment?.tipo || 'abono',
      monto: Number(payment?.monto || 0),
      metodo: payment?.metodo || 'transferencia',
      estado: (()=>{
        const m = (payment?.metodo || 'transferencia').toLowerCase();
        // Transferencias/depósitos quedan pendientes hasta aprobación; otros (p.ej. tarjeta) aprobados directo
        if (m === 'transferencia' || m === 'depósito' || m === 'deposito') return payment?.estado || 'pendiente';
        return payment?.estado || 'aprobado';
      })(),
      referencia: payment?.referencia || undefined,
      fecha: payment?.fecha || now
    };

    // Obtener item para conocer eventoId (clave compuesta)
    const existing = await this.getById(registrationId);
    if (!existing) throw new Error('Registro no encontrado');

    const params = {
      TableName: config.dynamoDB.registrationsTable,
      Key: { id: registrationId, eventoId: existing.eventoId },
      UpdateExpression: 'SET pagos = list_append(if_not_exists(pagos, :empty), :pago), fechaActualizacion = :now',
      ExpressionAttributeValues: {
        ':empty': [],
        ':pago': [pago],
        ':now': now
      },
      ReturnValues: 'ALL_NEW'
    };

    const result = await docClient.update(params).promise();
    const updated = result.Attributes;
    try {
      const pagosArr = Array.isArray(updated.pagos) ? updated.pagos : [];
      const totalAprobado = pagosArr.reduce((s, p)=>{
        const estado = (p?.estado || p?.status || '').toLowerCase();
        const metodo = (p?.metodo || '').toLowerCase();
        const aprobado = estado === 'aprobado' || (!estado && metodo !== 'transferencia');
        const cancelado = estado === 'cancelado';
        return aprobado && !cancelado ? s + Number(p?.monto || 0) : s;
      }, 0);
      const montoTotal = updated?.detalles?.precioTotal || updated?.detalles?.montoTotal || updated?.total || null;
      const saldo = (montoTotal != null) ? Math.max(0, Number(montoTotal) - Number(totalAprobado)) : null;
      const setFields = { totalAprobado, ...(saldo!=null? { saldo } : {}) };
      // Confirmar si corresponde
      if (montoTotal && totalAprobado >= Number(montoTotal)){
        setFields.estado = 'confirmado';
      }
      if (Object.keys(setFields).length){
        await this.update(registrationId, setFields);
        Object.assign(updated, setFields);
      }
    } catch(_e) {}
    return updated;
  }

  /**
   * Retorna pagos pendientes por usuario: agrupa por registro y filtra pagos con estado pendiente.
   */
  static async getPendingPaymentsByUser(usuarioId){
    const regs = await this.getByUserId(usuarioId);
    const out = [];
    regs.forEach(r => {
      const pagos = Array.isArray(r.pagos) ? r.pagos : [];
      pagos.forEach(p => {
        const estado = (p?.estado || p?.status || '').toLowerCase();
        if (estado === 'pendiente'){
          out.push({
            registroId: r.id,
            eventoId: r.eventoId,
            pago: p
          });
        }
      });
    });
    return out;
  }

  /**
   * Retorna todos los pagos por estado (pendiente/aprobado/cancelado/todos)
   */
  static async getAllPaymentsByEstado(estado = 'pendiente'){
    const wanted = String(estado || 'pendiente').toLowerCase();
    const scanParams = { TableName: config.dynamoDB.registrationsTable };
    const out = [];
    let lastKey = null;
    do {
      if (lastKey) scanParams.ExclusiveStartKey = lastKey;
      const res = await docClient.scan(scanParams).promise();
      const items = res.Items || [];
      items.forEach(r => {
        const pagos = Array.isArray(r.pagos) ? r.pagos : [];
        const aprobados = pagos.filter(pp => String(pp?.estado || pp?.status || '').toLowerCase() === 'aprobado');
        const totalAprobado = aprobados.reduce((s,pp)=> s + Number(pp?.monto || 0), 0);
        const montoTotal = r?.montoTotal || r?.detalles?.precioTotal || r?.detalles?.montoTotal || r?.total || null;
        pagos.forEach(p => {
          const est = String(p?.estado || p?.status || '').toLowerCase();
          const include = wanted === 'todos' ? true : (est === wanted);
          if (include){
            out.push({
              registroId: r.id,
              eventoId: r.eventoId,
              usuarioId: r.usuarioId,
              totalAprobado,
              montoTotal: (montoTotal!=null)? Number(montoTotal) : null,
              pago: p
            });
          }
        });
      });
      lastKey = res.LastEvaluatedKey;
    } while (lastKey);
    return out;
  }

  /**
   * Retorna todos los pagos pendientes (para admins) recorriendo todos los registros.
   */
  static async getAllPendingPayments(){
    const scanParams = { TableName: config.dynamoDB.registrationsTable };
    const out = [];
    let lastKey = null;
    do {
      if (lastKey) scanParams.ExclusiveStartKey = lastKey;
      const res = await docClient.scan(scanParams).promise();
      const items = res.Items || [];
      items.forEach(r => {
        const pagos = Array.isArray(r.pagos) ? r.pagos : [];
        const aprobados = pagos.filter(pp => String(pp?.estado || pp?.status || '').toLowerCase() === 'aprobado');
        const totalAprobado = aprobados.reduce((s,pp)=> s + Number(pp?.monto || 0), 0);
        const montoTotal = r?.montoTotal || r?.detalles?.precioTotal || r?.detalles?.montoTotal || r?.total || null;
        pagos.forEach(p => {
          const estado = (p?.estado || p?.status || '').toLowerCase();
          if (estado === 'pendiente'){
            out.push({
              registroId: r.id,
              eventoId: r.eventoId,
              usuarioId: r.usuarioId,
              totalAprobado,
              montoTotal: (montoTotal!=null)? Number(montoTotal) : null,
              pago: p
            });
          }
        });
      });
      lastKey = res.LastEvaluatedKey;
    } while (lastKey);
    return out;
  }

  /**
   * Actualiza el estado de un pago específico por su id dentro del registro
   */
  static async updatePaymentStatus(registrationId, pagoId, nuevoEstado){
    // Obtener item y clave compuesta
    const existing = await this.getById(registrationId);
    if (!existing) throw new Error('Registro no encontrado');
    const eventoId = existing.eventoId;
    const pagos = Array.isArray(existing.pagos) ? existing.pagos : [];
    const idx = pagos.findIndex(p => p?.id === pagoId);
    if (idx === -1) throw new Error('Pago no encontrado');
    pagos[idx] = { ...pagos[idx], estado: nuevoEstado };

    const params = {
      TableName: config.dynamoDB.registrationsTable,
      Key: { id: registrationId, eventoId },
      UpdateExpression: 'SET pagos = :pagos, fechaActualizacion = :now',
      ExpressionAttributeValues: {
        ':pagos': pagos,
        ':now': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    };
    const result = await docClient.update(params).promise();
    const updated = result.Attributes;
    // Recalcular y denormalizar totales
    try {
      const pagosArr = Array.isArray(updated.pagos) ? updated.pagos : [];
      const totalAprobado = pagosArr.reduce((s, p)=>{
        const estado = (p?.estado || p?.status || '').toLowerCase();
        const metodo = (p?.metodo || '').toLowerCase();
        const aprobado = estado === 'aprobado' || (!estado && metodo !== 'transferencia');
        const cancelado = estado === 'cancelado';
        return aprobado && !cancelado ? s + Number(p?.monto || 0) : s;
      }, 0);
      const montoTotal = updated?.detalles?.precioTotal || updated?.detalles?.montoTotal || updated?.total || null;
      const saldo = (montoTotal != null) ? Math.max(0, Number(montoTotal) - Number(totalAprobado)) : null;
      const setFields = { totalAprobado, ...(saldo!=null? { saldo } : {}) };
      if (montoTotal && totalAprobado >= Number(montoTotal)){
        setFields.estado = 'confirmado';
      }
      if (Object.keys(setFields).length){
        await this.update(registrationId, setFields);
        Object.assign(updated, setFields);
      }
    } catch(_e) {}
    return updated;
  }

  /**
   * Lista todos los registros (con paginación)
   * @param {Object} options - Opciones de paginación
   * @param {string} options.exclusiveStartKey - Clave para la paginación
   * @param {number} options.limit - Límite de resultados por página
   * @returns {Promise<Object>} Lista de registros y metadatos de paginación
   */
  static async list({ exclusiveStartKey = null, limit = 20 } = {}) {
    const params = {
      TableName: config.dynamoDB.registrationsTable,
      Limit: limit
    };

    if (exclusiveStartKey) {
      params.ExclusiveStartKey = exclusiveStartKey;
    }

    const result = await docClient.scan(params).promise();
    
    return {
      items: result.Items || [],
      lastEvaluatedKey: result.LastEvaluatedKey,
      count: result.Count
    };
  }
}

export default EventRegistration;
