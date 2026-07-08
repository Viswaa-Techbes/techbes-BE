/**
 * verifyEnv.js
 * ============
 * Validates the presence of required and optional environment variables in BE.
 */
require('dotenv').config();

const REQUIRED_VARS = [
  'MONGODB_URI',
  'JWT_SECRET',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
  'OPENROUTE_SERVICE_API_KEY'
];

const OPTIONAL_VARS = [
  'NODE_ENV',
  'PORT',
  'FIREBASE_SERVICE_ACCOUNT'
];

function run() {
  console.log('==================================================');
  console.log('ENVIRONMENT VARIABLES CONFIGURATION AUDIT');
  console.log('==================================================\n');

  let missingRequired = 0;

  console.log('--- REQUIRED VARIABLES ---');
  REQUIRED_VARS.forEach(v => {
    const val = process.env[v];
    if (val) {
      // Mask the value for security
      let masked = val;
      if (val.length > 8) {
        masked = val.slice(0, 4) + '...' + val.slice(-4);
      }
      console.log(`✓ ${v.padEnd(30)}: PRESENT [${masked}]`);
    } else {
      console.error(`✗ ${v.padEnd(30)}: MISSING`);
      missingRequired++;
    }
  });

  console.log('\n--- OPTIONAL VARIABLES ---');
  OPTIONAL_VARS.forEach(v => {
    const val = process.env[v];
    if (val) {
      let masked = val;
      if (val.length > 8 && v !== 'NODE_ENV') {
        masked = val.slice(0, 4) + '...' + val.slice(-4);
      }
      console.log(`✓ ${v.padEnd(30)}: PRESENT [${masked}]`);
    } else {
      console.log(`- ${v.padEnd(30)}: NOT CONFIGURED (Will use fallback/defaults)`);
    }
  });

  console.log('\n==================================================');
  if (missingRequired === 0) {
    console.log('✓ ALL REQUIRED ENVIRONMENT VARIABLES ARE PRESENT.');
  } else {
    console.error(`✗ CRITICAL WARNING: ${missingRequired} REQUIRED VARIABLE(S) MISSING.`);
  }
  console.log('==================================================');

  process.exit(missingRequired === 0 ? 0 : 1);
}

run();
