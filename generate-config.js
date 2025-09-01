const fs = require('fs');
require('dotenv').config();

// Nombres de las variables de entorno que configuraremos en Vercel
const envVars = {
    apiKey: process.env.API_KEY,
    authDomain: process.env.AUTH_DOMAIN,
    projectId: process.env.PROJECT_ID,
    storageBucket: process.env.STORAGE_BUCKET,
    messagingSenderId: process.env.MESSAGING_SENDER_ID,
    appId: process.env.APP_ID,
    measurementId: process.env.MEASUREMENT_ID
};

// Verificar que todas las variables de entorno necesarias estén definidas
const requiredVars = Object.entries(envVars).filter(([key, value]) => !value);

if (requiredVars.length > 0) {
    console.error('Error: Faltan las siguientes variables de entorno en el archivo .env:');
    requiredVars.forEach(([key]) => console.error(`- ${key}`));
    process.exit(1); // Salir del proceso con un código de error
}


// Contenido del archivo de configuración que se generará
const configFileContent = `
const firebaseConfig = {
    apiKey: "${envVars.apiKey}",
    authDomain: "${envVars.authDomain}",
    projectId: "${envVars.projectId}",
    storageBucket: "${envVars.storageBucket}",
    messagingSenderId: "${envVars.messagingSenderId}",
    appId: "${envVars.appId}",
    measurementId: "${envVars.measurementId}"
};
`;

// Escribir el archivo de configuración
fs.writeFileSync('firebase-config.js', configFileContent);

console.log('firebase-config.js generated successfully.');
