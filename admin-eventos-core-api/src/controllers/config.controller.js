import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDBClient } from '../config/db.config.js';

const docClient = DynamoDBDocumentClient.from(dynamoDBClient);
const CONFIG_TABLE = 'eventos-config';
const CONFIG_ID = 'GLOBAL_CONFIG';

/**
 * Obtener la tasa de cambio actual desde eventos-config
 */
export const getTasaCambio = async (req, res, next) => {
  try {
    const { Item } = await docClient.send(new GetCommand({
      TableName: CONFIG_TABLE,
      Key: { id: CONFIG_ID }
    }));

    const tasa = Item?.tasa_cambio_usd ?? 61;
    return res.json({ success: true, data: { tasaCambio: tasa } });
  } catch (err) {
    console.error('Error obteniendo tasa de cambio:', err);
    next(err);
  }
};

/**
 * Actualizar la tasa de cambio en eventos-config
 */
export const updateTasaCambio = async (req, res, next) => {
  try {
    const { tasaCambio } = req.body || {};
    const tasa = Number(tasaCambio);

    if (!Number.isFinite(tasa) || tasa <= 0) {
      return res.status(400).json({ success: false, message: 'tasaCambio debe ser un número positivo' });
    }

    const now = new Date().toISOString();

    // Actualizar el item existente GLOBAL_CONFIG
    await docClient.send(new UpdateCommand({
      TableName: CONFIG_TABLE,
      Key: { id: CONFIG_ID },
      UpdateExpression: 'SET tasa_cambio_usd = :tasa, tasa_cambio_timestamp = :ts, fechaActualizacion = :ts',
      ExpressionAttributeValues: {
        ':tasa': tasa,
        ':ts': now
      },
      ReturnValues: 'ALL_NEW'
    }));

    return res.json({ success: true, message: 'Tasa de cambio actualizada', data: { tasaCambio: tasa } });
  } catch (err) {
    console.error('Error actualizando tasa de cambio:', err);
    next(err);
  }
};

/**
 * Obtener configuración de días de entrada/salida
 */
export const getConfigDias = async (req, res, next) => {
  try {
    const { Item } = await docClient.send(new GetCommand({
      TableName: CONFIG_TABLE,
      Key: { id: CONFIG_ID }
    }));

    const diasAntesEntrada = Item?.dias_antes_entrada ?? 0;
    const diasDespuesSalida = Item?.dias_despues_salida ?? 0;
    return res.json({ success: true, data: { diasAntesEntrada, diasDespuesSalida } });
  } catch (err) {
    console.error('Error obteniendo config de días:', err);
    next(err);
  }
};

/**
 * Actualizar configuración de días de entrada/salida
 */
export const updateConfigDias = async (req, res, next) => {
  try {
    const { diasAntesEntrada, diasDespuesSalida } = req.body || {};
    const diasAntes = Number(diasAntesEntrada) || 0;
    const diasDespues = Number(diasDespuesSalida) || 0;

    if (diasAntes < 0 || diasDespues < 0) {
      return res.status(400).json({ success: false, message: 'Los días deben ser números no negativos' });
    }

    const now = new Date().toISOString();

    await docClient.send(new UpdateCommand({
      TableName: CONFIG_TABLE,
      Key: { id: CONFIG_ID },
      UpdateExpression: 'SET dias_antes_entrada = :antes, dias_despues_salida = :despues, fechaActualizacion = :ts',
      ExpressionAttributeValues: {
        ':antes': diasAntes,
        ':despues': diasDespues,
        ':ts': now
      },
      ReturnValues: 'ALL_NEW'
    }));

    return res.json({ success: true, message: 'Configuración de días actualizada', data: { diasAntesEntrada: diasAntes, diasDespuesSalida: diasDespues } });
  } catch (err) {
    console.error('Error actualizando config de días:', err);
    next(err);
  }
};
