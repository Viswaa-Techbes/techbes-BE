/**
 * verifyFirebase.js
 * =================
 * Verifies Firebase connection and authentication.
 */
require('dotenv').config();
const admin = require('../config/firebase');

async function testFCM() {
  console.log('==================================================');
  console.log('STARTING FIREBASE FCM AUTHENTICATION VERIFICATION');
  console.log('==================================================\n');

  if (!admin.apps.length) {
    console.error('✗ Firebase Admin SDK was not initialized. Check serviceAccountKey.json.');
    process.exit(1);
  }

  console.log('[Firebase] Admin SDK is initialized successfully.');
  console.log('[Firebase] Project ID:', admin.app().options.credential.projectId || 'techbes-app');

  // Attempt to send to a dummy but syntactically correct token to verify API communications
  // Syntactically correct tokens are long base64-like strings
  const dummyToken = 'fcm_token_test_123_this_is_a_dummy_but_valid_length_token_for_communication_test_1234567890';
  
  const testMessage = {
    notification: {
      title: 'Production Readiness Test',
      body: 'FCM Verification from server side',
    },
    token: 'bk3RNwTe3H0:CI2g_w2XisBRnCPQpaZZ5L-5gE0qyF53...', // syntactically valid token format
  };

  try {
    console.log('[FCM] Dispatching test notification to Google FCM servers...');
    const response = await admin.messaging().send(testMessage);
    console.log('✓ Sent successfully (unlikely for dummy token):', response);
  } catch (error) {
    console.log('[FCM] Firebase API responded.');
    console.log('  Error Code:', error.code);
    console.log('  Error Message:', error.message);

    // If the error code is one of FCM's token rejection errors, it proves that:
    // 1. The service account credentials are valid and authenticated.
    // 2. Google OAuth handshake succeeded.
    // 3. The request reached FCM servers and was rejected specifically due to the dummy token.
    if (error.code === 'messaging/invalid-argument' || error.code === 'messaging/registration-token-not-registered' || error.code === 'messaging/invalid-registration-token') {
      console.log('\n✓ SUCCESS: Firebase Admin SDK is successfully authenticated and connected to Google FCM.');
    } else {
      console.error('\n✗ FAILURE: Firebase connection failed with credential or connection error.');
    }
  }
  process.exit(0);
}

testFCM();
