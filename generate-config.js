const fs = require('fs');

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
