import { DynamoDBDocumentClient, UpdateCommand, ScanCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDBClient } from '../config/db.config.js';

const docClient = DynamoDBDocumentClient.from(dynamoDBClient);
const TABLE_NAME = process.env.DDB_EVENTOS_TABLE || 'eventos-buenohotel';

class EventService {
  // Obtener todos los eventos
  static async getAll() {
    const { Items } = await docClient.send(new ScanCommand({ TableName: TABLE_NAME }));
    return Items || [];
  }

  // Obtener un evento por ID
  static async getById(id) {
    const { Item } = await docClient.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { id } })
    );
    return Item || null;
  }

  // Función recursiva para limpiar null/undefined de objetos
  static cleanNullValues(obj) {
    if (obj === null || obj === undefined) return undefined;
    if (Array.isArray(obj)) {
      return obj.map(item => this.cleanNullValues(item)).filter(item => item !== undefined);
    }
    if (typeof obj === 'object') {
      const cleaned = {};
      Object.keys(obj).forEach(key => {
        const value = this.cleanNullValues(obj[key]);
        if (value !== undefined && value !== null) {
          cleaned[key] = value;
        }
      });
      return Object.keys(cleaned).length > 0 ? cleaned : undefined;
    }
    return obj;
  }

  // Crear o actualizar un evento
  static async createOrUpdate(eventData) {
    const { id, ...rest } = eventData;
    if (!id) throw new Error('Se requiere un ID para el evento');

    // Limpiar campos undefined y null recursivamente
    const cleanData = { id };
    Object.keys(rest).forEach(key => {
      const cleaned = this.cleanNullValues(rest[key]);
      if (cleaned !== undefined && cleaned !== null) {
        cleanData[key] = cleaned;
      }
    });

    // Agregar timestamps
    const now = new Date().toISOString();
    cleanData.fechaActualizacion = now;
    if (!cleanData.fechaCreacion) {
      // Verificar si ya existe para no sobreescribir fechaCreacion
      const existing = await this.getById(id);
      cleanData.fechaCreacion = existing?.fechaCreacion || now;
    }

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: cleanData
    }));

    return cleanData;
  }

  // Actualizar el campo requireChurch
  static async updateChurchRequirement(id, requireChurch) {
    const params = {
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET requireChurch = :rc',
      ExpressionAttributeValues: { ':rc': requireChurch },
      ReturnValues: 'ALL_NEW'
    };

    const result = await docClient.send(new UpdateCommand(params));
    return result.Attributes || null;
  }
}

export default EventService;
