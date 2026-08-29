const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let isFirebaseInitialized = false;

try {
  let serviceAccount = null;
  const envVal = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (envVal && envVal.trim()) {
    console.log('[Firebase] Loading credentials from FIREBASE_SERVICE_ACCOUNT env variable.');
    let rawJson = envVal.trim();

    // Remove surrounding single or double quotes if present
    if (rawJson.startsWith("'") && rawJson.endsWith("'")) {
      rawJson = rawJson.slice(1, -1).trim();
    } else if (rawJson.startsWith('"') && rawJson.endsWith('"')) {
      rawJson = rawJson.slice(1, -1).trim();
    }

    try {
      serviceAccount = JSON.parse(rawJson);
    } catch (parseErr) {
      console.warn('⚠️ [Firebase] JSON.parse failed directly. Attempting cleanup of escaped characters...');
      try {
        // Try cleaning double-escaped double-quotes
        let cleaned = rawJson.replace(/\\"/g, '"');
        serviceAccount = JSON.parse(cleaned);
      } catch (secondErr) {
        throw new Error(`Invalid JSON format: ${parseErr.message}`);
      }
    }
  } else {
    // Try loading local file
    const localPath = path.join(__dirname, 'serviceAccountKey.json');
    if (fs.existsSync(localPath)) {
      console.log('[Firebase] Loading credentials from serviceAccountKey.json file.');
      serviceAccount = require(localPath);
    }
  }

  if (serviceAccount) {
    const projectId = serviceAccount.project_id || serviceAccount.projectId;
    const clientEmail = serviceAccount.client_email || serviceAccount.clientEmail;
    let privateKey = serviceAccount.private_key || serviceAccount.privateKey;

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Missing required fields (project_id, client_email, or private_key)');
    }

    // Normalize private key escaped newlines (replace literal '\n' or double-escaped '\\n' with actual newline)
    if (typeof privateKey === 'string') {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      storageBucket: `${projectId}.firebasestorage.app`,
    });
    isFirebaseInitialized = true;
    console.log(`✅ [Firebase] Admin SDK initialized successfully for project: ${projectId}`);
  } else {
    console.warn('⚠️ [Firebase] Configuration missing (neither FIREBASE_SERVICE_ACCOUNT nor serviceAccountKey.json found). Firebase notifications will be mocked.');
  }
} catch (error) {
  console.warn('⚠️ [Firebase] Initialization failed. Notifications will run in fallback mock mode. Error:', error.message);
}

admin.isInitialized = isFirebaseInitialized;

module.exports = admin;

