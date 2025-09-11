const AWS = require('aws-sdk');
const config = require('../config/config');

// Configurar AWS SDK
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1'
});

const dynamodb = new AWS.DynamoDB();

// Nombres de las tablas
const tables = [
  config.dynamoDB.usersTable,
  config.dynamoDB.registrationsTable
];

// Función para verificar el estado de una tabla
const checkTableStatus = async (tableName) => {
  try {
    const data = await dynamodb.describeTable({ TableName: tableName }).promise();
    return {
      name: tableName,
      status: data.Table.TableStatus,
      itemCount: data.Table.ItemCount || 0,
      creationDateTime: new Date(data.Table.CreationDateTime).toLocaleString(),
      arn: data.Table.TableArn
    };
  } catch (error) {
    return {
      name: tableName,
      error: error.code === 'ResourceNotFoundException' ? 'No existe' : error.message
    };
  }
};

// Verificar el estado de todas las tablas
const checkAllTables = async () => {
  console.log('\n🔍 Verificando estado de las tablas en DynamoDB...\n');
  
  for (const tableName of tables) {
    const tableInfo = await checkTableStatus(tableName);
    
    if (tableInfo.error) {
      console.log(`❌ ${tableName}: ${tableInfo.error}`);
    } else {
      console.log(`✅ ${tableName}`);
      console.log(`   Estado: ${tableInfo.status}`);
      console.log(`   Elementos: ${tableInfo.itemCount}`);
      console.log(`   Creada: ${tableInfo.creationDateTime}`);
      console.log(`   ARN: ${tableInfo.arn}\n`);
    }
  }
};

checkAllTables();
