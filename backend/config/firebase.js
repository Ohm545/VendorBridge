/**
 * Firebase Admin SDK Configuration
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
let firebaseApp = null;

try {
  if (!firebaseApp) {
    const serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || "key-id-placeholder",
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID || "client-id-placeholder",
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`
    };

    // Verify required fields
    if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
      throw new Error('Missing required Firebase configuration: project_id, client_email, or private_key');
    }

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });

    console.log('   ✅ Firebase Admin SDK initialized');
  }
} catch (error) {
  console.error('   ❌ Firebase initialization failed:', error.message);
}

module.exports = {
  admin,
  auth: firebaseApp ? admin.auth() : null,
  firestore: firebaseApp ? admin.firestore() : null,
};