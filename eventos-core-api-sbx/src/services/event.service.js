import { DynamoDBDocumentClient, UpdateCommand, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
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
