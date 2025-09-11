import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/config.js';

// Configurar AWS SDK
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1'
});

const docClient = new AWS.DynamoDB.DocumentClient();

export class User {
  /**
   * Crea un nuevo usuario
   * @param {Object} userData - Datos del usuario
   * @returns {Promise<Object>} Usuario creado
   */
  static async create(userData) {
    const userId = uuidv4();
    const timestamp = new Date().toISOString();
    
    const params = {
      TableName: config.dynamoDB.usersTable,
      Item: {
        id: userId,
        email: userData.email,
        nombre: userData.nombre,
        apellido: userData.apellido,
        telefono: userData.telefono || '',
        rol: userData.rol || 'usuario',
        activo: true,
        fechaCreacion: timestamp,
        fechaActualizacion: timestamp,
        ...userData // Incluye cualquier otro campo adicional
      },
      ConditionExpression: 'attribute_not_exists(email)' // Evita duplicados de email
    };

    try {
      await docClient.put(params).promise();
      return params.Item;
    } catch (error) {
      if (error.code === 'ConditionalCheckFailedException') {
        throw new Error('El correo electrónico ya está registrado');
      }
      throw error;
    }
  }

  /**
   * Obtiene un usuario por su ID
   * @param {string} userId - ID del usuario
   * @returns {Promise<Object|null>} Usuario encontrado o null
   */
  static async getById(userId) {
    const params = {
      TableName: config.dynamoDB.usersTable,
      Key: { id: userId }
    };

    const result = await docClient.get(params).promise();
    return result.Item || null;
  }

  /**
   * Busca un usuario por su email
   * @param {string} email - Email del usuario
   * @returns {Promise<Object|null>} Usuario encontrado o null
   */
  static async getByEmail(email) {
    const params = {
      TableName: config.dynamoDB.usersTable,
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email
      }
    };

    const result = await docClient.query(params).promise();
    return result.Items && result.Items.length > 0 ? result.Items[0] : null;
  }

  /**
   * Actualiza un usuario
   * @param {string} userId - ID del usuario
   * @param {Object} updates - Campos a actualizar
   * @returns {Promise<Object>} Usuario actualizado
   */
  static async update(userId, updates) {
    // No permitir actualización de email o ID
    const { email, id, ...safeUpdates } = updates;
    
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
      TableName: config.dynamoDB.usersTable,
      Key: { id: userId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    };

    try {
      const result = await docClient.update(params).promise();
      return result.Attributes;
    } catch (error) {
      if (error.code === 'ConditionalCheckFailedException') {
        throw new Error('Usuario no encontrado');
      }
      throw error;
    }
  }

  /**
   * Elimina un usuario (borrado lógico)
   * @param {string} userId - ID del usuario
   * @returns {Promise<boolean>} true si se eliminó correctamente
   */
  static async delete(userId) {
    const params = {
      TableName: config.dynamoDB.usersTable,
      Key: { id: userId },
      UpdateExpression: 'SET #activo = :activo, #fechaActualizacion = :now',
      ExpressionAttributeNames: {
        '#activo': 'activo',
        '#fechaActualizacion': 'fechaActualizacion'
      },
      ExpressionAttributeValues: {
        ':activo': false,
        ':now': new Date().toISOString()
      },
      ReturnValues: 'UPDATED_NEW'
    };

    const result = await docClient.update(params).promise();
    return !!result.Attributes;
  }

  /**
   * Lista todos los usuarios (con paginación)
   * @param {Object} options - Opciones de paginación
   * @param {string} options.exclusiveStartKey - Clave para la paginación
   * @param {number} options.limit - Límite de resultados por página
   * @returns {Promise<Object>} Lista de usuarios y metadatos de paginación
   */
  static async list({ exclusiveStartKey = null, limit = 20 } = {}) {
    const params = {
      TableName: config.dynamoDB.usersTable,
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

export default User;
