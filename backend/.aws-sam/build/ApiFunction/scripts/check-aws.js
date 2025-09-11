// Verificar la configuración de AWS
const AWS = require('aws-sdk');

console.log('Verificando configuración de AWS...');

// Mostrar la configuración actual
console.log('\nConfiguración de AWS:');
console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? '*** Configurado ***' : 'No configurado');
console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? '*** Configurado ***' : 'No configurado');
console.log('AWS_REGION:', process.env.AWS_REGION || 'us-east-1 (por defecto)');

// Verificar credenciales
const sts = new AWS.STS();

sts.getCallerIdentity({}, (err, data) => {
  if (err) {
    console.error('\n❌ Error al verificar las credenciales de AWS:', err.message);
    console.log('\nSolución:');
    console.log('1. Asegúrate de tener AWS CLI configurado correctamente');
    console.log('2. O configura las variables de entorno manualmente en un archivo .env');
    console.log('3. Verifica que las credenciales tengan los permisos necesarios');
    process.exit(1);
  } else {
    console.log('\n✅ Configuración de AWS verificada correctamente');
    console.log('   Usuario ARN:', data.Arn);
    console.log('   Cuenta ID:', data.Account);
    console.log('\nPuedes proceder con la configuración de la base de datos.');
  }
});
