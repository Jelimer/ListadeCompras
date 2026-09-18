const fs = require('fs');

let parsedFirebaseConfig = {};
if (process.env.FIREBASE_CONFIG) {
    try {
        parsedFirebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG);
    } catch (_) {}
}

// Nombres de las variables de entorno que configuraremos en Vercel
const envVars = {
    apiKey: process.env.API_KEY || process.env.FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY || parsedFirebaseConfig.apiKey || "dummy-api-key",
    authDomain: process.env.AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || parsedFirebaseConfig.authDomain || "dummy-project.firebaseapp.com",
    projectId: process.env.PROJECT_ID || process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || parsedFirebaseConfig.projectId || "dummy-project",
    storageBucket: process.env.STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || parsedFirebaseConfig.storageBucket || "dummy-project.appspot.com",
    messagingSenderId: process.env.MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || parsedFirebaseConfig.messagingSenderId || "dummy-sender-id",
    appId: process.env.APP_ID || process.env.FIREBASE_APP_ID || process.env.NEXT_PUBLIC_FIREBASE_APP_ID || parsedFirebaseConfig.appId || "dummy-app-id",
    measurementId: process.env.MEASUREMENT_ID || process.env.FIREBASE_MEASUREMENT_ID || process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || parsedFirebaseConfig.measurementId || "dummy-measurement-id"
};

const configFileContent = `// Configuración de Firebase generada dinámicamente en build
var firebaseConfig = {
    apiKey: "${envVars.apiKey || ''}",
    authDomain: "${envVars.authDomain || ''}",
    projectId: "${envVars.projectId || ''}",
    storageBucket: "${envVars.storageBucket || ''}",
    messagingSenderId: "${envVars.messagingSenderId || ''}",
    appId: "${envVars.appId || ''}",
    measurementId: "${envVars.measurementId || ''}"
};

if (typeof window !== 'undefined') {
    window.firebaseConfig = firebaseConfig;
}
if (typeof globalThis !== 'undefined') {
    globalThis.firebaseConfig = firebaseConfig;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = firebaseConfig;
}
`;

// Escribir el archivo de configuración
fs.writeFileSync('firebase-config.js', configFileContent);

console.log('firebase-config.js generated successfully.');
