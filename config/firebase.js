const admin = require('firebase-admin');
const path = require('path');

try {
  let serviceAccount;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log('[Firebase] Loading credentials from FIREBASE_SERVICE_ACCOUNT env variable.');
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    console.log('[Firebase] Loading credentials from serviceAccountKey.json file.');
    serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'techbes-app.firebasestorage.app',
  });
  console.log('Firebase Admin initialized successfully');
} catch (error) {
  console.warn('Firebase Admin could not be initialized. Service account key missing?', error.message);
}

module.exports = admin;
