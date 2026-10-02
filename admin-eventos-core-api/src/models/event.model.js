import { DynamoDBDocumentClient, GetCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDBClient } from '../config/db.config.js';

const docClient = DynamoDBDocumentClient.from(dynamoDBClient);
const TABLE_NAME = process.env.DDB_EVENTOS_TABLE || 'eventos-buenohotel';

class EventModel {
  // Obtener todos los eventos
  static async getAllEvents() {
    try {
      const params = {
        TableName: TABLE_NAME
      };
      
      const { Items } = await docClient.send(new ScanCommand(params));
      return Items || [];
    } catch (error) {
      console.error('Error al obtener los eventos:', error);
      throw error;
    }
  }

  // Obtener un evento por ID
  static async getEventById(id) {
    try {
      const params = {
        TableName: TABLE_NAME,
        Key: { id }
      };
      const { Item } = await docClient.send(new GetCommand(params));
      return Item || null;
    } catch (error) {
      console.error(`Error al obtener el evento con ID ${id}:`, error);
      throw error;
    }
  }

  // Actualizar el campo requireChurch de un evento
  // Actualizar el requerimiento de iglesia (requireChurch)
static async updateChurchRequirement(eventId, requireChurch) {
  try {
    const params = {
      TableName: TABLE_NAME,
      Key: { id: eventId },
      UpdateExpression: "SET #req = if_not_exists(#req, :emptyMap), #req.#rc = :rc, #rcRoot = :rc",
      ExpressionAttributeNames: {
        "#req": "requerimientos",
        "#rc": "requireChurch",
        "#rcRoot": "requireChurch"
      },
      ExpressionAttributeValues: {
        ":emptyMap": {},
        ":rc": requireChurch
      },
      ReturnValues: "ALL_NEW"
    };

    const result = await docClient.send(new UpdateCommand(params));
    return result.Attributes || null;
  } catch (error) {
    console.error(`Error al actualizar el requerimiento de iglesia para el evento ${eventId}:`, error);
    throw error;
  }
}

}

export default EventModel;
