const AWS = require('aws-sdk');
const config = require('../config/config');

// Configurar AWS SDK para usar las credenciales de AWS CLI
// No es necesario configurar manualmente las credenciales
// ya que el SDK de AWS las obtendrá automáticamente del perfil configurado
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1'
});

const dynamodb = new AWS.DynamoDB();

// Parámetros para la tabla de usuarios
const usuariosParams = {
  TableName: config.dynamoDB.usersTable,
  KeySchema: [
    { AttributeName: 'id', KeyType: 'HASH' }  // Clave de partición
  ],
  AttributeDefinitions: [
    { AttributeName: 'id', AttributeType: 'S' },
    { AttributeName: 'email', AttributeType: 'S' }
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'EmailIndex',
      KeySchema: [
        { AttributeName: 'email', KeyType: 'HASH' }
      ],
      Projection: {
        ProjectionType: 'ALL'
      },
      ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5
      }
    }
  ],
  ProvisionedThroughput: {
    ReadCapacityUnits: 5,
    WriteCapacityUnits: 5
  }
};

// Parámetros para la tabla de registros de eventos
const registrosEventosParams = {
  TableName: config.dynamoDB.registrationsTable,
  KeySchema: [
    { AttributeName: 'id', KeyType: 'HASH' },
    { AttributeName: 'eventoId', KeyType: 'RANGE' }
  ],
  AttributeDefinitions: [
    { AttributeName: 'id', AttributeType: 'S' },
    { AttributeName: 'eventoId', AttributeType: 'S' },
    { AttributeName: 'usuarioId', AttributeType: 'S' },
    { AttributeName: 'fechaRegistro', AttributeType: 'S' }
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'UsuarioIndex',
      KeySchema: [
        { AttributeName: 'usuarioId', KeyType: 'HASH' },
        { AttributeName: 'fechaRegistro', KeyType: 'RANGE' }
      ],
      Projection: {
        ProjectionType: 'ALL'
      },
      ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5
      }
    },
    {
      IndexName: 'EventoIndex',
      KeySchema: [
        { AttributeName: 'eventoId', KeyType: 'HASH' },
        { AttributeName: 'fechaRegistro', KeyType: 'RANGE' }
      ],
      Projection: {
        ProjectionType: 'ALL'
      },
      ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5
      }
    }
  ],
  ProvisionedThroughput: {
    ReadCapacityUnits: 5,
    WriteCapacityUnits: 5
  }
};

// Función para crear una tabla
const createTable = async (params) => {
  try {
    await dynamodb.createTable(params).promise();
    console.log(`Tabla ${params.TableName} creada exitosamente.`);
    // Esperar a que la tabla esté activa
    await dynamodb.waitFor('tableExists', { TableName: params.TableName }).promise();
    console.log(`Tabla ${params.TableName} está activa.`);
  } catch (error) {
    if (error.code === 'ResourceInUseException') {
      console.log(`La tabla ${params.TableName} ya existe.`);
    } else {
      console.error(`Error al crear la tabla ${params.TableName}:`, error);
      throw error;
    }
  }
};

// Crear las tablas
const setupDatabase = async () => {
  try {
    console.log('Iniciando configuración de la base de datos...');
    
    // Crear tabla de usuarios
    console.log('Creando tabla de usuarios...');
    await createTable(usuariosParams);
    
    // Esperar un momento para asegurar que la tabla de usuarios esté lista
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Crear tabla de registros de eventos
    console.log('\nCreando tabla de registros de eventos...');
    await createTable(registrosEventosParams);
    
    console.log('\n✅ Configuración de la base de datos completada exitosamente.');
    console.log('   - Tabla de usuarios: usuarios');
    console.log('   - Tabla de registros: registros_eventos');
  } catch (error) {
    console.error('\n❌ Error en la configuración de la base de datos:');
    if (error.code === 'ResourceInUseException') {
      console.log('   La tabla ya existe. No es necesario crearla nuevamente.');
    } else {
      console.error('   ', error.message);
      process.exit(1);
    }
  }
};

// Ejecutar la configuración
setupDatabase();
