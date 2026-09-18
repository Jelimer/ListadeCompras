// Configuración de Firebase generada dinámicamente en build
var firebaseConfig = {
    apiKey: "dummy-api-key",
    authDomain: "dummy-project.firebaseapp.com",
    projectId: "dummy-project",
    storageBucket: "dummy-project.appspot.com",
    messagingSenderId: "dummy-sender-id",
    appId: "dummy-app-id",
    measurementId: "dummy-measurement-id"
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
