/**
 * verifyHealth.js
 * ===============
 * Programmatically starts the server, verifies health endpoints, and shuts down.
 */
require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');

// Prevent connecting to database to keep health check fast and independent if needed,
// but we should check if app.js initiates any DB connection during import.
// Let's import app.js
const app = require('../app');

const PORT = 3999;
let server;

async function checkUrl(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: JSON.parse(data)
        });
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function run() {
  console.log('==================================================');
  console.log('API HEALTH ENDPOINT VERIFICATION');
  console.log('==================================================\n');

  // Connect database first since app may depend on it or models are loaded
  const mongoUri = process.env.MONGODB_URI;
  console.log('[Database] Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('[Database] Connected successfully.');

  console.log(`[Server] Starting Express application on port ${PORT}...`);
  server = app.listen(PORT, async () => {
    console.log('[Server] Listening. Executing tests...');

    try {
      console.log('\n--- Test 1: GET /health ---');
      const healthRes = await checkUrl('/health');
      console.log('Status Code:', healthRes.statusCode);
      console.log('Response Body:', healthRes.body);
      if (healthRes.statusCode === 200 && healthRes.body.status === 'ok') {
        console.log('✓ GET /health PASSED.');
      } else {
        throw new Error('GET /health returned unexpected response.');
      }

      console.log('\n--- Test 2: GET /api/health ---');
      const apiHealthRes = await checkUrl('/api/health');
      console.log('Status Code:', apiHealthRes.statusCode);
      console.log('Response Body:', apiHealthRes.body);
      if (apiHealthRes.statusCode === 200 && apiHealthRes.body.success === true) {
        console.log('✓ GET /api/health PASSED.');
      } else {
        throw new Error('GET /api/health returned unexpected response.');
      }

      console.log('\n==================================================');
      console.log('✓ ALL HEALTH CHECKS PASSED.');
      console.log('==================================================');
      cleanup(0);
    } catch (err) {
      console.error('\n✗ HEALTH CHECK FAILED:', err.message);
      console.log('==================================================');
      cleanup(1);
    }
  });
}

function cleanup(exitCode) {
  if (server) {
    server.close(() => {
      console.log('[Server] Stopped.');
      mongoose.disconnect().then(() => {
        console.log('[Database] Disconnected.');
        process.exit(exitCode);
      });
    });
  } else {
    process.exit(exitCode);
  }
}

run().catch(err => {
  console.error('Unhandled error during startup:', err);
  process.exit(1);
});
